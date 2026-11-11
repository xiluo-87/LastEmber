// Regression: gameplay randomness is one seeded stream stored in state (no Math.random in the simulation), so a seed + inputs reproduces a run,
// and a save -> load continues the same stream. Also the balance-pass recipes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { recipeById } from '../../src/data/recipes.js';
import { nextRand } from '../../src/logic/grand.js';

function run(seed, ticks, trap = false) {
  const g = createGame(); g.newGame(seed);
  const orig = Math.random;
  if (trap) Math.random = () => { throw new Error('Math.random used in gameplay'); };
  try {
    g.state.time.t = 250;                     // dusk: wolves spawn, AI rolls, weather
    g.input.intent.moveX = 0.6; g.input.intent.moveY = 0.2;
    g.step(ticks);
  } finally { Math.random = orig; }
  return g;
}

test('sim: no Math.random during creature AI / weather / night (seeded stream only)', () => { run(5, 3000, true); });

test('sim: same seed + inputs -> identical run; different seed -> different', () => {
  const a = run(7, 2400), b = run(7, 2400), c = run(8, 2400);
  const sig = (g) => JSON.stringify([g.state.player, g.state.creatures.list.map((x) => [x.type, Math.round(x.x), Math.round(x.y), x.hp]), g.state.rngA]);
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

test('rng: stream state lives in state.rngA and survives JSON (save/load continues the stream)', () => {
  const st = { seed: 3 };
  const first = [nextRand(st), nextRand(st)];
  const copy = JSON.parse(JSON.stringify(st));
  assert.equal(nextRand(st), nextRand(copy));
  assert.ok(first.every((v) => v >= 0 && v < 1) && first[0] !== first[1]);
});

test('balance: bandages can be made from hide + fiber (bleeding must be answerable without cloth/herbs)', () => {
  const r = recipeById('bandage_hide');
  assert.ok(r && r.station === 'hand' && r.out.item === 'bandage');
});
