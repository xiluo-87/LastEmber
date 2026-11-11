// Pure inventory logic. DOM-free.
//
// An inventory (or any container, e.g. a chest) is plain data: named slot arrays.
//   player inventory: { bag:[16], hotbar:[5], clothing:[3], selected:0 }
//   chest:            { bag:[12] }                      (functions use whichever areas exist)
// A slot is null or a stack: { id:'wood', n:5 }  |  non-stack item: { id:'stone_axe', n:1, dur:60 }
// A slot reference ("ref") is { a:'bag'|'hotbar'|'clothing', i:index }.
import { ITEMS, maxStack, hasDurability } from '../data/items.js';
import { INVENTORY, CLOTHING_SLOTS } from '../data/balance.js';

const emptyArr = (n) => Array.from({ length: n }, () => null);
export const AREAS = ['hotbar', 'bag', 'clothing'];
/** Areas items are auto-placed into (clothing is never auto-filled). */
const STORE_AREAS = ['hotbar', 'bag'];

export function createInventory(opts = {}) {
  return {
    bag: emptyArr(opts.bag ?? INVENTORY.bag),
    hotbar: emptyArr(opts.hotbar ?? INVENTORY.hotbar),
    clothing: emptyArr(opts.clothing ?? INVENTORY.clothing),
    selected: 0,
  };
}
/** A container with just `n` slots (chest). */
export const createContainer = (n) => ({ bag: emptyArr(n) });

export const ref = (a, i) => ({ a, i });
export const getSlot = (inv, r) => inv[r.a]?.[r.i] ?? null;
const setSlot = (inv, r, v) => { inv[r.a][r.i] = v; };
const validRef = (inv, r) => !!r && Array.isArray(inv[r.a]) && r.i >= 0 && r.i < inv[r.a].length;

export function makeStack(id, n = 1, dur) {
  const s = { id, n };
  if (hasDurability(id)) s.dur = dur ?? ITEMS[id].tool.dur;
  return s;
}

function* allSlots(inv, areas = STORE_AREAS) {
  for (const a of areas) if (inv[a]) for (let i = 0; i < inv[a].length; i++) yield { a, i, s: inv[a][i] };
}

/** Preferred area order for placing a NEW stack of `id`: non-stackables (tools) like the hotbar, stackables the bag. */
const placeOrder = (id) => (maxStack(id) === 1 ? ['hotbar', 'bag'] : ['bag', 'hotbar']);

/** How many of `id` could be added (up to n). */
export function canAddCount(inv, id, n = 1) {
  const cap = maxStack(id);
  let room = 0;
  for (const { s } of allSlots(inv)) {
    if (s === null) room += cap;
    else if (s.id === id && cap > 1) room += cap - s.n;
    if (room >= n) return n;
  }
  return Math.min(room, n);
}
export const canAdd = (inv, id, n = 1) => canAddCount(inv, id, n) >= n;

/** Add up to n. Returns the LEFTOVER count that did not fit (0 = all added). `opts.dur` sets durability for tools. */
export function add(inv, id, n = 1, opts = {}) {
  if (!ITEMS[id]) throw new Error(`unknown item "${id}"`);
  const cap = maxStack(id);
  let left = n;
  if (cap > 1) {
    for (const { s } of allSlots(inv, ['hotbar', 'bag'])) {
      if (s && s.id === id && s.n < cap) { const t = Math.min(cap - s.n, left); s.n += t; left -= t; if (!left) return 0; }
    }
  }
  for (const a of placeOrder(id)) {
    if (!inv[a]) continue;
    for (let i = 0; i < inv[a].length && left > 0; i++) {
      if (inv[a][i] !== null) continue;
      const t = Math.min(cap, left);
      inv[a][i] = makeStack(id, t, opts.dur);
      left -= t;
    }
  }
  return left;
}

export function count(inv, id) {
  let c = 0;
  for (const { s } of allSlots(inv, AREAS)) if (s && s.id === id) c += s.n;
  return c;
}
export const has = (inv, id, n = 1) => count(inv, id) >= n;

/** Remove exactly n (all-or-nothing, from bag first then hotbar). Returns true on success. */
export function remove(inv, id, n = 1) {
  if (count(inv, id) < n) return false;
  let left = n;
  for (const a of ['bag', 'hotbar']) {
    if (!inv[a]) continue;
    for (let i = inv[a].length - 1; i >= 0 && left > 0; i--) {
      const s = inv[a][i];
      if (s && s.id === id) { const t = Math.min(s.n, left); s.n -= t; left -= t; if (s.n <= 0) inv[a][i] = null; }
    }
  }
  return true;
}

/** Remove up to n from one slot; returns the removed stack (with dur if any) or null. */
export function removeAt(inv, r, n = Infinity) {
  const s = getSlot(inv, r);
  if (!s) return null;
  const t = Math.min(n, s.n);
  const out = { ...s, n: t };
  if (t >= s.n) setSlot(inv, r, null); else s.n -= t;
  return out;
}

/** Can stack `s` go in slot ref r? (clothing slots only take matching clothing) */
export function accepts(inv, r, s) {
  if (!s) return true;
  if (r.a !== 'clothing') return true;
  return ITEMS[s.id]?.clothing?.slot === CLOTHING_SLOTS[r.i];
}

/** Move `n` (default whole stack) from one slot to another. Merges same item, swaps otherwise. Returns true if anything moved. */
export function move(inv, from, to, n) {
  if (!validRef(inv, from) || !validRef(inv, to)) return false;
  if (from.a === to.a && from.i === to.i) return false;
  const a = getSlot(inv, from), b = getSlot(inv, to);
  if (!a) return false;
  const amt = Math.min(n ?? a.n, a.n);
  if (b && b.id === a.id && maxStack(a.id) > 1 && accepts(inv, to, a)) { // merge
    const t = Math.min(amt, maxStack(a.id) - b.n);
    if (t <= 0) return false;
    b.n += t; a.n -= t; if (a.n <= 0) setSlot(inv, from, null);
    return true;
  }
  if (!b) { // plain move / split
    if (!accepts(inv, to, a)) return false;
    if (amt >= a.n) { setSlot(inv, to, a); setSlot(inv, from, null); } else { a.n -= amt; setSlot(inv, to, { ...a, n: amt }); }
    return true;
  }
  if (amt < a.n) return false; // can't split onto a different item
  return swap(inv, from, to);
}

/** Swap two slots (respecting clothing restrictions). */
export function swap(inv, r1, r2) {
  if (!validRef(inv, r1) || !validRef(inv, r2)) return false;
  const a = getSlot(inv, r1), b = getSlot(inv, r2);
  if (!accepts(inv, r2, a) || !accepts(inv, r1, b)) return false;
  setSlot(inv, r1, b); setSlot(inv, r2, a);
  return true;
}

/** Equip clothing from `from` into its matching clothing slot (swapping the old piece back). */
export function equip(inv, from) {
  const s = getSlot(inv, from);
  const slot = s && ITEMS[s.id]?.clothing?.slot;
  if (!slot) return false;
  return swap(inv, from, ref('clothing', CLOTHING_SLOTS.indexOf(slot)));
}

export function selectedStack(inv) { return inv.hotbar[inv.selected] ?? null; }
export function selectHotbar(inv, i) { if (i >= 0 && i < inv.hotbar.length) { inv.selected = i; return true; } return false; }

/** Sum of equipped insulation (degC). */
export function insulation(inv) {
  let t = 0;
  for (const s of inv.clothing) if (s) t += ITEMS[s.id]?.clothing?.insulation ?? 0;
  return t;
}

/** Reduce durability of a slot's item. Returns 'broken' (slot cleared), 'ok', or null if no durability. */
export function wear(inv, r, amount = 1) {
  const s = getSlot(inv, r);
  if (!s || s.dur === undefined) return null;
  s.dur -= amount;
  if (s.dur <= 0) { setSlot(inv, r, null); return 'broken'; }
  return 'ok';
}

/** Can all `needs` [{item,n}] be taken? */
export const hasAll = (inv, needs) => needs.every((x) => has(inv, x.item, x.n));
/** Remove all `needs` atomically. */
export function removeAll(inv, needs) {
  if (!hasAll(inv, needs)) return false;
  for (const x of needs) remove(inv, x.item, x.n);
  return true;
}
