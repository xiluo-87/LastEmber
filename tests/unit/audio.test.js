import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { audio, AUDIO, SOUND_NAMES, LOOP_NAMES } from '../../src/audio.js';
import { TILE } from '../../src/data/balance.js';

// ---- fakes -------------------------------------------------------------------------------------------------
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function fakeContext() {
  const log = { osc: 0, gain: 0, filter: 0, src: 0 };
  const param = (value = 0) => ({ value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect: (n) => n, disconnect() {}, start() {}, stop() {}, ...extra });
  const ctx = {
    state: 'suspended', currentTime: 0, sampleRate: 8000, log, destination: node(),
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; return Promise.resolve(); },
    createGain() { log.gain++; return node({ gain: param(1) }); },
    createOscillator() { log.osc++; return node({ type: 'sine', frequency: param(440) }); },
    createBiquadFilter() { log.filter++; return node({ type: 'lowpass', frequency: param(1000), Q: param(1) }); },
    createBufferSource() { log.src++; return node({ buffer: null, loop: false }); },
    createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len) }; },
  };
  return ctx;
}
/** Record every audio.play / audio.setLevel call while still forwarding them. Returns { plays, levels, restore }. */
function spyOnAudio() {
  const plays = [], levels = {};
  const origPlay = audio.play, origLevel = audio.setLevel;
  audio.play = (name, opts) => { plays.push(name); return origPlay(name, opts); };
  audio.setLevel = (name, level, tau) => { levels[name] = level; return origLevel(name, level, tau); };
  return { plays, levels, restore() { audio.play = origPlay; audio.setLevel = origLevel; } };
}
/** Step the game n ticks, keeping the fake context clock in step with simulated time (as a real context would). */
function run(game, ctx, n) {
  for (let i = 0; i < n; i++) { ctx.currentTime = game.time; game.step(1); }
}
function quietly(fn) {
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a);
  try { fn(); } finally { console.error = orig; }
  return errors;
}

// ---- engine ------------------------------------------------------------------------------------------------
test('engine is a silent no-op without an AudioContext (node)', () => {
  audio.configure({ storage: memStorage() });              // default factory: no global AudioContext under node
  assert.equal(audio.attach(), false);                     // no window -> nothing to attach to
  assert.equal(audio.unlock(), false);
  assert.equal(audio.state(), 'none');
  assert.equal(audio.play('chop'), false);
  assert.doesNotThrow(() => { audio.setLevel('wind', 1); audio.setHidden(true); audio.setHidden(false); });
});

test('context is created once on unlock, resumed when suspended, and gated on hidden', () => {
  let made = 0;
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => { made++; return ctx; } });
  assert.equal(audio.play('chop'), false);                 // nothing before the first gesture
  assert.equal(audio.unlock(), true);
  assert.equal(audio.unlock(), true);
  assert.equal(made, 1);
  assert.equal(audio.state(), 'running');
  audio.setHidden(true);
  assert.equal(audio.state(), 'suspended');
  assert.equal(audio.play('chop'), false);                 // hidden: silent
  audio.setHidden(false);
  assert.equal(audio.state(), 'running');
});

test('mute is persisted and silences one-shots', () => {
  const storage = memStorage();
  const ctx = fakeContext();
  audio.configure({ storage, makeContext: () => ctx });
  audio.unlock();
  assert.equal(audio.setMuted(true), true);
  assert.equal(storage.getItem(AUDIO.storageKey), '1');
  const before = ctx.log.osc;
  assert.equal(audio.play('chop'), false);
  assert.equal(ctx.log.osc, before);                       // no nodes built while muted
  audio.setMuted(false);
  assert.equal(audio.play('chop'), true);
  audio.configure({ storage, makeContext: () => fakeContext() });
  assert.equal(audio.muted, false);
  audio.configure({ storage: (() => { const s = memStorage(); s.setItem(AUDIO.storageKey, '1'); return s; })() });
  assert.equal(audio.muted, true);                         // persisted value is read back
});

test('storage that throws never breaks the engine', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  audio.configure({ storage: broken, makeContext: () => fakeContext() });
  assert.doesNotThrow(() => { audio.unlock(); audio.setMuted(true); audio.setMuted(false); });
  assert.equal(audio.muted, false);
});

test('voices are capped at 12 and identical sounds are rate-limited to 40 ms', () => {
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => ctx });
  audio.unlock();
  const names = ['chop', 'click', 'pickup', 'craft', 'place', 'hit', 'mine', 'footstep', 'thud', 'bow', 'eat', 'drink'];
  for (const n of names) assert.equal(audio.play(n), true, n);
  assert.equal(audio.play('chop'), false);                 // same sound, same instant
  assert.equal(audio.play('hurt'), false);                 // 13th voice
  ctx.currentTime = 10;                                    // earlier voices have ended
  assert.equal(audio.play('hurt'), true);
  ctx.currentTime = 10.01;
  assert.equal(audio.play('hurt'), false);                 // 10 ms after the last 'hurt'
  ctx.currentTime = 10.05;
  assert.equal(audio.play('hurt'), true);
});

test('all sounds and loops build without throwing', () => {
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => ctx });
  audio.unlock();
  const errors = quietly(() => {
    for (const n of SOUND_NAMES) { ctx.currentTime += 0.1; audio.play(n, { v: 0.5, pitch: 1.1 }); }
    for (const n of LOOP_NAMES) audio.setLevel(n, 0.5);
    audio.setLevel('no-such-loop', 1);
  });
  assert.deepEqual(errors, []);
  assert.ok(SOUND_NAMES.length >= 20);
  assert.ok(ctx.log.osc > 0 && ctx.log.src > 0);
});

// ---- system ------------------------------------------------------------------------------------------------
const EVENT_PAYLOADS = {
  'player:swing': { origin: { x: 0, y: 0 }, facing: 0, reach: 1.2, reachPx: 38, arc: 0.9, damage: 1, tool: 'hands', toolClass: 'hands', slot: null, stack: null },
  'gather:hit': { def: { gather: { tool: 'pickaxe' } } }, 'gather:harvest': {}, 'loot:opened': {},
  'radio:partFound': {}, 'craft:done': {}, 'structure:placed': {}, 'structure:removed': {}, 'structure:destroyed': {},
  'structure:damaged': {}, 'fire:lit': {}, 'creature:hit': {}, 'creature:killed': {}, 'carcass:butchered': {},
  'combat:arrowShot': {}, 'player:damaged': {}, 'item:used': { id: 'berries' }, 'tool:broken': {},
  'creature:lunge': { c: { type: 'bear' } }, 'creature:howl': { day: 1 }, 'weather:warning': { in: 30 },
  'time:newDay': { day: 2 }, 'player:died': {}, 'panel:open': {}, 'panel:close': {}, 'hotbar:changed': {}, 'build:mode': {},
};

test('system initialises, handles every mapped event without throwing, and respects mute', () => {
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => ctx });
  audio.unlock();
  const game = createGame();
  game.newGame(7);
  assert.equal(game.audio, audio);
  const before = ctx.log.osc;
  const errors = quietly(() => {
    for (const [evt, payload] of Object.entries(EVENT_PAYLOADS)) {
      ctx.currentTime += 0.1;
      game.events.emit(evt, payload);
    }
  });
  assert.deepEqual(errors, []);
  assert.ok(ctx.log.osc > before, 'events produced sound');

  audio.setMuted(true);
  const muted = ctx.log.osc;
  for (const [evt, payload] of Object.entries(EVENT_PAYLOADS)) { ctx.currentTime += 0.1; game.events.emit(evt, payload); }
  assert.equal(ctx.log.osc, muted, 'muted: no sound nodes');
  audio.setMuted(false);
});

test('no AudioContext: the whole game loop and every event run silently', () => {
  audio.configure({ storage: memStorage() });              // no factory available
  const game = createGame();
  game.newGame(3);
  const errors = quietly(() => {
    for (const [evt, payload] of Object.entries(EVENT_PAYLOADS)) game.events.emit(evt, payload);
    game.step(120);
  });
  assert.deepEqual(errors, []);
  assert.equal(audio.state(), 'none');
});

test('footsteps follow the walking cadence and are faster and louder when sprinting', () => {
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => ctx });
  audio.unlock();
  const game = createGame();
  game.newGame(11);
  const spy = spyOnAudio();
  try {
    // The spawn clearing is only ~5 tiles across, so each phase is short (0.75 s) and starts from spawn after a
    // stop (a stop resets the cadence timer).
    const spawn = game.world.spawnPx();
    game.input.intent.moveX = 1;
    run(game, ctx, 45);
    const walk = spy.plays.filter((n) => n === 'footstep').length;
    game.input.intent.moveX = 0;
    run(game, ctx, 10);
    spy.plays.length = 0;
    game.state.player.x = spawn.x; game.state.player.y = spawn.y;
    game.input.intent.sprint = true;
    game.input.intent.moveX = -1;
    run(game, ctx, 45);
    const sprint = spy.plays.filter((n) => n === 'footstep').length;
    assert.ok(walk >= 2, `walk steps in 0.75s: ${walk}`);      // 0.46 s cadence
    assert.ok(sprint >= 3, `sprint steps in 0.75s: ${sprint}`); // 0.3 s cadence
    assert.ok(sprint > walk, `sprint steps ${sprint} > walk ${walk}`);
  } finally {
    spy.restore();
    game.input.intent.moveX = 0; game.input.intent.sprint = false;
  }
});

test('heartbeat only below the health threshold and faster as health falls', () => {
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => ctx });
  audio.unlock();
  const game = createGame();
  game.newGame(5);
  const spy = spyOnAudio();
  try {
    game.state.player.health = 90;
    run(game, ctx, 180);
    assert.equal(spy.plays.filter((n) => n === 'heartbeat').length, 0);
    game.state.player.health = 20;
    run(game, ctx, 180);
    const mild = spy.plays.filter((n) => n === 'heartbeat').length;
    spy.plays.length = 0;
    game.state.player.health = 4;
    run(game, ctx, 180);
    const severe = spy.plays.filter((n) => n === 'heartbeat').length;
    assert.ok(mild >= 2, `mild beats ${mild}`);
    assert.ok(severe > mild, `severe ${severe} > mild ${mild}`);
  } finally {
    spy.restore();
  }
});

test('ambience: wind scales with weather, fire crackle with distance to the nearest lit fire', () => {
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => ctx });
  audio.unlock();
  const game = createGame();
  game.newGame(9);
  const spy = spyOnAudio();
  try {
    game.state.weather.snow = 0; game.state.weather.bliz = 0;
    run(game, ctx, 1);
    const clearWind = spy.levels.wind;
    game.state.weather.snow = 1; game.state.weather.bliz = 0;
    run(game, ctx, 1);
    const snowWind = spy.levels.wind;
    game.state.weather.bliz = 1;
    run(game, ctx, 1);
    assert.ok(clearWind < snowWind && snowWind < spy.levels.wind, 'clear < snow < blizzard');
    assert.ok(spy.levels.blizzardHowl > 0);

    // Fires come from the Building API (game.building.litFires); override just that method on the real object.
    const p = game.state.player, realLit = game.building.litFires;
    try {
      game.building.litFires = () => [{ x: p.x + 2 * TILE, y: p.y }];
      run(game, ctx, 1);
      const near = spy.levels.fire;
      game.building.litFires = () => [{ x: p.x + 40 * TILE, y: p.y }];
      run(game, ctx, 1);
      assert.ok(near > 0 && spy.levels.fire === 0, 'crackle only within range');
      game.building.litFires = () => [{ x: p.x + 3 * TILE, y: p.y }, { x: p.x + 1 * TILE, y: p.y }];
      run(game, ctx, 1);
      const nearest = spy.levels.fire;
      assert.ok(nearest > near, 'closer fire is louder');
    } finally {
      game.building.litFires = realLit;
    }

    game.events.emit('game:over', { kind: 'death' });
    assert.equal(spy.levels.wind, 0);
    assert.equal(spy.levels.fire, 0);
  } finally {
    spy.restore();
  }
});

test('bad toasts also play the denied blip', () => {
  const ctx = fakeContext();
  audio.configure({ storage: memStorage(), makeContext: () => ctx });
  audio.unlock();
  const game = createGame();
  game.newGame(2);
  const shown = [];
  game.ui = { toast: (msg, kind) => shown.push([msg, kind]) };
  const spy = spyOnAudio();
  try {
    run(game, ctx, 1);                                     // system update wraps the toast once
    ctx.currentTime += 1;
    game.ui.toast('Bag full', 'bad');
    ctx.currentTime += 1;
    game.ui.toast('Repaired', 'good');
    assert.deepEqual(spy.plays.filter((n) => n === 'denied'), ['denied']);
    assert.deepEqual(shown, [['Bag full', 'bad'], ['Repaired', 'good']], 'original toast still runs');
  } finally {
    spy.restore();
  }
});
