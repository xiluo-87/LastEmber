import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { NODES } from '../../src/data/structures.js';
import { makeStack, add, count, getSlot, ref, createInventory, selectedStack } from '../../src/logic/inventory.js';
import { planHit, applyHit, rollDrops } from '../../src/logic/gather.js';
import { TILE, TIME } from '../../src/data/balance.js';

const AXE = makeStack('stone_axe'), PICK = makeStack('stone_pickaxe');
const fixedRand = (v) => () => v;

test('gather rules: tool classes, multipliers, hands are slow', () => {
  assert.equal(planHit(NODES.tree, AXE).mode, 'tool');
  assert.equal(planHit(NODES.tree, AXE).dmg, 30);
  assert.equal(planHit(NODES.tree, null).mode, 'hands');
  assert.deepEqual(planHit(NODES.tree, null).drops, [{ item: 'stick', n: [1, 1] }], 'sticks only from trees by hand');
  assert.equal(planHit(NODES.tree, PICK).mode, 'hands', 'wrong tool = hands');
  assert.equal(planHit(NODES.rock_node, PICK).dmg, 24);
  assert.equal(planHit(NODES.iron_node, null).mode, 'none', 'ore needs a pickaxe');
  assert.equal(planHit(NODES.coal_node, AXE).mode, 'none');
  assert.equal(planHit(NODES.dead_bush, null).mode, 'direct');
  assert.equal(planHit(NODES.tree, makeStack('iron_axe')).dmg, 16 * 6);
});

test('gather rules: axe fells a tree in 4 hits and drops wood+sticks; hands need 10 hits per stick', () => {
  const t = { type: 'tree' };
  let last;
  for (let i = 0; i < 4; i++) last = applyHit(t, NODES.tree, AXE, { rand: fixedRand(0.99) });
  assert.ok(last.completed && last.depleted);
  const items = Object.fromEntries(last.drops.map((d) => [d.item, d.n]));
  assert.equal(items.wood, 4); assert.equal(items.stick, 2);
  const t2 = { type: 'tree' }; let hits = 0, r;
  do { r = applyHit(t2, NODES.tree, null); hits++; } while (!r.completed);
  assert.equal(hits, 10); assert.ok(!r.depleted, 'tree survives hand harvesting');
  assert.deepEqual(r.drops, [{ item: 'stick', n: 1 }]);
});

test('gather rules: hand harvesting a tree is limited', () => {
  const t = { type: 'tree' }; let completed = 0, r;
  for (let i = 0; i < 100; i++) { r = applyHit(t, NODES.tree, null); if (r.completed) completed++; if (!r.ok) break; }
  assert.equal(completed, 4); assert.equal(r.reason, 'bare');
});

test('gather rules: a full bag blocks the finishing hit and consumes nothing', () => {
  const t = { type: 'rock_node' };
  for (let i = 0; i < 3; i++) applyHit(t, NODES.rock_node, PICK, { canFit: () => false });
  const hpBefore = t.hp;
  const r = applyHit(t, NODES.rock_node, PICK, { canFit: () => false });
  assert.equal(r.ok, false); assert.equal(r.reason, 'full'); assert.equal(t.hp, hpBefore);
  const r2 = applyHit(t, NODES.rock_node, PICK, { canFit: () => true });
  assert.ok(r2.completed);
});

test('rollDrops honours ranges and chance', () => {
  assert.deepEqual(rollDrops([{ item: 'stone', n: [2, 4] }], fixedRand(0)), [{ item: 'stone', n: 2 }]);
  assert.deepEqual(rollDrops([{ item: 'stone', n: [2, 4] }], fixedRand(0.999)), [{ item: 'stone', n: 4 }]);
  assert.deepEqual(rollDrops([{ item: 'flint', n: [1, 1], chance: 0.35 }], fixedRand(0.5)), []);
  assert.deepEqual(rollDrops([{ item: 'flint', n: [1, 1], chance: 0.35 }], fixedRand(0.1)), [{ item: 'flint', n: 1 }]);
});

// ---- headless game flows ----
function setup(seed = 3) {
  const g = createGame(); g.newGame(seed);
  const toasts = []; g.ui.toast = (m, k) => toasts.push([m, k]);
  g.toasts = toasts;
  const p = g.state.player, w = g.world;
  // clean 9x5 arena east of the player, no objects, snow
  const t0 = w.worldToTile(p.x, p.y);
  for (let dx = -2; dx <= 8; dx++) for (let dy = -3; dy <= 3; dy++) { w.removeObject(t0.tx + dx, t0.ty + dy); w.setTerrain(t0.tx + dx, t0.ty + dy, 'snow'); }
  g.at = (dx) => ({ tx: t0.tx + dx, ty: t0.ty });
  p.facing = 0;
  g.place = (type, dx = 1, extra = {}) => { const { tx, ty } = g.at(dx); return w.setObject(tx, ty, { type, variant: 0, ...extra }); };
  g.hold = (id) => { const inv = g.state.inventory; inv.hotbar[0] = id ? makeStack(id) : null; inv.selected = 0; };
  g.press = (name) => { // headless input has no edge-clearing: set the edge for exactly one tick
    const k = { action: 'actionPressed', use: 'usePressed', interact: 'interactPressed' }[name], it = g.input.intent;
    it[k] = true; g.step(1); it[k] = false;
  };
  g.hitUntil = (cond, maxTicks = 900) => { for (let i = 0; i < maxTicks && !cond(); i++) { g.input.intent.actionHeld = true; g.step(1); } g.input.intent.actionHeld = false; };
  return g;
}

test('interaction: loose stick is the target, label/verb says Take, action picks it up', () => {
  const g = setup(); g.place('loose_stick');
  g.step(2);
  assert.equal(g.target?.obj?.type, 'loose_stick'); assert.equal(g.target.verb, 'Take');
  g.press('action');
  assert.equal(count(g.state.inventory, 'stick'), 1);
  assert.equal(g.world.objectAt(g.at(1).tx, g.at(1).ty), undefined);
});

test('interaction: registry accepts custom handlers (type, array, predicate) and priority', () => {
  const g = setup(); g.place('spike_barricade');
  const calls = [];
  g.interactions.register('creature', { label: () => 'Attack', onAction: () => calls.push('c') });
  const off = g.interactions.register((t) => t.obj?.type === 'loose_stone', { label: () => 'Smash', onAction: () => calls.push('p') });
  assert.equal(g.interactions.find({ kind: 'creature' }).label(), 'Attack');
  assert.equal(g.interactions.find({ obj: { type: 'loose_stone' } }).label(), 'Smash');
  g.interactions.register('loose_stone', { label: () => 'Hi', priority: 5, onAction: () => 0 });
  assert.equal(g.interactions.find({ obj: { type: 'loose_stone' } }).label(), 'Hi');
  off();
  assert.ok(g.interactions.find({ obj: { type: 'tree' } }), 'gather registered tree');
});

test('interaction: Action with no target is a swing: stamina, cooldown, and player:swing event with tool data', () => {
  const g = setup(); g.hold('spear');
  const evs = []; g.events.on('player:swing', (e) => evs.push(e));
  const s0 = g.state.player.stamina;
  g.press('action');
  assert.ok(g.interactions.swingState, 'swing animation active');
  assert.ok(g.state.player.stamina < s0, 'stamina spent');
  g.step(40);
  assert.equal(evs.length, 1);
  const e = evs[0];
  assert.equal(e.tool, 'spear'); assert.equal(e.damage, 18); assert.equal(e.reach, 1.8); assert.equal(e.facing, 0);
  assert.ok(Math.abs(e.origin.x - g.state.player.x) < 1e-6);
  // cooldown prevents spamming: a second press within the cooldown is ignored
  g.press('action'); g.press('action');
  g.step(60);
  assert.equal(evs.length, 2);
  assert.equal(g.interactions.find(null), null);
});

test('interaction: bare-handed free swing reports hands', () => {
  const g = setup(); g.hold(null);
  const evs = []; g.events.on('player:swing', (e) => evs.push(e));
  g.press('action'); g.step(40);
  assert.equal(evs[0].tool, 'hands'); assert.equal(evs[0].damage, 4);
});

test('gather: chopping with an axe yields wood, wears the axe, leaves a stump', () => {
  const g = setup(); g.place('tree'); g.hold('stone_axe'); g.step(2);
  assert.equal(g.target.verb, 'Chop');
  g.hitUntil(() => count(g.state.inventory, 'wood') > 0);
  assert.ok(count(g.state.inventory, 'wood') >= 3);
  assert.equal(g.world.objectAt(g.at(1).tx, g.at(1).ty).type, 'stump');
  assert.equal(selectedStack(g.state.inventory).dur, 56);
});

test('gather: bare-handed tree gives slow sticks only, no wood, and no tool wear', () => {
  const g = setup(); g.place('tree'); g.hold(null); g.step(2);
  assert.equal(g.target.verb, 'Pull sticks');
  g.hitUntil(() => count(g.state.inventory, 'stick') >= 1);
  assert.equal(count(g.state.inventory, 'wood'), 0);
  assert.equal(g.world.objectAt(g.at(1).tx, g.at(1).ty).type, 'tree');
});

test('gather: ore requires a pickaxe (toast, nothing happens by hand)', () => {
  const g = setup(); g.place('iron_node'); g.hold(null); g.step(2);
  assert.equal(g.target.verb, 'Need pickaxe');
  g.hitUntil(() => false, 120);
  assert.equal(count(g.state.inventory, 'iron_ore'), 0);
  assert.ok(g.toasts.some(([m]) => /pickaxe/.test(m)));
  g.hold('stone_pickaxe');
  g.hitUntil(() => count(g.state.inventory, 'iron_ore') > 0);
  assert.ok(count(g.state.inventory, 'iron_ore') >= 2);
  assert.equal(g.world.objectAt(g.at(1).tx, g.at(1).ty).type, 'rubble');
});

test('gather: tool breaks at 0 durability with a toast', () => {
  const g = setup(); g.place('tree'); g.hold('stone_axe'); g.state.inventory.hotbar[0].dur = 1; g.step(2);
  g.hitUntil(() => !selectedStack(g.state.inventory), 200);
  assert.equal(selectedStack(g.state.inventory), null);
  assert.ok(g.toasts.some(([m, k]) => /broke/.test(m) && k === 'bad'));
});

test('gather: full bag -> toast, node not consumed, nothing dropped on the ground', () => {
  const g = setup(); g.place('rock_node'); g.hold('stone_pickaxe');
  const inv = g.state.inventory;
  for (let i = 0; i < inv.bag.length; i++) inv.bag[i] = makeStack('wood', 20);
  for (let i = 1; i < inv.hotbar.length; i++) inv.hotbar[i] = makeStack('wood', 20);
  g.step(2); g.hitUntil(() => false, 300);
  assert.ok(g.toasts.some(([m]) => m === 'Bag full'));
  const o = g.world.objectAt(g.at(1).tx, g.at(1).ty);
  assert.equal(o.type, 'rock_node'); assert.ok(!o.depleted && o.hp > 0);
  assert.equal(count(inv, 'stone'), 0);
});

test('gather: berry bush depletes and regrows after 2 days; herb gives herb', () => {
  const g = setup(); g.place('berry_bush'); g.hold(null); g.step(2);
  g.hitUntil(() => count(g.state.inventory, 'berries') > 0);
  assert.ok(count(g.state.inventory, 'berries') >= 2);
  const o = g.world.objectAt(g.at(1).tx, g.at(1).ty);
  assert.ok(o.depleted);
  g.step(2); assert.equal(g.target, null, 'depleted bush is not targetable');
  g.state.time.day += 1; g.step(2); assert.ok(o.depleted, 'not yet');
  g.state.time.day += 1; g.state.time.t += 5; g.step(2);
  assert.ok(!o.depleted, 'regrew after 2 days');
  assert.equal(g.state.gather.regrow.length, 0);
});

test('gather: crash-site crate gives its loot; wreckage gives the unique radio part and survives JSON', () => {
  const g = setup(); const crate = g.place('crash_site', 1, { loot: [{ item: 'tin_pot', n: 1 }, { item: 'cloth', n: 2 }] });
  g.step(2); assert.equal(g.target.verb, 'Open');
  g.press('action');
  assert.equal(count(g.state.inventory, 'tin_pot'), 1); assert.equal(count(g.state.inventory, 'cloth'), 2);
  assert.ok(crate.depleted);
  g.world.removeObject(g.at(1).tx, g.at(1).ty);
  g.place('wreckage', 1, { part: 'radio_battery', loot: [{ item: 'rope', n: 1 }] });
  const parts = []; g.events.on('radio:partFound', (e) => parts.push(e.part));
  g.step(40); // open-cooldown
  g.press('action');
  assert.equal(count(g.state.inventory, 'radio_battery'), 1); assert.deepEqual(parts, ['radio_battery']);
  assert.ok(g.state.flags.partsFound.radio_battery);
  JSON.parse(JSON.stringify(g.state));
});

test('items: eat berries, bandage cures bleeding, clothing equips, raw meat can poison', () => {
  const g = setup(); const inv = g.state.inventory, p = g.state.player;
  p.hunger = 40; add(inv, 'berries', 2); inv.hotbar[0] = null;
  g.hold('berries'); inv.hotbar[0].n = 2;
  g.press('use');
  assert.equal(Math.round(p.hunger), 48); assert.equal(inv.hotbar[0].n, 1);
  p.hunger = 100; p.thirst = 100; g.press('use');
  assert.equal(inv.hotbar[0].n, 1, 'not hungry -> not consumed');
  p.status.bleeding = { left: null }; p.health = 50; inv.hotbar[0] = makeStack('bandage', 2); g.press('use');
  assert.ok(!p.status.bleeding); assert.equal(Math.round(p.health), 60);
  inv.hotbar[0] = makeStack('fur_coat'); g.press('use');
  assert.equal(inv.clothing[1].id, 'fur_coat'); assert.equal(inv.hotbar[0].id, 'worn_jacket', 'old piece swapped into the slot');
  inv.hotbar[0] = makeStack('raw_meat', 20); p.hunger = 10;
  const orig = Math.random; Math.random = () => 0.1; g.press('use'); Math.random = orig;
  assert.ok(p.status.food_poisoning, 'raw meat poisons on a low roll');
  inv.hotbar[0] = makeStack('herbal_tea', 2); p.thirst = 20; g.press('use');
  assert.ok(!p.status.food_poisoning, 'tea cures sickness');
});

test('items: torch burns 180s only while selected, lights, then is removed', () => {
  const g = setup(); const inv = g.state.inventory;
  g.hold('torch'); inv.hotbar[1] = makeStack('stone_axe');
  const lights = []; g.lightProviders.forEach((fn) => fn(g, (l) => lights.push(l)));
  g.step(60);
  assert.ok(g.state.flags.torchLit); assert.ok(Math.abs(inv.hotbar[0].burn - 179) < 0.1);
  lights.length = 0; g.lightProviders.forEach((fn) => fn(g, (l) => lights.push(l)));
  assert.ok(lights.some((l) => l.radius === 3.5));
  inv.selected = 1; g.step(600);
  assert.ok(!g.state.flags.torchLit); assert.ok(Math.abs(inv.hotbar[0].burn - 179) < 0.1, 'does not burn when not held');
  inv.selected = 0; inv.hotbar[0].burn = 0.5; g.step(60);
  assert.equal(inv.hotbar[0], null); assert.ok(g.toasts.some(([m]) => /burnt out/.test(m)));
});

test('items: drop creates a ground pickup that can be taken back (keeps durability); bag-full pickup refused', () => {
  const g = setup(); const inv = g.state.inventory;
  g.hold('stone_axe'); inv.hotbar[0].dur = 33;
  const { dropStack } = awaitImport();
  assert.ok(dropStack(g, ref('hotbar', 0)));
  assert.equal(inv.hotbar[0], null);
  const drop = g.world.objectList().find((o) => o.type === 'dropped_item');
  assert.equal(drop.stack.dur, 33);
  const c = g.world.tileCenter(drop.tx, drop.ty); g.state.player.x = c.x - TILE; g.state.player.y = c.y; g.state.player.facing = 0;
  g.step(2); assert.equal(g.target.obj, drop); assert.equal(g.target.name, 'Stone axe'); assert.equal(g.target.verb, 'Take');
  g.press('action');
  assert.equal(g.world.objectAt(drop.tx, drop.ty), undefined);
  const axe = [...inv.hotbar, ...inv.bag].find((s) => s?.id === 'stone_axe'); assert.equal(axe.dur, 33);
});

import * as itemactions from '../../src/systems/itemactions.js';
function awaitImport() { return itemactions; }
