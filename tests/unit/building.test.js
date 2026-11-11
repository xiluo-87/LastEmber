import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { TILE, FIRE } from '../../src/data/balance.js';
import { STRUCTURES } from '../../src/data/structures.js';
import { add, count } from '../../src/logic/inventory.js';
import { validatePlacement } from '../../src/logic/placement.js';
import { newStructure, addFuel, burnFuel, tryLight, rackLoad, rackTick, rackDone, rackCollect, snareRoll, fishingRoll, refundFor, repairOnce, transferStack, fuelSeconds } from '../../src/logic/structures.js';
import { damageStructure, litFires } from '../../src/systems/building.js';
import * as saves from '../../src/save.js';

const approx = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

/** New game with a cleared 25x25 snow field around the spawn and plenty of materials. Player at the centre tile (cx,cy). */
function field(seed = 5) {
  const g = createGame({ storage: memStorage() }); g.newGame(seed);
  const sp = g.world.spawn || g.state.world.spawn, cx = sp.tx, cy = sp.ty;
  for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 12; x <= cx + 12; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
  g.state.inventory.clothing.fill(null);
  for (const [id, n] of [['wood', 20], ['stone', 20], ['stick', 20], ['rope', 6], ['fiber', 6], ['hide', 4], ['fat', 4], ['coal', 6], ['flint', 1], ['raw_meat', 3]]) add(g.state.inventory, id, n);
  const c = g.world.tileCenter(cx, cy); Object.assign(g.state.player, { x: c.x, y: c.y });
  g.state.time.t = 150; g.state.weather.plan = [];
  return { g, cx, cy, P: g.state.player };
}
const act = (g, obj, extra = {}) => { g.target = { kind: 'object', obj, tx: obj.tx, ty: obj.ty, name: obj.type, ...extra }; const h = g.interactions.find(g.target); return h.onAction(g, g.target, {}); };
const put = (g, id, tx, ty) => { g.building.select(id); return g.building.place(tx, ty); };

test('placement validation: occupied, terrain, far, standing, cost, tool', () => {
  const { g, cx, cy } = field();
  const B = g.building;
  B.select('wood_wall');
  assert.equal(B.validate('wood_wall', cx + 1, cy).ok, true);
  assert.equal(B.validate('wood_wall', cx, cy).code, 'standing');             // player stands there
  assert.equal(B.validate('door', cx, cy).ok, true);                           // door is walkable -> may be placed on the player
  assert.equal(B.validate('wood_wall', cx + 6, cy).code, 'far');
  assert.equal(B.validate('fishing_hole', cx + 1, cy).code, 'terrain');         // not ice
  g.world.setTerrain(cx + 1, cy, 'ice');
  assert.equal(B.validate('fishing_hole', cx + 1, cy).code, 'tool');            // no axe/pickaxe
  add(g.state.inventory, 'stone_axe', 1);
  assert.equal(B.validate('fishing_hole', cx + 1, cy).ok, true);
  g.world.setTerrain(cx + 2, cy, 'cliff'); assert.equal(B.validate('wood_wall', cx + 2, cy).code, 'terrain');
  assert.ok(put(g, 'wood_wall', cx + 1, cy + 1));
  assert.equal(B.validate('wood_wall', cx + 1, cy + 1).code, 'occupied');
  assert.equal(count(g.state.inventory, 'wood'), 18);
  g.state.inventory.bag.forEach((s, i) => { if (s?.id === 'wood') g.state.inventory.bag[i] = null; });
  assert.equal(B.validate('wood_wall', cx - 1, cy).code, 'cost');
  g.events.emit('x'); B.cancel();
  // pure function too
  const r = validatePlacement({ world: g.world, def: STRUCTURES.chest, tx: cx - 2, ty: cy, player: g.state.player, inventory: g.state.inventory });
  assert.equal(r.code, 'cost');
});

test('walls auto-tile: neighbour mask connects, removing updates the neighbours', () => {
  const { g, cx, cy } = field();
  put(g, 'wood_wall', cx + 1, cy + 1); put(g, 'wood_wall', cx + 2, cy + 1); put(g, 'wood_wall', cx + 2, cy + 2);
  assert.equal(g.world.objectAt(cx + 1, cy + 1).variant, 2);                   // east only
  assert.equal(g.world.objectAt(cx + 2, cy + 1).variant, 8 | 4);                // west + south
  assert.equal(g.world.objectAt(cx + 2, cy + 2).variant, 1);                    // north
  g.world.removeObject(cx + 2, cy + 1);
  assert.equal(g.world.objectAt(cx + 1, cy + 1).variant, 0);
});

function ring(g, cx, cy, r = 2, doorAt = [cx, cy + r]) {
  g.building.select('wood_wall');
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
    if (x === doorAt[0] && y === doorAt[1]) continue;
    g.building.place(x, y);
  }
  if (doorAt) { g.building.select('door'); g.building.place(doorAt[0], doorAt[1]); }
}

test('a wall ring with a door becomes a room; shelterQuery + event; breach by dismantling a wall', () => {
  const { g, cx, cy, P } = field();
  add(g.state.inventory, 'wood', 40);
  const events = []; g.events.on('room:formed', (e) => events.push(e)); g.events.on('room:breached', () => events.push('breach'));
  // build from inside (player at centre tile, ring radius 2 => 3x3 interior... the player stands in it)
  ring(g, cx, cy, 2);
  assert.equal(events.filter((e) => e !== 'breach').length, 1);
  assert.equal(events[0].size, 9);
  assert.ok(g.shelterQuery(cx, cy)); assert.ok(!g.shelterQuery(cx + 6, cy));
  assert.ok(g.building.isSheltered(g, cx, cy + 1));
  // the door is walkable for the player but blocks creatures
  const door = g.world.objectAt(cx, cy + 2);
  assert.equal(g.world.isBlocked(cx, cy + 2), false); assert.equal(g.world.isBlocked(cx, cy + 2, { creature: true }), true);
  // breach
  assert.ok(g.building.structureAt(g, cx - 2, cy));
  g.world.removeObject(cx - 2, cy);
  assert.ok(!g.shelterQuery(cx, cy));
  assert.ok(events.includes('breach'));
  void P; void door;
});

test('fuel: item seconds, max 600, blizzard doubles an unsheltered fire, sheltered does not', () => {
  const o = newStructure('campfire');
  assert.equal(fuelSeconds('campfire', 'stick'), FIRE.fuel.stick); assert.equal(fuelSeconds('campfire', 'coal'), 150); assert.equal(fuelSeconds('campfire', 'stone'), 0);
  for (let i = 0; i < 10; i++) assert.ok(addFuel(o, 'wood').ok);
  assert.equal(o.fuel, 600); assert.equal(addFuel(o, 'stick').ok, false);                       // full
  assert.equal(tryLight(o, { bag: [], hotbar: [] }).reason, 'You need flint to light it');
  assert.ok(tryLight(o, { bag: [{ id: 'flint', n: 1 }], hotbar: [] }).ok);
  burnFuel(o, 10, 1); approx(o.fuel, 590);
  burnFuel(o, 10, 2); approx(o.fuel, 570);
  assert.equal(burnFuel(o, 1000, 1), 'out'); assert.equal(o.lit, false); assert.equal(o.fuel, 0);
  const f = newStructure('furnace'); assert.equal(addFuel(f, 'stick').ok, false); assert.ok(addFuel(f, 'coal').ok);
});

test('system: a lit fire burns fuel at weather.fuelMult (blizzard x2 unsheltered, x1 in a room)', () => {
  const { g, cx, cy } = field();
  put(g, 'campfire', cx + 1, cy); const fire = g.world.objectAt(cx + 1, cy);
  g.structures.addFuel(fire, 'wood'); g.structures.light(fire);
  assert.ok(fire.lit);
  g.weather.force('clear', 600); const f0 = fire.fuel; g.step(60); approx(f0 - fire.fuel, 1, 0.02);
  g.weather.force('blizzard', 600); const f1 = fire.fuel; g.step(60); approx(f1 - fire.fuel, 2, 0.03);
  // walls around: sheltered -> x1
  add(g.state.inventory, 'wood', 60);
  g.building.select('wood_wall');
  for (let x = cx - 1; x <= cx + 3; x++) for (let y = cy - 2; y <= cy + 2; y++) if ((x === cx - 1 || x === cx + 3 || y === cy - 2 || y === cy + 2) && !(x === cx + 1 && y === cy)) g.building.place(x, y);
  assert.ok(g.building.isSheltered(g, cx + 1, cy));
  const f2 = fire.fuel; g.step(60); approx(f2 - fire.fuel, 1, 0.03);
});

test('campfire in an enclosed room keeps the player warm at night (headless)', () => {
  const { g, cx, cy, P } = field();
  add(g.state.inventory, 'wood', 60);
  put(g, 'campfire', cx + 1, cy); const fire = g.world.objectAt(cx + 1, cy);
  for (let i = 0; i < 4; i++) g.structures.addFuel(fire, 'wood'); g.structures.light(fire);
  ring(g, cx, cy, 2);
  g.state.time.t = 30 + (480 - 180 - 6) + 60;                      // deep night (day 1: night starts at t=300)
  g.state.time.t = 330; g.weather.force('clear', 600);
  g.step(5);
  assert.equal(g.state.time.phase, 'night');
  const felt = g.state.survival.felt;
  assert.ok(felt >= 10, `felt ${felt} should be above comfort (10) in a lit closed room at night`);
  P.warmth = 50; g.step(600); assert.ok(P.warmth > 50, 'warmth rises');
  // same fire, no walls: much colder
  const g2 = field().g; const f2 = field(); void g2;
  put(f2.g, 'campfire', f2.cx + 3, f2.cy); const o2 = f2.g.world.objectAt(f2.cx + 3, f2.cy); f2.g.structures.addFuel(o2, 'wood'); f2.g.structures.light(o2);
  f2.g.state.time.t = 330; f2.g.weather.force('clear', 600); f2.g.step(5);
  assert.ok(f2.g.state.survival.felt < felt - 8, `${f2.g.state.survival.felt} vs ${felt}`);
});

test('drying rack: raw meat -> jerky in 120 s, 3 slots; snare dawn roll; fishing roll bands', () => {
  const o = newStructure('drying_rack');
  assert.ok(rackLoad(o) && rackLoad(o) && rackLoad(o)); assert.equal(rackLoad(o), false);
  rackTick(o, 119); assert.equal(rackDone(o), 0); rackTick(o, 2); assert.equal(rackDone(o), 3);
  assert.equal(rackCollect(o), 3); assert.equal(rackDone(o), 0);
  const s = newStructure('snare');
  assert.equal(snareRoll(s, true, 0), false);                    // lit fire within 6 tiles
  assert.equal(snareRoll(s, false, 0.5), false);
  assert.equal(snareRoll(s, false, 0.34), true); assert.ok(s.caught); assert.equal(snareRoll(s, false, 0), false);
  assert.equal(fishingRoll(0.5), 'fish'); assert.equal(fishingRoll(0.58), 'snap'); assert.equal(fishingRoll(0.9), 'nothing');
});

test('system: drying rack timer runs on game seconds and the rack interaction loads / collects', () => {
  const { g, cx, cy } = field();
  put(g, 'drying_rack', cx + 1, cy); const rack = g.world.objectAt(cx + 1, cy);
  act(g, rack); act(g, rack);
  assert.equal(rack.slots.filter(Boolean).length, 2); assert.equal(count(g.state.inventory, 'raw_meat'), 1);
  g.step(60 * 60); assert.ok(rack.slots[0].t > 55 && rack.slots[0].t < 65);
  g.state.time.speed = 12; g.step(60 * 6); g.state.time.speed = 1;                // 6 real s asleep = 72 game s
  assert.ok(rack.slots[0].done);
  act(g, rack); assert.equal(count(g.state.inventory, 'jerky'), 2);
});

test('system: snare catches at dawn only far from fire; collect gives meat + hide', () => {
  const { g, cx, cy } = field();
  put(g, 'snare', cx + 2, cy); const sn = g.world.objectAt(cx + 2, cy);
  const orig = g.rand; g.rand = () => 0.1;
  try { g.events.emit('time:newDay', { day: 2 }); } finally { g.rand = orig; }
  assert.ok(sn.caught, 'no fire nearby -> caught');
  const meat = count(g.state.inventory, 'raw_meat'); act(g, sn);
  assert.equal(count(g.state.inventory, 'raw_meat'), meat + 1); assert.equal(sn.caught, false);
  put(g, 'campfire', cx + 3, cy); const f = g.world.objectAt(cx + 3, cy); g.structures.addFuel(f, 'wood'); g.structures.light(f);
  g.rand = () => 0.1; try { g.events.emit('time:newDay', { day: 3 }); } finally { g.rand = orig; }
  assert.equal(sn.caught, false, 'lit fire within 6 tiles -> nothing');
});

test('damageStructure: hp, destruction, events, room recompute; repair +50%; dismantle refunds 50%', () => {
  const { g, cx, cy } = field();
  put(g, 'wood_wall', cx + 1, cy); const w = g.world.objectAt(cx + 1, cy);
  const ev = []; g.events.on('structure:damaged', (e) => ev.push(['d', e.hp])); g.events.on('structure:destroyed', () => ev.push(['x']));
  assert.deepEqual(damageStructure(g, cx + 1, cy, 30, 'wolf'), { hp: 50, destroyed: false });
  assert.equal(g.building.damageStructure(g, cx + 1, cy, 10).hp, 40);
  assert.equal(damageStructure(g, cx + 3, cy, 10), null);
  assert.ok(repairOnce(w, g.state.inventory).ok); assert.equal(w.hp, 80);
  assert.equal(repairOnce(w, g.state.inventory).ok, false);
  assert.deepEqual(damageStructure(g, cx + 1, cy, 999), { hp: 0, destroyed: true });
  assert.equal(g.world.objectAt(cx + 1, cy), undefined); assert.ok(ev.some((e) => e[0] === 'x'));
  assert.deepEqual(refundFor(STRUCTURES.stone_wall), [{ item: 'stone', n: 1 }]);          // 3 stone, 1 wood -> 1 stone, 0 wood
  assert.deepEqual(refundFor(STRUCTURES.campfire), [{ item: 'stick', n: 1 }, { item: 'stone', n: 1 }]);
  // dismantle through the interaction
  put(g, 'chest', cx + 1, cy + 1);
  const wood = count(g.state.inventory, 'wood');
  g.building.toggleDismantle(); g.target = { kind: 'object', obj: g.world.objectAt(cx + 1, cy + 1), dismantle: true };
  g.interactions.find(g.target).onHold(g, g.target, 0.1, 1.2);
  assert.equal(g.world.objectAt(cx + 1, cy + 1), undefined); assert.equal(count(g.state.inventory, 'wood'), wood + 2);
});

test('litFires query + lit/out events + heat seam', () => {
  const { g, cx, cy } = field();
  put(g, 'campfire', cx + 1, cy); const f = g.world.objectAt(cx + 1, cy);
  const ev = []; g.events.on('fire:lit', () => ev.push('lit')); g.events.on('fire:out', () => ev.push('out'));
  assert.equal(litFires(g).length, 0);
  g.structures.addFuel(f, 'stick'); g.structures.light(f);
  const L = litFires(g); assert.equal(L.length, 1); assert.equal(L[0].radius, 5); assert.equal(L[0].tx, cx + 1);
  g.step(60 * 25); assert.equal(f.lit, false); assert.deepEqual(ev, ['lit', 'out']);
  assert.equal(litFires(g).length, 0);
});

test('chest transfer + workbench station + sleeping preconditions', () => {
  const { g, cx, cy, P } = field();
  put(g, 'chest', cx + 1, cy); const chest = g.world.objectAt(cx + 1, cy);
  const inv = g.state.inventory, i = inv.bag.findIndex((s) => s?.id === 'stone');
  const n = inv.bag[i].n; assert.equal(transferStack(inv, 'bag', i, chest.inv, ['bag']), n);
  assert.equal(chest.inv.bag.find(Boolean).id, 'stone'); assert.equal(count(inv, 'stone'), 0);
  add(g.state.inventory, 'stone', 5); put(g, 'workbench', cx - 1, cy + 1);
  g.step(2); assert.ok(g.stationQuery().includes('workbench'));
  P.x += 10 * TILE; assert.ok(!g.stationQuery().includes('workbench')); P.x -= 10 * TILE;
  // sleep: daytime refusal, then at night with a warm room
  put(g, 'bedroll', cx, cy + 1);
  assert.match(g.sleep.refusal(), /night/);
  g.state.time.t = 330; g.step(2);
  assert.match(g.sleep.refusal(), /cold/i);
});

test('sleep: warm night -> sleeping effect, time x12, wakes at dawn; damage wakes', () => {
  const { g, cx, cy, P } = field();
  add(g.state.inventory, 'wood', 60);
  put(g, 'campfire', cx + 1, cy); const f = g.world.objectAt(cx + 1, cy); for (let i = 0; i < 10; i++) g.structures.addFuel(f, 'wood'); g.structures.light(f);
  put(g, 'bedroll', cx, cy + 1); ring(g, cx, cy, 2);
  g.state.time.t = 320; g.weather.force('clear', 6000); g.step(5);
  P.hunger = 90; P.thirst = 90;
  const bed = g.world.objectAt(cx, cy + 1);
  const wake = []; g.events.on('sleep:end', (e) => wake.push(e.reason));
  assert.equal(g.sleep.refusal(), null);
  if (g.creatures) g.creatures.hasHostileNear = () => false;      // wolves roaming at night would wake us: keep the test deterministic
  assert.ok(g.sleep.start(bed)); assert.equal(g.state.time.speed, 12); assert.ok(g.state.player.status.sleeping);
  g.step(60 * 5);
  assert.ok(g.state.time.t > 320 + 50, `time advanced x12 (t=${g.state.time.t})`);
  g.sleep.wake('manual'); assert.equal(g.state.time.speed, 1);
  assert.ok(g.sleep.start(bed)); g.events.emit('player:damaged', { amount: 5 }); assert.equal(g.sleep.active, false);
  // sleeping to dawn: ends by itself
  assert.ok(g.sleep.start(bed)); g.step(60 * 60); assert.equal(g.sleep.active, false); assert.equal(wake.at(-1), 'dawn'); assert.equal(g.state.time.phase !== 'night', true);
});

test('save round-trip keeps a built base (fuel, hp, chest, rack, snare, door, rooms)', () => {
  const { g, cx, cy } = field();
  add(g.state.inventory, 'wood', 60);
  put(g, 'campfire', cx + 1, cy); const f = g.world.objectAt(cx + 1, cy); g.structures.addFuel(f, 'wood'); g.structures.light(f);
  put(g, 'chest', cx - 1, cy); g.world.objectAt(cx - 1, cy).inv.bag[0] = { id: 'iron_ore', n: 3 };
  put(g, 'drying_rack', cx, cy - 1); const rack = g.world.objectAt(cx, cy - 1); rackLoad(rack); rackTick(rack, 30);
  put(g, 'snare', cx + 1, cy + 1); g.world.objectAt(cx + 1, cy + 1).caught = true;
  ring(g, cx, cy, 2);
  damageStructure(g, cx - 2, cy, 25);
  g.step(120);
  const before = JSON.parse(JSON.stringify(g.state));
  const st = memStorage(); assert.ok(saves.save(g.state, st));
  const g3 = createGame({ storage: st }); assert.ok(g3.loadGame());
  assert.deepEqual(JSON.parse(JSON.stringify(g3.state.world.objects)), before.world.objects);
  assert.deepEqual(g3.state.building, before.building);
  assert.ok(g3.shelterQuery(cx, cy), 'rooms rebuilt on load');
  assert.equal(g3.building.list('campfire').size, 1);
  assert.equal(g3.world.objectAt(cx - 2, cy).hp, 55);
  assert.equal(g3.world.objectAt(cx + 1, cy).fuel, f.fuel);
  g3.step(60); assert.ok(g3.world.objectAt(cx + 1, cy).fuel < f.fuel);
  assert.equal(g3.world.objectAt(cx - 1, cy).inv.bag[0].n, 3);
});
