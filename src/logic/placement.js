// Placement validation (DESIGN §8). Pure: no game object. Returns { ok, code, reason }.
//   validatePlacement({ world, def, tx, ty, player:{x,y}, inventory, blockers?, range? })
// Codes: bounds, terrain, occupied, far, standing, creature, tool, cost, ok.
import { TILE, PLAYER, BUILD } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { NODES } from '../data/structures.js';
import { count, has } from './inventory.js';

const fail = (code, reason) => ({ ok: false, code, reason });
export const OK = Object.freeze({ ok: true, code: 'ok', reason: '' });

/** Circle (player) vs tile rect overlap. */
export function playerOverlapsTile(px, py, tx, ty, r = PLAYER.radius * TILE) {
  const cx = Math.max(tx * TILE, Math.min(px, tx * TILE + TILE)), cy = Math.max(ty * TILE, Math.min(py, ty * TILE + TILE));
  return (px - cx) ** 2 + (py - cy) ** 2 < r * r;
}

/** First missing cost entry -> { item, need, have } or null. */
export function missingCost(inv, cost) {
  for (const c of cost) { const have = count(inv, c.item); if (have < c.n) return { item: c.item, need: c.n - have, have }; }
  return null;
}

export function hasToolClass(inv, classes) {
  for (const a of ['hotbar', 'bag']) for (const s of inv[a] || []) if (s && classes.includes(ITEMS[s.id]?.tool?.class)) return true;
  return false;
}

export function validatePlacement({ world, def, tx, ty, player, inventory, blockers = [], range = BUILD.placeRange }) {
  if (!def) return fail('bounds', 'Unknown structure');
  if (!world.inBounds(tx, ty)) return fail('bounds', 'Out of bounds');
  const terrain = world.terrainAt(tx, ty);
  if (terrain === 'cliff') return fail('terrain', "Can't build on a cliff");
  if (def.requires?.terrain && terrain !== def.requires.terrain) return fail('terrain', def.requires.terrain === 'ice' ? 'Fishing holes go on ice' : `Needs ${def.requires.terrain}`);
  const occ = world.objectAt(tx, ty);
  if (occ && NODES[occ.type]?.kind !== 'decor') return fail('occupied', 'Something is already there');
  if (player) {
    const c = world.tileCenter(tx, ty);
    if (Math.hypot(c.x - player.x, c.y - player.y) / TILE > range + 0.5) return fail('far', 'Too far away');
    if (def.blocks && playerOverlapsTile(player.x, player.y, tx, ty)) return fail('standing', "You're standing there");
  }
  for (const fn of blockers) if (fn(tx, ty)) return fail('creature', 'A creature is in the way');
  if (def.requires?.toolAny && inventory && !hasToolClass(inventory, def.requires.toolAny)) return fail('tool', 'Needs an axe or pickaxe');
  if (inventory) {
    const m = missingCost(inventory, def.cost);
    if (m) return fail('cost', `Need ${m.need} more ${ITEMS[m.item]?.name?.toLowerCase() || m.item}`);
  }
  return OK;
}

export const canAfford = (inv, def) => def.cost.every((c) => has(inv, c.item, c.n));

/** Prospective 4-bit connection mask (N=1,E=2,S=4,W=8) for auto-tiling. `connects(type)` says which neighbours join. */
export const NB_BITS = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
export function connectMask(world, tx, ty, connects) {
  let m = 0;
  for (const [dx, dy, bit] of NB_BITS) { const o = world.objectAt(tx + dx, ty + dy); if (o && connects(o.type)) m |= bit; }
  return m;
}
