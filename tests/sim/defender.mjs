// Shared "stay inside and hold the line" policy: used by the late-game scenario harness (scenarios.mjs) and by the competent bot's night routine.
// It is deliberately SIMPLE (a thinking human does better): never leaves the walls, spears/shoots what comes within reach, repairs and rebuilds
// walls between lunges, feeds the fire, bandages, eats and drinks. All actions go through the real input / item / structure APIs.
//   const def = createDefender(game, core, base, { bow, rebuild });  base = { cx, cy, d (wall ring distance from the fire), layout() -> [[type,tx,ty]] }
//   def.think() -> 'vitals' | 'fuel' | 'rebuild' | 'fight' | 'repair' | 'idle'   (call at 10 Hz while the base is under threat)
import { TILE } from '../../src/data/balance.js';
import { STRUCTURES } from '../../src/data/structures.js';
import { tileDist } from './nav.mjs';

export function createDefender(game, core, base, cfg = {}) {
  const nav = core.nav, P = () => game.state.player, W = () => game.world;
  const d = base.d, has = (i, n = 1) => core.has(i, n);
  const interior = [];
  for (let dx = -(d - 1); dx <= d - 1; dx++) for (let dy = -(d - 1); dy <= d - 1; dy++) interior.push({ tx: base.cx + dx, ty: base.cy + dy });
  const walkable = (x, y) => nav.walkable(x, y);
  const fire = () => { const o = W().objectAt(base.cx, base.cy); return o && o.type === 'campfire' ? o : null; };
  const st = { repT: 0, acts: { attack: 0, repair: 0, shoot: 0, fuel: 0, bandage: 0, rebuild: 0 } };
  const hpFrac = (o) => (o.hp ?? STRUCTURES[o.type].hp) / STRUCTURES[o.type].hp;
  const MAT = { wood_wall: 'wood', stone_wall: 'stone', door: 'wood', spike_barricade: 'wood', radio_tower: 'iron_ingot', workbench: 'wood' };

  function goInside(key, tx, ty) {
    const me = core.tile();
    if (me.tx === tx && me.ty === ty) { nav.stop(); return true; }
    nav.goTo(key, (x, y) => x === tx && y === ty); return false;
  }
  function nearestInterior(tx, ty) { let best = interior[0], bd = 1e9; for (const t of interior) { if (!walkable(t.tx, t.ty)) continue; const dd = tileDist(t.tx, t.ty, tx, ty); if (dd < bd) { bd = dd; best = t; } } return [best.tx, best.ty]; }
  function damaged(maxFrac) {
    let worst = null;
    for (const o of game.building.listAll()) {
      const m = MAT[o.type]; if (!m || !has(m)) continue;
      if (tileDist(o.tx, o.ty, base.cx, base.cy) > d + 2.5 || hpFrac(o) > maxFrac) continue;
      const [ix, iy] = nearestInterior(o.tx, o.ty);
      if (tileDist(ix, iy, o.tx, o.ty) > 1.85) continue;        // not reachable from inside the walls (outer spikes are daytime work)
      if (!worst || hpFrac(o) < hpFrac(worst)) worst = o;
    }
    return worst;
  }
  function repairStep(o) {
    const [bx, by] = nearestInterior(o.tx, o.ty);
    if (core.distTilesTo(o.tx, o.ty) > 1.9) { goInside(`rep:${bx},${by}`, bx, by); return true; }
    nav.stop();
    if (game.time >= st.repT) { st.repT = game.time + 0.45; if (game.structures.repair(o).ok) st.acts.repair++; }
    return true;
  }
  function rebuildStep() {          // put a missing wall/door back (not spikes/posts: those are daytime work)
    for (const [types, tx, ty] of base.layout()) {
      const alts = Array.isArray(types) ? types : [types];
      if (alts[0] === 'spike_barricade' || alts[0] === 'torch_post') continue;
      const o = W().objectAt(tx, ty);
      if (o && o.type === 'dropped_item') { if (core.distTilesTo(tx, ty) > 1.2) { goInside(`pick:${tx},${ty}`, ...nearestInterior(tx, ty)); return true; } core.work(o, { press: true }); return true; }
      if (o) continue;
      const type = alts.find((t) => core.canAfford(t));
      if (!type) continue;
      if (core.distTilesTo(tx, ty) > 2.6) { goInside(`rb:${tx},${ty}`, ...nearestInterior(tx, ty)); return true; }
      nav.stop();
      if (game.building.validate(type, tx, ty).ok && core.place(type, tx, ty)) { st.acts.rebuild++; return true; }
      return false;
    }
    return false;
  }
  const hostiles = () => core.hostiles(14).filter((h) => h.c.type === 'wolf');
  const LOS = (c) => { const p = P(); const n = Math.ceil(Math.hypot(c.x - p.x, c.y - p.y) / 8); for (let i = 1; i < n; i++) if (W().isBlockedAtPx(p.x + ((c.x - p.x) * i) / n, p.y + ((c.y - p.y) * i) / n)) return false; return true; };

  function think() {
    const p = P();
    if (game.sleep?.active) return 'sleep';
    if (p.status?.bleeding && has('bandage')) { core.use('bandage'); st.acts.bandage++; return 'vitals'; }
    if (p.hunger < 45) for (const f of ['cooked_meat', 'jerky', 'cooked_fish']) if (has(f)) { core.use(f); return 'vitals'; }
    if (p.thirst < 45) {
      for (const dr of ['clean_water', 'herbal_tea']) if (has(dr)) { core.use(dr); return 'vitals'; }
      if (p.thirst < 18 && has('snow_water')) { core.use('snow_water'); return 'vitals'; }
      const f0 = fire();
      if (f0 && f0.lit && has('tin_pot')) {                      // melt and boil snow at the fire (instant craft, needs to stand beside it)
        if (core.distTilesTo(f0.tx, f0.ty) > 2.2) { goInside('drink', f0.tx, f0.ty + 1); return 'vitals'; }
        if (has('snow_water') && core.canCraft('clean_water')) { core.craft('clean_water'); return 'vitals'; }
        if (core.canCraft('snow_water')) { core.craft('snow_water'); return 'vitals'; }
      }
    }
    if (p.hunger < 40 && has('raw_meat') && fire()?.lit && core.canCraft('cooked_meat')) { if (core.distTilesTo(base.cx, base.cy) > 2.2) goInside('cook', base.cx, base.cy + 1); else core.craft('cooked_meat'); return 'vitals'; }
    const near = hostiles().filter((h) => h.d <= 9);
    const f = fire();
    if (f && (has('wood') || has('stick')) && ((f.fuel < 260 && !(near.length && near[0].d < 3.2)) || f.fuel < 100)) {
      if (core.distTilesTo(f.tx, f.ty) > 2.4) { goInside('fuel', f.tx, f.ty + 1); return 'fuel'; }
      for (let i = 0; i < 6; i++) { const it = has('wood') ? 'wood' : 'stick'; if (!game.structures.addFuel(f, it).ok) break; }
      if (!f.lit && f.fuel > 0) game.structures.light(f);
      st.acts.fuel++; return 'fuel';
    }
    if (cfg.rebuild !== false && !(near.length && near[0].d < 2.4) && rebuildStep()) return 'rebuild';
    if (near.length) {
      const { c, d: dist } = near[0];
      const bow = cfg.bow && has('arrow') && dist >= 2.4 && dist <= 6.3 && LOS(c);
      if (bow) { core.hold('bow'); nav.stop(); p.facing = Math.atan2(c.y - p.y, c.x - p.x); core.act(true, true); st.acts.shoot++; return 'fight'; }
      core.hold('spear');
      if (dist <= 2.15) {                                       // reach 1.8 + wolf radius: works through a wall
        const w = damaged(0.35); if (w && tileDist(w.tx, w.ty, c.x / TILE, c.y / TILE) < 2.2 && core.distTilesTo(w.tx, w.ty) < 2.2) { repairStep(w); return 'repair'; }
        nav.stop(); p.facing = Math.atan2(c.y - p.y, c.x - p.x); core.act(true, true); st.acts.attack++; return 'fight';   // face, do not walk: a breach must not pull the defender out
      }
      const w = damaged(0.5); if (w) { repairStep(w); return 'repair'; }
      let best = null, bd = 1e9;
      for (const tl of interior) { if (!walkable(tl.tx, tl.ty)) continue; const dd = Math.hypot(tl.tx * TILE + 16 - c.x, tl.ty * TILE + 16 - c.y); if (dd < bd) { bd = dd; best = tl; } }
      if (best && bd / TILE > 1.6) { core.act(false); goInside('react', best.tx, best.ty); return 'fight'; }
      core.act(false); nav.stop(); return 'fight';
    }
    core.act(false);
    const w = damaged(0.8); if (w) { repairStep(w); return 'repair'; }
    if (core.distTilesTo(base.cx, base.cy) > 1.9) goInside('home', base.cx, base.cy + 1); else nav.stop();
    return 'idle';
  }
  return { think, st };
}
