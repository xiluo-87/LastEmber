// Resource-node and pickup sprites. Ground point of a tile object = (16, 27) in tile space; anchors below use that convention.
import { registerSprite } from '../sprites.js';
import { PAL, shadow, ellipse, smoothPoly, boulder, tinyRock } from './util.js';

// ---- pine tree ----
function tier(ctx, cx, baseY, halfW, height, dark, light) {
  const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
  g.addColorStop(0, dark); g.addColorStop(1, light);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - height);
  ctx.quadraticCurveTo(cx + halfW * 0.35, baseY - height * 0.45, cx + halfW, baseY - 1);
  const n = 4, step = (halfW * 2) / n; // scalloped lower edge
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(cx + halfW - step * (i + 0.5), baseY + 3.2, cx + halfW - step * (i + 1), baseY - 1);
  ctx.quadraticCurveTo(cx - halfW * 0.35, baseY - height * 0.45, cx, baseY - height);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,25,20,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  // snow on the upper half
  const f = 0.5, ex = halfW * (1 - f) * 1.0, ey = baseY - height * (1 - f) * 1.0 - 1;
  ctx.fillStyle = '#f2f7fb';
  ctx.beginPath();
  ctx.moveTo(cx, baseY - height - 0.5);
  ctx.quadraticCurveTo(cx + ex * 0.4, ey - height * 0.15, cx + ex + halfW * 0.28, ey + 1.5);
  ctx.quadraticCurveTo(cx + ex * 0.75, ey + 4.5, cx + ex * 0.35, ey + 1.8);
  ctx.quadraticCurveTo(cx + ex * 0.1, ey + 5.2, cx - ex * 0.25, ey + 1.8);
  ctx.quadraticCurveTo(cx - ex * 0.55, ey + 4.8, cx - ex - halfW * 0.28, ey + 1.5);
  ctx.quadraticCurveTo(cx - ex * 0.4, ey - height * 0.15, cx, baseY - height - 0.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,175,205,0.55)'; // snow underside shading
  ctx.beginPath(); ctx.ellipse(cx + 1, ey + 3.2, ex * 0.8 + 3, 1.6, 0, 0, Math.PI); ctx.fill();
}
registerSprite('tree', { w: 56, h: 84, ax: 28, ay: 76, variants: 3, draw(ctx, v, rng) {
  const cx = 28, base = 76, sc = [1, 0.88, 1.08][v];
  shadow(ctx, cx + 3, base - 1, 19 * sc, 6.5 * sc, 0.34);
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(cx - 3.2, base - 15, 6.4, 15);
  ctx.fillStyle = '#7a5230'; ctx.fillRect(cx - 3.2, base - 15, 2.4, 15);
  const dark = v === 1 ? '#1a3a32' : PAL.pine, light = v === 2 ? '#3a6b5b' : PAL.pine2;
  const tiers = v === 1 ? 3 : 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), by = base - 9 - i * 14.5 * sc, hw = (20 - i * 4.3) * sc, h = (23 - i * 1.5) * sc;
    tier(ctx, cx + (rng() - 0.5) * 1.2, by, hw, h, dark, light);
  }
} });

// ---- bushes ----
registerSprite('dead_bush', { w: 40, h: 36, ax: 20, ay: 28, variants: 3, draw(ctx, v, rng) {
  shadow(ctx, 21, 28, 12, 4, 0.25);
  ctx.lineCap = 'round';
  const n = 7 + v;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32 + (rng() - 0.5) * 0.2, len = 14 + rng() * 9;
    const x1 = 20 + Math.cos(a) * len, y1 = 28 + Math.sin(a) * len;
    ctx.strokeStyle = i % 2 ? '#7a5a3c' : '#5e4630'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(20 + (rng() - 0.5) * 3, 28); ctx.quadraticCurveTo(20 + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 4, 28 + Math.sin(a) * len * 0.6, x1, y1); ctx.stroke();
    ctx.lineWidth = 1; // twig
    const bx = 20 + Math.cos(a) * len * 0.62, by = 28 + Math.sin(a) * len * 0.62;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (rng() - 0.5) * 9, by - 4 - rng() * 3); ctx.stroke();
  }
  ellipse(ctx, 20, 29, 9, 3, '#f4f8fb'); ellipse(ctx, 17, 27, 4, 1.6, '#fff');
} });

function bush(ctx, rng, berries, empty) {
  shadow(ctx, 21, 28, 14, 5, 0.3);
  const cols = ['#2d6a4f', '#3a7d5c', '#245a43'];
  for (const [x, y, r] of [[13, 21, 8.5], [27, 21, 8.5], [20, 16, 9.5], [20, 23, 8]]) {
    const g = ctx.createRadialGradient(x - 2, y - 3, 1, x, y, r);
    g.addColorStop(0, cols[1]); g.addColorStop(1, cols[2]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(244,248,251,0.95)'; // snow on top
  ctx.beginPath(); ctx.ellipse(20, 11, 8, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12, 15, 4, 2, -0.3, 0, Math.PI * 2); ctx.fill();
  if (!empty) for (let i = 0; i < berries; i++) {
    const x = 9 + rng() * 22, y = 15 + rng() * 11;
    ellipse(ctx, x, y, 2.1, 2.1, '#c0394f'); ellipse(ctx, x - 0.6, y - 0.7, 0.7, 0.7, '#ff9aa8');
  }
}
registerSprite('berry_bush', { w: 40, h: 36, ax: 20, ay: 28, variants: 2, draw: (ctx, v, rng) => bush(ctx, rng, 8 + v * 2, false) });
registerSprite('berry_bush:empty', { w: 40, h: 36, ax: 20, ay: 28, variants: 2, draw: (ctx, v, rng) => bush(ctx, rng, 0, true) });

registerSprite('herb', { w: 32, h: 30, ax: 16, ay: 24, variants: 2, draw(ctx, v, rng) {
  shadow(ctx, 17, 24, 8, 3, 0.2);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.45, len = 9 + rng() * 5;
    ctx.strokeStyle = i % 2 ? '#4a9a5c' : '#5fb06e'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(16, 24); ctx.quadraticCurveTo(16 + Math.cos(a) * len * 0.4, 24 + Math.sin(a) * len * 0.7, 16 + Math.cos(a) * len, 24 + Math.sin(a) * len); ctx.stroke();
  }
  for (let i = 0; i < 3; i++) ellipse(ctx, 11 + i * 5 + (rng() - 0.5) * 2, 11 + rng() * 4, 2, 2, v ? '#f6e6a8' : '#ffffff');
} });

// ---- rocks & ores ----
registerSprite('rock_node', { w: 48, h: 44, ax: 24, ay: 34, variants: 3, draw(ctx, v, rng) {
  shadow(ctx, 25, 34, 18, 6, 0.32);
  boulder(ctx, 25, 24, 14, '#7b8492', '#a9b2bf', '#4b5563', rng);
  boulder(ctx, 14 + v * 2, 27, 8, '#6b7280', '#98a2b0', '#3f4856', rng);
  if (v !== 1) boulder(ctx, 36, 28, 7, '#78818e', '#a0a9b6', '#4b5563', rng);
} });
function ore(ctx, rng, v, chunk, chunkHi, chunkLo, speck) {
  shadow(ctx, 25, 34, 18, 6, 0.32);
  boulder(ctx, 25, 25, 14.5, '#6f7886', '#9ea8b5', '#434c5a', rng);
  for (let i = 0; i < 7; i++) {
    const x = 16 + rng() * 19, y = 17 + rng() * 14, r = 2.4 + rng() * 2.4;
    const pts = []; for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283 + rng(); pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85]); }
    const g = ctx.createLinearGradient(x, y - r, x, y + r); g.addColorStop(0, chunkHi); g.addColorStop(1, chunkLo);
    ctx.fillStyle = g; smoothPoly(ctx, pts); ctx.fill();
    ctx.fillStyle = speck; ctx.fillRect(x - r * 0.3, y - r * 0.55, 1.2, 1.2);
  }
}
registerSprite('iron_node', { w: 48, h: 44, ax: 24, ay: 34, variants: 2, draw: (c, v, r) => ore(c, r, v, '#b0623f', '#d9835a', '#7a3d25', '#ffd9c2') });
registerSprite('coal_node', { w: 48, h: 44, ax: 24, ay: 34, variants: 2, draw: (c, v, r) => ore(c, r, v, '#1f2933', '#3b4a5a', '#0b1016', '#8fa3b8') });

registerSprite('loose_stone', { w: 32, h: 28, ax: 16, ay: 22, variants: 3, draw(ctx, v, rng) {
  shadow(ctx, 17, 22, 9, 3, 0.25);
  tinyRock(ctx, 15, 17, 5.2, rng);
  if (v !== 1) tinyRock(ctx, 22, 20, 3.4, rng, '#8a93a0');
  if (v === 2) tinyRock(ctx, 9, 20, 2.6, rng, '#8a93a0');
} });
registerSprite('loose_stick', { w: 32, h: 28, ax: 16, ay: 22, variants: 3, draw(ctx, v, rng) {
  shadow(ctx, 16, 21, 9, 3, 0.2);
  ctx.lineCap = 'round';
  const sticks = v === 0 ? 2 : 3;
  for (let i = 0; i < sticks; i++) {
    const a = -0.5 + i * 0.7 + rng() * 0.4, cx = 15 + i * 2, cy = 17 + i * 1.2;
    const dx = Math.cos(a) * 8, dy = Math.sin(a) * 4;
    ctx.strokeStyle = '#5e4630'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
    ctx.strokeStyle = '#a9744a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy - 0.5); ctx.lineTo(cx + dx, cy + dy - 0.5); ctx.stroke();
  }
  ellipse(ctx, 15, 16, 3.5, 1.2, '#f7fafc');
} });
