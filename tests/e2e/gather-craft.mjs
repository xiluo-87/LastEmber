// E2E: gather -> craft -> chop on a fixed seed, phone viewport (390x844, real touch), zero console errors.
// Usage: node tests/e2e/gather-craft.mjs      Screenshots: tests/e2e/out/gather-*.png
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

const server = await startServer(8089);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: path.join(out, `gather-${n}.png`) });

await page.goto('http://localhost:8089/index.html?seed=7&touch=1&debug=1');
await page.waitForFunction(() => window.__game && __game.state);
await page.waitForTimeout(300);
await page.click('#btn-new');
await page.waitForFunction(() => __game.mode === 'playing');
await page.waitForTimeout(300);

const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const center = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const tap = async (sel) => { const [x, y] = await center(sel); await touch('touchStart', [[x, y, 9]]); await sleep(60); await touch('touchEnd', []); await sleep(120); };
const count = (id) => page.evaluate((i) => { const inv = __game.state.inventory; let c = 0; for (const a of ['bag', 'hotbar']) for (const s of inv[a]) if (s && s.id === i) c += s.n; return c; }, id);

// Teleport next to the nearest `type` object that is not yet taken, face it, and wait for it to become the target.
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
async function waitTarget(type) { await page.waitForFunction((t) => __game.target?.obj?.type === t, type, { timeout: 3000 }); }

console.log('Gathering loose items');
const label0 = await page.evaluate(() => document.querySelector('.act-label').textContent);
check(label0 === 'Swing', `Action label with no target is "${label0}"`);
for (const type of ['loose_stick', 'loose_stick', 'loose_stone', 'loose_stone']) {
  const spot = await approach(type); check(!!spot, `found ${type}`);
  await waitTarget(type);
  const lbl = await page.evaluate(() => document.querySelector('.act-label').textContent);
  const hint = await page.evaluate(() => document.querySelector('.hint').textContent);
  if (type === 'loose_stick' && lbl) check(lbl === 'Take' && /Take/.test(hint), `Action button says "${lbl}", hint "${hint}"`);
  await tap('.tbtn-action');
  await sleep(150);
}
check((await count('stick')) >= 2 && (await count('stone')) >= 2, `picked up sticks=${await count('stick')} stones=${await count('stone')}`);
await shot('01-pickups');

console.log('Dead bush by hand');
await approach('dead_bush'); await waitTarget('dead_bush');
const [ax, ay] = await center('.tbtn-action');
await touch('touchStart', [[ax, ay, 3]]);
await page.waitForFunction(() => __game.state.inventory.bag.some((s) => s && s.id === 'fiber'), null, { timeout: 8000 });
await touch('touchEnd', []);
check((await count('fiber')) >= 1, `fiber=${await count('fiber')}`);

console.log('Craft stone axe via the UI');
await tap('.tbtn-bag');
await page.waitForSelector('.panel-bag');
await shot('02-bag');
await page.click('.tab[data-tab="craft"]');
await page.waitForSelector('.recipe');
await shot('03-craft');
const okRows = await page.$$eval('.recipe.ok', (n) => n.map((e) => e.querySelector('b').textContent));
check(okRows.includes('Stone axe'), `craftable now: ${okRows.join(', ')}`);
await page.click('.recipe.ok:has(b:text-is("Stone axe")) .craft');
await page.waitForFunction(() => __game.state.inventory.hotbar.concat(__game.state.inventory.bag).some((s) => s && s.id === 'stone_axe'));
check(true, 'stone axe crafted');
await page.click('.tab[data-tab="bag"]');
await page.waitForTimeout(100);
await page.click('.hotbar-row .slot:not(.empty)');
await shot('04-item-detail');
await page.click('.panel .x');
await page.waitForFunction(() => !document.querySelector('.panel-bag'));

console.log('Chop a tree');
await approach('tree'); await waitTarget('tree');
const treeLabel = await page.evaluate(() => document.querySelector('.act-label').textContent);
check(treeLabel === 'Chop', `with axe the label is "${treeLabel}"`);
await touch('touchStart', [[ax, ay, 4]]);
await page.waitForFunction(() => __game.state.inventory.bag.some((s) => s && s.id === 'wood'), null, { timeout: 10000 });
await touch('touchEnd', []);
await sleep(200);
await shot('05-chopped');
check((await count('wood')) >= 3, `wood=${await count('wood')}`);
const axe = await page.evaluate(() => __game.state.inventory.hotbar.find((s) => s && s.id === 'stone_axe'));
check(axe && axe.dur < 60, `axe durability dropped to ${axe?.dur}`);

console.log('Icons are distinct');
const dupes = await page.evaluate(async () => {
  const { ITEMS } = await import('/src/data/items.js'); const { itemIcon } = await import('/src/render/icons.js');
  const seen = new Map(), dupes = [];
  for (const id of Object.keys(ITEMS)) { const u = itemIcon(id).toDataURL(); if (seen.has(u)) dupes.push(`${id}=${seen.get(u)}`); else seen.set(u, id); }
  return dupes;
});
check(dupes.length === 0, `no duplicate item icons ${dupes.join(' ')}`);

check(errors.length === 0, `zero console errors/warnings ${errors.join(' | ')}`);
await browser.close(); server.close();
if (failures) { console.error(`${failures} FAILED`); process.exit(1); }
console.log('gather-craft e2e passed');
