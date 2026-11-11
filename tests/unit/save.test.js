import test from 'node:test';
import assert from 'node:assert/strict';
import * as saves from '../../src/save.js';
import { createState } from '../../src/state.js';
import { createGame } from '../../src/game.js';
import { add } from '../../src/logic/inventory.js';
import { SAVE } from '../../src/data/balance.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

test('whole game state round-trips through save/load', () => {
  const st = memStorage();
  const game = createGame({ storage: st });
  game.newGame(77);
  add(game.state.inventory, 'stone_axe'); add(game.state.inventory, 'wood', 33);
  game.state.player.x += 123.5; game.state.player.health = 41;
  game.world.setObject(60, 60, { type: 'campfire', fuel: 120, hp: 40 });
  game.world.setTerrain(10, 10, 'ice');
  game.step(120);
  const before = JSON.parse(JSON.stringify(game.state));
  assert.ok(game.save());
  assert.ok(st._m.has(SAVE.key));
  const g2 = createGame({ storage: st });
  assert.ok(g2.hasSave());
  assert.ok(g2.loadGame());
  assert.deepEqual(JSON.parse(JSON.stringify(g2.state)), before);
  assert.equal(g2.world.objectAt(60, 60).type, 'campfire');
  assert.equal(g2.world.terrainAt(10, 10), 'ice');
  g2.step(10); // loaded state keeps running
});

test('storage failures never throw', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  const s = createState(1);
  assert.equal(saves.save(s, bad), false);
  assert.equal(saves.load(bad), null);
  assert.equal(saves.hasSave(bad), false);
  assert.equal(saves.save(s, null), false);
});

test('corrupt, future-version and incomplete saves are rejected', () => {
  const st = memStorage();
  st.setItem(SAVE.key, '{not json'); assert.equal(saves.load(st), null);
  st.setItem(SAVE.key, JSON.stringify({ v: 999, state: createState(1) })); assert.equal(saves.load(st), null);
  st.setItem(SAVE.key, JSON.stringify({ v: 1, state: { version: 1 } })); assert.equal(saves.load(st), null);
  saves.save(createState(1), st); assert.ok(saves.load(st)); saves.clear(st); assert.equal(saves.load(st), null);
});

test('migration hook upgrades old states step by step', () => {
  const s = createState(2);
  const old = { ...JSON.parse(JSON.stringify(s)), version: 0 };
  assert.equal(saves.migrate(old), null, 'no migration registered for v0');
  saves.MIGRATIONS[0] = (x) => ({ ...x, migrated: true });
  const m = saves.migrate(old);
  assert.ok(m && m.migrated && m.version === 1);
  delete saves.MIGRATIONS[0];
});

test('missing system slices are filled with defaults when a state is attached', () => {
  const game = createGame();
  const s = JSON.parse(JSON.stringify(createState(4)));
  game.attachState(s);
  assert.ok(game.state.time && game.state.time.day === 1);
  assert.ok(game.state.time.phase);
});
