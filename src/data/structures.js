// Placeable structures (§8) AND world object definitions (resource nodes, pickups, POIs).
// Everything that can sit in a tile's single object slot has a definition either in STRUCTURES or NODES;
// use objectDef(type) to look up either.
//
// STRUCTURE fields
//   id, name, cost:[{item,n}], hp
//   blocks         true = blocks player + creatures;  blocksCreatures: true = blocks creatures only (door)
//   color          fallback / icon color;  size: footprint is always 1 tile
//   station        crafting station provided ('workbench'|'campfire'|'furnace'...)
//   fuel           { accepts:[itemId], max }   burnable structures (fuel is seconds, stored on the object)
//   light          { radius (tiles), flicker }  heat: { peak, radius }  (peak degC at centre, linear to 0)
//   storage        slot count for chests;  sleep: true (bedroll)
//   process        { in, out, seconds, slots } drying rack
//   requires       { terrain:'ice', tool:'axe'|'pickaxe'|... } placement requirements;  minFireDist (snare, tiles)
//   needsFlint     campfire first-light requirement
//   extra          free-form numbers (spike damage, snare chance, fishing odds, ...)
// Object instances (in state.world.objects) look like { type, tx, ty, hp?, variant?, ...system data }.
const c = (...pairs) => pairs.map(([item, n]) => ({ item, n }));

export const STRUCTURES = {
  campfire: { id: 'campfire', name: 'Campfire', cost: c(['stick', 3], ['stone', 3]), hp: 40, blocks: true, color: '#ff9f1c', station: 'campfire',
    fuel: { accepts: ['stick', 'wood', 'coal'], max: 600 }, light: { radius: 5, flicker: 0.1 }, heat: { peak: 30, radius: 5 }, needsFlint: true },
  wood_wall: { id: 'wood_wall', name: 'Wood wall', cost: c(['wood', 2]), hp: 80, blocks: true, color: '#8b5a2b' },
  stone_wall: { id: 'stone_wall', name: 'Stone wall', cost: c(['stone', 3], ['wood', 1]), hp: 200, blocks: true, color: '#6b7280' },
  door: { id: 'door', name: 'Door', cost: c(['wood', 2], ['rope', 1]), hp: 60, blocks: false, blocksCreatures: true, color: '#a9744a' },
  workbench: { id: 'workbench', name: 'Workbench', cost: c(['wood', 4], ['stone', 2]), hp: 60, blocks: true, color: '#8b5a2b', station: 'workbench' },
  chest: { id: 'chest', name: 'Chest', cost: c(['wood', 4]), hp: 60, blocks: true, color: '#8b5a2b', storage: 12 },
  bedroll: { id: 'bedroll', name: 'Bedroll', cost: c(['fiber', 3], ['hide', 2]), hp: 20, blocks: false, color: '#b5523c', sleep: true },
  furnace: { id: 'furnace', name: 'Furnace', cost: c(['stone', 8], ['coal', 2]), hp: 120, blocks: true, color: '#6b7280', station: 'furnace',
    fuel: { accepts: ['coal', 'wood'], max: 600 }, light: { radius: 3, flicker: 0.1 }, heat: { peak: 15, radius: 3 } },
  drying_rack: { id: 'drying_rack', name: 'Drying rack', cost: c(['stick', 4], ['rope', 2]), hp: 30, blocks: true, color: '#a9744a',
    process: { in: 'raw_meat', out: 'jerky', seconds: 120, slots: 3 } },
  snare: { id: 'snare', name: 'Snare', cost: c(['stick', 2], ['rope', 1]), hp: 10, blocks: false, color: '#a9744a',
    minFireDist: 6, extra: { dawnChance: 0.35, drops: c(['raw_meat', 1], ['hide', 1]) } },
  spike_barricade: { id: 'spike_barricade', name: 'Spike barricade', cost: c(['stick', 3], ['wood', 1]), hp: 60, blocks: true, color: '#a9744a', extra: { contactDps: 8 } },
  torch_post: { id: 'torch_post', name: 'Torch post', cost: c(['stick', 2], ['fat', 1]), hp: 20, blocks: true, color: '#ff9f1c',
    fuel: { accepts: ['fat', 'coal'], max: 300 }, light: { radius: 4, flicker: 0.12 }, extra: { burnSeconds: 300 } },
  fishing_hole: { id: 'fishing_hole', name: 'Fishing hole', cost: c(['stick', 1]), hp: 0, blocks: false, color: '#2b6f8f',
    requires: { terrain: 'ice', toolAny: ['axe', 'pickaxe'] }, extra: { castSeconds: 6, catchChance: 0.55, snapChance: 0.08 } },
  radio_tower: { id: 'radio_tower', name: 'Radio tower', cost: c(['iron_ingot', 6], ['wood', 6], ['rope', 2], ['radio_antenna', 1], ['radio_battery', 1], ['radio_circuit', 1]),
    hp: 300, blocks: true, color: '#9aa5b1', extra: { powerRadius: 4 } },
};

// World objects that are not player-built.
//   kind 'node' (gatherable), 'pickup' (walk-onto/instant), 'poi' (points of interest)
//   gather: { tool (class required for `drops`), hp (work to deplete), drops:[{item,n:[min,max],chance?}],
//             handDrops (what bare hands/other tools yield), handHp, regrowDays (node becomes depleted, regrows) }
//   loot:  filled at gen time into obj.loot = [{item,n}] ; part: obj.part = radio part id
//   verb:  action label shown on the Action button; interactable: can be the target
export const NODES = {
  tree: { id: 'tree', name: 'Pine tree', kind: 'node', blocks: true, interactable: true, verb: 'Chop', variants: 3,
    gather: { tool: 'axe', hp: 120, drops: [{ item: 'wood', n: [3, 4] }, { item: 'stick', n: [1, 2] }], handDrops: [{ item: 'stick', n: [1, 1] }], handHp: 40 } },
  dead_bush: { id: 'dead_bush', name: 'Dead bush', kind: 'node', blocks: true, interactable: true, verb: 'Gather', variants: 3,
    gather: { hp: 12, drops: [{ item: 'stick', n: [1, 2] }, { item: 'fiber', n: [1, 2] }] } },
  rock_node: { id: 'rock_node', name: 'Boulder', kind: 'node', blocks: true, interactable: true, verb: 'Mine', variants: 3,
    gather: { tool: 'pickaxe', hp: 90, drops: [{ item: 'stone', n: [2, 4] }, { item: 'flint', n: [1, 1], chance: 0.35 }], handDrops: [{ item: 'stone', n: [1, 1] }], handHp: 30 } },
  iron_node: { id: 'iron_node', name: 'Iron vein', kind: 'node', blocks: true, interactable: true, verb: 'Mine', variants: 2,
    gather: { tool: 'pickaxe', hp: 110, drops: [{ item: 'iron_ore', n: [2, 3] }] } },
  coal_node: { id: 'coal_node', name: 'Coal seam', kind: 'node', blocks: true, interactable: true, verb: 'Mine', variants: 2,
    gather: { tool: 'pickaxe', hp: 90, drops: [{ item: 'coal', n: [2, 4] }] } },
  berry_bush: { id: 'berry_bush', name: 'Berry bush', kind: 'node', blocks: false, interactable: true, verb: 'Pick', variants: 2,
    gather: { hp: 6, drops: [{ item: 'berries', n: [2, 4] }], regrowDays: 2 } },
  herb: { id: 'herb', name: 'Herb', kind: 'node', blocks: false, interactable: true, verb: 'Pick', variants: 2,
    gather: { hp: 4, drops: [{ item: 'herb', n: [1, 1] }] } },
  loose_stone: { id: 'loose_stone', name: 'Loose stone', kind: 'pickup', blocks: false, interactable: true, verb: 'Take', variants: 3, pickup: { item: 'stone', n: 1 } },
  loose_stick: { id: 'loose_stick', name: 'Loose stick', kind: 'pickup', blocks: false, interactable: true, verb: 'Take', variants: 3, pickup: { item: 'stick', n: 1 } },
  crash_site: { id: 'crash_site', name: 'Crash-site crate', kind: 'poi', blocks: true, interactable: true, verb: 'Open', variants: 1, lootable: true },
  wreckage: { id: 'wreckage', name: 'Wreckage', kind: 'poi', blocks: true, interactable: true, verb: 'Search', variants: 3, lootable: true },
  bear_den: { id: 'bear_den', name: 'Bear den', kind: 'poi', blocks: true, interactable: false, variants: 1, extra: { territory: 6, leash: 12 } },
};

// Loot rolled at world-gen time (deterministic from the seed).
export const LOOT = {
  crashCrate: [{ item: 'tin_pot', n: 1 }, { item: 'flight_map', n: 1 }, { item: 'cloth', n: 2 }, { item: 'bandage', n: 1 }, { item: 'berries', n: 3 }],
  wreckage: { // each site rolls `rolls` entries from `table` (weighted) plus its radio part
    rolls: 3,
    table: [
      { item: 'cloth', n: [1, 3], w: 3 }, { item: 'bandage', n: [1, 2], w: 2 }, { item: 'rope', n: [1, 2], w: 2 },
      { item: 'iron_ingot', n: [1, 2], w: 1 }, { item: 'flint', n: [1, 2], w: 2 }, { item: 'cooked_meat', n: [1, 2], w: 2 },
      { item: 'torch', n: [1, 1], w: 1 }, { item: 'clean_water', n: [1, 2], w: 2 },
    ],
  },
  radioParts: ['radio_antenna', 'radio_battery', 'radio_circuit'],
};

export const objectDef = (type) => STRUCTURES[type] || NODES[type] || null;
export const isStructure = (type) => !!STRUCTURES[type];
