// Base building (DESIGN §8): build mode (placement ghost / dismantle), placing & removing structures, wall auto-tiling,
// room detection (logic/enclosure.js) wired to game.shelterQuery, structure hp + damageStructure(), repair, rendering of
// room floors / ghost / hp bars. Structure BEHAVIOUR (fuel, racks, snares, sleep...) lives in systems/structures.js.
// See ARCHITECTURE.md §18 for the API other systems use.
import { TILE, BUILD, BUILDING } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { STRUCTURES, objectDef, isStructure } from '../data/structures.js';
import { validatePlacement, connectMask, NB_BITS } from '../logic/placement.js';
import { newStructure, applyDamage, repairOnce, refundFor, repairItem } from '../logic/structures.js';
import { createEnclosure } from '../logic/enclosure.js';
import { removeAll, add, count } from '../logic/inventory.js';
import { pickTarget } from '../logic/targeting.js';
import { findDropTile } from './itemactions.js';
import { drawRing, ghostSpriteKey, drawFootprint } from '../render/structurefx.js';
import { getSprite, drawSprite } from '../render/sprites.js';
import { floatText, chipBurst } from '../render/gatherfx.js';

export const CONNECTS = new Set(['wood_wall', 'stone_wall', 'door']);   // auto-tiling: these join neighbours of the same family
const connectsTo = (type) => CONNECTS.has(type);

const isFloodBlocked = (world) => (tx, ty) => {
  if (world.terrainAt(tx, ty) === 'cliff') return true;
  const o = world.objectAt(tx, ty); if (!o) return false;
  const def = objectDef(o.type); return !def || !!def.blocks || !!def.blocksCreatures;
};

// ---------------------------------------------------------------- public API (named exports; game first)
export const structureAt = (game, tx, ty) => { const o = game.world.objectAt(tx, ty); return o && isStructure(o.type) ? o : null; };
export const isSheltered = (game, tx, ty) => !!game.building?.enc?.isSheltered(tx, ty);
export const spikesAt = (game, tx, ty) => { const o = structureAt(game, tx, ty); return o && STRUCTURES[o.type].spikes ? STRUCTURES[o.type].extra?.contactDps || 0 : 0; };
const fires = [];
/** Lit campfire / furnace / torch post -> [{x,y,tx,ty,radius,type}] (reused array). */
export function litFires(game) {
  fires.length = 0;
  for (const type of ['campfire', 'furnace', 'torch_post']) for (const o of game.building.list(type)) {
    if (!o.lit) continue;
    const c = game.world.tileCenter(o.tx, o.ty);
    fires.push({ x: c.x, y: c.y, tx: o.tx, ty: o.ty, radius: STRUCTURES[type].light.radius, type });
  }
  return fires;
}
export const nearPlayer = (game, tx, ty, r = BUILDING.noticeRadius) => {
  const p = game.state.player, c = game.world.tileCenter(tx, ty);
  return Math.hypot(c.x - p.x, c.y - p.y) / TILE <= r;
};

export function damageStructure(game, tx, ty, amount, source = 'wolf') {
  const o = structureAt(game, tx, ty), def = o && STRUCTURES[o.type];
  if (!def || !def.hp) return null;
  if (o.hp === undefined) o.hp = def.hp;
  const r = applyDamage(o, amount);
  if (!r) return null;
  game.building.hitT.set(ty * game.world.w + tx, game.time);
  const c = game.world.tileCenter(tx, ty);
  if (game.gatherFx) chipBurst(game, c.x, c.y, def.color || '#8b5a2b', r.destroyed ? 12 : 4);
  game.events.emit('structure:damaged', { type: o.type, tx, ty, amount, hp: r.hp, source });
  if (r.destroyed) {
    game.world.removeObject(tx, ty);
    if (nearPlayer(game, tx, ty)) game.ui.toast?.(`Your ${def.name.toLowerCase()} was destroyed`, 'bad', 3200);
    game.events.emit('structure:destroyed', { type: o.type, tx, ty, source });
  }
  return { hp: r.hp, destroyed: r.destroyed };
}

/** Add to the bag; whatever does not fit lands on the ground next to the player. */
export function giveOrDrop(game, id, n, opts = {}) {
  if (n <= 0) return 0;
  let left = add(game.state.inventory, id, n, opts);
  while (left > 0) {
    const t = findDropTile(game); if (!t) break;
    const take = Math.min(left, ITEMS[id].stack || 1);
    game.world.setObject(t.tx, t.ty, { type: 'dropped_item', variant: 0, stack: { id, n: take } }); left -= take;
  }
  return n - left;
}

let lastToast = { msg: '', at: -9 };
function toastOnce(game, msg, kind = 'bad') {
  if (msg === lastToast.msg && game.time - lastToast.at < BUILDING.invalidToastGap) return;
  lastToast = { msg, at: game.time }; game.ui.toast?.(msg, kind, 2200);
}

// ---------------------------------------------------------------- system
export default {
  name: 'building',
  defaults: () => ({ built: 0 }),
  init(game) {
    const world = () => game.world;
    const B = game.building = {
      mode: null, selected: null, ghost: { tx: 0, ty: 0, valid: false, reason: '', code: '' }, pinned: null,
      blockers: [], hitT: new Map(), index: new Map(), enc: null, flash: null, loading: false, lastPlace: { tx: -1, ty: -1, at: -9 },
      list(type) { return B.index.get(type) || EMPTY; },
      listAll() { const out = []; for (const s of B.index.values()) for (const o of s) out.push(o); return out; },
      structureAt: (g, tx, ty) => structureAt(game, tx, ty),
      damageStructure: (g, tx, ty, amount, source) => damageStructure(game, tx, ty, amount, source),
      litFires: () => litFires(game), spikesAt: (g, tx, ty) => spikesAt(game, tx, ty), isSheltered: (g, tx, ty) => isSheltered(game, tx, ty),
      validate(id, tx, ty) {
        const p = game.state.player;
        return validatePlacement({ world: game.world, def: STRUCTURES[id], tx, ty, player: p, inventory: game.state.inventory, blockers: B.blockers });
      },
      select(id) {
        if (!STRUCTURES[id]) return false;
        B.mode = 'place'; B.selected = id; B.pinned = null; openBar(game); game.ui.panels.close('build');
        game.events.emit('build:mode', { mode: B.mode, id });
        return true;
      },
      toggleDismantle() {
        if (B.mode === 'dismantle') return B.cancel();
        B.mode = 'dismantle'; B.selected = null; B.pinned = null; openBar(game); game.ui.panels.close('build');
        game.events.emit('build:mode', { mode: B.mode });
      },
      cancel() {
        if (!B.mode) return false;
        B.mode = null; B.selected = null; B.pinned = null; B.ghost.valid = false;
        game.ui.panels.close('buildbar');
        game.events.emit('build:mode', { mode: null });
        return true;
      },
      /** B / Build button: returns true when it was handled here (cancels build mode); false = let the UI toggle the menu. */
      onToggle() { if (game.ui.panels.isOpen('build')) return false; return B.cancel(); },
      place(tx, ty) { return place(game, tx, ty); },
    };
    game.targetOverride = targetOverride;
    game.shelterQuery = (tx, ty) => !!B.enc && B.enc.isSheltered(tx, ty);

    // --- interactions
    game.interactions.register('buildghost', { label: () => 'Place', priority: 100, cooldown: 0.16, onAction: (g) => { const gh = B.ghost; return place(g, gh.tx, gh.ty) ? undefined : false; } });
    game.interactions.register((t) => t.dismantle === true, {
      priority: 100, label: () => 'Hold: Dismantle', cooldown: 0.1, onAction: () => false,
      onHold(g, t, dt, held) { if (held >= BUILD.dismantleHoldSec) dismantle(g, t.obj); },
    });
    game.interactions.register((t) => t.repair === true, {
      priority: 5, label: (g, t) => `Repair (${ITEMS[repairItem(t.obj.type)]?.name || 'material'})`, repeat: true, cooldown: 0.4,
      onAction(g, t) {
        const r = repairOnce(t.obj, g.state.inventory);
        if (!r.ok) { g.ui.toast?.(r.reason, 'bad'); return false; }
        const c = g.world.tileCenter(t.obj.tx, t.obj.ty); if (g.gatherFx) floatText(g, c.x, c.y - 6, '+hp', '#7bd389');
        g.ui.toast?.(`Repaired ${STRUCTURES[t.obj.type].name.toLowerCase()}`, 'good', 1400);
      },
    });
    game.targetProviders.push((g, px, py) => {                       // damaged passive structures can be repaired with Action
      if (B.mode) return null;
      const out = []; const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
      g.world.forEachObjectInRect(cx - 2, cy - 2, cx + 2, cy + 2, (o) => {
        const def = STRUCTURES[o.type];
        if (!def || def.interactable || !def.hp || (o.hp ?? def.hp) >= def.hp) return;
        out.push({ kind: 'object', x: o.tx * TILE + TILE / 2, y: o.ty * TILE + TILE / 2, obj: o, tx: o.tx, ty: o.ty, def, name: `${def.name} (${Math.ceil(o.hp)}/${def.hp})`, verb: 'Repair', radius: TILE / 2, repair: true });
      });
      return out;
    });

    // --- world changes: index, auto-tiling, rooms
    game.events.on('world:objectChanged', ({ tx, ty, obj, prev }) => onObjectChanged(game, tx, ty, obj, prev));
    game.events.on('input:worldTap', (tap) => onWorldTap(game, tap));
    game.events.on('game:over', () => B.cancel());
    game.events.on('game:title', () => B.cancel());
  },
  onLoad(game) {
    const B = game.building, world = game.world;
    B.mode = null; B.selected = null; B.pinned = null; B.hitT.clear(); B.flash = null; B.index.clear();
    B.enc = createEnclosure({ w: world.w, h: world.h, isBlocked: isFloodBlocked(world), max: BUILD.roomMaxTiles });
    B.loading = true;
    const seeds = [];
    world.forEachObject((o) => {
      if (!isStructure(o.type)) return;
      indexAdd(B, o);
      if (CONNECTS.has(o.type)) o.variant = connectMask(world, o.tx, o.ty, connectsTo);
      const def = STRUCTURES[o.type]; if (o.hp === undefined && def.hp) o.hp = def.hp;
      if (def.blocks || def.blocksCreatures) for (const [dx, dy] of NB_BITS) seeds.push([o.tx + dx, o.ty + dy]);
    });
    B.enc.rebuild(seeds.filter(([x, y]) => world.inBounds(x, y)));
    B.loading = false;
  },
  update(game, dt) {
    const B = game.building;
    if (game.mode !== 'playing') return;
    if (B.flash) { B.flash.t += dt; if (B.flash.t > BUILDING.roomFlashSeconds) B.flash = null; }
    if (B.mode === 'place') updateGhost(game);
  },

  // ---- rendering
  drawGround(game, ctx, cam) {
    const B = game.building; if (!B?.enc || !B.enc.rooms.size) return;
    const w = game.world.w, tx0 = Math.max(0, Math.floor(cam.rx / TILE) - 1), ty0 = Math.max(0, Math.floor(cam.ry / TILE) - 1);
    const tx1 = Math.min(w - 1, Math.floor((cam.rx + cam.w) / TILE) + 1), ty1 = Math.min(game.world.h - 1, Math.floor((cam.ry + cam.h) / TILE) + 1);
    const eps = 0.5 / (game.view.dpr * cam.scale);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const room = (x, y) => B.enc.isRoomTile(x, y);
      if (!room(tx, ty)) {   // floor also runs under the inner half of walls / fire / furniture that face the room, so no snow strip shows inside
        const o = game.world.objectAt(tx, ty);
        if (!o || !isStructure(o.type)) continue;
        const X = tx * TILE, Y = ty * TILE, H = TILE / 2 + 6, h = TILE / 2 - 6, q = [];
        const W = room(tx - 1, ty), E = room(tx + 1, ty), N = room(tx, ty - 1), S = room(tx, ty + 1);
        if (W) q.push([X, Y, H, TILE]); if (E) q.push([X + h, Y, H, TILE]); if (N) q.push([X, Y, TILE, H]); if (S) q.push([X, Y + h, TILE, H]);
        if (room(tx - 1, ty - 1)) q.push([X, Y, H, H]); if (room(tx + 1, ty - 1)) q.push([X + h, Y, H, H]);
        if (room(tx - 1, ty + 1)) q.push([X, Y + h, H, H]); if (room(tx + 1, ty + 1)) q.push([X + h, Y + h, H, H]);
        if (!q.length) continue;
        if (!CONNECTS.has(o.type) && (W || E || N || S)) { q.length = 0; q.push([X, Y, TILE, TILE]); }   // fire, chest, bedroll...: floor under the whole tile
        ctx.save(); ctx.beginPath(); for (const r of q) ctx.rect(...r); ctx.clip();
        ctx.drawImage(getSprite('room_floor', (tx * 7 + ty * 13) % 3).canvas, X, Y, TILE + eps, TILE + eps);
        ctx.restore(); continue;
      }
      const s = getSprite('room_floor', (tx * 7 + ty * 13) % 3);
      ctx.drawImage(s.canvas, tx * TILE, ty * TILE, TILE + eps, TILE + eps);
    }
  },
  drawFx(game, ctx, cam) {
    const B = game.building; if (!B) return;
    if (B.flash) {          // "shelter complete" pulse over the new room
      const k = B.flash.t / BUILDING.roomFlashSeconds, a = Math.sin(Math.min(1, k) * Math.PI) * 0.5;
      ctx.fillStyle = `rgba(255,214,140,${a})`;
      const w = game.world.w; for (const idx of B.flash.tiles) ctx.fillRect((idx % w) * TILE, Math.floor(idx / w) * TILE, TILE, TILE);
    }
    // hp bars on damaged structures
    const world = game.world, tx0 = Math.floor(cam.rx / TILE) - 1, ty0 = Math.floor(cam.ry / TILE) - 2, tx1 = Math.floor((cam.rx + cam.w) / TILE) + 1, ty1 = Math.floor((cam.ry + cam.h) / TILE) + 1;
    world.forEachObjectInRect(tx0, ty0, tx1, ty1, (o) => {
      const def = STRUCTURES[o.type]; if (!def || !def.hp || o.hp === undefined || o.hp >= def.hp) return;
      const f = Math.max(0, o.hp / def.hp), hit = B.hitT.get(o.ty * world.w + o.tx);
      if (f >= 0.5 && !(hit !== undefined && game.time - hit < BUILDING.hpBarSeconds)) return;
      const x = o.tx * TILE + 4, y = o.ty * TILE - (STRUCTURES[o.type].blocks ? 10 : 2), wd = TILE - 8;
      ctx.fillStyle = 'rgba(10,16,22,0.8)'; ctx.fillRect(x - 1, y - 1, wd + 2, 6);
      ctx.fillStyle = f > 0.5 ? '#7bd389' : f > 0.25 ? '#e9a23b' : '#e63946'; ctx.fillRect(x, y, wd * f, 4);
    });
  },
  drawScreen(game, ctx) {
    const B = game.building; if (!B?.mode || game.mode !== 'playing' || !game.renderer) return;
    const sc = game.camera.scale, time = performance.now() / 1000;
    if (B.mode === 'place' && B.selected) {
      const { tx, ty, valid } = B.ghost, def = STRUCTURES[B.selected];
      const tl = game.renderer.worldToScreen(tx * TILE, ty * TILE);
      drawFootprint(ctx, tl.x, tl.y, TILE * sc, valid, time);
      const g = game.renderer.worldToScreen(tx * TILE + 16, ty * TILE + (['bedroll', 'snare', 'fishing_hole'].includes(B.selected) ? 2 : 27));
      let v = 0; if (CONNECTS.has(B.selected)) v = connectMask(game.world, tx, ty, connectsTo);
      const s = getSprite(ghostSpriteKey(B.selected), v);
      ctx.globalAlpha = valid ? 0.62 + 0.12 * Math.sin(time * 6) : 0.4;
      ctx.drawImage(s.canvas, g.x - s.ax * sc, g.y - s.ay * sc, s.w * sc, s.h * sc);
      ctx.globalAlpha = 1;
    } else if (B.mode === 'dismantle') {
      const t = game.target, h = game.interactions?.held;
      if (t?.dismantle && h && h.key) {
        const f = Math.min(1, h.t / BUILD.dismantleHoldSec), s = game.renderer.worldToScreen(t.x, t.y - 4);
        drawRing(ctx, s.x, s.y, 18 * sc, f, '#ff9f1c');
      }
    }
  },
};
const EMPTY = new Set();

// ---------------------------------------------------------------- internals
function openBar(game) { if (!game.ui.panels.isOpen('buildbar')) game.ui.panels.open('buildbar'); }

function indexAdd(B, o) { let s = B.index.get(o.type); if (!s) B.index.set(o.type, s = new Set()); s.add(o); }
function indexRemove(B, o) { B.index.get(o.type)?.delete(o); }

function recomputeMask(game, tx, ty) {
  const o = game.world.objectAt(tx, ty);
  if (o && CONNECTS.has(o.type)) o.variant = connectMask(game.world, tx, ty, connectsTo);
}

function onObjectChanged(game, tx, ty, obj, prev) {
  const B = game.building; if (!B?.enc) return;
  if (prev && isStructure(prev.type)) indexRemove(B, prev);
  if (obj && isStructure(obj.type)) indexAdd(B, obj);
  if ((obj && CONNECTS.has(obj.type)) || (prev && CONNECTS.has(prev.type))) {
    recomputeMask(game, tx, ty); for (const [dx, dy] of NB_BITS) recomputeMask(game, tx + dx, ty + dy);
  }
  const was = prev ? isBlockingObj(prev) : false, now = obj ? isBlockingObj(obj) : false;
  if (was === now || B.loading) return;
  const res = B.enc.update(tx, ty);
  if (game.mode !== 'playing') return;
  const p = game.state.player, ptile = game.world.worldToTile(p.x, p.y);
  for (const room of res.formed) {
    const near = room.tiles.some((k) => { const x = k % game.world.w, y = Math.floor(k / game.world.w); return Math.hypot(x - ptile.tx, y - ptile.ty) <= 12; });
    if (!near) continue;
    if (room.size < BUILDING.roomMinToast) { game.ui.toast?.('Too cramped — leave space to stand inside', 'bad', 3000); continue; }
    B.flash = { t: 0, tiles: room.tiles.slice() };
    game.ui.toast?.('Shelter complete — this room holds heat', 'good', 3600);
    game.events.emit('room:formed', { size: room.size, tiles: room.tiles });
  }
  // Walled in a fire with no free tile (e.g. 8 walls round a campfire): no room forms, so say why.
  if (!res.formed.length && now && sealedFireNear(game, tx, ty)) {
    game.ui.toast?.('Too cramped — leave space to stand inside', 'bad', 3000);
  }
  if (res.breached.length) {
    const inside = res.breached.some((r) => r.tiles.includes(ptile.ty * game.world.w + ptile.tx)) || res.breached.some((r) => r.tiles.some((k) => Math.hypot((k % game.world.w) - ptile.tx, Math.floor(k / game.world.w) - ptile.ty) <= 8));
    if (inside && !res.formed.length) game.ui.toast?.('Shelter breached — the room is open again', 'bad', 3000);
    game.events.emit('room:breached', {});
  }
}
const isBlockingObj = (o) => { const d = objectDef(o.type); return !d || !!d.blocks || !!d.blocksCreatures; };
/** True when a campfire/furnace next to (tx,ty) has no free 4-neighbour (it is sealed in, so no room can hold a player). */
function sealedFireNear(game, tx, ty) {
  const world = game.world, blocked = isFloodBlocked(world);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = tx + dx, y = ty + dy, o = world.objectAt(x, y);
    const st = o && objectDef(o.type)?.station;
    if (st !== 'campfire' && st !== 'furnace') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([ex, ey]) => blocked(x + ex, y + ey))) return true;
  }
  return false;
}

// ---- placement
const dirTile = (facing) => (Math.abs(Math.cos(facing)) >= Math.abs(Math.sin(facing)) ? [Math.cos(facing) >= 0 ? 1 : -1, 0] : [0, Math.sin(facing) >= 0 ? 1 : -1]);

function updateGhost(game) {
  const B = game.building, p = game.state.player, world = game.world, it = game.input.intent;
  let tx, ty;
  if (B.pinned) {
    if (Math.hypot(p.x - B.pinned.px, p.y - B.pinned.py) > 6) B.pinned = null;   // moving drops the pin: ghost goes back in front
  }
  if (B.pinned) { tx = B.pinned.tx; ty = B.pinned.ty; }
  else if (it.aimActive && !it.uiBlocked) { const t = world.worldToTile(it.pointer.wx, it.pointer.wy); tx = t.tx; ty = t.ty; }
  else { const pt = world.worldToTile(p.x, p.y), [dx, dy] = dirTile(p.facing); tx = pt.tx + dx; ty = pt.ty + dy; }
  let v = B.validate(B.selected, tx, ty);
  if (v.code === 'standing' && !B.pinned && !(it.aimActive && !it.uiBlocked)) {   // standing on the edge of the tile in front: use the next one
    const [dx, dy] = dirTile(p.facing), v2 = B.validate(B.selected, tx + dx, ty + dy);
    if (v2.ok) { tx += dx; ty += dy; v = v2; }
  }
  Object.assign(B.ghost, { tx, ty, valid: v.ok, reason: v.reason, code: v.code });
}

function targetOverride(game, picked) {
  const B = game.building; if (!B?.mode) return picked;
  if (B.mode === 'place' && B.selected) {
    const c = game.world.tileCenter(B.ghost.tx, B.ghost.ty);
    return { kind: 'buildghost', x: c.x, y: c.y, name: STRUCTURES[B.selected].name, verb: 'Place', radius: -3, ghost: true };
  }
  if (B.mode === 'dismantle') {
    const p = game.state.player, cands = [], cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    game.world.forEachObjectInRect(cx - 3, cy - 3, cx + 3, cy + 3, (o) => {
      const def = STRUCTURES[o.type]; if (!def) return;
      cands.push({ kind: 'object', x: o.tx * TILE + TILE / 2, y: o.ty * TILE + TILE / 2, obj: o, tx: o.tx, ty: o.ty, def, name: def.name, verb: 'Dismantle', radius: TILE / 2, dismantle: true });
    });
    return pickTarget(cands, p.x, p.y, p.facing, { range: 1.6, halfAngleDeg: 60 });
  }
  return picked;
}

export function place(game, tx, ty) {
  const B = game.building, id = B.selected, def = STRUCTURES[id];
  if (!def) return false;
  const v = B.validate(id, tx, ty);
  if (!v.ok) { toastOnce(game, v.reason); return false; }
  const inv = game.state.inventory;
  if (!removeAll(inv, def.cost)) { toastOnce(game, 'Not enough materials'); return false; }
  const obj = newStructure(id);
  game.world.setObject(tx, ty, obj);
  game.state.building.built++;
  B.lastPlace = { tx, ty, at: game.time };
  const c = game.world.tileCenter(tx, ty);
  if (game.gatherFx) { chipBurst(game, c.x, c.y + 6, '#f2f7fb', 8); floatText(game, c.x, c.y - 6, def.cost.map((x) => `-${x.n} ${ITEMS[x.item].name.toLowerCase()}`).slice(0, 2).join(' '), '#ffd9a0'); }
  game.events.emit('structure:placed', { type: id, tx, ty });
  if (id === 'snare') for (const f of litFires(game)) if (Math.hypot(f.tx - tx, f.ty - ty) < def.minFireDist) { game.ui.toast?.('Too close to a fire — nothing will come to this snare', 'info', 3000); break; }
  return true;
}

function onWorldTap(game, tap) {
  const B = game.building; if (!B || B.mode !== 'place' || !B.selected || game.mode !== 'playing' || game.paused) return;
  if (game.input.intent.uiBlocked) return;
  const { tx, ty } = game.world.worldToTile(tap.wx, tap.wy);
  if (tx === B.lastPlace.tx && ty === B.lastPlace.ty && game.time - B.lastPlace.at < 0.6) return;   // mouse: the click that follows the action press
  if (tx === B.ghost.tx && ty === B.ghost.ty) { place(game, tx, ty); return; }                       // tap the ghost again = confirm
  const p = game.state.player;
  B.pinned = { tx, ty, px: p.x, py: p.y };
  updateGhost(game);
}

// ---- dismantle
function dismantle(game, obj) {
  const def = STRUCTURES[obj.type]; if (!def) return false;
  if (obj.inv && obj.inv.bag.some(Boolean)) { toastOnce(game, 'Empty the chest first'); return false; }
  if (game.world.objectAt(obj.tx, obj.ty) !== obj) return false;
  const refund = refundFor(def, BUILD.dismantleRefund);
  game.world.removeObject(obj.tx, obj.ty);
  for (const c of refund) giveOrDrop(game, c.item, c.n);
  if (obj.slots) for (const s of obj.slots) if (s) giveOrDrop(game, s.done ? 'jerky' : 'raw_meat', 1);
  if (obj.caught) { giveOrDrop(game, 'raw_meat', 1); }
  const c = game.world.tileCenter(obj.tx, obj.ty);
  if (game.gatherFx) { chipBurst(game, c.x, c.y, def.color || '#8b5a2b', 9); floatText(game, c.x, c.y - 6, refund.length ? refund.map((x) => `+${x.n} ${ITEMS[x.item].name.toLowerCase()}`).slice(0, 2).join(' ') : 'dismantled', '#9be8a8'); }
  game.events.emit('structure:removed', { type: obj.type, tx: obj.tx, ty: obj.ty });
  return true;
}
export { dismantle, place as placeStructure, updateGhost };
export const _internals = { isFloodBlocked, count };
