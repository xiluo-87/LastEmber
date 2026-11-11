// Combat (DESIGN §9): consumes 'player:swing' (melee arc + bow), registers the 'creature' / 'carcass' interactions and target providers,
// simulates arrows, and handles butchering. Creature behaviour lives in systems/creatures.js.
//   events: 'combat:arrowShot' {arrow} · 'combat:hit' {c,dmg,tool} · 'carcass:butchered' {type,drops}
//   state: state.creatures.arrows [{x,y,vx,vy,left,dmg}]
import { TILE, COMBAT, PLAYER } from '../data/balance.js';
import { CREATURES, AI, PROJECTILE } from '../data/creatures.js';
import { ITEMS } from '../data/items.js';
import * as invMod from '../logic/inventory.js';
import * as A from '../logic/ai.js';
import { hurtCreature } from './creatures.js';
import { wearHeld } from './itemactions.js';
import { floatText, chipBurst } from '../render/gatherfx.js';

const MAX_HITS = 3;
const aimPool = [];
const candPool = [], provOut = [];
const hitList = [];
const nm = (id) => ITEMS[id]?.name?.toLowerCase() || id;
const S = (game) => game.state.creatures;

// ------------------------------------------------------------ aim helpers
const aimOut = [];
function aimCands(game) {
  let n = 0;
  for (const c of S(game).list) {
    if (c.hp <= 0) continue;
    const o = aimPool[n] || (aimPool[n] = { x: 0, y: 0, hostile: false, r: 0, c: null });
    o.x = c.x; o.y = c.y; o.hostile = CREATURES[c.type].hostile; o.r = CREATURES[c.type].radius * TILE; o.c = c; aimOut[n] = o; n++;
  }
  aimOut.length = n;
  return aimOut;
}

/** Aim angle for a melee swing: snap to the nearest creature within reach in a wide cone, else keep the facing. */
export function meleeAim(game, facing, reachPx) {
  const p = game.state.player;
  const t = A.pickAim(p.x, p.y, facing, aimCands(game), reachPx + 10, (75 * Math.PI) / 180);
  return t ? Math.atan2(t.y - p.y, t.x - p.x) : facing;
}

// ------------------------------------------------------------ melee
export function resolveSwing(game, info) {
  if (info.toolClass === 'bow') return shoot(game, info);
  const p = game.state.player, s = S(game);
  const facing = meleeAim(game, info.facing, info.reachPx);
  p.facing = facing;
  hitList.length = 0;
  for (const c of s.list) {
    if (c.hp <= 0) continue;
    const def = CREATURES[c.type];
    if (A.inSwingArc(info.origin.x, info.origin.y, facing, info.reachPx, info.arc, c.x, c.y, def.radius * TILE)) hitList.push(c);
  }
  if (!hitList.length) return 0;
  hitList.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  let hits = 0;
  for (let i = 0; i < hitList.length && i < MAX_HITS; i++) {
    const c = hitList[i], ang = Math.atan2(c.y - p.y, c.x - p.x);
    hitFx(game, c, info.damage);
    hurtCreature(game, c, info.damage, { angle: ang, source: 'player' });
    game.events.emit('combat:hit', { c, dmg: info.damage, tool: info.tool });
    hits++;
    if (wearHeld(game, 1) === 'broken') break;
  }
  return hits;
}

function hitFx(game, c, dmg) {
  floatText(game, c.x, c.y - 18, String(Math.round(dmg)), '#ffe08a');
  chipBurst(game, c.x, c.y - 4, c.type === 'rabbit' || c.type === 'deer' ? '#c0394f' : '#a8323c', 5);
}

// ------------------------------------------------------------ bow
function shoot(game, info) {
  const inv = game.state.inventory, p = game.state.player, s = S(game);
  if (!invMod.remove(inv, info.ammo || 'arrow', 1)) { game.ui.toast?.('No arrows', 'bad'); return 0; }
  const range = (info.reach || COMBAT.bowRange) * TILE;
  const cone = (COMBAT.autoAimDeg * Math.PI) / 180;
  const t = A.pickAim(p.x, p.y, info.facing, aimCands(game), range, cone);
  let ang = info.facing;
  if (t) {
    const c = t.c, tt = Math.hypot(c.x - p.x, c.y - p.y) / (PROJECTILE.arrowSpeed * TILE);
    ang = Math.atan2(c.y + c.vy * tt - p.y, c.x + c.vx * tt - p.x);
  }
  p.facing = ang;
  const sp = PROJECTILE.arrowSpeed * TILE, ca = Math.cos(ang), sa = Math.sin(ang);
  const arrow = { x: p.x + ca * 12, y: p.y + sa * 12, vx: ca * sp, vy: sa * sp, left: Math.min(range, PROJECTILE.maxRange * TILE), dmg: info.damage };
  s.arrows.push(arrow);
  game.events.emit('combat:arrowShot', { arrow });
  return 1;
}

function recoverArrow(game, x, y) {
  if (Math.random() >= PROJECTILE.recoverChance) return;
  const w = game.world, tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  for (let r = 0; r <= 1; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const tx = tx0 + dx, ty = ty0 + dy;
    if (!w.inBounds(tx, ty) || w.objectAt(tx, ty) || w.isBlocked(tx, ty)) continue;
    w.setObject(tx, ty, { type: 'dropped_item', variant: 0, stack: { id: 'arrow', n: 1 } });
    return;
  }
}

function updateArrows(game, dt) {
  const s = S(game), w = game.world, arrows = s.arrows;
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    let done = false;
    for (let sub = 0; sub < 2 && !done; sub++) {
      const px = a.x, py = a.y;
      a.x += a.vx * dt * 0.5; a.y += a.vy * dt * 0.5;
      a.left -= Math.hypot(a.vx, a.vy) * dt * 0.5;
      if (w.isBlockedAtPx(a.x, a.y)) { recoverArrow(game, px, py); done = true; break; }
      for (const c of s.list) {
        if (c.hp <= 0) continue;
        const r = CREATURES[c.type].radius * TILE + PROJECTILE.arrowRadius;
        const dx = c.x - a.x, dy = c.y - a.y;
        if (dx * dx + dy * dy <= r * r) {
          const ang = Math.atan2(a.vy, a.vx);
          hitFx(game, c, a.dmg);
          hurtCreature(game, c, a.dmg, { angle: ang, source: 'player', knock: 0.6 });
          game.events.emit('combat:hit', { c, dmg: a.dmg, tool: 'bow' });
          const held = invMod.selectedStack(game.state.inventory);
          if (held && ITEMS[held.id]?.tool?.class === 'bow') wearHeld(game, 1);
          recoverArrow(game, a.x, a.y);
          done = true; break;
        }
      }
      if (a.left <= 0 && !done) { recoverArrow(game, a.x, a.y); done = true; }
    }
    if (done) arrows.splice(i, 1);
  }
}

// ------------------------------------------------------------ butchering
function dropToWorld(game, id, n, x, y) {
  const w = game.world, tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const tx = tx0 + dx, ty = ty0 + dy;
    if (!w.inBounds(tx, ty) || w.objectAt(tx, ty) || w.isBlocked(tx, ty)) continue;
    w.setObject(tx, ty, { type: 'dropped_item', variant: 0, stack: { id, n } });
    return true;
  }
  return false;
}

export function butcher(game, k) {
  const s = S(game), def = CREATURES[k.type], drops = A.rollDrops(def);
  const given = []; let leftAny = false;
  for (const d of drops) {
    const left = invMod.add(game.state.inventory, d.item, d.n);
    if (d.n - left > 0) given.push({ item: d.item, n: d.n - left });
    if (left > 0) { leftAny = true; dropToWorld(game, d.item, left, k.x, k.y); }
  }
  const i = s.carcasses.indexOf(k); if (i >= 0) s.carcasses.splice(i, 1);
  let j = 0;
  for (const g of given) floatText(game, k.x, k.y - 12 - j++ * 14, `+${g.n} ${nm(g.item)}`, '#ffe9a8');
  game.ui.toast?.(given.length ? `Butchered: ${given.map((g) => `${g.n} ${nm(g.item)}`).join(', ')}` : 'Bag full', given.length ? 'good' : 'bad');
  if (leftAny) game.ui.toast?.('Bag full - some left on the ground', 'bad');
  game.events.emit('carcass:butchered', { type: k.type, drops: given });
  return given;
}

// ------------------------------------------------------------ system
export default {
  name: 'combat',
  init(game) {
    game.events.on('player:swing', (info) => resolveSwing(game, info));
    const R = game.interactions;
    const heldClass = (g) => R.heldTool(g).class;
    R.register('creature', {
      repeat: true, priority: 5,
      label: (g) => (g && heldClass(g) === 'bow' ? 'Shoot' : 'Attack'),
      onAction(g, t, api) {
        const p = g.state.player;
        p.facing = Math.atan2(t.y - p.y, t.x - p.x);
        if (heldClass(g) === 'bow' && invMod.count(g.state.inventory, 'arrow') < 1) { g.ui.toast?.('No arrows', 'bad'); return false; }
        return api.swing((info) => resolveSwing(g, info));
      },
    });
    R.register('carcass', {
      priority: 5, label: () => 'Butcher',
      onAction() { return false; },
      onHold(g, t, dt, held) {
        const k = t.ref; if (!k) return;
        k.bt = held; k.btTick = g.tick;
        if (held >= AI.butcherSeconds) butcher(g, k);
      },
    });
    // targets: creatures and carcasses within interaction range
    game.targetProviders.push((g, px, py) => {
      const out = provOut, s = g.state.creatures, lim = (PLAYER.interactCone.range + 1.2) * TILE;
      let n = 0; out.length = 0;
      const put = (kind, x, y, name, verb, radius, ref) => {
        const o = candPool[n] || (candPool[n] = {});
        o.kind = kind; o.x = x; o.y = y; o.name = name; o.verb = verb; o.radius = radius; o.ref = ref; n++;
        out.push(o);
      };
      for (const c of s.list) {
        if (c.hp <= 0 || Math.abs(c.x - px) > lim || Math.abs(c.y - py) > lim) continue;
        const def = CREATURES[c.type];
        put('creature', c.x, c.y, def.name, 'Attack', def.radius * TILE, c);
      }
      for (const k of s.carcasses) {
        if (Math.abs(k.x - px) > lim || Math.abs(k.y - py) > lim) continue;
        put('carcass', k.x, k.y, `${CREATURES[k.type].name} carcass`, 'Butcher', 14, k);
      }
      return out;
    });
  },
  update(game, dt) {
    if (game.mode !== 'playing') return;
    updateArrows(game, dt);
    // face the nearest creature while a melee swing winds up (touch players only steer with the stick)
    const sw = game.interactions.swingState;
    if (sw && !sw.fired && sw.cls !== 'bow') game.state.player.facing = meleeAim(game, game.state.player.facing, sw.reachPx);
    // butcher progress decays when not held
    for (const k of S(game).carcasses) if (k.bt > 0 && game.tick - k.btTick > 6) k.bt = 0;
  },
};
