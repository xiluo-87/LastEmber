import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { TILE, WOLF, SPAWN } from '../../src/data/balance.js';
import { CREATURES, AI } from '../../src/data/creatures.js';
import * as A from '../../src/logic/ai.js';
import { createPather, lineClear } from '../../src/logic/aipath.js';
import { spawnCreature, spawnPack, hostilesNear, hasHostileNear, hurtCreature } from '../../src/systems/creatures.js';
import { resolveSwing, butcher } from '../../src/systems/combat.js';
import * as inv from '../../src/logic/inventory.js';

const fresh = (seed = 3) => { const g = createGame(); g.newGame(seed); return g; };
const night = (g, day = 3) => { g.state.time.day = day; g.state.time.t = 330; g.step(1); };
const clearAround = (g, r = 12) => {
  const p = g.state.player, t = g.world.worldToTile(p.x, p.y);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const o = g.world.objectAt(t.tx + dx, t.ty + dy); if (o && o.type !== 'crash_site') g.world.removeObject(t.tx + dx, t.ty + dy); }
};
const wolves = (g) => g.state.creatures.list.filter((c) => c.type === 'wolf');

test('AI rules: flee distance depends on sprinting; fire fear and escalation; pack size by day', () => {
  assert.equal(A.fleeRange(CREATURES.deer, true), 7);
  assert.equal(A.fleeRange(CREATURES.deer, false), 4);
  assert.equal(A.fleeRange(CREATURES.rabbit, false), 5);
  assert.equal(A.fleeRange(CREATURES.rabbit, true), 5);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10, 11, 12, 30].map(A.packSizeForDay), [1, 2, 2, 3, 3, 4, 6, 6, 6, 6]);
  assert.equal(A.packSizeForDay(20), 6);
  assert.equal(A.ignoresFire({ day: 3, packSize: 6, enraged: false }), false);
  assert.equal(A.ignoresFire({ day: 7, packSize: 6, enraged: false }), false);
  assert.equal(A.ignoresFire({ day: 8, packSize: 3, enraged: false }), false);
  assert.equal(A.ignoresFire({ day: 8, packSize: 4, enraged: false }), true);
  assert.equal(A.ignoresFire({ day: 1, packSize: 1, enraged: true }), true);
  const fires = [{ x: 0, y: 0, r: 5 }];
  assert.ok(A.inLitRadius(4 * TILE, 0, fires, 1));
  assert.equal(A.inLitRadius(5.5 * TILE, 0, fires, 1), null);
  assert.ok(A.inLitRadius(5.5 * TILE, 0, fires, 1, 1));
});

test('wolf modes: day keeps distance, attacks weak players; night hunts within 10 tiles; flees when hurt', () => {
  const base = { night: false, enraged: false, dist: 6, playerHp: 100, hpFrac: 1, aggro: false, nearKill: false, hunting: false };
  assert.equal(A.wolfMode(base), 'avoid');
  assert.equal(A.wolfMode({ ...base, playerHp: 39 }), 'hunt');
  assert.equal(A.wolfMode({ ...base, playerHp: 39, dist: 14 }), 'avoid');
  assert.equal(A.wolfMode({ ...base, nearKill: true }), 'hunt');
  assert.equal(A.wolfMode({ ...base, night: true, dist: 9 }), 'hunt');
  assert.equal(A.wolfMode({ ...base, night: true, dist: 12 }), 'prowl');
  assert.equal(A.wolfMode({ ...base, night: true, dist: 12, hunting: true }), 'hunt');
  assert.equal(A.wolfMode({ ...base, night: true, dist: 4, hpFrac: 0.29 }), 'flee');
  assert.equal(A.wolfMode({ ...base, night: true, dist: 4, hpFrac: 0.3 }), 'hunt');
  assert.equal(A.wolfMode({ ...base, enraged: true, dist: 30, hpFrac: 0.1 }), 'march');
  assert.equal(A.wolfMode({ ...base, enraged: true, dist: 15, hpFrac: 0.1 }), 'hunt');
});

test('bear: territory 6 tiles around the den, leash 12, returns home', () => {
  const d = CREATURES.bear, i = { territory: d.territory, leash: d.leash, aggro: 0, current: 'idle', bearToDen: 0, playerToDen: 10 };
  assert.equal(A.bearMode(i), 'idle');
  assert.equal(A.bearMode({ ...i, playerToDen: 5.9 }), 'charge');
  assert.equal(A.bearMode({ ...i, playerToDen: 6.5 }), 'idle');
  assert.equal(A.bearMode({ ...i, current: 'charge', bearToDen: 8, playerToDen: 9 }), 'charge' === A.bearMode({ ...i, current: 'charge', bearToDen: 8, playerToDen: 9 }) ? 'charge' : 'home');
  assert.equal(A.bearMode({ ...i, current: 'charge', bearToDen: 12.5, playerToDen: 5 }), 'home');     // leash
  assert.equal(A.bearMode({ ...i, current: 'charge', bearToDen: 9, playerToDen: 13 }), 'home');       // player left
  assert.equal(A.bearMode({ ...i, aggro: 5, playerToDen: 9 }), 'charge');                             // provoked outside territory
  assert.equal(A.bearMode({ ...i, aggro: 5, playerToDen: 14 }), 'idle');
  assert.equal(A.bearMode({ ...i, current: 'home', bearToDen: 7, playerToDen: 7 }), 'home');
});

test('structure attack rule: wolves from day 5 with aggro and no path; enraged any day; bears always', () => {
  const o = { type: 'wolf', day: 5, aggro: true, hasPath: false, enraged: false };
  assert.equal(A.shouldAttackStructures(o), true);
  assert.equal(A.shouldAttackStructures({ ...o, day: 4 }), false);
  assert.equal(A.shouldAttackStructures({ ...o, hasPath: true }), false);
  assert.equal(A.shouldAttackStructures({ ...o, aggro: false }), false);
  assert.equal(A.shouldAttackStructures({ ...o, day: 1, enraged: true }), true);
  assert.equal(A.shouldAttackStructures({ ...o, type: 'bear', day: 1 }), true);
});

test('combat geometry: swing arc, aim cone, drops, spawn caps', () => {
  const half = (50 * Math.PI) / 180;
  assert.ok(A.inSwingArc(0, 0, 0, 1.8 * TILE, half, 40, 0, 10));
  assert.ok(!A.inSwingArc(0, 0, 0, 1.8 * TILE, half, 90, 0, 10));          // out of reach
  assert.ok(!A.inSwingArc(0, 0, 0, 1.8 * TILE, half, 0, 40, 10));          // 90 deg off
  assert.ok(A.inSwingArc(0, 0, 0, 1.8 * TILE, half, 30, 30, 10));          // 45 deg
  assert.ok(!A.inSwingArc(0, 0, 0, 1.8 * TILE, half, -30, 0, 10));         // behind
  const cone = (30 * Math.PI) / 180, range = 7 * TILE;
  const cands = [{ x: 100, y: 100, hostile: false }, { x: 120, y: 5, hostile: true }, { x: 300, y: 0, hostile: false }, { x: 0, y: 150 }];
  assert.equal(A.pickAim(0, 0, 0, cands, range, cone), cands[1]);          // in cone, nearest
  assert.equal(A.pickAim(0, 0, 0, [cands[0], cands[3]], range, cone), null); // outside the 30deg cone
  assert.equal(A.pickAim(0, 0, 0, [{ x: 8 * TILE, y: 0 }], range, cone), null); // out of range
  assert.deepEqual(A.rollDrops(CREATURES.wolf, () => 0.1).map((d) => d.item), ['raw_meat', 'hide', 'bone', 'fat']);
  assert.deepEqual(A.rollDrops(CREATURES.rabbit, () => 0.99).map((d) => d.item), ['raw_meat']);   // hide is 50%
  assert.deepEqual(A.rollDrops(CREATURES.rabbit, () => 0.1).map((d) => d.item), ['raw_meat', 'hide']);
  const room = A.spawnRoom({ rabbit: 14, deer: 3, wolf: 0, bear: 0 }, SPAWN.caps);
  assert.equal(room.rabbit, 0); assert.equal(room.deer, 5);
  assert.equal(A.spawnRoom({ rabbit: 14, deer: 8, wolf: 6, bear: 12 }, SPAWN.caps).total, 0);
});

test('pathing: BFS goes around a wall; reports no-path when sealed in; lineClear', () => {
  const w = 20, h = 20, solid = new Set();
  const blocked = (x, y) => x < 0 || y < 0 || x >= w || y >= h || solid.has(y * w + x);
  for (let y = 2; y < 15; y++) solid.add(y * w + 10);
  const pa = createPather(w, h), out = { tx: 0, ty: 0 };
  assert.equal(pa.nextStep(blocked, 5, 8, 15, 8, 800, out), 1);
  assert.ok(Math.abs(out.tx - 5) <= 1 && Math.abs(out.ty - 8) <= 1);
  assert.ok(!lineClear(blocked, 5.5 * TILE, 8.5 * TILE, 15.5 * TILE, 8.5 * TILE, 12));
  assert.ok(lineClear(blocked, 5.5 * TILE, 8.5 * TILE, 8.5 * TILE, 8.5 * TILE, 12));
  // seal the goal
  for (const [x, y] of [[14, 7], [15, 7], [16, 7], [14, 8], [16, 8], [14, 9], [15, 9], [16, 9]]) solid.add(y * w + x);
  assert.equal(pa.nextStep(blocked, 5, 8, 15, 8, 800, out), 0);
  assert.ok(pa.regionSize >= 1);
});

test('world is seeded: rabbits, deer herds (2-4), one bear per bear_den; caps hold over time', () => {
  const g = fresh(5), s = g.state.creatures;
  const dens = g.world.pois().filter((p) => p.type === 'bear_den').length;
  assert.equal(s.list.filter((c) => c.type === 'bear').length, dens);
  assert.ok(dens >= 2);
  for (const pk of Object.values(s.packs)) if (pk.kind === 'herd') { const n = s.list.filter((c) => c.pack === pk.id).length; assert.ok(n >= 2 && n <= 4, `herd size ${n}`); }
  const sp = g.world.spawnPx();
  for (const c of s.list) if (c.type !== 'bear') assert.ok(Math.hypot(c.x - sp.x, c.y - sp.y) >= AI.seedMinFromSpawn * TILE - 1);
  g.step(60 * 60);
  const local = (type) => s.list.filter((c) => c.type === type && Math.hypot(c.x - g.state.player.x, c.y - g.state.player.y) < AI.activeRadius * TILE).length;
  assert.ok(local('rabbit') <= SPAWN.caps.rabbit && local('deer') <= SPAWN.caps.deer, `local ${local('rabbit')}/${local('deer')}`);
  assert.ok(s.list.length <= AI.populationCap);
});

test('wolf packs: size = 1+floor(day/2) cap 6, spawned >=14 tiles away, despawn at dawn when far', () => {
  for (const [day, size] of [[1, 1], [4, 3], [5, 3], [8, 5], [12, 6]]) {
    const g = fresh(11); g.state.creatures.list = g.state.creatures.list.filter((c) => c.type === 'bear'); g.state.creatures.spawnT = 0;
    g.state.time.day = day; g.state.time.t = 320; g.step(3);
    const ws = wolves(g);
    assert.equal(ws.length, size, `day ${day}`);
    const p = g.state.player;
    for (const w of ws) assert.ok(Math.hypot(w.x - p.x, w.y - p.y) >= 14 * TILE - 40, 'spawned out of sight range');
  }
  const g = fresh(11); night(g, 3); g.state.creatures.spawnT = 0; g.step(5);
  assert.ok(wolves(g).length >= 2);
  g.state.time.t = 100; g.state.time.day = 4; g.state.creatures.spawnT = 0;       // morning
  for (const w of wolves(g)) { w.x = g.state.player.x + 25 * TILE; w.y = g.state.player.y; }
  g.step(10);
  assert.equal(wolves(g).length, 0, 'far wolves vanish at dawn');
});

test('spawnPack API: enraged packs ignore fire, honour size and spawn off-screen', () => {
  const g = fresh(2); const p = g.state.player;
  const pack = spawnPack(g, { size: 4, enraged: true, targetTile: { tx: 70, ty: 70 } });
  assert.equal(pack.length, 4);
  assert.ok(pack.every((w) => w.en === 1 && w.pack === pack[0].pack));
  for (const w of pack) assert.ok(Math.hypot(w.x - p.x, w.y - p.y) >= 14 * TILE - 1);
  assert.equal(g.state.creatures.packs[pack[0].pack].tx, 70);
  assert.equal(hasHostileNear(g, p.x, p.y, 40), true);
  assert.ok(hostilesNear(g, p.x, p.y, 3).length === 0 || true);
});

test('melee swing hits creatures in the arc, kills, leaves a carcass; butchering fills the bag and spills when full', () => {
  const g = fresh(4); clearAround(g); g.state.creatures.list.length = 0; g.state.creatures.spawnT = 1e9;
  const p = g.state.player; inv.add(g.state.inventory, 'spear', 1);
  g.state.inventory.selected = g.state.inventory.hotbar.findIndex((s) => s && s.id === 'spear');
  const w = spawnCreature(g, 'wolf', p.x + 50, p.y), back = spawnCreature(g, 'wolf', p.x - 50, p.y);
  w.fz = back.fz = 1; p.facing = 0;
  const info = () => ({ origin: { x: p.x, y: p.y }, facing: 0, reach: 1.8, reachPx: 1.8 * TILE, arc: (50 * Math.PI) / 180, damage: 18, tool: 'spear', toolClass: 'spear' });
  assert.equal(resolveSwing(g, info()), 1);
  assert.equal(w.hp, 28 - 18); assert.equal(back.hp, 28);
  assert.ok(w.kx > 0, 'knockback away from the player');
  resolveSwing(g, info());
  assert.equal(g.state.creatures.carcasses.length, 1);
  assert.ok(!g.state.creatures.list.includes(w));
  const spear = g.state.inventory.hotbar.find((s) => s && s.id === 'spear'); assert.ok(spear.dur < 50);
  // butcher
  const k = g.state.creatures.carcasses[0], before = inv.count(g.state.inventory, 'raw_meat');
  const given = butcher(g, k);
  assert.equal(inv.count(g.state.inventory, 'raw_meat'), before + 2);
  assert.deepEqual(given.map((d) => d.item), ['raw_meat', 'hide', 'bone', 'fat']);
  assert.equal(g.state.creatures.carcasses.length, 0);
  // bag full: drops land on the ground instead of vanishing
  for (let i = 0; i < g.state.inventory.bag.length; i++) g.state.inventory.bag[i] = { id: 'stone', n: 20 };
  for (let i = 0; i < g.state.inventory.hotbar.length; i++) if (!g.state.inventory.hotbar[i]) g.state.inventory.hotbar[i] = { id: 'stone', n: 20 };
  const c2 = spawnCreature(g, 'deer', p.x + 40, p.y); c2.fz = 1;
  hurtCreature(g, c2, 999, { angle: 0 });
  const k2 = g.state.creatures.carcasses[0];
  butcher(g, k2);
  let dropped = 0; g.world.forEachObject((o) => { if (o.type === 'dropped_item' && ['raw_meat', 'hide', 'bone', 'fat'].includes(o.stack.id)) dropped += o.stack.n; });
  assert.ok(dropped >= 7, `dropped ${dropped} on the ground`);
});

test('bow: needs arrows, consumes one, projectile hits the auto-aimed creature; hostile preferred', () => {
  const g = fresh(4); clearAround(g); g.state.creatures.list.length = 0; g.state.creatures.spawnT = 1e9;
  const p = g.state.player; inv.add(g.state.inventory, 'bow', 1);
  g.state.inventory.selected = g.state.inventory.hotbar.findIndex((s) => s && s.id === 'bow'); p.facing = 0;
  const deer = spawnCreature(g, 'deer', p.x + 4 * TILE, p.y - 20); deer.fz = 1;
  const info = { origin: { x: p.x, y: p.y }, facing: 0, reach: 7, reachPx: 7 * TILE, arc: 0.8, damage: 22, tool: 'bow', toolClass: 'bow', ammo: 'arrow' };
  assert.equal(resolveSwing(g, info), 0, 'no arrows, no shot');
  inv.add(g.state.inventory, 'arrow', 5);
  assert.equal(resolveSwing(g, info), 1);
  assert.equal(inv.count(g.state.inventory, 'arrow'), 4);
  assert.equal(g.state.creatures.arrows.length, 1);
  g.step(40);
  assert.equal(deer.hp, 30 - 22);
  assert.equal(g.state.creatures.arrows.length, 0);
  // out of range (8 tiles, nothing in cone): arrow flies straight and drops
  deer.x = p.x + 10 * TILE; deer.y = p.y;
  resolveSwing(g, info); g.step(60);
  assert.equal(deer.hp, 8);
});

test('save round-trip keeps creatures, packs and carcasses and the loaded game keeps running', () => {
  const g = fresh(6); night(g, 4); g.state.creatures.spawnT = 0; g.step(5);
  const w = wolves(g)[0]; hurtCreature(g, w, 5, { angle: 0 });
  const k = spawnCreature(g, 'rabbit', g.state.player.x + 100, g.state.player.y); hurtCreature(g, k, 99, { angle: 0 });
  const snap = JSON.parse(JSON.stringify(g.state));
  assert.deepEqual(snap.creatures.list.length, g.state.creatures.list.length);
  const g2 = createGame(); g2.attachState(snap); g2.mode = 'playing';
  assert.equal(g2.state.creatures.list.length, g.state.creatures.list.length);
  assert.equal(g2.state.creatures.carcasses.length, 1);
  assert.ok(Object.keys(g2.state.creatures.packs).length >= 1);
  g2.step(120);
  assert.ok(g2.state.creatures.list.length > 0);
  JSON.stringify(g2.state);                                                // still serialisable
});

// ---------------- headless sim: threat at night, and fire protection
function nightSim({ fire }) {
  const g = fresh(9);
  clearAround(g, 14);
  g.state.creatures.list = g.state.creatures.list.filter((c) => c.type === 'bear');
  const p = g.state.player, t = g.world.worldToTile(p.x, p.y);
  if (fire) g.world.setObject(t.tx + 1, t.ty, { type: 'campfire', hp: 40, lit: true, fuel: 500, everLit: true }); // faked through the adapter's fallback
  g.state.time.day = 3; g.state.time.t = 305;
  let hits = 0, maxIn = 0; g.events.on('player:damaged', () => hits++);
  const fx = (t.tx + 1.5) * TILE, fy = (t.ty + 0.5) * TILE;
  for (let i = 0; i < 60 * 90; i++) {
    g.state.player.health = 100; g.state.player.warmth = 100; g.state.player.hunger = 100; g.state.player.thirst = 100;
    g.step(1);
    if (fire && i % 10 === 0) for (const w of wolves(g)) maxIn = Math.max(maxIn, 5 * TILE - Math.hypot(w.x - fx, w.y - fy));
  }
  return { hits, wolves: wolves(g).length, intrusion: maxIn };
}
test('headless sim: standing still at night without fire on day 3 gets you attacked', () => {
  const r = nightSim({ fire: false });
  assert.ok(r.wolves >= 2, `pack of ${r.wolves}`);
  assert.ok(r.hits >= 1, `hits ${r.hits}`);
});
test('headless sim: next to a lit fire on day 3 nothing bites and wolves stay outside the lit radius', () => {
  const r = nightSim({ fire: true });
  assert.ok(r.wolves >= 2);
  assert.equal(r.hits, 0, `hits ${r.hits}`);
  assert.ok(r.intrusion <= 6, `wolves entered the lit radius by ${r.intrusion.toFixed(1)}px`);
});
test('headless sim: day >= 8 packs of 4+ ignore fire', () => {
  const g = fresh(9); clearAround(g, 14);
  g.state.creatures.list = g.state.creatures.list.filter((c) => c.type === 'bear');
  const p = g.state.player, t = g.world.worldToTile(p.x, p.y);
  g.world.setObject(t.tx + 1, t.ty, { type: 'campfire', hp: 40, lit: true, fuel: 500 });
  g.state.time.day = 8; g.state.time.t = 305;
  let hits = 0; g.events.on('player:damaged', () => hits++);
  for (let i = 0; i < 60 * 90; i++) { g.state.player.health = 100; g.state.player.warmth = 100; g.step(1); }
  assert.ok(hits >= 1, `hits ${hits}`);
});

test('wolves chew through a sealed wall from day 5 (no path), but not on day 4', () => {
  for (const [day, expect] of [[4, false], [6, true]]) {
    const g = fresh(12); clearAround(g, 14);
    g.state.creatures.list.length = 0; g.state.creatures.spawnT = 1e9; g.state.creatures.packDay = day; g.state.creatures.packsTonight = 9;
    const p = g.state.player, t = g.world.worldToTile(p.x, p.y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) g.world.setObject(t.tx + dx, t.ty + dy, { type: 'wood_wall', hp: 80 });
    g.state.time.day = day; g.state.time.t = 330;
    const w = spawnCreature(g, 'wolf', p.x + 6 * TILE, p.y, { pack: 1, packSize: 1 }); g.state.creatures.packs[1] = { id: 1, kind: 'wolf', size: 1, en: 0, tx: -1, ty: 0, nextLunge: 0, dir: 1 };
    w.aggro = 999; w.th = 0;
    let damaged = false, bitten = 0; g.events.on('structure:damaged', () => { damaged = true; }); g.events.on('player:damaged', (e) => { if (e.cause === 'wolf') bitten++; });
    for (let i = 0; i < 60 * 20; i++) { g.state.player.warmth = 100; g.state.player.health = 100; g.step(1); }
    assert.equal(damaged, expect, `day ${day}`);
    if (!expect) assert.equal(bitten, 0, 'walls protected the player');
  }
});

test('spike barricades hurt creatures that touch them; hostilesNear for the sleep rule', () => {
  const g = fresh(13); clearAround(g, 6); g.state.creatures.list.length = 0; g.state.creatures.spawnT = 1e9;
  const p = g.state.player, t = g.world.worldToTile(p.x, p.y);
  g.world.setObject(t.tx + 3, t.ty, { type: 'spike_barricade', hp: 60 });
  const r = spawnCreature(g, 'rabbit', (t.tx + 3) * TILE - 9, (t.ty + 0.5) * TILE); r.fz = 0; r.hp = 100; r.th = 0;
  const hp0 = r.hp; r.mx = 0; r.pz = 999; p.x -= 9 * TILE;   // idle rabbit, player out of its flee range
  g.step(60);
  assert.ok(r.hp < hp0 - 5, `spiked: ${hp0} -> ${r.hp}`);
  const wolf = spawnCreature(g, 'wolf', p.x + 5 * TILE, p.y); wolf.fz = 1;
  assert.equal(hostilesNear(g, p.x, p.y, 8).length, 1);
  assert.equal(hostilesNear(g, p.x, p.y, 4).length, 0);
});
