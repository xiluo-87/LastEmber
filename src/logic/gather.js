// Pure gathering rules (DESIGN §3, §6). DOM-free. The gather system (systems/gather.js) wires these to the world/inventory.
//
//   planHit(nodeDef, toolStack)          -> { mode:'direct'|'tool'|'hands'|'none', dmg, hp, drops, field }
//   applyHit(obj, nodeDef, toolStack, o) -> { ok, reason?, mode, dmg, completed, depleted, drops, wear }
//   rollDrops(drops, rand)               -> [{item,n}]
//
// Modes: 'tool'   = the node's required tool class is equipped: dmg = tool.dmg * tool.mult[node] vs gather.hp, full drops.
//        'hands'  = wrong/no tool on a node that has handDrops: HANDS dmg vs gather.handHp, handDrops, limited per node.
//        'direct' = node needs no tool (bushes, herbs): HANDS dmg vs gather.hp.
import { HANDS, ITEMS } from '../data/items.js';
import { GATHER } from '../data/balance.js';

const toolDefOf = (stack) => (stack ? ITEMS[stack.id]?.tool || null : null);

export function planHit(nodeDef, toolStack) {
  const g = nodeDef?.gather;
  if (!g) return { mode: 'none' };
  const t = toolDefOf(toolStack);
  if (!g.tool) return { mode: 'direct', dmg: HANDS.tool.dmg, hp: g.hp, drops: g.drops, field: 'hp' };
  if (t && t.class === g.tool) return { mode: 'tool', dmg: t.dmg * (t.mult?.[nodeDef.id] ?? 1), hp: g.hp, drops: g.drops, field: 'hp' };
  if (g.handDrops) return { mode: 'hands', dmg: HANDS.tool.dmg, hp: g.handHp, drops: g.handDrops, field: 'hh' };
  return { mode: 'none' };
}

export function rollDrops(drops = [], rand = Math.random) {
  const out = new Map();
  for (const d of drops) {
    if (d.chance !== undefined && rand() >= d.chance) continue;
    const [lo, hi] = Array.isArray(d.n) ? d.n : [d.n, d.n];
    const n = lo + Math.floor(rand() * (hi - lo + 1));
    if (n > 0) out.set(d.item, (out.get(d.item) || 0) + n);
  }
  return [...out].map(([item, n]) => ({ item, n }));
}

/** How many bare-hand harvests this node allows. */
export const handMax = (nodeDef) => nodeDef?.gather?.handMax ?? GATHER.handMaxPerTree;

/**
 * Apply one hit to node `obj` (mutates obj.hp / obj.hh / obj.hn). `opts.rand` (default Math.random), `opts.canFit(drops)->bool`.
 * If the finishing hit would overflow the bag (`canFit` false) NOTHING changes and { ok:false, reason:'full' } is returned.
 */
export function applyHit(obj, nodeDef, toolStack, opts = {}) {
  const rand = opts.rand || Math.random, canFit = opts.canFit || (() => true);
  const plan = planHit(nodeDef, toolStack);
  if (plan.mode === 'none') return { ok: false, reason: 'none' };
  if (plan.mode === 'hands' && (obj.hn || 0) >= handMax(nodeDef)) return { ok: false, reason: 'bare' };
  const cur = obj[plan.field] ?? plan.hp;
  const left = cur - plan.dmg;
  const base = { ok: true, mode: plan.mode, dmg: plan.dmg, completed: false, depleted: false, drops: [], wear: plan.mode === 'tool' ? GATHER.durPerHit : 0 };
  if (left > 0) { obj[plan.field] = left; return base; }
  const drops = rollDrops(plan.drops, rand);
  if (!canFit(drops)) return { ok: false, reason: 'full' };
  base.completed = true; base.drops = drops;
  if (plan.mode === 'hands') { obj.hh = plan.hp; obj.hn = (obj.hn || 0) + 1; }
  else { obj.hp = 0; base.depleted = true; }
  return base;
}

/** Items a lootable POI hands out: its `loot` list plus its radio `part` (if any). */
export function lootItems(obj) {
  const out = (obj.loot || []).map((l) => ({ item: l.item, n: l.n }));
  if (obj.part && !obj.partTaken) out.push({ item: obj.part, n: 1 });
  return out;
}
