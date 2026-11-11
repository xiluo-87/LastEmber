// Creature definitions (§9). Speeds in tiles/s. Behaviour numbers are consumed by the creatures/combat systems.
//   id, name, hp, speed, radius (tiles), color (fallback), hostile
//   flee: { range, sneakRange? }   herd: [min,max]   drops: [{item,n,chance?}]
//   dmg, cooldown (s), lunge, fleeHpFrac, sight, territory, leash, nightOnly ... (per creature, see below)
//   cap: population cap (undefined = governed by rule, see balance.WOLF / dens)
export const CREATURES = {
  rabbit: { id: 'rabbit', name: 'Rabbit', hp: 6, speed: 4.2, radius: 0.25, color: '#e5e7eb', hostile: false,
    flee: { range: 5 }, cap: 14, drops: [{ item: 'raw_meat', n: 1 }, { item: 'hide', n: 1, chance: 0.5 }] },
  deer: { id: 'deer', name: 'Deer', hp: 30, speed: 4.6, radius: 0.4, color: '#b08968', hostile: false,
    flee: { range: 7, sneakRange: 4 }, herd: [2, 4], cap: 8,
    drops: [{ item: 'raw_meat', n: 3 }, { item: 'hide', n: 2 }, { item: 'bone', n: 1 }, { item: 'fat', n: 1 }] },
  wolf: { id: 'wolf', name: 'Wolf', hp: 28, speed: 3.9, radius: 0.4, color: '#6b7280', hostile: true,
    dmg: 9, cooldown: 1.4, sight: 10, fleeHpFrac: 0.3, packRule: true, // see balance.WOLF
    drops: [{ item: 'raw_meat', n: 2 }, { item: 'hide', n: 1 }, { item: 'bone', n: 1 }, { item: 'fat', n: 1 }] },
  bear: { id: 'bear', name: 'Bear', hp: 120, speed: 3.6, radius: 0.55, color: '#5b4636', hostile: true,
    dmg: 25, cooldown: 2, territory: 6, leash: 12, // cap = number of dens
    drops: [{ item: 'raw_meat', n: 6 }, { item: 'hide', n: 3 }, { item: 'bone', n: 2 }, { item: 'fat', n: 3 }] },
};
export const creatureDef = (id) => CREATURES[id] || null;
