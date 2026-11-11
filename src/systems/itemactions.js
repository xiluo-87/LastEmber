// Item actions used by the Use button / F key and the Bag panel. DOM-free (takes `game`).
//   useStack(game, ref)            eat / drink / bandage / equip clothing / put tool in hand      -> bool
//   useSelected(game)              Use button / F on the selected hotbar slot
//   equipToHotbar(game, ref)       move a bag item to a hotbar slot and select it
//   unequip(game, ref)             clothing slot -> bag
//   dropStack(game, ref, n?)       drop onto a free tile near the player as a 'dropped_item' ground pickup -> bool
//   pickupDropped(game, obj)       take a dropped stack back (partial if the bag is nearly full)
//   eatSnow(game)                  DESIGN §5: +8 thirst, -10 warmth
//   wearHeld(game, n=1)            wear the selected hotbar tool (breaks at 0 with a toast + 'tool:broken'); combat uses this per hit
//   heldTorch(game)                the selected hotbar stack if it is a torch with burn left, else null
import * as inv from '../logic/inventory.js';
import { ITEMS } from '../data/items.js';
import { ITEM_USE, GATHER } from '../data/balance.js';
import { planUse } from '../logic/use.js';
import { restoreStat, applyEffect, clearEffect, hasEffect, eatSnow as vitalEatSnow } from './vitals.js';
import { floatText } from '../render/gatherfx.js';

const toast = (game, msg, kind) => game.ui.toast?.(msg, kind);
const STAT_NAME = { hunger: 'hunger', thirst: 'thirst', warmth: 'warmth', health: 'health' };

export function heldTorch(game) {
  const s = inv.selectedStack(game.state.inventory);
  return s && s.id === 'torch' && (s.burn ?? ITEMS.torch.tool.burn) > 0 ? s : null;
}

export function useStack(game, r) {
  const st = game.state.inventory, s = inv.getSlot(st, r);
  if (!s) return false;
  const def = ITEMS[s.id];
  const plan = planUse(s.id, game.state.player);
  if (plan.kind === 'equip') {
    if (r.a === 'clothing') return unequip(game, r);
    if (!inv.equip(st, r)) return false;
    toast(game, `Equipped ${def.name}`, 'good'); return true;
  }
  if (def.tool || def.kind === 'weapon') {
    if (r.a === 'hotbar') { inv.selectHotbar(st, r.i); game.events.emit('hotbar:changed', { index: r.i }); toast(game, def.tool?.class === 'torch' ? 'Torch burns while held' : 'Ready - use Action to swing', 'info'); return true; }
    return equipToHotbar(game, r);
  }
  if (plan.refuse) { toast(game, plan.refuse, 'info'); return false; }
  const msgs = [];
  for (const [stat, n] of Object.entries(plan.restore)) { restoreStat(game, stat, n); msgs.push(`+${n} ${STAT_NAME[stat]}`); }
  if (plan.cures && hasEffect(game, plan.cures)) { clearEffect(game, plan.cures); msgs.push(plan.cures === 'bleeding' ? 'bleeding stopped' : 'sickness cured'); }
  if (plan.poison && Math.random() < plan.poison) applyEffect(game, 'poison'); // survival shows its own toast/chip
  inv.removeAt(st, r, 1);
  toast(game, msgs.join(', ') || `Used ${def.name}`, 'good');
  game.events.emit('item:used', { id: s.id });
  return true;
}

export function useSelected(game) {
  const st = game.state.inventory;
  if (!inv.getSlot(st, inv.ref('hotbar', st.selected))) { toast(game, 'Nothing selected', 'info'); return false; }
  return useStack(game, inv.ref('hotbar', st.selected));
}

export function equipToHotbar(game, r) {
  const st = game.state.inventory, s = inv.getSlot(st, r);
  if (!s) return false;
  if (r.a === 'hotbar') { inv.selectHotbar(st, r.i); return true; }
  let i = st.hotbar.findIndex((x) => x === null);
  if (i < 0) i = st.selected;
  if (!inv.move(st, r, inv.ref('hotbar', i))) return false;
  inv.selectHotbar(st, i); game.events.emit('hotbar:changed', { index: i });
  toast(game, `${ITEMS[st.hotbar[i].id].name} in hand`, 'good');
  return true;
}

export function unequip(game, r) {
  const st = game.state.inventory, s = inv.getSlot(st, r);
  if (!s) return false;
  const free = st.bag.findIndex((x) => x === null);
  if (free < 0) { toast(game, 'Bag full', 'bad'); return false; }
  inv.move(st, r, inv.ref('bag', free));
  return true;
}

/** Free tile for a ground drop: prefers the tile in front of the player, then spirals outward. */
export function findDropTile(game) {
  const w = game.world, p = game.state.player, { tx: ptx, ty: pty } = w.worldToTile(p.x, p.y);
  const fx = Math.round(Math.cos(p.facing)), fy = Math.round(Math.sin(p.facing));
  const cands = [];
  for (let dy = -GATHER.dropSearchRadius; dy <= GATHER.dropSearchRadius; dy++) for (let dx = -GATHER.dropSearchRadius; dx <= GATHER.dropSearchRadius; dx++) {
    const tx = ptx + dx, ty = pty + dy;
    if (!w.inBounds(tx, ty) || w.objectAt(tx, ty) || w.isBlocked(tx, ty)) continue;
    cands.push({ tx, ty, score: Math.hypot(dx - fx, dy - fy) + Math.hypot(dx, dy) * 0.25 });
  }
  cands.sort((a, b) => a.score - b.score);
  return cands[0] || null;
}

export function dropStack(game, r, n = Infinity) {
  const st = game.state.inventory, s = inv.getSlot(st, r);
  if (!s) return false;
  const tile = findDropTile(game);
  if (!tile) { toast(game, 'No room to drop here', 'bad'); return false; }
  const stack = inv.removeAt(st, r, n);
  game.world.setObject(tile.tx, tile.ty, { type: 'dropped_item', variant: 0, stack });
  toast(game, `Dropped ${ITEMS[stack.id].name}${stack.n > 1 ? ` x${stack.n}` : ''}`, 'info');
  return true;
}

export function pickupDropped(game, obj) {
  const st = game.state.inventory, s = obj.stack;
  if (!s) { game.world.removeObject(obj.tx, obj.ty); return true; }
  const left = inv.add(st, s.id, s.n, { dur: s.dur });
  const got = s.n - left;
  if (got <= 0) { toast(game, 'Bag full', 'bad'); return false; }
  if (s.burn !== undefined) { const t = [...st.hotbar, ...st.bag].find((x) => x && x.id === s.id && x.burn === undefined); if (t) t.burn = s.burn; }
  if (left > 0) { s.n = left; toast(game, 'Bag full - took some', 'bad'); } else game.world.removeObject(obj.tx, obj.ty);
  const c = game.world.tileCenter(obj.tx, obj.ty);
  floatText(game, c.x, c.y, `+${got} ${ITEMS[s.id].name.toLowerCase()}`);
  return true;
}

export function eatSnow(game) {
  const p = game.state.player;
  if (p.thirst >= 100) { toast(game, 'Not thirsty', 'info'); return false; }
  vitalEatSnow(game);
  toast(game, `+${ITEM_USE.eatSnow.thirst} thirst, ${ITEM_USE.eatSnow.warmth} warmth`, 'info');
  return true;
}

/** Wear the tool in hand by `amount`; returns 'ok' | 'broken' | null (no durability). */
export function wearHeld(game, amount = 1) {
  const st = game.state.inventory, r = inv.ref('hotbar', st.selected), s = inv.getSlot(st, r);
  if (!s) return null;
  const id = s.id, res = inv.wear(st, r, amount);
  if (res === 'broken') { toast(game, `Your ${ITEMS[id].name.toLowerCase()} broke!`, 'bad'); game.events.emit('tool:broken', { id }); }
  return res;
}
