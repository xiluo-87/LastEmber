// Survival stats (DESIGN §5): health / hunger / thirst / warmth / stamina dynamics, status effects, damage, death.
// Runs after `player` and `weather`. Pure maths lives in logic/temperature.js.
//
// state.survival = { felt (degC), rate (smoothed warmth/s, for the HUD trend arrow), warned:{stat:true}, lastCause:{id,at}|null,
//                    dead, workT, stats:{damageTaken,hits,minFelt} }.   state.player.status = { [effectId]: { left: seconds|null } }
//
// PUBLIC API  (named exports AND `game.survival.*`; every function takes `game` first):
//   damagePlayer(game, amount, cause, opts?) -> dealt     cause = 'wolf'|'bear'|'cold'|... (see DEATH_TEXT); opts:
//        { iframes = true  (0.5 s of i-frames after the hit; a hit during i-frames is ignored, returns 0),
//          bleed: true|0..1 (roll the 35% wolf/bear bleeding chance, or a custom chance) }
//   restoreStat(game, stat, n) -> applied delta (n may be negative; clamps 0..100; stat in health|hunger|thirst|warmth|stamina)
//   eatSnow(game)  (+8 thirst, -10 warmth)      spendStamina(game, n) -> bool       swing(game) -> cooldown multiplier (1, or 1.4 at 0 stamina; spends 6 stamina)
//   noteWork(game, seconds?)  (gathering/chopping: hunger x1.5 for a moment)        swingCooldownMult(game)
//   applyEffect(game, id, {duration?} | seconds) -> bool(new)   clearEffect(game, id) -> bool   hasEffect(game, id) -> bool
//        ids: 'bleeding' (until cleared, -0.6 HP/s) · 'food_poisoning' (60 s, -0.3 HP/s, hunger x2; alias 'poison') · 'sleeping' (hunger/thirst x0.5)
//   rollEffect(game, id, chance) -> bool   feltTemperature(game) -> degC   deathMessage(cause) -> {text, tip}
// Heat/shelter seam (building engineer): see ARCHITECTURE.md §15.  game.heatProviders[] = fn(game, push) -> push({x,y,heat,radius});
//   game.shelterQuery = (tx, ty) -> bool  (enclosed room).  Defaults: no providers, nothing sheltered.
// Events: 'player:damaged' {amount, cause}, 'effect:applied' {id}, 'effect:cleared' {id}, 'player:died' {cause, text}, 'stat:critical' {stat}.
import { TILE, SURVIVAL as S, PLAYER, FX } from '../data/balance.js';
import { feltBreakdown, warmthRate } from '../logic/temperature.js';
import { insulation, selectedStack } from '../logic/inventory.js';
import { itemDef } from '../data/items.js';
import { randomSeed } from '../rng.js';
import { drawFrost, drawRed } from '../render/screenfx.js';

export const STAT_KEYS = ['health', 'hunger', 'thirst', 'warmth', 'stamina'];
const clamp = (v, a = 0, b = S.max) => (v < a ? a : v > b ? b : v);
const ALIAS = { poison: 'food_poisoning', poisoned: 'food_poisoning' };

export const DEATH_TEXT = {
  hypothermia: ['You froze to death.', 'Stay near a fire and keep your clothing warm. Walls trap heat.'],
  starvation: ['You starved to death.', 'Hunt, forage berries and cook meat before the hunger bar empties.'],
  dehydration: ['You died of thirst.', 'Melt snow at a fire (needs a tin pot) and drink before the bar empties.'],
  bleeding: ['You bled to death.', 'Craft bandages and use one as soon as you start bleeding.'],
  food_poisoning: ['Food poisoning finished you off.', 'Cook your meat and boil your water.'],
  wolf: ['You were torn apart by wolves.', 'Stay inside your lit, walled base at night.'],
  bear: ['A bear killed you.', 'Keep away from bear dens, or fight with iron and a plan.'],
};
const DEFAULT_DEATH = ['You did not survive.', 'Every death is a decision. What would you change?'];
export function deathMessage(cause) { const d = DEATH_TEXT[cause] || DEFAULT_DEATH; return { text: d[0], tip: d[1] }; }

const EFFECTS = {
  bleeding: { duration: null, toast: 'You are bleeding. Use a bandage.' },
  food_poisoning: { duration: S.poison.duration, toast: 'You feel sick. Food poisoning.', end: 'You feel better.' },
  sleeping: { duration: null },
};
const CRITICAL_MSG = {
  warmth: 'You are freezing. Find fire or shelter.', hunger: 'You are starving. Find something to eat.',
  thirst: 'You are parched. Melt snow or find water.', health: 'You are badly hurt.', stamina: 'You are out of breath.',
};

const heat = [];                      // reusable source buffer
const brk = {};                       // reusable breakdown

export const hasEffect = (game, id) => !!game.state.player.status[ALIAS[id] || id];
export function applyEffect(game, id, opts = {}) {
  id = ALIAS[id] || id;
  const st = game.state.player.status, def = EFFECTS[id] || {}, fresh = !st[id];
  if (typeof opts === 'number') opts = { duration: opts };   // applyEffect(game, id, seconds) also accepted
  const dur = opts.duration ?? def.duration ?? null;
  st[id] = { left: dur };
  if (fresh) { if (def.toast) game.ui.toast?.(def.toast, 'bad'); game.events.emit('effect:applied', { id }); }
  return fresh;
}
export function clearEffect(game, id) {
  id = ALIAS[id] || id;
  const st = game.state.player.status; if (!st[id]) return false;
  delete st[id]; game.events.emit('effect:cleared', { id }); return true;
}
export function rollEffect(game, id, chance) { if (Math.random() < chance) { applyEffect(game, id); return true; } return false; }

export function restoreStat(game, stat, n) {
  const p = game.state.player, before = p[stat], max = stat === 'health' ? S.max : S.max;
  p[stat] = clamp(before + n, 0, max);
  return p[stat] - before;
}
export const eatSnow = (game) => { restoreStat(game, 'thirst', S.eatSnow.thirst); restoreStat(game, 'warmth', S.eatSnow.warmth); };
export function spendStamina(game, n) { const p = game.state.player; const ok = p.stamina >= n; p.stamina = clamp(p.stamina - n); return ok; }
export const noteWork = (game, seconds = S.workSeconds) => { game.state.survival.workT = Math.max(game.state.survival.workT, seconds); };
export const swingCooldownMult = (game) => (game.state.player.stamina <= 0 ? S.swingSlowMult : 1);
export function swing(game) { const m = swingCooldownMult(game); spendStamina(game, S.swingStamina); noteWork(game); return m; }

function setCause(sv, game, id) { sv.lastCause = { id, at: game.state.stats.playSeconds }; }

export function damagePlayer(game, amount, cause = 'unknown', opts = {}) {
  const sv = game.state.survival, p = game.state.player;
  if (sv.dead || !(amount > 0)) return 0;
  const useI = opts.iframes !== false;
  if (useI && p.invuln > 0) return 0;
  p.health = Math.max(0, p.health - amount);
  if (useI) p.invuln = PLAYER.iFrames;
  sv.stats.damageTaken += amount; sv.stats.hits++;
  setCause(sv, game, cause);
  game.fx.flash = FX.damageFlashSeconds;
  const bleed = opts.bleed === true ? S.bleeding.chanceOnHit : opts.bleed;
  if (bleed) rollEffect(game, 'bleeding', bleed);
  game.events.emit('player:damaged', { amount, cause });
  if (p.health <= 0) die(game, cause);
  return amount;
}

export function feltTemperature(game) { return sv_felt(game).felt; }
function sv_felt(game) {
  const st = game.state, p = st.player, world = game.world;
  heat.length = 0;
  const push = (s) => heat.push(s);
  for (const fn of game.heatProviders) { const r = fn(game, push); if (Array.isArray(r)) for (const s of r) heat.push(s); }
  const q = game.shelterQuery;
  const tl = world.worldToTile(p.x, p.y);
  const held = selectedStack(st.inventory);
  return feltBreakdown({
    ambient: st.time.ambient, weatherOffset: st.weather?.offset || 0, sources: heat, px: p.x, py: p.y,
    sheltered: !!q(tl.tx, tl.ty), shelteredAt: (x, y) => !!q(Math.floor(x / TILE), Math.floor(y / TILE)),
    insulation: insulation(st.inventory), torch: held && itemDef(held.id)?.tool?.class === 'torch' ? (itemDef(held.id).tool.heat || 0) : 0,
  }, brk);
}

function die(game, causeId) {
  const sv = game.state.survival;
  sv.dead = true; game.state.player.health = 0;
  const { text, tip } = deathMessage(causeId);
  game.input.releaseAll?.();
  game.events.emit('player:died', { cause: causeId, text });
  game.end('death', { cause: text, causeId, tip, extra: { ...sv.stats, playSeconds: game.state.stats.playSeconds } });
}

export default {
  name: 'survival',
  defaults: () => ({ felt: 0, rate: 0, warned: {}, lastCause: null, dead: false, workT: 0, stats: { damageTaken: 0, hits: 0, minFelt: 99 } }),
  init(game) {
    game.heatProviders = game.heatProviders || [];
    game.shelterQuery = game.shelterQuery || (() => false);
    game.fx = { flash: 0, lastWarn: -99 };
    game.survival = { damagePlayer, restoreStat, eatSnow, spendStamina, swing, swingCooldownMult, noteWork, applyEffect, clearEffect, hasEffect, rollEffect,
      feltTemperature, deathMessage };
    game.speedModifiers.push((g) => (g.state.player.warmth < S.coldSlowBelowWarmth ? S.coldSlowMult : 1));
  },
  onLoad(game) {
    game.fx.flash = 0;
    const sv = game.state.survival, b = sv_felt(game);
    sv.felt = b.felt; sv.rate = warmthRate(b.felt);
  },
  update(game, dt) {
    const st = game.state, p = st.player, sv = st.survival;
    if (sv.dead || game.mode === 'over') return;
    const it = game.input.intent;

    // felt temperature -> warmth
    const b = sv_felt(game);
    sv.felt = b.felt;
    if (b.felt < sv.stats.minFelt) sv.stats.minFelt = b.felt;
    const rate = warmthRate(b.felt);
    sv.rate += (rate - sv.rate) * Math.min(1, dt / S.trendSmoothing);
    p.warmth = clamp(p.warmth + rate * dt);

    // status effect timers
    const status = p.status;
    for (const id in status) {
      const e = status[id];
      if (e.left != null) { e.left -= dt; if (e.left <= 0) { clearEffect(game, id); const end = EFFECTS[id]?.end; if (end) game.ui.toast?.(end, 'good'); } }
    }
    const bleeding = !!status.bleeding, poisoned = !!status.food_poisoning, sleeping = !!status.sleeping;

    // hunger / thirst
    if (sv.workT > 0) sv.workT -= dt;
    let hm = 1;
    if ((p.sprinting && p.moving) || sv.workT > 0) hm *= S.hungerSprintMult;
    if (p.warmth < S.hungerColdBelowWarmth) hm *= S.hungerColdMult;
    if (poisoned) hm *= S.poison.hungerMult;
    const sleepM = sleeping ? S.sleep.hungerThirstMult : 1;
    p.hunger = clamp(p.hunger - (S.hungerPerMin / 60) * hm * sleepM * dt);
    p.thirst = clamp(p.thirst - (S.thirstPerMin / 60) * sleepM * dt);

    // stamina: sprint drains, otherwise regen (nothing while the sprint input is still held at zero -> no stutter)
    if (p.sprinting && p.moving) p.stamina = clamp(p.stamina - S.sprintStaminaPerSec * dt);
    else {
      const wantsSprint = it.sprint && Math.hypot(it.moveX, it.moveY) > 0.05 && !it.uiBlocked;
      if (!(p.stamina <= 0 && wantsSprint)) p.stamina = clamp(p.stamina + S.staminaRegen * (p.hunger < S.staminaLowBelow || p.thirst < S.staminaLowBelow ? S.staminaRegenLowMult : 1) * dt);
    }

    // damage over time (biggest source names the cause of death) + regen
    let dmg = 0, big = 0, cause = null;
    const dot = (v, id) => { dmg += v; if (v > big) { big = v; cause = id; } };
    if (bleeding) dot(S.bleeding.dmgPerSec, 'bleeding');
    if (poisoned) dot(S.poison.dmgPerSec, 'food_poisoning');
    if (p.warmth <= 0) dot(S.warmthZeroDmg, 'hypothermia');
    if (p.hunger <= 0) dot(S.hungerZeroDmg, 'starvation');
    if (p.thirst <= 0) dot(S.thirstZeroDmg, 'dehydration');
    if (dmg > 0) {
      p.health = Math.max(0, p.health - dmg * dt); sv.stats.damageTaken += dmg * dt; setCause(sv, game, cause);
    } else if (p.hunger > S.regen.minHunger && p.thirst > S.regen.minThirst && p.warmth > S.regen.minWarmth && !bleeding) {
      p.health = clamp(p.health + S.regen.perSec * dt);
    }

    // first-time critical toasts
    for (const k of STAT_KEYS) {
      if (p[k] < S.warnBelow && !sv.warned[k] && game.time - game.fx.lastWarn > 1.6) {   // staggered: one critical toast at a time
        sv.warned[k] = true; game.fx.lastWarn = game.time; game.ui.toast?.(CRITICAL_MSG[k], 'bad', 3200); game.events.emit('stat:critical', { stat: k });
      }
    }
    if (game.fx.flash > 0) game.fx.flash = Math.max(0, game.fx.flash - dt);

    if (p.health <= 0) die(game, sv.lastCause?.id || 'hypothermia');
  },
  drawScreen(game, ctx, w, h) {
    const st = game.state; if (!st?.survival || game.mode === 'title') return;
    const p = st.player, now = performance.now() / 1000;
    if (p.warmth < FX.frostBelowWarmth) {
      const k = (FX.frostBelowWarmth - p.warmth) / FX.frostBelowWarmth;
      drawFrost(ctx, w, h, FX.frostMaxAlpha * (0.35 + 0.65 * k) * (0.92 + 0.08 * Math.sin(now * 2)));
    }
    let red = 0;
    if (p.health < FX.lowHealthBelow) red = (0.25 + 0.2 * Math.sin(now * Math.PI * 2 * FX.lowHealthPulseHz)) * (1 - p.health / FX.lowHealthBelow * 0.6);
    if (game.fx.flash > 0) red = Math.max(red, FX.damageFlashAlpha * (game.fx.flash / FX.damageFlashSeconds));
    drawRed(ctx, w, h, red);
  },
};
