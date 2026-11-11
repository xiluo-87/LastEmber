// Structure behaviours (DESIGN §8): fires (campfire / furnace / torch post), workbench, chest, drying rack, snare, fishing hole,
// radio-tower stub. Providers into the survival / crafting / lighting seams, interaction handlers, timers.
// Timers advance in GAME seconds (dt * state.time.speed) so sleeping (x12) burns fuel and dries meat correctly.
// Panels: ui/panels/fuel.js, chest.js.  Pure rules: logic/structures.js.   API: game.structures (see below).
import { TILE, BUILDING, WEATHER } from '../data/balance.js';
import { STRUCTURES } from '../data/structures.js';
import { ITEMS } from '../data/items.js';
import { has, remove, count, canAdd } from '../logic/inventory.js';
import { addFuel, autoLight, tryLight, burnFuel, rackLoad, rackTick, rackCollect, rackDone, rackCount, snareRoll, fishingRoll, repairOnce, repairItem, fuelSeconds } from '../logic/structures.js';
import { giveOrDrop, litFires, nearPlayer, isSheltered } from './building.js';
import { drawRing } from '../render/structurefx.js';
import { chipBurst, floatText } from '../render/gatherfx.js';

const FIRE_TYPES = ['campfire', 'furnace', 'torch_post'];
const heatPool = [];

function fireOut(game, o) {
  const def = STRUCTURES[o.type];
  game.events.emit('fire:out', { type: o.type, tx: o.tx, ty: o.ty });
  if (nearPlayer(game, o.tx, o.ty)) game.ui.toast?.(o.type === 'torch_post' ? 'Your torch post burnt out' : `Your ${o.type === 'campfire' ? 'fire' : def.name.toLowerCase()} went out`, 'bad', 3200);
}

export default {
  name: 'structures',
  init(game) {
    const S = game.structures = {
      cast: null, lowFuel: null,
      /** Put one `itemId` from the bag into a fire's fuel. -> {ok, reason?} */
      addFuel(obj, itemId) {
        if (!has(game.state.inventory, itemId, 1)) return { ok: false, reason: `No ${ITEMS[itemId].name.toLowerCase()}` };
        const r = addFuel(obj, itemId);
        if (!r.ok) { game.ui.toast?.(r.reason, 'bad', 1500); return r; }
        remove(game.state.inventory, itemId, 1);
        if (autoLight(obj)) lit(game, obj);
        return r;
      },
      light(obj) {
        const r = tryLight(obj, game.state.inventory);
        if (!r.ok) { game.ui.toast?.(r.reason, 'bad', 2200); return r; }
        lit(game, obj); return r;
      },
      repair(obj) {
        const r = repairOnce(obj, game.state.inventory);
        if (!r.ok) game.ui.toast?.(r.reason, 'bad', 2000); else game.ui.toast?.(`Repaired ${STRUCTURES[obj.type].name.toLowerCase()}`, 'good', 1400);
        return r;
      },
      startCast(obj) { return startCast(game, obj); },
      cancelCast(msg) { if (S.cast) { S.cast = null; if (msg) game.ui.toast?.(msg, 'info', 1600); } },
    };

    // ---- providers (survival heat, crafting stations, light)
    game.heatProviders.push((g, push) => {
      let n = 0;
      for (const type of ['campfire', 'furnace']) {
        const def = STRUCTURES[type];
        for (const o of g.building.list(type)) {
          if (!o.lit) continue;
          const c = g.world.tileCenter(o.tx, o.ty), h = heatPool[n] || (heatPool[n] = { x: 0, y: 0, heat: 0, radius: 0 });
          h.x = c.x; h.y = c.y; h.heat = def.heat.peak; h.radius = def.heat.radius; push(h); n++;
        }
      }
    });
    game.stationProviders.push((g) => {
      const out = [], p = g.state.player, R = BUILDING.stationRadius;
      const near = (type, r, needLit) => { for (const o of g.building.list(type)) { if (needLit && !o.lit) continue; if (Math.hypot(o.tx * TILE + 16 - p.x, o.ty * TILE + 16 - p.y) / TILE <= r) return true; } return false; };
      if (near('workbench', R.workbench)) out.push('workbench');
      if (near('campfire', R.campfire, true)) out.push('campfire');
      if (near('furnace', R.furnace, true)) out.push('furnace');
      return out;
    });

    // ---- interactions
    const I = game.interactions, openPanel = (id, t) => game.ui.panels.open(id, { tx: t.obj.tx, ty: t.obj.ty });
    I.register(FIRE_TYPES, {
      label: (g, t) => (t.obj.lit ? 'Tend fire' : t.obj.type === 'torch_post' ? 'Refuel' : t.obj.fuel > 0 ? 'Light fire' : 'Add fuel'),
      onAction: (g, t) => { openPanel('fuel', t); }, cooldown: 0.3,
    });
    I.register('workbench', { label: () => 'Craft', onAction: (g) => { g.ui.openCraft?.(); }, cooldown: 0.3 });
    I.register('chest', { label: () => 'Open', onAction: (g, t) => { openPanel('chest', t); }, cooldown: 0.3 });
    I.register('drying_rack', {
      label: (g, t) => (rackDone(t.obj) ? 'Collect jerky' : rackCount(t.obj) < t.obj.slots.length && has(g.state.inventory, 'raw_meat') ? 'Hang meat' : 'Drying rack'),
      cooldown: 0.3,
      onAction(g, t) {
        const o = t.obj, inv = g.state.inventory;
        if (rackDone(o)) {
          const n = rackCollect(o); giveOrDrop(g, 'jerky', n);
          g.ui.toast?.(`+${n} jerky`, 'good', 1600); const c = g.world.tileCenter(o.tx, o.ty); if (g.gatherFx) floatText(g, c.x, c.y - 10, `+${n} jerky`, '#ffd9a0'); return;
        }
        if (rackCount(o) >= o.slots.length) { g.ui.toast?.('Rack is full — jerky takes 2 minutes', 'info', 2200); return false; }
        if (!remove(inv, 'raw_meat', 1)) { g.ui.toast?.('Needs raw meat', 'bad', 1800); return false; }
        rackLoad(o); g.ui.toast?.(`Hung raw meat (${rackCount(o)}/${o.slots.length})`, 'good', 1400);
      },
    });
    I.register('snare', {
      label: (g, t) => (t.obj.caught ? 'Collect' : 'Snare'), cooldown: 0.3,
      onAction(g, t) {
        const o = t.obj;
        if (!o.caught) { g.ui.toast?.('Empty. Snares catch rabbits by dawn.', 'info', 2200); return false; }
        o.caught = false;
        for (const d of STRUCTURES.snare.extra.drops) giveOrDrop(g, d.item, d.n);
        g.ui.toast?.('Caught a rabbit: +1 raw meat, +1 hide', 'good', 2400);
        g.events.emit('snare:collected', { tx: o.tx, ty: o.ty });
      },
    });
    I.register('fishing_hole', {
      label: () => (S.cast ? 'Reel in' : 'Fish'), cooldown: 0.3,
      onAction(g, t) { if (S.cast) { S.cancelCast('You reel in the line'); return; } return startCast(g, t.obj) ? undefined : false; },
    });
    I.register('radio_tower', {   // endgame stub: the endgame engineer registers a higher-priority handler for this type
      label: () => 'Operate', cooldown: 0.5,
      onAction(g, t) { g.events.emit('radio:interact', { obj: t.obj }); g.ui.toast?.('The radio tower is built, but it is not ready to transmit yet.', 'info', 3000); },
    });

    // ---- events
    game.events.on('time:newDay', () => {
      const f = litFires(game);
      for (const o of game.building.list('snare')) {
        const near = f.some((x) => Math.hypot(x.tx - o.tx, x.ty - o.ty) < STRUCTURES.snare.minFireDist);
        if (snareRoll(o, near, Math.random())) {
          game.events.emit('snare:caught', { tx: o.tx, ty: o.ty });
          if (nearPlayer(game, o.tx, o.ty, 14)) game.ui.toast?.('Something is caught in your snare', 'good', 2800);
        }
      }
    });
    game.events.on('player:damaged', () => S.cancelCast('Your line goes slack'));
  },
  onLoad(game) { game.structures.cast = null; game.structures.lowFuel = null; },
  update(game, dt) {
    if (game.mode !== 'playing') return;
    const B = game.building, S = game.structures, st = game.state, gdt = dt * (st.time.speed || 1);
    // fires
    let nearest = null, nd = Infinity;
    const p = st.player;
    for (const type of FIRE_TYPES) for (const o of B.list(type)) {
      if (!o.lit) continue;
      const mult = type === 'torch_post' ? 1 : game.weather.fuelMult(isSheltered(game, o.tx, o.ty));
      if (burnFuel(o, gdt, mult) === 'out') { fireOut(game, o); continue; }
      const d = Math.hypot(o.tx * TILE + 16 - p.x, o.ty * TILE + 16 - p.y) / TILE;
      if (d < nd) { nd = d; nearest = o; }
    }
    S.lowFuel = nearest && nd <= BUILDING.noticeRadius && nearest.fuel < BUILDING.lowFuelSeconds ? { secs: nearest.fuel, type: nearest.type, tx: nearest.tx, ty: nearest.ty } : null;
    // drying racks
    for (const o of B.list('drying_rack')) {
      const before = rackDone(o);
      rackTick(o, gdt);
      if (rackDone(o) > before && nearPlayer(game, o.tx, o.ty, 12)) game.ui.toast?.('Jerky is ready', 'good', 2200);
    }
    // fishing cast
    if (S.cast) {
      const c = S.cast, hole = game.world.objectAt(c.tx, c.ty);
      const hx = c.tx * TILE + 16, hy = c.ty * TILE + 16;
      if (!hole || hole.type !== 'fishing_hole') S.cast = null;
      else if (Math.hypot(hx - p.x, hy - p.y) > TILE * 1.9) S.cancelCast('You walked away from the hole');
      else {
        c.t += dt;
        if (c.t >= STRUCTURES.fishing_hole.extra.castSeconds) { S.cast = null; resolveCast(game, hole); }
      }
    }
  },
  lights(game, push) {
    const B = game.building; if (!B) return;
    for (const type of FIRE_TYPES) {
      const def = STRUCTURES[type];
      for (const o of B.list(type)) {
        if (!o.lit) continue;
        const f = type === 'torch_post' ? 0.6 + 0.4 * Math.min(1, o.fuel / 40) : 1;      // a dying torch post shrinks a little
        push({ x: o.tx * TILE + 16, y: o.ty * TILE + (type === 'torch_post' ? -2 : 18), radius: def.light.radius * f, flicker: def.light.flicker, color: type === 'furnace' ? '255,130,50' : '255,150,55', glowIntensity: type === 'torch_post' ? 2.2 : 3.2, warm: type === 'torch_post' ? 0.7 : 1 });
      }
    }
  },
  drawScreen(game, ctx) {
    const c = game.structures?.cast; if (!c || !game.renderer) return;
    const s = game.renderer.worldToScreen(c.tx * TILE + 16, c.ty * TILE - 6), sc = game.camera.scale;
    drawRing(ctx, s.x, s.y, 16 * sc, c.t / STRUCTURES.fishing_hole.extra.castSeconds, '#7fd1ff');
    ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8f6ff'; ctx.strokeStyle = 'rgba(8,14,20,0.85)'; ctx.lineWidth = 3;
    ctx.strokeText('Fishing…', s.x, s.y - 24 * sc); ctx.fillText('Fishing…', s.x, s.y - 24 * sc);
  },
};

function lit(game, o) {
  game.events.emit('fire:lit', { type: o.type, tx: o.tx, ty: o.ty });
  const c = game.world.tileCenter(o.tx, o.ty);
  if (game.gatherFx) chipBurst(game, c.x, c.y, '#ffbf69', 8);
  game.ui.toast?.(o.type === 'campfire' ? 'The fire catches' : `${STRUCTURES[o.type].name} is lit`, 'good', 1600);
}

function startCast(game, obj) {
  const S = game.structures;
  if (S.cast) return false;
  if (!canAdd(game.state.inventory, 'raw_fish', 1)) { game.ui.toast?.('Bag full', 'bad'); return false; }
  S.cast = { tx: obj.tx, ty: obj.ty, t: 0 };
  game.ui.toast?.('You cast a line…', 'info', 1400);
  return true;
}
function resolveCast(game, hole) {
  const r = fishingRoll(Math.random());
  if (r === 'fish') {
    giveOrDrop(game, 'raw_fish', 1); game.ui.toast?.('You caught a fish!', 'good', 2200);
    const c = game.world.tileCenter(hole.tx, hole.ty); if (game.gatherFx) floatText(game, c.x, c.y - 8, '+1 raw fish', '#bfe6ff');
  } else if (r === 'snap') game.ui.toast?.('The line snapped!', 'bad', 2200);
  else game.ui.toast?.('Nothing bites.', 'info', 1800);
  game.events.emit('fishing:result', { result: r, tx: hole.tx, ty: hole.ty });
}
export { fuelSeconds, count as _count, WEATHER as _W };
