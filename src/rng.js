// Deterministic randomness. Pure, DOM-free.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded RNG object. `state()`/`setState()` are NOT provided: keep gameplay randomness in Math.random, world gen here. */
export function createRng(seed) {
  const next = mulberry32(seed);
  const rng = {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)), // inclusive
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    weighted(list) { // list of {w}
      let total = 0; for (const e of list) total += e.w;
      let r = next() * total;
      for (const e of list) { r -= e.w; if (r <= 0) return e; }
      return list[list.length - 1];
    },
  };
  return rng;
}

/** Integer hash of (seed,x,y) -> [0,1). */
export function hash2(seed, x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth 2D value noise in [0,1). Feature size ~1 unit. */
export function valueNoise(seed, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/** Fractal value noise normalised to ~[0,1]. */
export function fbm(seed, x, y, octaves = 3) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(seed + i * 101, x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

export function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;
