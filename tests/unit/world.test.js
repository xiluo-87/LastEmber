import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../../src/world/gen.js';
import { createWorld } from '../../src/world/world.js';
import { MAP, TILE } from '../../src/data/balance.js';
import { moveCircle } from '../../src/logic/collision.js';

const SEEDS = [1, 2, 3, 7, 42, 1234, 99999];
const dist = (a, b) => Math.hypot(a.tx - b.tx, a.ty - b.ty);

test('world gen is deterministic per seed and differs between seeds', () => {
  const a = generateWorld(42), b = generateWorld(42), c = generateWorld(43);
  assert.deepEqual(a, b);
  assert.notEqual(a.terrain, c.terrain);
  assert.equal(a.terrain.length, MAP.w * MAP.h);
});

test('world data is plain JSON-serialisable', () => {
  const a = generateWorld(5);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

test('border is impassable and spawn clearing is open', () => {
  for (const seed of SEEDS) {
    const w = createWorld(generateWorld(seed));
    for (let i = 0; i < MAP.w; i++) for (const [x, y] of [[i, 0], [i, MAP.h - 1], [0, i], [MAP.w - 1, i]]) assert.ok(w.isBlocked(x, y), `border open at ${x},${y} seed ${seed}`);
    assert.ok(!w.isBlocked(MAP.spawn.tx, MAP.spawn.ty));
    assert.ok(!w.objectAt(MAP.spawn.tx, MAP.spawn.ty));
  }
});

test('POI constraints: crate, 3 wreckage (distinct quadrants, >=40 from spawn, distinct parts), dens on rock', () => {
  for (const seed of SEEDS) {
    const d = generateWorld(seed), w = createWorld(d);
    const crash = d.pois.filter((p) => p.type === 'crash_site');
    assert.equal(crash.length, 1);
    assert.ok(dist(crash[0], d.spawn) < 5);
    assert.ok(w.objectAt(crash[0].tx, crash[0].ty).loot.length > 0);
    const wr = d.pois.filter((p) => p.type === 'wreckage');
    assert.equal(wr.length, 3, `seed ${seed}`);
    assert.equal(new Set(wr.map((p) => p.quadrant)).size, 3, 'different quadrants');
    assert.equal(new Set(wr.map((p) => p.part)).size, 3, 'each has a distinct radio part');
    for (const p of wr) { assert.ok(dist(p, d.spawn) >= 40, `wreckage ${dist(p, d.spawn)} from spawn (seed ${seed})`); assert.equal(w.objectAt(p.tx, p.ty).part, p.part); }
    const dens = d.pois.filter((p) => p.type === 'bear_den');
    assert.ok(dens.length >= 2 && dens.length <= 3);
    for (const den of dens) {
      assert.equal(w.terrainAt(den.tx, den.ty), 'rock');
      let ore = 0;
      w.forEachObject((o) => { if ((o.type === 'iron_node' || o.type === 'coal_node') && dist(o.tx ? o : den, den) < 9 && dist({ tx: o.tx, ty: o.ty }, den) < 9) ore++; });
      assert.ok(ore >= 3, `den at ${den.tx},${den.ty} has ${ore} nearby ore nodes (seed ${seed})`);
    }
  }
});

test('every POI is reachable on foot from spawn', () => {
  for (const seed of SEEDS) {
    const d = generateWorld(seed), w = createWorld(d);
    const seen = new Uint8Array(w.w * w.h), q = [d.spawn.tx, d.spawn.ty];
    seen[d.spawn.ty * w.w + d.spawn.tx] = 1;
    for (let i = 0; i < q.length; i += 2) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = q[i] + dx, y = q[i + 1] + dy;
      if (!w.inBounds(x, y) || seen[y * w.w + x] || w.isBlocked(x, y)) continue;
      seen[y * w.w + x] = 1; q.push(x, y);
    }
    for (const p of d.pois) assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[(p.ty + dy) * w.w + p.tx + dx]), `${p.type} at ${p.tx},${p.ty} unreachable (seed ${seed})`);
  }
});

test('bootstrapping resources exist near spawn', () => {
  const d = generateWorld(11), w = createWorld(d);
  const c = {};
  w.forEachObject((o) => { if (Math.hypot(o.tx - d.spawn.tx, o.ty - d.spawn.ty) <= 15) c[o.type] = (c[o.type] || 0) + 1; });
  assert.ok(c.loose_stone >= 6 && c.loose_stick >= 6 && c.tree >= 5 && c.dead_bush >= 2, JSON.stringify(c));
});

test('world API: terrain, objects, blocking, coordinates', () => {
  const w = createWorld(generateWorld(3));
  const changes = [];
  w.onObjectChanged = (tx, ty, o, prev) => changes.push([tx, ty, !!o, !!prev]);
  const { tx, ty } = MAP.spawn;
  assert.equal(w.terrainAt(tx, ty), 'snow');
  assert.equal(w.terrainAt(-5, -5), 'cliff');
  assert.ok(w.isBlocked(-1, 0));
  w.setObject(tx, ty, { type: 'wood_wall', hp: 80 });
  assert.ok(w.isBlocked(tx, ty));
  assert.equal(w.objectAt(tx, ty).tx, tx);
  w.setObject(tx + 1, ty, { type: 'door' });
  assert.ok(!w.isBlocked(tx + 1, ty) && w.isBlocked(tx + 1, ty, { creature: true }), 'door: player walks, creatures blocked');
  assert.equal(w.removeObject(tx, ty).type, 'wood_wall');
  assert.ok(!w.isBlocked(tx, ty));
  assert.equal(changes.length, 3);
  w.setTerrain(tx, ty, 'ice');
  assert.equal(w.terrainAt(tx, ty), 'ice'); assert.equal(w.data.terrain[ty * w.w + tx], '2');
  w.setTerrain(tx, ty, 'deep_snow'); assert.equal(w.terrainSpeed(tx, ty), 0.6);
  assert.deepEqual(w.worldToTile(tx * TILE + 5, ty * TILE + 31), { tx, ty });
  assert.deepEqual(w.tileCenter(tx, ty), { x: tx * TILE + 16, y: ty * TILE + 16 });
  assert.deepEqual(w.tileToWorld(2, 3), { x: 64, y: 96 });
});

test('collision: blocked by wall, slides along it, cannot tunnel', () => {
  const w = createWorld(generateWorld(3));
  const { tx, ty } = MAP.spawn;
  for (let y = ty - 3; y <= ty + 3; y++) w.setObject(tx + 3, y, { type: 'stone_wall' });
  const r = 0.3 * TILE;
  let x = (tx + 1) * TILE + 16, y = ty * TILE + 16;
  let res = moveCircle(w, x, y, 400, 0, r); // fast shove into the wall
  assert.ok(res.x <= (tx + 3) * TILE - r + 0.001, `x=${res.x}`);
  assert.ok(res.hitX);
  res = moveCircle(w, res.x, y, 50, 40, r); // diagonal: x blocked, y slides
  assert.ok(res.y > y + 30, `should slide in y (${res.y - y})`);
  assert.ok(res.x <= (tx + 3) * TILE - r + 0.001);
  const free = moveCircle(w, x, y, -20, 0, r);
  assert.equal(free.x, x - 20);
});
