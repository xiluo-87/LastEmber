// Policy rules for the playtest bot (see bot.mjs). createGoals(bot) -> { rules:[fn...], sleepWatch }. Each rule returns true if it acted.
import { TILE } from '../../src/data/balance.js';
import { STRUCTURES } from '../../src/data/structures.js';
import { eatSnow, dropStack } from '../../src/systems/itemactions.js';
import { tileDist } from './nav.mjs';
import { createDefender } from './defender.mjs';

const FOODS = ['cooked_meat', 'jerky', 'cooked_fish', 'berries'];
const DRINKS = ['clean_water', 'herbal_tea', 'snow_water'];

export function createGoals(bot) {
  const { core, prof, game } = bot;
  const nav = core.nav, W = () => game.world, S = () => game.state, P = () => game.state.player;
  const has = (i, n = 1) => core.has(i, n), cnt = (i) => core.count(i);
  const T = () => core.time();
  const walkable = (x, y) => nav.walkable(x, y);
  const nStruct = (type) => { let n = 0; for (const _ of game.building.list(type)) n++; return n; };
  const firstStruct = (type) => { for (const o of game.building.list(type)) return o; return null; };

  // ------------------------------------------------------------ base layout (3x3 interior around the fire, ring of walls, door south)
  const RING = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 2 && !(Math.abs(dx) === 2 && Math.abs(dy) === 2) && !(dx === 0 && dy === 2)) RING.push([dx, dy]);
  }
  const DOOR = [0, 2];
  const LAYOUT = { workbench: [-1, -1], chest: [1, -1], bedroll: [-1, 1], drying_rack: [1, 1] };
  const trivial = (o) => !o || o.type === 'loose_stone' || o.type === 'loose_stick' || o.type === 'stump' || o.type === 'rubble' || o.type === 'dropped_item';

  function chooseBase() {
    const sp = S().world.spawn;
    let best = null;
    for (let cx = sp.tx - 10; cx <= sp.tx + 10; cx++) for (let cy = sp.ty - 10; cy <= sp.ty + 10; cy++) {
      let score = Math.hypot(cx - sp.tx, cy - sp.ty), ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) for (let dy = -3; dy <= 3 && ok; dy++) {
        const x = cx + dx, y = cy + dy, o = W().objectAt(x, y), t = W().terrainAt(x, y);
        if (t === 'cliff' || t === 'ice') { ok = false; break; }
        if (t === 'deep_snow') score += 0.3;
        if (!trivial(o)) { if (Math.max(Math.abs(dx), Math.abs(dy)) === 2 && o.type === 'tree') score -= 0.5; else ok = false; }
        else if (o) score += 0.4;
      }
      if (ok && (!best || score < best.score)) best = { cx, cy, score };
    }
    return best || { cx: sp.tx, cy: sp.ty, score: 99 };
  }
  const home = () => bot.home || (bot.home = chooseBase());
  const homeFire = () => { const h = home(); const o = W().objectAt(h.cx, h.cy); return o && o.type === 'campfire' ? o : null; };
  const homeSpot = () => { const h = home(); return { tx: h.cx, ty: h.cy + 1 }; };
  const sheltered = () => { const me = core.tile(); return !!game.building.isSheltered?.(game, me.tx, me.ty); };
  const distHome = () => { const h = home(); return core.distTilesTo(h.cx, h.cy); };
  const roomClosed = () => { const s = homeSpot(); return !!game.building.isSheltered?.(game, s.tx, s.ty); };
  const wallPrefs = () => (prof.stone ? ['stone_wall', 'wood_wall'] : ['wood_wall']);
  const baseLayout = () => { const h = home(); return [...RING.map(([dx, dy]) => [wallPrefs(), h.cx + dx, h.cy + dy]), ['door', h.cx + DOOR[0], h.cy + DOOR[1]]]; };
  let defObj = null;
  const defender = () => defObj || (defObj = createDefender(game, core, { cx: home().cx, cy: home().cy, d: 2, layout: baseLayout }, { rebuild: true, get bow() { return core.hasTool('bow') && cnt('arrow') > 0; } }));
  const canSleep = () => !S().endgame?.transmitting && S().time.day < (prof.sleepUntilDay ?? 8);

  // ------------------------------------------------------------ movement helpers
  function goTile(key, tx, ty, sprint = false) {
    const me = core.tile();
    if (me.tx === tx && me.ty === ty) { nav.stop(); return 'arrived'; }
    return nav.goTo(key, (x, y) => x === tx && y === ty, sprint);
  }
  const goHomeSpot = (sprint = false) => { const s = homeSpot(); return goTile('home', s.tx, s.ty, sprint); };

  /** Walk to a standing tile near (tx,ty) and place `type` there. -> 'done' | 'moving' | 'fail' */
  function build(type, tx, ty) {
    const w = W(), o = w.objectAt(tx, ty);
    if (o && o.type === type) return 'done';
    if (o && !trivial(o)) return 'fail';
    const d = core.distTilesTo(tx, ty);
    core.act(false);
    if (d > 2.6) {
            const r = nav.goTo(`build:${tx},${ty}`, (x, y) => walkable(x, y) && !(x === tx && y === ty) && tileDist(x, y, tx, ty) >= 1 && tileDist(x, y, tx, ty) <= 1.9);
      if (r === 'arrived') { const c = core.center({ tx, ty }), p = P(); nav.push(c.x - p.x, c.y - p.y); }
      return r === 'unreachable' ? 'fail' : 'moving';
    }
    if (o && (o.type.startsWith('loose') || o.type === 'dropped_item')) return core.work(o, { press: true }) === 'unreachable' ? 'fail' : 'moving';
    const v = game.building.validate(type, tx, ty);
    if (!v.ok) {
      if (v.code === 'standing') { const c = core.center({ tx, ty }), p = P(); nav.push(p.x - c.x, p.y - c.y); return 'moving'; }
      if (v.code === 'creature') { nav.stop(); return 'moving'; }
      core.lastPlaceFail = v; return 'fail';
    }
    nav.stop();
    return core.place(type, tx, ty) ? 'done' : 'fail';
  }

  // ------------------------------------------------------------ gathering
  const SRC = {
    stick: () => ['loose_stick', 'dead_bush', ...(core.hasTool('axe') ? ['tree'] : [])],
    stone: () => ['loose_stone', 'rock_node'],
    flint: () => ['rock_node'],
    fiber: () => ['dead_bush'],
    wood: () => ['tree'],
    berries: () => ['berry_bush'],
    herb: () => ['herb'],
    iron_ore: () => ['iron_node'],
    coal: () => ['coal_node'],
  };
  const nearDen = (o, r = 11) => core.ofType('bear_den').some((d) => tileDist(d.tx, d.ty, o.tx, o.ty) < r);
  function holdFor(o) {
    if (o.type === 'tree') core.hold(core.hasTool('axe') ? 'axe' : 'hands');
    else if (o.type === 'rock_node' || o.type === 'iron_node' || o.type === 'coal_node') core.hold(core.hasTool('pickaxe') ? 'pickaxe' : 'hands');
    else core.hold('hands');
  }
  /** Gather one more `item`. -> true when it acted (walking or working), false when nothing is available. */
  function fetch(item, opts = {}) {
    const want = item;
    if (item === 'flint' && !core.hasTool('pickaxe')) item = 'stone';
    const types = (SRC[item] || (() => []))();
    const h = home(), range = opts.range ?? prof.maxRange, tl = T();
    const cur = bot.mem.tgt;
    let o = null;
    if (cur && cur.item === item && !cur.o.depleted && W().objectAt(cur.o.tx, cur.o.ty) === cur.o && !core.isBlockedObj(cur.o)) {
      if (game.time - cur.t0 > 40) { core.blockObj(cur.o, 90); bot.mem.tgt = null; } else o = cur.o;
    }
    if (!o) o = core.nearest(types, (x) => {
      if (!opts.allowDen && nearDen(x)) return false;
      const dh = tileDist(x.tx, x.ty, h.cx, h.cy);
      if (dh > range) return false;
      if (x.type === 'rock_node' && item === 'stone' && !core.hasTool('pickaxe') && (x.hn || 0) >= 4) return false;
      if (!tl.isNight && prof.retreatDusk && dh > 8 && tl.toNight < dh / 2.8 + 25) return false;
      return true;
    });
    if (!o) { bot.noSource = want; return false; }
    if (!bot.mem.tgt || bot.mem.tgt.o !== o) bot.mem.tgt = { item, o, t0: game.time };
    bot.noSource = null;
    holdFor(o);
    core.work(o, { press: o.type.startsWith('loose') });
    return true;
  }
  const shop = (needs) => { for (const [item, n] of Object.entries(needs)) if (cnt(item) < n) return fetch(item); return false; };
  const haveAll = (needs) => Object.entries(needs).every(([i, n]) => cnt(i) >= n);

  // ------------------------------------------------------------ fire helpers
  const atFire = (fire, r = 1.7) => core.distTilesTo(fire.tx, fire.ty) <= r;
  function walkToFire(fire, r = 1.6) {
    if (atFire(fire, r)) { nav.stop(); return true; }
    nav.goTo(`fire:${fire.tx},${fire.ty}`, (x, y) => walkable(x, y) && tileDist(x, y, fire.tx, fire.ty) <= r - 0.2 && tileDist(x, y, fire.tx, fire.ty) >= 1);
    return false;
  }
  function tendFire(fire, target) {
    const cap = Math.min(target, STRUCTURES.campfire.fuel.max);
    for (let n = 0; n < 12; n++) {
      let it = null;
      if (has('wood') && fire.fuel + 60 <= cap) it = 'wood'; else if (has('stick') && fire.fuel + 20 <= cap) it = 'stick';
      if (!it || !game.structures.addFuel(fire, it).ok) break;
    }
    if (!fire.lit && fire.fuel > 0) game.structures.light(fire);
  }


  // ------------------------------------------------------------ bot rng, hunting, crafting stations
  let rs = (game.state.seed ^ 0xb07) >>> 0;
  const brand = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const foodStock = () => cnt('cooked_meat') * 35 + cnt('jerky') * 25 + cnt('cooked_fish') * 28 + cnt('berries') * 8 + cnt('raw_meat') * 30 + cnt('raw_fish') * 20;
  function wander(minD = 12, maxD = 26) {
    const h = home(), m = bot.mem;
    if (!m.wp || game.time > m.wpUntil || core.distPx(m.wp.x, m.wp.y) < 40) {
      for (let i = 0; i < 12; i++) {
        const a = brand() * Math.PI * 2, d = minD + brand() * (maxD - minD), tx = Math.round(h.cx + Math.cos(a) * d), ty = Math.round(h.cy + Math.sin(a) * d);
        if (walkable(tx, ty) && W().terrainAt(tx, ty) !== 'ice' && !nearDen({ tx, ty }, 16)) { m.wp = { x: tx * TILE + 16, y: ty * TILE + 16 }; m.wpUntil = game.time + 40; break; }
      }
    }
    if (!m.wp) return false;
    if (nav.goToPx('wander', m.wp.x, m.wp.y, 30, false) === 'unreachable') m.wp = null;
    return true;
  }
  function butcher(k) {
    if (core.distPx(k.x, k.y) > 22) { core.act(false); nav.goToPx(`carc:${k.x | 0}`, k.x, k.y, 18, true); return true; }
    nav.stop(); core.hold('hands'); core.act(true); return true;
  }
  /** One step of hunting (carcass first, then prey). -> true if acted */
  function huntStep() {
    const h = home(), tl = T(), m = (bot.mem.skip ||= {});
    const ar = core.ofType('dropped_item').filter((o) => o.stack && o.stack.id === 'arrow' && !core.isBlockedObj(o) && core.distTilesTo(o.tx, o.ty) < 12)[0];
    if (ar && !core.hostiles(8).length) { const r = core.work(ar, { press: true }); if (r === 'unreachable' || r === 'gone') core.blockObj(ar, 60); return true; }
    const k = core.carcass(30);
    if (k && tileDist(k.x / TILE, k.y / TILE, h.cx, h.cy) < prof.maxRange + 6) return butcher(k);
    if (!tl.isNight && prof.retreatDusk && tl.toNight < 70) return false;
    const bowNow = core.hasTool('bow') && has('arrow');
    const prey = core.prey(bowNow ? ['rabbit', 'deer'] : ['rabbit'], 40).filter((x) => !(m[x.c.id] > game.time) && !nearDen({ tx: x.c.x / TILE, ty: x.c.y / TILE }, 14) && tileDist(x.c.x / TILE, x.c.y / TILE, h.cx, h.cy) < prof.maxRange);
    if (!prey.length) return wander();
    const { c } = prey[0];
    const st = (bot.mem.hunt ||= { id: -1, t0: 0 });
    if (st.id !== c.id) { st.id = c.id; st.t0 = game.time; }
    if (game.time - st.t0 > 28) { m[c.id] = game.time + 200; st.id = -1; return true; }
    const bow = core.hasTool('bow') && has('arrow');
    if (!bow && !core.hasTool('spear') && P().hunger > 30) return false;   // no weapon yet
    core.hold(bow ? 'bow' : core.hasTool('spear') ? 'spear' : 'hands');
    if (bow) core.shoot(c, 6.3); else core.attack(c, 1.75, false);          // spear: sneak up on a rabbit (walking, not sprinting)
    return true;
  }
  function atStation(st, r = 1.8) {
    if (game.stationQuery().includes(st)) { nav.stop(); return true; }
    const o = st === 'workbench' ? firstStruct('workbench') : homeFire();
    if (!o) return false;
    nav.goTo(`st:${st}`, (x, y) => walkable(x, y) && tileDist(x, y, o.tx, o.ty) <= r && tileDist(x, y, o.tx, o.ty) >= 1);
    return null;
  }
  /** craft at a workbench: walk there first. -> true if acted */
  function craftAt(id, inputs) {
    if (!haveAll(inputs)) return shop(inputs);
    const a = atStation('workbench');
    if (a === false) return false;
    if (a === null) return true;
    core.craft(id); return true;
  }
  function ropeFor(n) {   // make sure `n` rope are in the bag (3 fiber each)
    if (cnt('rope') >= n) return false;
    if (cnt('fiber') >= 3) { core.craft('rope'); return true; }
    return fetch('fiber');
  }

  // ------------------------------------------------------------ rules
  const rules = [];
  const rule = (name, fn) => { Object.defineProperty(fn, 'name', { value: name }); rules.push(fn); };

  /** Bag hygiene: a full bag silently blocks wood (the fire dies) and stone. Turn cloth into bandages, then drop junk. */
  rule('bag', () => {
    if (core.freeSlots() > 1) return false;
    if (has('cloth') && cnt('bandage') < 4 && core.canCraft('bandage_cloth')) { core.craft('bandage_cloth'); return true; }
    if (cnt('stone') > 45) { const r = core.findRef('stone'); if (r) { dropStack(game, r); return true; } }
    const junk = ['worn_jacket', 'bone', 'herb', 'flight_map', 'cloth', 'berries', 'fat', 'fiber', 'torch', 'hide'];
    for (const id of junk) {
      if (id === 'flight_map' && cnt('radio_antenna') + cnt('radio_battery') + cnt('radio_circuit') < 2) continue;
      if (id === 'hide' && cnt('hide') <= 5) continue;
      if (id === 'fiber' && cnt('fiber') <= 3) continue;
      if (id === 'fat' && cnt('fat') <= 4) continue;
      const r = core.findRef(id); if (r) { dropStack(game, r); return true; }
    }
    return false;
  });

  /** Sealed into a corner pocket of the wall ring (walls were placed around the bot): take a wall down. */
  rule('unstick', () => {
    const h = bot.home; if (!h) return false;
    const me = core.tile(), dx = me.tx - h.cx, dy = me.ty - h.cy;
    if (Math.abs(dx) !== 2 || Math.abs(dy) !== 2) return false;
    const hs = homeSpot();
    if (nav.findPath(me.tx, me.ty, (x, y) => x === hs.tx && y === hs.ty, 600)) return false;    // can still walk home: not stuck
    const w = W().objectAt(me.tx - Math.sign(dx), me.ty);
    if (!w || !['wood_wall', 'stone_wall'].includes(w.type)) { core.endDismantle(); return false; }
    core.hold('hands'); core.dismantle(w); return true;
  });

  /** At home under threat (night, dusk, lingering wolves): hold the line with the shared defender policy. */
  rule('defend', () => {
    if (!prof.walls || !prof.defend || !homeFire() || distHome() > 5 || game.sleep?.active) return false;
    const t = T(), wolves = core.hostiles(14).some((h) => h.c.type === 'wolf');
    if (!(t.isNight || t.toNight < 25 || wolves)) return false;
    const p = P(), close = core.hostiles(7).some((h) => h.c.type === 'wolf');
    if (!close && (p.thirst < prof.drinkBelow + 8 || p.hunger < prof.eatBelow + 5 || p.warmth < prof.warmBelow + 4)) return false;   // let `vitals` melt snow / cook / warm up between fights
    return defender().think() !== 'idle';
  });

  /** Bears: kite with the bow, melee only with iron at good health, otherwise run for home. */
  rule('bear', () => {
    const b = core.hostiles(9).find((h) => h.c.type === 'bear'); if (!b) return false;
    if (!(b.c.mode === 'charge' || b.c.aggro > 0 || b.d < 5.5)) return false;    // an idle bear far from its den: just keep away (gather/hunt filters already avoid dens)
    const p = P(), { c, d } = b, bow = core.hasTool('bow') && has('arrow'), away = Math.atan2(p.y - c.y, p.x - c.x);
    if (sheltered()) { core.act(false); return false; }
    if (bow) {
      if (d < 3.2) { core.act(false); core.nav.push(Math.cos(away), Math.sin(away), p.stamina > 8); }
      else if (d <= 6.4) { core.hold('bow'); core.nav.stop(); p.facing = Math.atan2(c.y - p.y, c.x - p.x); core.act(true, true); }
      else { core.act(false); core.nav.stop(); }
      return true;
    }
    if (has('iron_spear') && p.health >= 60) { core.hold('spear'); if (d > 2.0) { core.act(false); core.nav.push(c.x - p.x, c.y - p.y, false); } else { core.nav.stop(); p.facing = Math.atan2(c.y - p.y, c.x - p.x); core.act(true, true); } return true; }
    core.act(false); const h = home(); core.nav.push(h.cx * TILE + 16 - p.x, h.cy * TILE + 16 - p.y, p.stamina > 6); return true;   // run for the base (the bear gives up beyond its leash)
  });

  rule('fight', () => {
    const p = P(), hs = core.hostiles(8);
    if (!hs.length) { bot.mem.fighting = false; return false; }
    const { c, d } = hs[0];
    const weapon = core.hasTool('spear');
    const pack = hs.filter((h) => h.c.type === 'wolf').length;
    if (c.type === 'bear') return false;
    if (sheltered()) {
      if (weapon && d <= 2.3) { core.hold('spear'); nav.push(c.x - p.x, c.y - p.y); core.act(true, true); return true; }
      core.act(false); return false;
    }
    const strong = p.health >= prof.fightHp && (pack <= 2 || bot.mem.fighting);
    if (weapon && strong && d < 6 && prof.fightWolves) { core.hold('spear'); bot.mem.fighting = true; core.attack(c, 1.7); return true; }
    if (d < 7) { const f = homeFire(); if (f && f.lit) { if (!atFire(f, 1.5)) walkToFire(f, 1.5); else if (weapon) core.attack(c, 1.8); else core.stop(); return true; } }
    return false;
  });

  rule('vitals', () => {
    const p = P();
    if (p.status?.bleeding) {
      if (has('bandage')) { core.use('bandage'); return true; }
      for (const r of ['bandage_cloth', 'bandage_hide', 'bandage_herb']) if (core.canCraft(r)) { core.craft(r); return true; }
    }
    if (p.thirst < prof.drinkBelow || (bot.mem.drinking && p.thirst < 88)) {
      bot.mem.drinking = true;
      for (const d of DRINKS) if (has(d) && (d !== 'snow_water' || !has('clean_water'))) { core.use(d); return true; }
      const fire = homeFire() || core.fireNear(core.tile().tx, core.tile().ty, 40);
      if (has('tin_pot') && fire && fire.lit) {
        if (!walkToFire(fire, 2.0)) return true;
        if (core.canCraft('clean_water') && has('snow_water')) { core.craft('clean_water'); return true; }
        if (core.canCraft('snow_water')) { core.craft('snow_water'); return true; }
      }
      if (p.thirst < 28 && p.warmth > 50) { eatSnow(game); return true; }
      bot.mem.drinking = false;
    } else bot.mem.drinking = false;
    if (p.hunger < prof.eatBelow) {
      for (const f of FOODS) if (has(f)) { core.use(f); return true; }
      if (p.hunger < 20 && has('raw_meat')) { core.use('raw_meat'); return true; }
    }
    const fire = homeFire();
    if (fire && fire.lit && atFire(fire, 2.4)) {
      if (has('raw_meat') && core.canCraft('cooked_meat')) { core.craft('cooked_meat'); return true; }
      if (has('raw_fish') && core.canCraft('cooked_fish')) { core.craft('cooked_fish'); return true; }
    }
    if (p.warmth < prof.warmBelow || (bot.mem.warming && p.warmth < prof.warmUntil)) {
      const me = core.tile();
      const f = fire && fire.lit ? fire : core.fireNear(me.tx, me.ty, 60);
      if (f) { bot.mem.warming = true; if (!walkToFire(f, 1.8)) return true; core.stop(); return true; }
    } else bot.mem.warming = false;
    return false;
  });

  rule('night', () => {
    const t = T(), p = P();
    if (!prof.retreatDusk && !t.isNight) return false;
    if (!(t.isNight || t.toNight < prof.retreatDusk)) return false;
    const fire = homeFire();
    if (!fire) return false;
    if (prof.nightFuel && fire.fuel < Math.min(600, t.nl + 60) && (has('wood') || has('stick'))) {
      if (!walkToFire(fire, 1.6)) return true; tendFire(fire, 600); return true;
    }
    if (!fire.lit && fire.fuel > 0) { if (!walkToFire(fire, 1.6)) return true; game.structures.light(fire); return true; }
    if (t.isNight && prof.sleep && prof.bedroll && canSleep()) {
      const bed = firstStruct('bedroll');
      if (bed && !game.sleep.refusal() && p.hunger > 25 && p.thirst > 25) { core.work(bed, { interact: true }); return true; }
    }
    if (!(t.isNight || t.toNight < 20)) return false;
    if (prof.walls && !roomClosed()) return false;      // still building: let projects run
    if (goHomeSpot() === 'arrived') core.stop();
    return true;
  });

  rule('fire', () => {
    const f = homeFire(); if (!f) return false;
    const fuelable = has('wood') || has('stick');
    if (!f.lit && f.fuel <= 0 && fuelable) { if (!walkToFire(f, 1.6)) return true; tendFire(f, 300); return true; }
    if (f.fuel < prof.fuelReserve && fuelable && (distHome() < 14 || f.fuel < 60)) { if (!walkToFire(f, 1.6)) return true; tendFire(f, 420); return true; }
    return false;
  });

  function makeTool(id, needs) {
    if (haveAll(needs)) { core.stop(); core.craft(id); return true; }
    return shop(needs);
  }
  function buildProj(type, needs) {
    if (!haveAll(needs)) return shop(needs);
    const h = home(), L = LAYOUT[type] || [0, 0];
    return build(type, h.cx + L[0], h.cy + L[1]) !== 'fail';
  }
  function wallsProject() {
    const h = home();
    const up = bot.mem.upg;   // a wall being swapped for stone is not a gap to refill with wood
    const todo = RING.filter(([dx, dy]) => !W().isBlocked(h.cx + dx, h.cy + dy) && !(up && up.tx === h.cx + dx && up.ty === h.cy + dy));
    const doorO = W().objectAt(h.cx + DOOR[0], h.cy + DOOR[1]);
    if (!todo.length && doorO && doorO.type === 'door') return false;
    if (todo.length) {
      if (cnt('wood') < 2) return fetch('wood');
      const [dx, dy] = todo[0];
      const r = build('wood_wall', h.cx + dx, h.cy + dy);
      if (r === 'fail') { bot.plan.wallFail = (bot.plan.wallFail || 0) + 1; return false; }
      return true;
    }
    if (!doorO) {
      if (cnt('wood') < 2) return fetch('wood');
      if (cnt('fiber') < 3 && cnt('rope') < 1) return fetch('fiber');
      if (cnt('rope') < 1) { core.craft('rope'); return true; }
      return build('door', h.cx + DOOR[0], h.cy + DOOR[1]) !== 'fail';
    }
    return false;
  }

  /** time-box a step: at most `secs` game-seconds per day (keeps one hungry-for-hides loop from starving the base projects) */
  function budget(name, secs, fn) {
    const b = (bot.mem.budget ||= {}), d = dayNo(), e = (b[name] ||= { day: d, used: 0 });
    if (e.day !== d) { e.day = d; e.used = 0; }
    if (e.used >= secs) return false;
    const r = fn();
    if (r) e.used += 0.1 * (S().time.speed || 1);
    return r;
  }

  rule('projects', () => {
    const h = home();
    const steps = [
      ['wear', () => { for (const id of ['fur_coat', 'fur_boots', 'fur_hat']) { const w = S().inventory.clothing.some((c) => c && c.id === id); if (!w && has(id)) { core.wear(id); return true; } } return false; }],
      ['crate', () => { const crate = core.ofType('crash_site').find((o) => !o.depleted && !core.isBlockedObj(o)); if (!crate) return false; bot.mem.crateT0 ??= game.time; if (game.time - bot.mem.crateT0 > 20) { core.blockObj(crate, 1e6); return false; } return core.work(crate, { press: true }) !== 'unreachable'; }],
      ['axe', () => !core.hasTool('axe') && makeTool('stone_axe', { stick: 2, stone: 2, fiber: 1 })],
      ['pickaxe', () => !core.hasTool('pickaxe') && makeTool('stone_pickaxe', { stick: 2, stone: 3, fiber: 1 })],
      ['campfire', () => {
        const fire = homeFire();
        if (!fire) {
          if (!has('flint')) return fetch('flint');
          if (!haveAll({ stick: 3, stone: 3 })) return shop({ stick: 3, stone: 3 });
          return build('campfire', h.cx, h.cy) !== 'fail';
        }
        if (!fire.lit) {
          if (fire.fuel <= 0 && !has('stick') && !has('wood')) return fetch('stick');
          if (!walkToFire(fire, 1.6)) return true;
          tendFire(fire, 120);
          if (!fire.lit) { if (!has('flint')) return fetch('flint'); game.structures.light(fire); }
          return true;
        }
        return false;
      }],
      ['wood6', () => cnt('wood') < (bot.mem.upg ? 1 : 6) && fetch('wood')],
      ['workbench', () => prof.workbench && !nStruct('workbench') && buildProj('workbench', { wood: 4, stone: 2 })],
      ['walls', () => prof.walls && wallsProject()],
      ['spear', () => !has('spear') && makeTool('spear', { stick: 2, flint: 1, fiber: 1 })],
      ['bandage', () => prof.hunt && cnt('bandage') < 2 && (has('hide') || cnt('stick') > 100) && has('fiber') && core.canCraft('bandage_hide') && core.craft('bandage_hide')],
      ['cookcarry', () => { const f = homeFire(); if (!f || !f.lit || !(has('raw_meat') || has('raw_fish'))) return false; if (!walkToFire(f, 2.0)) return true; if (core.canCraft('cooked_meat') && has('raw_meat')) core.craft('cooked_meat'); else if (has('raw_fish')) core.craft('cooked_fish'); return true; }],
      ['food', () => {
        if (!prof.hunt || foodStock() >= prof.foodWant) return false;
        const h = home();
        if (cnt('berries') < 6 && T().toNight > 80 && core.nearest(['berry_bush'], (o) => !nearDen(o) && tileDist(o.tx, o.ty, h.cx, h.cy) < prof.maxRange)) return fetch('berries');
        if (core.hasTool('bow') && !has('arrow')) { if (has('flint')) return craftAt('arrow', { stick: 1, flint: 1 }); if (cnt('stick') < 1) return fetch('stick'); if (fetch('flint', { range: prof.maxRange })) return true; }
        return huntStep();
      }],
      ['hides1', () => prof.clothing && dayNo() >= 2 && !coatWorn('fur_coat') && cnt('hide') < 5 && budget('hides1', 80, huntStep)],
      ['stone', () => budget('stone', prof.stoneBudget ?? 150, stoneUpgrade)],
      ['spikes', () => budget('spikes', prof.spikeBudget ?? 110, spikeProject)],
      ['wreck', () => prof.expeditions && dayNo() >= (prof.wreckDay ?? 3) && wreckProject()],
      ['coat', () => prof.clothing && !coatWorn('fur_coat') && has('hide', 5) && (cnt('rope') >= 2 ? craftAt('fur_coat', { hide: 5, rope: 2 }) : ropeFor(2))],
      ['boots', () => prof.clothing && !coatWorn('fur_boots') && has('hide', 3) && (cnt('rope') >= 1 ? craftAt('fur_boots', { hide: 3, rope: 1 }) : ropeFor(1))],
      ['hat', () => prof.clothing && !coatWorn('fur_hat') && has('hide', 2) && (cnt('rope') >= 1 ? craftAt('fur_hat', { hide: 2, rope: 1 }) : ropeFor(1))],
      ['iron', () => prof.iron && dayNo() >= (prof.ironDay ?? 4) && ironProject()],
      ['tower', () => prof.endgame && towerProject()],
      ['bow', () => budget('bow', 120, bowProject)],
      ['rack', () => rackProject()],
      ['hide2', () => prof.bedroll && nStruct('bedroll') === 0 && !has('hide', 2) && prof.hunt && budget('hide2', 150, huntStep)],
      ['snares', () => snareProject()],
      ['bedroll', () => prof.bedroll && nStruct('bedroll') === 0 && has('hide', 2) && (cnt('fiber') < 3 ? fetch('fiber') : buildProj('bedroll', { fiber: 3, hide: 2 }))],
      ['woodstock', () => cnt('wood') < prof.stockpileWood && fetch('wood')],
      ['sticks', () => cnt('stick') < 6 && fetch('stick')],
      ['hides', () => prof.clothing && (!coatWorn('fur_coat') || !coatWorn('fur_boots') || !coatWorn('fur_hat')) && cnt('hide') < 10 && budget('hides', 150, huntStep)],
    ];
    for (const [name, fn] of steps) if (fn()) { bot.plan.step = name; return true; }
    bot.plan.step = 'none';
    return false;
  });

  function coatWorn(id) { const I = S().inventory; return I.clothing.some((c) => c && c.id === id) || ['bag', 'hotbar'].some((a) => I[a].some((c) => c && c.id === id)); }


  // ------------------------------------------------------------ late game: repair, stone, spikes, iron, wreckage, tower
  const STONE_RING = () => RING.map(([dx, dy]) => [home().cx + dx, home().cy + dy]);
  const SPIKES = [];
  for (let dx = -2; dx <= 2; dx++) SPIKES.push([dx, -3]);
  for (let dy = -2; dy <= 2; dy++) { SPIKES.push([-3, dy]); SPIKES.push([3, dy]); }
  SPIKES.push([-2, 3], [2, 3]);
  const FREE_FURNACE = [[3, 0], [-3, 0], [3, 1], [-3, 1]];
  const hpFrac = (o) => (o.hp ?? STRUCTURES[o.type].hp) / STRUCTURES[o.type].hp;
  const dayNo = () => S().time.day;
  const daySafe = (secs) => T().toNight > secs && !T().isNight;

  rule('repair', () => {
    if (!prof.walls) return false;
    const h = home(), t = T();
    if (!t.isNight && t.toNight < 20) return false;
    let worst = null;
    for (const o of game.building.listAll()) {
      if (!['wood_wall', 'stone_wall', 'door', 'spike_barricade', 'workbench', 'radio_tower'].includes(o.type)) continue;
      if (tileDist(o.tx, o.ty, h.cx, h.cy) > 8 || hpFrac(o) > 0.6) continue;
      const mat = { wood_wall: 'wood', stone_wall: 'stone', door: 'wood', spike_barricade: 'wood', workbench: 'wood', radio_tower: 'iron_ingot' }[o.type];
      if (!has(mat)) continue;
      if (!worst || hpFrac(o) < hpFrac(worst)) worst = o;
    }
    if (!worst) return false;
    if (core.hostiles(5).length && !sheltered()) return false;
    if (core.distTilesTo(worst.tx, worst.ty) > 1.9) {
      nav.goTo(`rep:${worst.tx},${worst.ty}`, (x, y) => walkable(x, y) && tileDist(x, y, worst.tx, worst.ty) <= 1.5 && tileDist(x, y, worst.tx, worst.ty) >= 1);
      return true;
    }
    nav.stop();
    if (game.time >= (bot.mem.repT || 0)) { bot.mem.repT = game.time + 0.45; game.structures.repair(worst); bot.counters.repairs = (bot.counters.repairs || 0) + 1; }
    return true;
  });

  function stoneUpgrade() {
    if (!prof.stone || dayNo() < 3) return false;
    const walls = STONE_RING().map(([x, y]) => W().objectAt(x, y)).filter((o) => o && o.type === 'wood_wall');
    const pend = bot.mem.upg;
    if (pend) {                                          // wall dismantled: put the stone one in right away
      const o = W().objectAt(pend.tx, pend.ty);
      if (o && o.type === 'stone_wall') { bot.mem.upg = null; return false; }
      if (o && o.type === 'wood_wall') { if (!daySafe(25)) { core.endDismantle(); bot.mem.upg = null; return false; } core.hold('hands'); core.dismantle(o); return true; }
      core.endDismantle();
      if (!haveAll({ stone: 3, wood: 1 })) {
        if (!daySafe(100) && cnt('wood') >= 2) { const r2 = build('wood_wall', pend.tx, pend.ty); if (r2 !== 'moving') bot.mem.upg = null; return true; }   // never leave a hole in the ring over a night: patch with wood
        if (cnt('wood') < 1) return fetch('wood'); return fetch('stone');
      }
      const r = build('stone_wall', pend.tx, pend.ty); if (r === 'fail') bot.mem.upg = null; return true;
    }
    if (!walls.length) return false;
    if (!daySafe(90)) return false;
    const batch = Math.min(walls.length, 5);                        // gather stone for a whole batch of walls, then convert them in one go
    if (cnt('stone') < 3 * batch || cnt('wood') < batch) return cnt('wood') < batch ? fetch('wood') : fetch('stone');
    const o = walls.sort((a, b) => core.distTilesTo(a.tx, a.ty) - core.distTilesTo(b.tx, b.ty))[0];
    bot.mem.upg = { tx: o.tx, ty: o.ty };
    return true;
  }
  function spikeProject() {
    if (!prof.spikes || dayNo() < 3 || !roomClosed()) return false;
    const h = home();
    const todo = SPIKES.map(([dx, dy]) => [h.cx + dx, h.cy + dy]).filter(([x, y]) => !W().objectAt(x, y) && walkable(x, y));
    if (!todo.length) return false;
    if (!daySafe(70)) return false;
    if (!haveAll({ stick: 3, wood: 1 })) return cnt('wood') < 1 ? fetch('wood') : fetch('stick');
    todo.sort((a, b) => core.distTilesTo(a[0], a[1]) - core.distTilesTo(b[0], b[1]));
    const r = build('spike_barricade', todo[0][0], todo[0][1]);
    return r !== 'fail' || false;
  }
  const IRON_NEED = () => (cnt('iron_ingot') + (has('iron_spear') ? 2 : 0) + (has('iron_axe') ? 2 : 0));
  function ingotsWanted() {
    let n = 6;                                              // tower
    if (!core.hasTool('spear') || !coatWorn('iron_spear')) n += 2;
    if (!coatWorn('iron_axe')) n += 2;
    return n;
  }
  function furnaceObj() { return firstStruct('furnace'); }
  function ironProject() {
    if (!prof.iron || bot.mem.noIron) return false;
    if (game.building.listAll().some((o) => o.type === 'radio_tower')) return false;
    const h = home();
    const want = ingotsWanted() - (has('iron_ingot') ? cnt('iron_ingot') : 0) + (has('radio_antenna') ? 0 : 0);
    const haveIngots = cnt('iron_ingot');
    const toolsDone = coatWorn('iron_spear');
    // 1 craft tools with ingots in hand
    if (!toolsDone && haveIngots >= 2 && !coatWorn('iron_spear')) return craftAt('iron_spear', { iron_ingot: 2, stick: 2, rope: 1 }) || ropeFor(1);
        const ingotsTotal = haveIngots;
    const needIngots = (coatWorn('iron_spear') ? 0 : 2) + 6;                       // tower + iron spear (the iron axe is a luxury)
    if (ingotsTotal >= needIngots - ((coatWorn('iron_spear') ? 0 : 2) + (coatWorn('iron_axe') ? 0 : 2)) && toolsDone) return false;   // enough for the tower
    if (ingotsTotal >= needIngots) return false;
    // 2 smelt
    const fur = furnaceObj();
    const ore = cnt('iron_ore'), coal = cnt('coal');
    if (fur && ore >= 2 && coal >= 1) {
      if (!fur.lit) { if (fur.fuel <= 0) { if (has('wood')) { if (!walkToFire(fur, 1.8)) return true; game.structures.addFuel(fur, 'wood'); } else return fetch('wood'); } if (!walkToFire(fur, 1.8)) return true; game.structures.light(fur); return true; }
      if (fur.fuel < 120 && has('wood')) { if (!walkToFire(fur, 1.8)) return true; game.structures.addFuel(fur, 'wood'); return true; }
      if (!game.stationQuery().includes('furnace')) { walkToFire(fur, 2.2); return true; }
      core.stop(); core.craft('iron_ingot'); return true;
    }
    // 3 build furnace (needs 8 stone 2 coal)
    if (!fur && coal >= 2 && cnt('stone') >= 8 && roomClosed() !== undefined) {
      for (const [dx, dy] of FREE_FURNACE) { const x = h.cx + dx, y = h.cy + dy; if (!W().objectAt(x, y) || trivial(W().objectAt(x, y))) { const r = build('furnace', x, y); if (r !== 'fail') return true; } }
    }
    // 4 mine: need coal first for furnace, then ore/coal for ingots
    if (!daySafe(80)) return false;
    if (!core.hasTool('pickaxe')) return makeTool('stone_pickaxe', { stick: 2, stone: 3, fiber: 1 });
    if (!fur && cnt('stone') < 8) return fetch('stone');
    const needCoal = (fur ? 0 : 2) + Math.max(0, Math.ceil(needIngots - haveIngots)) + 1;
    const needOre = Math.max(0, (needIngots - haveIngots) * 2);
    const sel = ore < needOre && (cnt('iron_ore') <= cnt('coal') * 2 || coal >= needCoal) ? 'iron_ore' : coal < needCoal ? 'coal' : null;
    if (!sel) return false;
    if (!has('iron_spear') && core.hasTool('bow') && cnt('arrow') < 5) {        // a bear guards every vein: top up arrows first
      if (has('flint') && cnt('stick') >= 1) return craftAt('arrow', { stick: 1, flint: 1 });
      return cnt('stick') < 1 ? fetch('stick') : fetch('flint');
    }
    if (!(has('iron_spear') || (core.hasTool('bow') && cnt('arrow') >= 5))) return false;   // iron spear or a bow with arrows
    if (P().health < 80) return false;
    const r = fetch(sel, { allowDen: true, range: 99 });
    if (!r) { bot.mem.ironMiss = (bot.mem.ironMiss || 0) + 1; if (bot.mem.ironMiss > 200) bot.mem.noIron = true; }
    return r;
  }
  function wreckProject() {
    if (!prof.expeditions) return false;
    if (core.has('radio_antenna') && core.has('radio_battery') && core.has('radio_circuit')) return false;
    const taken = S().flags.partsFound || {};
    const wr = core.ofType('wreckage').filter((o) => !o.depleted && !core.isBlockedObj(o) && !(o.partTaken));
    if (!wr.length) return false;
    const me = P();
    wr.sort((a, b) => core.distTilesTo(a.tx, a.ty) - core.distTilesTo(b.tx, b.ty));
    const o = wr[0], d = tileDist(o.tx, o.ty, home().cx, home().cy);
    if (!daySafe(d / 2.4 * 2 + 50)) return false;
    if (P().health < 60) return false;
    void taken; void me;
    return core.work(o, { press: true, sprint: true }) !== 'gone';
  }
  function towerProject() {
    const has3 = has('radio_antenna') && has('radio_battery') && has('radio_circuit');
    const tower = game.building.listAll().find((o) => o.type === 'radio_tower');
    if (tower) {
      const eg = S().endgame;
      if (!eg.transmitting && tower) { game.endgame.setTransmitting(true); }
      return false;
    }
    if (!has3 || cnt('iron_ingot') < 6) return false;
    if (cnt('wood') < 6) return fetch('wood');
    if (cnt('rope') < 2) return ropeFor(2);
    const h = home();
    return build('radio_tower', h.cx, h.cy - 1) !== 'fail';
  }


  // ------------------------------------------------------------ passive food: snares; ranged: bow
  const SNARE_N = 4;
  function snareProject() {
    if (!prof.snares) return false;
    const snares = game.building.list('snare'), h = home();
    for (const o of snares) if (o.caught && !core.isBlockedObj(o)) { const r = core.work(o, { interact: true }); if (r === 'unreachable' || r === 'gone') core.blockObj(o, 60); return true; }
    let n = 0; for (const _ of snares) n++;
    if (n >= SNARE_N || !daySafe(100)) return false;
    if (cnt('stick') < 2) return fetch('stick');
    if (cnt('rope') < 1) return ropeFor(1);
    // pick a spot ring 8..11 from home, spread by index
    const base = n * (Math.PI / 2) + 0.4;
    for (let k = 0; k < 20; k++) {
      const a = base + k * 0.25 * (k % 2 ? 1 : -1), d = 8 + (k % 4);
      const tx = Math.round(h.cx + Math.cos(a) * d), ty = Math.round(h.cy + Math.sin(a) * d);
      if (!walkable(tx, ty) || W().objectAt(tx, ty) || W().terrainAt(tx, ty) === 'ice' || nearDen({ tx, ty }, 14)) continue;
      return build('snare', tx, ty) !== 'fail';
    }
    return false;
  }
  function bowProject() {
    if (!prof.hunt || !core.hasTool('spear')) return false;
    if (!core.hasTool('bow')) return nStruct('workbench') > 0 && craftAt('bow', { stick: 3, rope: 2 }) || (cnt('rope') < 2 && nStruct('workbench') > 0 ? ropeFor(2) : false);
    if (cnt('arrow') < 8 && has('flint')) return craftAt('arrow', { stick: 1, flint: 1 });
    if (cnt('arrow') < 4 && !has('flint') && daySafe(80)) return fetch('flint');
    return false;
  }


  function rackProject() {
    if (!prof.rack || !prof.hunt) return false;
    const rack = firstStruct('drying_rack');
    if (!rack) {
      if (!roomClosed() || nStruct('bedroll') === 0 || !daySafe(60)) return false;
      if (cnt('stick') < 4) return false;
      if (cnt('rope') < 2) return ropeFor(2);
      return buildProj('drying_rack', { stick: 4, rope: 2 });
    }
    const done = rack.slots.filter((x) => x && x.done).length, used = rack.slots.filter(Boolean).length;
    if ((done > 0 || (has('raw_meat') && used < rack.slots.length)) && !core.hostiles(8).length) {
      if (core.distTilesTo(rack.tx, rack.ty) > 1.7) { nav.goTo(`rack`, (x, y) => walkable(x, y) && tileDist(x, y, rack.tx, rack.ty) <= 1.5 && tileDist(x, y, rack.tx, rack.ty) >= 1); return true; }
      nav.stop(); if (game.time >= (bot.mem.rackT || 0)) { bot.mem.rackT = game.time + 0.5; game.input.press('interact'); const c = core.center(rack); const p = P(); nav.push(c.x - p.x, c.y - p.y); }
      return true;
    }
    return false;
  }

  function sleepWatch() { const p = P(); if (p.thirst < 12 || p.hunger < 12) game.sleep.wake('manual'); }
  return { rules, sleepWatch, home, homeFire, fetch, build };
}
