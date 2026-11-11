// Audio engine (DESIGN §12). Everything is synthesised at runtime with WebAudio: oscillators, filtered noise bursts and
// envelopes. No audio files, no libraries. Gameplay wiring lives in systems/audio.js.
//
// Safe under node: nothing touches window / AudioContext / localStorage until attach(), unlock(), play() or setLevel()
// is called, and every browser call is try/catch-guarded, so a missing AudioContext makes everything a silent no-op.
//
// Usage:  audio.attach()            once; installs pointerdown/keydown listeners that create the context (autoplay policy)
//         audio.play('chop', {v})    one-shot (v = volume multiplier, pitch = pitch multiplier, delay = seconds)
//         audio.setLevel('wind', x)  ambience loop level 0..1, smoothly ramped
//         audio.setMuted(bool) / toggleMuted()   persisted in localStorage

// Tuning (kept here rather than data/balance.js: this is presentation, not game balance).
export const AUDIO = {
  storageKey: 'last-ember-audio-muted',
  master: 0.7,              // master gain when unmuted
  maxVoices: 12,            // simultaneous one-shot voices
  minRepeatSec: 0.04,       // an identical sound starts at most once per 40 ms
  loopTau: 0.35,            // seconds, time constant for ambience level changes (smooth, no pops)
  pitchJitter: 0.06,        // +-6% random pitch per one-shot so repeats don't grate
  foot: { walkSec: 0.46, sprintSec: 0.3, walkGain: 0.35, sprintGain: 0.75 },
  heart: { health: 25, minSec: 0.7, maxSec: 1.1, minGain: 0.35, maxGain: 0.9 },
  amb: { windBase: 0.035, windSnow: 0.1, windBlizzard: 0.18, blizzardHowl: 0.14, fire: 0.07, fireRangeTiles: 6 },
};

// ---------- environment helpers (all guarded) ----------
function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
function readMuted(storage) {
  try { return storage?.getItem(AUDIO.storageKey) === '1'; } catch { return false; }
}
function writeMuted(storage, muted) {
  try { storage?.setItem(AUDIO.storageKey, muted ? '1' : '0'); } catch { /* private mode / blocked storage */ }
}
function defaultContext() {
  try {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch { return null; }
}

// ---------- engine state (module singleton; configure() replaces it, for tests) ----------
let S = null;
function fresh(storage = defaultStorage(), makeContext = defaultContext) {
  return {
    ctx: null, master: null, noise: null,
    makeContext, storage, muted: readMuted(storage),
    hidden: false, listening: false,
    voices: [],               // end times of live one-shot voices
    lastAt: new Map(),        // sound name -> ctx time it last started
    loops: new Map(),         // loop name -> { level: GainNode }
  };
}
const st = () => S || (S = fresh());

// ---------- low-level builders (each returns the time the voice ends) ----------
const jit = (pitch = 1) => pitch * (1 + (Math.random() * 2 - 1) * AUDIO.pitchJitter);

/** Amplitude envelope: quick exponential attack to `peak`, exponential decay to silence at t+dur. */
function env(g, t, peak, dur, attack = 0.005) {
  const p = g.gain;
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(attack, dur * 0.5));
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}

/** Oscillator voice. vib = { rate, depth } (Hz, Hz) adds pitch vibrato; lp = lowpass cutoff in Hz. */
function osc(s, t, o) {
  const { ctx } = s;
  const { type = 'sine', f, fEnd, dur, peak = 0.2, attack = 0.005, vib, lp } = o;
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.setValueAtTime(f, t);
  if (fEnd) node.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain();
  env(g, t, peak, dur, attack);
  if (lp) {
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = lp;
    node.connect(flt); flt.connect(g);
  } else node.connect(g);
  g.connect(s.master);
  if (vib) {
    const l = ctx.createOscillator(), d = ctx.createGain();
    l.frequency.value = vib.rate; d.gain.value = vib.depth;
    l.connect(d); d.connect(node.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  node.start(t); node.stop(t + dur + 0.05);
  return t + dur + 0.05;
}

/** Filtered white-noise burst (shared 2 s noise buffer, random read offset). */
function burst(s, t, o) {
  const { ctx } = s;
  const { dur, peak = 0.2, attack = 0.003, type = 'bandpass', f = 1000, fEnd, q = 1 } = o;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(s);
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
  if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain();
  env(g, t, peak, dur, attack);
  src.connect(flt); flt.connect(g); g.connect(s.master);
  src.start(t, Math.random() * 1.5, dur + 0.05);
  src.stop(t + dur + 0.05);
  return t + dur + 0.05;
}

function noiseBuffer(s) {
  if (!s.noise) {
    const sr = s.ctx.sampleRate || 44100;
    const buf = s.ctx.createBuffer(1, sr * 2, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    s.noise = buf;
  }
  return s.noise;
}

const latest = (...ends) => Math.max(...ends);

// ---------- one-shot sounds: (state, startTime, opts) -> endTime ----------
const SOUNDS = {
  footstep(s, t, o) {                       // snow crunch: short bright noise + soft thump
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { dur: 0.09, peak: 0.45 * o.v, f: 2400 * j, fEnd: 1100 * j, q: 0.9, attack: 0.002 }),
      osc(s, t, { f: 120 * j, fEnd: 55 * j, dur: 0.09, peak: 0.3 * o.v }));
  },
  chop(s, t, o) {                           // axe into wood
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { dur: 0.08, peak: 0.32 * o.v, f: 1500 * j, fEnd: 700 * j, q: 1.8 }),
      osc(s, t, { type: 'triangle', f: 260 * j, fEnd: 150 * j, dur: 0.12, peak: 0.2 * o.v }));
  },
  mine(s, t, o) {                           // pickaxe on stone: ringing partials + grit
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { f: 1760 * j, dur: 0.28, peak: 0.1 * o.v }),
      osc(s, t, { f: 2640 * j, dur: 0.2, peak: 0.045 * o.v }),
      burst(s, t, { type: 'highpass', dur: 0.03, peak: 0.22 * o.v, f: 4500 * j, q: 0.7 }));
  },
  pickup(s, t, o) {                         // two rising blips
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { type: 'triangle', f: 660 * j, dur: 0.12, peak: 0.15 * o.v }),
      osc(s, t + 0.06, { type: 'triangle', f: 990 * j, dur: 0.14, peak: 0.13 * o.v }));
  },
  craft(s, t, o) {                          // three rising notes
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { type: 'triangle', f: 523 * j, dur: 0.18, peak: 0.1 * o.v }),
      osc(s, t + 0.07, { type: 'triangle', f: 659 * j, dur: 0.18, peak: 0.1 * o.v }),
      osc(s, t + 0.14, { type: 'triangle', f: 784 * j, dur: 0.2, peak: 0.1 * o.v }));
  },
  place(s, t, o) {                          // soft wooden thump
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { f: 150 * j, fEnd: 70 * j, dur: 0.2, peak: 0.28 * o.v }),
      burst(s, t, { type: 'lowpass', dur: 0.12, peak: 0.16 * o.v, f: 700 * j, q: 0.7 }));
  },
  destroyed(s, t, o) {                      // collapse: falling rumble and crash
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { type: 'lowpass', dur: 0.7, peak: 0.42 * o.v, f: 1400 * j, fEnd: 200, q: 0.7, attack: 0.01 }),
      osc(s, t, { f: 90 * j, fEnd: 40, dur: 0.5, peak: 0.24 * o.v }));
  },
  whoosh(s, t, o) {                         // swing through air
    const j = jit(o.pitch);
    return burst(s, t, { dur: 0.24, peak: 0.2 * o.v, f: 500 * j, fEnd: 2200 * j, q: 0.8, attack: 0.05 });
  },
  hit(s, t, o) {                            // blow landing on a creature
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { f: 190 * j, fEnd: 90, dur: 0.13, peak: 0.28 * o.v }),
      burst(s, t, { dur: 0.06, peak: 0.2 * o.v, f: 900 * j, q: 1.2 }));
  },
  thud(s, t, o) {                           // structure taking damage
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { type: 'lowpass', dur: 0.12, peak: 0.28 * o.v, f: 500 * j, q: 0.8 }),
      osc(s, t, { f: 110 * j, fEnd: 60, dur: 0.14, peak: 0.18 * o.v }));
  },
  hurt(s, t, o) {                           // player takes damage: low falling tone
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { type: 'triangle', f: 300 * j, fEnd: 150, dur: 0.26, peak: 0.24 * o.v }),
      osc(s, t, { type: 'sawtooth', f: 180 * j, fEnd: 110, dur: 0.2, peak: 0.05 * o.v, lp: 600 }));
  },
  eat(s, t, o) {                            // three crunches
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { dur: 0.05, peak: 0.24 * o.v, f: 1300 * j, q: 2 }),
      burst(s, t + 0.09, { dur: 0.05, peak: 0.24 * o.v, f: 1100 * j, q: 2 }),
      burst(s, t + 0.18, { dur: 0.06, peak: 0.2 * o.v, f: 900 * j, q: 2 }));
  },
  drink(s, t, o) {                          // sip with small bubbles
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { f: 380 * j, fEnd: 620, dur: 0.22, peak: 0.13 * o.v, attack: 0.03 }),
      osc(s, t + 0.1, { f: 900 * j, fEnd: 1400, dur: 0.05, peak: 0.07 * o.v }),
      osc(s, t + 0.16, { f: 1100 * j, fEnd: 1600, dur: 0.05, peak: 0.06 * o.v }));
  },
  bow(s, t, o) {                            // string release and arrow snap
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { type: 'triangle', f: 220 * j, fEnd: 110, dur: 0.2, peak: 0.18 * o.v }),
      burst(s, t + 0.02, { dur: 0.06, peak: 0.16 * o.v, f: 2600 * j, q: 1.5 }));
  },
  click(s, t, o) {                          // UI tick
    return osc(s, t, { f: 1400 * jit(o.pitch), dur: 0.03, peak: 0.07 * o.v });
  },
  break(s, t, o) {                          // tool snaps
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { type: 'highpass', dur: 0.09, peak: 0.36 * o.v, f: 2000 * j, q: 0.7 }),
      osc(s, t, { f: 900 * j, fEnd: 300, dur: 0.16, peak: 0.16 * o.v }));
  },
  denied(s, t, o) {                         // two low square blips
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { type: 'square', f: 170 * j, dur: 0.09, peak: 0.045 * o.v, lp: 900 }),
      osc(s, t + 0.12, { type: 'square', f: 130 * j, dur: 0.13, peak: 0.045 * o.v, lp: 900 }));
  },
  fireLit(s, t, o) {                        // whoosh of kindling catching
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { dur: 0.6, peak: 0.26 * o.v, f: 400 * j, fEnd: 1800 * j, q: 0.7, attack: 0.06 }),
      osc(s, t, { f: 220 * j, fEnd: 330, dur: 0.5, peak: 0.05 * o.v, attack: 0.1 }),
      burst(s, t + 0.3, { type: 'highpass', dur: 0.25, peak: 0.1 * o.v, f: 3000, q: 0.8 }));
  },
  fishCatch(s, t, o) {                      // splash, then a bright rising plip
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { dur: 0.35, peak: 0.22 * o.v, f: 700 * j, fEnd: 2400 * j, q: 0.8, attack: 0.02 }),
      osc(s, t + 0.12, { f: 520 * j, fEnd: 1100 * j, dur: 0.14, peak: 0.12 * o.v, attack: 0.01 }),
      osc(s, t + 0.28, { f: 780 * j, fEnd: 1500 * j, dur: 0.12, peak: 0.1 * o.v, attack: 0.01 }));
  },
  lineSnap(s, t, o) {                       // fishing line parts: sharp whip
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { type: 'highpass', dur: 0.07, peak: 0.26 * o.v, f: 3200 * j, q: 0.7 }),
      osc(s, t, { f: 1600 * j, fEnd: 500, dur: 0.12, peak: 0.08 * o.v }));
  },
  plop(s, t, o) {                           // nothing bites: a single soft drip
    return osc(s, t, { f: 420 * jit(o.pitch), fEnd: 260, dur: 0.12, peak: 0.1 * o.v, attack: 0.008 });
  },
  snareCaught(s, t, o) {                    // wooden thwack and a short spring
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { dur: 0.06, peak: 0.28 * o.v, f: 1100 * j, fEnd: 600, q: 2 }),
      osc(s, t, { type: 'triangle', f: 150 * j, fEnd: 90, dur: 0.14, peak: 0.2 * o.v }),
      osc(s, t + 0.05, { type: 'triangle', f: 700 * j, fEnd: 300, dur: 0.3, peak: 0.07 * o.v, vib: { rate: 22, depth: 90 } }));
  },
  fireOut(s, t, o) {                        // embers dying: long hiss and a soft thump
    const j = jit(o.pitch);
    return latest(
      burst(s, t, { type: 'highpass', dur: 1.3, peak: 0.2 * o.v, f: 2200 * j, fEnd: 5200, q: 0.6, attack: 0.04 }),
      osc(s, t, { f: 90 * j, fEnd: 45, dur: 0.3, peak: 0.12 * o.v }));
  },
  roomFormed(s, t, o) {                     // warm two-note rise: the shelter holds heat
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { type: 'triangle', f: 261.63 * j, dur: 0.7, peak: 0.1 * o.v, attack: 0.04 }),
      osc(s, t + 0.16, { type: 'triangle', f: 392 * j, dur: 0.9, peak: 0.1 * o.v, attack: 0.04 }),
      osc(s, t + 0.16, { type: 'sine', f: 523.25 * j, dur: 0.8, peak: 0.04 * o.v, attack: 0.05 }));
  },
  planeSwell(s, t, o) {                     // distant engine drone growing closer (rescue arriving)
    return latest(
      osc(s, t, { type: 'sawtooth', f: 58, fEnd: 82, dur: 3.6, peak: 0.12 * o.v, attack: 2.6, lp: 330, vib: { rate: 7.5, depth: 2.5 } }),
      osc(s, t, { type: 'triangle', f: 116, fEnd: 160, dur: 3.6, peak: 0.07 * o.v, attack: 2.8, lp: 520 }),
      burst(s, t, { dur: 3.6, peak: 0.07 * o.v, f: 320, fEnd: 700, q: 0.7, attack: 2.8 }));
  },
  planePass(s, t, o) {                      // overhead flyover: loud, then the pitch drops away
    return latest(
      osc(s, t, { type: 'sawtooth', f: 95, fEnd: 52, dur: 4.8, peak: 0.16 * o.v, attack: 1.3, lp: 380, vib: { rate: 8, depth: 3 } }),
      osc(s, t, { type: 'triangle', f: 190, fEnd: 104, dur: 4.8, peak: 0.08 * o.v, attack: 1.3, lp: 600 }),
      burst(s, t, { dur: 4.8, peak: 0.08 * o.v, f: 900, fEnd: 260, q: 0.6, attack: 1.2 }));
  },
  heartbeat(s, t, o) {                      // lub-dub
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { f: 60 * j, fEnd: 40, dur: 0.14, peak: 0.5 * o.v, attack: 0.01 }),
      osc(s, t + 0.22, { f: 60 * j, fEnd: 40, dur: 0.12, peak: 0.35 * o.v, attack: 0.01 }));
  },
  growl(s, t, o) {                          // wolf (pitch 1) or bear (pitch < 1) lunge
    const p = o.pitch ?? 1, j = jit(p);
    return latest(
      osc(s, t, { type: 'sawtooth', f: 95 * j, fEnd: 68 * j, dur: 0.7, peak: 0.13 * o.v, attack: 0.06, vib: { rate: 9, depth: 6 }, lp: 420 }),
      osc(s, t, { type: 'triangle', f: 190 * j, fEnd: 130 * j, dur: 0.7, peak: 0.05 * o.v, lp: 500 }));
  },
  howl(s, t, o) {                           // wolf howl at dusk: rising, vibrato, breathy
    const j = jit(o.pitch);
    return latest(
      osc(s, t, { f: 360 * j, fEnd: 560, dur: 1.9, peak: 0.15 * o.v, attack: 0.45, vib: { rate: 5.2, depth: 12 } }),
      osc(s, t, { type: 'triangle', f: 540 * j, fEnd: 840, dur: 1.7, peak: 0.05 * o.v, attack: 0.5, vib: { rate: 5.2, depth: 18 } }),
      burst(s, t, { dur: 1.6, peak: 0.05 * o.v, f: 900, fEnd: 1300, q: 4, attack: 0.4 }));
  },
  storm(s, t, o) {                          // two-note tense warning, repeated
    return latest(
      osc(s, t, { type: 'triangle', f: 233, dur: 0.55, peak: 0.11 * o.v, attack: 0.03 }),
      osc(s, t, { type: 'triangle', f: 277, dur: 0.55, peak: 0.09 * o.v, attack: 0.03 }),
      osc(s, t + 0.7, { type: 'triangle', f: 233, dur: 0.7, peak: 0.11 * o.v, attack: 0.03 }),
      osc(s, t + 0.7, { type: 'triangle', f: 277, dur: 0.7, peak: 0.09 * o.v, attack: 0.03 }));
  },
  sunrise(s, t, o) {                        // soft warm major chord, slow bloom
    const v = o.v;
    return latest(
      osc(s, t, { type: 'triangle', f: 261.63, dur: 3.6, peak: 0.06 * v, attack: 0.9 }),
      osc(s, t, { type: 'triangle', f: 329.63, dur: 3.6, peak: 0.05 * v, attack: 0.9 }),
      osc(s, t, { type: 'triangle', f: 392.0, dur: 3.6, peak: 0.05 * v, attack: 0.9 }),
      osc(s, t, { type: 'sine', f: 523.25, dur: 3.4, peak: 0.035 * v, attack: 1.0 }),
      osc(s, t, { type: 'sine', f: 130.81, dur: 3.6, peak: 0.03 * v, attack: 1.2 }));
  },
  death(s, t, o) {                          // sombre minor chord, slow fade
    const v = o.v;
    return latest(
      osc(s, t, { f: 110, dur: 4.5, peak: 0.07 * v, attack: 0.8 }),
      osc(s, t, { f: 130.81, dur: 4.5, peak: 0.06 * v, attack: 0.8 }),
      osc(s, t, { f: 164.81, dur: 4.5, peak: 0.05 * v, attack: 0.8 }),
      osc(s, t, { type: 'triangle', f: 220, fEnd: 150, dur: 2.6, peak: 0.05 * v, attack: 0.3, lp: 700 }));
  },
};

// ---------- ambience loops: built once per context, level set with smoothed ramps ----------
// 11 s of silence with ~2 soft pops a second at irregular times and sizes; long enough that the loop is not heard as a pattern.
function crackleBuffer(s) {
  if (s.crackle) return s.crackle;
  const sr = s.ctx.sampleRate || 44100, len = Math.floor(sr * 11), buf = s.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; };
  let t = 0.2;
  while (t < 10.8) {
    const start = Math.floor(t * sr), dur = Math.floor(sr * (0.004 + rnd() * 0.018)), amp = 0.15 + rnd() * rnd() * 0.85;
    for (let i = 0; i < dur && start + i < len; i++) d[start + i] += (rnd() * 2 - 1) * amp * Math.exp(-5 * i / dur);
    t += 0.12 + rnd() * rnd() * 1.4;
  }
  return (s.crackle = buf);
}
function lfo(s, rate, depth) {                // returns a depth GainNode; connect it to an AudioParam
  const o = s.ctx.createOscillator(), d = s.ctx.createGain();
  o.frequency.value = rate; d.gain.value = depth;
  o.connect(d); o.start();
  return d;
}
function loopSource(s) {
  const src = s.ctx.createBufferSource();
  src.buffer = noiseBuffer(s); src.loop = true;
  return src;
}
function gainNode(s, v) { const g = s.ctx.createGain(); g.gain.value = v; return g; }
function filter(s, type, f, q) { const b = s.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

const LOOPS = {
  wind(s) {                                   // low noise bed with slow gusts
    const src = loopSource(s), lp = filter(s, 'lowpass', 900, 0.5), amp = gainNode(s, 1), level = gainNode(s, 0);
    lfo(s, 0.11, 0.35).connect(amp.gain);
    src.connect(lp); lp.connect(amp); amp.connect(level); level.connect(s.master);
    src.start();
    return { level };
  },
  blizzardHowl(s) {                           // whistling band that wanders with the gusts
    const src = loopSource(s), bp = filter(s, 'bandpass', 1100, 5), level = gainNode(s, 0);
    lfo(s, 0.13, 260).connect(bp.frequency);
    src.connect(bp); bp.connect(level); level.connect(s.master);
    src.start();
    return { level };
  },
  fire(s) {                                   // campfire: soft low roar plus sparse, irregular crackles (no steady hiss)
    const level = gainNode(s, 0);
    const bed = loopSource(s), lp = filter(s, 'lowpass', 320, 0.4), bedAmp = gainNode(s, 0.5);
    lfo(s, 0.23, 0.12).connect(bedAmp.gain);
    bed.connect(lp); lp.connect(bedAmp); bedAmp.connect(level);
    const pops = s.ctx.createBufferSource(); pops.buffer = crackleBuffer(s); pops.loop = true;
    const hp = filter(s, 'highpass', 900, 0.5), top = filter(s, 'lowpass', 4200, 0.5), popAmp = gainNode(s, 0.55);
    pops.connect(hp); hp.connect(top); top.connect(popAmp); popAmp.connect(level);
    level.connect(s.master);
    bed.start(); pops.start();
    return { level };
  },
};

// ---------- public engine ----------
export const audio = {
  /** Replace the context factory and/or storage and drop any live context (tests, embedding). */
  configure({ makeContext, storage } = {}) {
    S = fresh(storage, makeContext || defaultContext);   // storage undefined -> default (localStorage or null)
    return audio;
  },

  /**
   * Install browser listeners: the first pointerdown/keydown creates and resumes the AudioContext (autoplay policy),
   * and visibilitychange suspends/resumes it. No-op without a window (node) or when already attached.
   */
  attach(target = globalThis.window) {
    const s = st();
    if (s.listening || !target?.addEventListener) return false;
    s.listening = true;
    const onGesture = () => {
      if (!audio.unlock()) return;
      target.removeEventListener('pointerdown', onGesture, true);
      target.removeEventListener('keydown', onGesture, true);
    };
    target.addEventListener('pointerdown', onGesture, true);
    target.addEventListener('keydown', onGesture, true);
    const doc = target.document;
    if (doc?.addEventListener) {
      s.hidden = !!doc.hidden;
      doc.addEventListener('visibilitychange', () => audio.setHidden(!!doc.hidden));
    }
    return true;
  },

  /** Create the context (once) and resume it if suspended. Call from a user gesture. Returns true if audio is usable. */
  unlock() {
    const s = st();
    try {
      if (!s.ctx) {
        const ctx = s.makeContext?.();
        if (!ctx) return false;
        const master = ctx.createGain();
        master.gain.value = s.muted ? 0 : AUDIO.master;
        master.connect(ctx.destination);
        s.ctx = ctx; s.master = master;
      }
      if (!s.hidden && s.ctx.state !== 'running') s.ctx.resume?.()?.catch?.(() => {});
      return true;
    } catch { return false; }
  },

  /** Tab hidden -> suspend the context; visible -> resume. */
  setHidden(hidden) {
    const s = st();
    s.hidden = !!hidden;
    const c = s.ctx;
    if (!c) return;
    try {
      if (hidden) c.suspend?.()?.catch?.(() => {});
      else c.resume?.()?.catch?.(() => {});
    } catch { /* ignore */ }
  },

  /** 'running' | 'suspended' | 'closed' | 'none' (no context yet or no AudioContext available). */
  state() { return st().ctx?.state ?? 'none'; },
  get ready() { return !!st().ctx; },
  get muted() { return st().muted; },

  setMuted(muted) {
    const s = st();
    s.muted = !!muted;
    writeMuted(s.storage, s.muted);
    try {
      if (s.master) s.master.gain.setTargetAtTime(s.muted ? 0 : AUDIO.master, s.ctx.currentTime, 0.03);
    } catch { /* ignore */ }
    return s.muted;
  },
  toggleMuted() { return audio.setMuted(!st().muted); },

  /**
   * Start a one-shot. Returns true if it was scheduled. Silently refused (false) when there is no context, muted,
   * unknown name, identical sound < 40 ms ago, or 12 voices are already sounding.
   */
  play(name, opts = {}) {
    const s = st(), def = SOUNDS[name];
    if (!def || !s.ctx || s.muted || s.hidden) return false;
    try {
      const now = s.ctx.currentTime || 0;
      const last = s.lastAt.get(name);
      if (last !== undefined && now - last < AUDIO.minRepeatSec) return false;
      s.voices = s.voices.filter((end) => end > now);
      if (s.voices.length >= AUDIO.maxVoices) return false;
      s.lastAt.set(name, now);
      const o = { v: opts.v ?? 1, pitch: opts.pitch ?? 1 };
      s.voices.push(def(s, now + (opts.delay || 0), o));
      return true;
    } catch { return false; }
  },

  /** Set an ambience loop's level (0..1). Loops are built on first use; changes ramp over `tau` seconds. */
  setLevel(name, level, tau = AUDIO.loopTau) {
    const s = st();
    if (!s.ctx) return;
    try {
      let L = s.loops.get(name);
      if (!L) {
        const build = LOOPS[name];
        if (!build) return;
        L = build(s);
        s.loops.set(name, L);
      }
      L.level.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), s.ctx.currentTime, tau);
    } catch { /* ignore */ }
  },
};

export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));
export const LOOP_NAMES = Object.freeze(Object.keys(LOOPS));
