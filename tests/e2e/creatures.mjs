// E2E: wildlife + combat on a phone viewport (390x844, real touch): kill a rabbit and a wolf with the spear via the Action button,
// butcher both, check meat; screenshots of every creature by day, wolf eye-shine at night, a telegraphing wolf; zero console errors.
// Usage: node tests/e2e/creatures.mjs     Screenshots: tests/e2e/out/creatures-*.png
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
const shot = (n) => page.screenshot({ path: path.join(out, `creatures-${n}.png`) });

await page.goto('http://localhost:8091/index.html?seed=7&touch=1&debug=1');
await page.waitForFunction(() => window.__game && __game.state);
await page.waitForTimeout(300);
await page.click('#btn-new');
await page.waitForFunction(() => __game.mode === 'playing');
await page.waitForTimeout(300);

const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const center = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const count = (id) => page.evaluate((i) => { const inv = __game.state.inventory; let c = 0; for (const a of ['bag', 'hotbar']) for (const s of inv[a]) if (s && s.id === i) c += s.n; return c; }, id);
const label = () => page.evaluate(() => document.querySelector('.act-label').textContent);

// clear a patch around the player, give the kit, select the spear
await page.evaluate(() => {
  const g = __game, p = g.state.player, w = g.world;
  const t = w.worldToTile(p.x, p.y);
  for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) { const o = w.objectAt(t.tx + dx, t.ty + dy); if (o && o.type !== 'crash_site') w.removeObject(t.tx + dx, t.ty + dy); }
  g.state.creatures.list.length = 0; g.state.creatures.carcasses.length = 0; g.state.creatures.spawnT = 1e9;
  g.debug.give('spear', 1); g.debug.give('bow', 1); g.debug.give('arrow', 10); g.debug.give('torch', 1);
  const hb = g.state.inventory.hotbar; const i = hb.findIndex((s) => s && s.id === 'spear'); g.state.inventory.selected = i >= 0 ? i : 0;
  p.facing = 0;
});
const heldId = await page.evaluate(() => { const s = __game.state.inventory.hotbar[__game.state.inventory.selected]; return s && s.id; });
check(heldId === 'spear', `spear selected (${heldId})`);

console.log('Day lineup (screenshot)');
await page.evaluate(() => {
  const g = __game, C = g.creatures, p = g.state.player;
  g.state.time.t = 120; g.state.time.day = 2;
  p.facing = 0;
  const mk = (type, dx, dy, o) => { const c = C.spawnCreature(g, type, p.x + dx * 32, p.y + dy * 32, o); c.fz = 1; c.face = -1; return c; };
  window.__lineup = [mk('rabbit', 2.2, -3.2), mk('deer', 3.2, -1.2), mk('wolf', -2.8, 2.2), mk('bear', 2.2, 3.4)];
  for (const c of __lineup) c.face = c.type === 'wolf' ? 1 : -1;
});
await page.waitForTimeout(250);
await shot('01-day-lineup');
await page.evaluate(() => { __game.creatures.list.length = 0; });

console.log('Rabbit: spear + Action button');
await page.evaluate(() => { const g = __game, p = g.state.player; const c = g.creatures.spawnCreature(g, 'rabbit', p.x + 40, p.y); c.fz = 1; window.__rabbit = c.id; p.facing = 0; });
await page.waitForFunction(() => __game.target?.kind === 'creature', null, { timeout: 3000 });
check((await label()) === 'Attack', `Action label is "${await label()}"`);
const [ax, ay] = await center('.tbtn-action');
await touch('touchStart', [[ax, ay, 3]]);
await page.waitForFunction(() => __game.state.creatures.carcasses.some((k) => k.type === 'rabbit'), null, { timeout: 5000 });
await touch('touchEnd', []);
check(await page.evaluate(() => __game.state.creatures.carcasses.length === 1), 'rabbit died and left a carcass');
await sleep(100);
await shot('02-carcass');
await page.waitForFunction(() => __game.target?.kind === 'carcass', null, { timeout: 3000 });
check((await label()) === 'Butcher', `Action label is "${await label()}"`);
const meat0 = await count('raw_meat');
await touch('touchStart', [[ax, ay, 4]]);
await sleep(450);
await shot('03-butchering');
await page.waitForFunction(() => __game.state.creatures.carcasses.length === 0, null, { timeout: 4000 });
await touch('touchEnd', []);
check((await count('raw_meat')) === meat0 + 1, `butchered rabbit: raw_meat ${meat0} -> ${await count('raw_meat')}`);

console.log('Wolf: spear + Action button');
const wolfStats = await page.evaluate(() => { const g = __game, p = g.state.player; const c = g.creatures.spawnCreature(g, 'wolf', p.x + 38, p.y); c.fz = 1; p.facing = 0; return c.hp; });
await page.waitForFunction(() => __game.target?.kind === 'creature', null, { timeout: 3000 });
await touch('touchStart', [[ax, ay, 5]]);
await sleep(700);
await shot('04-wolf-hit');
await page.waitForFunction(() => __game.state.creatures.carcasses.some((k) => k.type === 'wolf'), null, { timeout: 6000 });
await touch('touchEnd', []);
check(wolfStats === 28, 'wolf had 28 hp');
const spear = await page.evaluate(() => __game.state.inventory.hotbar.find((s) => s && s.id === 'spear'));
check(spear && spear.dur < 50, `spear wore down to ${spear?.dur}`);
await page.waitForFunction(() => __game.target?.kind === 'carcass', null, { timeout: 3000 });
const meat1 = await count('raw_meat'), hide1 = await count('hide'), bone1 = await count('bone');
await touch('touchStart', [[ax, ay, 6]]);
await page.waitForFunction(() => __game.state.creatures.carcasses.length === 0, null, { timeout: 4000 });
await touch('touchEnd', []);
check((await count('raw_meat')) === meat1 + 2 && (await count('hide')) === hide1 + 1 && (await count('bone')) === bone1 + 1, `butchered wolf: meat+2 hide+1 bone+1 (${await count('raw_meat')}/${await count('hide')}/${await count('bone')})`);

console.log('Bow: auto-aim shot');
await page.evaluate(() => {
  const g = __game, p = g.state.player, inv = g.state.inventory;
  inv.selected = inv.hotbar.findIndex((s) => s && s.id === 'bow');
  const c = g.creatures.spawnCreature(g, 'deer', p.x + 150, p.y - 30); c.fz = 1; p.facing = 0; window.__deer = c;
});
await page.waitForFunction(() => document.querySelector('.act-label').textContent === 'Shoot', null, { timeout: 2000 }).catch(() => {});
check((await label()) === 'Shoot', `Action label with bow is "${await label()}"`);
const arrows0 = await count('arrow');
await touch('touchStart', [[ax, ay, 7]]);
await page.waitForFunction(() => __deer.hp < 30, null, { timeout: 4000 });
await touch('touchEnd', []);
check((await count('arrow')) === arrows0 - 1, `arrow consumed (${arrows0} -> ${await count('arrow')})`);
check(await page.evaluate(() => __deer.hp === 30 - 22), 'deer took 22 damage from the auto-aimed arrow');

console.log('Wolf telegraph + night eyes');
await page.evaluate(() => {
  const g = __game, p = g.state.player, inv = g.state.inventory;
  g.creatures.list.length = 0; g.state.creatures.arrows.length = 0; g.state.creatures.spawnT = 1e9;
  inv.selected = inv.hotbar.findIndex((s) => s && s.id === 'spear');
  g.state.time.day = 3; g.state.time.t = 330; g.state.creatures.packDay = 3; g.state.creatures.packsTonight = 1;
  const a = g.creatures.spawnCreature(g, 'wolf', p.x - 150, p.y + 30); a.fz = 1; a.face = 1; a.mode = 'prowl';
  const b = g.creatures.spawnCreature(g, 'wolf', p.x + 130, p.y - 90); b.fz = 1; b.face = -1; b.mode = 'hunt';
  const far = g.creatures.spawnCreature(g, 'wolf', p.x + 400, p.y + 40); far.fz = 1;
});
await page.waitForTimeout(300);
await shot('05-night-eyes');
await page.evaluate(() => {
  const g = __game, p = g.state.player;
  g.creatures.list.length = 0; g.state.time.t = 120; g.state.time.day = 2;
  const w = g.creatures.spawnCreature(g, 'wolf', p.x + 78, p.y - 6); w.ai = 'telegraph'; w.t = 0.15; w.fz = 1; w.face = -1;
});
await page.waitForTimeout(200);
await shot('06-telegraph');
await page.evaluate(() => { __game.creatures.list.length = 0; });

check(errors.length === 0, `zero console errors/warnings ${errors.join(' | ')}`);
await browser.close(); server.close();
if (failures) { console.error(`${failures} FAILED`); process.exit(1); }
console.log('creatures e2e passed');
