// Pure target selection: nearest candidate inside the facing cone (DESIGN §11).
import { TILE, PLAYER } from '../data/balance.js';
import { objectDef } from '../data/structures.js';

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

/** Candidate list for world objects near (px,py). Each candidate: { kind:'object', x, y, obj, tx, ty, def, name, verb, radius }. */
export function objectCandidates(world, px, py, rangeTiles) {
  const out = [], r = Math.ceil(rangeTiles) + 1;
  const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
  world.forEachObjectInRect(cx - r, cy - r, cx + r, cy + r, (obj) => {
    const def = objectDef(obj.type);
    if (!def || !def.interactable || obj.depleted) return;
    out.push({ kind: 'object', x: obj.tx * TILE + TILE / 2, y: obj.ty * TILE + TILE / 2, obj, tx: obj.tx, ty: obj.ty, def, name: def.name, verb: def.verb || 'Use', radius: TILE / 2 });
  });
  return out;
}

/**
 * Best candidate for a player at (px,py) facing `facing` radians.
 * Candidates need {x,y}. Accepted if within range*TILE and inside the cone, or very close (< 0.75 tile) at any angle.
 */
export function pickTarget(candidates, px, py, facing, cone = PLAYER.interactCone) {
  const range = cone.range * TILE, half = (cone.halfAngleDeg * Math.PI) / 180;
  let best = null, bestScore = Infinity;
  for (const c of candidates) {
    const dx = c.x - px, dy = c.y - py, d = Math.hypot(dx, dy);
    if (d > range) continue;
    const da = angDiff(Math.atan2(dy, dx), facing);
    if (da > half && d > TILE * 0.75) continue;
    const score = d + da * TILE * 0.6;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}
