// E2E smoke test (Playwright, preinstalled globally). Usage: npm run test:e2e
// Covers phone (390x844, real multi-touch via CDP) and desktop (1280x800, keyboard), plus dist/index.html over file://.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { startServer } from '../../scripts/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'tests/e2e/out');
fs.mkdirSync(out, { recursive: true });

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error(`  FAIL: ${msg}`); } else console.log(`  ok: ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pos = (page) => page.evaluate(() => ({ x: __game.state.player.x, y: __game.state.player.y }));

async function newPage(browser, opts, errors) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { ctx, page };
}

async function startNew(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__game && __game.state);
  await page.waitForTimeout(400);
  await page.click('#btn-new');
  await page.waitForFunction(() => __game.mode === 'playing');
  await page.waitForTimeout(300);
}

async function phoneRun(browser, url, tag) {
  console.log(`[phone ${tag}] 390x844 touch`);
  const errors = [];
  const { ctx, page } = await newPage(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, errors);
  await startNew(page, url);
  await page.screenshot({ path: path.join(out, `phone-${tag}-01-start.png`) });
  check(await page.evaluate(() => document.body.classList.contains('touch')), 'touch UI enabled');
  check(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'page does not scroll');

  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const before = await pos(page);
  await touch('touchStart', [[70, 600, 1]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[70 + i * 11, 600, 1]]); await sleep(40); }
  await sleep(500);
  const mid = await pos(page);
  check(mid.x > before.x + 20, `joystick moves player right (dx=${(mid.x - before.x).toFixed(0)})`);
  // multi-touch: hold Action with a second finger while still moving
  const btn = await page.evaluate(() => { const r = document.querySelector('.tbtn-action').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await touch('touchStart', [[136, 600, 1], [btn[0], btn[1], 2]]);
  await sleep(250);
  const state = await page.evaluate(() => ({ held: __game.input.intent.actionHeld, mx: __game.input.intent.moveX }));
  check(state.held && state.mx > 0.3, `move + Action held simultaneously (held=${state.held}, moveX=${state.mx.toFixed(2)})`);
  await page.screenshot({ path: path.join(out, `phone-${tag}-02-touch.png`) });
  await touch('touchEnd', [[136, 600, 1]]);
  await touch('touchEnd', []);
  await sleep(300);
  const after = await page.evaluate(() => ({ held: __game.input.intent.actionHeld, mx: __game.input.intent.moveX }));
  check(!after.held && after.mx === 0, 'releasing both fingers stops input');
  const end = await pos(page);
  check(Math.hypot(end.x - before.x, end.y - before.y) > 30, 'player position changed');
  // bag button via touch tap
  await page.tap('.tbtn-bag');
  await page.waitForSelector('.panel-bag');
  await page.screenshot({ path: path.join(out, `phone-${tag}-03-bag.png`) });
  await page.tap('.panel-bag .x');
  await page.waitForFunction(() => !__game.ui.panels.isOpen('bag'));
  // night look
  await page.evaluate(() => { __game.state.time.t = 430; __game.debug.give('torch', 1); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `phone-${tag}-04-night.png`) });
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

async function desktopRun(browser, url, tag) {
  console.log(`[desktop ${tag}] 1280x800`);
  const errors = [];
  const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } }, errors);
  await page.goto(url);
  await page.waitForFunction(() => window.__game && __game.state);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `desktop-${tag}-00-title.png`) });
  await page.click('#btn-new');
  await page.waitForFunction(() => __game.mode === 'playing');
  await page.waitForTimeout(300);
  const before = await pos(page);
  await page.keyboard.down('d'); await sleep(700); await page.keyboard.up('d');
  const after = await pos(page);
  check(after.x > before.x + 30, `keyboard moves player (dx=${(after.x - before.x).toFixed(0)})`);
  await page.keyboard.down('s'); await page.keyboard.down('Shift'); await sleep(500); await page.keyboard.up('Shift'); await page.keyboard.up('s');
  check((await pos(page)).y > after.y + 30, 'sprint down works');
  await page.mouse.move(300, 300); await sleep(100);
  check(await page.evaluate(() => Math.abs(__game.state.player.facing) > 0.01), 'mouse aims facing');
  await page.evaluate(() => { __game.debug.kit(); });
  await page.keyboard.press('3');
  check(await page.evaluate(() => __game.state.inventory.selected === 2), 'hotbar key selects slot');
  await page.keyboard.press('i');
  await page.waitForSelector('.panel-bag');
  await page.screenshot({ path: path.join(out, `desktop-${tag}-02-bag.png`) });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !__game.ui.panels.isOpen('bag'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.panel-pause');
  check(await page.evaluate(() => __game.paused), 'Esc opens pause and pauses sim');
  const p1 = await pos(page); await sleep(200);
  check((await pos(page)).x === p1.x, 'sim frozen while paused');
  await page.click('.panel-pause [data-a="resume"]');
  await page.waitForFunction(() => !__game.paused);
  // save + reload + continue round trip
  const snap = await page.evaluate(() => { __game.save(); return JSON.stringify({ x: __game.state.player.x, seed: __game.state.seed, inv: __game.state.inventory }); });
  await page.reload();
  await page.waitForFunction(() => window.__game && __game.state);
  await page.waitForSelector('#btn-continue:not([hidden])');
  await page.click('#btn-continue');
  await page.waitForFunction(() => __game.mode === 'playing');
  const snap2 = await page.evaluate(() => JSON.stringify({ x: __game.state.player.x, seed: __game.state.seed, inv: __game.state.inventory }));
  check(snap === snap2, 'Continue restores saved state');
  await page.evaluate(() => { __game.state.time.t = 100; __game.world; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `desktop-${tag}-01-game.png`) });
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

const server = await startServer(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
try {
  await phoneRun(browser, `${base}?seed=7&debug=1`, 'dev');
  await desktopRun(browser, `${base}?seed=7`, 'dev');
  execSync('npm run build', { cwd: root, stdio: 'pipe' });
  const dist = pathToFileURL(path.join(root, 'dist/index.html')).href;
  await phoneRun(browser, `${dist}?seed=7`, 'dist');
  await desktopRun(browser, `${dist}?seed=7`, 'dist');
} finally {
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall e2e checks passed');
process.exit(failures ? 1 : 0);
