// Compass markers never overlap each other, the HUD or the touch controls (portrait / landscape / desktop), wherever the wrecks are.
// Usage: node tests/e2e/compass.mjs    Screenshot: tests/e2e/out/compass-<view>.png
import { harness, open, sleep, noErrors } from './lib.mjs';
const { check, base, browser, finish } = await harness('compass');
for (const view of ['portrait', 'landscape', 'desktop']) {
  const P = await open(browser, view, base + `index.html?seed=7${view === 'desktop' ? '' : '&touch=1'}`);
  await P.state(() => { __game.debug.give('flight_map', 1); __game.ui.toast('Test toast one', 'info', 9000); __game.ui.toast('Test toast two', 'good', 9000); });
  const spots = await P.state(() => { const w = __game.world.pois().filter((p) => p.type === 'wreckage'); return w.map((p) => [p.tx, p.ty]); });
  const probes = [[64, 64], [20, 20], [108, 20], [20, 108], [108, 108], [64, 20], [64, 108], [20, 64], [108, 64], ...spots.map(([x, y]) => [x + 14, y + 9]), ...spots.map(([x, y]) => [x - 9, y - 14])];
  let worst = 0, shots = 0, bad = [];
  for (const [tx, ty] of probes) {
    await P.state(([tx, ty]) => { __game.debug.teleport(tx, ty); __game.step(2); }, [tx, ty]);
    await sleep(220);
    const r = await P.state(() => {
      const sel = '.hud-stats .bar, .hud-stats .objective, .hud-stats .chips, .hud-top .pill, .hud-pause, .toast, .banner:not([hidden]), .hotbar, .tbtn, .hint:not([hidden])';
      const obs = [...document.querySelectorAll(sel)].map((e) => { const b = e.getBoundingClientRect(); return { n: e.className, x: b.left, y: b.top, r: b.right, b: b.bottom }; }).filter((o) => o.r > o.x);
      const ms = [...document.querySelectorAll('.cm')].map((e) => { const b = e.querySelector('.cm-badge').getBoundingClientRect(), d = e.querySelector('.cm-dist').getBoundingClientRect(); return { x: Math.min(b.left, d.left), y: b.top, r: Math.max(b.right, d.right), b: d.bottom, bx: b.left, by: b.top, br: b.right, bb: b.bottom }; });
      const ov = (a, c) => a.bx < c.r && a.br > c.x && a.by < c.b && a.bb > c.y;
      const out = [];
      ms.forEach((m, i) => {
        for (const o of obs) if (ov(m, o)) out.push(`marker ${i} over ${o.n}`);
        ms.forEach((m2, j) => { if (j > i && m.x < m2.r && m.r > m2.x && m.y < m2.b && m.b > m2.y) out.push(`marker ${i} over marker ${j}`); });
        if (m.bx < 0 || m.by < 0 || m.br > innerWidth || m.bb > innerHeight) out.push(`marker ${i} off screen`);
      });
      return { n: ms.length, out };
    });
    worst = Math.max(worst, r.n);
    if (r.out.length) bad.push(`(${tx},${ty}): ${r.out.join('; ')}`);
    if (r.n >= 2 && shots === 0) { shots++; await P.shot(`compass-${view}.png`); }
  }
  check(worst >= 2, `${view}: up to ${worst} markers shown across ${probes.length} probe positions`);
  check(bad.length === 0, `${view}: markers never overlap the HUD or each other${bad.length ? ' -- ' + bad.slice(0, 4).join(' | ') : ''}`);
  noErrors(check, P, `${view}: no console errors`);
  await P.ctx.close();
}
await finish();
