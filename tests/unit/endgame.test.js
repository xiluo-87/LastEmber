import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { ENDGAME, TIME } from '../../src/data/balance.js';
import { daylightLength, nightLength } from '../../src/logic/clock.js';
import { add } from '../../src/logic/inventory.js';
import * as saves from '../../src/save.js';
import {
  defaultEndgame, isPowered, tickSignal, nightCounts, finishNight, resetSignal, signalProgress, waveSizes, nextWaveDue,
  updateSeen, visibleWrecks, edgeMarker, wreckKey,
} from '../../src/logic/endgame.js';
import { OBJECTIVES, currentIndex, applyEvent, applySnapshot, defaultTutorial } from '../../src/logic/tutorial.js';
import { defaultRunStats, addDistance, applyStatEvent, statRows, fmtDistance } from '../../src/logic/stats.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ---------------------------------------------------------------- power rule
test('power: lit campfire/furnace within 4 tiles powers the tower; torch posts, far fires and no fires do not', () => {
  const tw = { tx: 10, ty: 10 };
  assert.equal(isPowered(tw, [{ type: 'campfire', tx: 13, ty: 10 }]), true);
  assert.equal(isPowered(tw, [{ type: 'furnace', tx: 10, ty: 14 }]), true);          // exactly 4
  assert.equal(isPowered(tw, [{ type: 'campfire', tx: 13, ty: 13 }]), false);        // 4.24 away
  assert.equal(isPowered(tw, [{ type: 'torch_post', tx: 10, ty: 11 }]), false);
  assert.equal(isPowered(tw, []), false);
  assert.equal(isPowered(null, [{ type: 'campfire', tx: 1, ty: 1 }]), false);
});

// ---------------------------------------------------------------- night counting
test('signal night counts at >= 80% powered; unpowered time pauses progress', () => {
  const day = 2, nl = nightLength(day), eg = defaultEndgame();
  eg.transmitting = true;
  // 79% powered -> not counted
  for (let s = 0; s < nl; s++) tickSignal(eg, { phase: 'night', day, dt: 1, powered: s < nl * 0.79 });
  assert.equal(nightCounts(eg.poweredSecs, nl), false);
  let r = finishNight(eg, nl, day + 1);
  assert.deepEqual([r.counted, r.nights, r.done], [false, 0, false]);
  assert.equal(eg.poweredSecs, 0);
  // 81% powered (with an outage in the middle) -> counted
  for (let s = 0; s < nl; s++) tickSignal(eg, { phase: 'night', day: 3, dt: 1, powered: !(s > nl * 0.3 && s < nl * 0.49) });
  assert.ok(eg.poweredSecs / nl > 0.8);
  r = finishNight(eg, nl, 4);
  assert.deepEqual([r.counted, r.nights], [true, 1]);
  // daytime and not-transmitting never accumulate
  eg.transmitting = true; tickSignal(eg, { phase: 'day', day: 4, dt: 100, powered: true }); assert.equal(eg.poweredSecs, 0);
  eg.transmitting = false; tickSignal(eg, { phase: 'night', day: 4, dt: 100, powered: true }); assert.equal(eg.poweredSecs, 0);
});

test('three counted nights finish the signal (rescuePending); progress and reset on tower loss', () => {
  const eg = defaultEndgame(); eg.transmitting = true;
  const nl = nightLength(1);
  for (let n = 1; n <= 3; n++) {
    tickSignal(eg, { phase: 'night', day: n, dt: nl, powered: true });
    const mid = signalProgress(eg, nl);
    const r = finishNight(eg, nl, n + 1);
    assert.equal(r.counted, true);
    assert.equal(r.done, n === 3);
    assert.ok(Math.abs(signalProgress(eg, nl) - n / 3) < 1e-9, `progress ${mid}`);
  }
  assert.equal(eg.rescuePending, true);
  // reset on destruction
  const eg2 = defaultEndgame(); eg2.transmitting = true; eg2.nights = 2; eg2.poweredSecs = 50; eg2.tower = { tx: 1, ty: 1 };
  resetSignal(eg2);
  assert.deepEqual([eg2.transmitting, eg2.nights, eg2.poweredSecs, eg2.tower], [false, 0, 0, null]);
});

test('wave plan: normal pack size + 2 split over two waves, due at the configured night fractions', () => {
  const sizes = waveSizes(6);
  assert.equal(sizes.length, 2);
  assert.equal(sizes[0] + sizes[1], 4 + ENDGAME.enragedPackBonus);   // WOLF.packSize(6) = 4
  assert.ok(sizes[0] >= sizes[1]);
  assert.equal(nextWaveDue(0.02, 0), -1);
  assert.equal(nextWaveDue(ENDGAME.waveAt[0], 0), 0);
  assert.equal(nextWaveDue(0.3, 1), -1);
  assert.equal(nextWaveDue(ENDGAME.waveAt[1] + 0.01, 1), 1);
  assert.equal(nextWaveDue(0.9, 2), -1);
});

// ---------------------------------------------------------------- marker visibility
test('markers: without the flight map a wreck shows only after the player was within 20 tiles; looted sites never; map shows all', () => {
  const wrecks = [{ tx: 50, ty: 50, looted: false }, { tx: 90, ty: 20, looted: false }, { tx: 20, ty: 90, looted: true }];
  const seen = {};
  assert.equal(visibleWrecks(wrecks, seen, false).length, 0);
  updateSeen(seen, wrecks, 40, 50, ENDGAME.partsRevealRadius);            // 10 tiles from the first
  assert.deepEqual(visibleWrecks(wrecks, seen, false).map(wreckKey), ['50,50']);
  updateSeen(seen, wrecks, 20, 71, 20);                                   // within 20 of the looted one: not marked
  assert.equal(seen['20,90'], undefined);
  assert.equal(visibleWrecks(wrecks, seen, true).length, 2);              // map: both un-looted, looted one hidden
  wrecks[0].looted = true;
  assert.deepEqual(visibleWrecks(wrecks, seen, false), []);               // looted again -> gone
  assert.equal(updateSeen({}, wrecks, 49, 50, 20)['50,50'], undefined);
});

test('edge marker: null on screen, clamped to the screen edge pointing at the target when off screen', () => {
  assert.equal(edgeMarker(200, 400, 390, 844, 30), null);
  const m = edgeMarker(1000, 422, 390, 844, 30);             // far east, vertically centred
  assert.ok(Math.abs(m.x - 360) < 1e-6 && Math.abs(m.y - 422) < 1e-6 && Math.abs(m.angle) < 1e-6);
  const n = edgeMarker(195, -500, 390, 844, 30, { top: 56 });  // far north, respects the top inset
  assert.ok(Math.abs(n.y - 86) < 1e-6);
  assert.ok(n.angle < -1.5 && n.angle > -1.7);
  const d = edgeMarker(-400, 1500, 390, 844, 30);            // south-west corner region
  assert.ok(d.x >= 30 - 1e-6 && d.y <= 814 + 1e-6);
});

// ---------------------------------------------------------------- tutorial (pure + system)
test('tutorial: pure facts advance the current objective in order; out-of-order facts are skipped later', () => {
  const f = defaultTutorial().facts;
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'gather');
  assert.ok(applySnapshot(f, (id) => ({ stick: 3, stone: 3 }[id] || 0)));
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'crate');
  assert.ok(!applyEvent(f, 'loot:opened', { obj: { type: 'wreckage' } }));
  assert.ok(applyEvent(f, 'structure:placed', { type: 'campfire' }));            // out of order: campfire before crate
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'crate');
  assert.ok(applyEvent(f, 'loot:opened', { obj: { type: 'crash_site' } }));
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'light');                         // campfire already done -> skipped
  applyEvent(f, 'fire:lit', { type: 'campfire' }); applyEvent(f, 'craft:done', { recipe: { id: 'stone_axe' } });
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'chop');
  applyEvent(f, 'gather:harvest', { obj: { type: 'tree' }, drops: [{ item: 'wood', n: 3 }] });
  applyEvent(f, 'room:formed', { size: 4 });
  applyEvent(f, 'craft:done', { recipe: { id: 'clean_water' } });
  applyEvent(f, 'craft:done', { recipe: { id: 'spear' } });
  applyEvent(f, 'sleep:start', {});
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'wreck');
  for (let i = 0; i < 3; i++) applyEvent(f, 'radio:partFound', { part: 'x' });
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'smelt');
  applyEvent(f, 'craft:done', { recipe: { id: 'iron_ingot' } }); applyEvent(f, 'structure:placed', { type: 'radio_tower' });
  assert.equal(OBJECTIVES[currentIndex(f)].id, 'signal');
  f.nights = 3;
  assert.equal(currentIndex(f), OBJECTIVES.length);
});

test('tutorial system: synthetic events drive the tracker, tips fire once, state survives JSON', () => {
  const g = createGame({ storage: memStorage() }); g.newGame(11);
  const steps = [], done = [], toasts = [];
  g.events.on('tutorial:step', (e) => steps.push(e.id)); g.events.on('tutorial:complete', (e) => done.push(e.id));
  g.ui.toast = (m) => toasts.push(m);
  assert.equal(g.tutorial.current().id, 'gather');
  add(g.state.inventory, 'stick', 3); add(g.state.inventory, 'stone', 3);
  g.step(40);                                                    // snapshot check runs every 0.5 s
  assert.equal(g.tutorial.current().id, 'crate');
  assert.deepEqual(done, ['gather']);
  g.events.emit('loot:opened', { obj: { type: 'crash_site' }, items: [] });
  g.events.emit('structure:placed', { type: 'campfire', tx: 1, ty: 1 });
  assert.equal(g.tutorial.current().id, 'light');
  assert.ok(g.tutorial.current().hint.length > 10);
  g.events.emit('fire:lit', { type: 'campfire', tx: 1, ty: 1 });
  assert.equal(g.tutorial.current().id, 'axe');
  // tips: once each
  g.events.emit('time:dusk', { day: 1 }); g.events.emit('time:dusk', { day: 2 });
  g.events.emit('weather:warning', { in: 30 }); g.events.emit('creature:howl', { day: 1 });
  g.events.emit('effect:applied', { id: 'bleeding' }); g.events.emit('effect:applied', { id: 'bleeding' });
  assert.equal(toasts.filter((t) => /Night is coming/.test(t)).length, 1);
  assert.equal(toasts.filter((t) => /blizzard/i.test(t)).length, 1);
  assert.equal(toasts.filter((t) => /Wolves are howling/.test(t)).length, 1);
  assert.equal(toasts.filter((t) => /bleeding/i.test(t)).length, 1);
  g.state.player.warmth = 30; g.step(40); g.step(40);
  assert.equal(toasts.filter((t) => /cold/i.test(t)).length, 1);
  const wood = add(g.state.inventory, 'stone_axe', 1); assert.equal(wood, 0);
  const axe = [...g.state.inventory.hotbar, ...g.state.inventory.bag].find((s) => s?.id === 'stone_axe'); axe.dur = 2;
  g.step(40);
  assert.equal(toasts.filter((t) => /worn out/i.test(t)).length, 1);
  // dismiss + save round trip of all tutorial state
  g.tutorial.dismiss();
  const copy = JSON.parse(JSON.stringify(g.state.tutorial));
  assert.equal(copy.dismissed, true); assert.ok(copy.tips.dusk && copy.facts.crate);
  assert.deepEqual(steps.slice(0, 3), ['crate', 'campfire', 'light']);
});

// ---------------------------------------------------------------- stats
test('stats tracker: counters from events, distance ignores teleports, rows for the end screens', () => {
  const rs = defaultRunStats(), last = { x: null, y: null };
  applyStatEvent(rs, 'creature:killed', { c: { type: 'rabbit' }, by: 'player' });
  applyStatEvent(rs, 'creature:killed', { c: { type: 'wolf' } });
  applyStatEvent(rs, 'structure:placed', { type: 'campfire' });
  applyStatEvent(rs, 'craft:done', {});
  assert.deepEqual([rs.animalsHunted, rs.wolvesKilled, rs.structuresBuilt, rs.itemsCrafted], [2, 1, 1, 1]);
  addDistance(rs, last, 0, 0); addDistance(rs, last, 64, 0); addDistance(rs, last, 64, 32 * 40);   // 2 tiles, then a 40-tile jump (ignored)
  assert.ok(Math.abs(rs.distanceTiles - 2) < 1e-9);
  assert.equal(fmtDistance(1500), '1.5 km'); assert.equal(fmtDistance(820), '820 m');
  const rows = statRows({ time: { day: 5 }, runstats: rs, stats: { playSeconds: 125 }, survival: { stats: { minFelt: -21.4, hits: 3 } } });
  const m = Object.fromEntries(rows);
  assert.equal(m['Days survived'], 5); assert.equal(m['Time alive'], '2m 05s'); assert.equal(m['Animals hunted'], 2);
  assert.equal(m['Structures built'], 1); assert.equal(m['Coldest night'], '-21°C'); assert.equal(m['Hits taken'], 3);
  assert.ok(statRows({ time: { day: 1 } }).length >= 4);        // old saves without slices
});

test('stats system: events on a live game and walking accumulate', () => {
  const g = createGame({ storage: memStorage() }); g.newGame(3);
  g.events.emit('structure:placed', { type: 'wood_wall', tx: 1, ty: 1 });
  g.events.emit('creature:killed', { c: { type: 'deer' }, by: 'player' });
  g.input.intent.moveX = 1; g.step(60); g.input.intent.moveX = 0;
  const rs = g.state.runstats;
  assert.equal(rs.structuresBuilt, 1); assert.equal(rs.animalsHunted, 1);
  assert.ok(rs.distanceTiles > 1, `walked ${rs.distanceTiles}`);
  assert.ok(g.stats.rows().length >= 5);
});

// ---------------------------------------------------------------- save round trip of all endgame/tutorial/stats state
test('save round-trip keeps endgame, tutorial and run stats slices', () => {
  const st = memStorage(), g = createGame({ storage: st }); g.newGame(21);
  const eg = g.state.endgame;
  Object.assign(eg, { transmitting: true, nights: 2, nightKey: 3, poweredSecs: 77.5, waves: 1, home: { tx: 5, ty: 6 }, seen: { '50,50': true } });
  Object.assign(g.state.tutorial, { dismissed: true, tips: { dusk: true }, facts: { crate: true, parts: 2 } });
  Object.assign(g.state.runstats, { animalsHunted: 4, structuresBuilt: 9, distanceTiles: 321.5 });
  const before = JSON.parse(JSON.stringify(g.state));
  g.save();
  const g2 = createGame({ storage: st });
  assert.ok(g2.loadGame());
  for (const k of ['endgame', 'tutorial', 'runstats']) assert.deepEqual(JSON.parse(JSON.stringify(g2.state[k])), before[k], k);
  assert.equal(g2.tutorial.dismissed(), true);
});

// ---------------------------------------------------------------- full headless endgame sim
function stage(seed = 9) {
  const g = createGame({ storage: memStorage() }); g.newGame(seed);
  const sp = g.state.world.spawn, cx = sp.tx, cy = sp.ty;
  for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 12; x <= cx + 12; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
  const c = g.world.tileCenter(cx, cy); Object.assign(g.state.player, { x: c.x, y: c.y });
  g.world.setObject(cx + 3, cy, { type: 'radio_tower', hp: 300 });
  g.world.setObject(cx + 1, cy + 2, { type: 'campfire', fuel: 600, lit: true, everLit: true, hp: 40 });
  return { g, cx, cy };
}
const keepAlive = (g, tw, fire) => {
  const p = g.state.player; Object.assign(p, { health: 100, hunger: 100, thirst: 100, warmth: 100, stamina: 100 }); p.invuln = 5;
  if (tw) tw.hp = 300; if (fire) { fire.fuel = 600; fire.lit = true; }
};

test('power: unpowered tower pauses the signal; powering it resumes', () => {
  const { g, cx, cy } = stage(); const tw = g.world.objectAt(cx + 3, cy), fire = g.world.objectAt(cx + 1, cy + 2);
  g.state.time.t = daylightLength(1) + 5; g.state.time.speed = 1;
  assert.equal(g.endgame.setTransmitting(true), true);
  g.step(60 * 4); keepAlive(g, tw, fire);
  assert.equal(g.endgame.powered(), true);
  const a = g.state.endgame.poweredSecs; assert.ok(a > 3);
  fire.lit = false; g.step(60 * 3);
  assert.equal(g.endgame.powered(), false);
  const b = g.state.endgame.poweredSecs; assert.ok(b - a < 1.1, `paused (${a} -> ${b})`);
  fire.lit = true; g.step(60 * 3);
  assert.ok(g.state.endgame.poweredSecs > b + 1.5);
});

test('tower destroyed: three radio parts drop as pickups, progress resets', () => {
  const { g, cx, cy } = stage();
  Object.assign(g.state.endgame, { transmitting: true, nights: 2, poweredSecs: 40 });
  g.step(30);
  const lost = []; g.events.on('tower:destroyed', (e) => lost.push(e));
  assert.ok(g.building.damageStructure(g, cx + 3, cy, 9999, 'wolf').destroyed);
  assert.equal(lost.length, 1);
  assert.deepEqual([g.state.endgame.transmitting, g.state.endgame.nights, g.state.endgame.poweredSecs], [false, 0, 0]);
  const ids = []; g.world.objectList().forEach((o) => { if (o.type === 'dropped_item' && o.stack.id.startsWith('radio_')) ids.push(o.stack.id); });
  assert.deepEqual(ids.sort(), ['radio_antenna', 'radio_battery', 'radio_circuit']);
  assert.equal(g.endgame.setTransmitting(true), false);       // nothing to transmit with
});

test('SIM: tower + fire, transmit, three nights, rescue -> victory event; save cleared; waves spawned', () => {
  const { g, cx, cy } = stage();
  const tw = g.world.objectAt(cx + 3, cy), fire = g.world.objectAt(cx + 1, cy + 2);
  const events = [];
  for (const e of ['signal:wave', 'signal:night', 'rescue:arriving', 'rescue:flyover', 'rescue:done']) g.events.on(e, (p) => events.push([e, p]));
  let over = null; g.events.on('game:over', (i) => { over = i; });
  g.state.time.t = daylightLength(1) - TIME.duskLength + 5;      // dusk of day 1
  g.weather.force('clear', 1e6);
  assert.ok(g.endgame.setTransmitting(true));
  g.save(); assert.ok(g.hasSave());
  g.state.time.speed = 12;                                        // cheat: fast-forward (sleep speed)
  let guard = 0;
  while (!over && guard++ < 1200) {
    g.step(30); keepAlive(g, tw, fire);
    if (g.state.time.speed !== 12 && !g.endgame.rescue) g.state.time.speed = 12;
    if (g.endgame.rescue) g.state.time.speed = 1;
  }
  assert.ok(over, `victory must fire (day ${g.state.time.day}, nights ${g.state.endgame.nights})`);
  assert.equal(over.kind, 'victory');
  assert.ok(over.day >= 4);
  assert.equal(g.hasSave(), false, 'victory clears the save');
  const names = events.map((e) => e[0]);
  assert.equal(names.filter((n) => n === 'signal:night').length, 3);
  assert.ok(events.filter((e) => e[0] === 'signal:night').every((e) => e[1].counted));
  assert.ok(names.indexOf('rescue:arriving') < names.indexOf('rescue:flyover') && names.indexOf('rescue:flyover') < names.indexOf('rescue:done'));
  assert.ok(events.filter((e) => e[0] === 'signal:wave').length >= 4, 'two waves per signal night (at least on the first two nights)');
  assert.ok(g.stats.rows().length >= 5);
});

test('rescuePending in a save restarts the rescue on load', () => {
  const st = memStorage(), g = createGame({ storage: st }); g.newGame(5);
  g.state.endgame.rescuePending = true; g.state.endgame.nights = 3; g.save();
  const g2 = createGame({ storage: st }); const seen = []; g2.events.on('rescue:arriving', () => seen.push(1));
  g2.loadGame();
  assert.equal(seen.length, 1);
  assert.ok(g2.endgame.rescue);
  g2.step(60 * 15);
  assert.equal(g2.mode, 'over');
});

test('saves module still clears on end', () => { const st = memStorage(); saves.save({ x: 1 }, st); saves.clear(st); assert.equal(saves.hasSave(st), false); });
