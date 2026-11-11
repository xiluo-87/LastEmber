// Thin adapter between creatures/combat and the world/building systems. Creature code NEVER touches structures directly: it asks here.
// Prefers the Building API (`game.building`, ARCHITECTURE §18) and falls back to the world API + data/structures.js flags so the
// creature systems also run when the building system is absent (unit tests, early builds).
import { TILE } from '../data/balance.js';
import { STRUCTURES } from '../data/structures.js';

const isFn = (f) => typeof f === 'function';

/** Is the tile impassable for creatures (cliff, trees, walls, doors, ...)? */
export function isBlockedForCreature(game, tx, ty) { return game.world.isBlocked(tx, ty, { creature: true }); }

/** The player-built structure object on a tile (not nodes) or null. */
export function structureAt(game, tx, ty) {
  const b = game.building;
  if (b && isFn(b.structureAt)) return b.structureAt(game, tx, ty) || null;
  const o = game.world.objectAt(tx, ty);
  return o && STRUCTURES[o.type] ? o : null;
}

/** Does this tile hold a structure that blocks creatures (and so can be chewed through)? */
export function blockingStructure(game, tx, ty) {
  const o = structureAt(game, tx, ty), d = o && STRUCTURES[o.type];
  return d && (d.blocks || d.blocksCreatures) && (d.hp || 0) > 0 ? o : null;
}

/** Lit fire sources: copies into `out` ([{x,y,r}] reused objects, r in tiles) and returns the count. */
export function litFires(game, out) {
  let n = 0;
  const b = game.building;
  if (b && isFn(b.litFires)) {
    for (const f of b.litFires(game)) { const o = out[n] || (out[n] = { x: 0, y: 0, r: 0, post: false }); o.x = f.x; o.y = f.y; o.r = f.radius; o.post = f.type === 'torch_post'; n++; }
    return n;
  }
  game.world.forEachObject((obj) => {
    const d = STRUCTURES[obj.type];
    if (!d || !d.light) return;
    const lit = obj.lit === true || (obj.lit === undefined && (obj.fuel ?? 0) > 0);
    if (!lit) return;
    const o = out[n] || (out[n] = { x: 0, y: 0, r: 0, post: false });
    o.x = obj.tx * TILE + TILE / 2; o.y = obj.ty * TILE + TILE / 2; o.r = d.light.radius; o.post = obj.type === 'torch_post'; n++;
  });
  return n;
}

/** Damage a structure (wolves/bears chewing through walls). Returns {hp, destroyed} | null. */
export function hitStructure(game, tx, ty, amount, source = 'wolf') {
  const b = game.building;
  if (b && isFn(b.damageStructure)) return b.damageStructure(game, tx, ty, amount, source);
  const o = structureAt(game, tx, ty);
  if (!o) return null;
  const d = STRUCTURES[o.type];
  if (!d || !(d.hp > 0)) return null;
  o.hp = (o.hp ?? d.hp) - amount;
  const destroyed = o.hp <= 0;
  game.events.emit('structure:damaged', { type: o.type, tx, ty, amount, hp: Math.max(0, o.hp), source });
  if (destroyed) { game.world.removeObject(tx, ty); game.events.emit('structure:destroyed', { type: o.type, tx, ty, source }); }
  return { hp: Math.max(0, o.hp), destroyed };
}

/** Contact damage per second of a spike barricade on this tile (0 if none). */
export function spikesAt(game, tx, ty) {
  const b = game.building;
  if (b && isFn(b.spikesAt)) return b.spikesAt(game, tx, ty) || 0;
  const o = game.world.objectAt(tx, ty), d = o && STRUCTURES[o.type];
  return d && d.extra && d.extra.contactDps ? d.extra.contactDps : 0;
}
