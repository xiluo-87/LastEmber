import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { TEMPERATURE as T, SURVIVAL as S, WEATHER, TILE, TIME } from '../../src/data/balance.js';
import { feltBreakdown, feltTemperature, warmthRate, heatAt } from '../../src/logic/temperature.js';
import { planDay, weatherAt, blizzardChance } from '../../src/logic/weather.js';
import { damagePlayer, applyEffect, clearEffect, hasEffect, restoreStat, deathMessage } from '../../src/systems/survival.js';

const approx = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const fresh = (seed = 3) => { const g = createGame(); g.newGame(seed); return g; };
const strip = (g) => { g.state.inventory.clothing.fill(null); };

test('temperature: heat falloff, shelter, clothing, torch', () => {
  const src = { x: 0, y: 0, heat: 30, radius: 5 };
  approx(heatAt(src, 0, 0), 30); approx(heatAt(src, 2.5 * TILE, 0), 15); assert.equal(heatAt(src, 5 * TILE, 0), 0); assert.equal(heatAt(src, 9 * TILE, 0), 0);
  const base = { ambient: -4, weatherOffset: -12, sources: [], px: 0, py: 0 };
  approx(feltTemperature(base), -16);
  approx(feltTemperature({ ...base, sheltered: true }), -4 + 8);                    // weather removed, +8 shelter
  approx(feltTemperature({ ...base, insulation: 13, torch: 4 }), -16 + 13 + 4);
  approx(feltTemperature({ ...base, sources: [src] }), -16 + 30);
  const inRoom = feltBreakdown({ ...base, sheltered: true, sources: [src], shelteredAt: () => true });
  approx(inRoom.heat, 45);                                                           // fire in an enclosed room x1.5
  const outside = feltBreakdown({ ...base, sheltered: true, sources: [src], shelteredAt: () => false });
  approx(outside.heat, 30);
});

test('warmth rate formula (DESIGN §5)', () => {
  approx(warmthRate(-4), -0.84); approx(warmthRate(10), 0); approx(warmthRate(-100), -2.5); approx(warmthRate(100), 3); approx(warmthRate(20), 0.6);
});

test('naked idle player at day-1 noon loses warmth at the designed rate', () => {
  const g = fresh(); strip(g);
  g.state.time.t = 150; g.state.weather.planDay = 1; g.state.weather.plan = [];
  g.step(1);
  const w0 = g.state.player.warmth; g.step(600);
  approx((w0 - g.state.player.warmth) / 10, 0.84, 0.02);
  approx(g.state.survival.felt, -4, 1e-6);
});

test('heat provider and shelter seam raise felt temperature and warmth', () => {
  const g = fresh(); strip(g); g.state.time.t = 150; g.state.weather.plan = [];
  const p = g.state.player;
  g.heatProviders.push((game, push) => push({ x: p.x + TILE, y: p.y, heat: T.campfire.peak, radius: T.campfire.radius }));
  g.step(1);
  approx(g.state.survival.felt, -4 + 30 * (1 - 1 / 5), 1e-6);
  g.shelterQuery = () => true; g.step(1);
  approx(g.state.survival.felt, -4 + 8 + 24 * 1.5, 1e-6);
  p.warmth = 50; g.step(60); assert.ok(p.warmth > 50);
});

test('hunger/thirst drain and multipliers', () => {
  const g = fresh(); const p = g.state.player; g.state.time.t = 150; g.state.weather.plan = [];
  g.heatProviders.push((game, push) => push({ x: p.x, y: p.y, heat: 40, radius: 5 }));       // stay comfortable
  g.step(600);
  approx(100 - p.hunger, (100 / 14 / 60) * 10, 0.02); approx(100 - p.thirst, (100 / 9 / 60) * 10, 0.02);
  const h = p.hunger; applyEffect(g, 'poison'); g.step(600); approx(h - p.hunger, (100 / 14 / 60) * 10 * 2, 0.05);
});

test('zero stats damage health at the designed rates; regen rule', () => {
  const g = fresh(); const p = g.state.player; g.state.time.t = 150; g.state.weather.plan = [];
  g.heatProviders.push((game, push) => push({ x: p.x, y: p.y, heat: 40, radius: 5 }));
  p.hunger = 0; p.health = 100; g.step(600); approx(100 - p.health, 5, 0.1);
  p.hunger = 0; p.thirst = 0; p.health = 100; g.step(600); approx(100 - p.health, 13, 0.2);
  p.hunger = 80; p.thirst = 80; p.warmth = 80; p.health = 50; g.step(600); approx(p.health - 50, 2.5, 0.1);
  p.hunger = 40; p.health = 50; g.step(300); assert.ok(p.health <= 50, 'no regen with hunger <= 50');
});

test('stamina: sprint drains, gates sprint, regen halves when hungry', () => {
  const g = fresh(); const p = g.state.player; g.state.time.t = 150; g.state.weather.plan = [];
  g.heatProviders.push((game, push) => push({ x: p.x, y: p.y, heat: 40, radius: 5 }));
  const it = g.input.intent; it.moveX = 1; it.sprint = true;
  g.step(60); assert.ok(p.stamina < 100 && p.stamina > 70 && p.sprinting);
  g.step(300); assert.equal(p.stamina, 0); assert.equal(p.sprinting, false);
  g.step(60); assert.equal(p.stamina, 0, 'no regen while sprint input still held at zero');
  it.sprint = false; it.moveX = 0; p.stamina = 0; g.step(60); approx(p.stamina, 14, 0.4);
  p.stamina = 0; p.hunger = 10; g.step(60); approx(p.stamina, 7, 0.4);
});

test('low warmth slows movement to 85%', () => {
  const g = fresh(); const p = g.state.player;
  const f = g.speedModifiers.map((fn) => fn(g)).reduce((a, b) => a * b, 1);
  p.warmth = 10; const f2 = g.speedModifiers.map((fn) => fn(g)).reduce((a, b) => a * b, 1);
  approx(f2 / f, S.coldSlowMult);
});

test('status effects: bleeding, poison timer, bandage clears; damage i-frames and cause', () => {
  const g = fresh(); const p = g.state.player; g.state.time.t = 150; g.state.weather.plan = [];
  g.heatProviders.push((game, push) => push({ x: p.x, y: p.y, heat: 40, radius: 5 }));
  assert.ok(applyEffect(g, 'bleeding')); assert.ok(!applyEffect(g, 'bleeding')); assert.ok(hasEffect(g, 'bleeding'));
  g.step(600); approx(100 - p.health, 6, 0.15);
  assert.ok(clearEffect(g, 'bleeding')); assert.ok(!hasEffect(g, 'bleeding'));
  applyEffect(g, 'food_poisoning'); g.step(59 * 60); assert.ok(hasEffect(g, 'food_poisoning')); g.step(2 * 60); assert.ok(!hasEffect(g, 'food_poisoning'));
  p.health = 100;
  assert.equal(damagePlayer(g, 9, 'wolf'), 9); assert.equal(damagePlayer(g, 9, 'wolf'), 0, 'i-frames'); approx(p.health, 91);
  assert.equal(g.state.survival.lastCause.id, 'wolf');
  g.step(40); assert.equal(damagePlayer(g, 9, 'wolf'), 9);
  assert.equal(damagePlayer(g, 1, 'cold', { iframes: false }), 1); assert.equal(damagePlayer(g, 1, 'cold', { iframes: false }), 1);
  assert.equal(restoreStat(g, 'health', 5), 5);
  p.hunger = 30; assert.equal(restoreStat(g, 'hunger', -500), -30); assert.equal(p.hunger, 0);
});

test('death: event, game over, save cleared, cause text', () => {
  const g = fresh(); const p = g.state.player; const ev = []; g.events.on('player:died', (e) => ev.push(e)); let over;
  g.events.on('game:over', (e) => { over = e; });
  p.health = 5; damagePlayer(g, 50, 'wolf', { iframes: false });
  g.step(1);
  assert.equal(g.mode, 'over'); assert.equal(ev[0].cause, 'wolf'); assert.equal(over.cause, deathMessage('wolf').text); assert.equal(over.kind, 'death');
  assert.ok(over.day >= 1);
});

test('an idle player with no fire dies on day 1 of exposure', () => {
  const g = fresh(11); let over = null; g.events.on('game:over', (e) => { over = e; });
  for (let i = 0; i < TIME.dayLength * 60 && g.mode === 'playing'; i++) g.step(1);
  assert.ok(over, 'died'); assert.equal(over.day, 1); assert.equal(over.causeId, 'hypothermia'); assert.match(over.cause, /froze/);
});

test('weather: deterministic, blizzard rules, state machine, offsets', () => {
  assert.equal(blizzardChance(1), 0); assert.ok(blizzardChance(8) > blizzardChance(2));
  assert.deepEqual(planDay(42, 5), planDay(42, 5));
  let bl = 0, d1 = 0;
  for (let seed = 1; seed < 60; seed++) {
    assert.ok(!planDay(seed, 1).some((e) => e.type === 'blizzard'), 'no blizzard on day 1');
    for (const e of planDay(seed, 1)) assert.ok(e.start >= WEATHER.day1ClearSeconds);
    for (let day = 2; day < 12; day++) for (const e of planDay(seed, day)) {
      if (e.type === 'blizzard') { bl++; const d = e.end - e.start; assert.ok(d >= 60 && d <= 150, `dur ${d}`); }
      assert.ok(e.end <= TIME.dayLength && e.start >= 0);
    }
  }
  assert.ok(bl > 100);
  const late = Array.from({ length: 40 }, (_, s) => planDay(s + 1, 12).filter((e) => e.type === 'blizzard').length).reduce((a, b) => a + b);
  const early = Array.from({ length: 40 }, (_, s) => planDay(s + 1, 2).filter((e) => e.type === 'blizzard').length).reduce((a, b) => a + b);
  assert.ok(late > early, 'chance grows with day');
  const plan = [{ type: 'blizzard', start: 100, end: 200 }];
  assert.equal(weatherAt(plan, 50).warnIn, 0); approx(weatherAt(plan, 80).warnIn, 20); assert.equal(weatherAt(plan, 150).type, 'blizzard'); assert.equal(weatherAt(plan, 250).type, 'clear');

  const g = fresh(5); const events = []; g.events.on('weather:changed', (e) => events.push(e.type)); const warns = []; g.events.on('weather:warning', (e) => warns.push(e));
  const banners = []; g.ui.setBanner = (t) => banners.push(t);
  g.state.time.day = 3; g.state.time.t = 60; g.state.weather.planDay = 3; g.state.weather.plan = [{ type: 'blizzard', start: 100, end: 160 }];
  const p = g.state.player; g.heatProviders.push((game, push) => push({ x: p.x, y: p.y, heat: 60, radius: 5 }));
  g.step(5 * 60); assert.equal(g.state.weather.type, 'clear'); assert.ok(!banners.length);
  g.step(15 * 60); assert.equal(warns.length, 1); assert.ok(banners.some((b) => /Storm coming/.test(b)));
  g.step(25 * 60); assert.equal(g.state.weather.type, 'blizzard'); assert.deepEqual(events, ['blizzard']); assert.equal(banners.at(-1), null);
  g.step(10 * 60);
  approx(g.state.weather.offset, T.blizzard, 1e-6); assert.ok(g.weather.isBlizzard()); approx(g.weather.fuelMult(false), 2); approx(g.weather.fuelMult(true), 1);
  const mult = g.speedModifiers.map((f) => f(g)).reduce((a, b) => a * b, 1); assert.ok(Math.abs(mult - 0.8) < 1e-6 || mult <= 0.8 + 1e-6, `${mult}`);
  g.step(60 * 60); assert.equal(g.state.weather.type, 'clear'); assert.deepEqual(events, ['blizzard', 'clear']);
  g.weather.force('snow', 10); g.step(1); assert.equal(g.weather.type(), 'snow');
  // JSON-safe
  JSON.parse(JSON.stringify(g.state));
});
