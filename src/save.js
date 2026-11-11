// Persistence (DESIGN §13). One slot in localStorage['last-ember-save-v1'] = JSON { v, savedAt, state }.
// Pure parts (serialize/parse/migrate) are DOM-free; storage access is try/catch-guarded and injectable for tests.
import { SAVE, STATE_VERSION } from './data/balance.js';

/** Add `MIGRATIONS[n] = (state) => state` to upgrade a state from version n to n+1 (and bump STATE_VERSION in balance.js). */
export const MIGRATIONS = {};

export function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export const serialize = (state) => JSON.stringify({ v: SAVE.version, savedAt: Date.now(), state });

/** Parse + migrate a raw JSON string -> state, or null if unusable. */
export function parse(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.state) return null;
    if (data.v > SAVE.version) return null;
    return migrate(data.state);
  } catch { return null; }
}

export function migrate(state) {
  if (!state || typeof state !== 'object') return null;
  let v = state.version ?? 1;
  if (v > STATE_VERSION) return null;
  while (v < STATE_VERSION) { const fn = MIGRATIONS[v]; if (!fn) return null; state = fn(state) || state; v++; state.version = v; }
  if (!state.world?.terrain || !state.player || !state.inventory) return null;
  return state;
}

export function save(state, storage = defaultStorage()) {
  try { if (!storage || !state) return false; storage.setItem(SAVE.key, serialize(state)); return true; } catch { return false; }
}
export function load(storage = defaultStorage()) {
  try { const raw = storage?.getItem(SAVE.key); return raw ? parse(raw) : null; } catch { return null; }
}
export function hasSave(storage = defaultStorage()) {
  try { return !!storage?.getItem(SAVE.key); } catch { return false; }
}
export function clear(storage = defaultStorage()) {
  try { storage?.removeItem(SAVE.key); return true; } catch { return false; }
}

/** Autosave hooks: every 60s, each sunrise, when the tab is hidden/closed. Returns an uninstall function. */
export function installAutosave(game) {
  const doSave = () => { if (game.mode === 'playing') game.save(); };
  const offs = [game.events.on('time:newDay', doSave), game.events.on('game:pause', doSave)];
  let timer = null, onVis = null;
  if (typeof document !== 'undefined') {
    timer = setInterval(() => { if (!game.paused && !game.hidden) doSave(); }, SAVE.autosaveSeconds * 1000);
    onVis = () => { if (document.hidden) doSave(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', doSave);
  }
  return () => {
    offs.forEach((o) => o());
    if (timer) clearInterval(timer);
    if (onVis) { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', doSave); }
  };
}
