// World API wrapper around the plain, serialisable `state.world` data. Pure / DOM-free.
//   data = { w, h, terrain:'0012..' (1 char per tile, TERRAIN code), objects:{ [tileIndex]: obj }, spawn:{tx,ty}, pois:[...] }
//   obj  = { type, tx, ty, variant?, hp?, ...anything else a system wants to store (must be JSON-safe) }
import { TILE } from '../data/balance.js';
import { TERRAIN_BY_CODE, TERRAIN } from '../data/terrain.js';
import { objectDef } from '../data/structures.js';

const CODE_CHARS = '0123456789';

export function createWorld(data) {
  const { w, h } = data;
  const terr = new Uint8Array(w * h);
  for (let i = 0; i < terr.length; i++) terr[i] = data.terrain.charCodeAt(i) - 48;
  const objects = data.objects;

  const world = {
    data, w, h, TILE,
    /** Called as onObjectChanged(tx,ty,obj|null,prev|null) after set/remove. game.js turns it into the 'world:objectChanged' event. */
    onObjectChanged: null,

    inBounds: (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h,
    index: (tx, ty) => ty * w + tx,

    // ---- coordinates ----
    toTile: (v) => Math.floor(v / TILE),
    worldToTile: (x, y) => ({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) }),
    tileToWorld: (tx, ty) => ({ x: tx * TILE, y: ty * TILE }),            // top-left corner
    tileCenter: (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }),

    // ---- terrain ----
    terrainCode: (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? TERRAIN.cliff.code : terr[ty * w + tx]),
    /** Terrain id string ('snow'|'deep_snow'|'ice'|'rock'|'cliff'); out of bounds = 'cliff'. */
    terrainAt: (tx, ty) => TERRAIN_BY_CODE[world.terrainCode(tx, ty)].id,
    terrainDef: (tx, ty) => TERRAIN_BY_CODE[world.terrainCode(tx, ty)],
    setTerrain(tx, ty, id) {
      if (!world.inBounds(tx, ty)) return;
      const code = TERRAIN[id].code, i = ty * w + tx;
      terr[i] = code;
      data.terrain = data.terrain.slice(0, i) + CODE_CHARS[code] + data.terrain.slice(i + 1);
    },
    /** Terrain movement multiplier at tile. */
    terrainSpeed: (tx, ty) => world.terrainDef(tx, ty).speed,

    // ---- objects (max one per tile) ----
    objectAt: (tx, ty) => (world.inBounds(tx, ty) ? objects[ty * w + tx] : undefined),
    /** Place obj on tile (replaces any existing). Sets obj.tx/ty. Returns obj. */
    setObject(tx, ty, obj) {
      if (!world.inBounds(tx, ty)) return null;
      const i = ty * w + tx, prev = objects[i] || null;
      obj.tx = tx; obj.ty = ty;
      objects[i] = obj;
      world.onObjectChanged?.(tx, ty, obj, prev);
      return obj;
    },
    /** Remove and return the object on a tile (or undefined). */
    removeObject(tx, ty) {
      if (!world.inBounds(tx, ty)) return undefined;
      const i = ty * w + tx, prev = objects[i];
      if (!prev) return undefined;
      delete objects[i];
      world.onObjectChanged?.(tx, ty, null, prev);
      return prev;
    },
    forEachObject(fn) { for (const k in objects) fn(objects[k]); },
    objectList: () => Object.values(objects),
    /** Visit objects in the inclusive tile rect (clamped to map). */
    forEachObjectInRect(tx0, ty0, tx1, ty1, fn) {
      tx0 = Math.max(0, tx0); ty0 = Math.max(0, ty0); tx1 = Math.min(w - 1, tx1); ty1 = Math.min(h - 1, ty1);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const o = objects[ty * w + tx]; if (o) fn(o); }
    },

    // ---- movement ----
    /** Is the tile impassable? opts.creature=true applies creature rules (doors block creatures). */
    isBlocked(tx, ty, opts) {
      if (!world.inBounds(tx, ty)) return true;
      if (terr[ty * w + tx] === TERRAIN.cliff.code) return true;
      const o = objects[ty * w + tx];
      if (!o) return false;
      const def = objectDef(o.type);
      if (!def) return true;
      return !!def.blocks || (!!opts?.creature && !!def.blocksCreatures);
    },
    isBlockedAtPx: (x, y, opts) => world.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE), opts),
    pois: () => data.pois,
    spawnPx: () => world.tileCenter(data.spawn.tx, data.spawn.ty),
  };
  return world;
}
