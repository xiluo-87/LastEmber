// Robustness: resize / orientation change mid-game, tab hidden + visible, multi-touch edge cases (touchcancel, joystick lift while Action held),
// gesture / selection / context-menu suppression, Space on a focused button, the single built file over file:// AND inside a
// sandboxed iframe (opaque origin: localStorage throws).   Usage: node tests/e2e/robustness.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { harness, open, sleep, root, out, noErrors } from './lib.mjs';
const { check, base, browser, finish } = await harness('robustness');

console.log('Resize / orientation change mid-game');
{
  const P = await open(browser, 'portrait', base + 'index.html?seed=7&touch=1');
  const info = () => P.state(() => ({ iw: innerWidth, ih: innerHeight, cw: __game.canvas.width, ch: __game.canvas.height, vw: __game.view.w, vh: __game.view.h, dpr: __game.view.dpr }));
  let i = await info();
  check(Math.abs(i.cw - i.iw * i.dpr) <= 2 && Math.abs(i.ch - i.ih * i.dpr) <= 2, `portrait canvas matches viewport (${i.cw}x${i.ch})`);
  await P.state(() => __game.ui.panels.open('bag'));
  await P.page.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  i = await info();
  check(Math.abs(i.cw - i.iw * i.dpr) <= 2 && Math.abs(i.ch - i.ih * i.dpr) <= 2 && i.vw === 844, `after rotating to landscape the canvas follows (${i.cw}x${i.ch}, view ${i.vw}x${i.vh})`);
  const fits = await P.state(() => { const r = document.querySelector('.panel').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; });
  check(fits, 'open Bag panel re-fits after rotation');
  await P.state(() => __game.ui.panels.closeAll());
  const cam = await P.state(() => { const p = __game.state.player, s = __game.renderer.worldToScreen(p.x, p.y); return [s.x, s.y]; });
  check(cam[0] > 100 && cam[0] < 744 && cam[1] > 50 && cam[1] < 340, `player stays on screen after rotation (${cam.map(Math.round)})`);
  await P.page.setViewportSize({ width: 390, height: 844 });
  await sleep(400);
  await P.page.setViewportSize({ width: 1280, height: 800 });
  await sleep(400);
  i = await info();
  check(i.vw === 1280 && i.vh === 800, 'resize to desktop size');
  noErrors(check, P, 'resize: no console errors');
  await P.ctx.close();
}

console.log('Tab hidden / visible');
{
  const P = await open(browser, 'desktop', base + 'index.html?seed=7');
  await P.page.mouse.click(600, 400);   // user gesture: creates the AudioContext
  await sleep(300);
  const t0 = await P.state(() => __game.state.time.t + __game.state.time.day * 1000);
  await P.state(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(2500);
  const t1 = await P.state(() => __game.state.time.t + __game.state.time.day * 1000);
  const hidden = await P.state(() => ({ h: __game.hidden, a: __game.audio.state() }));
  check(hidden.h && Math.abs(t1 - t0) < 0.3, `simulation frozen while hidden (dt ${(t1 - t0).toFixed(2)}s)`);
  check(hidden.a === 'suspended' || hidden.a === 'none', `audio suspended while hidden (${hidden.a})`);
  await P.state(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(1000);
  const t2 = await P.state(() => __game.state.time.t + __game.state.time.day * 1000);
  check(t2 - t1 > 0.5 && t2 - t1 < 3, `time resumes without a jump (+${(t2 - t1).toFixed(2)}s)`);
  const a2 = await P.state(() => __game.audio.state());
  check(a2 === 'running' || a2 === 'none', `audio resumes (${a2})`);
  noErrors(check, P, 'visibility: no console errors');
  await P.ctx.close();
}

console.log('Multi-touch edge cases');
{
  const P = await open(browser, 'portrait', base + 'index.html?seed=7&touch=1');
  const intent = () => P.state(() => { const i = __game.input.intent; return { mx: i.moveX, my: i.moveY, held: i.actionHeld, sprint: i.sprint }; });
  const [ax, ay] = await P.center('.tbtn-action');
  await P.touch('touchStart', [[80, 600, 1]]); await P.touch('touchMove', [[80 + 36, 600, 1]]);
  await sleep(120);
  await P.touch('touchStart', [[80 + 36, 600, 1], [ax, ay, 2]]);
  await sleep(150);
  let s = await intent();
  check(s.mx > 0.4 && s.held, `move + hold Action at once (mx ${s.mx.toFixed(2)}, held ${s.held})`);
  await P.touch('touchEnd', [[80 + 36, 600, 1]]);  // CDP touchEnd lists the points that are released: the joystick finger lifts first
  await sleep(150);
  s = await intent();
  check(Math.abs(s.mx) < 0.01 && s.held, `joystick finger lifts while Action held: stops moving, Action stays held (mx ${s.mx.toFixed(2)}, held ${s.held})`);
  await P.touch('touchCancel', []);
  await sleep(150);
  s = await intent();
  check(!s.held && Math.abs(s.mx) < 0.01, `touchcancel releases everything (held ${s.held})`);
  // a third finger on the world while joystick + action are down must not break the others
  await P.touch('touchStart', [[80, 600, 1]]); await P.touch('touchMove', [[80, 600 - 40, 1]]);
  await P.touch('touchStart', [[80, 560, 1], [ax, ay, 2]]);
  await P.touch('touchStart', [[80, 560, 1], [ax, ay, 2], [260, 300, 3]]);
  await sleep(100);
  await P.touch('touchEnd', [[260, 300, 3]]);      // only the third finger (a tap on the world) lifts
  s = await intent();
  check(s.my < -0.3 && s.held, 'three fingers: joystick and Action still held after a world tap');
  await P.touch('touchEnd', []);
  await sleep(100);
  s = await intent();
  check(!s.held && Math.abs(s.my) < 0.01, 'all fingers up: idle');
  // pointer cancel while a panel opens mid-hold
  await P.touch('touchStart', [[ax, ay, 2]]);
  await sleep(80);
  await P.state(() => __game.ui.panels.open('bag'));
  await sleep(100);
  s = await intent();
  check(!s.held, 'opening a modal panel releases a held Action');
  await P.touch('touchEnd', []);
  await P.state(() => __game.ui.panels.closeAll());
  noErrors(check, P, 'multi-touch: no console errors');
  await P.ctx.close();
}

console.log('Gestures / selection / context menu / focus');
{
  const P = await open(browser, 'portrait', base + 'index.html?seed=7&touch=1');
  const r = await P.state(() => {
    const prevented = (type, init = {}, target = document.body) => { const e = new (type === 'contextmenu' || type === 'dblclick' ? MouseEvent : Event)(type, { bubbles: true, cancelable: true, ...init }); target.dispatchEvent(e); return e.defaultPrevented; };
    const cs = getComputedStyle(document.body);
    return {
      ctx: prevented('contextmenu'), dbl: prevented('dblclick'), sel: prevented('selectstart'), gs: prevented('gesturestart'), gc: prevented('gesturechange'),
      touchAction: cs.touchAction, userSelect: cs.userSelect, overscroll: cs.overscrollBehaviorY, vp: document.querySelector('meta[name=viewport]').content,
      hasSelection: String(getSelection()).length,
    };
  });
  check(r.ctx, 'context menu (long-press) suppressed');
  check(r.dbl, 'double-tap (dblclick) default prevented');
  check(r.sel, 'selectstart prevented');
  check(r.gs && r.gc, 'Safari pinch gesture events prevented');
  check(r.touchAction === 'none' && r.userSelect === 'none', `touch-action none, user-select none (${r.touchAction}/${r.userSelect})`);
  check(r.overscroll === 'none', 'overscroll-behavior none (no pull-to-refresh)');
  check(/user-scalable=no/.test(r.vp) && /maximum-scale=1/.test(r.vp) && /viewport-fit=cover/.test(r.vp), 'viewport meta blocks zoom, covers the notch');
  // two-finger pinch + long press on the canvas must not scroll / zoom the page
  await P.touch('touchStart', [[100, 300, 1], [200, 300, 2]]);
  await P.touch('touchMove', [[60, 300, 1], [260, 300, 2]]);
  await P.touch('touchEnd', []);
  await P.touch('touchStart', [[300, 400, 5]]); await sleep(700); await P.touch('touchEnd', []);
  const z = await P.state(() => ({ s: visualViewport.scale, sx: scrollX, sy: scrollY, sel: String(getSelection()).length }));
  check(z.s === 1 && z.sx === 0 && z.sy === 0 && z.sel === 0, `after pinch + long press: scale ${z.s}, scroll ${z.sx},${z.sy}, selection ${z.sel}`);
  noErrors(check, P, 'gestures: no console errors');
  await P.ctx.close();
}
{
  const P = await open(browser, 'desktop', base + 'index.html?seed=7');
  await P.page.focus('.hud-pause');
  await P.page.keyboard.press('Space');
  await sleep(300);
  check(!(await P.state(() => __game.ui.panels.isOpen('pause'))), 'Space on a focused HUD button does not click it while playing');
  const focus = await P.state(() => document.activeElement?.tagName);
  check(focus === 'BODY', `focus released to the page (${focus})`);
  await P.page.click('.hotbar .slot[data-i="1"]');
  await P.page.keyboard.press('Space'); await sleep(200);
  check(!(await P.state(() => __game.ui.panels.anyOpen())), 'Space after clicking a hotbar slot only acts in the world');
  noErrors(check, P, 'focus: no console errors');
  await P.ctx.close();
}

console.log('dist/index.html via file:// and in a sandboxed iframe');
{
  execFileSync('node', [path.join(root, 'scripts/build.mjs')], { stdio: 'pipe' });
  const dist = path.join(root, 'dist/index.html');
  check(fs.existsSync(dist) && !/(src|href)="https?:\/\//.test(fs.readFileSync(dist, 'utf8')), 'single built file, no external references');
  const P = await open(browser, 'portrait', 'file://' + dist + '?seed=7&touch=1', { newGame: true });
  check(await P.state(() => __game.mode === 'playing'), 'file://: New game starts');
  await P.state(() => __game.step(120));
  await P.tap('.tbtn-bag'); await sleep(300);
  check(await P.state(() => __game.ui.panels.isOpen('bag')), 'file://: Bag opens with a real tap');
  await P.shot('dist-file.png');
  noErrors(check, P, 'file://: no console errors');
  await P.ctx.close();
  // sandboxed iframe: scripts allowed, no same-origin => localStorage / sessionStorage throw, window.top is cross-origin
  const host = path.join(root, 'tests/e2e/out/iframe-host.html');
  fs.writeFileSync(host, '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><iframe id="f" sandbox="allow-scripts" src="/dist/index.html?seed=7&touch=1" style="border:0;width:100vw;height:100vh"></iframe>');
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(base + 'tests/e2e/out/iframe-host.html');
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  await frame.waitForFunction(() => window.__game && __game.state, null, { timeout: 8000 });
  const storage = await frame.evaluate(() => { try { localStorage.getItem('x'); return 'works'; } catch (e) { return e.name; } });
  check(storage === 'SecurityError', `iframe really has no storage access (${storage})`);
  await frame.click('#btn-new');
  await frame.waitForFunction(() => __game.mode === 'playing');
  await frame.evaluate(() => { __game.save(); __game.step(60); });
  await sleep(600);
  const toast = await frame.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
  check(toast.some((t) => /Saving isn't available/.test(t)), 'iframe: one-time "saving unavailable" toast');
  check(await frame.evaluate(() => __game.mode === 'playing' && __game.state.time.t > 0), 'iframe: game runs');
  const hasCont = await frame.evaluate(() => !document.querySelector('#btn-continue') || document.querySelector('#btn-continue').hidden);
  check(hasCont, 'iframe: no Continue offered (nothing could be saved)');
  await page.screenshot({ path: path.join(out, 'iframe.png') });
  check(errors.length === 0, `iframe: no console errors/warnings ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await finish();
