// LATE-GAME SCENARIO HARNESS (round 2 balance).  node tests/sim/scenarios.mjs <defence|signal|bear|expedition|all> [--seeds 10] [--first 1] [--set k=v,...] [--json out]
//
// !! HARNESS, NOT GAMEPLAY: scenarios are built by DIRECT STATE SETUP (world.setObject / inventory.add / time.day), skipping the
// !! mid-game that a real player would have to play. Combat, AI, fuel, weather, wave spawning and the endgame run through the REAL systems,
// !! and the "player" acts only through the real input paths (touch joystick intent + Action button, useStack, structures.repair/addFuel).
// !! The defender/fighter/walker policies below are deliberately SIMPLE (a thinking human does better; see DESIGN.md Appendix A).
//
//  defence     day N, base (interior 5x5 or 3x3) + fire + stocked supplies, one night of natural wolves, simple defender policy
//  signal      same base with the radio tower transmitting (enraged +2, two waves, targets the tower) for 3 nights from day N
//  bear        player vs one bear at its den (stone spear / iron spear / bow)
//  expedition  dawn-to-dusk round trip from spawn to each wreckage (torch / fur / food), optional blizzard mid-trip
import { createGame } from '../../src/game.js';
import { TILE, TIME } from '../../src/data/balance.js';
import { STRUCTURES } from '../../src/data/structures.js';
import { newStructure } from '../../src/logic/structures.js';
import * as inv from '../../src/logic/inventory.js';
import { daylightLength, nightLength } from '../../src/logic/clock.js';
import { createBotCore } from './bot-core.mjs';
import { tileDist } from './nav.mjs';
import { memStorage } from './run.mjs';

// ---------------------------------------------------------------- kits (direct inventory fill)
export const KITS = {
  stone_spear: { weapon: 'spear' },
  iron_spear: { weapon: 'iron_spear' },
  bow: { weapon: 'spear', bow: true },        // bow + 24 arrows + stone spear as the backup
  iron_bow: { weapon: 'iron_spear', bow: true },
};
const STOCK = { wood: 60, stone: 24, stick: 20, cooked_meat: 14, clean_water: 14, bandage: 6 };

function fillKit(game, cfg) {
  const I = game.state.inventory, k = KITS[cfg.kit || 'stone_spear'];
  I.hotbar.fill(null); I.bag.fill(null);
  inv.add(I, k.weapon, 1);
  if (k.bow) { inv.add(I, 'bow', 1); inv.add(I, 'arrow', 24); }
  inv.add(I, 'torch', 1);
  I.clothing.fill(null);
  if (cfg.fur !== false) { I.clothing[0] = inv.makeStack('fur_hat'); I.clothing[1] = inv.makeStack('fur_coat'); I.clothing[2] = inv.makeStack('fur_boots'); }
  else I.clothing[1] = inv.makeStack('worn_jacket');
  inv.add(I, 'flint', 2);
  restock(game, cfg);
}
export function restock(game, cfg) {
  const I = game.state.inventory, want = { ...STOCK, wood: cfg.wood ?? STOCK.wood, stone: cfg.stoneStock ?? STOCK.stone, ...(cfg.stock || {}) };
  for (const [id, n] of Object.entries(want)) { const have = inv.count(I, id); if (have < n) inv.add(I, id, n - have); }
  const k = KITS[cfg.kit || 'stone_spear'];
  if (k.bow && inv.count(I, 'arrow') < 24) inv.add(I, 'arrow', 24 - inv.count(I, 'arrow'));
}

// ---------------------------------------------------------------- world set-up
const put = (game, type, tx, ty) => { const o = newStructure(type); game.world.setObject(tx, ty, o); return o; };

/** Clear a box around spawn (terrain -> snow, objects removed) and return the base centre. */
export function clearSite(game, r = 14) {
  const w = game.world, sp = w.data.spawn;
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    const tx = sp.tx + dx, ty = sp.ty + dy;
    w.setTerrain(tx, ty, 'snow'); w.removeObject(tx, ty);
  }
  return { cx: sp.tx, cy: sp.ty };
}

/** Walled base around a campfire: ring of `wall` at Chebyshev distance half+1 (corners left open, door south), optional spike ring and torch posts. */
export function buildBase(game, cfg) {
  const half = cfg.half ?? 2, d = half + 1, { cx, cy } = clearSite(game);
  const wall = cfg.wall === 'stone' ? 'stone_wall' : 'wood_wall';
  const ring = (dist, fn) => { for (let dx = -dist; dx <= dist; dx++) for (let dy = -dist; dy <= dist; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === dist && !(Math.abs(dx) === dist && Math.abs(dy) === dist)) fn(dx, dy); };
  ring(d, (dx, dy) => { if (dx === 0 && dy === d) put(game, 'door', cx, cy + d); else put(game, wall, cx + dx, cy + dy); });
  if (cfg.spikes) ring(d + 1, (dx, dy) => { if (cfg.spikeGap && dx === 0 && dy === d + 1) return; put(game, 'spike_barricade', cx + dx, cy + dy); });
  if (cfg.torches) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(game, 'torch_post', cx + sx * d, cy + sy * d);
  const fire = put(game, 'campfire', cx, cy); fire.fuel = 600; fire.lit = true; fire.everLit = true;
  put(game, 'workbench', cx - 1, cy - 1);
  game.building.onLoad?.(game);               // rebuild room index after bulk edits
  return { cx, cy, d, fire };
}

export function newScenario(seed, cfg) {
  const game = createGame({ storage: memStorage() });
  game.newGame(seed);
  const base = buildBase(game, cfg);
  const t = game.state.time, p = game.state.player;
  t.day = cfg.day; t.t = daylightLength(cfg.day) - (cfg.leadIn ?? 45);
  p.x = base.cx * TILE + TILE / 2; p.y = (base.cy + 1) * TILE + TILE / 2;
  fillKit(game, cfg);
  if (cfg.tower) {                                         // radio tower next to the fire, transmitting
    const tw = put(game, 'radio_tower', base.cx, base.cy - 1);
    game.state.endgame.tower = { tx: tw.tx, ty: tw.ty };
    game.endgame.setTransmitting(true);
  }
  game.building.onLoad?.(game);
  game.creatures && game.creatureRt && (game.creatureRt.px = p.x, game.creatureRt.py = p.y);
  game.weather.force(cfg.weather || null, 600);
  return { game, base };
}

// ---------------------------------------------------------------- defender policy
function createDefender(game, base, cfg) {
  const core = createBotCore(game), nav = core.nav, P = () => game.state.player, W = () => game.world;
  const d = base.d, has = (i, n = 1) => core.has(i, n);
  const interior = [];
  for (let dx = -(d - 1); dx <= d - 1; dx++) for (let dy = -(d - 1); dy <= d - 1; dy++) interior.push({ tx: base.cx + dx, ty: base.cy + dy });
  const walkable = (x, y) => nav.walkable(x, y);
  const inside = (x, y) => Math.abs(x - base.cx) <= d - 1 && Math.abs(y - base.cy) <= d - 1;
  const fire = () => W().objectAt(base.cx, base.cy);
  const st = { repT: 0, fuelT: 0, acts: { attack: 0, repair: 0, shoot: 0, fuel: 0, bandage: 0 } };
  const hpFrac = (o) => (o.hp ?? STRUCTURES[o.type].hp) / STRUCTURES[o.type].hp;
  const MAT = { wood_wall: 'wood', stone_wall: 'stone', door: 'wood', spike_barricade: 'wood', radio_tower: 'iron_ingot', workbench: 'wood' };

  function goInside(key, tx, ty) {
    const me = core.tile();
    if (me.tx === tx && me.ty === ty) { nav.stop(); return true; }
    nav.goTo(key, (x, y) => x === tx && y === ty); return false;
  }
  function damaged(maxFrac) {
    let worst = null;
    for (const o of game.building.listAll()) {
      const m = MAT[o.type]; if (!m || !has(m)) continue;
      if (tileDist(o.tx, o.ty, base.cx, base.cy) > d + 2.5 || hpFrac(o) > maxFrac) continue;
      if (!worst || hpFrac(o) < hpFrac(worst)) worst = o;
    }
    return worst;
  }
  function repairStep(o) {
    // stand on the interior tile closest to the structure
    let best = null, bd = 1e9;
    for (const t of interior) { if (!walkable(t.tx, t.ty)) continue; const dd = tileDist(t.tx, t.ty, o.tx, o.ty); if (dd < bd) { bd = dd; best = t; } }
    if (!best) return false;
    if (core.distTilesTo(o.tx, o.ty) > 1.9) { goInside(`rep:${best.tx},${best.ty}`, best.tx, best.ty); return true; }
    nav.stop();
    if (game.time >= st.repT) { st.repT = game.time + 0.45; if (game.structures.repair(o).ok) st.acts.repair++; }
    return true;
  }
  function hostiles() { return core.hostiles(14).filter((h) => h.c.type === 'wolf'); }
  const LOS = (c) => { const p = P(); const n = Math.ceil(Math.hypot(c.x - p.x, c.y - p.y) / 8); for (let i = 1; i < n; i++) if (W().isBlockedAtPx(p.x + ((c.x - p.x) * i) / n, p.y + ((c.y - p.y) * i) / n)) return false; return true; };

  function think() {
    const p = P(), t = core.time();
    if (game.sleep?.active) return;
    // 1 vitals
    if (p.status?.bleeding && has('bandage')) { core.use('bandage'); st.acts.bandage++; return; }
    if (p.hunger < 45 && has('cooked_meat')) { core.use('cooked_meat'); return; }
    if (p.thirst < 45 && has('clean_water')) { core.use('clean_water'); return; }
    const ws = hostiles(), near = ws.filter((h) => h.d <= 9);
    // 2 fire (cheap, do between fights)
    const f = fire();
    if (f && f.fuel < 260 && has('wood') && !(near.length && near[0].d < 3.2)) {
      if (core.distTilesTo(f.tx, f.ty) > 2.4) { goInside('fuel', f.tx, f.ty + 1); return; }
      for (let i = 0; i < 6; i++) if (!game.structures.addFuel(f, 'wood').ok) break;
      if (!f.lit && f.fuel > 0) game.structures.light(f);
      st.acts.fuel++; return;
    }
    // 3 fight
    if (near.length) {
      const { c, d: dist } = near[0];
      const bow = KITS[cfg.kit || 'stone_spear'].bow && has('arrow') && dist >= 2.4 && dist <= 6.3 && LOS(c);
      if (bow) {
        core.hold('bow'); const a = Math.atan2(c.y - p.y, c.x - p.x);
        nav.push(Math.cos(a), Math.sin(a)); nav.stop(); p.facing = a; core.act(true, true); st.acts.shoot++; return;
      }
      core.hold(has('iron_spear') ? 'spear' : 'spear');
      if (dist <= 2.15) {                                       // reach 1.8 + wolf radius, works through a wall
        // repair first when the wall between us is nearly gone and a wolf is chewing it
        const w = damaged(0.35); if (w && tileDist(w.tx, w.ty, c.x / TILE, c.y / TILE) < 2.2 && core.distTilesTo(w.tx, w.ty) < 2.2) { repairStep(w); return; }
        nav.push(c.x - p.x, c.y - p.y); core.act(true, true); st.acts.attack++; return;
      }
      // reposition to the interior tile nearest the wolf (stay inside)
      const w = damaged(0.5); if (w) { repairStep(w); return; }
      let best = null, bd = 1e9;
      for (const tl of interior) { if (!walkable(tl.tx, tl.ty)) continue; const dd = Math.hypot(tl.tx * TILE + 16 - c.x, tl.ty * TILE + 16 - c.y); if (dd < bd) { bd = dd; best = tl; } }
      if (best && bd / TILE > 1.6) { core.act(false); goInside('react', best.tx, best.ty); return; }
      core.act(false); nav.stop(); return;
    }
    core.act(false);
    // 4 repairs when quiet
    const w = damaged(0.8); if (w) { repairStep(w); return; }
    // 5 idle at the fire
    if (core.distTilesTo(base.cx, base.cy) > 1.9) goInside('home', base.cx, base.cy + 1); else nav.stop();
  }
  return { think, st, core };
}

// ---------------------------------------------------------------- generic runner (defence / signal)
export function runNight(seed, cfg) {
  const { game, base } = newScenario(seed, cfg);
  const def = createDefender(game, base, cfg), core = def.core;
  const r = { seed, hpLost: 0, minHp: 100, walls: 0, wallsByType: {}, spikesLost: 0, wolvesKilled: 0, wolvesBySpikes: 0, maxWolves: 0, died: false, won: false, cause: 'alive', nights: 0, towerLost: false, over: null };
  const startDay = cfg.day, nights = cfg.nights || 1;
  game.events.on('player:damaged', ({ amount }) => { r.hpLost += amount; });
  game.events.on('structure:destroyed', ({ type }) => { if (type === 'radio_tower') r.towerLost = true; else if (type === 'spike_barricade') r.spikesLost++; else { r.walls++; r.wallsByType[type] = (r.wallsByType[type] || 0) + 1; } });
  game.events.on('creature:killed', ({ c, by }) => { if (c.type === 'wolf') { r.wolvesKilled++; if (by === 'spikes') r.wolvesBySpikes++; } });
  game.events.on('game:over', (e) => { r.over = e; r.died = e.kind === 'death'; r.won = e.kind === 'victory'; r.cause = e.causeId || e.cause || e.kind; });
  game.events.on('time:newDay', ({ day }) => { if (cfg.restock !== false) restock(game, cfg); r.nights = day - startDay; if (cfg.autoTransmit !== false && cfg.tower && game.endgame.tower()) game.endgame.setTransmitting(true); });
  const endDay = startDay + nights;
  let guard = 0;
  while (game.mode === 'playing' && guard++ < 400000) {
    def.think(); game.step(6);
    const p = game.state.player; r.minHp = Math.min(r.minHp, p.health);
    const nw = game.state.creatures.list.reduce((n, c) => n + (c.type === 'wolf' ? 1 : 0), 0); if (nw > r.maxWolves) r.maxWolves = nw;
    const tm = game.state.time;
    if (!cfg.tower && tm.day >= endDay && tm.t > 90) break;
    if (cfg.tower && tm.day >= endDay + 1) break;                 // safety: should have been won by then
  }
  r.nightsCounted = game.state.endgame.nights; r.acts = def.st.acts;
  r.day = game.state.time.day;
  return r;
}

// ---------------------------------------------------------------- bear scenario
const BEAR_KITS = { stone_spear: { weapon: 'spear' }, iron_spear: { weapon: 'iron_spear' }, bow: { weapon: 'spear', bow: true }, iron_bow: { weapon: 'iron_spear', bow: true } };
export function runBear(seed, cfg) {
  const game = createGame({ storage: memStorage() }); game.newGame(seed);
  const { cx, cy } = clearSite(game, 22);
  game.state.time.day = cfg.day ?? 5; game.state.time.t = 120;
  const I = game.state.inventory; I.hotbar.fill(null); I.bag.fill(null); I.clothing.fill(null);
  const k = BEAR_KITS[cfg.kit]; inv.add(I, k.weapon, 1); if (k.bow) { inv.add(I, 'bow', 1); inv.add(I, 'arrow', 30); }
  inv.add(I, 'bandage', cfg.bandages ?? 2);
  I.clothing[1] = inv.makeStack('fur_coat'); I.clothing[0] = inv.makeStack('fur_hat'); I.clothing[2] = inv.makeStack('fur_boots');
  // place a den and put the bear next to it; the player starts 11 tiles away (outside territory 6, inside nothing)
  const den = { tx: cx + 14, ty: cy };
  game.world.setObject(den.tx, den.ty, { type: 'bear_den' });
  const cr = game.state.creatures;
  for (const c of cr.list.slice()) if (c.type === 'bear') game.creatures.killCreature(game, c); cr.carcasses.length = 0;
  cr.dens = [{ tx: den.tx, ty: den.ty, id: 0, respawnDay: 0 }];
  const dc = game.world.tileCenter(den.tx, den.ty);
  const bear = game.creatures.spawnCreature(game, 'bear', dc.x - TILE, dc.y, { home: { x: dc.x, y: dc.y }, den: 0 }); cr.dens[0].id = bear.id;
  for (const c of cr.list.slice()) if (c.type !== 'bear') c.hp = 0, cr.list.splice(cr.list.indexOf(c), 1);
  game.creatureRt.px = game.state.player.x;
  const p = game.state.player; p.x = (den.tx - 12) * TILE + 16; p.y = cy * TILE + 16;
  const core = createBotCore(game), nav = core.nav;
  const r = { seed, hpLost: 0, won: false, died: false, bandaged: 0, time: 0, hits: 0 };
  game.events.on('player:damaged', ({ amount }) => { r.hpLost += amount; });
  game.events.on('creature:killed', ({ c }) => { if (c.type === 'bear') r.won = true; });
  game.events.on('game:over', () => { r.died = true; });
  const arrows = () => core.count('arrow');
  let dodgeT = 0, guard = 0;
  const has = (i) => core.has(i);
  while (game.mode === 'playing' && !r.won && guard++ < 60000) {
    const b = cr.list.find((c) => c.type === 'bear');
    if (!b) break;
    const d = Math.hypot(b.x - p.x, b.y - p.y) / TILE;
    if (p.status?.bleeding && has('bandage') && d > 2.5) { core.use('bandage'); r.bandaged++; }
    else if (k.bow && has('arrow')) {
      // kite: shoot at 4-6 tiles, back off (sprint) when the bear closes in
      const away = Math.atan2(p.y - b.y, p.x - b.x);
      if (d < 3.2) { core.act(false); nav.push(Math.cos(away), Math.sin(away), p.stamina > 8); }
      else if (d <= 6.4) { core.hold('bow'); const a = Math.atan2(b.y - p.y, b.x - p.x); nav.stop(); p.facing = a; core.act(true, true); }
      else { core.act(false); nav.push(b.x - p.x, b.y - p.y, false); }
    } else {
      core.hold('spear');
      if (cfg.dodge && b.ai === 'windup' && d < 2.4) { dodgeT = 0.5; }
      if (dodgeT > 0) { dodgeT -= 0.1; const away = Math.atan2(p.y - b.y, p.x - b.x); core.act(false); nav.push(Math.cos(away), Math.sin(away), true); }
      else if (d > 2.0) { core.act(false); nav.push(b.x - p.x, b.y - p.y, d > 4 && p.stamina > 30); }
      else { nav.push(b.x - p.x, b.y - p.y); core.act(true, true); }
    }
    game.step(6); r.time += 0.1;
    if (game.state.player.health <= 0) break;
  }
  r.hp = Math.max(0, p.health); r.died = game.mode === 'over' && !r.won;
  return r;
}

// ---------------------------------------------------------------- expedition scenario
export function runExpedition(seed, cfg) {
  const game = createGame({ storage: memStorage() }); game.newGame(seed);
  const t = game.state.time; t.day = cfg.day; t.t = TIME.dawnLength;
  const I = game.state.inventory; I.hotbar.fill(null); I.bag.fill(null); I.clothing.fill(null);
  inv.add(I, 'spear', 1); inv.add(I, 'torch', cfg.torches ?? 2); inv.add(I, 'cooked_meat', 6); inv.add(I, 'clean_water', 4); inv.add(I, 'bandage', 2);
  if (cfg.emergency !== false) { inv.add(I, 'stick', 10); inv.add(I, 'stone', 6); inv.add(I, 'flint', 1); inv.add(I, 'wood', 6); }
  I.clothing[1] = inv.makeStack('worn_jacket');
  if (cfg.fur) { I.clothing[0] = inv.makeStack('fur_hat'); I.clothing[1] = inv.makeStack('fur_coat'); I.clothing[2] = inv.makeStack('fur_boots'); }
  const core = createBotCore(game), nav = core.nav, P = () => game.state.player;
  const wr = core.ofType('wreckage').slice().sort((a, b) => Math.hypot(a.tx - 64, a.ty - 64) - Math.hypot(b.tx - 64, b.ty - 64));
  const target = wr[cfg.site ?? 0];
  const r = { seed, site: cfg.site ?? 0, dist: target ? Math.round(Math.hypot(target.tx - 64, target.ty - 64)) : 0, minWarmth: 100, looted: false, home: false, died: false, cause: 'alive', secs: 0, daylightLeft: 0, campfires: 0, torches: 0 };
  game.events.on('game:over', (e) => { r.died = true; r.cause = e.causeId || e.cause; });
  const dl = daylightLength(cfg.day), t0 = t.t;
  const hasFire = () => { const me = core.tile(); return core.fireNear(me.tx, me.ty, 6); };
  let phase = 'out', camp = null, guard = 0, blizzDone = false, lastUnlit = 0;
  const homeTx = 64, homeTy = 66;
  while (game.mode === 'playing' && !r.home && guard++ < 80000) {
    const p = P(), now = t.t;
    r.minWarmth = Math.min(r.minWarmth, p.warmth);
    if (cfg.blizzard && !blizzDone && now - t0 > (cfg.blizzardAt ?? 40)) { game.weather.force('blizzard', cfg.blizzardLen ?? 120); blizzDone = true; }
    if (now > dl + 60) break;                                           // night caught us: stop (counts as failure)
    // survival micro: eat/drink/bandage, torch when cold
    if (p.status?.bleeding && core.has('bandage')) core.use('bandage');
    else if (p.hunger < 40 && core.has('cooked_meat')) core.use('cooked_meat');
    else if (p.thirst < 40 && core.has('clean_water')) core.use('clean_water');
    if (p.warmth < 55 && core.has('torch') && !core.me().torchLit) { const tk = core.findRef('torch'); if (tk && !(game.state.inventory.hotbar[game.state.inventory.selected]?.burn > 0) && !heldTorchOn(game)) { core.hold('torch'); core.use('torch'); r.torches++; } }
    // emergency campfire
    if (!camp && p.warmth < 22 && cfg.emergency !== false && core.has('stick', 3) && core.has('stone', 3) && core.has('flint')) {
      const me = core.tile(); let spot = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!game.world.isBlocked(me.tx + dx, me.ty + dy) && !game.world.objectAt(me.tx + dx, me.ty + dy)) { spot = { tx: me.tx + dx, ty: me.ty + dy }; break; }
      if (spot && core.place('campfire', spot.tx, spot.ty)) { camp = game.world.objectAt(spot.tx, spot.ty); r.campfires++; }
    }
    if (camp) {
      const f = game.world.objectAt(camp.tx, camp.ty);
      if (!f) camp = null; else {
        nav.stop(); core.act(false);
        for (let i = 0; i < 3; i++) if (core.has('wood') && f.fuel + 60 <= 300) game.structures.addFuel(f, 'wood'); else if (core.has('stick') && f.fuel + 20 <= 300) game.structures.addFuel(f, 'stick');
        if (!f.lit && f.fuel > 0) game.structures.light(f);
        if (p.warmth > 70 && !game.weather.isBlizzard()) camp = null;
        game.step(6); continue;
      }
    }
    // walk
    if (phase === 'out') {
      if (!target) break;
      const res = core.work(target, { press: true, sprint: p.stamina > 25 });
      if (target.partTaken || target.depleted || res === 'gone') { r.looted = true; phase = 'back'; }
    } else {
      const res = nav.goTo('home', (x, y) => Math.abs(x - homeTx) + Math.abs(y - homeTy) <= 2, p.stamina > 25);
      if (res === 'arrived' || Math.hypot(p.x / TILE - homeTx, p.y / TILE - homeTy) < 3) r.home = true;
    }
    game.step(6);
  }
  r.secs = Math.round(t.t - t0 + (t.day - cfg.day) * TIME.dayLength);
  r.daylightLeft = Math.round(dl - t.t);
  r.hp = Math.round(game.state.player.health);
  return r;
}
function heldTorchOn(game) { const s = game.state.inventory.hotbar[game.state.inventory.selected]; return !!(s && s.id === 'torch' && s.burn > 0); }

// ---------------------------------------------------------------- CLI
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (n, N) => `${Math.round((100 * n) / N)}%`.padStart(4);
const f = (v, d = 0) => (+v).toFixed(d);

export function summarizeNight(label, rs, signal) {
  const N = rs.length, surv = rs.filter((r) => !r.died).length;
  const base = `${label.padEnd(46)} surv ${pct(surv, N)} | hpLost ${f(rs.reduce((s, r) => s + r.hpLost, 0) / N)} minHp ${f(median(rs.map((r) => r.minHp)))} | walls lost ${f(rs.reduce((s, r) => s + r.walls, 0) / N, 1)} spikes ${f(rs.reduce((s, r) => s + r.spikesLost, 0) / N, 1)} | wolves killed ${f(rs.reduce((s, r) => s + r.wolvesKilled, 0) / N, 1)} (spikes ${f(rs.reduce((s, r) => s + r.wolvesBySpikes, 0) / N, 1)}) maxPack ${Math.max(...rs.map((r) => r.maxWolves))}`;
  if (!signal) return base;
  return `${base} | WIN ${pct(rs.filter((r) => r.won).length, N)} towerLost ${pct(rs.filter((r) => r.towerLost).length, N)} nights ${f(rs.reduce((s, r) => s + r.nightsCounted, 0) / N, 1)} causes ${JSON.stringify(rs.reduce((m, r) => (r.died && (m[r.cause] = (m[r.cause] || 0) + 1), m), {}))}`;
}

export const DEFENCE_GRID = (days = [8, 10, 12]) => {
  const out = [];
  for (const day of days) {
    out.push({ label: 'wood, stone spear', day, wall: 'wood', kit: 'stone_spear' });
    out.push({ label: 'wood, iron spear', day, wall: 'wood', kit: 'iron_spear' });
    out.push({ label: 'wood, bow+arrows', day, wall: 'wood', kit: 'bow' });
    out.push({ label: 'wood+spikes+torches, stone spear', day, wall: 'wood', spikes: true, torches: true, kit: 'stone_spear' });
    out.push({ label: 'stone, stone spear', day, wall: 'stone', kit: 'stone_spear' });
    out.push({ label: 'stone+spikes, stone spear', day, wall: 'stone', spikes: true, kit: 'stone_spear' });
    out.push({ label: 'stone+torches, stone spear', day, wall: 'stone', torches: true, kit: 'stone_spear' });
    out.push({ label: 'stone+spikes+torches, stone spear', day, wall: 'stone', spikes: true, torches: true, kit: 'stone_spear' });
    out.push({ label: 'stone+spikes+torches, iron spear', day, wall: 'stone', spikes: true, torches: true, kit: 'iron_spear' });
  }
  return out;
};
export const SIGNAL_GRID = (days = [8, 10, 12]) => {
  const out = [];
  for (const day of days) {
    out.push({ label: 'wood, stone spear', day, wall: 'wood', kit: 'stone_spear', tower: true, nights: 3 });
    out.push({ label: 'stone+spikes, stone spear', day, wall: 'stone', spikes: true, kit: 'stone_spear', tower: true, nights: 3 });
    out.push({ label: 'stone+spikes, iron spear', day, wall: 'stone', spikes: true, kit: 'iron_spear', tower: true, nights: 3 });
    out.push({ label: 'stone+spikes, bow', day, wall: 'stone', spikes: true, kit: 'bow', tower: true, nights: 3 });
    out.push({ label: 'stone+spikes+torches, iron spear', day, wall: 'stone', spikes: true, torches: true, kit: 'iron_spear', tower: true, nights: 3 });
  }
  return out;
};

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
  const N = +(args.seeds || 10), first = +(args.first || 1);
  const over = args.set ? Object.fromEntries(String(args.set).split(',').map((kv) => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number.isNaN(+v) ? v : +v]; })) : {};
  const days = args.days ? String(args.days).split(',').map(Number) : null;
  const t0 = Date.now();
  const only = args.only ? new RegExp(args.only) : null;
  const run = (grid, signal) => { for (const cfg of grid) { if (only && !only.test(`${cfg.label} d${cfg.day}`)) continue; const c = { ...cfg, ...over }; const rs = []; for (let s = first; s < first + N; s++) rs.push(runNight(s, c)); console.log(summarizeNight(`d${cfg.day} ${cfg.label}`, rs, signal)); } };
  if (which === 'defence' || which === 'all') { console.log('== defence (one night, interior 5x5 base unless half=1)'); run(DEFENCE_GRID(days || [8, 10, 12]), false); }
  if (which === 'signal' || which === 'all') { console.log('== signal (3 consecutive nights, tower beside the fire)'); run(SIGNAL_GRID(days || [8, 10, 12]), true); }
  if (which === 'bear' || which === 'all') {
    console.log('== bear (player at 100% hp, fur clothing, 2 bandages)');
    for (const kit of ['stone_spear', 'iron_spear', 'bow', 'iron_bow']) for (const dodge of kit.includes('bow') ? [false] : [false, true]) {
      const rs = []; for (let s = first; s < first + N; s++) rs.push(runBear(s, { kit, dodge, ...over }));
      console.log(`${kit.padEnd(12)}${dodge ? ' +dodge' : '       '} win ${pct(rs.filter((r) => r.won).length, N)} | hpLost ${f(rs.reduce((s, r) => s + r.hpLost, 0) / N)} (winners ${f(median(rs.filter((r) => r.won).map((r) => r.hpLost)) || 0)}) | time ${f(median(rs.map((r) => r.time)), 1)}s | bandages ${f(rs.reduce((s, r) => s + r.bandaged, 0) / N, 1)}`);
    }
  }
  if (which === 'expedition' || which === 'all') {
    console.log('== expedition (dawn start, round trip to wreckage, worn jacket or fur, torches, emergency campfire kit)');
    for (const day of [3, 5, 7]) for (const fur of [false, true]) for (const blizzard of [false, true]) {
      const rs = []; for (let s = first; s < first + N; s++) for (const site of [0, 1, 2]) rs.push(runExpedition(s, { day, fur, blizzard, site, ...over }));
      const ok = rs.filter((r) => r.home && !r.died).length;
      console.log(`day ${day} ${fur ? 'fur ' : 'jckt'} ${blizzard ? 'BLIZZARD' : 'clear   '} success ${pct(ok, rs.length)} | died ${pct(rs.filter((r) => r.died).length, rs.length)} | median time ${f(median(rs.map((r) => r.secs)))}s (daylight ${daylightLength(day)}s) | min warmth med ${f(median(rs.map((r) => r.minWarmth)))} worst ${f(Math.min(...rs.map((r) => r.minWarmth)))} | campfires ${f(rs.reduce((s, r) => s + r.campfires, 0) / rs.length, 1)} | causes ${JSON.stringify(rs.reduce((m, r) => (r.died && (m[r.cause] = (m[r.cause] || 0) + 1), m), {}))}`);
    }
  }
  console.log(`(${f((Date.now() - t0) / 1000, 1)}s)`);
}
export { tileDist };
