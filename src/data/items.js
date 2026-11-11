// Item definitions. Add an item = add one entry here (+ optional icon in src/render/icons.js).
//
// Fields
//   id        string key (same as object key)
//   name      display name
//   kind      'resource'|'food'|'drink'|'tool'|'weapon'|'ammo'|'clothing'|'medical'|'container'|'quest'
//   stack     max stack size (1 = non-stacking; such items carry `dur` in their slot when they have durability)
//   color     base color for generated icon;  shape: icon shape hint (see render/icons.js)
//   unique    true = only one should exist in the world (quest/utility)
//   fuel      seconds of burn time when added to a campfire/furnace
//   food      { hunger, thirst, warmth, health, poison (0..1 chance), cures:'bleeding'|'poison' }  (all optional, additive)
//   tool      { class:'axe'|'pickaxe'|'spear'|'bow'|'torch'|'hands', dmg, reach (tiles), dur (max durability),
//               mult:{ <nodeId>: n } damage multiplier vs resource nodes, ammo:'arrow', range (tiles),
//               light, heat, burn (seconds) }
//   clothing  { slot:'head'|'body'|'feet', insulation (deg C) }
const R = (id, name, color, shape = 'blob', extra = {}) => ({ id, name, kind: 'resource', stack: 20, color, shape, ...extra });

export const ITEMS = {
  // --- resources ---
  wood: R('wood', 'Wood', '#8b5a2b', 'log', { fuel: 60 }),
  stick: R('stick', 'Stick', '#a9744a', 'stick', { fuel: 20 }),
  stone: R('stone', 'Stone', '#6b7280', 'rock'),
  flint: R('flint', 'Flint', '#374151', 'shard'),
  fiber: R('fiber', 'Plant fiber', '#b5c27a', 'tuft'),
  rope: R('rope', 'Rope', '#c8a46a', 'coil'),
  hide: R('hide', 'Hide', '#a0673c', 'cloth'),
  bone: R('bone', 'Bone', '#eae3d2', 'bone'),
  fat: R('fat', 'Fat', '#f1e3b0', 'blob'),
  iron_ore: R('iron_ore', 'Iron ore', '#a05a3c', 'rock'),
  iron_ingot: R('iron_ingot', 'Iron ingot', '#9aa5b1', 'bar'),
  coal: R('coal', 'Coal', '#1f2933', 'rock', { fuel: 150 }),
  herb: R('herb', 'Herb', '#59a96a', 'leaf'),
  cloth: R('cloth', 'Cloth', '#cfd8e3', 'cloth'),
  radio_antenna: R('radio_antenna', 'Radio antenna', '#cbd5e1', 'antenna', { stack: 1, unique: true, kind: 'quest' }),
  radio_battery: R('radio_battery', 'Radio battery', '#f4c430', 'battery', { stack: 1, unique: true, kind: 'quest' }),
  radio_circuit: R('radio_circuit', 'Circuit board', '#2f9e6b', 'chip', { stack: 1, unique: true, kind: 'quest' }),
  flight_map: R('flight_map', 'Flight map', '#e9d8a6', 'map', { stack: 1, unique: true, kind: 'quest' }),

  // --- food & drink ---
  berries: { id: 'berries', name: 'Berries', kind: 'food', stack: 20, color: '#c0394f', shape: 'berry', food: { hunger: 8, thirst: 2 } },
  raw_meat: { id: 'raw_meat', name: 'Raw meat', kind: 'food', stack: 20, color: '#c75b5b', shape: 'meat', food: { hunger: 15, poison: 0.4 } },
  cooked_meat: { id: 'cooked_meat', name: 'Cooked meat', kind: 'food', stack: 20, color: '#8a4b2a', shape: 'meat', food: { hunger: 35 } },
  jerky: { id: 'jerky', name: 'Jerky', kind: 'food', stack: 20, color: '#6e3b22', shape: 'strip', food: { hunger: 40 } },
  raw_fish: { id: 'raw_fish', name: 'Raw fish', kind: 'food', stack: 20, color: '#7fa7c9', shape: 'fish', food: { hunger: 10, poison: 0.25 } }, // poison chance not in spec: assumed 25%
  cooked_fish: { id: 'cooked_fish', name: 'Cooked fish', kind: 'food', stack: 20, color: '#d9a066', shape: 'fish', food: { hunger: 28 } },
  snow_water: { id: 'snow_water', name: 'Snow water', kind: 'drink', stack: 20, color: '#b8d4e8', shape: 'drop', food: { thirst: 25, poison: 0.15 } },
  clean_water: { id: 'clean_water', name: 'Clean water', kind: 'drink', stack: 20, color: '#5fb0e8', shape: 'drop', food: { thirst: 40 } },
  herbal_tea: { id: 'herbal_tea', name: 'Herbal tea', kind: 'drink', stack: 20, color: '#8fbf5a', shape: 'cup', food: { thirst: 35, warmth: 15, cures: 'poison' } },

  // --- containers / medical ---
  tin_pot: { id: 'tin_pot', name: 'Tin pot', kind: 'container', stack: 1, unique: true, color: '#9aa5b1', shape: 'pot' },
  bandage: { id: 'bandage', name: 'Bandage', kind: 'medical', stack: 20, color: '#f3f4f6', shape: 'cloth', food: { health: 10, cures: 'bleeding' } },

  // --- tools & weapons (non-stacking, durability in slot.dur) ---
  stone_axe: { id: 'stone_axe', name: 'Stone axe', kind: 'tool', stack: 1, color: '#6b7280', shape: 'axe', tool: { class: 'axe', dmg: 10, reach: 1.1, dur: 60, mult: { tree: 3 } } },
  stone_pickaxe: { id: 'stone_pickaxe', name: 'Stone pickaxe', kind: 'tool', stack: 1, color: '#6b7280', shape: 'pick', tool: { class: 'pickaxe', dmg: 8, reach: 1.1, dur: 60, mult: { rock_node: 3, iron_node: 3, coal_node: 3 } } },
  spear: { id: 'spear', name: 'Spear', kind: 'weapon', stack: 1, color: '#a9744a', shape: 'spear', tool: { class: 'spear', dmg: 18, reach: 1.8, dur: 50 } },
  bow: { id: 'bow', name: 'Bow', kind: 'weapon', stack: 1, color: '#8b5a2b', shape: 'bow', tool: { class: 'bow', dmg: 22, reach: 7, range: 7, dur: 80, ammo: 'arrow' } },
  arrow: { id: 'arrow', name: 'Arrow', kind: 'ammo', stack: 20, color: '#d1b38a', shape: 'stick' },
  torch: { id: 'torch', name: 'Torch', kind: 'tool', stack: 1, color: '#ff9f1c', shape: 'torch', tool: { class: 'torch', dmg: 6, reach: 1.1, light: 3.5, heat: 4, burn: 180, scaresWolves: true } },
  iron_axe: { id: 'iron_axe', name: 'Iron axe', kind: 'tool', stack: 1, color: '#9aa5b1', shape: 'axe', tool: { class: 'axe', dmg: 16, reach: 1.1, dur: 200, mult: { tree: 6 } } },
  iron_pickaxe: { id: 'iron_pickaxe', name: 'Iron pickaxe', kind: 'tool', stack: 1, color: '#9aa5b1', shape: 'pick', tool: { class: 'pickaxe', dmg: 12, reach: 1.1, dur: 200, mult: { rock_node: 3, iron_node: 3, coal_node: 3 } } },
  iron_spear: { id: 'iron_spear', name: 'Iron spear', kind: 'weapon', stack: 1, color: '#9aa5b1', shape: 'spear', tool: { class: 'spear', dmg: 30, reach: 1.8, dur: 150 } },

  // --- clothing ---
  fur_hat: { id: 'fur_hat', name: 'Fur hat', kind: 'clothing', stack: 1, color: '#a0673c', shape: 'hat', clothing: { slot: 'head', insulation: 4 } },
  fur_coat: { id: 'fur_coat', name: 'Fur coat', kind: 'clothing', stack: 1, color: '#a0673c', shape: 'coat', clothing: { slot: 'body', insulation: 9 } },
  fur_boots: { id: 'fur_boots', name: 'Fur boots', kind: 'clothing', stack: 1, color: '#a0673c', shape: 'boot', clothing: { slot: 'feet', insulation: 4 } },
  worn_jacket: { id: 'worn_jacket', name: 'Worn jacket', kind: 'clothing', stack: 1, color: '#c2553a', shape: 'coat', clothing: { slot: 'body', insulation: 4 } },
};

// Bare hands: not an inventory item. Used by gather/combat when no tool is selected.
export const HANDS = { id: 'hands', name: 'Hands', tool: { class: 'hands', dmg: 4, reach: 1.1, mult: {} } };

export const itemDef = (id) => ITEMS[id] || null;
export const isStackable = (id) => (ITEMS[id]?.stack ?? 1) > 1;
export const maxStack = (id) => ITEMS[id]?.stack ?? 1;
export const hasDurability = (id) => !!ITEMS[id]?.tool?.dur;
