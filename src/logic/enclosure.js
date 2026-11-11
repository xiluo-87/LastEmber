// Room detection (DESIGN §8). Pure / DOM-free.
//   A ROOM is a connected (4-neighbour) set of non-blocked tiles that is fully enclosed (the flood fill never reaches a
//   map edge) and has at most `max` (60) tiles. `isBlocked(tx,ty)` says what stops the fill: walls, doors, cliffs and
//   other blocking objects (the caller decides; out-of-bounds always blocks).
//
//   const enc = createEnclosure({ w, h, isBlocked, max: 60 });
//   enc.rebuild(seedTiles?)      full recompute. seeds = [[tx,ty]..] tiles to flood from (default: every tile — fine for tests,
//                                 give the neighbours of structures in the game)
//   enc.update(tx, ty)           call AFTER the blocking state of (tx,ty) changed -> { formed:[room], breached:[room] }
//                                 (only rooms touching that tile are recomputed; cached otherwise)
//   enc.isRoomTile(tx,ty) · enc.roomAt(tx,ty) · enc.rooms (Map id -> room) · enc.isSheltered(tx,ty)
//   room = { id, size, tiles:[tileIndex..] (index = ty*w+tx), sig }
export const ROOM_MAX = 60;
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Flood fill from (sx,sy). Returns { closed, tiles:[index...] } — tiles is only complete when closed. */
export function floodRoom(isBlocked, w, h, sx, sy, max = ROOM_MAX) {
  const blocked = (x, y) => x < 0 || y < 0 || x >= w || y >= h || isBlocked(x, y);
  if (blocked(sx, sy)) return { closed: false, tiles: [], blocked: true };
  const seen = new Set([sy * w + sx]), q = [sx, sy], tiles = [sy * w + sx];
  for (let h0 = 0; h0 < q.length; h0 += 2) {
    const x = q[h0], y = q[h0 + 1];
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;        // map edge counts as solid (borders are cliffs anyway)
      const k = ny * w + nx;
      if (seen.has(k) || isBlocked(nx, ny)) continue;
      seen.add(k); tiles.push(k); q.push(nx, ny);
      if (tiles.length > max) return { closed: false, tiles };
    }
  }
  return { closed: true, tiles };
}

export function createEnclosure({ w, h, isBlocked, max = ROOM_MAX }) {
  const rooms = new Map();          // id -> room
  const tileRoom = new Map();       // tile index -> room id
  let nextId = 1;
  const sigOf = (tiles) => [...tiles].sort((a, b) => a - b).join(',');

  function add(tiles) {
    const room = { id: nextId++, size: tiles.length, tiles, sig: sigOf(tiles) };
    rooms.set(room.id, room);
    for (const k of tiles) tileRoom.set(k, room.id);
    return room;
  }
  function drop(room) { rooms.delete(room.id); for (const k of room.tiles) if (tileRoom.get(k) === room.id) tileRoom.delete(k); }

  const api = {
    rooms, w, h, max,
    rebuild(seeds) {
      rooms.clear(); tileRoom.clear();
      const openSeen = new Set();
      const list = seeds || (() => { const a = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.push([x, y]); return a; })();
      for (const [x, y] of list) {
        const k = y * w + x;
        if (tileRoom.has(k) || openSeen.has(k)) continue;
        const r = floodRoom(isBlocked, w, h, x, y, max);
        if (r.blocked) continue;
        if (r.closed) add(r.tiles); else for (const t of r.tiles) openSeen.add(t);
      }
      return api;
    },
    update(tx, ty) {
      const old = new Map();
      const touch = (x, y) => { const id = tileRoom.get(y * w + x); if (id !== undefined && !old.has(id)) old.set(id, rooms.get(id)); };
      touch(tx, ty); for (const [dx, dy] of NB) touch(tx + dx, ty + dy);
      for (const r of old.values()) drop(r);
      const fresh = [];
      for (const [dx, dy] of [[0, 0], ...NB]) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= w || y >= h || tileRoom.has(y * w + x)) continue;
        const r = floodRoom(isBlocked, w, h, x, y, max);
        if (r.closed) fresh.push(add(r.tiles));
      }
      const oldSigs = new Set([...old.values()].map((r) => r.sig)), newSigs = new Set(fresh.map((r) => r.sig));
      return { formed: fresh.filter((r) => !oldSigs.has(r.sig)), breached: [...old.values()].filter((r) => !newSigs.has(r.sig)) };
    },
    roomAt: (tx, ty) => { const id = tileRoom.get(ty * w + tx); return id === undefined ? null : rooms.get(id); },
    isRoomTile: (tx, ty) => tileRoom.has(ty * w + tx),
    /** Room tile, or a blocking tile touching a room (a fire / door / wall belonging to the room). */
    isSheltered(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
      if (tileRoom.has(ty * w + tx)) return true;
      if (!isBlocked(tx, ty)) return false;
      for (const [dx, dy] of NB) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < w && y < h && tileRoom.has(y * w + x)) return true; }
      return false;
    },
  };
  return api;
}
