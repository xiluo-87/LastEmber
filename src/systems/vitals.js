// Thin adapter between gameplay (item use, swing stamina, eating snow) and the survival engineer's API (systems/survival.js).
// All gameplay code in the interaction/gather/items systems goes through here so there is one place to change.
import * as survival from './survival.js';

export const restoreStat = (game, stat, n) => survival.restoreStat(game, stat, n);
export const applyEffect = (game, id, seconds) => survival.applyEffect(game, id, seconds);
export const clearEffect = (game, id) => survival.clearEffect(game, id);
export const hasEffect = (game, id) => survival.hasEffect(game, id);
export const damagePlayer = (game, n, cause, opts) => survival.damagePlayer(game, n, cause, opts);
/** Starts a swing: spends swing stamina, marks "working" (hunger x1.5), returns the cooldown multiplier (1.4 at 0 stamina). */
export const swing = (game) => survival.swing(game);
export const noteWork = (game) => survival.noteWork(game);
export const eatSnow = (game) => survival.eatSnow(game);
