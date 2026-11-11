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

test('save -> load round trip restores the full state exactly (bot-driven, 3 checkpoints)', async () => {
  const { createBot } = await import('./bot.mjs');
  const { memStorage } = await import('./run.mjs');
  const g = createGame({ storage: memStorage() }); g.newGame(3);
  const b = createBot(g, 'competent');
  const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.survival.rate; return c; };   // rate = smoothed HUD trend, recomputed on load
  for (const stopAt of [600, 1500, 2500]) {
    while (g.mode === 'playing' && (g.state.time.day - 1) * 480 + g.state.time.t < stopAt) { b.think(); g.step(6); }
    const before = strip(g.state); g.save(); assert.ok(g.loadGame(), 'load failed');
    assert.deepEqual(strip(g.state), before, `state diverged after load at ${stopAt}`);
  }
});

// ---------------------------------------------------------------- round 2: late-game scenario harness (direct state set-up, see scenarios.mjs)
import { runNight, runBear, runExpedition } from './scenarios.mjs';
const sum = (rs, k) => rs.reduce((s, r) => s + r[k], 0);

test('scenario defence: a wooden base at day 10 is under real threat but survivable; stone + spikes + torch posts hold with little damage', () => {
  const wood = [1, 2, 3].map((s) => runNight(s, { day: 10, wall: 'wood', kit: 'stone_spear' }));
  assert.ok(wood.filter((r) => !r.died).length >= 2, 'wood survivable with active defence');
  assert.ok(sum(wood, 'hpLost') + sum(wood, 'walls') * 10 > 0, 'wolves hurt or chew something');
  const stone = [1, 2, 3].map((s) => runNight(s, { day: 10, wall: 'stone', spikes: true, torches: true, kit: 'stone_spear' }));
  assert.equal(stone.filter((r) => r.died).length, 0);
  assert.ok(sum(stone, 'hpLost') <= sum(wood, 'hpLost'), 'the fortified base costs less hp');
});

test('scenario signal: stone walls + spike ring + iron spear usually finish three nights; wooden walls + stone spear at day 12 almost never do', () => {
  const good = [1, 2, 3, 4].map((s) => runNight(s, { day: 9, wall: 'stone', spikes: true, kit: 'iron_spear', tower: true, nights: 3 }));
  assert.ok(good.filter((r) => r.won).length >= 2, `fortified wins ${good.filter((r) => r.won).length}/4`);
  const bad = [1, 2, 3, 4].map((s) => runNight(s, { day: 12, wall: 'wood', kit: 'stone_spear', tower: true, nights: 3 }));
  assert.ok(bad.filter((r) => r.won).length <= 2, `wood wins ${bad.filter((r) => r.won).length}/4`);
  assert.ok(good.filter((r) => r.won).length > bad.filter((r) => r.won).length);
});

test('scenario bear: the stone spear costs most of your health, the iron spear about half, a kiting bow nothing', () => {
  const run = (kit) => [1, 2, 3, 4, 5, 6].map((s) => runBear(s, { kit }));
  const st = run('stone_spear'), ir = run('iron_spear'), bw = run('bow');
  const hp = (rs) => sum(rs, 'hpLost') / rs.length;
  assert.ok(hp(st) >= 60, `stone spear hp lost ${hp(st)}`);
  assert.ok(hp(ir) < hp(st) && hp(ir) >= 20, `iron spear hp lost ${hp(ir)}`);
  assert.ok(hp(bw) < 25 && bw.every((r) => r.won), `bow hp lost ${hp(bw)}`);
});

test('scenario expedition: a wreckage is a short round trip in clear weather and survivable in a blizzard with fur and an emergency fire', () => {
  const rs = [1, 2, 3, 4].map((s) => runExpedition(s, { day: 6, fur: true, blizzard: true, site: 0 }));
  assert.ok(rs.filter((r) => r.home && !r.died).length >= 3);
  assert.ok(rs.every((r) => r.secs < 150), 'well inside the daylight');
});

test('competent bot: stone ring and spike ring exist before day 8, and it is alive then', () => {
  const r = runOne('competent', 2, { days: 8 });
  assert.ok(!r.died, `died ${r.cause}`);
  assert.ok(r.miles.built_stone_wall < 8 * 480 && r.miles.built_spike_barricade < 8 * 480, JSON.stringify([r.miles.built_stone_wall, r.miles.built_spike_barricade]));
});
