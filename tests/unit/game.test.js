import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { TILE, TIME, PLAYER } from '../../src/data/balance.js';
import { phaseAt, nightLength, ambientTemperature, clockString } from '../../src/logic/clock.js';
import { objectCandidates, pickTarget } from '../../src/logic/targeting.js';
import { createEvents } from '../../src/events.js';

test('events: on/once/off/emit, errors isolated', () => {
  const e = createEvents(); const got = [];
  const off = e.on('a', (p) => got.push(p)); e.once('a', (p) => got.push('once' + p));
  const origErr = console.error; console.error = () => {};
  e.on('a', () => { throw new Error('boom'); });
  e.emit('a', 1); e.emit('a', 2); off(); e.emit('a', 3);
  console.error = origErr;
  assert.deepEqual(got, [1, 'once1', 2]);
});

test('player moves with intent, is blocked by walls, sprints faster, slows in deep snow', () => {
  const g = createGame(); g.newGame(5);
  const p = g.state.player, it = g.input.intent;
  const t0 = g.world.worldToTile(p.x, p.y);
  for (let dx = -1; dx <= 14; dx++) for (let dy = -1; dy <= 3; dy++) { g.world.removeObject(t0.tx + dx, t0.ty + dy); g.world.setTerrain(t0.tx + dx, t0.ty + dy, 'snow'); }
  const x0 = p.x; it.moveX = 1;
  g.step(60);
  const walked = p.x - x0;
  assert.ok(Math.abs(walked - PLAYER.walk * TILE) < 6, `walked ${walked}`);
  assert.ok(p.moving); assert.equal(p.facing, 0);
  const x1 = p.x; it.sprint = true; g.step(60);
  assert.ok(p.x - x1 > walked * 1.4 && p.sprinting);
  it.sprint = false;
  // wall ahead
  const t = g.world.worldToTile(p.x, p.y);
  g.world.setObject(t.tx + 2, t.ty, { type: 'stone_wall' });
  g.step(120);
  assert.ok(p.x < (t.tx + 2) * TILE, 'stopped by wall');
  // deep snow
  const u = g.world.worldToTile(p.x, p.y);
  it.moveX = 0; it.moveY = 1;
  const y0 = p.y; g.world.setTerrain(u.tx, u.ty, 'deep_snow'); g.world.setTerrain(u.tx, u.ty + 1, 'deep_snow'); g.step(30);
  assert.ok(Math.abs((p.y - y0) - PLAYER.walk * TILE * 0.5 * 0.6) < 6, `deep snow ${p.y - y0}`);
  it.moveY = 0; g.step(5); assert.ok(!p.moving);
});

test('uiBlocked and diagonal normalisation', () => {
  const g = createGame(); g.newGame(5);
  const it = g.input.intent, p = g.state.player; it.moveX = 1; it.moveY = 1;
  const x0 = p.x, y0 = p.y; g.step(30);
  assert.ok(Math.abs(Math.hypot(p.x - x0, p.y - y0) - PLAYER.walk * TILE * 0.5) < 3);
});

test('time: phases, day rollover, night grows, temperature falls', () => {
  assert.equal(nightLength(1), 180); assert.equal(nightLength(2), 186); assert.equal(nightLength(100), 300);
  assert.equal(phaseAt(1, 5).phase, 'dawn'); assert.equal(phaseAt(1, 100).phase, 'day');
  assert.equal(phaseAt(1, 290).phase, 'dusk'); assert.equal(phaseAt(1, 400).phase, 'night');
  assert.ok(phaseAt(1, 100).light === 1 && phaseAt(1, 400).light < 0.1);
  assert.ok(ambientTemperature(5, 1) < ambientTemperature(1, 1)); assert.ok(ambientTemperature(1, 0.06) < ambientTemperature(1, 1));
  assert.equal(ambientTemperature(1, 1), 4); assert.equal(ambientTemperature(100, 1), -40);
  assert.equal(clockString(0), '06:00'); assert.equal(clockString(240), '18:00');
  const g = createGame(); g.newGame(1);
  const seen = []; g.events.on('time:phase', (e) => seen.push(e.phase)); const days = []; g.events.on('time:newDay', (e) => days.push(e.day));
  g.state.time.t = TIME.dayLength - 1; g.step(120);
  assert.equal(g.state.time.day, 2); assert.deepEqual(days, [2]); assert.ok(seen.includes('dawn'));
  g.state.time.speed = 12; const t0 = g.state.time.t; g.step(60); assert.ok(g.state.time.t - t0 > 11 * 1);
});

test('targeting picks nearest interactable in the facing cone', () => {
  const g = createGame(); g.newGame(9);
  const w = g.world, p = g.state.player, t = w.worldToTile(p.x, p.y);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) w.removeObject(t.tx + dx, t.ty + dy);
  w.setObject(t.tx + 1, t.ty, { type: 'loose_stone' }); w.setObject(t.tx - 1, t.ty, { type: 'loose_stick' }); w.setObject(t.tx, t.ty + 3, { type: 'loose_stone' });
  p.facing = 0; g.step(1);
  assert.equal(g.target.obj.type, 'loose_stone'); assert.equal(g.target.tx, t.tx + 1);
  p.facing = Math.PI; g.step(1); assert.equal(g.target.obj.type, 'loose_stick');
  p.facing = Math.PI / 2; g.step(1); assert.ok(!g.target || g.target.ty !== t.ty + 3, 'too far');
  const c = objectCandidates(w, p.x, p.y, 2); assert.ok(c.length >= 2);
  assert.equal(pickTarget([], 0, 0, 0), null);
  // external provider
  g.targetProviders.push(() => [{ kind: 'creature', x: p.x + 20, y: p.y + 20, name: 'Rabbit', verb: 'Hit', ref: 1 }]);
  p.facing = Math.PI / 4; g.step(1); assert.equal(g.target.kind, 'creature');
});

test('game.end clears save and flips mode; world change events fire', () => {
  const g = createGame(); g.newGame(2);
  let ev = null; g.events.on('world:objectChanged', (e) => { ev = e; });
  g.world.setObject(70, 70, { type: 'wood_wall' }); assert.equal(ev.obj.type, 'wood_wall');
  let over = null; g.events.on('game:over', (e) => { over = e; });
  g.end('death', { cause: 'cold' }); assert.equal(g.mode, 'over'); assert.equal(over.cause, 'cold');
});
