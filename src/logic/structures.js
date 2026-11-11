// Pure structure behaviour rules (fuel, drying rack, snare, fishing, repair, refund, chest transfer). No game object, no DOM.
import { BUILDING, FIRE } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { STRUCTURES } from '../data/structures.js';
import { createContainer, has, remove, count } from './inventory.js';
import { maxStack } from '../data/items.js';

export const maxHp = (def) => def.hp || 0;

/** Fresh world object for a structure type. */
export function newStructure(type) {
  const def = STRUCTURES[type], o = { type, hp: def.hp };
  if (def.fuel) { o.fuel = 0; o.lit = false; o.everLit = false; }
  if (type === 'torch_post') { o.fuel = def.fuel.max; o.lit = true; o.everLit = true; }
  if (def.storage) o.inv = createContainer(def.storage);
  if (def.process) o.slots = Array.from({ length: def.process.slots }, () => null);
  if (type === 'snare') o.caught = false;
  return o;
}

// ---- fuel ----
/** Seconds of burn one `itemId` gives this structure (0 = not accepted). */
export function fuelSeconds(type, itemId) {
  const def = STRUCTURES[type];
  if (!def?.fuel || !def.fuel.accepts.includes(itemId)) return 0;
  if (type === 'torch_post') return BUILDING.torchPostFuel[itemId] || 0;
  return ITEMS[itemId]?.fuel || FIRE.fuel[itemId] || 0;
}
/** Add one item of fuel to the object (the caller removes it from the inventory). -> { ok, added, reason } */
export function addFuel(obj, itemId) {
  const def = STRUCTURES[obj.type], s = fuelSeconds(obj.type, itemId);
  if (!s) return { ok: false, added: 0, reason: 'It will not burn that' };
  if (obj.fuel + s > def.fuel.max + 1e-6) return { ok: false, added: 0, reason: 'Already full' };
  obj.fuel += s;
  return { ok: true, added: s };
}
/** Ignite. Campfire needs flint (not consumed) the first time; a fire that has burned before relights from its embers. */
export function tryLight(obj, inv) {
  const def = STRUCTURES[obj.type];
  if (obj.lit) return { ok: false, reason: 'Already burning' };
  if (!(obj.fuel > 0)) return { ok: false, reason: 'Add fuel first' };
  if (def.needsFlint && !obj.everLit && !has(inv, 'flint', 1)) return { ok: false, reason: 'You need flint to light it' };
  obj.lit = true; obj.everLit = true;
  return { ok: true };
}
/** After adding fuel: fires that may relight themselves do so (furnace, torch post, campfire with embers). */
export function autoLight(obj) {
  const def = STRUCTURES[obj.type];
  if (obj.lit || !(obj.fuel > 0)) return false;
  if (def.needsFlint && !obj.everLit) return false;
  obj.lit = true; obj.everLit = true; return true;
}
/** Burn `dt` game-seconds (x mult). -> 'out' when it just ran dry, else null. */
export function burnFuel(obj, dt, mult = 1) {
  if (!obj.lit) return null;
  obj.fuel -= dt * mult;
  if (obj.fuel <= 0) { obj.fuel = 0; obj.lit = false; return 'out'; }
  return null;
}

// ---- drying rack ----
export function rackLoad(obj) {
  const i = obj.slots.findIndex((s) => !s);
  if (i < 0) return false;
  obj.slots[i] = { t: 0, done: false }; return true;
}
export function rackTick(obj, dt) {
  const secs = STRUCTURES.drying_rack.process.seconds;
  for (const s of obj.slots) if (s && !s.done) { s.t += dt; if (s.t >= secs) { s.t = secs; s.done = true; } }
}
/** Take every finished piece. -> count */
export function rackCollect(obj) {
  let n = 0;
  obj.slots.forEach((s, i) => { if (s?.done) { obj.slots[i] = null; n++; } });
  return n;
}
export const rackCount = (obj) => obj.slots.filter(Boolean).length;
export const rackDone = (obj) => obj.slots.filter((s) => s?.done).length;

// ---- snare ----
/** Dawn roll. `nearFire`: a lit fire is closer than minFireDist. rand in [0,1). -> true if the snare now holds a catch */
export function snareRoll(obj, nearFire, rand) {
  if (obj.caught || nearFire) return false;
  if (rand < STRUCTURES.snare.extra.dawnChance) { obj.caught = true; return true; }
  return false;
}

// ---- fishing ----
/** One roll in [0,1): 'fish' (55%), 'snap' (8%), else 'nothing'. */
export function fishingRoll(rand) {
  const e = STRUCTURES.fishing_hole.extra;
  return rand < e.catchChance ? 'fish' : rand < e.catchChance + e.snapChance ? 'snap' : 'nothing';
}

// ---- damage / repair / refund ----
export function applyDamage(obj, amount) {
  const def = STRUCTURES[obj.type];
  if (!def || !def.hp || !(amount > 0)) return null;
  obj.hp = Math.max(0, (obj.hp ?? def.hp) - amount);
  return { hp: obj.hp, destroyed: obj.hp <= 0 };
}
/** Repair with one unit of the matching material (+50% of max hp). -> { ok, reason, item } */
export function repairOnce(obj, inv) {
  const def = STRUCTURES[obj.type], mat = BUILDING.repairMaterial[obj.type];
  if (!def?.hp || !mat) return { ok: false, reason: 'Cannot be repaired' };
  if ((obj.hp ?? def.hp) >= def.hp) return { ok: false, reason: 'Not damaged' };
  if (!remove(inv, mat, 1)) return { ok: false, reason: `Needs ${ITEMS[mat].name.toLowerCase()} to repair`, item: mat };
  obj.hp = Math.min(def.hp, (obj.hp ?? 0) + def.hp * 0.5);
  return { ok: true, item: mat };
}
export const repairItem = (type) => BUILDING.repairMaterial[type];
/** 50% refund of the build cost (rounded down per item). */
export function refundFor(def, frac = 0.5) {
  return def.cost.map((c) => ({ item: c.item, n: Math.floor(c.n * frac) })).filter((c) => c.n > 0);
}

// ---- chest transfer ----
/** Move the stack at `src[area][i]` into container `dst` (areas tried in order). Stackables merge first. Returns moved count. */
export function transferStack(src, area, i, dst, dstAreas = ['bag', 'hotbar']) {
  const s = src[area]?.[i];
  if (!s) return 0;
  const cap = maxStack(s.id);
  let left = s.n;
  if (cap > 1) {
    for (const a of dstAreas) for (const d of dst[a] || []) {
      if (d && d.id === s.id && d.n < cap && left > 0) { const t = Math.min(cap - d.n, left); d.n += t; left -= t; }
    }
  }
  for (const a of dstAreas) {
    const arr = dst[a]; if (!arr) continue;
    for (let k = 0; k < arr.length && left > 0; k++) {
      if (arr[k]) continue;
      const t = Math.min(cap, left);
      arr[k] = { ...s, n: t }; left -= t;
    }
  }
  const moved = s.n - left;
  if (left <= 0) src[area][i] = null; else s.n = left;
  return moved;
}
export { count as countItem };
