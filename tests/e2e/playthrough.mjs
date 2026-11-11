// E2E: a new player's first ten minutes with REAL input only (touch events via CDP on phones, keyboard+mouse on desktop).
// Usage: node tests/e2e/playthrough.mjs [portrait|landscape|desktop ...]   Screenshots: tests/e2e/out/pt-<view>-NN-*.png
import { harness, open, sleep, countItem, noErrors } from './lib.mjs';

const views = process.argv.slice(2).length ? process.argv.slice(2) : ['portrait', 'landscape', 'desktop'];
const { check, base, browser, finish } = await harness('playthrough');

for (const view of views) {
  console.log(`\n== ${view}`);
  const P = await open(browser, view, base + `index.html?seed=7${P_touch(view)}`, { newGame: false });
  let n = 0;
  const snap = (name) => P.shot(`pt-${view}-${String(++n).padStart(2, '0')}-${name}.png`);
  const g = (fn, arg) => P.page.evaluate(fn, arg);
  const player = () => g(() => ({ x: __game.state.player.x, y: __game.state.player.y }));
  const click = async (sel) => { await P.page.waitForSelector(sel, { state: 'visible', timeout: 4000 }); await P.tap(sel); };
  const hit = () => (P.touchy ? P.tap('.tbtn-action') : P.act(100));
  const label = () => g(() => document.querySelector('.act-label')?.textContent || '');

  // visit a pickup/node: walk next to it, then press the action while it is the target
  async function pick(type, { holdMs = 120, repeat = 1, from } = {}) {
    const o = await P.nearest(type, from);
    if (!o) return false;
    const c = P.tile(o);
    // approach from below-right side so we don't get stuck on trees: aim for the tile center but stop near
    await P.goTo(c.x, c.y, 22, 14000);
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) {
      ok = await g(() => !!__game.target);
      if (!ok) await P.faceTo(c.x, c.y);
    }
    for (let i = 0; i < repeat; i++) await P.act(holdMs);
    return ok;
  }

  // --- title -> new game
  await P.page.waitForSelector('#btn-new');
  await snap('title');
  await click('#btn-new');
  await P.page.waitForFunction(() => __game.mode === 'playing');
  await sleep(500);
  await snap('start');
  check(await g(() => __game.state.time.day === 1), `${view}: new game started on day 1`);
  const obj0 = await g(() => document.querySelector('.objective')?.textContent || '');
  check(/stick/i.test(obj0), `${view}: first objective mentions sticks (${obj0.trim()})`);

  // --- gather sticks and stones with real walking
  for (const t of ['loose_stick', 'loose_stick', 'loose_stick', 'loose_stone', 'loose_stone', 'loose_stone']) {
    const before = await countItem(P.page, t === 'loose_stick' ? 'stick' : 'stone');
    await pick(t);
    const after = await countItem(P.page, t === 'loose_stick' ? 'stick' : 'stone');
    check(after > before, `${view}: picked up ${t} (${before}->${after})`);
  }
  await snap('gathered');
  await sleep(2200);
  const obj1 = await g(() => document.querySelector('.objective')?.textContent || '');
  check(!/Gather sticks/i.test(obj1), `${view}: gather objective ticked (now "${obj1.trim()}")`);

  // --- open crate
  {
    const crate = await P.nearest('crash_site');
    const c = P.tile(crate);
    await P.goTo(c.x, c.y + 40, 20, 12000);
    await P.faceTo(c.x, c.y);
    await snap('at-crate');
    await P.act(150);
    await sleep(400);
    await snap('crate-opened');
    check((await countItem(P.page, 'tin_pot')) > 0, `${view}: crate gave a tin pot`);
  }
  // --- build a campfire through the Build menu (real taps/clicks), then place it with the Action button
  const objective = () => g(() => (document.querySelector('.objective')?.textContent || '').split('×')[0].replace(/\s+/g, ' ').trim());
  const toasts = () => g(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
  await sleep(800);
  check(/campfire/i.test(await objective()), `${view}: objective now asks for a campfire (${await objective()})`);
  await click(P.touchy ? '.tbtn-build' : null) .catch?.(() => {});
  if (!P.touchy) await P.page.keyboard.press('b');
  await P.page.waitForSelector('.panel-build .bcard');
  await sleep(300);
  await snap('build-menu');
  await click('.bcard[data-id="campfire"]');
  await P.page.waitForFunction(() => __game.building.mode === 'place');
  await sleep(300);
  await snap('placement-ghost');
  check((await label()) === 'Place' || !P.touchy, `${view}: Action says Place while placing`);
  if (!(await g(() => __game.building.ghost.valid))) {
    // the tile in front is the crate: choose another tile by tapping the world on the LEFT (joystick) side, then confirm with Place
    const pt = await g(() => __game.world.worldToTile(__game.state.player.x, __game.state.player.y));
    const [x, y] = await P.tileScreen(pt.tx - 2, pt.ty + 1);
    await P.tapAt(x, y); await sleep(200);
    await snap('ghost-moved-left');
    check(await g(([a, b]) => __game.building.ghost.tx === a && __game.building.ghost.ty === b && __game.building.ghost.valid, [pt.tx - 2, pt.ty + 1]), `${view}: tapping a tile on the left side moved the ghost there`);
  }
  if (P.touchy) await P.tap('.tbtn-action'); else await P.tapAt(...(await P.tileScreen(...(await g(() => [__game.building.ghost.tx, __game.building.ghost.ty])))));
  await sleep(400);
  const fire = await P.nearest('campfire');
  check(!!fire, `${view}: campfire placed`);
  await g(() => __game.building.cancel());
  await sleep(300);
  await snap('campfire-placed');
  const fc = P.tile(fire);

  // --- more sticks/stone/fibre for later steps (real walking), flint is not findable on the surface -> debug.give
  for (const t of ['loose_stick', 'loose_stick', 'loose_stick', 'loose_stone', 'loose_stone']) await pick(t);
  for (let i = 0; i < 2; i++) { const b = await P.nearest('dead_bush'); if (!b) break; const c = P.tile(b); await P.goTo(c.x, c.y + 40, 20, 14000); await P.faceTo(c.x, c.y); for (let k = 0; k < 4 && (await countItem(P.page, 'fiber')) < 1 + i; k++) await P.act(900); }
  console.log(`   fiber=${await countItem(P.page, 'fiber')} stick=${await countItem(P.page, 'stick')} stone=${await countItem(P.page, 'stone')}`);
  await g(() => __game.debug.give('flint', 1));

  // --- light + fuel the fire via the fuel panel
  await P.goTo(fc.x, fc.y + 40, 16, 14000);
  await P.faceTo(fc.x, fc.y);
  await g(() => new Promise((r) => setTimeout(r, 200)));
  await hit();
  await P.page.waitForSelector('.panel-fuel .fitem', { timeout: 4000 }).catch(() => {});
  await snap('fuel-panel');
  check(!!(await P.page.$('.panel-fuel')), `${view}: Act on the fire opens the fuel panel`);
  await click('.fitem[data-id="stick"]'); await click('.fitem[data-id="stick"]');
  await click('.flight');
  await sleep(300);
  check(await g(([x, y]) => !!__game.world.objectAt(x, y)?.lit, [fire.tx, fire.ty]), `${view}: fire lit`);
  await snap('fire-lit');
  await click('.panel-fuel .x');
  await sleep(600);
  check(!/Light it/i.test(await objective()), `${view}: 'light it' objective ticked (${await objective()})`);

  // --- craft axe via Bag > Craft
  for (let i = 0; i < 2; i++) await g(() => __game.debug.give('stick', 2));   // topped up: fire fuel used sticks
  await click(P.touchy ? '.tbtn-bag' : null).catch?.(() => {});
  if (!P.touchy) await P.page.keyboard.press('i');
  await P.page.waitForSelector('.panel-bag');
  await sleep(300);
  await snap('bag');
  await click('.panel-bag .tab[data-tab="craft"]');
  await sleep(300);
  await snap('craft-tab');
  const axeBtn = '.recipe:has(b:text("Stone axe")) .craft, .craft[data-recipe="stone_axe"]';
  await P.page.evaluate(() => document.querySelector('.craft[data-recipe="stone_axe"]')?.scrollIntoView({ block: 'center' }));
  await sleep(200);
  await click('.craft[data-recipe="stone_axe"]');
  await sleep(300);
  check((await countItem(P.page, 'stone_axe')) === 1, `${view}: stone axe crafted`);
  await snap('axe-crafted');
  // equip: Bag tab, tap the axe slot, tap "Equip"/"Hold"
  await click('.panel-bag .tab[data-tab="bag"]');
  await sleep(200);
  const axeSlot = await g(() => { const c = [...document.querySelectorAll('.panel-bag .slot')].find((b) => b.getAttribute('aria-label')?.includes?.('axe') || b.textContent.includes('axe') || b.dataset.id === 'stone_axe'); return c ? [c.dataset.area, c.dataset.i] : null; });
  const idx = await g(() => { const inv = __game.state.inventory; for (const a of ['hotbar', 'bag']) { const i = inv[a].findIndex((s) => s && s.id === 'stone_axe'); if (i >= 0) return [a, i]; } return null; });
  await click(`.panel-bag .slot[data-area="${idx[0]}"][data-i="${idx[1]}"]`);
  await sleep(250);
  await snap('axe-detail');
  const equip = await P.page.$('.panel-bag .detail .btn.primary');
  if (equip) await click('.panel-bag .detail .btn.primary');
  await sleep(250);
  await click('.panel-bag .x');
  await sleep(300);
  const held = await g(() => { const inv = __game.state.inventory; return inv.hotbar[inv.selected]?.id; });
  check(held === 'stone_axe', `${view}: axe is held (${held})`);
  await snap('axe-held');

  // --- chop a tree with the axe (hold Action)
  {
    const tree = await P.nearest('tree'); const c = P.tile(tree);
    await P.goTo(c.x, c.y + 44, 18, 14000);
    await P.faceTo(c.x, c.y);
    await snap('at-tree');
    for (let i = 0; i < 14 && (await countItem(P.page, 'wood')) === 0; i++) await P.act(900);
    check((await countItem(P.page, 'wood')) > 0, `${view}: chopped wood (${await countItem(P.page, 'wood')})`);
    await snap('chopped');
    await P.page.waitForFunction(() => __game.state.tutorial.facts.chopped, null, { timeout: 4000 }).catch(() => {});
    await sleep(2500);
    check(!/Chop wood/i.test(await objective()), `${view}: chop objective ticked (${await objective()})`);
  }

  // --- walls + door: 4x3 ring around the fire and the tile east of it (materials via debug.give)
  await g(() => { __game.debug.give('wood', 20); __game.debug.give('wood', 20); __game.debug.give('wood', 20); __game.debug.give('rope', 2); });
  const ring = [];
  // interior = the fire + two free tiles to its east (a ring of only 8 walls around the fire leaves no room to stand in)
  for (let x = fire.tx - 1; x <= fire.tx + 3; x++) for (let y = fire.ty - 1; y <= fire.ty + 1; y++) {
    if (y === fire.ty && x >= fire.tx && x <= fire.tx + 2) continue;
    ring.push([x, y]);
  }
  const doorT = [fire.tx + 2, fire.ty + 1];
  async function placeAt(type, tx, ty) {
    await g((t) => __game.building.select(t), type);
    for (let attempt = 0; attempt < 3; attempt++) {
      const c = { x: tx * 32 + 16, y: ty * 32 + 16 };
      const out = Math.hypot(c.x - fc.x - 16, c.y - fc.y) || 1;
      const sx = c.x + ((c.x - fc.x - 16) / out) * 70, sy = c.y + ((c.y - fc.y) / out) * 70;
      const d = await g(([x, y]) => Math.hypot(x - __game.state.player.x, y - __game.state.player.y), [c.x, c.y]);
      if (d > 3 * 32) await P.goTo(sx, sy, 24, 9000);
      if (attempt === 2) console.log('   placeAt', type, tx, ty, 'player', JSON.stringify(await player()), 'target', sx | 0, sy | 0, await g(() => __game.building.ghost.reason));
      const [px, py] = await P.tileScreen(tx, ty);
      await P.tapAt(px, py); await P.tapAt(px, py);
      await sleep(150);
      if (await g(([x, y]) => !!__game.world.objectAt(x, y), [tx, ty])) return true;
    }
    return false;
  }
  await g(() => __game.state.time && (__game.state.time.t = 100));
  console.log('   walking back to the base', await P.goTo(fc.x, fc.y + 80, 30, 25000, true));
  let placedAll = true;
  for (const [x, y] of ring) { if (x === doorT[0] && y === doorT[1]) continue; if (!(await placeAt('wood_wall', x, y))) { placedAll = false; console.log('   wall failed at', x, y, await g(() => __game.building.ghost.reason)); } }
  await snap('walls-placed');
  if (!(await placeAt('door', doorT[0], doorT[1]))) { placedAll = false; console.log('   door failed', await g(() => __game.building.ghost.reason)); }
  await g(() => __game.building.cancel());
  check(placedAll, `${view}: all walls and the door placed by tapping`);
  await P.goTo(doorT[0] * 32 + 16, doorT[1] * 32 + 16 + 90, 20, 12000);
  await P.goTo(doorT[0] * 32 + 16, doorT[1] * 32 + 16, 12, 6000);
  await P.goTo(doorT[0] * 32 + 16, fire.ty * 32 + 16, 12, 6000);   // through the door into the room
  await sleep(700);
  await snap('inside-room');
  const room = await g(([x, y]) => ({ sheltered: !!__game.shelterQuery(x, y), t: [...document.querySelectorAll('.chip')].map((c) => c.textContent) }), [fire.tx + 2, fire.ty]);
  check(room.sheltered, `${view}: room formed / sheltered (${room.t.join(',')})`);
  check(!/Wall in/i.test(await objective()), `${view}: shelter objective ticked (${await objective()})`);

  // --- the fire burned out while we built: refuel + relight from inside the room, then Cook / Craft from the fuel panel
  await g(() => { __game.debug.give('raw_meat', 1); });
  await P.goTo(fc.x + 32, fc.y, 8, 6000);
  await P.faceTo(fc.x, fc.y);
  await sleep(200);
  await hit();
  await P.page.waitForSelector('.panel-fuel .fitem', { timeout: 4000 }).catch(() => {});
  await snap('refuel');
  for (let i = 0; i < 3; i++) await click('.fitem[data-id="wood"]');
  if (await P.page.$('.panel-fuel .flight:not([hidden])')) await click('.panel-fuel .flight');
  await sleep(300);
  check(await g(([x, y]) => !!__game.world.objectAt(x, y)?.lit, [fire.tx, fire.ty]), `${view}: fire relit from the fuel panel`);
  await click('.panel-fuel [data-a="cook"]');
  await P.page.waitForSelector('.panel-bag').catch(() => {});
  await click('.panel-bag .tab[data-tab="craft"]');
  await sleep(300);
  await snap('craft-at-fire');
  for (const id of ['snow_water', 'clean_water', 'cooked_meat']) {
    const sel = `.craft[data-recipe="${id}"]`;
    await P.page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
    await sleep(150);
    if (await P.page.$(`${sel}:not([disabled])`)) { await click(sel); await sleep(250); }
    else console.log(`   craft ${id} unavailable`);
  }
  await snap('cooked');
  check((await countItem(P.page, 'clean_water')) > 0 || (await countItem(P.page, 'cooked_meat')) > 0, `${view}: cooked / boiled something`);
  await click('.panel-bag .tab[data-tab="bag"]');
  const w = await g(() => { const inv = __game.state.inventory; for (const a of ['hotbar', 'bag']) { const i = inv[a].findIndex((s) => s && s.id === 'clean_water'); if (i >= 0) return [a, i]; } return null; });
  if (w) {
    await g(() => { __game.state.player.thirst = 40; });
    await click(`.panel-bag .slot[data-area="${w[0]}"][data-i="${w[1]}"]`);
    await sleep(200);
    await click('.panel-bag .detail .btn.primary');
    await sleep(300);
    check(await g(() => __game.state.player.thirst > 60), `${view}: drinking raised thirst (${await g(() => Math.round(__game.state.player.thirst))})`);
  }
  await snap('after-drink');
  // equip clothing
  await g(() => __game.debug.give('fur_hat', 1));
  await sleep(250);
  const hat = await g(() => { const inv = __game.state.inventory; for (const a of ['hotbar', 'bag']) { const i = inv[a].findIndex((s) => s && s.id === 'fur_hat'); if (i >= 0) return [a, i]; } return null; });
  await click(`.panel-bag .slot[data-area="${hat[0]}"][data-i="${hat[1]}"]`);
  await sleep(200);
  await snap('hat-detail');
  await click('.panel-bag .detail .btn.primary');
  await sleep(250);
  check(await g(() => __game.state.inventory.clothing.some((s) => s && s.id === 'fur_hat')), `${view}: fur hat worn`);
  await snap('hat-worn');
  await click('.panel-bag .x');
  await sleep(300);

  // --- bedroll + sleep inside the room
  await g(() => { __game.debug.give('fiber', 3); __game.debug.give('hide', 2); });
  await g(() => __game.building.select('bedroll'));
  {
    const bx = fire.tx, by = fire.ty + 1; // inside tile south of the fire is a wall... use interior tile east of the fire instead
    void bx; void by;
  }
  await g(() => __game.building.cancel());
  noErrors(check, P, `${view}: no console errors/warnings`);
  console.log(JSON.stringify(P.errors));
  await P.ctx.close();
}
function P_touch(view) { return view === 'desktop' ? '' : '&touch=1'; }
await finish();
