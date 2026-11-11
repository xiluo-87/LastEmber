// Screen-space effects drawn after the darkness layer: blizzard fog + visibility limit, frost vignette, damage flash,
// low-health pulse. Everything is pre-rendered into small offscreen canvases (rebuilt only on resize / zoom change), so a
// frame costs a handful of drawImage calls and no allocations.
import { TILE, FX, WEATHER } from '../data/balance.js';
import { makeCanvas } from './sprites.js';
import { mulberry32 } from '../rng.js';

const FOG_DAY = [218, 229, 240], FOG_NIGHT = [16, 22, 38];
const cache = { vigKey: '', frost: null, red: null, fogKey: '', fogDay: null, fogNight: null, fogR: 0 };

function buildVignette(w, h, rgb, innerFrac, maxA, crystals) {
  const k = 0.5, cw = Math.max(8, Math.ceil(w * k)), ch = Math.max(8, Math.ceil(h * k));
  const c = makeCanvas(cw, ch), x = c.getContext('2d');
  // elliptical gradient in unit space so the vignette hugs all four screen edges (portrait phones too)
  x.setTransform(cw / 2, 0, 0, ch / 2, cw / 2, ch / 2);
  const g = x.createRadialGradient(0, 0, innerFrac, 0, 0, 1.42);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},${maxA * 0.4})`); g.addColorStop(1, `rgba(${rgb},${maxA})`);
  x.fillStyle = g; x.fillRect(-1.5, -1.5, 3, 3);
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (crystals) { // little ice crystals creeping in from the edges and corners
    const rnd = mulberry32(77);
    x.strokeStyle = 'rgba(235,248,255,0.8)'; x.lineCap = 'round';
    for (let i = 0; i < 110; i++) {
      const edge = (rnd() * 4) | 0, t = rnd();
      let px = edge < 2 ? t * cw : (edge === 2 ? 0 : cw), py = edge < 2 ? (edge === 0 ? 0 : ch) : t * ch;
      const ang = Math.atan2(ch / 2 - py, cw / 2 - px) + (rnd() - 0.5) * 1.1, len = (8 + rnd() * 26) * (0.7 + rnd() * 0.6);
      x.lineWidth = 0.8 + rnd() * 1.2; x.globalAlpha = 0.25 + rnd() * 0.5;
      x.beginPath(); x.moveTo(px, py);
      let qx = px, qy = py;
      for (let s = 0; s < 3; s++) {
        qx += Math.cos(ang + (rnd() - 0.5) * 0.9) * len / 3; qy += Math.sin(ang + (rnd() - 0.5) * 0.9) * len / 3;
        x.lineTo(qx, qy);
      }
      x.stroke();
    }
    x.globalAlpha = 1;
  }
  return c;
}

function ensureVignettes(w, h) {
  const key = `${w}x${h}`;
  if (cache.vigKey === key) return;
  cache.vigKey = key;
  cache.frost = buildVignette(w, h, '96,160,230', 0.45, 0.95, true);
  cache.red = buildVignette(w, h, '200,20,30', 0.5, 0.95, false);
}

/** alpha 0..1 */
export function drawFrost(ctx, w, h, alpha) {
  if (alpha <= 0.01) return;
  ensureVignettes(w, h);
  ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(cache.frost, 0, 0, w, h); ctx.globalAlpha = 1;
}
export function drawRed(ctx, w, h, alpha) {
  if (alpha <= 0.01) return;
  ensureVignettes(w, h);
  ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(cache.red, 0, 0, w, h); ctx.globalAlpha = 1;
}

function buildFog(rgb, R, clearR) {
  const D = Math.ceil(R * 2), c = makeCanvas(D, D), x = c.getContext('2d');
  const g = x.createRadialGradient(R, R, clearR, R, R, R);
  const a = FX.fogMaxAlpha;
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},${a * 0.3})`); g.addColorStop(1, `rgba(${rgb},${a})`);
  x.fillStyle = g; x.fillRect(0, 0, D, D);
  return c;
}

/** Blizzard fog around the player: clear in the middle, opaque at `visibilityTiles`. k = intensity 0..1, light = ambient 0..1. */
export function drawFog(ctx, game, w, h, k, light, time) {
  if (k <= 0.01) return;
  const scale = game.camera?.scale || game.view?.scale || 1;
  const R = WEATHER.blizzard.visibilityTiles * TILE * scale, clearR = FX.fogClearTiles * TILE * scale;
  const key = `${Math.round(R)}`;
  if (cache.fogKey !== key) { cache.fogKey = key; cache.fogR = R; cache.fogDay = buildFog(FOG_DAY, R, clearR); cache.fogNight = buildFog(FOG_NIGHT, R, clearR); }
  const p = game.state.player, s = game.renderer.worldToScreen(p.x, p.y);
  const breathe = 1 + 0.03 * Math.sin(time * 0.9);
  const aDay = k * light * breathe, aNight = k * (1 - light) * breathe;
  const D = cache.fogDay.width, x0 = Math.round(s.x - D / 2), y0 = Math.round(s.y - D / 2);   // integer-aligned: no seams
  for (let pass = 0; pass < 2; pass++) {
    const a = pass ? aNight : aDay; if (a <= 0.01) continue;
    const sprite = pass ? cache.fogNight : cache.fogDay;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(sprite, x0, y0, D, D);
    ctx.fillStyle = pass ? 'rgba(16,22,38,0.93)' : 'rgba(218,229,240,0.93)';
    // opaque area outside the sprite (4 rects)
    if (y0 > 0) ctx.fillRect(0, 0, w, y0);
    if (y0 + D < h) ctx.fillRect(0, y0 + D, w, h - y0 - D);
    const top = Math.max(0, y0), bot = Math.min(h, y0 + D);
    if (x0 > 0) ctx.fillRect(0, top, x0, bot - top);
    if (x0 + D < w) ctx.fillRect(x0 + D, top, w - x0 - D, bot - top);
  }
  ctx.globalAlpha = 1;
}
