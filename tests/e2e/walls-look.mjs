// Visual check: wall / door sprites close-up by day and the base at night. Usage: node tests/e2e/walls-look.mjs [tag]
import { harness, open, sleep } from './lib.mjs';
const tag = process.argv[2] || 'now';
const { base, browser, finish } = await harness('walls');
for (const view of ['portrait']) {
  const P = await open(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 4, hasTouch: true, isMobile: true }, base + 'index.html?seed=7&touch=1');
  const { cx, cy } = await P.state(() => {
    const g = __game, sp = g.state.world.spawn, cx = sp.tx, cy = sp.ty;
    for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - 10; x <= cx + 10; x++) { g.world.removeObject(x, y); g.world.setTerrain(x, y, 'snow'); }
    for (const [id, n] of [['wood', 80], ['stone', 60], ['stick', 20], ['rope', 6], ['flint', 1], ['fiber', 6], ['hide', 4]]) g.debug.give(id, n);
    const c = g.world.tileCenter(cx, cy);     g.state.time.t = 150; g.weather.force('clear', 6000);
    const B = g.building, P0 = g.state.player;
    const put = (type, x, y) => { const c = g.world.tileCenter(x, y); Object.assign(P0, { x: c.x + 24, y: c.y + 70 }); B.select(type); if (!B.place(x, y)) console.error('fail', type, x, y, B.ghost.reason); };
    put('campfire', cx, cy);
    for (let x = cx - 3; x <= cx + 3; x++) for (let y = cy - 3; y <= cy + 3; y++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== 3 || (x === cx && y === cy + 3)) continue;
      if (x > cx + 1 && y < cy) continue; // stone section below
      put('wood_wall', x, y);
    }
    for (let x = cx + 2; x <= cx + 3; x++) for (let y = cy - 3; y <= cy - 1; y++) if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === 3) put('stone_wall', x, y);
    put('door', cx, cy + 3);
    put('wood_wall', cx - 6, cy - 6); put('wood_wall', cx - 6, cy - 5); put('wood_wall', cx - 5, cy - 6); // loose corner piece
    B.cancel();
    { const f = g.world.objectAt(cx, cy); g.structures.addFuel(f, 'wood'); g.structures.addFuel(f, 'wood'); g.structures.addFuel(f, 'wood'); g.structures.light(f); }
    g.renderer.snapCamera?.();
    return { cx, cy };
  });
  await sleep(500);
  await P.state(([cx, cy]) => { const c = __game.world.tileCenter(cx, cy + 2); Object.assign(__game.state.player, { x: c.x, y: c.y + 100 }); __game.renderer.snapCamera?.(); }, [cx, cy]);
  await sleep(400);
  await P.shot(`walls-${tag}-day.png`);
  // close-up of the door / SE corner / wood-stone join (clip is in css px)
  await P.page.screenshot({ path: new URL(`./out/walls-${tag}-closeup.png`, import.meta.url).pathname, clip: { x: 90, y: 300, width: 220, height: 220 } });
  // close-up: zoom the camera on the NE corner (stone/wood join) and the door
  await P.state(() => { const r = __game.renderer; r.zoomOverride = 3; });
  await sleep(100);
  await P.state(([cx, cy]) => { const g = __game; g.debug.setTime(1, 345); g.state.player.warmth = 80; const c = g.world.tileCenter(cx + 1, cy + 3); Object.assign(g.state.player, { x: c.x, y: c.y }); }, [cx, cy]);
  await sleep(1200);
  await P.shot(`walls-${tag}-night.png`);
  console.log(P.errors);
}
await finish();
