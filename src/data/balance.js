// All tunable numbers from DESIGN.md. No magic numbers in systems: add here.
// Units: distances in TILES unless suffixed Px; time in SECONDS; speeds in tiles/s.

export const TILE = 32;                       // world px per tile
export const MAP = { w: 128, h: 128, borderMin: 3, borderMax: 5, spawn: { tx: 64, ty: 64 } };
export const LOOP = { step: 1 / 60, maxSteps: 5 };
export const CAMERA = { targetTilesShortSide: 12, minScale: 1, maxScale: 1.75, maxDpr: 2 };

export const INVENTORY = { bag: 16, hotbar: 5, clothing: 3, defaultStack: 20, chest: 12 };
export const CLOTHING_SLOTS = ['head', 'body', 'feet']; // index in inventory.clothing[]

export const TIME = {
  dayLength: 480,          // real seconds per full day
  baseNight: 180,          // night length on day 1
  nightGrowPerDay: 6,
  maxNight: 300,
  dawnLength: 30,          // ramp-up at start of daylight
  duskLength: 30,          // ramp-down at end of daylight
  startT: 40,              // game starts this many seconds after sunrise
  minAmbient: 0.06,        // ambient light at deepest night (0..1)
  clockOffsetHours: 6,     // t=0 (sunrise start) displays as 06:00
  sleepScale: 12,
};

export const TEMPERATURE = {
  noonBase: -4, perDay: -1.2, floor: -40, nightOffset: -10,
  day1Bonus: 8, day1BonusFadeSeconds: 240,   // day-1 tutorial slack: +8 degC on day 1, fading out over the first half of day 2
  snow: -3, blizzard: -12,
  comfort: 10, warmthRate: 0.06, rateMin: -2.5, rateMax: 3,
  campfire: { peak: 30, radius: 5 }, furnace: { peak: 15, radius: 3 }, torchHeld: 4,
  shelterBonus: 8, enclosedFireMult: 1.5,
  feltMax: 26,                               // felt temperature never exceeds this (fire next to you cannot read as 58 degC)
};

export const WEATHER = {
  types: ['clear', 'snow', 'blizzard'],
  blizzard: { firstDay: 2, minDuration: 60, maxDuration: 150, warnSeconds: 30, moveMult: 0.8, visibilityTiles: 4, shelterlessFuelMult: 2,
    chanceBase: 0.25, chancePerDay: 0.1, chanceMax: 0.85 },        // chance of a blizzard on a given day (day >= firstDay)
  snow: { chance: 0.5, minDuration: 60, maxDuration: 180 },       // light-snow episode chance per day
  day1ClearSeconds: 300,           // day 1: no weather in the first N seconds of the day
  fadeSeconds: 4,                  // intensity / temperature-offset ease time on weather change
};

export const SURVIVAL = {
  max: 100,
  hungerPerMin: 100 / 14, thirstPerMin: 100 / 9,
  hungerSprintMult: 1.5, hungerColdMult: 1.3, hungerColdBelowWarmth: 40,
  sprintStaminaPerSec: 18, swingStamina: 6, staminaRegen: 14, staminaRegenLowMult: 0.5, staminaLowBelow: 20,
  hungerZeroDmg: 0.5, thirstZeroDmg: 0.8, warmthZeroDmg: 1.5,
  coldSlowBelowWarmth: 25, coldSlowMult: 0.85,
  regen: { perSec: 0.25, minHunger: 50, minThirst: 50, minWarmth: 50 },
  warnBelow: 25,
  bleeding: { dmgPerSec: 0.6, chanceOnHit: 0.35 },
  poison: { duration: 60, dmgPerSec: 0.3, hungerMult: 2, rawMeat: 0.4, snowWater: 0.15 },
  eatSnow: { thirst: 8, warmth: -10 },
  sleep: { minFeltTemp: 5, hostileRadius: 8, hungerThirstMult: 0.5 },
  workSeconds: 1.2,                 // hunger x1.5 "working" window after a swing/gather (noteWork)
  trendSmoothing: 1.5,              // seconds, smoothing of the warmth-rate readout (HUD arrow)
  trendThreshold: 0.12,             // |rate| below this shows no trend arrow
  swingSlowMult: 1.4,               // swings are 40% slower at zero stamina
  warmBonusToastBelow: 25,
};

// Screen effects (render/screenfx.js, render/particles.js). Pooled; sized for phones.
export const FX = {
  snowParticles: 70, blizzardParticles: 260, maxParticles: 260,
  snowFall: [55, 110], snowDrift: -18,            // px/s
  blizzardFall: [120, 260], blizzardWind: [-640, -380],
  frostBelowWarmth: 25, frostMaxAlpha: 0.85,
  damageFlashSeconds: 0.45, damageFlashAlpha: 0.55,
  lowHealthBelow: 25, lowHealthPulseHz: 1.4,
  fogMaxAlpha: 0.93, fogClearTiles: 1.2,
};

export const PLAYER = {
  walk: 3.2, sprint: 4.8,           // tiles/s
  radius: 0.3,                      // collision circle, tiles
  interactCone: { range: 1.4, halfAngleDeg: 55 },
  iFrames: 0.5, bobPerTile: 2.4,    // walk-bob radians per tile walked
  startStat: 100, aimIdleSeconds: 3, // mouse aim overrides move-facing for this long after mouse moves
  startClothing: { body: 'worn_jacket' },
};

export const LIGHT = {
  campfire: 5, torchPost: 4, torchHeld: 3.5, personal: 1.5,
  maxDarkness: 0.94, flickerDefault: 0.08,
};

export const BUILD = { placeRange: 3, dismantleRefund: 0.5, repairPerUnit: 0.5, roomMaxTiles: 60, dismantleHoldSec: 1 };
export const FIRE = { maxFuel: 600, fuel: { stick: 20, wood: 60, coal: 150 }, torchBurn: 180, torchPostBurn: 300 };

export const COMBAT = { knockback: 0.35, hitFlash: 0.15, bowRange: 7, autoAimDeg: 30 };

export const WOLF = {
  packSize: (day) => Math.min(6, 1 + Math.floor(day / 2)),
  attackStructuresFromDay: 5, ignoreFireFromDay: 8, ignoreFireMinPack: 4,
  dayAttackBelowHp: 40, nightHuntRadius: 10, fleeHpFrac: 0.3,
};
export const SPAWN = { minDistFromPlayer: 14, caps: { rabbit: 14, deer: 8, creatures: 40 } };

export const ENDGAME = {
  towerPowerRadius: 4, signalNights: 3, enragedPackBonus: 2,
  flightMapRevealRadius: 20, partsRevealRadius: 20,
  poweredFraction: 0.8,             // a signal night counts when the tower transmitted powered for >= this share of the night
  waveAt: [0.08, 0.55],             // enraged-pack spawn points as a fraction of the night (early, late)
  powerCheckEvery: 0.25,            // s between "is a fire within range" checks
  rescue: { swell: 3.2, plane: 4.6, fade: 1.8, shadowSize: 150 },   // real seconds: engine swell -> flyover -> fade to victory
  markerPad: 30, touchBox: { w: 215, h: 292 },   // screen-edge compass markers: px inset from the screen edge
};
export const TOASTS = { maxVisible: 2, ms: 3000, maxMs: 3200, queueMax: 6 };
// TUTORIAL: contextual one-time tips; thresholds
export const TUTORIAL = { coldWarmth: 40, lowDurFrac: 0.2, checkEvery: 0.5, tickSeconds: 1.1, campfireSticks: 3, campfireStones: 3 };
export const STATS = { maxStepTiles: 3 };   // run-stats tracker: ignore per-tick movement jumps bigger than this (teleports)

export const WORLD_GEN = {
  clearingRadius: 6, wreckageMinDist: 40, wreckageCount: 3, wreckageSpacing: 30,
  denCount: [2, 3], denMinDistFromSpawn: 28, denSpacing: 24, denRockRadius: [5, 7],
  nearSpawn: { looseStone: 8, looseStick: 9, tree: 8, deadBush: 4, rockNode: 3, berry: 2, ringMin: 3, ringMax: 12 },
  treeMax: 0.3, deepSnowThreshold: 0.64, lakeThreshold: 0.72, rockThreshold: 0.7, cliffThreshold: 0.86,
};

export const SAVE = { key: 'last-ember-save-v1', version: 1, autosaveSeconds: 60 };
export const STATE_VERSION = 1;

// ---- interaction / gathering / item use / crafting (interact, gather, items, crafting systems) ----
// SWING: one swing = windup (until impact) + recovery. Total swing time per tool class; stamina cost is SURVIVAL.swingStamina.
//   When stamina is 0 swings are 40% slower (DESIGN §5). `impact` is the fraction of the swing at which the hit lands.
export const SWING = {
  time: { hands: 0.45, axe: 0.55, pickaxe: 0.6, spear: 0.5, bow: 0.7, torch: 0.45 },
  impact: 0.35, slowMult: 1 / 0.6, arcHalfDeg: 50, pickupCooldown: 0.25, openCooldown: 0.4, itemUseCooldown: 0.3,
};
// GATHER: durability per successful hit with the matching tool; hand harvests allowed per tree before it is "bare";
// loose-pickup / FX tuning.
export const GATHER = {
  durPerHit: 1, handMaxPerTree: 4, shakeSeconds: 0.22, shakePx: 2.4, floatSeconds: 1.1, chips: 5,
  dropSearchRadius: 2,   // tiles around the player searched for a free tile when dropping an item
};
export const ITEM_USE = { torchWarnSeconds: 20, eatSnow: { thirst: 8, warmth: -10 } };

// ---- building / structures / sleep (systems/building.js, structures.js, sleep.js) ----
export const BUILDING = {
  noticeRadius: 10,                 // tiles: "fire went out" / "destroyed" toasts, low-fuel chip
  lowFuelSeconds: 30,               // low-fuel warning chip below this (nearest lit fire)
  stationRadius: { workbench: 2, campfire: 2.5, furnace: 2.5 },   // tiles from the structure centre
  torchPostFuel: { fat: 150, coal: 300 },                          // seconds of burn per item (max = FIRE.torchPostBurn)
  roomMinToast: 2,                  // smallest enclosed room that gets the "Shelter complete" feedback
  roomFlashSeconds: 1.6,
  doorOpenRadius: 1.35,             // tiles: a door looks open while the player is this close
  invalidToastGap: 0.9,             // s between identical placement-refusal toasts
  fuelHold: { delay: 0.4, every: 0.11 },   // fuel panel: hold a button to keep adding
  hpBarSeconds: 4,                  // damaged-structure hp bar stays up this long after the last hit (always shown below 50%)
  rackSlots: 3,
  sleep: { staminaPerSec: 20, healthPerGameSec: 0.15, wakeFeltBelow: 0 },   // stamina per REAL second; health per GAME second (night ~ +27 HP)
  repairMaterial: { campfire: 'stone', wood_wall: 'wood', stone_wall: 'stone', door: 'wood', workbench: 'wood', chest: 'wood', bedroll: 'hide',
    furnace: 'stone', drying_rack: 'stick', snare: 'stick', spike_barricade: 'wood', torch_post: 'stick', radio_tower: 'iron_ingot' },
};
