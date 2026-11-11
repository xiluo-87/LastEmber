// Item icons (procedural, cached). itemIcon(id) -> canvas (64x64 internal, scale with CSS). 
// Custom icons: registerIcon(itemId, (ctx, size, item) => void). Otherwise drawn from item.shape/item.color.
import { ITEMS } from '../data/items.js';
import { makeCanvas } from './sprites.js';

const SIZE = 64;
const custom = new Map();
const cache = new Map();
export const registerIcon = (id, fn) => { custom.set(id, fn); cache.delete(id); };

const dark = (c) => c; // placeholder for future shading
function stroke(ctx, w = 3) { ctx.lineWidth = w; ctx.strokeStyle = 'rgba(10,18,26,0.55)'; ctx.stroke(); }
function fill(ctx, c) { ctx.fillStyle = c; ctx.fill(); }
function circle(ctx, x, y, r, c, outline = true) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fill(ctx, c); if (outline) stroke(ctx, 2.5); }
function line(ctx, x1, y1, x2, y2, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

const SHAPES = {
  blob: (ctx, c) => { ctx.beginPath(); ctx.ellipse(32, 34, 17, 14, 0, 0, 7); fill(ctx, c); stroke(ctx); circle(ctx, 26, 28, 4, 'rgba(255,255,255,0.35)', false); },
  rock: (ctx, c) => { ctx.beginPath(); ctx.moveTo(14, 40); ctx.lineTo(20, 22); ctx.lineTo(36, 16); ctx.lineTo(50, 28); ctx.lineTo(48, 44); ctx.lineTo(26, 48); ctx.closePath(); fill(ctx, c); stroke(ctx); line(ctx, 22, 24, 34, 20, 3, 'rgba(255,255,255,0.35)'); },
  shard: (ctx, c) => { ctx.beginPath(); ctx.moveTo(18, 46); ctx.lineTo(30, 14); ctx.lineTo(46, 38); ctx.lineTo(34, 50); ctx.closePath(); fill(ctx, c); stroke(ctx); line(ctx, 30, 18, 36, 34, 2.5, 'rgba(255,255,255,0.35)'); },
  log: (ctx, c) => { ctx.save(); ctx.translate(32, 34); ctx.rotate(-0.5); ctx.fillStyle = c; ctx.fillRect(-20, -9, 40, 18); stroke(ctx); ctx.restore(); ctx.save(); ctx.translate(32, 34); ctx.rotate(-0.5); circle(ctx, 20, 0, 9, '#d9b383'); circle(ctx, 20, 0, 4, '#b98a55', false); ctx.restore(); },
  stick: (ctx, c) => { line(ctx, 14, 48, 50, 16, 7, 'rgba(10,18,26,0.55)'); line(ctx, 14, 48, 50, 16, 4.5, c); line(ctx, 32, 32, 42, 38, 3, c); },
  tuft: (ctx, c) => { for (let i = -2; i <= 2; i++) line(ctx, 32 + i * 3, 48, 32 + i * 8, 16 + Math.abs(i) * 5, 4, c); },
  coil: (ctx, c) => { for (const r of [16, 11, 6]) { ctx.beginPath(); ctx.arc(32, 34, r, 0, 7); ctx.lineWidth = 3.5; ctx.strokeStyle = c; ctx.stroke(); } },
  cloth: (ctx, c) => { ctx.beginPath(); ctx.moveTo(12, 20); ctx.quadraticCurveTo(32, 12, 52, 20); ctx.lineTo(48, 48); ctx.quadraticCurveTo(32, 54, 16, 48); ctx.closePath(); fill(ctx, c); stroke(ctx); line(ctx, 18, 28, 46, 28, 2, 'rgba(255,255,255,0.4)'); },
  bone: (ctx, c) => { line(ctx, 18, 46, 46, 18, 7, c); for (const [x, y] of [[16, 42], [20, 48], [44, 16], [48, 22]]) circle(ctx, x, y, 5, c, false); },
  bar: (ctx, c) => { ctx.beginPath(); ctx.moveTo(12, 38); ctx.lineTo(22, 22); ctx.lineTo(54, 22); ctx.lineTo(44, 38); ctx.closePath(); fill(ctx, c); stroke(ctx); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(12, 38, 32, 8); line(ctx, 24, 26, 48, 26, 2.5, 'rgba(255,255,255,0.5)'); },
  leaf: (ctx, c) => { ctx.beginPath(); ctx.moveTo(14, 48); ctx.quadraticCurveTo(10, 14, 50, 14); ctx.quadraticCurveTo(54, 50, 14, 48); fill(ctx, c); stroke(ctx); line(ctx, 16, 46, 42, 20, 2.5, 'rgba(255,255,255,0.45)'); },
  antenna: (ctx, c) => { line(ctx, 32, 52, 32, 14, 4, c); line(ctx, 20, 24, 44, 24, 3, c); line(ctx, 24, 34, 40, 34, 3, c); circle(ctx, 32, 12, 4, '#e63946'); },
  battery: (ctx, c) => { ctx.fillStyle = c; ctx.fillRect(16, 20, 32, 28); stroke(ctx); ctx.fillStyle = '#334'; ctx.fillRect(24, 14, 6, 6); ctx.fillRect(38, 14, 6, 6); line(ctx, 32, 28, 28, 38, 3, '#fff'); line(ctx, 28, 38, 36, 38, 3, '#fff'); },
  chip: (ctx, c) => { ctx.fillStyle = c; ctx.fillRect(14, 16, 36, 32); stroke(ctx); ctx.fillStyle = '#d9c36a'; ctx.fillRect(24, 26, 16, 12); line(ctx, 18, 22, 30, 22, 2, '#cfe'); line(ctx, 40, 44, 46, 44, 2, '#cfe'); },
  map: (ctx, c) => { ctx.fillStyle = c; ctx.fillRect(12, 16, 40, 32); stroke(ctx); ctx.strokeStyle = '#b5523c'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(18, 40); ctx.quadraticCurveTo(30, 18, 46, 28); ctx.stroke(); ctx.setLineDash([]); line(ctx, 44, 24, 48, 30, 3, '#b5523c'); },
  berry: (ctx, c) => { circle(ctx, 24, 38, 9, c); circle(ctx, 40, 36, 9, c); circle(ctx, 32, 24, 9, c); circle(ctx, 29, 21, 2.5, 'rgba(255,255,255,0.6)', false); },
  meat: (ctx, c) => { ctx.beginPath(); ctx.ellipse(32, 34, 20, 14, -0.4, 0, 7); fill(ctx, c); stroke(ctx); circle(ctx, 38, 30, 5, '#f3e3d0'); line(ctx, 20, 40, 26, 34, 3, 'rgba(255,255,255,0.35)'); },
  strip: (ctx, c) => { ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.5); ctx.fillStyle = c; ctx.fillRect(-22, -7, 44, 14); stroke(ctx); ctx.restore(); },
  fish: (ctx, c) => { ctx.beginPath(); ctx.ellipse(30, 32, 18, 11, 0, 0, 7); fill(ctx, c); stroke(ctx); ctx.beginPath(); ctx.moveTo(46, 32); ctx.lineTo(58, 22); ctx.lineTo(58, 42); ctx.closePath(); fill(ctx, c); stroke(ctx); circle(ctx, 20, 29, 2.6, '#111', false); },
  drop: (ctx, c) => { ctx.beginPath(); ctx.moveTo(32, 12); ctx.quadraticCurveTo(52, 36, 44, 46); ctx.quadraticCurveTo(32, 58, 20, 46); ctx.quadraticCurveTo(12, 36, 32, 12); fill(ctx, c); stroke(ctx); circle(ctx, 26, 38, 3.5, 'rgba(255,255,255,0.55)', false); },
  cup: (ctx, c) => { ctx.beginPath(); ctx.moveTo(16, 22); ctx.lineTo(44, 22); ctx.lineTo(40, 48); ctx.lineTo(20, 48); ctx.closePath(); fill(ctx, '#d9d2c3'); stroke(ctx); ctx.fillStyle = c; ctx.fillRect(18, 24, 24, 8); ctx.beginPath(); ctx.arc(46, 32, 6, -1.5, 1.5); ctx.lineWidth = 3; ctx.strokeStyle = '#d9d2c3'; ctx.stroke(); },
  pot: (ctx, c) => { ctx.beginPath(); ctx.moveTo(14, 24); ctx.lineTo(50, 24); ctx.lineTo(46, 48); ctx.lineTo(18, 48); ctx.closePath(); fill(ctx, c); stroke(ctx); ctx.fillStyle = '#2a2f3a'; ctx.beginPath(); ctx.ellipse(32, 24, 18, 4, 0, 0, 7); ctx.fill(); line(ctx, 14, 26, 8, 22, 3, c); },
  axe: (ctx, c) => { line(ctx, 18, 52, 44, 16, 5, '#7a5230'); ctx.beginPath(); ctx.moveTo(38, 12); ctx.quadraticCurveTo(58, 14, 54, 32); ctx.lineTo(40, 28); ctx.closePath(); fill(ctx, c); stroke(ctx); },
  pick: (ctx, c) => { line(ctx, 16, 52, 46, 20, 5, '#7a5230'); ctx.beginPath(); ctx.moveTo(26, 14); ctx.quadraticCurveTo(46, 6, 58, 26); ctx.lineWidth = 6; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.stroke(); },
  spear: (ctx, c) => { line(ctx, 12, 54, 46, 20, 4, '#7a5230'); ctx.beginPath(); ctx.moveTo(52, 8); ctx.lineTo(54, 24); ctx.lineTo(38, 22); ctx.closePath(); fill(ctx, c); stroke(ctx, 2.5); },
  bow: (ctx, c) => { ctx.beginPath(); ctx.arc(22, 32, 24, -1.1, 1.1); ctx.lineWidth = 5; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.stroke(); line(ctx, 32, 12, 32, 52, 1.8, '#eee'); },
  torch: (ctx, c) => { line(ctx, 22, 54, 38, 24, 6, '#7a5230'); ctx.beginPath(); ctx.moveTo(40, 8); ctx.quadraticCurveTo(54, 22, 42, 28); ctx.quadraticCurveTo(28, 24, 40, 8); fill(ctx, c); circle(ctx, 41, 22, 4, '#ffe29a', false); },
  hat: (ctx, c) => { ctx.beginPath(); ctx.ellipse(32, 34, 20, 15, 0, Math.PI, 0); ctx.lineTo(52, 40); ctx.lineTo(12, 40); ctx.closePath(); fill(ctx, c); stroke(ctx); ctx.fillStyle = '#f2e9d0'; ctx.fillRect(12, 38, 40, 8); },
  coat: (ctx, c) => { ctx.beginPath(); ctx.moveTo(22, 12); ctx.lineTo(42, 12); ctx.lineTo(56, 26); ctx.lineTo(48, 32); ctx.lineTo(44, 28); ctx.lineTo(44, 54); ctx.lineTo(20, 54); ctx.lineTo(20, 28); ctx.lineTo(16, 32); ctx.lineTo(8, 26); ctx.closePath(); fill(ctx, c); stroke(ctx); line(ctx, 32, 14, 32, 54, 2, 'rgba(255,255,255,0.4)'); },
  boot: (ctx, c) => { ctx.beginPath(); ctx.moveTo(22, 10); ctx.lineTo(38, 10); ctx.lineTo(38, 36); ctx.lineTo(54, 42); ctx.lineTo(54, 52); ctx.lineTo(18, 52); ctx.closePath(); fill(ctx, c); stroke(ctx); ctx.fillStyle = '#f2e9d0'; ctx.fillRect(20, 10, 20, 6); },
};

export function itemIcon(id) {
  let c = cache.get(id);
  if (c) return c;
  const item = ITEMS[id];
  c = makeCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d');
  if (custom.has(id)) custom.get(id)(ctx, SIZE, item);
  else (SHAPES[item?.shape] || SHAPES.blob)(ctx, dark(item?.color || '#888'));
  cache.set(id, c);
  return c;
}

// ---- distinct icons for items that would otherwise share a silhouette (inventory/crafting must be readable at a glance) ----
const shine = (ctx, x1, y1, x2, y2) => line(ctx, x1, y1, x2, y2, 2.5, 'rgba(255,255,255,0.5)');
registerIcon('iron_ore', (ctx, s, it) => {
  SHAPES.rock(ctx, '#6f7886');
  for (const [x, y, r] of [[26, 38, 5], [38, 34, 4.5], [32, 26, 4], [42, 42, 3.5]]) circle(ctx, x, y, r, it.color, false);
  circle(ctx, 25, 36, 1.4, '#ffd9c2', false); circle(ctx, 37, 32, 1.3, '#ffd9c2', false);
});
registerIcon('coal', (ctx) => {
  ctx.beginPath(); ctx.moveTo(14, 38); ctx.lineTo(22, 18); ctx.lineTo(40, 16); ctx.lineTo(52, 32); ctx.lineTo(44, 48); ctx.lineTo(24, 48); ctx.closePath(); fill(ctx, '#1f2933'); stroke(ctx);
  ctx.beginPath(); ctx.moveTo(24, 22); ctx.lineTo(38, 20); ctx.lineTo(32, 32); ctx.closePath(); fill(ctx, '#3b4a5a');
  shine(ctx, 40, 26, 46, 34);
});
registerIcon('hide', (ctx, s, it) => {
  ctx.beginPath(); ctx.moveTo(14, 16); ctx.lineTo(26, 20); ctx.lineTo(38, 16); ctx.lineTo(50, 22); ctx.lineTo(46, 32); ctx.lineTo(52, 44); ctx.lineTo(38, 48); ctx.lineTo(28, 54); ctx.lineTo(20, 46); ctx.lineTo(12, 38); ctx.lineTo(18, 28); ctx.closePath();
  fill(ctx, it.color); stroke(ctx);
  for (const [x, y] of [[24, 28], [36, 26], [30, 38], [40, 40]]) line(ctx, x, y, x + 3, y + 5, 2, 'rgba(60,30,10,0.45)');
});
registerIcon('bandage', (ctx) => {
  ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.4); ctx.fillStyle = '#f3f4f6'; ctx.fillRect(-20, -12, 40, 24); stroke(ctx); ctx.restore();
  ctx.fillStyle = '#e63946'; ctx.fillRect(28, 20, 8, 24); ctx.fillRect(20, 28, 24, 8);
});
registerIcon('fat', (ctx, s, it) => {
  ctx.beginPath(); ctx.moveTo(16, 40); ctx.quadraticCurveTo(14, 20, 32, 20); ctx.quadraticCurveTo(52, 18, 50, 38); ctx.quadraticCurveTo(46, 50, 30, 48); ctx.quadraticCurveTo(18, 48, 16, 40); fill(ctx, it.color); stroke(ctx);
  circle(ctx, 26, 30, 3.5, '#fff7d6', false); circle(ctx, 40, 36, 2.5, '#e6cf8a', false);
});
registerIcon('wood', (ctx, s, it) => { // two stacked logs with end rings: clearly "wood", unlike the single thin stick
  for (const [y, c] of [[40, '#8b5a2b'], [26, '#9a6a36']]) { ctx.fillStyle = c; ctx.fillRect(10, y - 8, 36, 16); stroke(ctx); circle(ctx, 46, y, 8, '#d9b383'); circle(ctx, 46, y, 3.5, '#b98a55', false); }
});
registerIcon('arrow', (ctx) => {
  line(ctx, 12, 52, 46, 18, 3, '#a9744a');
  ctx.beginPath(); ctx.moveTo(56, 8); ctx.lineTo(50, 24); ctx.lineTo(40, 14); ctx.closePath(); fill(ctx, '#9aa5b1'); stroke(ctx, 2);
  line(ctx, 14, 50, 8, 44, 3, '#e63946'); line(ctx, 18, 54, 12, 48, 3, '#e63946');
});
registerIcon('raw_meat', (ctx, s, it) => { SHAPES.meat(ctx, it.color); line(ctx, 22, 28, 34, 40, 2.5, '#f3c7c7'); line(ctx, 30, 24, 40, 34, 2, '#f3c7c7'); });
registerIcon('cooked_meat', (ctx, s, it) => { SHAPES.meat(ctx, it.color); for (const x of [22, 30, 38]) line(ctx, x, 24, x + 8, 40, 2.5, 'rgba(30,12,4,0.55)'); });
registerIcon('raw_fish', (ctx, s, it) => { SHAPES.fish(ctx, it.color); line(ctx, 28, 24, 28, 40, 2, 'rgba(255,255,255,0.55)'); line(ctx, 34, 25, 34, 39, 2, 'rgba(255,255,255,0.55)'); });
registerIcon('cooked_fish', (ctx, s, it) => { SHAPES.fish(ctx, it.color); for (const x of [26, 32, 38]) line(ctx, x, 24, x - 4, 40, 2.5, 'rgba(60,25,5,0.6)'); });
registerIcon('snow_water', (ctx, s, it) => { SHAPES.drop(ctx, it.color); for (const [x, y] of [[34, 44], [38, 38], [30, 32]]) circle(ctx, x, y, 1.8, '#6b5a43', false); });
registerIcon('clean_water', (ctx, s, it) => { SHAPES.drop(ctx, it.color); line(ctx, 46, 14, 46, 24, 2.5, '#fff'); line(ctx, 41, 19, 51, 19, 2.5, '#fff'); });
registerIcon('jerky', (ctx, s, it) => { for (const [y, r] of [[24, -0.3], [40, -0.15]]) { ctx.save(); ctx.translate(32, y); ctx.rotate(r); ctx.fillStyle = it.color; ctx.fillRect(-22, -6, 44, 12); stroke(ctx); ctx.restore(); } });
registerIcon('iron_axe', (ctx, s, it) => { SHAPES.axe(ctx, it.color); shine(ctx, 42, 16, 52, 24); });
registerIcon('iron_pickaxe', (ctx, s, it) => { SHAPES.pick(ctx, it.color); shine(ctx, 32, 12, 44, 12); });
registerIcon('iron_spear', (ctx, s, it) => { SHAPES.spear(ctx, it.color); shine(ctx, 50, 12, 52, 20); });
registerIcon('stone_axe', (ctx, s, it) => { SHAPES.axe(ctx, it.color); circle(ctx, 48, 24, 2, 'rgba(255,255,255,0.35)', false); line(ctx, 34, 36, 40, 32, 3, '#c8a46a'); });
registerIcon('stone_pickaxe', (ctx, s, it) => { SHAPES.pick(ctx, it.color); line(ctx, 34, 34, 40, 30, 3, '#c8a46a'); });
registerIcon('worn_jacket', (ctx, s, it) => { SHAPES.coat(ctx, it.color); ctx.fillStyle = '#5a2a1c'; ctx.fillRect(28, 12, 8, 6); line(ctx, 20, 40, 44, 40, 2, 'rgba(0,0,0,0.3)'); });
registerIcon('fur_coat', (ctx, s, it) => { SHAPES.coat(ctx, it.color); for (let x = 22; x <= 42; x += 5) line(ctx, x, 52, x + 1, 56, 3, '#f2e9d0'); line(ctx, 22, 14, 42, 14, 4, '#f2e9d0'); });
