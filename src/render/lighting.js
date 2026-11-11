// Darkness overlay with radial light cut-outs. Light sources are collected by the renderer from systems' optional
// `lights(game, push)` hook; push({ x, y, radius, flicker, color?, intensity? })  -- x,y world px, radius in TILES.
import { LIGHT } from '../data/balance.js';
import { makeCanvas } from './sprites.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DAY_TINT = [70, 48, 96], NIGHT_TINT = [6, 11, 30];
const RES = 0.5; // darkness layer resolution relative to the canvas (smooth gradients, so cheap)

// Light falloffs are rendered once into small cached sprites and stamped with drawImage (scaled), instead of building a radial gradient
// per light per frame: same look, a fraction of the raster cost on phones.
const SPR = 128;
const sprites = new Map();
function radialSprite(key, stops) {
  let c = sprites.get(key);
  if (!c) {
    c = makeCanvas(SPR, SPR);
    const g = c.getContext('2d'), r = SPR / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad; g.fillRect(0, 0, SPR, SPR);
    sprites.set(key, c);
  }
  return c;
}
const cutSprite = () => radialSprite('cut', [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.88)'], [0.75, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
const glowSprite = (c) => radialSprite(`glow${c}`, [[0, `rgba(${c},1)`], [1, `rgba(${c},0)`]]);
const warmSprite = () => radialSprite('warmOverlay', [[0, 'rgba(255,150,60,1)'], [0.55, 'rgba(255,160,70,0.8)'], [1, 'rgba(255,170,80,0)']]);

export function createLighting() {
  const dark = makeCanvas(2, 2);
  const dctx = dark.getContext('2d');
  return {
    /** Darkness alpha 0..1 for ambient light `light` (1 = full daylight). */
    darkness: (light) => (1 - light) * LIGHT.maxDarkness,

    draw(ctx, game, cam, lights, time) {
      const state = game.state, view = game.view;
      const light = state.time?.light ?? 1;
      const darkness = (1 - light) * LIGHT.maxDarkness;
      if (darkness < 0.01) return;
      const w = Math.ceil(view.w * view.dpr * RES), h = Math.ceil(view.h * view.dpr * RES);
      if (dark.width !== w || dark.height !== h) { dark.width = w; dark.height = h; }
      const k = w / view.w; // css px -> dark px
      const t = smooth(0.06, 0.65, light);
      const col = DAY_TINT.map((d, i) => Math.round(NIGHT_TINT[i] + (d - NIGHT_TINT[i]) * t));
      dctx.globalCompositeOperation = 'source-over';
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, w, h);
      dctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${darkness})`;
      dctx.fillRect(0, 0, w, h);
      dctx.globalCompositeOperation = 'destination-out';
      const s = cam.scale;
      for (const l of lights) {
        const x = (l.x - cam.x) * s * k, y = (l.y - cam.y) * s * k;
        const r = l.radius * 32 * s * k * flicker(l, time);
        if (x + r < 0 || y + r < 0 || x - r > w || y - r > h) continue;
        dctx.globalAlpha = Math.min(1, l.intensity ?? 1);
        dctx.drawImage(cutSprite(), x - r, y - r, r * 2, r * 2);
      }
      // warm glow + warm tint, painted INTO the half-res layer with plain source-over (additive / multiply passes over the full-res
      // canvas were the single most expensive thing on phones): lit snow reads orange, and the whole lot is one blit.
      dctx.globalCompositeOperation = 'source-over';
      for (const l of lights) {
        if (l.glow === false && !l.warm) continue;
        const x = (l.x - cam.x) * s * k, y = (l.y - cam.y) * s * k;
        const r = l.radius * 32 * s * k * flicker(l, time);
        if (x + r < 0 || y + r < 0 || x - r > w || y - r > h) continue;
        if (l.glow !== false) { dctx.globalAlpha = 0.2 * darkness * (l.glowIntensity ?? 1); dctx.drawImage(glowSprite(l.color || '255,160,70'), x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8); }
        if (l.warm) { dctx.globalAlpha = 0.5 * Math.min(1, darkness * 1.4) * l.warm; dctx.drawImage(warmSprite(), x - r, y - r, r * 2, r * 2); }
      }
      dctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(dark, 0, 0, view.w * view.dpr, view.h * view.dpr);
    },
  };
}

function flicker(l, time) {
  const f = l.flicker ?? 0;
  if (!f) return 1;
  const p = (l.x * 0.13 + l.y * 0.07);
  return 1 + f * (0.6 * Math.sin(time * 17 + p) + 0.4 * Math.sin(time * 29 + p * 1.7));
}
