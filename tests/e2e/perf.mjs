// Performance: frame time at 4x CPU throttle on a phone viewport in the worst case (night blizzard, lit base, 40 creatures).
// Usage: node tests/e2e/perf.mjs [--profile] [--rate=4]   Prints fps / frame-time percentiles (and the top self-time functions with --profile).
import { harness, open, sleep } from './lib.mjs';
const profile = process.argv.includes('--profile');
const rate = Number((process.argv.find((a) => a.startsWith('--rate=')) || '--rate=4').slice(7));
const { check, base, browser, finish } = await harness('perf');
const qArg = process.argv.find((a) => a.startsWith('--q='));
const fixed = process.argv.includes('--fixed');   // --fixed pins full resolution (no adaptive governor)
const P = await open(browser, 'portrait', base + 'index.html?seed=7&touch=1' + (qArg ? `&quality=${qArg.slice(4)}` : ''), { adaptive: !fixed && !qArg });
await P.state(() => {
  const g = __game, sp = g.state.world.spawn, cx = sp.tx, cy = sp.ty;
  for (const [id, n] of [['wood', 80], ['stone', 30], ['stick', 20], ['rope', 6], ['flint', 1], ['coal', 6]]) g.debug.give(id, n);
  const B = g.building, P0 = g.state.player;
  for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
  const put = (type, x, y) => { const c = g.world.tileCenter(x, y); Object.assign(P0, { x: c.x, y: c.y + 70 }); B.select(type); B.place(x, y); };
  put('campfire', cx, cy); put('torch_post', cx - 4, cy); put('campfire', cx + 5, cy + 3);
  for (let x = cx - 1; x <= cx + 3; x++) for (let y = cy - 1; y <= cy + 1; y++) { if (y === cy && x >= cx && x <= cx + 2) continue; if (x === cx + 2 && y === cy + 1) continue; put('wood_wall', x, y); }
  put('door', cx + 2, cy + 1); B.cancel();
  for (const [x, y] of [[cx, cy], [cx + 5, cy + 3]]) { const f = g.world.objectAt(x, y); g.structures.addFuel(f, 'wood'); g.structures.addFuel(f, 'wood'); g.structures.light(f); }
  const c = g.world.tileCenter(cx + 1, cy + 2); Object.assign(P0, { x: c.x, y: c.y });
  g.debug.setTime(2, 330); g.weather.force('blizzard', 9999);
  const types = ['rabbit', 'wolf', 'deer'];
  for (let i = 0; i < 40; i++) { const a = i * 2.4, r = 90 + (i % 7) * 40; g.creatures.spawnCreature(g, types[i % 3], c.x + Math.cos(a) * r, c.y + Math.sin(a) * r); }
  g.step(240);
});
await sleep(1500);
const cdp = await P.ctx.newCDPSession(P.page);
const run = async (label, r) => {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: r });
  await sleep(r > 1 ? 9000 : 1200);   // give the adaptive resolution governor time to settle
  if (profile && r > 1) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const m = await P.state(() => new Promise((res) => {
    const d = []; let last = performance.now(), n = 0;
    const tick = (t) => { d.push(t - last); last = t; if (++n < 240) requestAnimationFrame(tick); else { d.shift(); d.sort((a, b) => a - b); const avg = d.reduce((a, b) => a + b, 0) / d.length; res({ fps: 1000 / avg, avg, p50: d[d.length >> 1], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], creatures: __game.state.creatures?.list?.length ?? -1, q: __game.renderer.quality(), dpr: __game.view.dpr }); } };
    requestAnimationFrame(tick);
  }));
  console.log(`  ${label}: ${m.fps.toFixed(1)} fps  avg ${m.avg.toFixed(1)}ms  p50 ${m.p50.toFixed(1)}  p95 ${m.p95.toFixed(1)}  max ${m.max.toFixed(1)}  creatures ${m.creatures}  quality step ${m.q} (dpr ${m.dpr})`);
  if (profile && r > 1) {
    const { profile: prof } = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const dt = prof.timeDeltas; let total = 0;
    prof.samples.forEach((id, i) => { const n = byId.get(id), k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt[i]); total += dt[i]; });
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
    for (const [k, v] of top) console.log(`     ${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`);
  }
  return m;
};
const m1 = await run('no throttle', 1);
const m4 = await run(`${rate}x CPU throttle`, rate);
check(m4.fps >= 45, `>= 45 fps under ${rate}x throttle (${m4.fps.toFixed(1)})`);
check(P.errors.length === 0, `no console errors ${P.errors.join('|')}`);
await finish();
