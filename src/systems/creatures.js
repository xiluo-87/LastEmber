// Creature runtime (DESIGN §9): spawning/despawning, AI think (6 Hz, staggered) + movement (60 Hz), attacks on the player, carcasses.
// Pure decision rules live in logic/ai.js, navigation in logic/aipath.js, structure access in systems/creature-world.js.
//
// state.creatures = { list:[creature], packs:{[id]:{id,kind:'wolf'|'herd',size,en,tx,ty,nextLunge,dir}}, carcasses:[{id,type,x,y,ttl,bt,btTick}],
//   arrows:[{x,y,vx,vy,left,dmg}], dens:[{tx,ty,id,respawnDay}], clock, nextId, nextPack, seeded, howled, packDay, packsTonight, packClock, spawnT }
// creature = { id, type, x, y, hp, ai, mode, face (1|-1), t, th, cd, hurt, hx,hy, pack, ps (pack size at spawn), en (enraged), aggro, alert, mx,my,sp, kx,ky, ... }
//
// PUBLIC API (named exports and `game.creatures.*`; game first; x,y world px; radius in TILES):
//   spawnCreature(game, type, x, y, opts?) -> creature         spawnPack(game, {size, enraged, targetTile, x, y}) -> creature[]
//   hostilesNear(game, x, y, tiles) -> creature[]              hasHostileNear(game, x, y, tiles) -> bool        creaturesNear(game, x, y, tiles, filter?)
//   hurtCreature(game, c, dmg, {angle, source, knock}) -> killed?   killCreature(game, c, source)           carcassNear(game, x, y, tiles)
//   debugSpawn(game, type, dxTiles, dyTiles)
// Events: creature:spawned {c} · creature:hit {c,dmg,source} · creature:killed {c,by} · creature:howl {day} · carcass:created {carcass}
import { TILE, PLAYER, WOLF, SPAWN, COMBAT } from '../data/balance.js';
import { CREATURES, AI, NEW_PACK_TOAST } from '../data/creatures.js';
import { createRng } from '../rng.js';
import { nextRand } from '../logic/grand.js';
import { moveCircle } from '../logic/collision.js';
import { createPather, lineClear } from '../logic/aipath.js';
import * as A from '../logic/ai.js';
import * as CW from './creature-world.js';
import { heldTorch } from './itemactions.js';
import { damagePlayer } from './vitals.js';
import { pushCreatureDrawables, drawCreatureScreen } from '../render/creatures.js';

const TAU = Math.PI * 2;
const W = AI.wolf, B = AI.bear;
const S = (game) => game.state.creatures;
let G = null;                                  // the game whose state owns the seeded gameplay RNG (set on init/load/update)
const rand = () => nextRand(G.state);
const range = (a, b) => a + rand() * (b - a);
const HUNT = 'hunt';

// ---------------------------------------------------------------- runtime caches (not saved)
function makeRuntime(game) {
  const world = game.world;
  const rt = {
    pather: createPather(world.w, world.h),
    cworld: { isBlocked: (tx, ty) => CW.isBlockedForCreature(game, tx, ty) },
    blocked: (tx, ty) => CW.isBlockedForCreature(game, tx, ty),
    fires: [], nFires: 0, fireT: 0, torch: { x: 0, y: 0, r: W.torchFearR, post: true }, torchOn: false,
    rosters: new Map(), rosterT: 0, out: { tx: 0, ty: 0 }, hit: { tx: 0, ty: 0 },
    px: 0, py: 0, psprint: false, php: 100, night: false, day: 1, registered: false, tmp: { x: 0, y: 0 },
    cands: [], // targeting candidate pool
    fireList: [], // scratch for the fire-fear test (fires + torch)
  };
  return rt;
}
const rt = (game) => game.creatureRt;

function refreshFires(game, r) {
  r.nFires = CW.litFires(game, r.fires);
}
/** Fire-fear test list: building fires followed by the held lit torch (if any). mode = A.FEAR_* (torches-only drops campfires/furnaces). */
function fearList(r, mode = A.FEAR_ALL) {
  const l = r.fireList; let n = 0;
  if (mode >= A.FEAR_NONE) { l.length = 0; return 0; }
  for (let i = 0; i < r.nFires; i++) if (mode === A.FEAR_ALL || r.fires[i].post) l[n++] = r.fires[i];
  if (r.torchOn) l[n++] = r.torch;
  l.length = n;
  return n;
}

function rebuildRosters(game, r) {
  for (const arr of r.rosters.values()) arr.length = 0;
  for (const c of S(game).list) {
    if (!c.pack) continue;
    let a = r.rosters.get(c.pack); if (!a) { a = []; r.rosters.set(c.pack, a); }
    a.push(c);
  }
}
const roster = (r, id) => r.rosters.get(id) || [];

// ---------------------------------------------------------------- queries
export function creaturesNear(game, x, y, tiles, filter) {
  const out = [], r2 = (tiles * TILE) ** 2;
  for (const c of S(game).list) { const dx = c.x - x, dy = c.y - y; if (dx * dx + dy * dy <= r2 && (!filter || filter(c))) out.push(c); }
  return out;
}
export function hostilesNear(game, x, y, tiles) { return creaturesNear(game, x, y, tiles, (c) => CREATURES[c.type].hostile && c.hp > 0); }
export function hasHostileNear(game, x, y, tiles) {
  const r2 = (tiles * TILE) ** 2;
  for (const c of S(game).list) { if (!CREATURES[c.type].hostile) continue; const dx = c.x - x, dy = c.y - y; if (dx * dx + dy * dy <= r2) return true; }
  return false;
}
export function carcassNear(game, x, y, tiles) {
  let best = null, bd = (tiles * TILE) ** 2;
  for (const k of S(game).carcasses) { const dx = k.x - x, dy = k.y - y, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = k; } }
  return best;
}

// ---------------------------------------------------------------- spawning
export function spawnCreature(game, type, x, y, opts = {}) {
  const def = CREATURES[type], s = S(game);
  const c = {
    id: s.nextId++, type, x, y, hp: opts.hp ?? def.hp, ai: opts.ai || 'idle', mode: '', face: rand() < 0.5 ? -1 : 1, t: 0, th: rand() / AI.thinkHz,
    cd: 0, hurt: 0, hx: opts.home ? opts.home.x : x, hy: opts.home ? opts.home.y : y, pack: opts.pack || 0, ps: opts.packSize || 1, en: opts.enraged ? 1 : 0,
    aggro: 0, alert: 0, mx: 0, my: 0, sp: 1, kx: 0, ky: 0, vx: 0, vy: 0, anim: rand() * 4, np: 0, pz: range(0.2, 2), den: opts.den ?? -1,
    sd: 0, sa: 0, sw: 0, et: 0, ex: 0, ey: 0, tx0: 0, ty0: 0, fk: 0, hitStructT: 0, stuckL: 0, ign: 0, bs: rand() < 0.5 ? 1 : -1, ct: range(...W.circleTime), lx: 0, ly: 0, hitd: 0, stx: -1, sty: 0, sh: 0,
  };
  s.list.push(c);
  game.events.emit('creature:spawned', { c });
  return c;
}

/** Spawn a wolf pack. Default position: a valid tile >= 14 tiles (and off-screen) from the player, on the side of targetTile if given. */
export function spawnPack(game, o = {}) {
  const s = S(game), r = rt(game), size = Math.max(1, o.size ?? A.packSizeForDay(game.state.time.day));
  let pos = o.x != null ? { x: o.x, y: o.y } : null;
  if (!pos) {
    const px = r.px, py = r.py;
    pos = A.pickRingPoint(rand, px, py, SPAWN.minDistFromPlayer + 2, AI.spawnMax - 4, (x, y) => validSpawn(game, x, y, true), 40)
      || A.pickRingPoint(rand, px, py, SPAWN.minDistFromPlayer, AI.spawnMax + 10, (x, y) => validSpawn(game, x, y, true), 80);
    if (o.targetTile && pos) { // prefer the ring point nearest the target side
      const tx = o.targetTile.tx * TILE, ty = o.targetTile.ty * TILE;
      let best = pos, bd = Math.hypot(pos.x - tx, pos.y - ty);
      for (let i = 0; i < 12; i++) {
        const q = A.pickRingPoint(rand, px, py, SPAWN.minDistFromPlayer + 2, AI.spawnMax, (x, y) => validSpawn(game, x, y, true), 6);
        if (q) { const d = Math.hypot(q.x - tx, q.y - ty); if (d < bd) { bd = d; best = q; } }
      }
      pos = best;
    }
  }
  if (!pos) return [];
  const id = s.nextPack++;
  s.packs[id] = { id, kind: 'wolf', size, en: o.enraged ? 1 : 0, tx: o.targetTile ? o.targetTile.tx : -1, ty: o.targetTile ? o.targetTile.ty : 0, nextLunge: 0, dir: rand() < 0.5 ? 1 : -1 };
  const out = [];
  for (let i = 0; i < size; i++) {
    let x = pos.x + Math.cos(i * 2.1) * 26 * (i ? 1 : 0), y = pos.y + Math.sin(i * 2.1) * 26 * (i ? 1 : 0);
    if (!validSpawn(game, x, y, true)) { x = pos.x; y = pos.y; }
    out.push(spawnCreature(game, 'wolf', x, y, { pack: id, packSize: size, enraged: o.enraged, ai: 'circle' }));
  }
  return out;
}

function validSpawn(game, x, y, ignoreCamera) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), w = game.world;
  if (!w.inBounds(tx, ty) || w.isBlocked(tx, ty, { creature: true }) || w.objectAt(tx, ty)) return false;
  const t = w.terrainAt(tx, ty);
  if (t !== 'snow' && t !== 'deep_snow') return false;
  const r = rt(game), dx = x - r.px, dy = y - r.py;
  if (dx * dx + dy * dy < (SPAWN.minDistFromPlayer * TILE) ** 2) return false;
  const cam = game.camera;
  if (!ignoreCamera && cam && cam.rx !== undefined && x > cam.rx - 64 && x < cam.rx + cam.w + 64 && y > cam.ry - 64 && y < cam.ry + cam.h + 64) return false;
  if (ignoreCamera && cam && cam.rx !== undefined && x > cam.rx - 16 && x < cam.rx + cam.w + 16 && y > cam.ry - 16 && y < cam.ry + cam.h + 16) return false;
  return true;
}

function counts(game, local) {
  const out = { rabbit: 0, deer: 0, wolf: 0, bear: 0 }, r = rt(game), lim = (AI.activeRadius * TILE) ** 2;
  for (const c of S(game).list) {
    if (local) { const dx = c.x - r.px, dy = c.y - r.py; if (dx * dx + dy * dy > lim) continue; }
    out[c.type]++;
  }
  return out;
}

function spawnHerd(game, x, y, n) {
  const s = S(game), id = s.nextPack++;
  s.packs[id] = { id, kind: 'herd', size: n, en: 0, tx: -1, ty: 0, nextLunge: 0, dir: 1 };
  for (let i = 0; i < n; i++) {
    let hx = x + Math.cos(i * 2.4) * 30 * i, hy = y + Math.sin(i * 2.4) * 30 * i;
    if (!game.world.inBounds(Math.floor(hx / TILE), Math.floor(hy / TILE)) || game.world.isBlocked(Math.floor(hx / TILE), Math.floor(hy / TILE), { creature: true })) { hx = x; hy = y; }
    spawnCreature(game, 'deer', hx, hy, { pack: id, packSize: n });
  }
}

/** Initial world population (deterministic per seed): rabbits, deer herds, one bear per den. */
function seedWorld(game) {
  const s = S(game), w = game.world, rng = createRng((game.state.seed ^ 0x5eed) >>> 0);
  s.seeded = true;
  const sp = w.spawnPx();
  const okTile = (tx, ty) => w.inBounds(tx, ty) && !w.isBlocked(tx, ty, { creature: true }) && !w.objectAt(tx, ty) && ['snow', 'deep_snow'].includes(w.terrainAt(tx, ty));
  const pick = () => {
    for (let i = 0; i < 60; i++) {
      const tx = rng.int(6, w.w - 7), ty = rng.int(6, w.h - 7);
      if (!okTile(tx, ty)) continue;
      const c = w.tileCenter(tx, ty);
      if (Math.hypot(c.x - sp.x, c.y - sp.y) < AI.seedMinFromSpawn * TILE) continue;
      return c;
    }
    return null;
  };
  const rabbitN = Math.round(SPAWN.caps.rabbit * 1.4), deerN = Math.round(SPAWN.caps.deer * 1.2);
  for (let i = 0; i < rabbitN; i++) { const c = pick(); if (c) spawnCreature(game, 'rabbit', c.x, c.y); }
  let d = 0;
  while (d < deerN) { const c = pick(); if (!c) break; const n = rng.int(...CREATURES.deer.herd); spawnHerd(game, c.x, c.y, n); d += n; }
  s.dens = [];
  for (const p of w.pois()) if (p.type === 'bear_den') {
    const c = w.tileCenter(p.tx, p.ty), idx = s.dens.length;
    s.dens.push({ tx: p.tx, ty: p.ty, id: 0, respawnDay: 0 });
    placeBear(game, idx, c);
  }
}
function placeBear(game, idx, c) {
  const den = S(game).dens[idx], w = game.world;
  // stand beside the den on a free tile
  let x = c.x, y = c.y;
  for (let r = 0; r <= 3 && w.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE), { creature: true }); r++) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const tx = den.tx + dx * (r + 1), ty = den.ty + dy * (r + 1);
      if (!w.isBlocked(tx, ty, { creature: true })) { const t = w.tileCenter(tx, ty); x = t.x; y = t.y; r = 99; break; }
    }
  }
  const b = spawnCreature(game, 'bear', x, y, { home: { x: c.x, y: c.y }, den: idx });
  den.id = b.id;
}

function spawnManager(game, r, dt) {
  const s = S(game), tm = game.state.time, day = tm.day;
  s.spawnT -= dt;
  if (s.spawnT > 0) return;
  s.spawnT = AI.spawnInterval;
  const cnt = counts(game, true), room = A.spawnRoom(cnt, SPAWN.caps);
  const total = s.list.length;
  // prey top-up near the player
  if (room.rabbit > 0 && total < AI.populationCap) {
    const pt = A.pickRingPoint(rand, r.px, r.py, AI.spawnMin, AI.spawnMax, (x, y) => validSpawn(game, x, y, false));
    if (pt) spawnCreature(game, 'rabbit', pt.x, pt.y);
  } else if (room.deer >= 2 && total < AI.populationCap - 3 && cnt.deer <= SPAWN.caps.deer - 2) {
    const pt = A.pickRingPoint(rand, r.px, r.py, AI.spawnMin + 4, AI.spawnMax, (x, y) => validSpawn(game, x, y, false));
    if (pt) spawnHerd(game, pt.x, pt.y, Math.min(room.deer, Math.round(range(2, 4.49))));
  }
  // far prey leaves
  const far = (AI.despawnRadius * TILE) ** 2;
  for (let i = s.list.length - 1; i >= 0; i--) {
    const c = s.list[i], def = CREATURES[c.type];
    const dx = c.x - r.px, dy = c.y - r.py, d2 = dx * dx + dy * dy;
    if (!def.hostile && d2 > far) removeCreature(game, c);
    else if (c.type === 'wolf' && !c.en && !r.night && d2 > (W.despawnDist * TILE) ** 2 && !offscreenCheckVisible(game, c)) removeCreature(game, c);
    else if (c.type === 'wolf' && !c.en && c.mode === 'flee' && d2 > (W.despawnDist * TILE) ** 2 && !offscreenCheckVisible(game, c)) removeCreature(game, c);
  }
  // wolves at night
  if (r.night) {
    const alive = counts(game, false).wolf;
    if (s.packDay !== day) { s.packDay = day; s.packsTonight = 0; }
    if (s.packsTonight === 0 || (alive === 0 && s.clock - s.packClock > W.secondPackDelay && s.packsTonight < W.maxPacksPerNight)) {
      const size = A.packSizeForDay(day);
      if (spawnPack(game, { size }).length) { s.packsTonight++; s.packClock = s.clock; }
    }
  }
  // bear respawn
  for (let i = 0; i < s.dens.length; i++) {
    const d = s.dens[i];
    if (d.id === 0 && d.respawnDay && day >= d.respawnDay) {
      const c = game.world.tileCenter(d.tx, d.ty);
      if (Math.hypot(c.x - r.px, c.y - r.py) > SPAWN.minDistFromPlayer * TILE) { d.respawnDay = 0; placeBear(game, i, c); }
    }
  }
}
function offscreenCheckVisible(game, c) {
  const cam = game.camera;
  return !!(cam && cam.rx !== undefined && c.x > cam.rx - 32 && c.x < cam.rx + cam.w + 32 && c.y > cam.ry - 32 && c.y < cam.ry + cam.h + 32);
}

function removeCreature(game, c) {
  const s = S(game), i = s.list.indexOf(c);
  if (i >= 0) s.list.splice(i, 1);
  if (c.pack && !s.list.some((o) => o.pack === c.pack)) delete s.packs[c.pack];
  if (c.type === 'bear' && c.den >= 0 && s.dens[c.den]) s.dens[c.den].id = 0;
}

// ---------------------------------------------------------------- damage / death
export function hurtCreature(game, c, dmg, o = {}) {
  if (c.hp <= 0) return false;
  const def = CREATURES[c.type], s = S(game);
  c.hp -= dmg; c.hurt = COMBAT.hitFlash;
  const ang = o.angle;
  if (ang !== undefined && o.knock !== false) {
    const k = COMBAT.knockback * TILE * 12 * (def.radius > 0.5 ? 0.35 : 1) * (o.knock || 1);
    c.kx = Math.cos(ang) * k; c.ky = Math.sin(ang) * k;
  }
  if (o.source !== 'spikes') {
    if (def.hostile) {
      c.aggro = c.type === 'bear' ? B.aggroSeconds : W.aggroSeconds;
      if (c.pack) for (const m of roster(rt(game), c.pack)) if (m !== c && Math.hypot(m.x - c.x, m.y - c.y) < 15 * TILE) m.aggro = W.aggroSeconds;
    } else {
      c.alert = (def.herd ? AI.deer.fleeSeconds : AI.rabbit.fleeSeconds) + 2; c.ai = 'flee'; c.t = 0;
      if (c.pack) for (const m of roster(rt(game), c.pack)) if (m !== c) { m.alert = AI.deer.fleeSeconds + 1; m.ai = 'flee'; m.t = 0; }
    }
    if ((c.ai === 'telegraph' || c.ai === 'windup') && !def.poise) { c.ai = 'recover'; c.t = 0; }   // hits interrupt a wind-up, except from creatures with poise (bear)
  }
  game.events.emit('creature:hit', { c, dmg, source: o.source || 'player' });
  if (c.hp <= 0) { killCreature(game, c, o.source || 'player'); return true; }
  return false;
}

export function killCreature(game, c, source = 'player') {
  const s = S(game), def = CREATURES[c.type];
  c.hp = 0;
  removeCreature(game, c);
  if (c.type === 'bear' && c.den >= 0 && s.dens[c.den]) s.dens[c.den].respawnDay = game.state.time.day + B.respawnDays;
  const k = { id: s.nextId++, type: c.type, x: c.x, y: c.y, face: c.face, ttl: AI.carcassSeconds, bt: 0, btTick: -99 };
  s.carcasses.push(k);
  if (s.carcasses.length > 14) s.carcasses.shift();
  game.events.emit('creature:killed', { c, by: source });
  game.events.emit('carcass:created', { carcass: k });
  void def;
}

// ---------------------------------------------------------------- steering helpers
const angleTo = (c, x, y) => Math.atan2(y - c.y, x - c.x);
const distTiles = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) / TILE;

function setDir(c, ux, uy, sp) {
  const l = Math.hypot(ux, uy);
  if (l < 1e-5) { c.mx = c.my = 0; } else { c.mx = ux / l; c.my = uy / l; }
  c.sp = sp;
}
function fleeFrom(c, fx, fy, sp, jitter = 0) {
  let a = Math.atan2(c.y - fy, c.x - fx);
  if (jitter) a += (rand() - 0.5) * 2 * jitter;
  setDir(c, Math.cos(a), Math.sin(a), sp);
}
/** Head for (gx,gy): straight if the way is clear, else one BFS step; sets c.np when no path exists (sealed in). */
function navigate(game, c, gx, gy, sp, usePath = true) {
  const r = rt(game), def = CREATURES[c.type], rpx = def.radius * TILE;
  const dx = gx - c.x, dy = gy - c.y, d = Math.hypot(dx, dy);
  c.np = 0; c.sp = sp;
  if (d < 3) { c.mx = c.my = 0; return; }
  let ux = dx / d, uy = dy / d;
  if (usePath && !lineClear(r.blocked, c.x, c.y, gx, gy, rpx, r.hit)) {
    const res = r.pather.nextStep(r.blocked, Math.floor(c.x / TILE), Math.floor(c.y / TILE), Math.floor(gx / TILE), Math.floor(gy / TILE), (d < 14 * TILE ? AI.bfs.maxNodes : AI.bfs.farNodes), r.out);
    if (res === 1) {
      const wx = (r.out.tx + 0.5) * TILE - c.x, wy = (r.out.ty + 0.5) * TILE - c.y, wl = Math.hypot(wx, wy);
      if (wl > 1) { ux = wx / wl; uy = wy / wl; }
    } else if (res === 0) c.np = 1;
  }
  c.mx = ux; c.my = uy;
}
function separate(game, c, strength = 0.8) {
  let sx = 0, sy = 0; const lim = 1.5 * TILE;
  for (const o of S(game).list) {
    if (o === c) continue;
    const dx = c.x - o.x, dy = c.y - o.y, d2 = dx * dx + dy * dy;
    if (d2 > lim * lim || d2 < 0.01) continue;
    const d = Math.sqrt(d2), f = (lim - d) / lim;
    sx += (dx / d) * f; sy += (dy / d) * f;
  }
  if (sx || sy) { c.mx += sx * strength; c.my += sy * strength; const l = Math.hypot(c.mx, c.my); if (l > 1) { c.mx /= l; c.my /= l; } }
}

/** Idle/wander behaviour shared by rabbit, deer leaders and bears. */
function wander(game, c, cfg, cx, cy, radiusTiles, speedMult) {
  if (c.ai === 'wander') {
    const d = Math.hypot(c.tx0 - c.x, c.ty0 - c.y);
    if (d < 0.5 * TILE || c.t > 9) { c.ai = 'idle'; c.t = 0; c.pz = range(...cfg.pause); c.mx = c.my = 0; }
    else navigate(game, c, c.tx0, c.ty0, speedMult);
    return;
  }
  c.mx = c.my = 0;
  if (c.t >= c.pz) {
    for (let i = 0; i < 6; i++) {
      const a = rand() * TAU, d = range(1, cfg.wander) * TILE, gx = cx + Math.cos(a) * d, gy = cy + Math.sin(a) * d;
      const dd = Math.hypot(gx - cx, gy - cy);
      if (dd > radiusTiles * TILE) continue;
      const tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE);
      if (CW.isBlockedForCreature(game, tx, ty)) continue;
      c.tx0 = gx; c.ty0 = gy; c.ai = 'wander'; c.t = 0; navigate(game, c, gx, gy, speedMult); return;
    }
    c.pz = range(0.5, 1.5); c.t = 0;
  }
}

// ---------------------------------------------------------------- AI: prey
function thinkRabbit(game, c, r) {
  const def = CREATURES.rabbit, dist = distTiles(c.x, c.y, r.px, r.py), fr = A.fleeRange(def, r.psprint);
  if (dist < fr || c.alert > 0) {
    if (c.ai !== 'flee') { c.ai = 'flee'; c.t = 0; }
    fleeFrom(c, r.px, r.py, 1, AI.rabbit.zigzag);
    if (dist < fr) c.alert = Math.max(c.alert, 0.6);
    // keep away from walls: navigate a point ahead if the straight flee is blocked
    const gx = c.x + c.mx * 4 * TILE, gy = c.y + c.my * 4 * TILE;
    if (!lineClear(r.blocked, c.x, c.y, gx, gy, def.radius * TILE)) { c.mx += (rand() - 0.5) * 1.6; c.my += (rand() - 0.5) * 1.6; setDir(c, c.mx, c.my, 1); }
    return;
  }
  if (c.ai === 'flee') { c.ai = 'idle'; c.t = 0; c.pz = range(...AI.rabbit.pause); c.mx = c.my = 0; }
  wander(game, c, AI.rabbit, c.x, c.y, AI.rabbit.wander, 0.5);
}

function thinkDeer(game, c, r) {
  const def = CREATURES.deer, dist = distTiles(c.x, c.y, r.px, r.py), fr = A.fleeRange(def, r.psprint);
  const ros = c.pack ? roster(r, c.pack) : null;
  if (dist < fr) {
    c.alert = AI.deer.fleeSeconds;
    if (ros) for (const m of ros) if (m !== c && distTiles(m.x, m.y, c.x, c.y) < AI.deer.alertShare) m.alert = Math.max(m.alert, AI.deer.fleeSeconds);
  }
  if (c.alert > 0) {
    if (c.ai !== 'flee') { c.ai = 'flee'; c.t = 0; }
    fleeFrom(c, r.px, r.py, 1, 0.12);
    const gx = c.x + c.mx * 5 * TILE, gy = c.y + c.my * 5 * TILE;
    if (!lineClear(r.blocked, c.x, c.y, gx, gy, def.radius * TILE)) navigate(game, c, gx, gy, 1);
    separate(game, c, 0.5);
    return;
  }
  if (c.ai === 'flee') { c.ai = 'idle'; c.t = 0; c.pz = range(...AI.deer.pause); c.mx = c.my = 0; }
  const leader = ros && ros[0] !== c ? ros[0] : null;
  if (leader && distTiles(c.x, c.y, leader.x, leader.y) > AI.deer.herdLeash) { c.ai = 'follow'; navigate(game, c, leader.x, leader.y, 0.7); separate(game, c, 0.7); return; }
  if (c.ai === 'follow') { c.ai = 'idle'; c.t = 0; c.pz = range(0.5, 2); c.mx = c.my = 0; }
  if (leader) { c.mx = c.my = 0; return; }
  wander(game, c, AI.deer, c.x, c.y, AI.deer.wander, 0.45);
}

// ---------------------------------------------------------------- AI: wolf
function nearGuardedKill(game, r) {
  const s = S(game);
  for (const k of s.carcasses) {
    if (distTiles(k.x, k.y, r.px, r.py) > W.guardR) continue;
    for (const o of s.list) if (o.type === 'wolf' && o.hp > 0 && o.mode !== 'flee' && distTiles(o.x, o.y, k.x, k.y) < 3.5) return true;
  }
  return false;
}

function pickStructureTarget(game, r, c) {
  // after a failed BFS the flood region around the goal is still in pather.region: find the closest blocking structure bordering it
  const reg = r.pather.region, n = r.pather.regionSize, w = game.world.w;
  let best = null, bd = Infinity;
  for (let i = 0; i < n; i++) {
    const tx = reg[i] % w, ty = (reg[i] / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = tx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = ty + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!CW.blockingStructure(game, nx, ny)) continue;
      const dd = Math.hypot((nx + 0.5) * TILE - c.x, (ny + 0.5) * TILE - c.y);
      if (dd < bd) { bd = dd; best = r.hit; r.hit.tx = nx; r.hit.ty = ny; }
    }
  }
  return best;
}

function thinkWolf(game, c, r) {
  const s = S(game), def = CREATURES.wolf, pk = s.packs[c.pack], ros = roster(r, c.pack);
  const dist = distTiles(c.x, c.y, r.px, r.py);
  c.ign = A.fearMode({ day: r.day, packSize: c.ps, enraged: !!c.en });   // 0 fears all fire, 1 torches only, 2 nothing
  const hpFrac = c.hp / def.hp;
  const mode = A.wolfMode({ night: r.night, enraged: !!c.en, dist, playerHp: r.php, hpFrac, aggro: c.aggro > 0, nearKill: nearGuardedKill(game, r), hunting: c.mode === HUNT, sight: WOLF.nightHuntRadius });
  if (mode !== c.mode) { c.mode = mode; if (mode === HUNT && c.ai !== 'telegraph' && c.ai !== 'lunge' && c.ai !== 'recover') { c.ai = 'circle'; c.t = 0; } }
  if (c.ai === 'telegraph' || c.ai === 'lunge' || c.ai === 'recover') { if (mode === 'flee') { c.ai = 'flee'; } else return; }

  if (mode === 'flee') { c.ai = 'flee'; fleeFrom(c, r.px, r.py, 1.15, 0.2); const gx = c.x + c.mx * 5 * TILE, gy = c.y + c.my * 5 * TILE; if (!lineClear(r.blocked, c.x, c.y, gx, gy, def.radius * TILE)) navigate(game, c, gx, gy, 1.15); return; }

  if (mode === 'avoid') {
    // daytime: keep distance, leave; hover around a carcass if one is near
    const k = carcassNear(game, c.x, c.y, W.carcassSense);
    if (k) { feedOrApproach(game, c, k); return; }
    c.ai = 'avoid';
    const [kmin] = W.keepDistDay;
    if (dist < W.keepDistDay[1]) fleeFrom(c, r.px, r.py, dist < kmin ? 1 : 0.45, 0.3); else c.mx = c.my = 0;
    if (c.mx || c.my) { const gx = c.x + c.mx * 4 * TILE, gy = c.y + c.my * 4 * TILE; if (!lineClear(r.blocked, c.x, c.y, gx, gy, def.radius * TILE)) navigate(game, c, gx, gy, c.sp); }
    return;
  }

  if (mode === 'prowl') {
    const k = carcassNear(game, c.x, c.y, W.carcassSense);
    if (k && dist > W.carcassSense * 0.8) { feedOrApproach(game, c, k); return; }
    c.ai = 'prowl';
    const leader = ros[0] !== c && ros.length ? ros[0] : null;
    if (leader && distTiles(c.x, c.y, leader.x, leader.y) > 4) navigate(game, c, leader.x, leader.y, 0.8);
    else if (dist < W.prowlDrift) navigate(game, c, r.px, r.py, 0.62, true);
    else c.mx = c.my = 0;
    if (leader) separate(game, c, 0.9);
    return;
  }

  if (mode === 'march') { // enraged, target far away: go for the target tile (tower) or the player
    c.ai = 'march';
    const tx = pk && pk.tx >= 0 ? (pk.tx + 0.5) * TILE : r.px, ty = pk && pk.tx >= 0 ? (pk.ty + 0.5) * TILE : r.py;
    navigate(game, c, tx, ty, 1, distTiles(c.x, c.y, tx, ty) < 14);
    separate(game, c, 0.6);
    if (c.np && A.shouldAttackStructures({ type: 'wolf', day: r.day, aggro: true, hasPath: false, enraged: true })) engageStructure(game, c, r);
    else if (pk && pk.tx >= 0 && distTiles(c.x, c.y, tx, ty) < 1.8) { const o = CW.blockingStructure(game, pk.tx, pk.ty); if (o) { c.stx = pk.tx; c.sty = pk.ty; c.ai = 'struct'; } }
    return;
  }

  // ---- hunt ----
  const idx = Math.max(0, ros.indexOf(c));
  const phase = s.clock * 0.35 * (pk ? pk.dir : 1);
  const ang = A.circleSlotAngle(idx, ros.length || 1, phase);
  const R = W.circleR;
  const slotX = r.px + Math.cos(ang) * R * TILE, slotY = r.py + Math.sin(ang) * R * TILE;
  const sees = dist < 16 && lineClear(r.blocked, c.x, c.y, r.px, r.py, def.radius * TILE);
  const useSlot = sees && dist < R + 4 && !CW.isBlockedForCreature(game, Math.floor(slotX / TILE), Math.floor(slotY / TILE));
  c.ai = dist > R + 1.5 ? 'stalk' : 'circle';
  if (useSlot) navigate(game, c, slotX, slotY, c.ai === 'stalk' ? 1 : W.circleSpeedMult, true);
  else navigate(game, c, r.px, r.py, 1, dist < 15);
  separate(game, c, 0.7);
  if (c.np) {
    if (A.shouldAttackStructures({ type: 'wolf', day: r.day, aggro: true, hasPath: false, enraged: !!c.en })) { engageStructure(game, c, r); return; }
    c.ai = 'circle'; return; // sealed in and walls are not yet chewable: pace around
  }
  c.stx = -1;
  // lunge?
  if (c.cd <= 0 && c.ct <= 0 && dist <= W.lungeRange && (!pk || s.clock >= pk.nextLunge) && game.mode === 'playing') {
    let lungers = 0; for (const m of ros) if (m.ai === 'telegraph' || m.ai === 'lunge') lungers++;
    if (lungers < W.maxLungers(ros.length || 1) && lineClear(r.blocked, c.x, c.y, r.px, r.py, def.radius * TILE)) {
      if (c.ign < A.FEAR_NONE) { // never lunge from or into a lit area (the lit areas this wolf still fears)
        const n = fearList(r, c.ign), ex = c.x + (r.px - c.x) * 0.9, ey = c.y + (r.py - c.y) * 0.9;
        if (A.inLitRadius(c.x, c.y, r.fireList, n, W.fireMargin) || A.inLitRadius(ex, ey, r.fireList, n, 0) || A.inLitRadius(r.px, r.py, r.fireList, n, 0)) return;
      }
      c.ai = 'telegraph'; c.t = 0; c.mx = c.my = 0; c.cd = def.cooldown; c.face = r.px >= c.x ? 1 : -1;
      if (pk) pk.nextLunge = s.clock + W.packGap;
    }
  }
}

function feedOrApproach(game, c, k) {
  const d = distTiles(c.x, c.y, k.x, k.y);
  if (d < 1.2) { c.ai = 'feed'; c.fk = k.id; c.mx = c.my = 0; return; }
  c.ai = 'prowl'; navigate(game, c, k.x, k.y, 0.7);
}

function engageStructure(game, c, r) {
  const t = pickStructureTarget(game, r, c);
  if (!t) { c.ai = 'circle'; return; }
  c.stx = t.tx; c.sty = t.ty; c.ai = 'struct';
  const gx = (t.tx + 0.5) * TILE, gy = (t.ty + 0.5) * TILE;
  if (distTiles(c.x, c.y, gx, gy) > 1.45) { const sv = c.np; navigate(game, c, gx, gy, 1, false); c.np = sv; } else { c.mx = c.my = 0; }
}

// per-tick wolf states
function tickWolf(game, c, dt, r) {
  const def = CREATURES.wolf;
  if (c.ai === 'telegraph') {
    c.t += dt; c.mx = c.my = 0; c.face = r.px >= c.x ? 1 : -1;
    if (c.t >= W.telegraph) {
      const a = angleTo(c, r.px, r.py); c.lx = Math.cos(a); c.ly = Math.sin(a); c.ai = 'lunge'; c.t = 0; c.hitd = 0; c.stuckL = 0;
      game.events.emit('creature:lunge', { c });
    }
  } else if (c.ai === 'lunge') {
    c.t += dt;
    c.mx = c.lx; c.my = c.ly; c.sp = W.lungeSpeed / def.speed;
    if (!c.hitd && game.mode === 'playing') {
      const reach = (def.radius + PLAYER.radius + W.hitReach) * TILE;
      if (Math.hypot(r.px - c.x, r.py - c.y) <= reach) {
        c.hitd = 1; damagePlayer(game, def.dmg, 'wolf', { bleed: 0.35 });
      }
    }
    if (c.t * W.lungeSpeed >= W.lungeDist || (c.stuckL)) { c.ai = 'recover'; c.t = 0; }
  } else if (c.ai === 'recover') {
    c.t += dt; c.mx = -c.lx * 0.5; c.my = -c.ly * 0.5; c.sp = 0.8;
    if (c.t >= W.recover) { c.ai = 'circle'; c.t = 0; c.ct = range(...W.circleTime); c.mx = c.my = 0; }
  } else if (c.ai === 'struct') {
    c.hitStructT = (c.hitStructT || 0) - dt;
    if (c.stx >= 0 && c.hitStructT <= 0) {
      const gx = (c.stx + 0.5) * TILE, gy = (c.sty + 0.5) * TILE;
      if (Math.hypot(gx - c.x, gy - c.y) <= 1.45 * TILE) {
        c.hitStructT = W.structureHitInterval; c.mx = c.my = 0; c.face = gx >= c.x ? 1 : -1;
        const o = CW.structureAt(game, c.stx, c.sty);
        const res = CW.hitStructure(game, c.stx, c.sty, def.dmg * W.structureDmgMult, 'wolf');
        if (o) { const dps = CW.spikesAt(game, c.stx, c.sty); if (dps) hurtCreature(game, c, dps * W.structureHitInterval, { source: 'spikes' }); }
        if (!res || res.destroyed) { c.ai = 'circle'; c.stx = -1; }
      }
    }
  } else if (c.ai === 'feed') {
    c.mx = c.my = 0;
    const k = S(game).carcasses.find((q) => q.id === c.fk);
    if (!k) c.ai = 'prowl'; else k.ttl -= dt * (W.feedRate - 1);
  }
}

// ---------------------------------------------------------------- AI: bear
function thinkBear(game, c, r) {
  const def = CREATURES.bear, den = { x: c.hx, y: c.hy };
  const pToDen = distTiles(r.px, r.py, den.x, den.y), bToDen = distTiles(c.x, c.y, den.x, den.y);
  if (c.ai === 'windup' || c.ai === 'recover') return;
  const cur = c.ai === 'charge' ? 'charge' : c.ai === 'home' ? 'home' : 'idle';
  const mode = A.bearMode({ playerToDen: pToDen, bearToDen: bToDen, aggro: c.aggro, current: cur, territory: def.territory, leash: def.leash });
  c.mode = mode;
  if (mode === 'charge' && c.ai === 'struct' && c.stx >= 0) return;
  if (mode === 'charge') {
    c.ai = 'charge';
    const dist = distTiles(c.x, c.y, r.px, r.py);
    navigate(game, c, r.px, r.py, B.charge, dist < 14);
    if (c.np) { engageBearStructure(game, c, r); return; }
    const reach = (def.radius + PLAYER.radius + B.reach);
    if (dist <= reach + 0.3 && c.cd <= 0 && game.mode === 'playing') { c.ai = 'windup'; c.t = 0; c.mx = c.my = 0; c.face = r.px >= c.x ? 1 : -1; c.cd = def.cooldown; }
  } else if (mode === 'home') {
    c.ai = 'home'; navigate(game, c, den.x, den.y, 0.9, true);
    if (bToDen < 1.5) { c.ai = 'idle'; c.t = 0; c.pz = range(...B.pause); c.mx = c.my = 0; }
  } else {
    if (c.ai === 'home' || c.ai === 'charge') { c.ai = 'idle'; c.t = 0; c.pz = range(...B.pause); }
    wander(game, c, B, den.x, den.y, 3, 0.4);
  }
}
function engageBearStructure(game, c, r) {
  const t = pickStructureTarget(game, r, c);
  if (!t) return;
  c.stx = t.tx; c.sty = t.ty; c.ai = 'struct';
}
function tickBear(game, c, dt, r) {
  const def = CREATURES.bear;
  if (c.ai === 'windup') {
    c.t += dt; c.mx = c.my = 0; c.face = r.px >= c.x ? 1 : -1;
    if (c.t >= B.telegraph) {
      const reach = (def.radius + PLAYER.radius + B.reach + 0.35) * TILE;
      if (Math.hypot(r.px - c.x, r.py - c.y) <= reach && game.mode === 'playing') damagePlayer(game, def.dmg, 'bear', { bleed: 0.35 });
      c.ai = 'recover'; c.t = 0;
      game.events.emit('creature:swipe', { c });
    }
  } else if (c.ai === 'recover') {
    c.t += dt; c.mx = c.my = 0;
    if (c.t >= 0.5) { c.ai = 'charge'; c.t = 0; }
  } else if (c.ai === 'struct') {
    c.hitStructT = (c.hitStructT || 0) - dt;
    if (c.stx >= 0) {
      const gx = (c.stx + 0.5) * TILE, gy = (c.sty + 0.5) * TILE, d = Math.hypot(gx - c.x, gy - c.y);
      if (d > 1.6 * TILE) { navigate(game, c, gx, gy, 1, false); c.np = 0; }
      else { c.mx = c.my = 0; if (c.hitStructT <= 0) { c.hitStructT = B.structureHitInterval; const res = CW.hitStructure(game, c.stx, c.sty, def.dmg, 'bear'); if (!res || res.destroyed) { c.ai = 'charge'; c.stx = -1; } } }
    } else c.ai = 'charge';
  }
}

// ---------------------------------------------------------------- movement
function moveCreature(game, c, dt, def, r) {
  const rpx = def.radius * TILE, world = game.world;
  let ux = c.mx, uy = c.my, sp = c.sp, kx = 0, ky = 0;
  if (c.kx || c.ky) {
    kx = c.kx * dt; ky = c.ky * dt; const f = Math.exp(-dt * 10); c.kx *= f; c.ky *= f;
    if (Math.abs(c.kx) + Math.abs(c.ky) < 4) c.kx = c.ky = 0;
  }
  if (c.et > 0) { c.et -= dt; ux = c.ex; uy = c.ey; if (sp < 0.8) sp = 0.8; }
  let dx = 0, dy = 0, want = 0;
  if (ux || uy) {
    // obstacle look-ahead: bend around trees/rocks/walls
    const la = rpx + 10;
    if (CW.isBlockedForCreature(game, Math.floor((c.x + ux * la) / TILE), Math.floor((c.y + uy * la) / TILE))) {
      const a0 = Math.atan2(uy, ux), s = c.bs;
      for (let i = 0; i < 6; i++) {
        const da = (i < 2 ? 0.6 : i < 4 ? 1.25 : 1.9) * (i % 2 === 0 ? s : -s), a = a0 + da;
        const cx = Math.cos(a), cy = Math.sin(a);
        if (!CW.isBlockedForCreature(game, Math.floor((c.x + cx * la) / TILE), Math.floor((c.y + cy * la) / TILE))) { ux = cx; uy = cy; if (i % 2 === 1) c.bs = -c.bs; break; }
      }
    }
    // fire fear: wolves do not step into a lit radius (and are pushed out if caught inside)
    if (c.type === 'wolf' && c.ign < A.FEAR_NONE && c.ai !== 'flee') {
      const n = fearList(r, c.ign);
      if (n) {
        const f = A.inLitRadius(c.x, c.y, r.fireList, n, 0);
        if (f) { const ox = c.x - f.x, oy = c.y - f.y, l = Math.hypot(ox, oy) || 1; ux = ox / l; uy = oy / l; sp = 1.1; }
        else {
          const step = def.speed * sp * TILE * dt;
          const g = A.inLitRadius(c.x + ux * (step + 6), c.y + uy * (step + 6), r.fireList, n, W.fireMargin * 0.5);
          if (g) {
            const ox = c.x - g.x, oy = c.y - g.y, l = Math.hypot(ox, oy) || 1, nx = ox / l, ny = oy / l, dot = -(ux * nx + uy * ny);
            if (dot > 0) { ux += nx * dot; uy += ny * dot; const ll = Math.hypot(ux, uy) || 1; ux /= ll; uy /= ll; }
            if (A.inLitRadius(c.x + ux * (step + 6), c.y + uy * (step + 6), r.fireList, n, W.fireMargin * 0.5)) { ux = 0; uy = 0; }
          }
        }
      }
    }
    if (ux || uy) {
      const tl = Math.floor(c.x / TILE), tt = Math.floor(c.y / TILE);
      const step = def.speed * sp * TILE * world.terrainSpeed(tl, tt) * dt;
      dx = ux * step; dy = uy * step; want = step;
    }
  }
  const ox = c.x, oy = c.y;
  if (dx || dy || kx || ky) { const res = moveCircle(r.cworld, c.x, c.y, dx + kx, dy + ky, rpx); c.x = res.x; c.y = res.y; if (c.ai === 'lunge' && (res.hitX || res.hitY)) c.stuckL = 1; }
  const mvx = c.x - ox, mvy = c.y - oy, moved = Math.hypot(mvx, mvy);
  c.vx = mvx / dt; c.vy = mvy / dt;
  if (moved > 0.01) c.anim += moved / 14;
  if (ux > 0.25) c.face = 1; else if (ux < -0.25) c.face = -1;
  // cheap unstick: wanted to move but barely did for half a second -> sidestep for a moment, and repath
  if (want > 0) { c.sd += want; c.sa += Math.min(moved, want * 1.5); }
  c.sw += dt;
  if (c.sw >= AI.stuck.checkSeconds) {
    if (c.sd > 0 && c.sa < c.sd * AI.stuck.minProgress && c.ai !== 'struct' && c.ai !== 'feed') {
      const a = Math.atan2(c.my, c.mx) + (rand() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rand() - 0.5) * 0.9);
      c.ex = Math.cos(a); c.ey = Math.sin(a); c.et = AI.stuck.escapeSeconds;
      if (c.ai === 'wander') { c.ai = 'idle'; c.t = 0; c.pz = 0.2; }
    }
    c.sd = c.sa = c.sw = 0;
  }
}

// ---------------------------------------------------------------- spikes (structure contact damage)
function spikeContact(game, c, dt, def) {
  const rpx = def.radius * TILE + 3, tx0 = Math.floor((c.x - rpx) / TILE), tx1 = Math.floor((c.x + rpx) / TILE), ty0 = Math.floor((c.y - rpx) / TILE), ty1 = Math.floor((c.y + rpx) / TILE);
  let dps = 0;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!game.world.objectAt(tx, ty)) continue;
    const d = CW.spikesAt(game, tx, ty);
    if (d > 0) dps = Math.max(dps, d);
  }
  return dps;
}

// ---------------------------------------------------------------- system
export default {
  name: 'creatures',
  defaults: () => ({ list: [], packs: {}, carcasses: [], arrows: [], dens: [], clock: 0, nextId: 1, nextPack: 1, seeded: false, howled: false, packDay: 0, packsTonight: 0, packClock: 0, spawnT: 1 }),
  init(game) {
    G = game;
    game.creatureRt = null;
    game.creatures = { spawnCreature, spawnPack, hostilesNear, hasHostileNear, creaturesNear, hurtCreature, killCreature, carcassNear, debugSpawn, // all take `game` first
      get list() { return game.state.creatures.list; } };
    game.events.on('time:dusk', ({ day }) => {
      game.events.emit('creature:howl', { day });
      const s = game.state && game.state.creatures; if (!s) return;
      if (!s.howled) { s.howled = true; game.ui.toast?.(NEW_PACK_TOAST, 'bad', 4200); }
    });
  },
  onLoad(game) {
    G = game;
    game.creatureRt = makeRuntime(game);
    const s = S(game);
    s.arrows = s.arrows || []; s.carcasses = s.carcasses || [];
    const p = game.state.player; game.creatureRt.px = p.x; game.creatureRt.py = p.y;
    if (!s.seeded) seedWorld(game);
    rebuildRosters(game, game.creatureRt);
    refreshFires(game, game.creatureRt);
  },
  update(game, dt) {
    if (game.mode !== 'playing') return;
    G = game;
    const s = S(game), r = rt(game), p = game.state.player, tm = game.state.time;
    if (!r.registered && game.building && Array.isArray(game.building.blockers)) {
      r.registered = true;
      game.building.blockers.push((tx, ty) => { for (const c of s.list) if (Math.floor(c.x / TILE) === tx && Math.floor(c.y / TILE) === ty) return true; return false; });
    }
    s.clock += dt;
    r.px = p.x; r.py = p.y; r.psprint = !!p.sprinting; r.php = p.health; r.night = tm.phase === 'night'; r.day = tm.day;
    r.fireT -= dt; if (r.fireT <= 0) { r.fireT = 0.25; refreshFires(game, r); }
    r.rosterT -= dt; if (r.rosterT <= 0) { r.rosterT = 0.35; rebuildRosters(game, r); }
    const torch = heldTorch(game);
    r.torchOn = !!torch; if (torch) { r.torch.x = p.x; r.torch.y = p.y; }
    spawnManager(game, r, dt);

    const act2 = (AI.activeRadius * TILE) ** 2, list = s.list, interval = 1 / AI.thinkHz;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (!c || c.hp <= 0) continue;
      const dx = c.x - p.x, dy = c.y - p.y;
      if (dx * dx + dy * dy > act2) continue;
      const def = CREATURES[c.type];
      if (c.fz) { if (c.hurt > 0) c.hurt -= dt; continue; } // frozen (tests/debug)
      c.t += dt; c.cd -= dt; c.ct -= dt;
      if (c.hurt > 0) c.hurt -= dt;
      if (c.aggro > 0) c.aggro -= dt;
      if (c.alert > 0) c.alert -= dt;
      c.th -= dt;
      if (c.th <= 0) {
        c.th += interval * (0.85 + rand() * 0.3);
        switch (c.type) {
          case 'rabbit': thinkRabbit(game, c, r); break;
          case 'deer': thinkDeer(game, c, r); break;
          case 'wolf': thinkWolf(game, c, r); break;
          case 'bear': thinkBear(game, c, r); break;
        }
        const sd = spikeContact(game, c, interval, def);
        if (sd > 0 && c.hp > 0) { if (hurtCreature(game, c, sd * interval, { source: 'spikes' })) continue; }
      }
      if (c.type === 'wolf') tickWolf(game, c, dt, r); else if (c.type === 'bear') tickBear(game, c, dt, r);
      moveCreature(game, c, dt, def, r);
    }
    // carcasses decay
    for (let i = s.carcasses.length - 1; i >= 0; i--) { const k = s.carcasses[i]; k.ttl -= dt; if (k.ttl <= 0) s.carcasses.splice(i, 1); }
    // bears slowly regain health at home
    for (const c of list) if (c.type === 'bear' && c.ai === 'idle' && c.hp < CREATURES.bear.hp) c.hp = Math.min(CREATURES.bear.hp, c.hp + B.regen * dt);
  },
  drawables(game, cam, push) { if (game.creatureRt) pushCreatureDrawables(game, cam, push); },
  drawScreen(game, ctx, w, h) { if (game.creatureRt && game.mode !== 'title') drawCreatureScreen(game, ctx, w, h); },
};

/** Debug/test helper: spawn `type` at an offset (tiles) from the player. */
export function debugSpawn(game, type, dx = 4, dy = 0, opts = {}) {
  const p = game.state.player;
  return spawnCreature(game, type, p.x + dx * TILE, p.y + dy * TILE, opts);
}
export { A as ai };
