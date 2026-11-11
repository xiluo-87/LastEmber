// Terrain tile sprites: 'terrain:<id>' (8 variants for snow, 4-6 for others) and soft edge overlays 'edge:<id>:<side>'.
import { registerSprite } from '../sprites.js';
import { TERRAIN } from '../../data/terrain.js';
import { PAL, ellipse, tinyRock } from './util.js';

const S = 32;
function speckle(ctx, rng, n, color, rMin, rMax) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(2 + rng() * 28, 2 + rng() * 28, rMin + rng() * (rMax - rMin), 0, Math.PI * 2); ctx.fill(); }
}
function soft(ctx, x, y, rx, ry, color, a) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, color.replace('A', a)); g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

registerSprite('terrain:snow', { w: S, h: S, ax: 0, ay: 0, variants: 8, draw(ctx, v, rng) {
  ctx.fillStyle = PAL.snow; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 3; i++) soft(ctx, 10 + rng() * 12, 10 + rng() * 12, 5 + rng() * 4, 4 + rng() * 3, 'rgba(255,255,255,A)', 0.5);
  for (let i = 0; i < 2; i++) soft(ctx, 10 + rng() * 12, 10 + rng() * 12, 5 + rng() * 4, 3 + rng() * 3, 'rgba(160,180,205,A)', 0.2);
  speckle(ctx, rng, 5, 'rgba(255,255,255,0.95)', 0.5, 0.9);
  speckle(ctx, rng, 3, 'rgba(150,170,200,0.45)', 0.4, 0.7);
  if (v >= 5) { // little wind-drift ripples
    ctx.strokeStyle = 'rgba(150,170,200,0.4)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) { const x = 5 + rng() * 14, y = 7 + rng() * 18; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 5, y - 2.2, x + 10 + rng() * 4, y); ctx.stroke(); }
  }
  if (v === 7) { ellipse(ctx, 20, 21, 2.6, 1.6, '#9aa6b5'); ellipse(ctx, 20, 20.2, 2.4, 1.2, '#f4f8fb'); }
} });

registerSprite('terrain:deep_snow', { w: S, h: S, ax: 0, ay: 0, variants: 5, draw(ctx, v, rng) {
  ctx.fillStyle = '#dbe5f0'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 3; i++) {
    const x = 11 + rng() * 10, y = 11 + rng() * 10, r = 5 + rng() * 3;
    soft(ctx, x + 1, y + 2.5, r, r * 0.6, 'rgba(120,145,180,A)', 0.4);
    soft(ctx, x - 1, y - 1.2, r * 0.9, r * 0.55, 'rgba(255,255,255,A)', 0.95);
  }
  speckle(ctx, rng, 6, 'rgba(255,255,255,0.95)', 0.5, 0.9);
} });

registerSprite('terrain:ice', { w: S, h: S, ax: 0, ay: 0, variants: 5, draw(ctx, v, rng) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#c9e9f4'); g.addColorStop(1, '#a8d5e7');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) soft(ctx, 10 + rng() * 12, 10 + rng() * 12, 8, 5, 'rgba(255,255,255,A)', 0.4);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) { const x = 4 + rng() * 14, y = 4 + rng() * 22; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + rng() * 6, y + 3 - rng() * 6); ctx.stroke(); }
  if (v % 2 === 0) { ctx.strokeStyle = 'rgba(110,160,190,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); let x = 4 + rng() * 6, y = 6 + rng() * 6; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += 3 + rng() * 4; y += 2 + rng() * 4; ctx.lineTo(x, y); } ctx.stroke(); }
  speckle(ctx, rng, 3, 'rgba(255,255,255,0.9)', 0.5, 1);
} });

registerSprite('terrain:rock', { w: S, h: S, ax: 0, ay: 0, variants: 6, draw(ctx, v, rng) {
  ctx.fillStyle = '#a4acb7'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 3; i++) soft(ctx, 10 + rng() * 12, 10 + rng() * 12, 8, 6, 'rgba(90,100,115,A)', 0.3);
  for (let i = 0; i < 2; i++) soft(ctx, 10 + rng() * 12, 10 + rng() * 12, 7, 5, 'rgba(225,232,240,A)', 0.55);
  for (let i = 0; i < 4; i++) { ellipse(ctx, 3 + rng() * 26, 3 + rng() * 26, 1 + rng() * 1.6, 0.8 + rng() * 1.1, `rgba(${70 + rng() * 30 | 0},${80 + rng() * 30 | 0},${95 + rng() * 25 | 0},0.7)`); }
  if (v >= 4) tinyRock(ctx, 10 + rng() * 12, 12 + rng() * 10, 2.4 + rng() * 1.4, rng, '#8a93a0');
  if (v === 5) soft(ctx, 16, 16, 9, 6, 'rgba(255,255,255,A)', 0.8);
} });

registerSprite('terrain:cliff', { w: S, h: S, ax: 0, ay: 0, variants: 6, draw(ctx, v, rng) {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#5b6677'); g.addColorStop(1, '#394353');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 5; i++) { // faceted ridges
    const x = rng() * S, y = rng() * S, w = 8 + rng() * 12;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(130,145,165,0.35)' : 'rgba(20,28,40,0.35)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + 3 + rng() * 5); ctx.lineTo(x + w * 0.6, y + 10 + rng() * 8); ctx.lineTo(x - 3, y + 7); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(15,22,34,0.55)'; ctx.lineWidth = 0.9;
  for (let i = 0; i < 2; i++) { ctx.beginPath(); const x = rng() * S, y = rng() * S; ctx.moveTo(x, y); ctx.lineTo(x + 5 - rng() * 10, y + 6 + rng() * 6); ctx.stroke(); }
  for (let i = 0; i < 2; i++) soft(ctx, 4 + rng() * 24, 3 + rng() * 10, 8 + rng() * 4, 3.5, 'rgba(240,246,252,A)', 0.85); // snow dusting
} });

// ---- edge feathering: terrain B's colour (or cliff shadow) bleeding onto neighbouring tile A along one side ----
const EDGE_COL = { snow: '248,251,253', deep_snow: '196,210,228', ice: '175,218,235', rock: '150,159,172', cliff: '34,44,62' };
const SIDES = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
for (const id of Object.keys(TERRAIN)) {
  for (const side of Object.keys(SIDES)) {
    registerSprite(`edge:${id}:${side}`, { w: S, h: S, ax: 0, ay: 0, draw(ctx, v, rng) {
      const col = EDGE_COL[id], cliff = id === 'cliff', width = cliff ? 13 : 10, a0 = cliff ? 0.5 : 0.95;
      ctx.save();
      // rotate the canvas so we always draw a strip along the top, then rotate to the side
      const rot = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 }[side];
      ctx.translate(S / 2, S / 2); ctx.rotate(rot); ctx.translate(-S / 2, -S / 2);
      const g = ctx.createLinearGradient(0, 0, 0, width);
      g.addColorStop(0, `rgba(${col},${a0})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, width);
      for (let x = -2; x < S + 4; x += 5 + rng() * 3) { // organic bumps
        const r = 3 + rng() * (cliff ? 6 : 6);
        const rg = ctx.createRadialGradient(x, 0, 0, x, 0, r + 3);
        rg.addColorStop(0, `rgba(${col},${a0 * 0.85})`); rg.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, 0, r + 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } });
  }
}
export const EDGE_SIDES = SIDES;
