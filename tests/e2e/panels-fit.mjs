// Every panel must fit and scroll internally on phone portrait AND landscape (844x390): panel inside the viewport, close button reachable,
// last control reachable by scrolling the panel body. Also checks HUD / hotbar / action buttons don't overlap each other in landscape.
// Usage: node tests/e2e/panels-fit.mjs     Screenshots: tests/e2e/out/panel-<view>-<id>.png
import { harness, open, sleep } from './lib.mjs';
const { check, base, browser, finish } = await harness('panels');

for (const view of ['landscape', 'portrait']) {
  console.log(`\n== ${view}`);
  const P = await open(browser, view, base + 'index.html?seed=7&touch=1');
  const vp = await P.state(() => ({ w: innerWidth, h: innerHeight }));
  const { cx, cy } = await P.state(() => {
    const g = __game, sp = g.state.world.spawn, cx = sp.tx, cy = sp.ty;
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
    for (const [id, n] of [['wood', 60], ['stone', 30], ['stick', 20], ['rope', 6], ['flint', 1], ['fiber', 6], ['hide', 4], ['coal', 6], ['iron_ingot', 8], ['radio_antenna', 1], ['radio_battery', 1], ['radio_circuit', 1], ['cloth', 3], ['tin_pot', 1], ['raw_meat', 3], ['fur_hat', 1]]) g.debug.give(id, n);
    const B = g.building, P0 = g.state.player;
    const put = (type, x, y) => { const c = g.world.tileCenter(x, y); Object.assign(P0, { x: c.x, y: c.y + 70 }); B.select(type); if (!B.place(x, y)) console.error('fail', type, x, y, B.ghost.reason); };
    put('campfire', cx, cy); put('chest', cx + 2, cy); put('radio_tower', cx - 2, cy);
    B.cancel();
    const c = g.world.tileCenter(cx, cy + 2); Object.assign(P0, { x: c.x, y: c.y }); g.renderer.snapCamera?.();
    g.state.time.t = 150; g.weather.force('clear', 6000);
    const chest = g.world.objectAt(cx + 2, cy); if (chest?.inv) chest.inv.bag[0] = { id: 'wood', n: 5 };
    return { cx, cy };
  });
  await sleep(400);
  const cases = [
    ['hud', null], ['bag', { }], ['craft', { tab: 'craft' }], ['build', null], ['fuel', { tx: cx, ty: cy }], ['chest', { tx: cx + 2, ty: cy }],
    ['tower', { tx: cx - 2, ty: cy }], ['pause', null], ['howto', null], ['gameover-death', null], ['gameover-victory', null],
  ];
  for (const [id, payload] of cases) {
    await P.state(([id, payload]) => {
      const g = __game; g.ui.panels.closeAll(); g.building.cancel();
      if (id === 'hud') return;
      if (id === 'gameover-death') g.events.emit('game:over', { kind: 'death', cause: 'cold', stats: {}, day: 3 });
      else if (id === 'gameover-victory') g.events.emit('game:over', { kind: 'victory', stats: {}, day: 6 });
      else g.ui.panels.open(id === 'craft' ? 'bag' : id, payload);
    }, [id, payload]);
    await sleep(350);
    await P.shot(`panel-${view}-${id}.png`);
    const m = await P.state(() => {
      const panel = [...document.querySelectorAll('.panel')].pop();
      const hud = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      if (!panel) return { hud: { pill: hud('.hud-top .pill'), stats: hud('.hud-stats'), hotbar: hud('.hotbar'), action: hud('.tbtn-action'), use: hud('.tbtn-use'), bag: hud('.tbtn-bag'), build: hud('.tbtn-build'), pause: hud('.hud-pause'), joy: hud('.tz-left'), objective: hud('.objective:not([hidden])') } };
      const r = panel.getBoundingClientRect(), x = panel.querySelector('.x')?.getBoundingClientRect();
      const body = panel.querySelector('.panel-body');
      const scrolls = body.scrollHeight > body.clientHeight + 2;
      const before = body.scrollTop; body.scrollTop = body.scrollHeight;
      const kids = [...body.querySelectorAll('button:not([hidden]), .recipe, .bcard')].filter((e) => e.offsetParent !== null);
      const last = kids.length ? kids[kids.length - 1].getBoundingClientRect() : null;
      const pr = body.getBoundingClientRect();
      const reachable = !last || (last.bottom <= pr.bottom + 1.5 && last.top >= pr.top - 1.5);
      body.scrollTop = before;
      return { panel: { x: r.x, y: r.y, r: r.right, b: r.bottom }, x: x ? { x: x.x, y: x.y, r: x.right, b: x.bottom, w: x.width, h: x.height } : null, scrolls, reachable, sh: body.scrollHeight, ch: body.clientHeight };
    });
    if (id === 'hud') {
      const h = m.hud, round = (n) => ['action', 'use', 'bag', 'build', 'pause'].includes(n);
      const ov = (a, b, n1, n2) => { if (!a || !b) return false; if (round(n1) && round(n2)) { const d = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2); return d < (a.w + b.w) / 2 - 1; } return a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y; };
      const names = ['pill', 'stats', 'hotbar', 'action', 'use', 'bag', 'build', 'pause'];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) check(!ov(h[names[i]], h[names[j]], names[i], names[j]), `${view}: HUD ${names[i]} / ${names[j]} do not overlap`);
      check(h.action && h.action.r <= vp.w && h.action.b <= vp.h, `${view}: action button on screen`);
      check(h.hotbar && h.hotbar.b <= vp.h && h.hotbar.x >= 0 && h.hotbar.r <= vp.w, `${view}: hotbar on screen`);
      continue;
    }
    check(m.panel.x >= -0.5 && m.panel.y >= -0.5 && m.panel.r <= vp.w + 0.5 && m.panel.b <= vp.h + 0.5, `${view}: ${id} panel inside the viewport (${JSON.stringify(m.panel)})`);
    if (!id.startsWith('gameover')) check(m.x && m.x.x >= 0 && m.x.r <= vp.w && m.x.y >= 0 && m.x.b <= vp.h && m.x.w >= 40 && m.x.h >= 40, `${view}: ${id} close button reachable and >= 40px (${m.x && Math.round(m.x.w)}x${m.x && Math.round(m.x.h)})`);
    check(m.reachable, `${view}: ${id} last control reachable by scrolling (scrolls=${m.scrolls}, ${m.sh}/${m.ch})`);
  }
  await P.state(() => __game.ui.panels.closeAll());
  check(P.errors.length === 0, `${view}: no console errors ${P.errors.join('|')}`);
  await P.ctx.close();
}
await finish();
