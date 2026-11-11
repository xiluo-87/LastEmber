// Shared helpers for the e2e scripts (Playwright is a global install, loaded via createRequire).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';

export const { chromium } = createRequire(import.meta.url)('playwright');
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const out = path.join(root, 'tests/e2e/out');
fs.mkdirSync(out, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const VIEWS = {
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 } },
};

/** Small test harness: check(), failures counter, server + browser lifecycle. */
export async function harness(name) {
  let failures = 0;
  const check = (cond, msg) => { if (!cond) { failures++; console.error(`  FAIL: ${msg}`); } else console.log(`  ok: ${msg}`); return !!cond; };
  const server = await startServer(0);
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const finish = async () => {
    await browser.close(); server.close();
    console.log(failures ? `\n${name}: ${failures} check(s) FAILED` : `\n${name} e2e passed`);
    process.exit(failures ? 1 : 0);
  };
  return { check, base, browser, finish, fails: () => failures };
}

/** Opens a page in a fresh context with console/pageerror capture. Returns helpers bound to the page. */
export async function open(browser, view, url, { newGame = true, init } = {}) {
  const errors = [];
  const ctx = await browser.newContext(typeof view === 'string' ? VIEWS[view] : view);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game && __game.state);
  await page.waitForTimeout(250);
  const touchy = !!(typeof view === 'string' ? VIEWS[view] : view).hasTouch;
  const cdp = touchy ? await ctx.newCDPSession(page) : null;
  const P = { page, ctx, cdp, errors, touchy };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  P.touch = touch;
  P.center = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  /** Real tap/click at css px. */
  P.tapAt = async (x, y, hold = 50) => {
    if (touchy) { await touch('touchStart', [[x, y, 9]]); await sleep(hold); await touch('touchEnd', []); }
    else { await page.mouse.move(x, y); await page.mouse.down(); await sleep(hold); await page.mouse.up(); }
    await sleep(120);
  };
  P.tap = async (sel) => { const [x, y] = await P.center(sel); await P.tapAt(x, y); };
  P.tileScreen = (tx, ty) => page.evaluate(([x, y]) => { const s = __game.renderer.worldToScreen(x * 32 + 16, y * 32 + 16); return [s.x, s.y]; }, [tx, ty]);
  P.shot = (file) => page.screenshot({ path: path.join(out, file) });
  P.state = (fn, arg) => page.evaluate(fn, arg);
  /** Hold a screen-space joystick drag (touch) or keys (desktop) for ms. dir = [dx,dy] unit. */
  P.walk = async (dx, dy, ms, sprint = false) => {
    if (touchy) {
      const w = (typeof view === 'string' ? VIEWS[view] : view).viewport;
      const ox = Math.round(w.width * 0.2), oy = Math.round(w.height * 0.7), r = sprint ? 62 : 36;
      await touch('touchStart', [[ox, oy, 1]]);
      for (let i = 1; i <= 4; i++) { await touch('touchMove', [[ox + dx * r * i / 4, oy + dy * r * i / 4, 1]]); await sleep(20); }
      await sleep(ms);
      await touch('touchEnd', []);
    } else {
      const keys = [];
      if (dx > 0.3) keys.push('d'); if (dx < -0.3) keys.push('a'); if (dy > 0.3) keys.push('s'); if (dy < -0.3) keys.push('w');
      for (const k of keys) await page.keyboard.down(k);
      if (sprint) await page.keyboard.down('Shift');
      await sleep(ms);
      if (sprint) await page.keyboard.up('Shift');
      for (const k of keys) await page.keyboard.up(k);
    }
    await sleep(60);
  };
  /** Walk (real joystick / keys) to a world-px point until within `stop` px. Returns true if arrived. */
  P.goTo = async (wx, wy, stop = 20, maxMs = 12000, sprint = false) => {
    const vw = (typeof view === 'string' ? VIEWS[view] : view).viewport;
    const ox = Math.round(vw.width * 0.2), oy = Math.round(vw.height * 0.7), R = sprint ? 62 : 38;
    const t0 = Date.now(); let down = false, ok = false, lastKeys = '';
    const setKeys = async (want) => {
      const k = want.join(''); if (k === lastKeys) return;
      for (const x of lastKeys) if (!want.includes(x)) await page.keyboard.up(x);
      for (const x of want) if (!lastKeys.includes(x)) await page.keyboard.down(x);
      lastKeys = k;
    };
    while (Date.now() - t0 < maxMs) {
      const p = await page.evaluate(() => ({ x: __game.state.player.x, y: __game.state.player.y }));
      const dx = wx - p.x, dy = wy - p.y, d = Math.hypot(dx, dy);
      if (d <= stop) { ok = true; break; }
      const ux = dx / d, uy = dy / d;
      if (touchy) {
        if (!down) { await touch('touchStart', [[ox, oy, 1]]); down = true; }
        await touch('touchMove', [[ox + ux * R, oy + uy * R, 1]]);
      } else {
        const want = []; if (ux > 0.38) want.push('d'); if (ux < -0.38) want.push('a'); if (uy > 0.38) want.push('s'); if (uy < -0.38) want.push('w');
        await setKeys(want);
      }
      await sleep(50);
    }
    if (touchy && down) await touch('touchEnd', []);
    if (!touchy) { await setKeys([]); }
    await sleep(80);
    return ok;
  };
  /** BFS over free tiles (world.isBlocked) from the player to the tile of (wx,wy); waypoint list in world px (every tile centre, thinned). */
  P.route = (wx, wy) => page.evaluate(([wx, wy]) => {
    const g = __game, w = g.world, p = g.state.player, s = w.worldToTile(p.x, p.y), t = w.worldToTile(wx, wy);
    const key = (x, y) => y * 4096 + x, prev = new Map([[key(s.tx, s.ty), null]]), q = [[s.tx, s.ty]];
    const free = (x, y) => w.inBounds(x, y) && !w.isBlocked(x, y);
    // a tile is walkable for the player body only if its 4 neighbours are not both-sided blocked diagonals: keep it simple, forbid diagonal corner cutting
    for (let i = 0; i < q.length && i < 40000; i++) {
      const [x, y] = q[i];
      if (x === t.tx && y === t.ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k) || (nx !== t.tx || ny !== t.ty ? !free(nx, ny) : false)) continue;
        if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
        prev.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    const k0 = key(t.tx, t.ty); if (!prev.has(k0)) return null;
    const path = []; for (let c = [t.tx, t.ty]; c; c = prev.get(key(c[0], c[1]))) path.push(c);
    path.reverse();
    return path.filter((_, i) => i % 2 === 1 || i === path.length - 1).map(([x, y]) => [x * 32 + 16, y * 32 + 16]);
  }, [wx, wy]);
  /** Walk along a BFS route to (wx,wy) with the real joystick / keys. */
  P.navTo = async (wx, wy, stop = 14, perLeg = 3500) => {
    const r = await P.route(wx, wy); if (!r) return false;
    for (const [x, y] of r) if (!(await P.goTo(x, y, 10, perLeg))) { const p = await P.state(() => ({ x: __game.state.player.x, y: __game.state.player.y })); if (Math.hypot(p.x - x, p.y - y) > 26) return false; }
    return Math.hypot(...(await P.state(() => [__game.state.player.x, __game.state.player.y])).map((v, i) => v - [wx, wy][i])) <= stop + 10;
  };
  /** Face a world point by nudging towards it (small step) — real movement sets facing. */
  P.faceTo = async (wx, wy) => { await P.goTo(wx, wy, 6, 600); };
  /** Hold the Action control (touch button / mouse button / Space) for ms. */
  P.act = async (ms = 120) => {
    if (touchy) { const [x, y] = await P.center('.tbtn-action'); await touch('touchStart', [[x, y, 2]]); await sleep(ms); await touch('touchEnd', []); }
    else { await page.keyboard.down('Space'); await sleep(ms); await page.keyboard.up('Space'); }
    await sleep(100);
  };
  P.tile = (o) => ({ x: o.tx * 32 + 16, y: o.ty * 32 + 16 });
  P.nearest = (type, from) => page.evaluate(([type, from]) => { const g = __game, p = from || g.state.player; let best = null, bd = 1e9; g.world.forEachObject((o) => { if (o.type !== type || o.depleted) return; const d = Math.hypot(o.tx * 32 + 16 - p.x, o.ty * 32 + 16 - p.y); if (d < bd) { bd = d; best = { tx: o.tx, ty: o.ty, d }; } }); return best; }, [type, from]);
  if (newGame) {
    await page.waitForSelector('#btn-new');
    await page.click('#btn-new');
    await page.waitForFunction(() => __game.mode === 'playing');
    await page.waitForTimeout(300);
  }
  return P;
}

export const countItem = (page, id) => page.evaluate((i) => { const inv = __game.state.inventory; let c = 0; for (const a of ['bag', 'hotbar']) for (const s of inv[a]) if (s && s.id === i) c += s.n; return c; }, id);
export const noErrors = (check, P, label = 'no console errors/warnings') => check(P.errors.length === 0, `${label}${P.errors.length ? ': ' + P.errors.slice(0, 4).join(' | ') : ''}`);
