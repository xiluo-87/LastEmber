// Audio system (DESIGN §12): maps game events to sounds, drives footsteps, the low-health heartbeat and the
// ambience loops (wind by weather, blizzard howl, fire crackle by distance to the nearest lit fire).
// The engine (WebAudio, mute, voice limits) is src/audio.js. Headless-safe: no DOM is touched unless a window exists.
import { audio, AUDIO } from '../audio.js';
import { ITEMS } from '../data/items.js';
import { TILE } from '../data/balance.js';

// Event -> sound. Returns [soundName, opts] or nothing. Payloads are the real ones from ARCHITECTURE.md §5-§18.
const HANDLERS = {
  'player:swing': () => ['whoosh', { v: 0.8 }],
  'gather:hit': (p) => [p.def?.gather?.tool === 'pickaxe' ? 'mine' : 'chop', { v: 0.9 }],
  'gather:harvest': () => ['pickup'],
  'loot:opened': () => ['pickup', { v: 1.1 }],
  'radio:partFound': () => ['craft', { v: 1.3 }],
  'craft:done': () => ['craft'],
  'structure:placed': () => ['place'],
  'structure:removed': () => ['chop', { v: 0.5 }],
  'structure:destroyed': () => ['destroyed'],
  'structure:damaged': () => ['thud', { v: 0.8 }],
  'fire:lit': () => ['fireLit'],
  'creature:hit': () => ['hit'],
  'creature:killed': () => ['hit', { v: 1.2 }],
  'carcass:butchered': () => ['chop', { v: 0.6 }],
  'combat:arrowShot': () => ['bow'],
  'player:damaged': () => ['hurt'],
  'item:used': (p) => [ITEMS[p.id]?.kind === 'drink' ? 'drink' : 'eat'],
  'tool:broken': () => ['break'],
  'creature:lunge': (p) => ['growl', { v: 0.9, pitch: p.c?.type === 'bear' ? 0.7 : 1 }],
  'creature:howl': () => ['howl'],
  'weather:warning': () => ['storm'],
  'time:newDay': () => ['sunrise'],
  'player:died': () => ['death'],
  'panel:open': () => ['click'],
  'panel:close': () => ['click', { v: 0.6 }],
  'hotbar:changed': () => ['click', { v: 0.5 }],
  'build:mode': () => ['click'],
};

// Ambience is only refreshed while the simulation runs, so fade it out whenever play stops.
const QUIET_ON = ['game:title', 'game:over'];
const AMBIENT_LOOPS = ['wind', 'blizzardHowl', 'fire'];

const runtime = new WeakMap();   // per game: footstep / heartbeat timers (reset on every state attach)
function rtOf(game) {
  let r = runtime.get(game);
  if (!r) runtime.set(game, (r = { footT: 0, heartT: 0 }));
  return r;
}

// Wrap game.ui.toast once so 'bad' toasts (blocked actions, "Bag full", ...) also play the denied blip.
// The UI object is created after systems init, so this is retried from update().
function hookToasts(game) {
  const ui = game.ui, toast = ui?.toast;
  if (typeof toast !== 'function' || toast.__audio) return;
  const wrapped = function (msg, kind, ...rest) {
    if (kind === 'bad') audio.play('denied', { v: 0.6 });
    return toast.call(this, msg, kind, ...rest);
  };
  wrapped.__audio = true;
  ui.toast = wrapped;
}

// Nearest lit fire -> crackle level (0 beyond fireRangeTiles). Uses the Building API when it exists.
function fireLevel(game, p) {
  const fires = game.building?.litFires?.() || [];
  let best = Infinity;
  for (const f of fires) best = Math.min(best, Math.hypot(f.x - p.x, f.y - p.y) / TILE);
  if (best === Infinity) return 0;
  return AUDIO.amb.fire * Math.max(0, 1 - best / AUDIO.amb.fireRangeTiles);
}

function silenceAmbience() {
  for (const name of AMBIENT_LOOPS) audio.setLevel(name, 0, 0.1);
}

export default {
  name: 'audio',

  init(game) {
    audio.attach();                 // browser only: unlocks the AudioContext on the first gesture
    game.audio = audio;             // engine handle (debugging / e2e: window.__game.audio.state())
    for (const [evt, fn] of Object.entries(HANDLERS)) {
      game.events.on(evt, (p) => {
        const r = fn(p);
        if (r) audio.play(r[0], r[1]);
      });
    }
    for (const evt of QUIET_ON) game.events.on(evt, silenceAmbience);
  },

  onLoad(game) {
    runtime.delete(game);
  },

  update(game, dt) {
    hookToasts(game);
    const p = game.state?.player;
    if (!p) return;
    const r = rtOf(game);

    // Footsteps: a step every walkSec (or sprintSec), restarting on the first step when movement begins.
    if (p.moving) {
      r.footT -= dt;
      if (r.footT <= 0) {
        const sprint = !!p.sprinting;
        audio.play('footstep', { v: sprint ? AUDIO.foot.sprintGain : AUDIO.foot.walkGain });
        r.footT = sprint ? AUDIO.foot.sprintSec : AUDIO.foot.walkSec;
      }
    } else r.footT = 0;

    // Heartbeat below the health threshold: faster and louder the lower health gets.
    if (p.health > 0 && p.health < AUDIO.heart.health) {
      r.heartT -= dt;
      if (r.heartT <= 0) {
        const k = (AUDIO.heart.health - p.health) / AUDIO.heart.health;
        audio.play('heartbeat', { v: AUDIO.heart.minGain + (AUDIO.heart.maxGain - AUDIO.heart.minGain) * k });
        r.heartT = AUDIO.heart.maxSec + (AUDIO.heart.minSec - AUDIO.heart.maxSec) * k;
      }
    } else r.heartT = 0;

    // Ambience: weather intensities are already eased by the weather system.
    const wx = game.state.weather || {};
    const snow = wx.snow || 0, bliz = wx.bliz || 0;
    audio.setLevel('wind', AUDIO.amb.windBase + snow * AUDIO.amb.windSnow + bliz * AUDIO.amb.windBlizzard);
    audio.setLevel('blizzardHowl', bliz * AUDIO.amb.blizzardHowl);
    audio.setLevel('fire', fireLevel(game, p));
  },
};
