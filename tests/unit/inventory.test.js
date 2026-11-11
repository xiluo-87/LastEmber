import test from 'node:test';
import assert from 'node:assert/strict';
import * as inv from '../../src/logic/inventory.js';
import { ITEMS } from '../../src/data/items.js';

test('new inventory has 16 bag + 5 hotbar + 3 clothing slots', () => {
  const i = inv.createInventory();
  assert.equal(i.bag.length, 16); assert.equal(i.hotbar.length, 5); assert.equal(i.clothing.length, 3);
});

test('stacking up to 20, overflow into new slots, leftover returned when full', () => {
  const i = inv.createInventory();
  assert.equal(inv.add(i, 'wood', 45), 0);
  assert.deepEqual(i.bag.slice(0, 3).map((s) => s.n), [20, 20, 5]);
  assert.equal(inv.count(i, 'wood'), 45);
  inv.add(i, 'wood', 10);
  assert.deepEqual(i.bag.slice(0, 3).map((s) => s.n), [20, 20, 15]);
  const full = inv.createInventory({ bag: 1, hotbar: 1 });
  assert.equal(inv.add(full, 'stone', 50), 10, 'only 2 slots x 20 fit');
  assert.ok(!inv.canAdd(full, 'wood', 1)); assert.ok(inv.canAdd(full, 'stone', 0));
});

test('canAddCount accounts for partial stacks', () => {
  const i = inv.createInventory({ bag: 1, hotbar: 0 });
  inv.add(i, 'wood', 15);
  assert.equal(inv.canAddCount(i, 'wood', 10), 5); assert.ok(!inv.canAdd(i, 'wood', 6)); assert.ok(inv.canAdd(i, 'wood', 5));
  assert.ok(!inv.canAdd(i, 'stone', 1));
});

test('tools never stack, carry durability, prefer the hotbar', () => {
  const i = inv.createInventory();
  inv.add(i, 'stone_axe', 2);
  assert.equal(i.hotbar[0].id, 'stone_axe'); assert.equal(i.hotbar[1].id, 'stone_axe');
  assert.equal(i.hotbar[0].n, 1); assert.equal(i.hotbar[0].dur, ITEMS.stone_axe.tool.dur);
  assert.equal(inv.wear(i, inv.ref('hotbar', 0), 10), 'ok'); assert.equal(i.hotbar[0].dur, 50);
  assert.equal(i.hotbar[1].dur, 60, 'separate durability per tool');
  assert.equal(inv.wear(i, inv.ref('hotbar', 0), 50), 'broken'); assert.equal(i.hotbar[0], null);
  assert.equal(inv.wear(i, inv.ref('hotbar', 3), 1), null);
});

test('remove is all-or-nothing and spans stacks', () => {
  const i = inv.createInventory();
  inv.add(i, 'stick', 30);
  assert.ok(!inv.remove(i, 'stick', 31)); assert.equal(inv.count(i, 'stick'), 30);
  assert.ok(inv.remove(i, 'stick', 25)); assert.equal(inv.count(i, 'stick'), 5);
  assert.ok(inv.has(i, 'stick', 5)); assert.ok(!inv.has(i, 'stick', 6));
  assert.ok(inv.remove(i, 'stick', 5)); assert.ok(i.bag.every((s) => s === null));
});

test('removeAll / hasAll (recipes)', () => {
  const i = inv.createInventory();
  inv.add(i, 'stick', 2); inv.add(i, 'stone', 2);
  const needs = [{ item: 'stick', n: 2 }, { item: 'stone', n: 2 }, { item: 'fiber', n: 1 }];
  assert.ok(!inv.hasAll(i, needs)); assert.ok(!inv.removeAll(i, needs)); assert.equal(inv.count(i, 'stick'), 2);
  inv.add(i, 'fiber', 1); assert.ok(inv.removeAll(i, needs)); assert.equal(inv.count(i, 'stone'), 0);
});

test('move: split, merge, swap between areas', () => {
  const i = inv.createInventory();
  inv.add(i, 'wood', 10);
  assert.ok(inv.move(i, inv.ref('bag', 0), inv.ref('bag', 5), 4));
  assert.deepEqual([i.bag[0].n, i.bag[5].n], [6, 4]);
  assert.ok(inv.move(i, inv.ref('bag', 5), inv.ref('bag', 0))); // merge
  assert.equal(i.bag[0].n, 10); assert.equal(i.bag[5], null);
  inv.add(i, 'stone', 3);
  assert.ok(inv.swap(i, inv.ref('bag', 0), inv.ref('bag', 1)));
  assert.equal(i.bag[0].id, 'stone'); assert.equal(i.bag[1].id, 'wood');
  assert.ok(inv.move(i, inv.ref('bag', 0), inv.ref('hotbar', 4))); assert.equal(i.hotbar[4].id, 'stone');
  inv.add(i, 'stone', 18); // merge respects cap 20
  assert.ok(inv.count(i, 'stone') === 21);
});

test('clothing slots only accept matching clothing; equip swaps; insulation sums', () => {
  const i = inv.createInventory();
  inv.add(i, 'worn_jacket'); inv.add(i, 'fur_coat'); inv.add(i, 'fur_hat'); inv.add(i, 'wood', 1);
  const find = (id) => { for (const a of ['hotbar', 'bag']) { const k = i[a].findIndex((s) => s?.id === id); if (k >= 0) return inv.ref(a, k); } };
  assert.ok(!inv.move(i, find('wood'), inv.ref('clothing', 1)), 'wood is not clothing');
  assert.ok(!inv.move(i, find('fur_hat'), inv.ref('clothing', 1)), 'hat is not a body item');
  assert.ok(inv.equip(i, find('worn_jacket'))); assert.equal(i.clothing[1].id, 'worn_jacket'); assert.equal(inv.insulation(i), 4);
  assert.ok(inv.equip(i, find('fur_coat'))); assert.equal(i.clothing[1].id, 'fur_coat');
  assert.ok(inv.has(i, 'worn_jacket'), 'old jacket went back into the bag');
  assert.ok(inv.equip(i, find('fur_hat'))); assert.equal(inv.insulation(i), 9 + 4);
  assert.ok(!inv.equip(i, find('wood')));
});

test('hotbar selection, selectedStack, removeAt, containers', () => {
  const i = inv.createInventory();
  inv.add(i, 'spear'); assert.equal(inv.selectedStack(i).id, 'spear');
  assert.ok(inv.selectHotbar(i, 2)); assert.equal(inv.selectedStack(i), null); assert.ok(!inv.selectHotbar(i, 9));
  inv.add(i, 'berries', 7);
  const r = inv.removeAt(i, inv.ref('bag', 0), 3); assert.equal(r.n, 3); assert.equal(i.bag[0].n, 4);
  const chest = inv.createContainer(12);
  assert.equal(inv.add(chest, 'wood', 25), 0); assert.equal(chest.bag[1].n, 5); assert.ok(!chest.hotbar);
});

test('unknown item throws; inventory is JSON round-trippable', () => {
  const i = inv.createInventory();
  assert.throws(() => inv.add(i, 'nope', 1));
  inv.add(i, 'stone_axe'); inv.add(i, 'wood', 7);
  assert.deepEqual(JSON.parse(JSON.stringify(i)), i);
});
