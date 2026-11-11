// Canvas renderer. DOM-touching. Pass order:
//   1 terrain (+edge feathering, macro shading)  2 system.drawGround  3 y-sorted drawables (objects, player, system.drawables)
//   4 target outline  5 system.drawFx (world space)  6 lighting overlay  7 system.drawScreen (screen space)
// Optional system hooks used here (all optional):
//   drawGround(game, ctx, cam)          draw on the ground under objects (floors, decals); world-space ctx
//   drawables(game, cam, push)          push({ y, draw(ctx) }) -> y-sorted with objects & player (y = ground y)
//   drawFx(game, ctx, cam)              world-space effects above entities, before lighting (projectiles, hit sparks)
//   lights(game, push)                  push({ x, y, radius(tiles), flicker, color?, intensity?, glow? })
//   drawScreen(game, ctx, w, h)         screen-space after lighting (weather particles, frost vignette); ctx is CSS-px scaled
import { TILE, CAMERA, LIGHT } from '../data/balance.js';
import { TERRAIN, TERRAIN_BY_CODE } from '../data/terrain.js';
import { hash2, fbm } from '../rng.js';
import './sprites/index.js';
import { getSprite, drawSprite, getOutline, setSpriteScale, makeCanvas } from './sprites.js';
import { drawObject, spriteKeyFor, FLAT_OBJECTS } from './objects.js';
import { createLighting } from './lighting.js';

const PRIO = [0, 1, 3, 2, 4]; // blend priority by terrain code (snow<deep<rock<ice<cliff)
const SIDE_LIST = [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]];
const SHADE = Array.from({ length: 8 }, (_, i) => (i === 0 ? null : `rgba(110,140,185,${(i * 0.006).toFixed(3)})`));
const OBJ_GROUND_X = TILE / 2, OBJ_GROUND_Y = 27;

// FLAT_OBJECTS (bedroll, snare, fishing hole) sort at the top of their tile so the player is always drawn on top of them.
export const objectGround = (obj) => ({ x: obj.tx * TILE + OBJ_GROUND_X, y: obj.ty * TILE + (FLAT_OBJECTS.has(obj.type) ? 2 : OBJ_GROUND_Y) });

export function createRenderer(game, canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const lighting = createLighting();
  const view = game.view = { w: 1, h: 1, dpr: 1, scale: 1 };
  const cam = game.camera = { x: 0, y: 0, w: 1, h: 1, scale: 1, snap: true };
  let variants = null, shade = null, prepared = null;
  const drawables = [], lights = [];
  let tileSprites = null;

  // Adaptive resolution: when frames stay slow the drawing buffer drops a step (the CSS size does not change), and it climbs back
  // only after a long stretch of fast frames. ?quality=0|1|2 pins a step (tests, screenshots).
  const QUALITY = [1, 0.75, 0.5];
  const gov = { q: Math.min(2, Math.max(0, Number(game.params?.quality ?? 0) | 0)), pinned: game.params?.quality != null, ema: 16.7, slow: 0, fast: 0, since: 0, lockUp: 0 };
  function governor(dt) {
    if (gov.pinned || !game.running) return;
    gov.ema += (Math.min(dt, 0.25) * 1000 - gov.ema) * 0.08;
    gov.since += dt;
    if (gov.ema > 24) { gov.slow += dt; gov.fast = 0; } else if (gov.ema < 13.5) { gov.fast += dt; gov.slow = 0; } else { gov.slow = gov.fast = 0; }
    if (gov.slow > 1.5 && gov.q < QUALITY.length - 1) {
      if (gov.since < 25) gov.lockUp = 180;             // we just climbed and it was too much: stay down for a while
      gov.q++; gov.slow = 0; gov.since = 0; gov.ema = 16.7; resize();
    } else if (gov.fast > 10 && gov.q > 0 && gov.lockUp <= 0) {
      gov.q--; gov.fast = 0; gov.since = 0; gov.ema = 16.7; resize();
    }
    if (gov.lockUp > 0) gov.lockUp -= dt;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, CAMERA.maxDpr) * QUALITY[gov.q];
    const w = Math.max(1, canvas.clientWidth || window.innerWidth), h = Math.max(1, canvas.clientHeight || window.innerHeight);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const short = Math.min(w, h);
    view.w = w; view.h = h; view.dpr = dpr;
    view.scale = Math.max(CAMERA.minScale, Math.min(CAMERA.maxScale, short / (CAMERA.targetTilesShortSide * TILE)));
    cam.scale = view.scale; cam.w = w / view.scale; cam.h = h / view.scale;
    setSpriteScale(dpr * view.scale);
    tileSprites = null; chunks.clear();
    cam.snap = true;
  }

  function prepare(world) {
    if (prepared === world) return;
    prepared = world; chunks.clear();
    const setT = world.setTerrain;
    world.setTerrain = (tx, ty, id) => { setT(tx, ty, id); chunks.clear(); };
    variants = new Uint8Array(world.w * world.h); shade = new Uint8Array(world.w * world.h);
    const seed = game.state?.seed ?? 1;
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      const i = y * world.w + x;
      variants[i] = Math.floor(hash2(seed, x, y) * 255);
      const n = fbm(seed + 31, x / 9, y / 9, 3);
      shade[i] = Math.max(0, Math.min(7, Math.round((n - 0.38) * 20)));
    }
  }
  function buildTileSprites() {
    tileSprites = TERRAIN_BY_CODE.map((t) => {
      const n = { snow: 8, deep_snow: 5, ice: 5, rock: 6, cliff: 6 }[t.id];
      return Array.from({ length: n }, (_, v) => getSprite(`terrain:${t.id}`, v));
    });
  }

  function updateCamera(dt) {
    const p = game.state.player, world = game.world;
    const mapW = world.w * TILE, mapH = world.h * TILE;
    let tx = p.x - cam.w / 2, ty = p.y - cam.h / 2;
    tx = cam.w >= mapW ? (mapW - cam.w) / 2 : Math.max(0, Math.min(mapW - cam.w, tx));
    ty = cam.h >= mapH ? (mapH - cam.h) / 2 : Math.max(0, Math.min(mapH - cam.h, ty));
    if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; } else { const k = 1 - Math.exp(-dt * 14); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; }
    const ds = view.dpr * cam.scale; // snap to device pixels to avoid shimmer
    cam.rx = Math.round(cam.x * ds) / ds; cam.ry = Math.round(cam.y * ds) / ds;
  }

  // Terrain is static, so it is baked into CHUNK x CHUNK tile canvases at the current device scale and stamped with one drawImage per
  // chunk (a phone screen touches ~15) instead of ~800 tile / shade / edge draws per frame. Chunks build lazily (the ones around the
  // camera first, one extra neighbour per frame) and are dropped on resize / terrain edits.
  const CHUNK = 8, CHUNK_PX = CHUNK * TILE, CHUNK_BYTES = 64e6;
  const chunks = new Map();   // key -> { canvas, used }
  let chunkTick = 0;
  function bakeTile(c2, world, tx, ty, eps) {
    const code = world.terrainCode(tx, ty), i = ty * world.w + tx, list = tileSprites[code];
    const inb = world.inBounds(tx, ty), s = list[(inb ? variants[i] : 0) % list.length];
    const x = tx * TILE, y = ty * TILE;
    c2.drawImage(s.canvas, x, y, TILE + eps, TILE + eps);
    if (!inb) return;
    const sh = shade[i];
    if (sh && code <= 1) { c2.fillStyle = SHADE[sh]; c2.fillRect(x, y, TILE + eps, TILE + eps); }
    if (code === TERRAIN.cliff.code) return;
    for (const [side, dx, dy] of SIDE_LIST) {
      const nc = world.terrainCode(tx + dx, ty + dy);
      if (nc !== code && PRIO[nc] > PRIO[code]) drawSprite(c2, `edge:${TERRAIN_BY_CODE[nc].id}:${side}`, 0, x, y);
    }
  }
  function getChunk(world, cx, cy, build = true) {
    const key = cx * 4096 + cy;
    let ch = chunks.get(key);
    if (!ch) {
      if (!build) return null;
      if (!tileSprites) buildTileSprites();
      const ds = view.dpr * cam.scale, size = Math.ceil(CHUNK_PX * ds) + 2;
      const canvas = makeCanvas(size, size), c2 = canvas.getContext('2d');
      c2.setTransform(ds, 0, 0, ds, -cx * CHUNK_PX * ds, -cy * CHUNK_PX * ds);
      const eps = 0.7 / ds;
      for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK; ty++) for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK; tx++) bakeTile(c2, world, tx, ty, eps);
      ch = { canvas, used: 0, ds };
      chunks.set(key, ch);
      if (chunks.size > Math.max(14, Math.floor(CHUNK_BYTES / (size * size * 4)))) {   // drop the least recently used
        let oldK = null, oldU = Infinity;
        for (const [k, v] of chunks) if (v.used < oldU && v !== ch) { oldU = v.used; oldK = k; }
        chunks.delete(oldK);
      }
    }
    ch.used = ++chunkTick;
    return ch;
  }
  function drawTerrain(world, tx0, ty0, tx1, ty1) {
    if (!tileSprites) buildTileSprites();
    const eps = 0.7 / (view.dpr * cam.scale);
    const c0x = Math.floor(tx0 / CHUNK), c1x = Math.floor(tx1 / CHUNK), c0y = Math.floor(ty0 / CHUNK), c1y = Math.floor(ty1 / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const ch = getChunk(world, cx, cy), ds = ch.ds, ox = cx * CHUNK_PX, oy = cy * CHUNK_PX;
      // blit only the part of the chunk that is on screen (device-pixel aligned source rect) to keep the fill area small
      const vx0 = Math.max(ox, Math.floor(cam.rx)), vy0 = Math.max(oy, Math.floor(cam.ry));
      const vx1 = Math.min(ox + CHUNK_PX + 1, Math.ceil(cam.rx + cam.w) + 1), vy1 = Math.min(oy + CHUNK_PX + 1, Math.ceil(cam.ry + cam.h) + 1);
      if (vx1 <= vx0 || vy1 <= vy0) continue;
      const sx = Math.floor((vx0 - ox) * ds), sy = Math.floor((vy0 - oy) * ds);
      const sw = Math.min(ch.canvas.width - sx, Math.ceil((vx1 - ox) * ds) - sx), sh = Math.min(ch.canvas.height - sy, Math.ceil((vy1 - oy) * ds) - sy);
      ctx.drawImage(ch.canvas, sx, sy, sw, sh, ox + sx / ds, oy + sy / ds, sw / ds, sh / ds);
    }
    // warm one neighbour chunk per frame in the direction of travel so walking never builds a chunk on the critical frame
    const px = game.state.player.x / CHUNK_PX, py = game.state.player.y / CHUNK_PX, cx0 = Math.floor(px), cy0 = Math.floor(py);
    const nx = cx0 + (px - cx0 > 0.5 ? 1 : -1), ny = cy0 + (py - cy0 > 0.5 ? 1 : -1);
    for (const [wx, wy] of [[nx, cy0], [cx0, ny], [nx, ny]]) {
      if (wx < -1 || wy < -1 || wx > world.w / CHUNK || wy > world.h / CHUNK || getChunk(world, wx, wy, false)) continue;
      getChunk(world, wx, wy); break;
    }
    void eps;
  }

  function collectObjects(world, tx0, ty0, tx1, ty1) {
    world.forEachObjectInRect(tx0 - 2, ty0 - 1, tx1 + 2, ty1 + 4, (obj) => {
      const g = objectGround(obj);
      drawables.push({ y: g.y, obj, x: g.x });
    });
  }

  function drawPlayer(p, time) {
    const a = ((Math.atan2(Math.sin(p.facing), Math.cos(p.facing)) + Math.PI * 2) % (Math.PI * 2));
    const v = Math.round(a / (Math.PI / 4)) % 8;
    const amp = p.moving ? (p.sprinting ? 2.4 : 1.7) : 0;
    const bob = -Math.abs(Math.sin(p.bob)) * amp;
    const breathe = p.moving ? 0 : Math.sin(time * 2.2) * 0.35;
    drawSprite(ctx, 'player', v, p.x, p.y + 9 + bob + breathe);
  }

  function render(dt, time) {
    governor(dt);
    const state = game.state, world = game.world;
    if (!state || !world) { ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
    prepare(world);
    updateCamera(dt);
    const ds = view.dpr * cam.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10161f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ds, 0, 0, ds, -cam.rx * ds, -cam.ry * ds);
    ctx.imageSmoothingEnabled = true;

    const tx0 = Math.floor(cam.rx / TILE) - 1, ty0 = Math.floor(cam.ry / TILE) - 1;
    const tx1 = Math.floor((cam.rx + cam.w) / TILE) + 1, ty1 = Math.floor((cam.ry + cam.h) / TILE) + 1;
    drawTerrain(world, tx0, ty0, tx1, ty1);
    for (const s of game.systems) s.drawGround?.(game, ctx, cam);

    drawables.length = 0;
    collectObjects(world, tx0, ty0, tx1, ty1);
    const p = state.player;
    if (game.mode !== 'title') drawables.push({ y: p.y + 9, player: true });
    for (const s of game.systems) s.drawables?.(game, cam, (d) => drawables.push(d));
    drawables.sort((a, b) => a.y - b.y);
    const target = game.target;
    for (const d of drawables) {
      if (d.player) drawPlayer(p, time);
      else if (d.obj) {
        const o = d.obj;
        if (target && target.obj === o) {
          const out = getOutline(spriteKeyFor(o), o.variant || 0);
          ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 7);
          ctx.drawImage(out.canvas, d.x - out.ax, d.y - out.ay, out.w, out.h);
          ctx.globalAlpha = 1;
        }
        drawObject(ctx, o, d.x, d.y, game, time);
      } else d.draw(ctx);
    }
    if (target && !target.obj) drawTargetRing(target, time);
    for (const s of game.systems) s.drawFx?.(game, ctx, cam);

    // lighting
    lights.length = 0;
    const push = (l) => lights.push(l);
    push({ x: p.x, y: p.y, radius: LIGHT.personal, flicker: 0, glow: false });
    for (const s of game.systems) s.lights?.(game, push);
    for (const fn of game.lightProviders) fn(game, push);
    lighting.draw(ctx, game, { x: cam.rx, y: cam.ry, scale: cam.scale }, lights, time);

    // screen-space
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    for (const s of game.systems) s.drawScreen?.(game, ctx, view.w, view.h);
  }

  function drawTargetRing(t, time) {
    ctx.strokeStyle = `rgba(255,243,176,${0.6 + 0.3 * Math.sin(time * 7)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(t.x, t.y + 6, (t.radius ?? 12) + 3, ((t.radius ?? 12) + 3) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }

  /** screen (css px) -> world px */
  const screenToWorld = (sx, sy) => ({ x: (cam.rx ?? cam.x) + sx / cam.scale, y: (cam.ry ?? cam.y) + sy / cam.scale });
  const worldToScreen = (x, y) => ({ x: (x - (cam.rx ?? cam.x)) * cam.scale, y: (y - (cam.ry ?? cam.y)) * cam.scale });

  return { resize, render, screenToWorld, worldToScreen, lighting, quality: () => gov.q, fxScale: () => [1, 0.75, 0.55][gov.q], snapCamera: () => { cam.snap = true; } };
}
