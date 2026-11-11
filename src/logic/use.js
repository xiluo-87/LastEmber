// Pure item-use planning (DESIGN §6). Decides what using one unit of an item would do; the items system applies it.
//   planUse(itemId, player) -> { kind:'eat'|'drink'|'heal'|'equip'|'none', restore:{hunger?,thirst?,warmth?,health?},
//                                poison:0..1, cures:'bleeding'|'poison'|null, refuse:string|null }
import { ITEMS } from '../data/items.js';
import { SURVIVAL } from '../data/balance.js';

const STATS = ['hunger', 'thirst', 'warmth', 'health'];

export function planUse(itemId, player) {
  const it = ITEMS[itemId];
  const none = { kind: 'none', restore: {}, poison: 0, cures: null, refuse: null };
  if (!it) return none;
  if (it.clothing) return { ...none, kind: 'equip' };
  const f = it.food;
  if (!f) return { ...none, refuse: it.tool ? 'Select it in the hotbar to use it' : 'Nothing to do with that' };
  const restore = {};
  for (const k of STATS) if (f[k]) restore[k] = f[k];
  const kind = it.kind === 'medical' ? 'heal' : it.kind === 'drink' ? 'drink' : 'eat';
  const status = player.status || {};
  const cureApplies = f.cures && status[f.cures === 'poison' ? 'food_poisoning' : f.cures];
  const helps = STATS.some((k) => f[k] > 0 && (player[k] ?? 0) < SURVIVAL.max) || cureApplies;
  const refuse = helps ? null : kind === 'drink' ? 'Not thirsty' : kind === 'heal' ? 'No need' : 'Not hungry';
  return { kind, restore, poison: f.poison || 0, cures: f.cures || null, refuse };
}
