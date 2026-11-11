// Animated / stateful drawing for structures: campfire & torch flames, furnace glow + smoke, drying-rack strips, doors that
// swing open, radio-tower light, hit shake. Plus helpers for the placement ghost and progress rings.
// Static art lives in render/sprites/structures.js.
import { registerObjectDrawer, spriteKeyFor } from './objects.js';
import { drawSprite } from './sprites.js';
import { TILE, BUILDING } from '../data/balance.js';
import { STRUCTURES } from '../data/structures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Sprite name used for a structure's ghost / icon (unlit variant). */
export const ghostSpriteKey = (id) => id;

export function drawFootprint(ctx, x, y, size, valid, time) {
  const a = 0.28 + 0.1 * Math.sin(time * 6), col = valid ? '123,211,137' : '230,57,70';
  ctx.fillStyle = `rgba(${col},${a})`; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 2;
  const c = size * 0.28;
  ctx.beginPath();
  for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + size, y, -1, 1], [x, y + size, 1, -1], [x + size, y + size, -1, -1]]) { ctx.moveTo(px + dx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + dy * c); }
  ctx.stroke();
  ctx.setLineDash([4, 4]); ctx.strokeStyle = `rgba(${col},0.55)`; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, size - 2, size - 2); ctx.setLineDash([]);
}

export function drawRing(ctx, x, y, r, frac, color = '#ffd166') {
  ctx.save();
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(10,16,22,0.7)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(frac, 0, 1)); ctx.stroke();
  ctx.restore();
}

/** Teardrop flame whose base centre is (x,y); s = scale (1 ≈ 26px tall). */
export function drawFlame(ctx, x, y, s, time, seed = 0) {
  const layers = [['#e71d36', 1, 1], ['#ff7b1c', 0.8, 0.86], ['#ffc247', 0.54, 0.64], ['#fff1c4', 0.28, 0.38]];
  for (let li = 0; li < layers.length; li++) {
    const [col, wm, hm] = layers[li];
    const tongues = li < 2 ? [[-4.2, 0.72, 0], [4.4, 0.8, 1.7], [0, 1, 3.1]] : [[0, 1, 3.1]];
    for (const [off, hk, ph] of tongues) {
      const flick = 0.9 + 0.1 * Math.sin(time * 13 + seed * 1.7 + ph * 2) + 0.06 * Math.sin(time * 23 + ph);
      const w = 6.4 * s * wm, h = 26 * s * hm * hk * flick, sway = Math.sin(time * 8.5 + seed + ph) * 2.4 * s, bx = x + off * s;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(bx - w, y);
      ctx.quadraticCurveTo(bx - w * 1.05, y - h * 0.55, bx + sway, y - h);
      ctx.quadraticCurveTo(bx + w * 1.05, y - h * 0.55, bx + w, y);
      ctx.quadraticCurveTo(bx, y + w * 0.55, bx - w, y); ctx.fill();
    }
  }
  // rising sparks
  for (let i = 0; i < 5; i++) {
    const ph = (time * 0.85 + i * 0.2 + seed * 0.13) % 1, px = x + Math.sin(i * 12.3 + seed) * 7 * s + Math.sin(ph * 6 + i) * 2, py = y - 8 * s - ph * 36 * s;
    ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = '#ffbf69'; ctx.beginPath(); ctx.arc(px, py, 1.25 * (1 - ph * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function shakeX(game, o) {
  const t = game?.building?.hitT.get(o.ty * game.world.w + o.tx);
  if (t === undefined) return 0;
  const age = game.time - t; return age < 0.28 ? Math.sin(age * 90) * 2.2 * (1 - age / 0.28) : 0;
}

for (const type of ['wood_wall', 'stone_wall', 'workbench', 'chest', 'spike_barricade', 'bedroll', 'fishing_hole']) {
  registerObjectDrawer(type, (ctx, o, x, y, game) => drawSprite(ctx, spriteKeyFor(o), o.variant || 0, x + shakeX(game, o), y));
}

registerObjectDrawer('campfire', (ctx, o, x, y, game, time) => {
  const dx = shakeX(game, o);
  drawSprite(ctx, o.lit ? 'campfire:lit' : 'campfire', 0, x + dx, y);
  if (o.lit) drawFlame(ctx, x + dx, y - 4, clamp(0.55 + o.fuel / 160, 0.55, 1.05), time, o.tx * 7 + o.ty);
});

registerObjectDrawer('torch_post', (ctx, o, x, y, game, time) => {
  const dx = shakeX(game, o);
  drawSprite(ctx, o.lit ? 'torch_post:lit' : 'torch_post', 0, x + dx, y);
  if (o.lit) drawFlame(ctx, x + dx, y - 33, clamp(0.4 + o.fuel / 500, 0.4, 0.62), time, o.tx * 5 + o.ty);
});

registerObjectDrawer('furnace', (ctx, o, x, y, game, time) => {
  const dx = shakeX(game, o);
  drawSprite(ctx, o.lit ? 'furnace:lit' : 'furnace', 0, x + dx, y);
  if (!o.lit) return;
  const f = 0.75 + 0.25 * Math.sin(time * 11 + o.tx) * Math.sin(time * 7.3);
  const g = ctx.createRadialGradient(x + dx, y - 5, 1, x + dx, y - 5, 12);
  g.addColorStop(0, `rgba(255,200,90,${0.55 * f})`); g.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = g; ctx.fillRect(x + dx - 14, y - 18, 28, 24);
  for (let i = 0; i < 4; i++) {                       // chimney smoke
    const ph = (time * 0.35 + i * 0.25 + o.tx * 0.1) % 1;
    ctx.globalAlpha = (1 - ph) * 0.38; ctx.fillStyle = '#cfd8e3';
    ctx.beginPath(); ctx.arc(x + dx + 7 + Math.sin(ph * 5 + i) * 3 + ph * 6, y - 35 - ph * 26, 2.2 + ph * 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
});

registerObjectDrawer('drying_rack', (ctx, o, x, y, game, time) => {
  const dx = shakeX(game, o);
  drawSprite(ctx, 'drying_rack', 0, x + dx, y);
  const secs = STRUCTURES.drying_rack.process.seconds, n = o.slots?.length || 0;
  for (let i = 0; i < n; i++) {
    const s = o.slots[i], px = x + dx + (i - 1) * 12;
    if (!s) continue;
    const k = clamp(s.t / secs, 0, 1), r = Math.round(199 - 89 * k), gg = Math.round(91 - 32 * k), b = Math.round(91 - 57 * k);
    const sway = Math.sin(time * 1.6 + i * 2) * 0.6;
    ctx.fillStyle = `rgb(${r},${gg},${b})`; ctx.beginPath();
    ctx.moveTo(px - 3, y - 29); ctx.lineTo(px + 3, y - 29); ctx.lineTo(px + 2.4 + sway, y - 29 + 15 - k * 3); ctx.quadraticCurveTo(px + sway, y - 29 + 18 - k * 4, px - 2.4 + sway, y - 29 + 15 - k * 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,20,10,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(px - 1.6, y - 28, 1.2, 9);
    // progress pip under the strip
    ctx.fillStyle = 'rgba(10,16,22,0.75)'; ctx.fillRect(px - 5, y + 4, 10, 3);
    ctx.fillStyle = s.done ? '#7bd389' : '#e9a23b'; ctx.fillRect(px - 5, y + 4, 10 * k, 3);
  }
});

registerObjectDrawer('snare', (ctx, o, x, y, game) => drawSprite(ctx, o.caught ? 'snare:caught' : 'snare', 0, x + shakeX(game, o), y));

registerObjectDrawer('door', (ctx, o, x, y, game) => {
  const p = game?.state?.player;
  let open = false;
  if (p) open = Math.hypot(o.tx * TILE + TILE / 2 - p.x, o.ty * TILE + TILE / 2 - p.y) < BUILDING.doorOpenRadius * TILE;
  drawSprite(ctx, 'door', (o.variant || 0) + (open ? 16 : 0), x + shakeX(game, o), y);
});

registerObjectDrawer('radio_tower', (ctx, o, x, y, game, time) => drawSprite(ctx, Math.sin(time * 3) > 0.2 ? 'radio_tower:on' : 'radio_tower', 0, x + shakeX(game, o), y));
