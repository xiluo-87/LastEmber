// Run statistics (pure): defaults, event reducers and the rows shown on the death and victory screens.
import { STATS } from '../data/balance.js';

export const defaultRunStats = () => ({ animalsHunted: 0, wolvesKilled: 0, structuresBuilt: 0, itemsCrafted: 0, distanceTiles: 0, partsFound: 0 });

/** Accumulate walked distance from the player's world px position (`last` = runtime {x,y}; jumps > STATS.maxStepTiles are teleports and ignored). */
export function addDistance(rs, last, x, y, tile = 32) {
  if (last.x != null) {
    const d = Math.hypot(x - last.x, y - last.y) / tile;
    if (d > 0 && d <= STATS.maxStepTiles) rs.distanceTiles += d;
  }
  last.x = x; last.y = y;
}

/** Event -> counter updates. Returns true when the event was recognised. */
export function applyStatEvent(rs, evt, p = {}) {
  switch (evt) {
    case 'creature:killed': {
      const t = p.c?.type;
      if (t === 'rabbit' || t === 'deer' || t === 'wolf' || t === 'bear') { rs.animalsHunted++; if (t === 'wolf') rs.wolvesKilled++; }
      return true;
    }
    case 'structure:placed': rs.structuresBuilt++; return true;
    case 'craft:done': rs.itemsCrafted++; return true;
    case 'radio:partFound': rs.partsFound++; return true;
    default: return false;
  }
}

export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return `${m}m ${String(s % 60).padStart(2, '0')}s`; };
export const fmtDistance = (tiles) => (tiles >= 1000 ? `${(tiles / 1000).toFixed(1)} km` : `${Math.round(tiles)} m`);

/** Rows [label, value] for the end screens. `state` is game.state (any slice may be missing: old saves). */
export function statRows(state) {
  const day = state?.time?.day ?? 1, rs = state?.runstats || defaultRunStats(), sv = state?.survival?.stats;
  const rows = [['Days survived', day], ['Time alive', fmtTime(state?.stats?.playSeconds ?? 0)], ['Animals hunted', rs.animalsHunted], ['Structures built', rs.structuresBuilt]];
  if (sv && sv.minFelt != null && sv.minFelt < 99) rows.push(['Coldest night', `${Math.round(sv.minFelt)}°C`]);
  rows.push(['Distance walked', fmtDistance(rs.distanceTiles)]);
  if (sv?.hits) rows.push(['Hits taken', sv.hits]);
  return rows;
}
