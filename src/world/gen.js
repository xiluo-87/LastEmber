// Seeded world generation (DESIGN §3). Pure / DOM-free. generateWorld(seed) -> plain serialisable world data.
// Pipeline: base terrain -> spawn clearing -> den rock blobs -> POIs -> resource scatter -> near-spawn guarantees -> reachability carve.
import { MAP, WORLD_GEN as P } from '../data/balance.js';
import { TERRAIN } from '../data/terrain.js';
import { NODES, LOOT } from '../data/structures.js';
import { createRng, fbm, valueNoise } from '../rng.js';
import { createWorld } from './world.js';

const T = { snow: TERRAIN.snow.code, deep: TERRAIN.deep_snow.code, ice: TERRAIN.ice.code, rock: TERRAIN.rock.code, cliff: TERRAIN.cliff.code };
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function paintBaseTerrain(seed, terr) {
  const { w, h } = MAP;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const bw = MAP.borderMin + (MAP.borderMax - MAP.borderMin) * valueNoise(seed + 7, x / 4, y / 4);
      let t = T.snow;
      if (edge < bw) t = T.cliff;
      else {
        const rock = fbm(seed + 17, x / 20, y / 20, 3);
        if (fbm(seed + 11, x / 14, y / 14, 3) > P.deepSnowThreshold) t = T.deep;
        if (fbm(seed + 13, x / 20, y / 20, 3) > P.lakeThreshold) t = T.ice;
        if (rock > P.rockThreshold) t = T.rock;
        if (rock > P.cliffThreshold && fbm(seed + 19, x / 7, y / 7, 2) > 0.55) t = T.cliff;
      }
      terr[y * w + x] = t;
    }
  }
}

function paintDisc(seed, terr, cx, cy, r, code, fuzz = 1.5, salt = 3) {
  for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++) {
    for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
      if (x < MAP.borderMin || y < MAP.borderMin || x >= MAP.w - MAP.borderMin || y >= MAP.h - MAP.borderMin) continue;
      if (dist(x, y, cx, cy) < r + (valueNoise(seed + salt, x / 2.5, y / 2.5) - 0.5) * 2 * fuzz) terr[y * MAP.w + x] = code;
    }
  }
}

function chooseDens(rng, spawn) {
  const count = rng.int(P.denCount[0], P.denCount[1]);
  const dens = [];
  for (let tries = 0; tries < 2000 && dens.length < count; tries++) {
    const tx = rng.int(14, MAP.w - 15), ty = rng.int(14, MAP.h - 15);
    if (dist(tx, ty, spawn.tx, spawn.ty) < P.denMinDistFromSpawn) continue;
    if (dens.some((d) => dist(tx, ty, d.tx, d.ty) < P.denSpacing)) continue;
    dens.push({ tx, ty });
  }
  return dens;
}

function rollLoot(rng) {
  const out = [];
  for (let i = 0; i < LOOT.wreckage.rolls; i++) {
    const e = rng.weighted(LOOT.wreckage.table);
    out.push({ item: e.item, n: rng.int(e.n[0], e.n[1]) });
  }
  return out;
}

function reachable(world, start) {
  const { w, h } = world, seen = new Uint8Array(w * h), q = [start.tx, start.ty];
  seen[start.ty * w + start.tx] = 1;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!world.inBounds(nx, ny) || seen[ny * w + nx] || world.isBlocked(nx, ny)) continue;
      seen[ny * w + nx] = 1; q.push(nx, ny);
    }
  }
  return seen;
}
const approachOk = (world, seen, tx, ty) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => world.inBounds(tx + dx, ty + dy) && seen[(ty + dy) * world.w + tx + dx]);

/** Cheapest path (cliffs/blockers cost extra, border band forbidden) then clear it. */
function carve(world, from, to) {
  const { w, h } = world, cost = new Float32Array(w * h).fill(Infinity), prev = new Int32Array(w * h).fill(-1);
  const heap = [[0, from.ty * w + from.tx]];
  cost[from.ty * w + from.tx] = 0;
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const goal = to.ty * w + to.tx;
  while (heap.length) {
    const [c, i] = pop();
    if (c > cost[i]) continue;
    if (i === goal) break;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!world.inBounds(nx, ny) || Math.min(nx, ny, w - 1 - nx, h - 1 - ny) < MAP.borderMin) continue;
      const ni = ny * w + nx;
      const step = 1 + (world.terrainCode(nx, ny) === T.cliff ? 8 : 0) + (world.objectAt(nx, ny) && world.isBlocked(nx, ny) ? 3 : 0);
      if (c + step < cost[ni]) { cost[ni] = c + step; prev[ni] = i; push([c + step, ni]); }
    }
  }
  for (let i = goal; i !== -1; i = prev[i]) {
    const x = i % w, y = (i / w) | 0;
    if (world.terrainCode(x, y) === T.cliff) world.setTerrain(x, y, 'snow');
    const o = world.objectAt(x, y);
    if (o && world.isBlocked(x, y) && !['crash_site', 'wreckage', 'bear_den'].includes(o.type)) world.removeObject(x, y);
  }
}

export function generateWorld(seed) {
  const { w, h } = MAP, rng = createRng(seed), spawn = { ...MAP.spawn };
  const terr = new Uint8Array(w * h);
  paintBaseTerrain(seed, terr);
  paintDisc(seed, terr, spawn.tx, spawn.ty, P.clearingRadius, T.snow, 1.2, 5);

  const denSites = chooseDens(rng, spawn);
  for (const d of denSites) paintDisc(seed, terr, d.tx, d.ty, rng.int(P.denRockRadius[0], P.denRockRadius[1]), T.rock, 1.6, 9);

  const data = { w, h, terrain: Array.from(terr, (c) => String.fromCharCode(48 + c)).join(''), objects: {}, spawn, pois: [] };
  const world = createWorld(data);
  const put = (tx, ty, type, extra = {}) => {
    const def = NODES[type], obj = { type, variant: def.variants > 1 ? rng.int(0, def.variants - 1) : 0, ...extra };
    world.setObject(tx, ty, obj);
    return obj;
  };
  const reserved = new Set(); // tiles (and neighbours) kept free of scatter
  const reserve = (tx, ty, r = 1) => { for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) reserved.add(y * w + x); };
  const isFree = (tx, ty, terrains) => world.inBounds(tx, ty) && !world.objectAt(tx, ty) && !reserved.has(ty * w + tx) && terrains.includes(world.terrainCode(tx, ty));
  const LAND = [T.snow, T.deep];

  // --- POIs ---
  const crash = { tx: spawn.tx + 2, ty: spawn.ty - 1 };
  put(crash.tx, crash.ty, 'crash_site', { loot: LOOT.crashCrate.map((l) => ({ ...l })) });
  reserve(crash.tx, crash.ty, 1);
  data.pois.push({ type: 'crash_site', ...crash });

  const seen0 = reachable(world, spawn);
  const quads = rng.shuffle([0, 1, 2, 3]).slice(0, P.wreckageCount);
  const parts = rng.shuffle([...LOOT.radioParts]);
  const wrecks = [];
  quads.forEach((q, qi) => {
    const x0 = q & 1 ? w / 2 : 0, y0 = q & 2 ? h / 2 : 0;
    for (let tries = 0; tries < 3000; tries++) {
      const relax = tries > 2000;
      const tx = rng.int(x0 + 8, x0 + w / 2 - 9), ty = rng.int(y0 + 8, y0 + h / 2 - 9);
      if (dist(tx, ty, spawn.tx, spawn.ty) < P.wreckageMinDist + 2) continue;
      if (!isFree(tx, ty, LAND) || !seen0[ty * w + tx]) continue;
      if (!relax && wrecks.some((o) => dist(tx, ty, o.tx, o.ty) < P.wreckageSpacing)) continue;
      if (denSites.some((d) => dist(tx, ty, d.tx, d.ty) < 14)) continue;
      const part = parts[qi];
      put(tx, ty, 'wreckage', { part, loot: rollLoot(rng) });
      reserve(tx, ty, 1);
      wrecks.push({ tx, ty });
      data.pois.push({ type: 'wreckage', tx, ty, part, quadrant: q });
      return;
    }
    throw new Error(`world gen: no wreckage site in quadrant ${q} (seed ${seed})`);
  });

  for (const d of denSites) {
    put(d.tx, d.ty, 'bear_den');
    reserve(d.tx, d.ty, 1);
    data.pois.push({ type: 'bear_den', tx: d.tx, ty: d.ty });
    cluster(d, 'iron_node', rng.int(3, 5), rng.range(0, Math.PI * 2));
    cluster(d, 'coal_node', rng.int(2, 4), rng.range(0, Math.PI * 2));
  }
  function cluster(den, type, n, ang) { // nodes on rock terrain 3..7 tiles from the den
    const cx = den.tx + Math.cos(ang) * rng.range(3.5, 5.5), cy = den.ty + Math.sin(ang) * rng.range(3.5, 5.5);
    for (let tries = 0, placed = 0; tries < 200 && placed < n; tries++) {
      const tx = Math.round(cx + rng.range(-2, 2)), ty = Math.round(cy + rng.range(-2, 2));
      if (isFree(tx, ty, [T.rock])) { put(tx, ty, type); placed++; }
    }
  }

  // --- scatter ---
  const spawnClear = P.clearingRadius;
  for (let ty = MAP.borderMin; ty < h - MAP.borderMin; ty++) {
    for (let tx = MAP.borderMin; tx < w - MAP.borderMin; tx++) {
      if (dist(tx, ty, spawn.tx, spawn.ty) < spawnClear || !isFree(tx, ty, [T.snow, T.deep, T.rock])) continue;
      const code = world.terrainCode(tx, ty), r = rng.next();
      if (code === T.rock) { if (r < 0.1) put(tx, ty, 'rock_node'); continue; }
      const forest = fbm(seed + 23, tx / 12, ty / 12, 3);
      const treeP = Math.min(P.treeMax, smoothstep(0.5, 0.72, forest) * 0.42 + 0.01);
      if (r < treeP) put(tx, ty, 'tree');
      else if (r < treeP + 0.014) put(tx, ty, 'dead_bush');
      else if (r < treeP + 0.014 + 0.003 + (forest > 0.5 ? 0.004 : 0)) put(tx, ty, 'berry_bush');
      else if (r < treeP + 0.014 + 0.012 && rng.chance(0.2)) put(tx, ty, 'herb');
      else if (r < treeP + 0.03 && rng.chance(0.1)) put(tx, ty, 'rock_node');
    }
  }

  // --- guarantees near spawn (bootstrapping) ---
  const N = P.nearSpawn;
  const scatterNear = (type, count, terrains = LAND, rMin = N.ringMin, rMax = N.ringMax) => {
    for (let tries = 0, placed = 0; tries < 800 && placed < count; tries++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(rMin, rMax);
      const tx = Math.round(spawn.tx + Math.cos(a) * d), ty = Math.round(spawn.ty + Math.sin(a) * d);
      if (isFree(tx, ty, terrains)) { put(tx, ty, type); placed++; }
    }
  };
  scatterNear('loose_stone', N.looseStone, LAND, 3, 10);
  scatterNear('loose_stick', N.looseStick, LAND, 3, 10);
  scatterNear('tree', N.tree, LAND, 7, 13);
  scatterNear('dead_bush', N.deadBush, LAND, 5, 12);
  scatterNear('rock_node', N.rockNode, LAND, 7, 14);
  scatterNear('berry_bush', N.berry, LAND, 6, 14);

  // --- reachability: every POI must have a walkable approach from spawn ---
  for (const poi of data.pois) {
    const seen = reachable(world, spawn);
    if (!approachOk(world, seen, poi.tx, poi.ty)) {
      carve(world, spawn, { tx: poi.tx, ty: poi.ty });
      if (!approachOk(world, reachable(world, spawn), poi.tx, poi.ty)) carve(world, spawn, { tx: poi.tx, ty: poi.ty });
    }
  }
  return data;
}
