// Procedural sprite registry + cache (DESIGN §12). DOM-touching (canvas) but contains no game logic.
//
//   registerSprite('name', { w, h, ax, ay, variants:1, draw(ctx, variant, rng) })
//     w,h   size in WORLD px (1 tile = 32). ax,ay = anchor inside the sprite that maps to the object's ground point
//     draw  paints in world-px coordinates, origin = sprite top-left (ctx is pre-scaled by the cache resolution). `rng` is a
//           deterministic per-(name,variant) random function ()=>[0,1).
//   getSprite(name, variant) -> { canvas, w, h, ax, ay }   (cached; created lazily; missing names give a magenta placeholder)
//   drawSprite(ctx, name, variant, x, y, alpha?)           x,y = world position of the anchor
//   getOutline(name, variant, color) -> cached outline-silhouette sprite entry (for target highlighting)
// Ground point of an object on tile (tx,ty) is (tx*32+16, ty*32+27): see objectGround() in renderer.js.
import { mulberry32 } from '../rng.js';

const defs = new Map();
const cache = new Map();
let SS = 2; // cache resolution multiplier (device px per world px)

export function setSpriteScale(ss) {
  ss = Math.max(1, Math.min(4, Math.ceil(ss - 0.001)));
  if (ss !== SS) { SS = ss; cache.clear(); }
}
export const spriteScale = () => SS;

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export function registerSprite(name, def) { defs.set(name, { variants: 1, ax: def.w / 2, ay: def.h, ...def }); cache.delete(name); }
export const hasSprite = (name) => defs.has(name);

let warned = new Set();
function build(name, v) {
  const def = defs.get(name);
  const w = def ? def.w : 32, h = def ? def.h : 32;
  const canvas = makeCanvas(Math.ceil(w * SS), Math.ceil(h * SS));
  const ctx = canvas.getContext('2d');
  ctx.scale(SS, SS);
  if (def) {
    const variant = ((v % def.variants) + def.variants) % def.variants;
    def.draw(ctx, variant, mulberry32(hashStr(name) + variant * 7919));
  } else {
    if (!warned.has(name)) { warned.add(name); console.warn(`[sprites] missing sprite "${name}"`); }
    ctx.fillStyle = '#ff00ff'; ctx.fillRect(2, 2, 28, 28);
  }
  return { canvas, w, h, ax: def ? def.ax : 16, ay: def ? def.ay : 32 };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function getSprite(name, variant = 0) {
  const key = `${name}#${variant}`;
  let s = cache.get(key);
  if (!s) { s = build(name, variant); cache.set(key, s); }
  return s;
}

export function drawSprite(ctx, name, variant, x, y, alpha = 1) {
  const s = getSprite(name, variant);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** Outline silhouette (padded by 3 world px each side). Draw it at (x - o.ax, y - o.ay) with size o.w,o.h, UNDER the sprite. */
export function getOutline(name, variant = 0, color = '#fff3b0') {
  const key = `${name}#${variant}#outline#${color}`;
  let o = cache.get(key);
  if (o) return o;
  const s = getSprite(name, variant), pad = 3;
  const canvas = makeCanvas(s.canvas.width + pad * 2 * SS, s.canvas.height + pad * 2 * SS);
  const ctx = canvas.getContext('2d');
  const step = SS * 1.4;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    ctx.drawImage(s.canvas, pad * SS + Math.cos(ang) * step * 1.5, pad * SS + Math.sin(ang) * step * 1.5);
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
  o = { canvas, w: s.w + pad * 2, h: s.h + pad * 2, ax: s.ax + pad, ay: s.ay + pad };
  cache.set(key, o);
  return o;
}
export function clearSpriteCache() { cache.clear(); }
