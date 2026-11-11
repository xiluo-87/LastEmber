// Fast sim subset (npm run test:sim): balance targets with evidence, bot sanity, determinism, save round trip. ~20-30 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { runOne } from './run.mjs';
import { census } from './worldcheck.mjs';
import { TIME } from '../../src/data/balance.js';

test('idle player: warmth lasts >= ~5 min (tutorial slack) but the player is dead before dawn of day 2', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = createGame(); g.newGame(seed);
    let zero = null, dead = null; g.events.on('game:over', () => { dead = g.state.stats.playSeconds; });
    while (g.mode === 'playing' && g.state.stats.playSeconds < 600) { g.step(60); if (zero === null && g.state.player.warmth <= 0) zero = g.state.stats.playSeconds; }
    assert.ok(zero >= 290, `seed ${seed}: warmth hit 0 at ${zero}s`);
    assert.ok(dead !== null && dead < TIME.dayLength - TIME.startT, `seed ${seed}: idle alive at dawn (dead=${dead})`);
  }
});

test('world: every seed has the bootstrap materials within 15 tiles of spawn (30 seeds)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const c = census(seed, 15);
    assert.ok((c.tree || 0) >= 6, `seed ${seed} trees ${c.tree}`);
    assert.ok((c.dead_bush || 0) >= 3, `seed ${seed} dead bushes (fiber) ${c.dead_bush}`);
    assert.ok((c.rock_node || 0) >= 2, `seed ${seed} boulders (flint/stone) ${c.rock_node}`);
    assert.ok((c.berry_bush || 0) >= 1, `seed ${seed} berries ${c.berry_bush}`);
    assert.ok((c.loose_stone || 0) >= 6 && (c.loose_stick || 0) >= 6, `seed ${seed} loose pickups`);
  }
});

test('competent bot: first axe < 2 min, campfire lit < 3 min, shelter before the end of night 1, alive after 3 days, no NaN', () => {
  for (const seed of [1, 2, 3]) {
    const r = runOne('competent', seed, { days: 3 });
    assert.ok(r.miles.axe < 120, `seed ${seed} axe ${r.miles.axe}`);
    assert.ok(r.miles.fire < 180, `seed ${seed} fire ${r.miles.fire}`);
    assert.ok(r.miles.shelter < 440, `seed ${seed} shelter ${r.miles.shelter}`);
    assert.ok(!r.died, `seed ${seed} died: ${r.cause}`);
    assert.ok(!r.nan && r.errors === 0 && r.diverged === 0 && r.roundTrips >= 2, `seed ${seed} nan=${r.nan} errors=${r.errors} diverged=${r.diverged} trips=${r.roundTrips}`);
  }
});

test('sim is reproducible: same seed + profile -> same outcome (seeded RNG, save/load every day)', () => {
  const a = runOne('competent', 4, { days: 2 }), b = runOne('competent', 4, { days: 2 });
  assert.deepEqual(a.miles, b.miles);
  assert.deepEqual(a.perDay[1].min, b.perDay[1].min);
});

test('sloppy bot (fire only) does not survive to day 8; sim never produces NaN stats', () => {
  const r = runOne('sloppy', 2, { days: 8 });
  assert.ok(r.died && r.day < 8, `sloppy survived to day ${r.day}`);
  assert.ok(!r.nan);
});
