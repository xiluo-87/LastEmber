// Procedural sprites for every player structure (DESIGN §8/§12). Cached via registerSprite.
// Tile space: a tile is 32x32. Each sprite declares its own padding; `ax,ay` map to the object's ground point (tx*32+16, ty*32+27).
//   walls / doors: 32 wide so neighbours join seamlessly; variant = 4-bit connection mask (N=1,E=2,S=4,W=8), doors: +16 when open.
//   lit variants: 'campfire:lit', 'furnace:lit', 'torch_post:lit' (flames themselves are animated by render/structurefx.js).
import { registerSprite, getSprite, makeCanvas } from '../sprites.js';
import { PAL, shadow, ellipse, roundRect } from './util.js';
import { STRUCTURES } from '../../data/structures.js';

// ---------------------------------------------------------------- walls (log palisade / stacked stone) + doors
// Geometry: a wall is 12 px thick, WH px tall, seen from above with a slight front face (same view as trees and the campfire).
// Variant = 4-bit connection mask. Logs / stones sit on lattices that are aligned to the tile grid (seeded by lattice cell, not rng),
// so neighbouring tiles join seamlessly. The sprite is padded by PADX on both sides and TOP above so caps are never clipped.
const TOP = 22, WH = 15, PADX = 4, TH = 12, T0 = (32 - TH) / 2;
const BOX = {
  post: [T0, TOP + T0, T0 + TH, TOP + T0 + TH], N: [T0, TOP, T0 + TH, TOP + T0], E: [T0 + TH, TOP + T0, 32, TOP + T0 + TH],
  S: [T0, TOP + T0 + TH, T0 + TH, TOP + 32], W: [0, TOP + T0, T0, TOP + T0 + TH],
};
const boxesFor = (mask) => [mask & 1 && BOX.N, mask & 8 && BOX.W, mask & 2 && BOX.E, BOX.post, mask & 4 && BOX.S].filter(Boolean);
/** Footprint used to place logs/stones: vertical arms are a hair narrower so a north-south run reads as one zig-zag file, not a cobble mat. */
const lattBoxes = (mask) => {
  const m = 1.5, post = [mask & 8 ? BOX.post[0] : BOX.post[0] + m, BOX.post[1], mask & 2 ? BOX.post[2] : BOX.post[2] - m, BOX.post[3]];
  return [mask & 1 && [BOX.N[0] + m, BOX.N[1], BOX.N[2] - m, BOX.N[3]], mask & 8 && BOX.W, mask & 2 && BOX.E, post, mask & 4 && [BOX.S[0] + m, BOX.S[1], BOX.S[2] - m, BOX.S[3]]].filter(Boolean);
};
const inBoxes = (boxes, x, y) => boxes.some((b) => x >= b[0] - 0.01 && x <= b[2] + 0.01 && y >= b[1] - 0.01 && y <= b[3] + 0.01);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function snowBlob(ctx, x, y, rx, ry, a = 0.95) {
  ctx.fillStyle = `rgba(247,250,252,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(160,184,212,0.55)'; ctx.beginPath(); ctx.ellipse(x + 0.4, y + ry * 0.55, rx * 0.9, ry * 0.45, 0, 0, Math.PI); ctx.fill();
}

/** One upright log standing on ground point (gx, gy). cap: 0 bare end, 1 half snow, 2 full snow cap. */
function drawLog(ctx, gx, gy, w, h, shade, cap) {
  const x0 = gx - w / 2, top = gy - h;
  const body = ['#8b5a2b', '#7d4f25', '#96612f', '#85552a'][shade];
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, '#b27d45'); g.addColorStop(0.35, body); g.addColorStop(1, '#4e3015');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0 + w, top); ctx.lineTo(x0 + w, gy - 0.6);
  ctx.quadraticCurveTo(gx, gy + 1.6, x0, gy - 0.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(30,16,6,0.6)'; ctx.fillRect(x0 + w - 0.7, top, 0.7, h - 0.4);            // seam to the next log
  ctx.fillStyle = 'rgba(255,225,170,0.16)'; ctx.fillRect(x0 + 0.6, top + 1, 0.8, h - 3);
  if (shade === 2) { ctx.fillStyle = 'rgba(40,22,8,0.4)'; ctx.beginPath(); ctx.ellipse(gx, gy - h * 0.35, 0.8, 1.5, 0, 0, 7); ctx.fill(); }   // knot
  // log end (top face)
  ctx.fillStyle = '#3f2711'; ctx.beginPath(); ctx.ellipse(gx, top, w / 2 + 0.25, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ['#cfa56e', '#c39a62', '#d6ae78', '#c8a068'][shade]; ctx.beginPath(); ctx.ellipse(gx, top - 0.1, w / 2 - 0.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,76,32,0.8)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.ellipse(gx, top - 0.1, w / 4, 0.9, 0, 0, Math.PI * 2); ctx.stroke();
  if (cap) {   // snow resting on the log end
    const ry = cap === 2 ? 2.7 : 1.7;
    ctx.fillStyle = 'rgba(248,251,253,0.97)'; ctx.beginPath(); ctx.ellipse(gx - (cap === 1 ? 0.3 : 0), top - (cap === 2 ? 0.8 : 1.1), w / 2 + 0.2, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,176,208,0.6)'; ctx.beginPath(); ctx.ellipse(gx, top + 0.7, w / 2 - 0.2, 0.9, 0, 0, Math.PI); ctx.fill();
  }
}

function drawWoodWall(ctx, mask, rng, { door = null, open = false } = {}) {
  ctx.translate(PADX, 0);
  const boxes = boxesFor(mask);
  shadow(ctx, 16, TOP + 27, 17, 5, 0.3);
  for (const b of boxes) { ctx.fillStyle = 'rgba(70,88,115,0.2)'; ctx.fillRect(b[0] + 1, b[3] - 1.5, b[2] - b[0], 4); }
  const SX = 32 / 6, SY = 4, lb = lattBoxes(mask);
  const logs = [];
  for (let j = 0; j < 9; j++) {
    const gy = TOP + SY * j + 0.0;
    for (let i = -1; i <= 6; i++) {
      const gx = SX * (i + (j & 1 ? 1 : 0.5));
      if (!inBoxes(lb, gx, gy) || (door && gx > BOX.post[0] - 1 && gx < BOX.post[2] + 1 && gy >= BOX.post[1] - 1)) continue;
      if (door && inBoxes([BOX.post], gx, gy)) continue;
      if (door && (!(mask & 5) || (mask & 10)) && gx > 3 && gx < 29) continue;   // east-west gate: the whole span between the gate posts is open
      logs.push([gx, gy, j, i]);
    }
  }
  for (const [gx, gy, j, i] of logs) {   // back to front (rows ascend)
    const h = WH + (hash(i + 31, j + (j & 1 ? 0 : 0)) - 0.5) * 3.2, c = hash(i, j * 3 + 1);
    drawLog(ctx, gx, gy + 1.5, 5.1, h, (hash(i + 5, j) * 4) | 0, c < 0.45 ? 2 : c < 0.8 ? 1 : 0);
  }
  // rope lashing across horizontal runs
  if (mask & 10 || !(mask & 5)) {
    const xa = mask & 8 || !(mask & 2) ? (mask & 8 ? 0 : BOX.post[0]) : BOX.post[0], xb = mask & 2 ? 32 : BOX.post[2];
    if (!door) { ctx.fillStyle = 'rgba(214,180,120,0.9)'; ctx.fillRect(xa, BOX.post[3] - 5.2, xb - xa, 1.4); ctx.fillStyle = 'rgba(90,60,20,0.5)'; ctx.fillRect(xa, BOX.post[3] - 3.9, xb - xa, 0.6); }
  }
  // snow drifted at the foot
  for (const b of boxes) for (let x = b[0] + 2; x < b[2] + 1; x += 5.3) snowBlob(ctx, x, b[3] + 1.7, 3.8, 1.6, 0.9);
  if (door) drawDoorLeaf(ctx, mask, open, rng);
  ctx.translate(-PADX, 0);
}

function drawDoorLeaf(ctx, mask, open, rng) {
  const horiz = !(mask & 5) || (mask & 10);          // wall line runs east-west (default for a lone door)
  const [x0, y0, x1, y1] = BOX.post, fy = y1 - WH + 1.5, hw = 3.4;
  ctx.save();
  if (horiz) {
    // two tall gate posts (bare log ends), a lintel beam and the leaf between them
    const px = [3.2, 24.8], lx0 = 6.8, lx1 = 25;
    if (!open) {
      const g = ctx.createLinearGradient(0, fy, 0, y1 + 1.5); g.addColorStop(0, '#c08a54'); g.addColorStop(1, '#8a5a30');
      ctx.fillStyle = g; ctx.fillRect(lx0, fy + 2, lx1 - lx0, WH - 2.5);
      ctx.fillStyle = 'rgba(40,22,8,0.55)'; for (let x = lx0 + 3; x < lx1 - 1; x += 3.6) ctx.fillRect(x, fy + 2, 0.8, WH - 2.5);
      ctx.fillStyle = '#3b4655'; ctx.fillRect(lx0, fy + 5, lx1 - lx0, 1.5); ctx.fillRect(lx0, y1 - 3.5, lx1 - lx0, 1.5);
      ctx.fillStyle = '#ecc97e'; ctx.beginPath(); ctx.arc(lx1 - 3.4, fy + WH / 2 + 1.2, 1.2, 0, 7); ctx.fill();
    } else {
      const g = ctx.createLinearGradient(0, fy, 0, y1 + 2); g.addColorStop(0, '#1c2530'); g.addColorStop(1, '#7f95ad');
      ctx.fillStyle = g; ctx.fillRect(lx0, fy + 2, lx1 - lx0, WH - 2.5);
      ctx.fillStyle = '#a2724a'; ctx.beginPath(); ctx.moveTo(lx0, fy + 2); ctx.lineTo(lx0 + 3.4, fy + 3.2); ctx.lineTo(lx0 + 3.4, y1 + 2.5); ctx.lineTo(lx0, y1 + 0.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,22,8,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
    for (const x of px) drawLog(ctx, x + hw / 2 + 0.6, y1 + 1.5, hw + 1.2, WH + 3.5, 1, 2);
    ctx.fillStyle = '#6f4623'; ctx.fillRect(px[0] + 0.4, fy - 2.2, px[1] - px[0] + hw + 1.2, 2.2);          // lintel
    ctx.fillStyle = 'rgba(248,251,253,0.95)'; ctx.fillRect(px[0] + 0.4, fy - 3.4, px[1] - px[0] + hw + 1.2, 1.4);
  } else {
    // north-south run: the gate faces the viewer edge-on
    ctx.fillStyle = '#5a3817'; ctx.fillRect(x0, fy, x1 - x0, WH - 1);
    if (!open) { ctx.fillStyle = '#a36e3c'; ctx.fillRect(x0 + 1.5, fy + 1, x1 - x0 - 3, WH - 3); ctx.fillStyle = '#3b4655'; ctx.fillRect(x0 + 1.5, fy + 4, x1 - x0 - 3, 1.5); ctx.fillStyle = '#ecc97e'; ctx.beginPath(); ctx.arc(x1 - 3.5, fy + 8, 1.1, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = '#1c2530'; ctx.fillRect(x0 + 2, fy + 1, x1 - x0 - 4, WH - 2); ctx.fillStyle = '#a2724a'; ctx.fillRect(x1 - 4, fy + 1, 2.4, WH + 2); }
    ctx.fillStyle = 'rgba(248,251,253,0.95)'; ctx.fillRect(x0, fy - 1.4, x1 - x0, 1.8);
  }
  ctx.restore();
}

function drawStoneWall(ctx, mask, rng) {
  ctx.translate(PADX, 0);
  const boxes = boxesFor(mask);
  shadow(ctx, 16, TOP + 27, 17, 5, 0.3);
  for (const b of boxes) { ctx.fillStyle = 'rgba(70,88,115,0.2)'; ctx.fillRect(b[0] + 1, b[3] - 1.5, b[2] - b[0], 4); }
  // Stacked blocks. Rows (courses) run on a 4 px ground lattice like the logs; each block is ~8 px wide, alternate courses shifted.
  const COURSE = WH / 3, SX = 8, SY = 4;
  const rows = [];
  for (let j = 0; j < 9; j++) rows.push(TOP + SY * j + 1.5);
  for (const gy of rows) {
    const j = Math.round((gy - TOP - 1.5) / SY);
    // front face of the row = stacked courses, drawn only where this ground row lies inside the footprint
    for (let k = -1; k <= 4; k++) {
      const x0 = k * SX + ((j & 1) ? 4 : 0), cx = x0 + SX / 2;
      if (!inBoxes(lattBoxes(mask), cx, gy - 1.5)) continue;
      for (let c = 0; c < 3; c++) {
        const hh = hash(k + 9 * c, j + 3), y1 = gy - c * COURSE, ytop = y1 - COURSE;
        const sh = 0.5 + 0.5 * hh, jig = (hash(k, j + c * 7) - 0.5) * 1.2;
        const cl = (a) => Math.round(a + sh * 26);
        ctx.fillStyle = `rgb(${cl(104)},${cl(113)},${cl(126)})`;
        roundRect(ctx, x0 + 0.4 + jig * 0.3, ytop + 0.2, SX - 0.8, COURSE - 0.2, 1.2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0 + 1.2, ytop + 0.4, SX - 2.4, 0.9);
        ctx.fillStyle = 'rgba(20,28,40,0.3)'; ctx.fillRect(x0 + 0.8, y1 - 1.1, SX - 1.6, 0.9);
        if (hh > 0.7) { ctx.fillStyle = 'rgba(30,40,54,0.3)'; ctx.beginPath(); ctx.ellipse(x0 + SX * 0.6, ytop + COURSE * 0.55, 1.2, 0.7, 0, 0, 7); ctx.fill(); }
      }
      // capstone on top of the stack, with a snow mound
      const topY = gy - WH, capc = hash(k + 2, j);
      ctx.fillStyle = `rgb(${Math.round(126 + capc * 26)},${Math.round(135 + capc * 24)},${Math.round(148 + capc * 20)})`;
      ctx.beginPath(); ctx.ellipse(cx, topY, SX / 2 - 0.2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(30,40,54,0.4)'; ctx.lineWidth = 0.5; ctx.stroke();
      if (hash(k, j + 11) < 0.78) snowBlob(ctx, cx + (hash(k + 4, j) - 0.5) * 1.5, topY - 0.9, SX / 2 - 0.2 + hash(k, j) * 1.2, 2.2 + hash(k + 1, j) * 0.7, 0.97);
    }
  }
  for (const b of boxes) for (let x = b[0] + 2; x < b[2] + 1; x += 5.3) snowBlob(ctx, x, b[3] + 1.7, 3.8, 1.6, 0.9);
  ctx.translate(-PADX, 0);
}

registerSprite('wood_wall', { w: 32 + 2 * PADX, h: TOP + 34, ax: 16 + PADX, ay: TOP + 27, variants: 16, draw: (ctx, v, rng) => drawWoodWall(ctx, v, rng) });
registerSprite('stone_wall', { w: 32 + 2 * PADX, h: TOP + 34, ax: 16 + PADX, ay: TOP + 27, variants: 16, draw: (ctx, v, rng) => drawStoneWall(ctx, v, rng) });
registerSprite('door', { w: 32 + 2 * PADX, h: TOP + 34, ax: 16 + PADX, ay: TOP + 27, variants: 32, draw: (ctx, v, rng) => drawWoodWall(ctx, v & 15, rng, { door: true, open: v >= 16 }) });

// spike barricade: bundle of sharpened stakes (blocks, no connection)
registerSprite('spike_barricade', { w: 40, h: 46, ax: 20, ay: 38, draw(ctx, v, rng) {
  shadow(ctx, 20, 38, 16, 5, 0.3);
  const stake = (x, y, ang, len, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const g = ctx.createLinearGradient(-2.4, 0, 2.4, 0); g.addColorStop(0, '#c08a52'); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-2.4, 0); ctx.lineTo(-1.9, -len + 6); ctx.lineTo(0, -len); ctx.lineTo(1.9, -len + 6); ctx.lineTo(2.4, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,22,8,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = '#f0e0c0'; ctx.beginPath(); ctx.moveTo(-0.9, -len + 4); ctx.lineTo(0, -len); ctx.lineTo(0.9, -len + 4); ctx.fill();
    ctx.restore();
  };
  // two crossed hedgehog beams + stakes
  for (const [x, a, l, c] of [[8, -0.55, 26, '#7a4a22'], [32, 0.55, 26, '#7a4a22'], [14, -0.25, 30, '#8b5a2b'], [26, 0.25, 30, '#8b5a2b'], [20, 0, 32, '#96612f'], [10, -0.8, 20, '#7a4a22'], [30, 0.8, 20, '#7a4a22']]) stake(x, 36, a, l, c);
  ctx.strokeStyle = '#c8a46a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, 29); ctx.lineTo(32, 29); ctx.stroke();
  ctx.fillStyle = '#4a2e14'; ctx.fillRect(5, 33, 30, 4); ctx.fillStyle = '#6b4220'; ctx.fillRect(5, 33, 30, 1.6);
  snowBlob(ctx, 12, 38, 6, 2); snowBlob(ctx, 28, 38.5, 6, 2);
} });

// ---------------------------------------------------------------- campfire / furnace / torch post
const OX = 8, OY = 24;           // tile origin inside the 48x58 "object" sprites; ground point = (24, 51)
function stoneRing(ctx, cx, cy, rx, ry, n, rng) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    const r = 3.4 + rng() * 1.2, g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#aab3bf'); g.addColorStop(1, '#5a6370');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,28,40,0.5)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = 'rgba(247,250,252,0.85)'; ctx.beginPath(); ctx.ellipse(x - 0.3, y - r * 0.45, r * 0.7, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function log(ctx, x, y, ang, len, col, charred) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = charred ? '#2a2420' : col; roundRect(ctx, -len / 2, -2.6, len, 5.2, 2.4); ctx.fill();
  ctx.fillStyle = charred ? 'rgba(80,60,50,0.5)' : 'rgba(255,220,160,0.25)'; ctx.fillRect(-len / 2 + 2, -2, len - 4, 1.3);
  ctx.fillStyle = charred ? '#3a302a' : '#d9b383'; ctx.beginPath(); ctx.ellipse(len / 2 - 0.6, 0, 1.8, 2.5, 0, 0, 7); ctx.fill();
  ctx.restore();
}
function campfireBase(ctx, lit, rng) {
  const cx = 24, cy = 46;
  shadow(ctx, cx + 2, cy + 3, 17, 6, 0.3);
  ellipse(ctx, cx, cy, 13.5, 7.5, lit ? '#3a2a22' : '#c3ced9');   // scorched ground / snow-melt
  ellipse(ctx, cx, cy, 11, 6, lit ? '#241a15' : '#5b5048');
  stoneRing(ctx, cx, cy, 12.2, 6.8, 9, rng);
  if (lit) { const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 11); g.addColorStop(0, 'rgba(255,170,60,0.95)'); g.addColorStop(1, 'rgba(231,29,54,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, 11, 6, 0, 0, 7); ctx.fill(); }
  for (const [a, dx] of [[-0.45, -3.2], [0.5, 3.4], [0.05, 0]]) log(ctx, cx + dx, cy + 0.5 - (dx === 0 ? 1.2 : 0), a, 15, '#7a4a22', !lit);
  if (!lit) { ctx.fillStyle = 'rgba(210,215,222,0.7)'; ctx.beginPath(); ctx.ellipse(cx + 1, cy + 0.5, 4, 1.8, 0, 0, 7); ctx.fill(); }
}
registerSprite('campfire', { w: 48, h: 58, ax: 24, ay: 51, draw: (ctx, v, rng) => campfireBase(ctx, false, rng) });
registerSprite('campfire:lit', { w: 48, h: 58, ax: 24, ay: 51, draw: (ctx, v, rng) => campfireBase(ctx, true, rng) });

function furnaceBase(ctx, lit, rng) {
  const x0 = OX + 2, w = 28, y1 = OY + 28, h = 20;
  shadow(ctx, 24, y1 + 2, 19, 5.5, 0.3);
  // front block
  const g = ctx.createLinearGradient(0, y1 - h, 0, y1); g.addColorStop(0, '#8a93a0'); g.addColorStop(1, '#5a6370');
  ctx.fillStyle = g; roundRect(ctx, x0, y1 - h, w, h, 3); ctx.fill(); ctx.strokeStyle = 'rgba(20,28,40,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  // brick courses
  ctx.strokeStyle = 'rgba(30,40,52,0.35)'; ctx.lineWidth = 0.7;
  for (let c = 1; c < 4; c++) { ctx.beginPath(); ctx.moveTo(x0 + 1, y1 - h + c * 5); ctx.lineTo(x0 + w - 1, y1 - h + c * 5); ctx.stroke(); }
  for (let c = 0; c < 4; c++) for (let k = 1; k < 4; k++) { const x = x0 + k * 7 + (c % 2 ? 3 : 0); if (x < x0 + w - 1) { ctx.beginPath(); ctx.moveTo(x, y1 - h + c * 5); ctx.lineTo(x, y1 - h + c * 5 + 5); ctx.stroke(); } }
  // top slab + chimney
  ctx.fillStyle = '#9aa4b1'; roundRect(ctx, x0 - 1.5, y1 - h - 4, w + 3, 6, 2.5); ctx.fill(); ctx.strokeStyle = 'rgba(20,28,40,0.55)'; ctx.stroke();
  ctx.fillStyle = '#6b7280'; ctx.fillRect(x0 + w - 11, y1 - h - 15, 8, 12); ctx.fillStyle = '#4b5563'; ctx.fillRect(x0 + w - 12, y1 - h - 17, 10, 3.5);
  snowBlob(ctx, x0 + 8, y1 - h - 4.5, 7, 2.2); snowBlob(ctx, x0 + w - 7, y1 - h - 17.5, 4, 1.6);
  // firebox arch
  const ax = x0 + 6.5, aw = 15, ay = y1 - 12.5, ah = 11.5;
  ctx.beginPath(); ctx.moveTo(ax, y1 - 1); ctx.lineTo(ax, ay + 4); ctx.quadraticCurveTo(ax, ay - 1, ax + aw / 2, ay - 1); ctx.quadraticCurveTo(ax + aw, ay - 1, ax + aw, ay + 4); ctx.lineTo(ax + aw, y1 - 1); ctx.closePath();
  const gg = ctx.createLinearGradient(0, ay, 0, y1);
  if (lit) { gg.addColorStop(0, '#ffd166'); gg.addColorStop(0.5, '#ff9f1c'); gg.addColorStop(1, '#c4380f'); } else { gg.addColorStop(0, '#14181e'); gg.addColorStop(1, '#2a2f38'); }
  ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = '#2f3640'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = '#2f3640'; for (let x = ax + 3; x < ax + aw - 1; x += 3.4) ctx.fillRect(x, ay + 3, 1, ah - 4);   // grate
}
registerSprite('furnace', { w: 48, h: 58, ax: 24, ay: 51, draw: (ctx, v, rng) => furnaceBase(ctx, false, rng) });
registerSprite('furnace:lit', { w: 48, h: 58, ax: 24, ay: 51, draw: (ctx, v, rng) => furnaceBase(ctx, true, rng) });

function torchPostBase(ctx, lit) {
  shadow(ctx, 24, 51, 9, 3.2, 0.3);
  ctx.fillStyle = '#4a2e14'; ctx.fillRect(21, 24, 6, 27); ctx.fillStyle = '#7a4a22'; ctx.fillRect(21, 24, 2.4, 27);
  ctx.fillStyle = '#3b4655'; ctx.fillRect(19.5, 36, 9, 2.2); ctx.fillRect(19.5, 44, 9, 2.2);           // iron bands
  // sconce
  ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.moveTo(17.5, 17); ctx.lineTo(30.5, 17); ctx.lineTo(27, 26); ctx.lineTo(21, 26); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#2b323d'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = lit ? '#5a2a10' : '#3a2a20'; ctx.beginPath(); ctx.ellipse(24, 17.5, 6.5, 2.2, 0, 0, 7); ctx.fill();
  snowBlob(ctx, 24, 51, 8, 2.2, 0.9);
}
registerSprite('torch_post', { w: 48, h: 58, ax: 24, ay: 51, draw: (ctx) => torchPostBase(ctx, false) });
registerSprite('torch_post:lit', { w: 48, h: 58, ax: 24, ay: 51, draw: (ctx) => torchPostBase(ctx, true) });

// ---------------------------------------------------------------- workbench / chest / drying rack
registerSprite('workbench', { w: 48, h: 54, ax: 24, ay: 47, draw(ctx, v, rng) {
  shadow(ctx, 24, 47, 20, 6, 0.3);
  const x0 = 6, x1 = 42, ty0 = 20, ty1 = 34, fy1 = 46;
  // legs
  for (const x of [x0 + 1, x1 - 6]) { ctx.fillStyle = '#5a3817'; ctx.fillRect(x, ty1, 5, fy1 - ty1); ctx.fillStyle = '#7a4a22'; ctx.fillRect(x, ty1, 1.8, fy1 - ty1); }
  // lower shelf
  ctx.fillStyle = '#6a4322'; ctx.fillRect(x0 + 5, 41, x1 - x0 - 10, 3); ctx.fillStyle = '#8b5a2b'; ctx.fillRect(x0 + 5, 41, x1 - x0 - 10, 1);
  // front apron
  const g = ctx.createLinearGradient(0, ty1, 0, ty1 + 7); g.addColorStop(0, '#9a6a36'); g.addColorStop(1, '#6e4624');
  ctx.fillStyle = g; ctx.fillRect(x0, ty1, x1 - x0, 7); ctx.strokeStyle = 'rgba(30,16,6,0.6)'; ctx.lineWidth = 0.9; ctx.strokeRect(x0, ty1, x1 - x0, 7);
  // top slab (planks)
  ctx.fillStyle = '#c28f55'; roundRect(ctx, x0 - 1, ty0, x1 - x0 + 2, ty1 - ty0, 2.4); ctx.fill(); ctx.strokeStyle = 'rgba(30,16,6,0.6)'; ctx.stroke();
  ctx.strokeStyle = 'rgba(90,56,23,0.55)'; ctx.lineWidth = 0.7; for (let y = ty0 + 3.5; y < ty1 - 1; y += 3.5) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,240,210,0.3)'; ctx.fillRect(x0, ty0 + 0.8, x1 - x0, 1);
  // tools: saw, hammer, vise
  ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(10, 27); ctx.lineTo(24, 24); ctx.lineTo(25, 28); ctx.lineTo(11, 31); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#6b7787'; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = '#7a4a22'; ctx.fillRect(8, 28.5, 4, 3);
  ctx.save(); ctx.translate(31, 28); ctx.rotate(-0.4); ctx.fillStyle = '#7a4a22'; ctx.fillRect(-6, -1, 11, 2.2); ctx.fillStyle = '#6b7280'; ctx.fillRect(3, -3.2, 5, 6); ctx.restore();
  ctx.fillStyle = '#4b5563'; ctx.fillRect(35, 22, 5, 6); ctx.fillStyle = '#9aa5b1'; ctx.fillRect(35, 22, 5, 1.6);
  snowBlob(ctx, 16, ty0 + 0.6, 7, 1.8, 0.95); snowBlob(ctx, 38, 46.5, 5, 1.6, 0.9);
} });

registerSprite('chest', { w: 40, h: 44, ax: 20, ay: 36, draw(ctx, v, rng) {
  shadow(ctx, 20, 36, 16, 5, 0.3);
  const x0 = 6, x1 = 34, bt = 22, bb = 34;
  const g = ctx.createLinearGradient(0, bt, 0, bb); g.addColorStop(0, '#9a6a36'); g.addColorStop(1, '#6e4624');
  ctx.fillStyle = g; roundRect(ctx, x0, bt, x1 - x0, bb - bt, 2); ctx.fill(); ctx.strokeStyle = 'rgba(30,16,6,0.7)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(40,22,8,0.5)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x0 + 1, 28); ctx.lineTo(x1 - 1, 28); ctx.stroke();
  // lid (rounded)
  ctx.beginPath(); ctx.moveTo(x0, bt); ctx.lineTo(x0, bt - 3); ctx.quadraticCurveTo(20, bt - 14, x1, bt - 3); ctx.lineTo(x1, bt); ctx.closePath();
  const lg = ctx.createLinearGradient(0, bt - 12, 0, bt); lg.addColorStop(0, '#c89358'); lg.addColorStop(1, '#8b5a2b'); ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = 'rgba(30,16,6,0.7)'; ctx.stroke();
  // iron bands + lock
  ctx.fillStyle = '#3b4655'; for (const x of [x0 + 4, x1 - 8]) { ctx.fillRect(x, bt - 9, 4, bb - bt + 9); }
  ctx.fillStyle = '#e6c27a'; ctx.fillRect(18, bt - 1, 4, 5); ctx.fillStyle = '#7a5a20'; ctx.fillRect(19.2, bt + 1, 1.6, 2);
  snowBlob(ctx, 17, bt - 9.4, 10, 2.3, 0.95);
} });

registerSprite('drying_rack', { w: 48, h: 56, ax: 24, ay: 49, draw(ctx, v, rng) {
  shadow(ctx, 24, 49, 19, 5, 0.3);
  const post = (x) => { ctx.fillStyle = '#5a3817'; ctx.fillRect(x - 2, 18, 4, 31); ctx.fillStyle = '#8b5a2b'; ctx.fillRect(x - 2, 18, 1.6, 31); };
  // A-frame legs (back) then crossbar (front)
  post(10); post(38);
  ctx.strokeStyle = '#6a4322'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(10, 40); ctx.lineTo(4, 49); ctx.moveTo(38, 40); ctx.lineTo(44, 49); ctx.stroke();
  ctx.fillStyle = '#7a4a22'; roundRect(ctx, 6, 17, 36, 4.4, 2); ctx.fill(); ctx.strokeStyle = 'rgba(30,16,6,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,160,0.28)'; ctx.fillRect(7, 17.6, 34, 1);
  ctx.strokeStyle = '#c8a46a'; ctx.lineWidth = 1.1; for (const x of [10, 24, 38]) { ctx.beginPath(); ctx.moveTo(x - 2, 17); ctx.lineTo(x + 2, 22); ctx.stroke(); }
  snowBlob(ctx, 24, 16.6, 15, 2.1, 0.95);
} });

// ---------------------------------------------------------------- flat things: bedroll, snare, fishing hole (drawn BEFORE the player; see renderer FLAT_OBJECTS)
registerSprite('bedroll', { w: 48, h: 44, ax: 24, ay: 22, draw(ctx, v, rng) {   // ground point y = ty*32+2 (flat): tile origin (8, 20)
  const cx = 24, cy = 36;
  shadow(ctx, cx, cy + 6, 18, 6, 0.25);
  const g = ctx.createLinearGradient(0, cy - 9, 0, cy + 7); g.addColorStop(0, '#c9604a'); g.addColorStop(1, '#8c3b2c');
  ctx.fillStyle = g; roundRect(ctx, cx - 17, cy - 8, 34, 16, 6); ctx.fill(); ctx.strokeStyle = 'rgba(40,14,8,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  // fur trim + stitching
  ctx.fillStyle = '#e8dcc0'; roundRect(ctx, cx - 17, cy - 8, 10, 16, 5); ctx.fill(); ctx.strokeStyle = 'rgba(80,60,40,0.5)'; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,200,0.35)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(cx - 5, cy - 5.5); ctx.lineTo(cx + 14, cy - 5.5); ctx.moveTo(cx - 5, cy + 5.5); ctx.lineTo(cx + 14, cy + 5.5); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - 4, cy - 7, 20, 2);
  // rolled end
  ellipse(ctx, cx + 17, cy, 4.5, 8, '#a8452f'); ctx.strokeStyle = 'rgba(40,14,8,0.6)'; ctx.beginPath(); ctx.ellipse(cx + 17, cy, 4.5, 8, 0, 0, 7); ctx.stroke(); ellipse(ctx, cx + 17, cy, 2, 4, '#7a2c1f');
} });

registerSprite('snare', { w: 48, h: 44, ax: 24, ay: 22, draw(ctx, v, rng) {
  const cx = 24, cy = 36;
  shadow(ctx, cx, cy + 3, 13, 4, 0.2);
  ctx.strokeStyle = '#c8a46a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(cx + 1, cy + 1, 10, 5, 0, 0.2, Math.PI * 2 - 0.5); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 9, cy + 2); ctx.quadraticCurveTo(cx - 18, cy - 8, cx - 15, cy - 14); ctx.stroke();
  for (const [x, y, a] of [[cx - 15, cy - 9, -0.3], [cx + 14, cy - 5, 0.3]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#7a4a22'; roundRect(ctx, -1.7, -9, 3.4, 15, 1.4); ctx.fill(); ctx.strokeStyle = 'rgba(30,16,6,0.6)'; ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore(); }
  snowBlob(ctx, cx - 14, cy + 3, 4, 1.5); snowBlob(ctx, cx + 15, cy + 4, 4, 1.5);
} });
registerSprite('snare:caught', { w: 48, h: 44, ax: 24, ay: 22, draw(ctx, v, rng) {
  const cx = 24, cy = 36;
  const base = getSprite('snare', 0); ctx.drawImage(base.canvas, 0, 0, base.w, base.h);
  // rabbit
  ellipse(ctx, cx + 1, cy - 1, 8, 5.6, '#e9e4d8'); ellipse(ctx, cx + 8, cy - 4, 4.4, 3.8, '#e9e4d8');
  ctx.fillStyle = '#e9e4d8'; ctx.beginPath(); ctx.ellipse(cx + 8, cy - 11, 1.6, 4.4, 0.2, 0, 7); ctx.ellipse(cx + 11, cy - 10, 1.5, 4, 0.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4b4b4'; ctx.beginPath(); ctx.ellipse(cx + 8.2, cy - 11, 0.7, 2.8, 0.2, 0, 7); ctx.fill();
  ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(cx + 10.2, cy - 4.6, 0.8, 0, 7); ctx.fill();
  ellipse(ctx, cx - 7, cy, 2.4, 2.2, '#fff');
  ctx.strokeStyle = 'rgba(70,60,50,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(cx + 1, cy - 1, 8, 5.6, 0, 0, 7); ctx.stroke();
} });

registerSprite('fishing_hole', { w: 48, h: 44, ax: 24, ay: 22, draw(ctx, v, rng) {
  const cx = 24, cy = 36;
  ellipse(ctx, cx, cy + 1, 15, 8.6, 'rgba(235,245,255,0.7)');
  ellipse(ctx, cx, cy, 12.5, 7, '#0d3347');
  const g = ctx.createRadialGradient(cx - 3, cy - 2, 1, cx, cy, 12); g.addColorStop(0, '#2b7fa6'); g.addColorStop(1, '#0a2433');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, 11.4, 6.2, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(180,225,250,0.45)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(cx - 2, cy - 1, 5, 2.4, 0, 3.4, 5.6); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; for (const [a, l] of [[0.4, 9], [2.2, 8], [3.6, 10], [5.2, 7], [1.3, 7]]) { ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 6.8); ctx.lineTo(cx + Math.cos(a) * (12 + l * 0.5), cy + Math.sin(a) * (6.8 + l * 0.28)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(70,100,130,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, 12.5, 7, 0, 0, 7); ctx.stroke();
} });

// ---------------------------------------------------------------- radio tower (placement + cost only; behaviour is a later phase)
function towerBase(ctx, on) {
  shadow(ctx, 24, 51, 20, 5.5, 0.3);
  // generator shed
  ctx.fillStyle = '#6b7280'; roundRect(ctx, 6, 40, 14, 10, 2); ctx.fill(); ctx.strokeStyle = 'rgba(20,28,40,0.6)'; ctx.stroke(); ctx.fillStyle = '#2f3640'; ctx.fillRect(9, 44, 8, 3);
  // lattice mast (tapered)
  ctx.strokeStyle = '#8a95a3'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(15, 50); ctx.lineTo(22, 6); ctx.moveTo(33, 50); ctx.lineTo(26, 6); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#6b7787';
  for (let i = 0; i < 7; i++) { const y0 = 50 - i * 6.2, y1 = y0 - 6.2, w0 = 9 - i * 0.9, w1 = 9 - (i + 1) * 0.9; ctx.beginPath(); ctx.moveTo(24 - w0, y0); ctx.lineTo(24 + w1, y1); ctx.moveTo(24 + w0, y0); ctx.lineTo(24 - w1, y1); ctx.moveTo(24 - w0, y0); ctx.lineTo(24 + w0, y0); ctx.stroke(); }
  // dish + antenna
  ctx.fillStyle = '#d6dee8'; ctx.beginPath(); ctx.ellipse(24, 16, 8, 3.4, -0.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#6b7787'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = '#9aa5b1'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(24, 6); ctx.lineTo(24, -4); ctx.stroke();
  ctx.fillStyle = on ? '#ff3b3b' : '#7a2a2a'; ctx.beginPath(); ctx.arc(24, -4, 2, 0, 7); ctx.fill();
}
registerSprite('radio_tower', { w: 48, h: 66, ax: 24, ay: 61, draw: (ctx) => { ctx.translate(0, 10); towerBase(ctx, false); } });
registerSprite('radio_tower:on', { w: 48, h: 66, ax: 24, ay: 61, draw: (ctx) => { ctx.translate(0, 10); towerBase(ctx, true); } });

// ---------------------------------------------------------------- room floor tile (wooden planks, tinted over the snow)
registerSprite('room_floor', { w: 32, h: 32, ax: 0, ay: 0, variants: 3, draw(ctx, v, rng) {
  ctx.fillStyle = 'rgba(176,128,76,0.62)'; ctx.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 4; i++) {
    const y = i * 8;
    ctx.fillStyle = ['rgba(196,146,88,0.30)', 'rgba(150,104,58,0.28)', 'rgba(210,160,100,0.26)', 'rgba(160,112,64,0.3)'][(i + v) % 4]; ctx.fillRect(0, y, 32, 8);
    ctx.fillStyle = 'rgba(60,34,12,0.5)'; ctx.fillRect(0, y + 7.2, 32, 0.9);
    const off = (v * 9 + i * 13) % 32; ctx.fillRect(off, y, 0.9, 7.4);
    ctx.fillStyle = 'rgba(255,230,190,0.16)'; ctx.fillRect(0, y + 0.4, 32, 0.8);
  }
} });

// ---------------------------------------------------------------- build-menu icons
const iconCache = new Map();
export const STRUCTURE_ICON_VARIANT = { wood_wall: 10, stone_wall: 10, door: 10 };
/** 64x64 canvas icon for a structure (sprite fitted into the square). */
export function structureIcon(id) {
  let c = iconCache.get(id);
  if (c) return c;
  c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const key = id === 'radio_tower' ? 'radio_tower' : id;
  const s = getSprite(key, STRUCTURE_ICON_VARIANT[id] ?? 0);
  // trim to the painted pixels (alpha bounding box) and fit into the square with a small margin
  const src = s.canvas, sw = src.width, sh = src.height;
  let x0 = sw, y0 = sh, x1 = 0, y1 = 0;
  try {
    const d = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  } catch { x0 = 0; y0 = 0; x1 = sw - 1; y1 = sh - 1; }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = sw - 1; y1 = sh - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(56 / bw, 56 / bh), w = bw * k, h = bh * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x0, y0, bw, bh, (64 - w) / 2, (64 - h) / 2, w, h);
  iconCache.set(id, c);
  return c;
}
export const clearStructureIcons = () => iconCache.clear();
export { snowBlob, STRUCTURES as _S };
