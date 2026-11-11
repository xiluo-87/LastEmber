// Persistence: build a base (lit fire, chest contents, shelter), creature nearby, tutorial progress, hotbar selection, mid-blizzard ->
// save -> reload -> tap Continue -> everything restored. Death deletes the save. Blocked localStorage: game runs, one-time toast.
// Usage: node tests/e2e/persistence.mjs
import { harness, open, sleep, noErrors } from './lib.mjs';
const { check, base, browser, finish } = await harness('persistence');

console.log('Save, reload, Continue');
{
  const P = await open(browser, 'portrait', base + 'index.html?seed=7&touch=1');
  const before = await P.state(() => {
    const g = __game, sp = g.state.world.spawn, cx = sp.tx, cy = sp.ty;
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
    for (const [id, n] of [['wood', 60], ['stone', 30], ['stick', 20], ['rope', 6], ['flint', 1], ['fiber', 6], ['hide', 4], ['raw_meat', 2], ['stone_axe', 1], ['tin_pot', 1]]) g.debug.give(id, n);
    const B = g.building, P0 = g.state.player;
    const put = (type, x, y) => { const c = g.world.tileCenter(x, y); Object.assign(P0, { x: c.x, y: c.y + 70 }); B.select(type); if (!B.place(x, y)) console.error('fail', type, x, y, B.ghost.reason); };
    put('campfire', cx, cy);
    for (let x = cx - 1; x <= cx + 2; x++) for (let y = cy - 1; y <= cy + 1; y++) { if (y === cy && (x === cx || x === cx + 1)) continue; if (x === cx + 1 && y === cy + 1) continue; put('wood_wall', x, y); }
    put('door', cx + 1, cy + 1); B.cancel();
    put('chest', cx - 4, cy); B.cancel();
    const chest = g.world.objectAt(cx - 4, cy); chest.inv.bag[0] = { id: 'raw_meat', n: 2 }; chest.inv.bag[3] = { id: 'wood', n: 7 };
    const fire = g.world.objectAt(cx, cy); g.structures.addFuel(fire, 'wood'); g.structures.addFuel(fire, 'wood'); g.structures.light(fire);
    const c = g.world.tileCenter(cx + 1, cy); Object.assign(P0, { x: c.x, y: c.y, facing: 1.2 });
    g.state.inventory.selected = 3; g.events.emit('hotbar:changed', { index: 3 });
    g.state.time.day = 2; g.state.time.t = 300; g.weather.force('blizzard', 900);
    g.creatures.spawnCreature(g, 'rabbit', c.x + 3 * 32, c.y + 40);
    g.step(120);
    g.save();
    const cr = g.state.creatures?.list?.[0] || g.state.creatures?.[0];
    return {
      cx, cy, p: { x: P0.x, y: P0.y }, fuel: fire.fuel, lit: fire.lit, inv: JSON.stringify(g.state.inventory), sel: g.state.inventory.selected,
      day: g.state.time.day, t: g.state.time.t, wx: g.state.weather.type, facts: JSON.stringify(g.state.tutorial.facts), chest: JSON.stringify(chest.inv.bag.slice(0, 4)),
      shelter: !!g.shelterQuery(cx + 1, cy), ncreat: JSON.stringify(g.state).includes('rabbit'), obj: __game.tutorial.current()?.text, shown: document.querySelector('.objective')?.textContent.split('×')[0].trim(),
      walls: g.world.objectList().filter((o) => o.type === 'wood_wall').length,
    };
  });
  check(before.lit && before.shelter, `base staged: fire lit, sheltered (fuel ${Math.round(before.fuel)})`);
  check(await P.state(() => localStorage.getItem('last-ember-save-v1') !== null), 'save written to localStorage');
  await P.page.reload();
  await P.page.waitForFunction(() => window.__game && __game.state);
  await sleep(500);
  check(await P.state(() => !document.querySelector('#btn-continue').hidden), 'Continue is offered after reload');
  await P.shot('persist-title.png');
  check(/Day 2/.test(await P.state(() => document.querySelector('#btn-continue').textContent)), 'Continue shows the day');
  await P.tap('#btn-continue');
  await P.page.waitForFunction(() => __game.mode === 'playing');
  await sleep(500);
  const after = await P.state(([cx, cy]) => {
    const g = __game, p = g.state.player, fire = g.world.objectAt(cx, cy), chest = g.world.objectAt(cx - 4, cy);
    return {
      p: { x: p.x, y: p.y }, fuel: fire?.fuel, lit: fire?.lit, inv: JSON.stringify(g.state.inventory), sel: g.state.inventory.selected, day: g.state.time.day, t: g.state.time.t,
      wx: g.state.weather.type, facts: JSON.stringify(g.state.tutorial.facts), chest: JSON.stringify(chest?.inv.bag.slice(0, 4)), shelter: !!g.shelterQuery(cx + 1, cy),
      ncreat: JSON.stringify(g.state).includes('rabbit'), obj: __game.tutorial.current()?.text, shown: document.querySelector('.objective')?.textContent.split('×')[0].trim(),
      walls: g.world.objectList().filter((o) => o.type === 'wood_wall').length, hotbarSel: document.querySelector('.hotbar .slot.sel')?.dataset.i, paused: g.paused,
    };
  }, [before.cx, before.cy]);
  check(Math.hypot(after.p.x - before.p.x, after.p.y - before.p.y) < 40, `position restored (${Math.round(after.p.x)},${Math.round(after.p.y)})`);
  check(after.lit && Math.abs(after.fuel - before.fuel) < 30, `fire still lit with fuel (${Math.round(after.fuel)} vs ${Math.round(before.fuel)})`);
  check(after.shelter, 'room / shelter restored');
  check(after.walls === before.walls, `walls restored (${after.walls})`);
  check(after.inv === before.inv, 'inventory identical');
  check(after.chest === before.chest, 'chest contents identical');
  check(after.sel === 3 && after.hotbarSel === '3', `hotbar selection restored (${after.sel}, UI ${after.hotbarSel})`);
  check(after.day === 2 && Math.abs(after.t - before.t) < 5, `time restored (day ${after.day}, t ${Math.round(after.t)})`);
  check(after.wx === 'blizzard', `weather restored (${after.wx})`);
  check(after.facts === before.facts, `tutorial facts restored ${after.facts}`);
  check(after.obj === before.obj && /crate/i.test(after.obj), `objective restored ("${after.obj}" vs "${before.obj}")`);
  check(/crate/i.test(after.shown), `objective tracker shows it ("${after.shown}")`);
  check(after.ncreat, 'creature present in the loaded state');
  check(!after.paused, 'game running after Continue');
  await sleep(1200);
  await P.shot('persist-restored.png');
  // death deletes the save
  await P.state(() => __game.end('death', { cause: 'test' }));
  await sleep(300);
  check(await P.state(() => localStorage.getItem('last-ember-save-v1') === null), 'death deletes the save');
  await P.page.reload();
  await P.page.waitForFunction(() => window.__game && __game.state);
  await sleep(400);
  check(await P.state(() => document.querySelector('#btn-continue').hidden), 'no Continue after death + reload');
  // a corrupt save must not break the title
  await P.state(() => localStorage.setItem('last-ember-save-v1', '{"v":1,"state":{"oops":'));
  await P.page.reload();
  await P.page.waitForFunction(() => window.__game && __game.state);
  await sleep(400);
  await P.page.click('#btn-new').catch(() => {});
  await sleep(300);
  check(await P.state(() => __game.mode === 'playing' || !!document.querySelector('#btn-new-yes')), 'corrupt save: title still works');
  noErrors(check, P, 'persistence: no console errors');
  await P.ctx.close();
}

console.log('localStorage throwing');
{
  const init = () => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
  };
  const P = await open(browser, 'portrait', base + 'index.html?seed=7&touch=1', { init });
  const ok = await P.state(() => { __game.save(); __game.save(); return __game.mode; });
  await sleep(500);
  const toasts = await P.state(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
  check(ok === 'playing', 'game runs with localStorage throwing');
  check(toasts.filter((t) => /Saving isn't available/.test(t)).length === 1, `one-time toast shown once (${JSON.stringify(toasts)})`);
  await P.state(() => { __game.audio.toggleMuted(); __game.step(60); });
  noErrors(check, P, 'blocked storage: no console errors');
  await P.ctx.close();
}
await finish();
