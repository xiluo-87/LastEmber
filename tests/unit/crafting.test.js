import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, recipeById } from '../../src/data/recipes.js';
import { createInventory, add, count, makeStack } from '../../src/logic/inventory.js';
import { craftStatus, canCraft, craft, groupRecipes, recipeLabel } from '../../src/logic/crafting.js';
import { planUse } from '../../src/logic/use.js';

const inv = (items = {}) => { const i = createInventory(); for (const [id, n] of Object.entries(items)) add(i, id, n); return i; };

test('crafting: hand recipe consumes inputs and produces output', () => {
  const i = inv({ stick: 3, stone: 2, fiber: 1 });
  assert.ok(canCraft(recipeById('stone_axe'), i, []));
  const r = craft(recipeById('stone_axe'), i, []);
  assert.ok(r.ok); assert.equal(r.produced.item, 'stone_axe');
  assert.equal(count(i, 'stick'), 1); assert.equal(count(i, 'stone'), 0); assert.equal(count(i, 'fiber'), 0);
  const axe = [...i.hotbar, ...i.bag].find((s) => s?.id === 'stone_axe');
  assert.equal(axe.dur, 60, 'new tools start at full durability');
});

test('crafting: missing ingredients reported, nothing consumed', () => {
  const i = inv({ stick: 2, stone: 1 });
  const s = craftStatus(recipeById('stone_axe'), i, []);
  assert.ok(!s.ok);
  assert.deepEqual(s.missing.map((m) => [m.item, m.have, m.need]).sort(), [['fiber', 0, 1], ['stone', 1, 2]]);
  assert.equal(craft(recipeById('stone_axe'), i, []).ok, false);
  assert.equal(count(i, 'stick'), 2);
});

test('crafting: stations are required (workbench / lit campfire / furnace)', () => {
  const i = inv({ stick: 3, rope: 2 });
  assert.equal(craftStatus(recipeById('bow'), i, []).missingStation, 'workbench');
  assert.ok(canCraft(recipeById('bow'), i, ['workbench']));
  assert.ok(canCraft(recipeById('bow'), i, new Set(['workbench', 'campfire'])));
  const meat = inv({ raw_meat: 1 });
  assert.ok(!canCraft(recipeById('cooked_meat'), meat, ['workbench']));
  assert.ok(canCraft(recipeById('cooked_meat'), meat, ['campfire']));
  assert.ok(canCraft(recipeById('iron_ingot'), inv({ iron_ore: 2, coal: 1 }), ['furnace']));
});

test('crafting: OR-recipes (torch fat | fiber+coal, bandage cloth | fiber+herb) work independently', () => {
  assert.ok(canCraft(recipeById('torch_fat'), inv({ stick: 1, fat: 1 }), []));
  assert.ok(!canCraft(recipeById('torch_coal'), inv({ stick: 1, fat: 1 }), []));
  assert.ok(canCraft(recipeById('torch_coal'), inv({ fiber: 1, coal: 1 }), []));
  assert.ok(canCraft(recipeById('bandage_cloth'), inv({ cloth: 1 }), []));
  assert.ok(canCraft(recipeById('bandage_herb'), inv({ fiber: 2, herb: 1 }), []));
  assert.notEqual(recipeLabel(recipeById('torch_fat')), recipeLabel(recipeById('torch_coal')));
});

test('crafting: arrow makes 6; unique tool (tin_pot) required but NOT consumed', () => {
  const i = inv({ stick: 1, flint: 1 });
  assert.equal(craft(recipeById('arrow'), i, ['workbench']).produced.n, 6);
  assert.equal(count(i, 'arrow'), 6);
  const j = inv({ snow_water: 1, tin_pot: 1 });
  assert.ok(canCraft(recipeById('clean_water'), j, ['campfire']));
  assert.ok(!canCraft(recipeById('clean_water'), inv({ snow_water: 1 }), ['campfire']), 'needs the pot');
  craft(recipeById('clean_water'), j, ['campfire']);
  assert.equal(count(j, 'tin_pot'), 1); assert.equal(count(j, 'clean_water'), 1); assert.equal(count(j, 'snow_water'), 0);
  // "gather snow" is free: no ingredients, only pot + fire
  const k = inv({ tin_pot: 1 });
  assert.ok(canCraft(recipeById('snow_water'), k, ['campfire']));
});

test('crafting: output must fit (bag full -> refused, ingredients kept)', () => {
  const i = createInventory();
  for (let n = 0; n < 16; n++) i.bag[n] = makeStack('stone', 20);
  for (let n = 0; n < 5; n++) i.hotbar[n] = makeStack('stone', 20);
  add(i, 'stick', 0);
  i.bag[0] = makeStack('fiber', 3); // 3 fiber -> rope (frees the slot, so it fits)
  assert.ok(canCraft(recipeById('rope'), i, []));
  i.bag[1] = makeStack('fiber', 3); i.bag[0] = makeStack('stone', 20); // 3 fiber but no free slot after removal? bag[1] frees up
  assert.ok(canCraft(recipeById('rope'), i, []));
  i.bag[1] = makeStack('stone', 20); i.bag[2] = makeStack('fiber', 1); i.bag[3] = makeStack('stone', 20);
  const st = craftStatus(recipeById('stone_axe'), i, []);
  assert.ok(!st.ok);
});

test('crafting: groups are ordered by station, craftable first', () => {
  const i = inv({ stick: 2, stone: 2, fiber: 1 });
  const groups = groupRecipes(i, []);
  assert.deepEqual(groups.map((g) => g.station), ['hand', 'workbench', 'campfire', 'furnace']);
  assert.equal(groups[0].recipes[0].recipe.id, 'stone_axe');
  assert.ok(groups[0].recipes[0].status.ok);
  const flat = groups.flatMap((g) => g.recipes);
  assert.equal(flat.length, RECIPES.length);
});

test('use: food plans, refusal when pointless, cures', () => {
  const p = { hunger: 50, thirst: 100, warmth: 100, health: 100, status: {} };
  assert.deepEqual(planUse('berries', p).restore, { hunger: 8, thirst: 2 });
  assert.equal(planUse('berries', { ...p, hunger: 100 }).refuse, 'Not hungry');
  assert.equal(planUse('raw_meat', p).poison, 0.4);
  assert.equal(planUse('bandage', p).refuse, 'No need');
  assert.equal(planUse('bandage', { ...p, status: { bleeding: {} } }).refuse, null);
  assert.equal(planUse('herbal_tea', { ...p, thirst: 100, warmth: 100, status: {} }).refuse, 'Not thirsty');
  assert.equal(planUse('herbal_tea', { ...p, thirst: 100, status: { food_poisoning: {} } }).refuse, null);
  assert.equal(planUse('fur_coat', p).kind, 'equip');
});
