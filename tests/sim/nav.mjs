// Tile-grid navigation for the playtest bot: Dijkstra over walkable tiles + steering through the REAL input path
// (the touch joystick `game.input.touch`), so the player walks with the game's own collision. No state mutation.
import { TILE, PLAYER } from '../../src/data/balance.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function createNav(game) {
  const W = () => game.world;
  const touch = () => game.input.touch;
  const nav = {
    path: null, pi: 0, goalKey: '', replanAt: 0, lastPos: null, lastMoveT: 0, stuckCount: 0, blacklist: new Map(),
    extraCost: null,      // optional (tx,ty)->added cost (danger zones)
  };

  const tileOf = () => { const p = game.state.player; return { tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) }; };
  nav.tileOf = tileOf;

  /** Is the tile walkable for the player? (doors are walkable; creatures not considered). */
  nav.walkable = (tx, ty) => !W().isBlocked(tx, ty);

  nav.stepCost = (tx, ty) => {
    const t = W().terrainAt(tx, ty);
    let c = t === 'deep_snow' ? 1.7 : 1;
    if (nav.extraCost) c += nav.extraCost(tx, ty);
    return c;
  };

  /** Dijkstra from (sx,sy) to the nearest tile satisfying isGoal. Returns [{tx,ty}...] (excluding start) or null. */
  nav.findPath = (sx, sy, isGoal, maxNodes = 12000) => {
    const w = W().w, h = W().h, cost = new Map(), prev = new Map();
    const heap = [[0, sy * w + sx]]; cost.set(sy * w + sx, 0);
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let n = 0;
    while (heap.length && n++ < maxNodes) {
      const [c, k] = pop();
      if (c > cost.get(k)) continue;
      const x = k % w, y = (k / w) | 0;
      if (isGoal(x, y)) {
        const out = []; for (let q = k; q !== sy * w + sx; q = prev.get(q)) out.push({ tx: q % w, ty: (q / w) | 0 });
        return out.reverse();
      }
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !nav.walkable(nx, ny)) continue;
        const nk = ny * w + nx, nc = c + nav.stepCost(nx, ny);
        if (nc < (cost.get(nk) ?? Infinity)) { cost.set(nk, nc); prev.set(nk, k); push([nc, nk]); }
      }
    }
    return null;
  };

  const lineFree = (x0, y0, x1, y1) => {
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d / 6), r = PLAYER.radius * TILE - 1;
    const nx = -(y1 - y0) / (d || 1), ny = (x1 - x0) / (d || 1);
    for (let i = 1; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
      for (const o of [0, r, -r]) if (W().isBlockedAtPx(x + nx * o, y + ny * o)) return false;
    }
    return true;
  };

  nav.stop = () => { const t = touch(); t.x = 0; t.y = 0; t.sprint = false; t.active = false; };
  nav.push = (dx, dy, sprint = false) => {   // raw joystick push toward a vector
    const t = touch(), l = Math.hypot(dx, dy) || 1;
    t.x = dx / l; t.y = dy / l; t.sprint = sprint; t.active = true;
  };

  /**
   * Walk toward a set of goal tiles. `key` identifies the goal (replan when it changes). Returns 'arrived' | 'moving' | 'unreachable'.
   * isGoal(tx,ty) -> bool, evaluated on tiles; `sprint` boolean.
   */
  nav.goTo = (key, isGoal, sprint = false) => {
    const p = game.state.player, me = tileOf();
    if (isGoal(me.tx, me.ty)) { nav.stop(); nav.path = null; return 'arrived'; }
    const bl = nav.blacklist.get(key);
    if (bl && game.time < bl) return 'unreachable';
    const now = game.time;
    if (!nav.path || nav.goalKey !== key || now > nav.replanAt || nav.pi >= nav.path.length) {
      nav.path = nav.findPath(me.tx, me.ty, isGoal);
      nav.goalKey = key; nav.pi = 0; nav.replanAt = now + 2.5;
      if (!nav.path) { nav.blacklist.set(key, now + 20); nav.stop(); return 'unreachable'; }
    }
    // advance along path
    while (nav.pi < nav.path.length - 1) {
      const c = W().tileCenter(nav.path[nav.pi].tx, nav.path[nav.pi].ty);
      if (Math.hypot(c.x - p.x, c.y - p.y) < 9) nav.pi++; else break;
    }
    // look ahead (string pulling)
    let target = nav.path[nav.pi];
    for (let j = Math.min(nav.path.length - 1, nav.pi + 4); j > nav.pi; j--) {
      const c = W().tileCenter(nav.path[j].tx, nav.path[j].ty);
      if (lineFree(p.x, p.y, c.x, c.y)) { target = nav.path[j]; break; }
    }
    const c = W().tileCenter(target.tx, target.ty);
    nav.push(c.x - p.x, c.y - p.y, sprint);
    // stuck detection
    if (!nav.lastPos || Math.hypot(p.x - nav.lastPos.x, p.y - nav.lastPos.y) > 3) { nav.lastPos = { x: p.x, y: p.y }; nav.lastMoveT = now; nav.stuckCount = 0; }
    else if (now - nav.lastMoveT > 1.2) {
      nav.stuckCount++; nav.lastMoveT = now; nav.path = null;
      if (nav.stuckCount > 4) { nav.blacklist.set(key, now + 15); nav.stuckCount = 0; nav.stop(); return 'unreachable'; }
    }
    return 'moving';
  };

  /** Walk toward an exact world position (px) with simple steering (short hops, same tile region). */
  nav.goToPx = (key, x, y, within = 8, sprint = false) => {
    const p = game.state.player;
    if (Math.hypot(x - p.x, y - p.y) <= within) { nav.stop(); return 'arrived'; }
    const g = { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
    const r = nav.goTo(key, (tx, ty) => tx === g.tx && ty === g.ty, sprint);
    if (r === 'arrived') {                   // in the tile: close the last pixels directly
      if (Math.hypot(x - p.x, y - p.y) > within) { nav.push(x - p.x, y - p.y, false); return 'moving'; }
      nav.stop(); return 'arrived';
    }
    return r;
  };

  nav.reset = () => { nav.path = null; nav.goalKey = ''; nav.lastPos = null; nav.stop(); };
  return nav;
}

export const tileDist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
