// E2E: base building on a phone viewport (390x844, real touch): build menu, placement ghost valid/invalid, campfire + fuel panel,
// closed wall ring with a door -> room detected + warm at night, workbench recipe, chest storage, sleep. Zero console errors.
// Usage: node tests/e2e/building.mjs      Screenshots: tests/e2e/out/building-*.png
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

const server = await startServer(8091);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: path.join(out, `building-${n}.png`) });

await page.goto('http://localhost:8091/index.html?seed=7&touch=1&debug=1');
await page.waitForFunction(() => window.__game && __game.state);
await page.waitForTimeout(300);
await page.click('#btn-new');
await page.waitForFunction(() => __game.mode === 'playing');
await page.waitForTimeout(300);

const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const center = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const tapAt = async (x, y) => { await touch('touchStart', [[x, y, 9]]); await sleep(60); await touch('touchEnd', []); await sleep(140); };
const tap = async (sel) => { const [x, y] = await center(sel); await tapAt(x, y); };
const tapTile = async (tx, ty) => {
  const [x, y] = await page.evaluate(([tx, ty]) => { const s = __game.renderer.worldToScreen(tx * 32 + 16, ty * 32 + 16); return [s.x, s.y]; }, [tx, ty]);
  await tapAt(x, y);
};
const count = (id) => page.evaluate((i) => { const inv = __game.state.inventory; let c = 0; for (const a of ['bag', 'hotbar']) for (const s of inv[a]) if (s && s.id === i) c += s.n; return c; }, id);
const objAt = (tx, ty) => page.evaluate(([x, y]) => { const o = __game.world.objectAt(x, y); return o ? { type: o.type, lit: o.lit, fuel: o.fuel, hp: o.hp } : null; }, [tx, ty]);
const toastText = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));

// ---- set the stage: a cleared field, materials, player at the centre tile facing east
const { cx, cy } = await page.evaluate(() => {
  const g = __game, sp = g.state.world.spawn, cx = sp.tx, cy = sp.ty;
  for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - 10; x <= cx + 10; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
  for (const [id, n] of [['wood', 40], ['stone', 20], ['stick', 20], ['rope', 6], ['flint', 1], ['coal', 4], ['raw_meat', 2]]) g.debug.give(id, n);
  const c = g.world.tileCenter(cx, cy); Object.assign(g.state.player, { x: c.x, y: c.y, facing: 0 });
  g.state.time.t = 150; g.weather.force('clear', 6000);
  g.renderer.snapCamera?.();
  return { cx, cy };
});
await sleep(200);

console.log('Build menu');
await tap('.tbtn-build');
await page.waitForSelector('.panel-build .bcard');
await shot('01-menu');
const cards = await page.$$eval('.bcard', (n) => n.map((e) => ({ id: e.dataset.id, no: e.classList.contains('no'), cost: e.querySelectorAll('.need').length })));
check(cards.length === 14, `${cards.length} structures listed`);
check(cards.find((c) => c.id === 'campfire' && !c.no), 'campfire affordable');
check(cards.find((c) => c.id === 'radio_tower')?.no, 'radio tower greyed out');
const box = await page.$eval('.panel-build', (e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
check(box[0] <= 390, `menu fits the phone width (${box[0]}px)`);

console.log('Placement ghost');
await page.click('.bcard[data-id="campfire"]');
await page.waitForFunction(() => __game.building.mode === 'place');
await sleep(200);
let gh = await page.evaluate(() => ({ ...__game.building.ghost }));
check(gh.tx === cx + 1 && gh.ty === cy && gh.valid, `ghost in front of the player (${gh.tx},${gh.ty}) valid`);
check((await page.evaluate(() => document.querySelector('.act-label').textContent)) === 'Place', 'Action button says Place');
await shot('02-ghost-valid');
await tap('.tbtn-action');
await sleep(200);
check((await objAt(cx + 1, cy))?.type === 'campfire', 'campfire placed with the Action button');
check((await count('stick')) === 17 && (await count('stone')) === 17, 'materials were spent');
// stays in placement mode; the same tile is now occupied -> red + reason toast
await sleep(300);
gh = await page.evaluate(() => ({ ...__game.building.ghost, mode: __game.building.mode }));
check(gh.mode === 'place' && !gh.valid && /already there/.test(gh.reason), `still placing; ghost invalid: "${gh.reason}"`);
await tap('.tbtn-action');
await sleep(100);
check(/already there/.test(await toastText()), `refusal toast: "${await toastText()}"`);
await shot('03-ghost-invalid');
// pick a different spot by tapping the world (pin), tap again to confirm: put a chest (bag has wood)
await tap('.bb-btns [data-a="menu"]');
await page.waitForSelector('.panel-build .bcard');
await page.click('.bcard[data-id="chest"]');
await sleep(150);
await tapTile(cx + 1, cy + 1);
gh = await page.evaluate(() => ({ ...__game.building.ghost }));
check(gh.tx === cx + 1 && gh.ty === cy + 1 && gh.valid, 'tapping a tile moves the ghost there');
await tapTile(cx + 1, cy + 1);
await sleep(150);
check((await objAt(cx + 1, cy + 1))?.type === 'chest', 'tapping the ghost again places the chest');
// too far
await tapTile(cx + 5, cy);
await sleep(100);
gh = await page.evaluate(() => ({ ...__game.building.ghost }));
check(!gh.valid && /far/i.test(gh.reason), `far tile is invalid: "${gh.reason}"`);
await tap('.bb-btns [data-a="cancel"]');
check((await page.evaluate(() => __game.building.mode)) === null, 'Cancel leaves placement mode');

// B (Build button) and Esc both cancel placement mode
await page.evaluate(() => __game.building.select('wood_wall'));
await page.waitForSelector('.panel-buildbar');
await page.evaluate(() => __game.input.press('build'));
await sleep(150);
check((await page.evaluate(() => __game.building.mode)) === null && !(await page.$('.panel-buildbar')), 'Build button/B cancels placement');
await page.evaluate(() => __game.building.select('wood_wall'));
await page.waitForSelector('.panel-buildbar');
await page.evaluate(() => __game.input.press('escape'));
await sleep(150);
check((await page.evaluate(() => __game.building.mode)) === null && !(await page.$('.panel-buildbar')), 'Esc cancels placement');

console.log('Fuel panel + lighting');
await page.evaluate(([cx, cy]) => { const c = __game.world.tileCenter(cx, cy); Object.assign(__game.state.player, { x: c.x, y: c.y, facing: 0 }); }, [cx, cy]);
await page.waitForFunction(() => __game.target?.obj?.type === 'campfire');
await tap('.tbtn-action');
await page.waitForSelector('.panel-fuel .fitem');
await tap('.fitem[data-id="wood"]'); await tap('.fitem[data-id="wood"]'); await tap('.fitem[data-id="stick"]');
check((await objAt(cx + 1, cy)).fuel === 140, `fuel after 2 wood + 1 stick = ${(await objAt(cx + 1, cy)).fuel}`);
await shot('04-fuel-panel');
await tap('.flight');
await sleep(200);
check((await objAt(cx + 1, cy)).lit, 'fire lit with flint');
await tap('.panel-fuel .x');
await page.waitForFunction(() => !document.querySelector('.panel-fuel'));

console.log('Wall ring with a door');
await page.evaluate(([cx, cy]) => {
  const g = __game, B = g.building;
  B.select('wood_wall');
  for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== 2 || (x === cx && y === cy + 2)) continue;
    if (!B.place(x, y)) console.error('wall failed', x, y, B.ghost.reason);
  }
  B.select('door'); if (!B.place(cx, cy + 2)) console.error('door failed'); B.cancel();
}, [cx, cy]);
await sleep(300);
const room = await page.evaluate(([cx, cy]) => ({ sheltered: __game.shelterQuery(cx, cy), size: __game.building.enc.roomAt(cx, cy)?.size, toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent) }), [cx, cy]);
check(room.sheltered && room.size >= 6, `room detected (size ${room.size})`);
check(room.toasts.some((t) => /Shelter complete/.test(t)), 'shelter-complete toast');
check((await page.$$eval('.chip', (n) => n.map((e) => e.textContent))).includes('Sheltered'), 'Sheltered chip shown');
await shot('05-shelter-complete');

console.log('Night: felt temperature in the closed room');
await page.evaluate(() => { __game.debug.setTime(1, 345); __game.state.player.warmth = 60; });
await sleep(1200);
const felt = await page.evaluate(() => ({ felt: __game.state.survival.felt, phase: __game.state.time.phase, rate: __game.state.survival.rate }));
check(felt.phase === 'night' && felt.felt >= 10, `felt ${felt.felt.toFixed(1)}°C at night inside (>= 10 comfort)`);
await shot('06-night-base');
// the same fire without the room would be much colder: step outside and compare
const outside = await page.evaluate(([cx, cy]) => { const g = __game, p = g.state.player; const c = g.world.tileCenter(cx + 8, cy); const old = { x: p.x, y: p.y }; Object.assign(p, { x: c.x, y: c.y }); g.step(2); const f = g.state.survival.felt; Object.assign(p, old); g.step(2); return f; }, [cx, cy]);
check(outside < felt.felt - 15, `outside it is ${outside.toFixed(1)}°C`);

console.log('Sleeping in the base');
await page.evaluate(([cx, cy]) => {
  const g = __game; g.debug.give('fiber', 3); g.debug.give('hide', 2);
  const c = g.world.tileCenter(cx, cy + 1); Object.assign(g.state.player, { x: c.x, y: c.y, facing: 0 });
  g.building.select('bedroll'); g.building.place(cx - 1, cy + 1); g.building.cancel();
  Object.assign(g.state.player, { facing: Math.PI });
}, [cx, cy]);
await page.waitForFunction(() => __game.target?.obj?.type === 'bedroll', null, { timeout: 3000 });
check((await page.evaluate(() => document.querySelector('.act-label').textContent)) === 'Sleep', 'Action says Sleep at the bedroll');
await tap('.tbtn-action');
await page.waitForSelector('.panel-sleep');
await sleep(600);
check(await page.evaluate(() => __game.state.time.speed === 12 && !!__game.state.player.status.sleeping), 'sleeping: time x12 + sleeping effect');
await shot('06b-sleeping');
await tap('.panel-sleep [data-a="wake"]');
await page.waitForFunction(() => !document.querySelector('.panel-sleep'));
check(await page.evaluate(() => __game.state.time.speed === 1 && !__game.state.player.status.sleeping), 'Wake button restores normal time');
await page.evaluate(() => { __game.debug.setTime(1, 150); });

console.log('Workbench recipe');
await page.evaluate(([cx, cy]) => { __game.debug.setTime(1, 150); __game.debug.give('wood', 10); const c = __game.world.tileCenter(cx, cy); Object.assign(__game.state.player, { x: c.x, y: c.y }); __game.building.select('workbench'); __game.building.place(cx - 1, cy - 1); __game.building.cancel(); }, [cx, cy]);
await sleep(300);
check((await objAt(cx - 1, cy - 1))?.type === 'workbench', 'workbench placed');
check(await page.evaluate(() => __game.stationQuery().includes('workbench')), 'workbench is a crafting station near the player');
await tap('.tbtn-bag'); await page.waitForSelector('.panel-bag');
await page.click('.tab[data-tab="craft"]'); await page.waitForSelector('.recipe');
await page.click('.recipe.ok:has(b:text-is("Bow")) .craft');
await page.waitForFunction(() => __game.state.inventory.hotbar.concat(__game.state.inventory.bag).some((s) => s && s.id === 'bow'), null, { timeout: 4000 });
check(true, 'bow crafted at the workbench');
await page.click('.panel .x'); await page.waitForFunction(() => !document.querySelector('.panel-bag'));

console.log('Chest storage');
await page.evaluate(([cx, cy]) => { const c = __game.world.tileCenter(cx, cy + 1); Object.assign(__game.state.player, { x: c.x, y: c.y, facing: 0 }); }, [cx, cy]);
await page.waitForFunction(() => __game.target?.obj?.type === 'chest', null, { timeout: 3000 });
await tap('.tbtn-action');
await page.waitForSelector('.panel-chest .slot');
const before = await count('stone');
await page.click('.panel-chest .bgrid2 .slot:not(.empty)');            // first occupied bag slot
await sleep(150);
await shot('07-chest-panel');
const stored = await page.evaluate(([cx, cy]) => __game.world.objectAt(cx + 1, cy + 1).inv.bag.filter(Boolean).map((s) => `${s.id}x${s.n}`), [cx, cy]);
check(stored.length === 1, `stored in chest: ${stored.join(',')}`);
await page.click('.panel-chest .cgrid .slot:not(.empty)');
await sleep(150);
check((await page.evaluate(([cx, cy]) => __game.world.objectAt(cx + 1, cy + 1).inv.bag.filter(Boolean).length, [cx, cy])) === 0, 'tapping it in the chest moves it back');
void before;
await page.click('.panel .x');

console.log('Dismantle');
await tap('.tbtn-build'); await page.waitForSelector('.panel-build');
await page.click('.btn.dismantle'); await sleep(200);
check((await page.evaluate(() => __game.building.mode)) === 'dismantle', 'dismantle mode on');
await page.evaluate(([cx, cy]) => { const c = __game.world.tileCenter(cx, cy); Object.assign(__game.state.player, { x: c.x, y: c.y, facing: Math.atan2(-1, -1) }); }, [cx, cy]);
await page.waitForFunction(() => __game.target?.dismantle, null, { timeout: 3000 });
const wood0 = await count('wood');
const [ax, ay] = await center('.tbtn-action');
await touch('touchStart', [[ax, ay, 5]]);
await page.waitForFunction(([x, y]) => !__game.world.objectAt(x, y), [cx - 1, cy - 1], { timeout: 4000 });
await touch('touchEnd', []);
check((await count('wood')) === wood0 + 2, `dismantled the workbench (+2 wood refund, wood ${wood0} -> ${await count('wood')})`);
await tap('.bb-btns [data-a="cancel"]');
check((await page.evaluate(() => __game.building.mode)) === null, 'Done leaves dismantle mode');

check(errors.length === 0, `zero console errors/warnings ${errors.join(' | ')}`);
await browser.close(); server.close();
if (failures) { console.error(`${failures} FAILED`); process.exit(1); }
console.log('building e2e passed');
