// Screen-space snow / blizzard particles. Fixed-size pool (typed arrays), zero per-frame allocations:
// positions/velocities live in Float32Arrays, drawing batches every particle into two path strokes.
import { FX } from '../data/balance.js';

export function createParticles(max = FX.maxParticles) {
  const x = new Float32Array(max), y = new Float32Array(max), f = new Float32Array(max), g = new Float32Array(max), s = new Float32Array(max);
  let seeded = false, W = 0, H = 0;
  const lerp = (a, b, t) => a + (b - a) * t;

  function seed(w, h) {
    W = w; H = h;
    for (let i = 0; i < max; i++) {
      x[i] = Math.random() * w; y[i] = Math.random() * h;
      f[i] = 0.55 + Math.random() * 0.9;   // speed factor
      g[i] = Math.random();                // fall/wind blend jitter
      s[i] = Math.random();                // size 0..1
    }
    seeded = true;
  }

  return {
    /** snow, blizzard in 0..1 (intensity). */
    update(dt, w, h, snow, bliz) {
      if (!seeded || w !== W || h !== H) seed(w, h);
      this.count = Math.min(max, Math.round(Math.max(FX.snowParticles * snow, FX.blizzardParticles * bliz)));
      const n = this.count;
      const fallLo = lerp(FX.snowFall[0], FX.blizzardFall[0], bliz), fallHi = lerp(FX.snowFall[1], FX.blizzardFall[1], bliz);
      for (let i = 0; i < n; i++) {
        const fall = lerp(fallLo, fallHi, g[i]) * f[i];
        const wind = lerp(FX.snowDrift * (0.5 + g[i]), lerp(FX.blizzardWind[1], FX.blizzardWind[0], g[i]), bliz) * (0.7 + 0.3 * f[i]);
        x[i] += wind * dt; y[i] += fall * dt;
        if (y[i] > h + 8) { y[i] = -8; x[i] = Math.random() * (w + 200); }
        if (x[i] < -12) { x[i] = w + 12; y[i] = Math.random() * h; }
        else if (x[i] > w + 12) x[i] -= w + 24;
      }
      this.bliz = bliz;
    },
    count: 0, bliz: 0,
    draw(ctx, night) {
      const n = this.count; if (n <= 0) return;
      const bliz = this.bliz;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = night ? (pass ? 'rgba(170,190,225,0.55)' : 'rgba(200,215,240,0.8)') : (pass ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.95)');
        ctx.lineWidth = pass ? 1.4 + bliz * 0.6 : 2.2 + bliz * 0.8;
        ctx.beginPath();
        for (let i = pass; i < n; i += 2) {
          const px = x[i], py = y[i];
          // streak trails behind the motion: a dot when calm, a long diagonal streak in a blizzard
          const len = 1.2 + bliz * (10 + 16 * g[i]) * f[i];
          ctx.moveTo(px, py);
          ctx.lineTo(px + len * 0.85 * bliz + 0.01, py - len * (1 - 0.5 * bliz));
        }
        ctx.stroke();
      }
    },
  };
}
