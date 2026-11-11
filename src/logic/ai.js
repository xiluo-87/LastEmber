// Pure creature AI decisions + combat geometry (DESIGN §9). No DOM, no game object: unit-tested in tests/unit/creatures.test.js.
import { TILE, WOLF } from '../data/balance.js';
import { AI } from '../data/creatures.js';

export const TAU = Math.PI * 2;
export function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return Math.abs(d); }

/** Wolf pack size at night: 1 + floor(day/2), capped at 6. */
export const packSizeForDay = (day) => WOLF.packSize(day);

/** Distance (tiles) at which a prey animal flees. Sprinting players alarm deer from further away (sneak range when not sprinting). */
export function fleeRange(def, playerSprinting) {
  const f = def && def.flee;
  if (!f) return 0;
  return playerSprinting ? f.range : (f.sneakRange ?? f.range);
}

/** Do wolves ignore campfires/furnaces? Enraged packs always; from day ignoreFireFromDay packs of >= ignoreFireMinPack do. */
export function ignoresFire({ day, packSize, enraged }) {
  if (enraged) return true;
  return day >= WOLF.ignoreFireFromDay && packSize >= WOLF.ignoreFireMinPack;
}

/** What scares this wolf: FEAR_ALL (every lit fire + held torch), FEAR_TORCHES (torch posts and the held torch only: big late packs have
 *  stopped fearing campfires/furnaces), FEAR_NONE (enraged signal packs fear nothing). */
export const FEAR_ALL = 0, FEAR_TORCHES = 1, FEAR_NONE = 2;
export function fearMode(i) { return i.enraged ? FEAR_NONE : ignoresFire(i) ? FEAR_TORCHES : FEAR_ALL; }

/** Is (x,y) (world px) inside a lit radius (+marginTiles)? fires: [{x,y,r}] (r in tiles), n = count used. */
export function inLitRadius(x, y, fires, n, marginTiles = 0) {
  for (let i = 0; i < n; i++) {
    const f = fires[i], r = (f.r + marginTiles) * TILE, dx = x - f.x, dy = y - f.y;
    if (dx * dx + dy * dy < r * r) return f;
  }
  return null;
}

/**
 * Wolf behaviour mode. i = { night, enraged, dist (tiles to player), playerHp, hpFrac, aggro (provoked), nearKill (player at a guarded
 * carcass), hunting (already hunting: hysteresis), sight? }.
 * -> 'flee' | 'march' | 'hunt' | 'prowl' | 'avoid'
 */
export function wolfMode(i) {
  const sight = i.sight ?? WOLF.nightHuntRadius;
  if (i.enraged) return i.dist <= AI.wolf.enragedSight || i.hunting ? 'hunt' : 'march';
  if (i.hpFrac < WOLF.fleeHpFrac) return 'flee';
  if (i.aggro || i.nearKill) return 'hunt';
  if (i.night) return i.dist <= sight * (i.hunting ? AI.wolf.huntHysteresis : 1) ? 'hunt' : 'prowl';
  if (i.playerHp < WOLF.dayAttackBelowHp && i.dist <= sight) return 'hunt';
  return 'avoid';
}

/**
 * Bear behaviour. i = { playerToDen, bearToDen (tiles), aggro (seconds left, provoked), current ('idle'|'charge'|'home') , territory, leash }.
 * -> 'charge' | 'home' | 'idle'
 */
export function bearMode(i) {
  const { territory, leash } = i;
  if (i.bearToDen > leash || (i.current === 'charge' && i.playerToDen > leash)) return 'home';
  if (i.current === 'home' && i.bearToDen > 1.5 && i.playerToDen > territory) return 'home';
  if (i.playerToDen <= territory) return 'charge';
  if (i.aggro > 0 && i.playerToDen <= leash) return 'charge';
  return i.bearToDen > 2.5 ? 'home' : 'idle';
}

/** Should an aggro'd creature with no path to its target start hitting structures? (wolves from day 5, enraged any day, bears any time) */
export function shouldAttackStructures({ type = 'wolf', day, aggro, hasPath, enraged }) {
  if (!aggro || hasPath) return false;
  if (type === 'bear') return true;
  return enraged || day >= WOLF.attackStructuresFromDay;
}

/** Angle of pack slot `index` of `size` around the target, rotating with `phase` (rad). Surround rather than stack. */
export const circleSlotAngle = (index, size, phase) => (index / Math.max(1, size)) * TAU + phase;

// ---- combat geometry ----
/** Does a creature circle (cx,cy,cr px) lie inside a melee arc from (ox,oy)? reachPx measured from the origin to the creature's edge. */
export function inSwingArc(ox, oy, facing, reachPx, halfArc, cx, cy, cr) {
  const dx = cx - ox, dy = cy - oy, d = Math.hypot(dx, dy);
  if (d - cr > reachPx) return false;
  if (d <= cr + 4) return true;
  const slack = Math.asin(Math.min(1, cr / d));
  return angDiff(Math.atan2(dy, dx), facing) <= halfArc + slack;
}

/**
 * Best aim target. cands: [{x,y,hostile?,r?}] (anything with x,y), range px, half-cone rad. Nearest wins; hostiles are weighted closer.
 * Returns the candidate or null.
 */
export function pickAim(ox, oy, facing, cands, rangePx, halfCone, hostileBias = 0.7) {
  let best = null, bs = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i], dx = c.x - ox, dy = c.y - oy, d = Math.hypot(dx, dy);
    if (d > rangePx + (c.r || 0)) continue;
    if (d > 10 && angDiff(Math.atan2(dy, dx), facing) > halfCone) continue;
    const s = d * (c.hostile ? hostileBias : 1);
    if (s < bs) { bs = s; best = c; }
  }
  return best;
}

/** Roll a drop table [{item,n,chance?}] -> [{item,n}] (rand: ()=>[0,1)). */
export function rollDrops(def, rand = Math.random) {
  const out = [];
  for (const d of def.drops || []) if (d.chance === undefined || rand() < d.chance) out.push({ item: d.item, n: d.n });
  return out;
}

/** Spawn quota helpers (pure): how many of `type` may still be added given counts. */
export function spawnRoom(counts, caps) {
  const total = (counts.rabbit || 0) + (counts.deer || 0) + (counts.wolf || 0) + (counts.bear || 0);
  const room = Math.max(0, (caps.creatures ?? AI.populationCap) - total);
  return { rabbit: Math.min(room, Math.max(0, caps.rabbit - (counts.rabbit || 0))), deer: Math.min(room, Math.max(0, caps.deer - (counts.deer || 0))), total: room };
}

/** Pick a point in the ring [minD,maxD] tiles around (px,py) (px) that passes valid(x,y). rand: ()=>[0,1). -> {x,y}|null */
export function pickRingPoint(rand, px, py, minD, maxD, valid, tries = 14) {
  for (let i = 0; i < tries; i++) {
    const a = rand() * TAU, d = (minD + rand() * (maxD - minD)) * TILE;
    const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
    if (valid(x, y)) return { x, y };
  }
  return null;
}
