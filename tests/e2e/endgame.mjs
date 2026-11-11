// E2E: title, how to play, onboarding tracker, compass markers (flight map), radio tower panel, rescue + victory screen. Phone 390x844, zero console errors.
// Usage: node tests/e2e/endgame.mjs      Screenshots: tests/e2e/out/endgame-*.png
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'tests/e2e/out');
fs.mkdirSync(out, { recursive: true });
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error(`  FAIL: ${msg}`); } else console.log(`  ok: ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer(8093);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: path.join(out, `endgame-${n}.png`) });
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const center = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const tap = async (sel) => { const [x, y] = await center(sel); await touch('touchStart', [[x, y, 9]]); await sleep(60); await touch('touchEnd', []); await sleep(150); };
const count = (id) => page.evaluate((i) => { const inv = __game.state.inventory; let c = 0; for (const a of ['bag', 'hotbar']) for (const s of inv[a]) if (s && s.id === i) c += s.n; return c; }, id);
const objText = () => page.evaluate(() => { const o = document.querySelector('.objective'); return o && !o.hidden ? o.querySelector('.obj-text').textContent : ''; });

await page.goto('http://localhost:8093/index.html?seed=7&touch=1&debug=1');
await page.waitForFunction(() => window.__game && __game.state);
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();
await page.waitForFunction(() => window.__game && __game.state);
await page.waitForTimeout(900);

console.log('Title screen');
check(await page.evaluate(() => document.querySelector('#title h1').textContent === 'LAST EMBER'), 'title shows LAST EMBER');
check(await page.evaluate(() => document.querySelector('#btn-continue').hidden), 'Continue hidden without a save');
check(await page.evaluate(() => /rescue/i.test(document.querySelector('#title .tag').textContent)), 'one-line premise present');
await shot('01-title');
await page.click('#btn-how');
await page.waitForSelector('.panel-howto');
await page.waitForTimeout(200);
check(await page.evaluate(() => { const p = document.querySelector('.panel-howto').getBoundingClientRect(); return p.width > 200 && getComputedStyle(document.querySelector('#panels')).zIndex > 30; }), 'how-to-play panel sits above the title');
await shot('02-howto');
await page.click('.panel-howto .x');
await page.click('#btn-new');
await page.waitForFunction(() => __game.mode === 'playing');
await page.waitForTimeout(500);

console.log('Objective tracker');
check((await objText()) === 'Gather sticks and stones', `first objective: "${await objText()}"`);
await tap('.obj-main');
check(await page.evaluate(() => !document.querySelector('.obj-hint').hidden && /Act/.test(document.querySelector('.obj-hint').textContent)), 'tap shows the one-line hint');
await shot('03-tracker-hint');
await tap('.obj-main');

async function approach(type) {
  return page.evaluate((type) => {
    const g = __game, p = g.state.player, w = g.world;
    let best = null; w.forEachObject((o) => { if (o.type === type && !o.depleted) { const d = Math.hypot(o.tx - 64, o.ty - 64); if (!best || d < best.d) best = { o, d }; } });
    if (!best) return null;
    const { o } = best;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      if (w.isBlocked(o.tx + dx, o.ty + dy) || w.objectAt(o.tx + dx, o.ty + dy)) continue;
      const c = w.tileCenter(o.tx + dx, o.ty + dy); p.x = c.x; p.y = c.y; p.facing = Math.atan2(-dy, -dx);
      return { tx: o.tx, ty: o.ty };
    }
    return null;
  }, type);
}
for (const type of ['loose_stick', 'loose_stick', 'loose_stick', 'loose_stone', 'loose_stone', 'loose_stone']) {
  await approach(type);
  await page.waitForFunction((t) => __game.target?.obj?.type === t, type, { timeout: 3000 });
  await tap('.tbtn-action');
}
check((await count('stick')) >= 3 && (await count('stone')) >= 3, `picked up sticks=${await count('stick')} stones=${await count('stone')}`);
await page.waitForFunction(() => document.querySelector('.objective.ticking'), null, { timeout: 4000 }).catch(() => {});
await shot('04-tracker-tick');
await page.waitForFunction(() => /crate/i.test(document.querySelector('.objective .obj-text').textContent), null, { timeout: 6000 });
check(/crate/i.test(await objText()), `tracker advanced: "${await objText()}"`);
await shot('05-tracker-next');

console.log('Compass markers');
const stage = await page.evaluate(() => {
  const g = __game, sp = g.state.world.spawn;
  g.state.time.t = 100; g.weather.force('clear', 1e6);
  g.debug.teleport(sp.tx, sp.ty);
  return sp;
});
await sleep(500);
check((await page.evaluate(() => document.querySelectorAll('.cm.wreck').length)) === 0, 'no wreck markers without the flight map (none within 20 tiles)');
// campfire at spawn + home marker once the player is away
await page.evaluate(({ tx, ty }) => {
  const g = __game; g.world.setObject(tx + 2, ty + 1, { type: 'campfire', fuel: 400, lit: true, everLit: true, hp: 40 });
  g.events.emit('fire:lit', { type: 'campfire', tx: tx + 2, ty: ty + 1 });
}, stage);
await page.evaluate(({ tx, ty }) => { const w = __game.world; let best = null; for (const p of w.pois()) if (p.type === 'wreckage') { const d = Math.hypot(p.tx - tx, p.ty - ty); if (!best || d < best.d) best = { p, d }; } __game.debug.teleport(Math.round(tx + (best.p.tx - tx) * 0.6), Math.round(ty + (best.p.ty - ty) * 0.6)); }, stage);
await sleep(700);
check((await page.evaluate(() => document.querySelectorAll('.cm.home').length)) === 1, 'home marker shown for the lit campfire when off screen');
await page.evaluate(() => __game.debug.give('flight_map', 1));
await sleep(700);
const nWreck = await page.evaluate(() => document.querySelectorAll('.cm.wreck').length);
check(nWreck >= 2, `wreckage markers with the flight map: ${nWreck}`);
const label = await page.evaluate(() => document.querySelector('.cm.wreck .cm-dist')?.textContent);
check(/\d+ tiles/.test(label || ''), `marker shows distance: "${label}"`);
const inside = await page.evaluate(() => [...document.querySelectorAll('.cm')].every((e) => { const r = e.querySelector('.cm-badge').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 40 && r.bottom <= innerHeight; }));
check(inside, 'markers stay inside the screen');
await shot('06-compass');

console.log('Toast stack');
await page.evaluate(() => { for (const m of ['Test toast one', 'Test toast two', 'Test toast three', 'Test toast four']) __game.ui.toast(m, 'info'); });
await sleep(250);
const toastInfo = await page.evaluate(() => {
  const t = document.querySelector('.toasts').getBoundingClientRect(), s = document.querySelector('.hud-stats').getBoundingClientRect();
  return { n: document.querySelectorAll('.toast:not(.out)').length, top: t.top, statsBottom: s.bottom };
});
check(toastInfo.n <= 2, `at most 2 toasts visible (${toastInfo.n})`);
check(toastInfo.top >= toastInfo.statsBottom - 1, `toast stack (top ${toastInfo.top.toFixed(0)}) sits below the stat bars / objective (bottom ${toastInfo.statsBottom.toFixed(0)})`);
await shot('07-toasts');
await sleep(3800);

console.log('Radio tower panel');
const tw = await page.evaluate(() => {
  const g = __game, sp = g.state.world.spawn, tx = sp.tx + 3, ty = sp.ty - 4;
  for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 4; x <= tx + 4; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
  g.world.setObject(tx, ty, { type: 'radio_tower', hp: 300 });
  const c = g.world.tileCenter(tx, ty + 1); Object.assign(g.state.player, { x: c.x, y: c.y, facing: -Math.PI / 2 });
  g.renderer.snapCamera(); g.state.time.t = 20;
  return { tx, ty };
});
await page.waitForFunction(() => __game.target?.obj?.type === 'radio_tower', null, { timeout: 3000 });
check(await page.evaluate(() => document.querySelector('.act-label').textContent === 'Radio'), 'Action label on the tower is "Radio"');
await tap('.tbtn-action');
await page.waitForSelector('.panel-tower');
await page.waitForTimeout(300);
check(await page.evaluate(() => document.querySelector('.tw-power').textContent === 'No power'), 'panel: no power without a fire');
await page.evaluate(({ tx, ty }) => { __game.world.setObject(tx + 2, ty + 1, { type: 'campfire', fuel: 500, lit: true, everLit: true, hp: 40 }); }, tw);
await page.waitForFunction(() => document.querySelector('.tw-power').textContent === 'Powered', null, { timeout: 3000 });
check(true, 'panel: powered once a lit campfire is within 4 tiles');
await tap('.tw-toggle');
check(await page.evaluate(() => __game.state.endgame.transmitting), 'Start transmitting works');
await shot('08-tower-panel');
await page.click('.panel-tower [data-a="close"]');
// unpowered warning chip
await page.evaluate(({ tx, ty }) => { __game.world.objectAt(tx + 2, ty + 1).lit = false; }, tw);
await page.waitForFunction(() => [...document.querySelectorAll('.chip')].some((c) => /unpowered/i.test(c.textContent)), null, { timeout: 3000 });
check(true, 'HUD chip "Tower unpowered" while transmitting without power');
await shot('09-unpowered-chip');
await page.evaluate(() => { __game.state.endgame.transmitting = false; });

console.log('Rescue + victory');
await page.evaluate(() => __game.endgame.debug.forceVictory());
await page.waitForFunction(() => document.body.classList.contains('rescuing'));
await sleep(5200);
await shot('10-rescue-plane');
await page.waitForSelector('.panel-gameover', { timeout: 12000 });
await sleep(500);
check(await page.evaluate(() => document.querySelector('.panel-gameover h2').textContent === 'Rescued!'), 'victory screen title');
const rows = await page.evaluate(() => [...document.querySelectorAll('.go-stats span')].map((s) => s.textContent));
check(['Days survived', 'Animals hunted', 'Structures built', 'Distance walked'].every((r) => rows.includes(r)), `stats rows: ${rows.join(', ')}`);
check(await page.evaluate(() => document.querySelector('[data-a="again"]').textContent === 'Play again'), 'Play again button');
check(await page.evaluate(() => !__game.hasSave()), 'victory cleared the save');
await shot('11-victory');
await tap('[data-a="again"]');
await page.waitForFunction(() => __game.mode === 'playing' && !document.body.classList.contains('rescuing'));
check(await page.evaluate(() => __game.state.time.day === 1 && __game.state.endgame.nights === 0), 'Play again starts a fresh run');

console.log('Continue / new game confirmation');
await page.evaluate(() => { __game.save(); __game.toTitle(); });
await page.waitForTimeout(500);
check(await page.evaluate(() => !document.querySelector('#btn-continue').hidden && /Day 1/.test(document.querySelector('#btn-continue').textContent)), 'Continue shows "Day N"');
await page.click('#btn-new');
check(await page.evaluate(() => !document.querySelector('.title-confirm').hidden), 'New game with a save asks for confirmation');
await shot('12-title-confirm');
await page.click('#btn-new-no');
await page.click('#btn-continue');
await page.waitForFunction(() => __game.mode === 'playing');
console.log('Pause panel');
await page.evaluate(() => __game.ui.panels.open('pause'));
await page.waitForSelector('.panel-pause');
check(await page.evaluate(() => ['Resume', 'How to play', 'Abandon run'].every((t) => [...document.querySelectorAll('.panel-pause .btn')].some((b) => b.textContent.trim() === t))), 'pause: Resume / How to play / Abandon run');
await page.click('.panel-pause [data-a="abandon"]');
check(await page.evaluate(() => /Abandon this run/.test(document.querySelector('.panel-pause').textContent)), 'abandon asks for confirmation');
await shot('13-pause-abandon');
await page.click('.panel-pause [data-a="abandon-no"]');
await page.click('.panel-pause [data-a="resume"]');

await sleep(300);
check(errors.length === 0, `zero console errors${errors.length ? `:\n    ${errors.join('\n    ')}` : ''}`);
await browser.close(); server.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
