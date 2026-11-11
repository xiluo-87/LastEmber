// Creature definitions (§9). Speeds in tiles/s. Behaviour numbers are consumed by the creatures/combat systems.
//   id, name, hp, speed, radius (tiles), color (fallback), hostile
//   flee: { range, sneakRange? }   herd: [min,max]   drops: [{item,n,chance?}]
//   dmg, cooldown (s), lunge, fleeHpFrac, sight, territory, leash, nightOnly ... (per creature, see below)
//   cap: population cap (undefined = governed by rule, see balance.WOLF / dens)
export const CREATURES = {
  rabbit: { id: 'rabbit', name: 'Rabbit', hp: 6, speed: 4.2, radius: 0.25, color: '#e5e7eb', hostile: false,
    flee: { range: 5, sneakRange: 2.2 }, cap: 14, drops: [{ item: 'raw_meat', n: 1 }, { item: 'hide', n: 1, chance: 0.5 }] },
  deer: { id: 'deer', name: 'Deer', hp: 30, speed: 4.6, radius: 0.4, color: '#b08968', hostile: false,
    flee: { range: 7, sneakRange: 4 }, herd: [2, 4], cap: 8,
    drops: [{ item: 'raw_meat', n: 3 }, { item: 'hide', n: 2 }, { item: 'bone', n: 1 }, { item: 'fat', n: 1 }] },
  wolf: { id: 'wolf', name: 'Wolf', hp: 28, speed: 3.9, radius: 0.4, color: '#6b7280', hostile: true,
    dmg: 9, cooldown: 1.4, sight: 10, fleeHpFrac: 0.3, packRule: true, // see balance.WOLF
    drops: [{ item: 'raw_meat', n: 2 }, { item: 'hide', n: 1 }, { item: 'bone', n: 1 }, { item: 'fat', n: 1 }] },
  bear: { id: 'bear', name: 'Bear', hp: 180, speed: 3.6, radius: 0.55, color: '#5b4636', hostile: true,
    dmg: 28, cooldown: 1.5, territory: 6, leash: 12, poise: true, // cap = number of dens; poise: player hits do not interrupt its swing
    drops: [{ item: 'raw_meat', n: 6 }, { item: 'hide', n: 3 }, { item: 'bone', n: 2 }, { item: 'fat', n: 3 }] },
};
export const creatureDef = (id) => CREATURES[id] || null;

// ---- behaviour tuning (consumed by logic/ai.js, systems/creatures.js, systems/combat.js). Tiles, seconds, tiles/s. ----
export const AI = {
  thinkHz: 6,                       // AI decisions per second per creature (staggered); movement is every tick
  activeRadius: 46,                 // creatures farther than this (tiles) from the player are frozen
  despawnRadius: 70,                // free-roaming prey this far away is removed
  spawnMin: 14, spawnMax: 30,       // spawn ring around the player (tiles); min is DESIGN §9 (off-screen, >=14)
  spawnInterval: 4,                 // seconds between prey top-up attempts
  seedMinFromSpawn: 16,             // initial world population keeps this far from the player start
  rabbit: { wander: 4, pause: [0.8, 3], hop: 1, fleeSeconds: 1.8, zigzag: 0.9 },
  deer: { wander: 5, pause: [2, 6], fleeSeconds: 2.5, herdLeash: 4, alertShare: 8 },
  wolf: {
    circleR: 4.2, circleSpeedMult: 0.85, lungeSpeed: 9.5, lungeDist: 3.4, telegraph: 0.4, recover: 0.6, lungeRange: 5.2,
    circleTime: [1.4, 2.8], keepDistDay: [9, 12], huntHysteresis: 1.7, prowlDrift: 28, enragedSight: 22,
    hitReach: 0.35, maxLungers: (size) => Math.max(1, Math.ceil(size / 3)), packGap: 0.7, fireMargin: 0.6,
    torchFearR: 3.5, fleeSeconds: 6, aggroSeconds: 12, carcassSense: 12, guardR: 2.6, feedRate: 2,
    structureHitInterval: 1.4, structureDmgMult: 1.5, blockerReach: 1.6, structureStuck: 1.2, despawnDist: 16,
    secondPackDelay: 90, maxPacksPerNight: 2,
  },
  bear: { charge: 1.25, telegraph: 0.45, reach: 0.45, wander: 2.5, pause: [2, 5], regen: 4, aggroSeconds: 10, respawnDays: 3, structureHitInterval: 2 },
  stuck: { checkSeconds: 0.5, minProgress: 0.25, escapeSeconds: 0.8 },
  bfs: { maxNodes: 700, farNodes: 2400, goalRadius: 1 },
  knockback: 140,                   // px/s initial impulse scale (x COMBAT.knockback tiles)
  carcassSeconds: 120, butcherSeconds: 1.0, butcherReach: 1.5,
  spikeDps: 8,
  populationCap: 40,
};
export const PROJECTILE = { arrowSpeed: 15, arrowRadius: 3, recoverChance: 0.5, maxRange: 7.5, shootCooldown: 0 };
export const NEW_PACK_TOAST = 'Wolves are hunting tonight';
