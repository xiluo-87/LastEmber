// Gameplay randomness: ONE seeded stream stored in state (state.rngA, a uint32 mulberry32 counter) so the same seed + inputs
// reproduce the same run, and a save->load continues the same stream. World gen uses rng.js (separate stream).
// Usage: nextRand(state) -> [0,1).   game.rand() is the bound version. Never use Math.random in gameplay code.
export function nextRand(state) {
  let a = state.rngA;
  if (typeof a !== 'number' || !Number.isFinite(a)) a = ((state.seed ^ 0x9e3779b9) >>> 0) || 1;
  a = (a + 0x6d2b79f5) >>> 0;
  state.rngA = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
