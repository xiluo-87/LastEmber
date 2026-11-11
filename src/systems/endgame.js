// Endgame (DESIGN §10): radio tower signal phase, enraged wolf waves, compass markers, rescue sequence -> victory.
// Pure rules in logic/endgame.js; numbers in data/balance.js ENDGAME. State slice state.endgame (see defaultEndgame).
//
// API  game.endgame = { markers(), tower(), powered(), setTransmitting(bool), progress(), nightLength(), rescue (runtime|null),
//                       startRescue(), debug: { forceVictory() } }
// Events emitted:  'radio:transmit' {on}  'signal:night' {counted, nights, done}  'signal:wave' {index, size}  'signal:lost' {}
//   'tower:destroyed' {tx,ty}  'rescue:arriving' {}  'rescue:flyover' {}  'rescue:done' {}
// Listens: 'radio:interact' (own interaction registered at priority 10 opens the 'tower' panel), 'structure:destroyed|removed' (radio_tower),
//   'structure:placed', 'fire:lit', 'time:newDay'.
import { ENDGAME } from '../data/balance.js';
import { nightLength } from '../logic/clock.js';
import {
  defaultEndgame, isPowered, tickSignal, finishNight, resetSignal, signalProgress, waveSizes, nextWaveDue,
  updateSeen, visibleWrecks, edgeMarker, wreckKey, tilesBetween,
} from '../logic/endgame.js';
import { count } from '../logic/inventory.js';
import { spawnPack } from './creatures.js';
import { litFires } from './building.js';

const RESCUE = ENDGAME.rescue;
const E = (game) => game.state.endgame;

function findTower(game) {
  const l = game.building?.list?.('radio_tower');   // a Set (or empty iterable)
  if (l) for (const o of l) return o;
  return null;
}

function wreckList(game) {
  const out = [];
  for (const p of game.world.pois()) {
    if (p.type !== 'wreckage') continue;
    const o = game.world.objectAt(p.tx, p.ty);
    out.push({ tx: p.tx, ty: p.ty, looted: !o || !!o.partTaken || !!o.depleted });
  }
  return out;
}

function freeTilesNear(game, tx, ty, n) {
  const w = game.world, out = [];
  for (let r = 0; r <= 4 && out.length < n; r++) {
    for (let dy = -r; dy <= r && out.length < n; dy++) for (let dx = -r; dx <= r && out.length < n; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (w.inBounds(x, y) && !w.objectAt(x, y) && !w.isBlocked(x, y) && !out.some((t) => t.tx === x && t.ty === y)) out.push({ tx: x, ty: y });
    }
  }
  return out;
}

/** Destroyed tower: its three radio parts drop as pickups around it and the signal progress resets. */
function onTowerLost(game, tx, ty, destroyed) {
  const eg = E(game), had = eg.transmitting || eg.nights > 0 || eg.poweredSecs > 0;
  resetSignal(eg);
  if (destroyed) {
    const tiles = freeTilesNear(game, tx, ty, 3);
    ['radio_antenna', 'radio_battery', 'radio_circuit'].forEach((id, i) => {
      const t = tiles[i]; if (t) game.world.setObject(t.tx, t.ty, { type: 'dropped_item', variant: 0, stack: { id, n: 1 } });
    });
    game.ui.toast?.('The radio tower fell. Its parts lie in the snow.', 'bad', 3600);
  }
  if (had || destroyed) game.events.emit('signal:lost', {});
  if (destroyed) game.events.emit('tower:destroyed', { tx, ty });
}

function startRescue(game) {
  const rt = game.endgameRt;
  if (rt.rescue) return;
  const eg = E(game);
  eg.transmitting = false; eg.rescuePending = true;
  game.state.time.speed = 1;
  game.sleep?.wake?.('dawn');
  rt.rescue = { t: 0, flew: false };
  game.events.emit('rescue:arriving', {});
}

function drawPlane(ctx, x, y, size, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); const s = size / 100;
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(58, 0); ctx.quadraticCurveTo(40, -6, 6, -7);          // nose -> wing root
  ctx.lineTo(-4, -46); ctx.lineTo(-17, -46); ctx.lineTo(-12, -8);   // right wing
  ctx.lineTo(-44, -6); ctx.lineTo(-52, -20); ctx.lineTo(-60, -20); ctx.lineTo(-56, 0);   // tail
  ctx.lineTo(-60, 20); ctx.lineTo(-52, 20); ctx.lineTo(-44, 6); ctx.lineTo(-12, 8);
  ctx.lineTo(-17, 46); ctx.lineTo(-4, 46); ctx.lineTo(6, 7); ctx.quadraticCurveTo(40, 6, 58, 0);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/** Compass markers in screen space (css px): wreckage + home. Computed on demand by ui/compass.js each frame. */
function computeMarkers(game, out = []) {
    out.length = 0;
  const st = game.state, eg = st?.endgame, rt = game.endgameRt, R = game.renderer, v = game.view;
  if (!eg || !R || !v || game.mode !== 'playing') return out;
  const hasMap = count(st.inventory, 'flight_map') > 0;
  const p = st.player, touch = document.body.classList.contains('touch'), inset = { top: 56, bottom: touch ? 96 : 76, left: 0, right: 0 };
  const place = (kind, key, tx, ty, label) => {
    const c = game.world.tileCenter(tx, ty), s = R.worldToScreen(c.x, c.y);
    const m = edgeMarker(s.x, s.y, v.w, v.h, ENDGAME.markerPad, inset);
    if (m && touch && m.x > v.w - ENDGAME.touchBox.w && m.y > v.h - ENDGAME.touchBox.h) {   // keep clear of the Action/Bag/Build/Use cluster
      const up = m.y - (v.h - ENDGAME.touchBox.h), left = m.x - (v.w - ENDGAME.touchBox.w);
      if (up <= left) m.y = v.h - ENDGAME.touchBox.h; else m.x = v.w - ENDGAME.touchBox.w;
    }
    if (m) out.push({ kind, key, x: m.x, y: m.y, angle: m.angle, dist: tilesBetween(p.x, p.y, c.x, c.y), label });
  };
  for (const w of visibleWrecks(rt.wrecks, eg.seen, hasMap)) place('wreck', wreckKey(w), w.tx, w.ty, 'Wreck');
  if (eg.home) {
    const o = game.world.objectAt(eg.home.tx, eg.home.ty);
    if (o && o.type === 'campfire') place('home', 'home', eg.home.tx, eg.home.ty, 'Home');
  }
  return out;
}

export default {
  name: 'endgame',
  defaults: defaultEndgame,
  init(game) {
    game.endgameRt = { t: 0, powered: false, outage: false, rescue: null, markers: [], wrecks: [], wreckT: 0 };
    const rt = game.endgameRt;
    game.endgame = {
      tower: () => findTower(game),
      powered: () => rt.powered,
      nightLength: () => nightLength(game.state.time.day),
      progress: () => signalProgress(E(game), nightLength(game.state.time.day)),
      get rescue() { return rt.rescue; },
      startRescue: () => startRescue(game),
      setTransmitting(on) {
        const eg = E(game);
        if (on && !findTower(game)) return false;
        if (eg.transmitting === !!on) return eg.transmitting;
        eg.transmitting = !!on; eg.warned = false;
        game.events.emit('radio:transmit', { on: eg.transmitting });
        return eg.transmitting;
      },
      markers: () => computeMarkers(game, rt.markers),
      debug: { forceVictory() { const eg = E(game); eg.nights = ENDGAME.signalNights; eg.rescuePending = true; startRescue(game); } },
    };
    game.hudChips = game.hudChips || [];
    game.hudChips.push((g) => {
      const eg = g.state?.endgame;
      return eg?.transmitting && !rt.powered ? [{ text: 'Tower unpowered', color: '#ff6b6b', pulse: true }] : [];
    });

    game.interactions.register('radio_tower', {
      priority: 10, label: (g) => (E(g).transmitting ? 'Radio: on' : 'Radio'), cooldown: 0.4,
      onAction(g, t) { g.events.emit('radio:interact', { obj: t.obj }); g.ui.panels.open('tower', { tx: t.obj.tx, ty: t.obj.ty }); },
    });

    game.events.on('structure:placed', (e) => { if (e.type === 'radio_tower') E(game).tower = { tx: e.tx, ty: e.ty }; });
    game.events.on('structure:destroyed', (e) => { if (e.type === 'radio_tower') onTowerLost(game, e.tx, e.ty, true); });
    game.events.on('structure:removed', (e) => { if (e.type === 'radio_tower') onTowerLost(game, e.tx, e.ty, false); });
    game.events.on('fire:lit', (e) => { if (e.type === 'campfire') E(game).home = { tx: e.tx, ty: e.ty }; });
    game.events.on('time:newDay', ({ day }) => {
      if (game.mode !== 'playing') return;
      const eg = E(game), nl = nightLength(day - 1);
      const r = finishNight(eg, nl, day);
      if (r.counted) {
        game.ui.toast?.(r.done ? 'Signal sent. Hold on, rescue is coming.' : `Signal night ${r.nights} of ${ENDGAME.signalNights} complete`, 'good', 3600);
        game.events.emit('signal:night', { counted: true, nights: r.nights, done: r.done });
      } else if (r.tracked) {
        game.ui.toast?.('The night did not count: the tower was not powered long enough.', 'bad', 3600);
        game.events.emit('signal:night', { counted: false, nights: eg.nights, done: false });
      }
      if (r.done) startRescue(game);
    });
    game.events.on('game:over', () => { game.endgameRt.rescue = null; });
    for (const e of ['game:new', 'game:loaded', 'game:title']) game.events.on(e, () => { game.endgameRt.victory = false; });
    game.events.on('game:loaded', () => { if (E(game).rescuePending) startRescue(game); });   // saved at the dawn of the rescue
  },
  onLoad(game) {
    const rt = game.endgameRt, eg = E(game);
    rt.rescue = null; rt.powered = false; rt.outage = false; rt.markers = []; rt.t = 0; rt.wreckT = 0;
    const tw = findTower(game); eg.tower = tw ? { tx: tw.tx, ty: tw.ty } : null;
    rt.wrecks = wreckList(game);
  },
  update(game, dt) {
    const st = game.state, eg = st?.endgame, rt = game.endgameRt;
    if (!eg || game.mode !== 'playing') return;

    // rescue sequence (real seconds)
    if (rt.rescue) {
      const r = rt.rescue; r.t += dt;
      st.player.invuln = Math.max(st.player.invuln || 0, 0.5);
      if (!r.flew && r.t >= RESCUE.swell) { r.flew = true; game.events.emit('rescue:flyover', {}); }
      if (r.t >= RESCUE.swell + RESCUE.plane + RESCUE.fade) {
        rt.rescue = null; rt.victory = true; game.events.emit('rescue:done', {});
        game.end('victory', { cause: 'The rescue plane saw your signal. You made it out alive.', extra: { playSeconds: st.stats.playSeconds } });
      }
      return;
    }

    // wreckage cache (looted flags change when parts are taken)
    rt.wreckT -= dt;
    if (rt.wreckT <= 0) {
      rt.wreckT = ENDGAME.powerCheckEvery;
      rt.wrecks = wreckList(game);
      const pt = game.world.worldToTile(st.player.x, st.player.y);
      updateSeen(eg.seen, rt.wrecks, pt.tx, pt.ty, ENDGAME.partsRevealRadius);
      const tw = findTower(game);
      eg.tower = tw ? { tx: tw.tx, ty: tw.ty } : null;
      if (!tw && (eg.transmitting || eg.nights || eg.poweredSecs)) { resetSignal(eg); game.events.emit('signal:lost', {}); }
      rt.powered = !!tw && isPowered(eg.tower, litFires(game), ENDGAME.towerPowerRadius);
    }

    // signal accounting in GAME seconds (sleep runs at x12)
    const t = st.time, gdt = dt * t.speed;
    const fresh = eg.nightKey !== t.day;
    tickSignal(eg, { phase: t.phase, day: t.day, dt: gdt, powered: rt.powered });
    const frac = t.phase === 'night' && t.phaseLen ? t.phaseT / t.phaseLen : 0;
    if (eg.transmitting && t.phase === 'night') {
      if (fresh && eg.nightKey === t.day) eg.waves = ENDGAME.waveAt.filter((a) => a < frac - 0.02).length;   // joined late: skip waves already due
      const idx = nextWaveDue(frac, eg.waves);
      if (idx >= 0) {
        const size = waveSizes(t.day)[idx];
        const pack = spawnPack(game, { size, enraged: true, targetTile: eg.tower || undefined });
        eg.waves++;
        game.events.emit('signal:wave', { index: idx, size, spawned: pack.length });
        game.ui.toast?.(idx ? 'More wolves are coming for the tower!' : 'Wolves are coming for the tower!', 'bad', 3200);
      }
    }
    // outage warning (once per outage)
    if (eg.transmitting && !rt.powered) {
      if (!rt.outage) { rt.outage = true; game.ui.toast?.('Tower unpowered: signal paused. Keep a fire lit nearby.', 'bad', 3200); }
    } else rt.outage = false;
  },

  drawScreen(game, ctx, w, h) {
    if (game.mode === 'over' && game.endgameRt?.victory) { ctx.fillStyle = 'rgba(6,10,16,0.8)'; ctx.fillRect(0, 0, w, h); return; }   // victory screen sits on the faded world
    const rs = game.endgameRt?.rescue; if (!rs || game.mode !== 'playing') return;
    const t = rs.t, swell = RESCUE.swell, flyEnd = swell + RESCUE.plane;
    if (t > swell * 0.5 && t < flyEnd) { ctx.fillStyle = `rgba(180,210,255,${0.06 * Math.min(1, (t - swell * 0.5) / (swell * 0.5))})`; ctx.fillRect(0, 0, w, h); }
    if (t >= swell * 0.6 && t <= flyEnd + 0.4) {
      const u = Math.min(1, Math.max(0, (t - swell * 0.6) / (flyEnd - swell * 0.6)));
      const size = RESCUE.shadowSize * (Math.min(w, h) / 390 + 0.4);
      const x0 = -size, y0 = h * 0.85, x1 = w + size, y1 = h * 0.12;
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.fillStyle = 'rgba(8,14,26,0.16)'; drawPlane(ctx, x + 6, y + 10, size * 1.12, ang);
      ctx.fillStyle = 'rgba(8,14,26,0.34)'; drawPlane(ctx, x, y, size, ang);
    }
    const fadeStart = flyEnd - 0.2;
    if (t > fadeStart) { ctx.fillStyle = `rgba(6,10,16,${Math.min(1, (t - fadeStart) / (RESCUE.fade + 0.2))})`; ctx.fillRect(0, 0, w, h); }
  },
};

