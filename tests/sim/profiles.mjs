// Bot play profiles. Every number is a knob of the policy in goals.mjs (thresholds are stat values 0..100, times in seconds).
const base = {
  eatBelow: 50, drinkBelow: 55, warmBelow: 45, warmUntil: 80,
  base: true,            // builds a campfire base near spawn
  walls: true,           // walls + door room around the fire
  workbench: true, bedroll: true, clothing: true, hunt: true, snares: true, rack: true, chest: true, torches: true,
  stockpileWood: 20,     // wood kept in the bag (beyond what projects need) for fuel
  fuelReserve: 240,      // refuel the base fire when below this many fuel-seconds and daylight/at home
  nightFuel: true,       // top the fire up before dusk so it lasts the whole night
  retreatDusk: 45,       // seconds before night when the bot heads home
  fightWolves: true, fightHp: 45,
  maxRange: 38,          // tiles from home for ordinary gathering
  stone: true, spikes: true, iron: true, expeditions: true, endgame: true, sleep: true,
  daysSafe: 99,
};

export const PROFILES = {
  idle: { ...base },
  // lights a fire and eats/drinks reactively, but never builds walls, never makes clothing, never stockpiles
  sloppy: { ...base, walls: false, workbench: false, bedroll: false, clothing: false, snares: false, rack: false, chest: false, torches: false,
    stockpileWood: 0, fuelReserve: 60, nightFuel: false, retreatDusk: 0, eatBelow: 30, drinkBelow: 35, warmBelow: 30, warmUntil: 55, fightHp: 25,
    stone: false, spikes: false, iron: false, expeditions: false, endgame: false, sleep: false, maxRange: 30 },
  // the full policy: fire -> axe -> stockpile -> walled room -> pickaxe -> water/food loops -> bed -> clothing -> upgrades -> iron -> radio
  competent: { ...base },
  // ignores the base after the first fire: straight to iron and the three wreckage sites, then builds the tower
  rusher: { ...base, walls: false, workbench: true, bedroll: false, clothing: false, snares: false, rack: false, chest: false, torches: false,
    stockpileWood: 8, fuelReserve: 120, nightFuel: true, retreatDusk: 20, stone: false, spikes: false, sleep: false, rusher: true, maxRange: 60 },
};
