// Cheap tile-grid navigation for creatures (pure). `blocked(tx,ty)` decides what blocks. No A*: a bounded BFS floods outward from the
// GOAL tile; if the start tile is reached the neighbour we came from is the next step; if the flood exhausts first there is NO path
// (e.g. the player is walled in) and the explored region is available so callers can pick the wall to chew through.
import { TILE } from '../data/balance.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function createPather(w, h) {
  const n = w * h;
  const stamp = new Uint32Array(n), parent = new Int32Array(n), queue = new Int32Array(n);
  let gen = 0, tail = 0;
  const api = {
    /** Number of tiles in the last flood (region[0..regionSize)). */
    get regionSize() { return tail; }, region: queue,
    /**
     * out = {tx,ty}. Returns 1 (path found; out = next tile toward goal), 0 (no path: goal region exhausted), -1 (node limit hit: unknown).
     * The goal tile is treated as passable. Diagonals need both orthogonals free (no corner cutting).
     */
    nextStep(blocked, sx, sy, gx, gy, maxNodes, out) {
      if (sx === gx && sy === gy) { out.tx = gx; out.ty = gy; return 1; }
      gen++; if (gen > 0xfffffff0) { stamp.fill(0); gen = 1; }
      let head = 0; tail = 0;
      const gi = gy * w + gx, si = sy * w + sx;
      stamp[gi] = gen; parent[gi] = -1; queue[tail++] = gi;
      while (head < tail) {
        if (tail >= maxNodes) return -1;
        const ci = queue[head++], cx = ci % w, cy = (ci / w) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (stamp[ni] === gen) continue;
          const isStart = ni === si;
          if (!isStart && blocked(nx, ny)) continue;
          if (d >= 4 && (blocked(cx + DIRS[d][0], cy) || blocked(cx, cy + DIRS[d][1]))) continue;
          stamp[ni] = gen; parent[ni] = ci;
          if (isStart) { const p = ci; out.tx = p % w; out.ty = (p / w) | 0; return 1; }
          queue[tail++] = ni;
        }
      }
      return 0;
    },
  };
  return api;
}

/**
 * Is the straight segment (x0,y0)->(x1,y1) (px) free for a circle of radius r (px)? Samples every ~8px, centre + both flanks.
 * Returns true if clear, otherwise false and (if `hit` given) hit.tx/ty = first blocked tile.
 */
export function lineClear(blocked, x0, y0, x1, y1, r, hit) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const steps = Math.ceil(len / 8), ux = dx / len, uy = dy / len, px = -uy * r * 0.8, py = ux * r * 0.8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
    for (let k = -1; k <= 1; k++) {
      const tx = Math.floor((x + px * k) / TILE), ty = Math.floor((y + py * k) / TILE);
      if (blocked(tx, ty)) { if (hit) { hit.tx = tx; hit.ty = ty; } return false; }
    }
  }
  return true;
}
