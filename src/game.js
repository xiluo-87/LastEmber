// The game object: owns state, world, events, systems and the fixed-step loop. DOM-free by itself (headless-testable);
// main.js attaches canvas/input/renderer/ui. See ARCHITECTURE.md for the full field list.
import { LOOP } from './data/balance.js';
import { createEvents } from './events.js';
import { createState } from './state.js';
import { createWorld } from './world/world.js';
import { createIntent } from './input.js';
import { SYSTEMS } from './systems/index.js';
import * as saves from './save.js';
import { randomSeed } from './rng.js';
import { nextRand } from './logic/grand.js';

const nullUi = () => ({
  toast() {}, setBanner() {}, setObjective() {}, setActionLabel() {},
  panels: { open() {}, close() {}, toggle() {}, closeAll() {}, isOpen: () => false, modalOpen: () => false, register() {} },
});

export function createGame(opts = {}) {
  const game = {
    params: opts.params || {},
    storage: opts.storage,
    events: createEvents(),
    systems: SYSTEMS,
    state: null, world: null,
    mode: 'title',                 // 'title' | 'playing' | 'over'
    paused: false, hidden: false,
    tick: 0, time: 0,              // fixed ticks run / seconds of simulated play this session
    input: { intent: createIntent(), update() {}, endTick() {} },
    ui: nullUi(),
    renderer: null, view: null, camera: null,
    speedModifiers: [], targetProviders: [], lightProviders: [], target: null,
    debug: null,
    rand: () => nextRand(game.state),   // seeded gameplay RNG stream (state.rngA); never use Math.random in gameplay

    get running() { return !!this.state && this.mode === 'playing' && !this.paused && !this.hidden; },

    /** Attach a state (new or loaded): wrap world, fill missing system slices, notify systems. */
    attachState(state) {
      game.state = state;
      game.world = createWorld(state.world);
      game.world.onObjectChanged = (tx, ty, obj, prev) => game.events.emit('world:objectChanged', { tx, ty, obj, prev });
      for (const s of SYSTEMS) if (s.defaults) { const k = s.stateKey || s.name; if (state[k] === undefined) state[k] = s.defaults(state); }
      game.target = null;
      for (const s of SYSTEMS) s.onLoad?.(game);
      game.renderer?.snapCamera();
      game.events.emit('state:loaded', state);
    },

    newGame(seed) {
      const sd = seed ?? (game.params.seed != null ? Number(game.params.seed) : randomSeed());
      game.attachState(createState(sd >>> 0));
      game.mode = 'playing'; game.paused = false;
      game.events.emit('game:new', { seed: sd });
      return game.state;
    },
    loadGame() {
      const st = saves.load(game.storage);
      if (!st) return false;
      game.attachState(st);
      game.mode = 'playing'; game.paused = false;
      game.events.emit('game:loaded');
      return true;
    },
    save() { return game.state ? saves.save(game.state, game.storage) : false; },
    hasSave: () => saves.hasSave(game.storage),

    pause() { if (!game.paused) { game.paused = true; game.events.emit('game:pause'); } },
    resume() { if (game.paused) { game.paused = false; game.events.emit('game:resume'); } },
    toTitle() { game.save(); game.mode = 'title'; game.paused = false; game.events.emit('game:title'); },
    /** End the run: kind 'death' | 'victory'. Clears the save (permadeath). UI listens to 'game:over'. */
    end(kind, info = {}) {
      if (game.mode === 'over') return;
      game.mode = 'over';
      saves.clear(game.storage);
      game.events.emit('game:over', { kind, ...info, stats: game.state?.stats, day: game.state?.time?.day });
    },

    /** Run n fixed ticks (the loop calls this; tests can too). */
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        game.input.update();
        for (const s of SYSTEMS) s.update(game, LOOP.step);
        game.input.endTick();
        game.tick++; game.time += LOOP.step;
        game.events.emit('tick', game.tick);
      }
    },
  };

  for (const s of SYSTEMS) s.init(game);
  return game;
}

/** Browser loop: fixed 60 Hz simulation (max 5 steps/frame), render every animation frame, paused while hidden. */
export function startLoop(game, onFrame) {
  let last = performance.now(), acc = 0, raf = 0;
  const onVis = () => { game.hidden = document.hidden; last = performance.now(); acc = 0; if (document.hidden) game.events.emit('game:hidden'); };
  document.addEventListener('visibilitychange', onVis);
  game.hidden = document.hidden;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (game.running) {
      acc += dt;
      let n = 0;
      while (acc >= LOOP.step && n < LOOP.maxSteps) { game.step(1); acc -= LOOP.step; n++; }
      if (n === LOOP.maxSteps) acc = 0;
    }
    onFrame(dt, now / 1000);
  }
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
}
