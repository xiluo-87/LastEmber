// Darkness overlay with radial light cut-outs. Light sources are collected by the renderer from systems' optional
// `lights(game, push)` hook; push({ x, y, radius, flicker, color?, intensity? })  -- x,y world px, radius in TILES.
import { LIGHT } from '../data/balance.js';
import { makeCanvas } from './sprites.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DAY_TINT = [70, 48, 96], NIGHT_TINT = [6, 11, 30];
const RES = 0.5; // darkness layer resolution relative to the canvas (smooth gradients, so cheap)

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
        const g = dctx.createRadialGradient(x, y, 0, x, y, r);
        const a = Math.min(1, l.intensity ?? 1);
        g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.45, `rgba(0,0,0,${a * 0.88})`);
        g.addColorStop(0.75, `rgba(0,0,0,${a * 0.45})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = g; dctx.beginPath(); dctx.arc(x, y, r, 0, Math.PI * 2); dctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(dark, 0, 0, view.w * view.dpr, view.h * view.dpr);
      // warm glow
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        if (l.glow === false) continue;
        const x = (l.x - cam.x) * s * view.dpr, y = (l.y - cam.y) * s * view.dpr;
        const r = l.radius * 32 * s * view.dpr * flicker(l, time) * 0.9;
        if (x + r < 0 || y + r < 0 || x - r > view.w * view.dpr || y - r > view.h * view.dpr) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const c = l.color || '255,160,70', a = 0.2 * darkness * (l.glowIntensity ?? 1);
        g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      // warm multiply tint: lights with `warm` (campfire, furnace, torch post) turn the lit snow orange instead of white
      ctx.globalCompositeOperation = 'multiply';
      for (const l of lights) {
        if (!l.warm) continue;
        const x = (l.x - cam.x) * s * view.dpr, y = (l.y - cam.y) * s * view.dpr;
        const r = l.radius * 32 * s * view.dpr * flicker(l, time);
        if (x + r < 0 || y + r < 0 || x - r > view.w * view.dpr || y - r > view.h * view.dpr) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r), k2 = Math.min(1, darkness * 1.4) * l.warm;
        const mix = (v) => Math.round(255 - (255 - v) * k2);
        g.addColorStop(0, `rgb(${mix(255)},${mix(190)},${mix(120)})`); g.addColorStop(0.55, `rgb(${mix(255)},${mix(205)},${mix(150)})`); g.addColorStop(1, 'rgb(255,255,255)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function flicker(l, time) {
  const f = l.flicker ?? 0;
  if (!f) return 1;
  const p = (l.x * 0.13 + l.y * 0.07);
  return 1 + f * (0.6 * Math.sin(time * 17 + p) + 0.4 * Math.sin(time * 29 + p * 1.7));
}
