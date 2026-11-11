// Circle-vs-tile collision with sliding. Pure. `world.isBlocked(tx,ty)` decides what blocks.
import { TILE } from '../data/balance.js';

function resolve(world, x, y, r) {
  // Push the circle out of every blocked tile near it (closest-point method) -> natural wall sliding.
  const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE);
  const ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!world.isBlocked(tx, ty)) continue;
      const minX = tx * TILE, minY = ty * TILE, maxX = minX + TILE, maxY = minY + TILE;
      const cx = Math.max(minX, Math.min(x, maxX)), cy = Math.max(minY, Math.min(y, maxY));
      let dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 === 0) { // centre inside tile: push out via the shortest side
        const l = x - minX, rr = maxX - x, t = y - minY, b = maxY - y;
        const m = Math.min(l, rr, t, b);
        if (m === l) x = minX - r; else if (m === rr) x = maxX + r; else if (m === t) y = minY - r; else y = maxY + r;
        continue;
      }
      const d = Math.sqrt(d2), push = r - d;
      x += (dx / d) * push; y += (dy / d) * push;
    }
  }
  return [x, y];
}

/** Move a circle (world px) by (dx,dy) with substeps; returns { x, y, hitX, hitY }. */
export function moveCircle(world, x, y, dx, dy, r) {
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
  const sx = dx / steps, sy = dy / steps;
  let hitX = false, hitY = false;
  for (let i = 0; i < steps; i++) {
    const px = x, py = y;
    [x, y] = resolve(world, x + sx, y + sy, r);
    if (Math.abs(x - (px + sx)) > 1e-6) hitX = true;
    if (Math.abs(y - (py + sy)) > 1e-6) hitY = true;
  }
  return { x, y, hitX, hitY };
}
