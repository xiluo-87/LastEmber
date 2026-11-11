// Policy rules for the playtest bot (see bot.mjs). createGoals(bot) -> { rules:[fn...], sleepWatch }. Each rule returns true if it acted.
import { TILE } from '../../src/data/balance.js';
import { STRUCTURES } from '../../src/data/structures.js';
import { eatSnow } from '../../src/systems/itemactions.js';
import { tileDist } from './nav.mjs';

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
  const trivial = (o) => !o || o.type === 'loose_stone' || o.type === 'loose_stick' || o.type === 'stump' || o.type === 'rubble';

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
    if (o && o.type.startsWith('loose')) return core.work(o, { press: true }) === 'working' ? 'moving' : 'fail';
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
    const o = core.nearest(types, (x) => {
      if (!opts.allowDen && nearDen(x)) return false;
      const dh = tileDist(x.tx, x.ty, h.cx, h.cy);
      if (dh > range) return false;
      if (x.type === 'rock_node' && item === 'stone' && !core.hasTool('pickaxe') && (x.hn || 0) >= 4) return false;
      if (!tl.isNight && prof.retreatDusk && dh > 8 && tl.toNight < dh / 2.8 + 25) return false;
      return true;
    });
    if (!o) { bot.noSource = want; return false; }
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

  // ------------------------------------------------------------ rules
  const rules = [];
  const rule = (name, fn) => { Object.defineProperty(fn, 'name', { value: name }); rules.push(fn); };

  rule('fight', () => {
    const p = P(), hs = core.hostiles(8);
    if (!hs.length) { bot.mem.fighting = false; return false; }
    const { c, d } = hs[0];
    const weapon = core.hasTool('spear');
    const pack = hs.filter((h) => h.c.type === 'wolf').length;
    if (c.type === 'bear' && d > 3) return false;
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
    if (p.status?.bleeding && has('bandage')) { core.use('bandage'); return true; }
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
    if (t.isNight && prof.sleep && prof.bedroll) {
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
    const todo = RING.filter(([dx, dy]) => !W().isBlocked(h.cx + dx, h.cy + dy));
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

  rule('projects', () => {
    const h = home();
    const steps = [
      ['crate', () => { const crate = core.ofType('crash_site').find((o) => !o.depleted); return crate && core.work(crate, { press: true }) !== 'unreachable'; }],
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
      ['wood6', () => cnt('wood') < 6 && fetch('wood')],
      ['workbench', () => prof.workbench && !nStruct('workbench') && buildProj('workbench', { wood: 4, stone: 2 })],
      ['walls', () => prof.walls && wallsProject()],
      ['spear', () => !has('spear') && makeTool('spear', { stick: 2, flint: 1, fiber: 1 })],
      ['bedroll', () => prof.bedroll && !nStruct('bedroll') && has('hide', 2) && buildProj('bedroll', { fiber: 3, hide: 2 })],
      ['woodstock', () => cnt('wood') < prof.stockpileWood && fetch('wood')],
      ['sticks', () => cnt('stick') < 6 && fetch('stick')],
    ];
    for (const [name, fn] of steps) if (fn()) { bot.plan.step = name; return true; }
    bot.plan.step = 'none';
    return false;
  });

  function sleepWatch() { const p = P(); if (p.thirst < 12 || p.hunger < 12) game.sleep.wake('manual'); }
  return { rules, sleepWatch, home, homeFire, fetch, build };
}
