// Gathering feedback visuals: node shake (via per-type object drawers), chips, floating "+2 wood" text, dropped-item icons.
// Runtime state lives on `game.gatherFx` (not saved): { shake:Map<tileIndex,t>, floats:[], chips:[] }.
import { registerObjectDrawer, spriteKeyFor } from './objects.js';
import { drawSprite } from './sprites.js';
import { itemIcon } from './icons.js';
import { GATHER } from '../data/balance.js';

export const createGatherFx = () => ({ shake: new Map(), floats: [], chips: [] });

export function shakeNode(game, tx, ty) { game.gatherFx.shake.set(ty * game.world.w + tx, GATHER.shakeSeconds); }

export function floatText(game, x, y, text, color = '#f4f1de') {
  game.gatherFx.floats.push({ x, y, text, color, t: 0 });
  if (game.gatherFx.floats.length > 12) game.gatherFx.floats.shift();
}

export function chipBurst(game, x, y, color, n = GATHER.chips) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 50;
    game.gatherFx.chips.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 40, t: 0, life: 0.45 + Math.random() * 0.2, color, s: 1.5 + Math.random() * 1.5 });
  }
}

export function updateGatherFx(game, dt) {
  const fx = game.gatherFx;
  for (const [k, t] of fx.shake) { if (t - dt <= 0) fx.shake.delete(k); else fx.shake.set(k, t - dt); }
  for (const f of fx.floats) f.t += dt;
  fx.floats = fx.floats.filter((f) => f.t < GATHER.floatSeconds);
  for (const c of fx.chips) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 220 * dt; }
  fx.chips = fx.chips.filter((c) => c.t < c.life);
}

export function drawChips(game, ctx) {
  for (const c of game.gatherFx.chips) {
    ctx.globalAlpha = Math.max(0, 1 - c.t / c.life); ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.s, c.s);
  }
  ctx.globalAlpha = 1;
}

export function drawFloats(game, ctx) {
  if (!game.renderer) return;
  ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 15px system-ui, sans-serif'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
  for (const f of game.gatherFx.floats) {
    const k = f.t / GATHER.floatSeconds, s = game.renderer.worldToScreen(f.x, f.y - 14 - k * 26);
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.strokeStyle = 'rgba(8,14,20,0.85)'; ctx.strokeText(f.text, s.x, s.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, s.x, s.y);
  }
  ctx.restore();
}

const SHAKEABLE = ['tree', 'dead_bush', 'rock_node', 'iron_node', 'coal_node', 'berry_bush', 'herb'];
for (const type of SHAKEABLE) {
  registerObjectDrawer(type, (ctx, obj, x, y, game, time) => {
    const t = game?.gatherFx?.shake.get(obj.ty * game.world.w + obj.tx);
    const dx = t ? Math.sin(t * 70) * GATHER.shakePx * (t / GATHER.shakeSeconds) : 0;
    drawSprite(ctx, spriteKeyFor(obj), obj.variant || 0, x + dx, y);
  });
}

// Items lying on the ground (dropped from the bag): shadow + the item's icon, gently bobbing.
registerObjectDrawer('dropped_item', (ctx, obj, x, y, game, time) => {
  const bob = Math.sin((time || 0) * 3 + obj.tx) * 1.2;
  ctx.fillStyle = 'rgba(70,88,115,0.35)'; ctx.beginPath(); ctx.ellipse(x, y - 1, 9, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  const s = 24; ctx.drawImage(itemIcon(obj.stack?.id), x - s / 2, y - s + 2 + bob, s, s);
});
