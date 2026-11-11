// Embed fragment e2e: wraps dist/last-ember.embed.html in a host skeleton and loads it at phone size, directly and inside a
// sandboxed iframe (allow-scripts only, so localStorage throws). Usage: node tests/e2e/embed.mjs  (run `npm run build` first)
import fs from 'node:fs';
import path from 'node:path';
import { chromium, root, out, sleep, harness } from './lib.mjs';

const frag = path.join(root, 'dist/last-ember.embed.html');
if (!fs.existsSync(frag)) { console.error('dist/last-ember.embed.html missing - run npm run build'); process.exit(1); }
const fragment = fs.readFileSync(frag, 'utf8');
const wrap = (b) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${b}</body></html>`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const VIEW = { viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

const { check, browser, finish } = await harness('embed');

check(!/<!doctype|<html|<head|<body|charset|viewport|rel="icon"/i.test(fragment.replace(/<script>[\s\S]*<\/script>/, '').replace(/<style>[\s\S]*?<\/style>/, '')), 'fragment has no skeleton tags');
check(fragment.indexOf('<title>Last Ember</title>') >= 0 && fragment.indexOf('<title>Last Ember</title>') < 8192, 'title within first 8KB');
check(fragment.includes(':root{color-scheme:dark}'), 'color-scheme:dark present');

async function run(tag, sandboxed) {
  console.log(`[${tag}]`);
  const errors = [];
  const ctx = await browser.newContext(VIEW);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  if (sandboxed) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head><body><iframe id="f" sandbox="allow-scripts" srcdoc="${esc(wrap(fragment))}"></iframe></body></html>`);
  } else {
    await page.setContent(wrap(fragment));
  }
  const frame = () => (sandboxed ? page.frames().find((f) => f !== page.mainFrame()) : page.mainFrame());
  if (sandboxed) { await page.waitForSelector('#f'); await page.waitForFunction(() => true); }
  let f = frame();
  for (let i = 0; i < 100 && !(f = frame()); i++) await sleep(100);
  await f.waitForFunction(() => window.__game && __game.state, null, { timeout: 15000 });
  await sleep(400);
  if (sandboxed) check(await f.evaluate(() => { try { localStorage.getItem('x'); return false; } catch { return true; } }), 'localStorage throws in sandbox');
  check(await f.evaluate(() => document.title === 'Last Ember' || !!document.querySelector('title')), 'title present');
  await f.waitForSelector('#btn-new', { state: 'visible' });
  check(true, 'title screen shows (#btn-new visible)');
  await page.screenshot({ path: path.join(out, `embed-${tag}-title.png`) });
  const tap = async (sel) => { const [x, y] = await f.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    const off = sandboxed ? await page.evaluate(() => { const r = document.getElementById('f').getBoundingClientRect(); return [r.x, r.y]; }) : [0, 0];
    await touch('touchStart', [[x + off[0], y + off[1], 9]]); await sleep(60); await touch('touchEnd', []); await sleep(150); };
  await tap('#btn-new');
  await f.waitForFunction(() => __game.mode === 'playing', null, { timeout: 10000 });
  check(true, 'New game starts play');
  await sleep(500);
  const vis = await f.evaluate(() => ['.tbtn-action', '.tbtn-use', '.tbtn-bag', '.tbtn-build'].map((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }));
  check(vis.every(Boolean), `touch controls visible ${JSON.stringify(vis)}`);
  const off = sandboxed ? await page.evaluate(() => { const r = document.getElementById('f').getBoundingClientRect(); return [r.x, r.y]; }) : [0, 0];
  const p0 = await f.evaluate(() => ({ x: __game.state.player.x, y: __game.state.player.y }));
  const ox = Math.round(390 * 0.2) + off[0], oy = Math.round(800 * 0.7) + off[1];
  await touch('touchStart', [[ox, oy, 1]]);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', [[ox + 36 * i / 4, oy, 1]]); await sleep(20); }
  await sleep(1000);
  await page.screenshot({ path: path.join(out, `embed-${tag}-play.png`) });
  await touch('touchEnd', []);
  const p1 = await f.evaluate(() => ({ x: __game.state.player.x, y: __game.state.player.y }));
  check(Math.hypot(p1.x - p0.x, p1.y - p0.y) > 20, `player moved ${Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y))}px`);
  check(errors.length === 0, `no console/page errors${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
  await ctx.close();
}

await run('direct', false);
await run('sandboxed', true);
await finish();
