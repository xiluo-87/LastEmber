// Gathering (DESIGN §3, §6): resource nodes, loose pickups, crates/wreckage, berry regrow, hit feedback.
// Pure rules are in logic/gather.js; this wires them to the world, inventory, interaction registry and FX.
//   events: 'gather:hit' {obj,def,res}  'gather:harvest' {obj,def,drops}  'gather:depleted' {tx,ty,type}
//           'loot:opened' {obj,items}   'radio:partFound' {part,tx,ty}   'tool:broken' {id}
//   state slice `gather`: { regrow:[{tx,ty,at}] }  (at = absolute play-seconds: (day-1)*dayLength + t)
import { TIME, SWING } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { NODES } from '../data/structures.js';
import { noteWork } from './vitals.js';
import { wearHeld } from './itemactions.js';
import * as inv from '../logic/inventory.js';
import { applyHit, planHit, lootItems, handMax } from '../logic/gather.js';
import { createGatherFx, shakeNode, floatText, chipBurst, updateGatherFx, drawChips, drawFloats } from '../render/gatherfx.js';

const NODE_TYPES = ['tree', 'dead_bush', 'rock_node', 'iron_node', 'coal_node', 'berry_bush', 'herb'];
const CHIP_COLOR = { tree: '#a9744a', dead_bush: '#a9744a', rock_node: '#9aa5b1', iron_node: '#c8794f', coal_node: '#3b4a5a', berry_bush: '#c0394f', herb: '#59a96a' };
const TOOL_NAME = { axe: 'an axe', pickaxe: 'a pickaxe' };
const absTime = (st) => (st.time.day - 1) * TIME.dayLength + st.time.t;
const nm = (id) => ITEMS[id]?.name || id;

/** Would all `drops` fit in the bag right now? (simulated on a copy) */
export function dropsFit(inventory, drops) {
  const sim = JSON.parse(JSON.stringify(inventory));
  return drops.every((d) => inv.add(sim, d.item, d.n) === 0);
}

function award(game, drops, x, y) {
  let i = 0;
  for (const d of drops) {
    const left = inv.add(game.state.inventory, d.item, d.n);
    const got = d.n - left;
    if (got > 0) floatText(game, x, y - i++ * 14, `+${got} ${nm(d.item).toLowerCase()}`, '#ffe9a8');
  }
}

let lastNeedToastT = -9;
function needToast(game, msg) {
  if (game.time - lastNeedToastT < 1.2) return;
  lastNeedToastT = game.time; game.ui.toast?.(msg, 'info');
}

function depleteNode(game, obj, def) {
  const g = def.gather, { tx, ty } = obj;
  game.events.emit('gather:depleted', { tx, ty, type: obj.type });
  if (g.regrowDays) {
    obj.depleted = true;
    game.state.gather.regrow.push({ tx, ty, at: absTime(game.state) + g.regrowDays * TIME.dayLength });
  } else if (g.becomes) game.world.setObject(tx, ty, { type: g.becomes, variant: Math.floor(Math.random() * (NODES[g.becomes].variants || 1)) });
  else game.world.removeObject(tx, ty);
}

/** One hit on the node under `target` with whatever is in hand. */
function hitNode(game, target) {
  const obj = game.world.objectAt(target.tx, target.ty);
  if (!obj || obj.depleted) return;
  const def = NODES[obj.type], tool = inv.selectedStack(game.state.inventory);
  const res = applyHit(obj, def, tool, { canFit: (d) => dropsFit(game.state.inventory, d) });
  const cx = target.x, cy = target.y;
  if (!res.ok) {
    if (res.reason === 'full') game.ui.toast?.('Bag full', 'bad');
    else if (res.reason === 'bare') needToast(game, `Nothing left by hand - needs ${TOOL_NAME[def.gather.tool] || 'a tool'}`);
    return;
  }
  noteWork(game);
  shakeNode(game, obj.tx, obj.ty);
  chipBurst(game, cx, cy + 4, CHIP_COLOR[obj.type] || '#ccc');
  game.events.emit('gather:hit', { obj, def, res });
  if (res.wear) wearHeld(game, res.wear);
  if (res.completed) {
    award(game, res.drops, cx, cy - 10);
    game.events.emit('gather:harvest', { obj, def, drops: res.drops });
    if (res.depleted) depleteNode(game, obj, def);
  }
}

function nodeLabel(game, target) {
  const def = target.def, plan = planHit(def, inv.selectedStack(game.state.inventory));
  if (plan.mode === 'tool' || plan.mode === 'direct') return def.verb;
  if (plan.mode === 'hands') return (target.obj.hn || 0) >= handMax(def) ? `Need ${def.gather.tool}` : def.id === 'tree' ? 'Pull sticks' : 'Gather';
  return `Need ${def.gather.tool}`;
}

function openLoot(game, target) {
  const obj = target.obj, items = lootItems(obj);
  if (!items.length) { obj.depleted = true; return false; }
  const given = [], rest = [];
  for (const it of items) {
    const left = inv.add(game.state.inventory, it.item, it.n);
    if (it.n - left > 0) given.push({ item: it.item, n: it.n - left });
    if (left > 0) rest.push({ item: it.item, n: left });
  }
  if (!given.length) { game.ui.toast?.('Bag full', 'bad'); return false; }
  if (obj.part && given.some((g) => g.item === obj.part)) {
    obj.partTaken = true;
    (game.state.flags.partsFound ||= {})[obj.part] = true;
    game.events.emit('radio:partFound', { part: obj.part, tx: obj.tx, ty: obj.ty });
    game.ui.toast?.(`Found: ${nm(obj.part)}!`, 'good', 4000);
  }
  obj.loot = rest.filter((r) => r.item !== obj.part);
  if (!rest.length) obj.depleted = true;
  else game.ui.toast?.('Bag full - some items left behind', 'bad');
  let i = 0; for (const g of given) floatText(game, target.x, target.y - 12 - i++ * 14, `+${g.n} ${nm(g.item).toLowerCase()}`, '#ffe9a8');
  game.ui.toast?.(`Took ${given.map((g) => `${g.n} ${nm(g.item).toLowerCase()}`).join(', ')}`, 'good');
  game.events.emit('loot:opened', { obj, items: given });
  return true;
}

export default {
  name: 'gather',
  defaults: () => ({ regrow: [] }),
  init(game) {
    game.gatherFx = createGatherFx();
    const R = game.interactions;
    R.register(NODE_TYPES, {
      repeat: true,
      label: nodeLabel,
      onAction(g, target, api) {
        const plan = planHit(target.def, inv.selectedStack(g.state.inventory));
        if (plan.mode === 'none' || (plan.mode === 'hands' && (target.obj.hn || 0) >= handMax(target.def))) {
          needToast(g, `Needs ${TOOL_NAME[target.def.gather.tool] || 'a tool'}`);
          return true; // short cooldown, no swing
        }
        return api.swing(() => hitNode(g, target));
      },
    });
    R.register(['loose_stone', 'loose_stick'], {
      label: () => 'Take', cooldown: SWING.pickupCooldown,
      onAction(g, target) {
        const p = target.def.pickup, left = inv.add(g.state.inventory, p.item, p.n);
        if (left >= p.n) { g.ui.toast?.('Bag full', 'bad'); return false; }
        g.world.removeObject(target.tx, target.ty);
        floatText(g, target.x, target.y - 8, `+${p.n - left} ${nm(p.item).toLowerCase()}`, '#ffe9a8');
        g.events.emit('gather:harvest', { obj: target.obj, def: target.def, drops: [{ item: p.item, n: p.n }] });
      },
    });
    R.register(['crash_site', 'wreckage'], { cooldown: SWING.openCooldown, onAction: openLoot });
  },
  onLoad(game) { game.gatherFx = createGatherFx(); },
  update(game, dt) {
    updateGatherFx(game, dt);
    const st = game.state, list = st.gather.regrow;
    if (!list.length) return;
    const now = absTime(st);
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (now < r.at) continue;
      list.splice(i, 1);
      const obj = game.world.objectAt(r.tx, r.ty);
      if (obj && obj.depleted) { obj.depleted = false; delete obj.hp; delete obj.hh; delete obj.hn; game.events.emit('world:objectChanged', { tx: r.tx, ty: r.ty, obj, prev: obj }); }
    }
  },
  drawFx(game, ctx) { drawChips(game, ctx); },
  drawScreen(game, ctx) { drawFloats(game, ctx); },
};
