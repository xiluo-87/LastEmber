// Playtest bot core: perception helpers + action primitives. Everything the bot DOES goes through the same paths a human uses:
//   * movement / action hold      -> game.input.touch (the touch joystick + action button) and input.press(...)
//   * item use / equip / crafting -> systems/itemactions.js (Bag panel / Use button), game.crafting.craft (Craft tab)
//   * building                    -> game.building.select(id) + input.worldTap(...) x2 (the build menu + tap-to-place)
//   * fires                       -> game.structures.addFuel / light (the fuel panel buttons)
// It may READ world state freely to decide where to go. It never writes game state.
import { TILE, TIME } from '../../src/data/balance.js';
import { STRUCTURES, NODES } from '../../src/data/structures.js';
import { ITEMS } from '../../src/data/items.js';
import { createInput } from '../../src/input.js';
import * as inv from '../../src/logic/inventory.js';
import { useStack, equipToHotbar, unequip } from '../../src/systems/itemactions.js';
import { daylightLength, nightLength } from '../../src/logic/clock.js';
import { createNav } from './nav.mjs';

export const STAT_KEYS = ['health', 'hunger', 'thirst', 'warmth', 'stamina'];

export function createBotCore(game) {
  // real input object (keyboard/touch -> intent) even headless
  if (!game.input.touch) createInput(game);
  const nav = createNav(game);
  const S = () => game.state;
  const P = () => game.state.player;
  const core = {
    game, nav, mem: {}, idx: null, idxAt: -9, blocked: new Map(), toasts: [], toastCounts: {},
    counters: { bagFull: 0, swings: 0, crafts: 0, placed: 0, broke: 0 },
  };

  // ------------------------------------------------------------ toasts (the UI stub is silent; record what a human would have read)
  const origToast = game.ui.toast;
  game.ui.toast = (msg, kind, ms) => {
    core.toastCounts[msg] = (core.toastCounts[msg] || 0) + 1;
    if (/bag full/i.test(msg)) core.counters.bagFull++;
    if (/broke!?$/i.test(msg)) core.counters.broke++;
    core.toasts.push({ t: game.state?.stats?.playSeconds ?? 0, msg, kind });
    if (core.toasts.length > 60) core.toasts.shift();
    return origToast?.(msg, kind, ms);
  };

  // ------------------------------------------------------------ perception
  core.me = () => P();
  core.tile = () => nav.tileOf();
  core.count = (id) => inv.count(S().inventory, id);
  core.has = (id, n = 1) => inv.count(S().inventory, id) >= n;
  core.hasTool = (cls) => ['hotbar', 'bag'].some((a) => S().inventory[a].some((s) => s && ITEMS[s.id]?.tool?.class === cls));
  core.toolStack = (cls) => { for (const a of ['hotbar', 'bag']) for (const s of S().inventory[a]) if (s && ITEMS[s.id]?.tool?.class === cls) return s; return null; };
  core.freeSlots = () => ['bag'].reduce((n, a) => n + S().inventory[a].filter((s) => !s).length, 0);
  core.usedSlots = () => S().inventory.bag.filter(Boolean).length + S().inventory.hotbar.filter(Boolean).length;
  core.center = (o) => ({ x: o.tx * TILE + TILE / 2, y: o.ty * TILE + TILE / 2 });
  core.distPx = (x, y) => Math.hypot(x - P().x, y - P().y);
  core.distTilesTo = (tx, ty) => core.distPx(tx * TILE + 16, ty * TILE + 16) / TILE;

  core.time = () => {
    const t = S().time, dl = daylightLength(t.day), nl = nightLength(t.day);
    const toNight = t.t < dl ? dl - t.t : 0;                           // seconds of daylight left (0 at night)
    const nightLeft = t.t >= dl ? TIME.dayLength - t.t : nl;            // seconds until dawn when at night
    return { day: t.day, t: t.t, phase: t.phase, toNight, nightLeft, isNight: t.phase === 'night', isDusk: t.phase === 'dusk', dl, nl,
      toDawn: t.t >= dl ? TIME.dayLength - t.t : TIME.dayLength - t.t + 0 };
  };

  /** Index of world objects by type (refreshed ~1/s). */
  core.index = () => {
    if (core.idx && game.time - core.idxAt < 1) return core.idx;
    const by = new Map();
    game.world.forEachObject((o) => { let a = by.get(o.type); if (!a) by.set(o.type, a = []); a.push(o); });
    core.idx = by; core.idxAt = game.time; return by;
  };
  core.refresh = () => { core.idxAt = -9; };
  core.ofType = (...types) => { const ix = core.index(), out = []; for (const t of types) { const a = ix.get(t); if (a) for (const o of a) if (game.world.objectAt(o.tx, o.ty) === o) out.push(o); } return out; };
  core.isBlockedObj = (o) => { const k = `${o.type}@${o.tx},${o.ty}`; const until = core.blocked.get(k); return !!until && game.time < until; };
  core.blockObj = (o, secs = 120) => core.blocked.set(`${o.type}@${o.tx},${o.ty}`, game.time + secs);
  /** Nearest object of the given types (optionally filtered), measured from `from` (default: player). */
  core.nearest = (types, filter, from) => {
    const p = from || { x: P().x, y: P().y };
    let best = null, bd = Infinity;
    for (const o of core.ofType(...types)) {
      if (o.depleted || core.isBlockedObj(o) || (filter && !filter(o))) continue;
      const c = core.center(o), d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };

  core.hostiles = (r = 14) => {
    const out = [], p = P();
    for (const c of S().creatures.list) {
      if ((c.type !== 'wolf' && c.type !== 'bear') || c.hp <= 0) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y) / TILE;
      if (d <= r) out.push({ c, d });
    }
    return out.sort((a, b) => a.d - b.d);
  };
  core.prey = (types = ['rabbit', 'deer'], r = 30) => {
    const out = [], p = P();
    for (const c of S().creatures.list) {
      if (!types.includes(c.type) || c.hp <= 0) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y) / TILE;
      if (d <= r) out.push({ c, d });
    }
    return out.sort((a, b) => a.d - b.d);
  };
  core.carcass = (r = 30) => {
    let best = null, bd = r * TILE; const p = P();
    for (const k of S().creatures.carcasses) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; best = k; } }
    return best;
  };

  // ------------------------------------------------------------ inventory actions (Bag panel paths)
  core.findRef = (id) => {
    const I = S().inventory;
    for (const a of ['hotbar', 'bag']) for (let i = 0; i < I[a].length; i++) if (I[a][i] && I[a][i].id === id) return inv.ref(a, i);
    return null;
  };
  core.use = (id) => { const r = core.findRef(id); return r ? useStack(game, r) : false; };
  core.wear = (id) => { const r = core.findRef(id); if (!r) return false; return useStack(game, r); };
  /** Select a tool of class `cls` ('axe'|'pickaxe'|'spear'|'bow'|'torch') in the hotbar; null/'hands' selects an empty slot. */
  core.hold = (cls) => {
    const I = S().inventory;
    if (!cls || cls === 'hands') {
      const e = I.hotbar.findIndex((s) => !s);
      if (e >= 0) { inv.selectHotbar(I, e); return true; }
      return false;
    }
    const cur = I.hotbar[I.selected];
    if (cur && ITEMS[cur.id]?.tool?.class === cls) return true;
    for (let i = 0; i < I.hotbar.length; i++) {
      const s = I.hotbar[i];
      if (s && ITEMS[s.id]?.tool?.class === cls) { inv.selectHotbar(I, i); game.events.emit('hotbar:changed', { index: i }); return true; }
    }
    for (let i = 0; i < I.bag.length; i++) {
      const s = I.bag[i];
      if (s && ITEMS[s.id]?.tool?.class === cls) return equipToHotbar(game, inv.ref('bag', i));
    }
    return false;
  };
  core.heldClass = () => { const s = inv.selectedStack(S().inventory); return s ? ITEMS[s.id]?.tool?.class || null : null; };
  core.craft = (recipeId) => { const r = game.crafting.craft(recipeId); if (r.ok) core.counters.crafts++; return r.ok; };
  core.canCraft = (recipeId) => { const rec = game.crafting.recipes.find((x) => x.id === recipeId); return !!rec && game.crafting.status(rec).ok; };

  // ------------------------------------------------------------ movement / interaction
  const touch = () => game.input.touch;
  core.stop = () => { nav.stop(); touch().action = false; };
  core.act = (hold = true, press = false) => { touch().action = !!hold; if (press) game.input.press('action'); };

  /** Tiles from which a (blocking) object can be worked: 4-neighbours that are walkable. */
  const neighbours = (o) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ tx: o.tx + dx, ty: o.ty + dy })).filter((n) => nav.walkable(n.tx, n.ty));

  /**
   * Work an object (gather/open/attack...) the way a player would: walk adjacent, face it, hold or press Action.
   * Returns 'working' | 'moving' | 'unreachable' | 'gone'.
   * opts.press: also tap Action each call (non-repeating handlers: crates, take pickups). opts.interact: press E instead.
   */
  core.work = (o, opts = {}) => {
    const w = game.world;
    if (!o || w.objectAt(o.tx, o.ty) !== o || o.depleted) { core.act(false); return 'gone'; }
    const p = P(), c = core.center(o), d = Math.hypot(c.x - p.x, c.y - p.y);
    const def = STRUCTURES[o.type] || NODES[o.type];
    const blocking = !!def?.blocks;
    const me = nav.tileOf();
    const adjacent = Math.abs(me.tx - o.tx) + Math.abs(me.ty - o.ty) === 1;
    const near = blocking ? adjacent : d <= 26;
    if (!near) {
      core.act(false);
      const key = `work:${o.type}@${o.tx},${o.ty}`;
      const res = blocking ? nav.goTo(key, (x, y) => Math.abs(x - o.tx) + Math.abs(y - o.ty) === 1 && nav.walkable(x, y), !!opts.sprint)
        : nav.goToPx(key, c.x, c.y, 20, !!opts.sprint);
      if (res === 'unreachable') { core.blockObj(o, 60); return 'unreachable'; }
      return 'moving';
    }
    const tg = game.target;
    const onTarget = tg && tg.obj === o;
    if (blocking) nav.push(c.x - p.x, c.y - p.y); else nav.stop();
    if (onTarget || !opts.needTarget) {
      if (onTarget) core.mem.mismatch = 0;
      if (opts.interact) game.input.press('interact'); else core.act(true, !!opts.press);
      return 'working';
    }
    core.act(false);
    core.mem.mismatch = (core.mem.mismatch || 0) + 1;
    if (core.mem.mismatch > 12) { core.blockObj(o, 30); core.mem.mismatch = 0; return 'unreachable'; }
    return 'moving';
  };

  /** Face and attack a creature (walk toward it, hold Action; combat auto-aims inside the swing arc). */
  core.attack = (c, reach = 1.5) => {
    const p = P(), d = Math.hypot(c.x - p.x, c.y - p.y) / TILE;
    if (d > reach) {
      core.act(false);
      nav.goToPx(`atk:${c.id}`, c.x, c.y, reach * TILE * 0.8, true);
      return 'moving';
    }
    nav.push(c.x - p.x, c.y - p.y);
    core.act(true, true);
    return 'working';
  };

  /** Shoot a creature with the bow: stay `range` tiles away facing it. */
  core.shoot = (c, range = 5.5) => {
    const p = P(), d = Math.hypot(c.x - p.x, c.y - p.y) / TILE;
    if (d > range) {
      core.act(false);
      const r = nav.goToPx(`bow:${c.id}`, c.x, c.y, range * TILE * 0.9, d > 12);
      return r === 'unreachable' ? 'unreachable' : 'moving';
    }
    // face the target: a nudge toward it (facing follows the stick), then hold Action
    const a = Math.atan2(c.y - p.y, c.x - p.x), diff = Math.abs(((a - p.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (diff > 0.25) { nav.push(c.x - p.x, c.y - p.y); core.act(false); return 'aiming'; }
    nav.stop(); core.act(true, true);
    return 'working';
  };

  // ------------------------------------------------------------ building (build menu + tap-to-place)
  core.canAfford = (type, n = 1) => STRUCTURES[type].cost.every((c) => core.count(c.item) >= c.n * n);
  core.place = (type, tx, ty) => {
    const B = game.building, w = game.world;
    if (!B) return false;
    const v = B.validate(type, tx, ty);
    if (!v.ok) { core.lastPlaceFail = v; return false; }
    B.select(type);
    const c = w.tileCenter(tx, ty);
    game.input.worldTap(c.x, c.y);
    game.input.worldTap(c.x, c.y);
    B.cancel();
    const ok = w.objectAt(tx, ty)?.type === type;
    if (ok) { core.counters.placed++; core.refresh(); }
    return ok;
  };
  core.dismantle = (o) => {   // build mode Dismantle, hold Action on the target for 1 s
    const B = game.building;
    if (B.mode !== 'dismantle') B.toggleDismantle();
    return core.work(o, { needTarget: true });
  };
  core.endDismantle = () => { if (game.building.mode) game.building.cancel(); core.act(false); };

  // ------------------------------------------------------------ fires
  core.fires = (types = ['campfire', 'furnace']) => {
    const out = [];
    for (const t of types) for (const o of game.building.list(t)) out.push(o);
    return out;
  };
  core.fireNear = (tx, ty, r = 99, lit = true) => {
    let best = null, bd = r;
    for (const o of core.fires(['campfire'])) { if (lit && !o.lit) continue; const d = Math.hypot(o.tx - tx, o.ty - ty); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  core.stationNear = () => game.stationQuery();

  core.snapshot = () => {
    const p = P();
    return { health: p.health, hunger: p.hunger, thirst: p.thirst, warmth: p.warmth, stamina: p.stamina };
  };
  core.unequip = (r) => unequip(game, r);
  return core;
}
