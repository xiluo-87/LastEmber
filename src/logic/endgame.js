// Pure endgame logic (DESIGN §10): tower power rule, signal-night counting, compass-marker visibility and screen-edge placement.
// DOM-free; all numbers from data/balance.js ENDGAME. The system (systems/endgame.js) feeds it game state.
import { ENDGAME, WOLF, TILE } from '../data/balance.js';

export const defaultEndgame = () => ({
  transmitting: false,
  nights: 0,            // counted signal nights
  nightKey: 0,          // day number of the night currently being tracked (0 = none)
  poweredSecs: 0,       // game-seconds this night spent transmitting AND powered
  waves: 0,             // enraged-pack waves already spawned this night
  rescuePending: false, // third night counted: rescue plays at dawn (survives save/load)
  tower: null,          // {tx,ty} of the placed radio tower
  seen: {},             // 'tx,ty' -> true: wreckage the player has come within reveal range of
  home: null,           // {tx,ty} most recently lit campfire
  warned: false,        // runtime-ish: "tower unpowered" toast already shown for this outage
});

/** The tower is powered when a lit campfire or furnace is within `radius` tiles (centre to centre). */
export function isPowered(tower, fires, radius = ENDGAME.towerPowerRadius) {
  if (!tower || !fires) return false;
  for (const f of fires) {
    if (f.type !== 'campfire' && f.type !== 'furnace') continue;
    if (Math.hypot(f.tx - tower.tx, f.ty - tower.ty) <= radius) return true;
  }
  return false;
}

/**
 * Advance the signal by dt GAME seconds. Only the night phase counts and only while transmitting.
 * ctx = { phase, day, dt, powered }. Returns nothing; mutates eg.
 */
export function tickSignal(eg, { phase, day, dt, powered }) {
  if (phase !== 'night' || !eg.transmitting) return;
  if (eg.nightKey !== day) { eg.nightKey = day; eg.poweredSecs = 0; eg.waves = 0; }
  if (powered) eg.poweredSecs += dt;
}

/** Does `poweredSecs` over a night of `nightLen` seconds make it a signal night? */
export const nightCounts = (poweredSecs, nightLen) => nightLen > 0 && poweredSecs >= ENDGAME.poweredFraction * nightLen - 1e-6;

/**
 * Called at dawn (time:newDay) with the length of the night that just ended and the NEW day number.
 * -> { counted, done, nights }.  The tracked night is `day - 1`.
 */
export function finishNight(eg, nightLen, newDay) {
  const tracked = eg.nightKey === newDay - 1;
  const counted = tracked && eg.transmitting && nightCounts(eg.poweredSecs, nightLen);
  if (counted) eg.nights++;
  eg.nightKey = 0; eg.poweredSecs = 0; eg.waves = 0;
  const done = eg.nights >= ENDGAME.signalNights;
  if (done) eg.rescuePending = true;
  return { counted, done, nights: eg.nights, tracked };
}

/** Tower destroyed / removed: progress resets. */
export function resetSignal(eg) {
  eg.transmitting = false; eg.nights = 0; eg.nightKey = 0; eg.poweredSecs = 0; eg.waves = 0; eg.warned = false; eg.tower = null;
}

/** Progress 0..1 over the whole signal phase (counted nights + this night's partial share). */
export function signalProgress(eg, nightLen) {
  const cur = nightLen > 0 ? Math.min(1, eg.poweredSecs / (ENDGAME.poweredFraction * nightLen)) : 0;
  return Math.min(1, (eg.nights + (eg.nights >= ENDGAME.signalNights ? 0 : cur)) / ENDGAME.signalNights);
}

/** Wave plan: total pack = normal size for the day + 2, split over the waves (early gets the larger half). */
export function waveSizes(day, bonus = ENDGAME.enragedPackBonus, waves = ENDGAME.waveAt.length) {
  const total = WOLF.packSize(day) + bonus, out = [];
  let left = total;
  for (let i = 0; i < waves; i++) { const n = Math.ceil(left / (waves - i)); out.push(n); left -= n; }
  return out;
}
/** Index of the next wave due at night fraction `frac` given `done` waves already spawned (or -1). */
export const nextWaveDue = (frac, done) => (done < ENDGAME.waveAt.length && frac >= ENDGAME.waveAt[done] ? done : -1);

// ---------------------------------------------------------------- compass markers
export const wreckKey = (w) => `${w.tx},${w.ty}`;

/** Mark wreckage the player has been within `radius` tiles of (mutates `seen`). */
export function updateSeen(seen, wrecks, ptx, pty, radius = ENDGAME.partsRevealRadius) {
  for (const w of wrecks) if (!w.looted && Math.hypot(w.tx - ptx, w.ty - pty) <= radius) seen[wreckKey(w)] = true;
  return seen;
}

/** Which wreckage gets a marker. With the flight map: every un-looted site. Without: only sites already seen. */
export function visibleWrecks(wrecks, seen, hasMap) {
  return wrecks.filter((w) => !w.looted && (hasMap || seen[wreckKey(w)]));
}

/** Position on the screen rectangle edge for a target at screen (sx,sy); null when it is on screen (inside the padded/inset rect). */
export function edgeMarker(sx, sy, w, h, pad = ENDGAME.markerPad, inset = { top: 0, bottom: 0, left: 0, right: 0 }) {
  const l = pad + (inset.left || 0), r = w - pad - (inset.right || 0), t = pad + (inset.top || 0), b = h - pad - (inset.bottom || 0);
  if (sx >= l && sx <= r && sy >= t && sy <= b) return null;
  const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
  if (dx === 0 && dy === 0) return null;
  const k = Math.min(dx ? (dx > 0 ? (r - cx) / dx : (l - cx) / dx) : Infinity, dy ? (dy > 0 ? (b - cy) / dy : (t - cy) / dy) : Infinity);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

/** Distance in whole tiles between two world-px points. */
export const tilesBetween = (x0, y0, x1, y1) => Math.round(Math.hypot(x1 - x0, y1 - y0) / TILE);
