// Crafting recipes. Add a recipe = append one entry.
//   id       unique key
//   out      { item, n }
//   in       [{ item, n }]  consumed
//   station  'hand' (anywhere) | 'workbench' (within 2 tiles) | 'campfire' (lit) | 'furnace' (lit)
//   tools    [itemId]  must be in inventory, NOT consumed (e.g. tin_pot)
//   Alternative ingredient sets are separate recipes sharing `out.item` (e.g. torch_fat / torch_coal).
const r = (id, item, n, ins, station = 'hand', tools = []) => ({
  id, out: { item, n }, in: ins.map(([i, c]) => ({ item: i, n: c })), station, tools,
});

export const RECIPES = [
  // hand
  r('rope', 'rope', 1, [['fiber', 3]]),
  r('stone_axe', 'stone_axe', 1, [['stick', 2], ['stone', 2], ['fiber', 1]]),
  r('stone_pickaxe', 'stone_pickaxe', 1, [['stick', 2], ['stone', 3], ['fiber', 1]]),
  r('spear', 'spear', 1, [['stick', 2], ['flint', 1], ['fiber', 1]]),
  r('torch_fat', 'torch', 1, [['stick', 1], ['fat', 1]]),
  r('torch_coal', 'torch', 1, [['fiber', 1], ['coal', 1]]),
  r('bandage_cloth', 'bandage', 1, [['cloth', 1]]),
  r('bandage_herb', 'bandage', 1, [['fiber', 2], ['herb', 1]]),
  r('bandage_hide', 'bandage', 1, [['hide', 1], ['fiber', 1]]),     // balance: bleeding is lethal, cloth/herbs are rare

  // workbench
  r('bow', 'bow', 1, [['stick', 3], ['rope', 2]], 'workbench'),
  r('arrow', 'arrow', 4, [['stick', 1], ['flint', 1]], 'workbench'),
  r('fur_hat', 'fur_hat', 1, [['hide', 2], ['rope', 1]], 'workbench'),
  r('fur_coat', 'fur_coat', 1, [['hide', 5], ['rope', 2]], 'workbench'),
  r('fur_boots', 'fur_boots', 1, [['hide', 3], ['rope', 1]], 'workbench'),
  r('iron_axe', 'iron_axe', 1, [['iron_ingot', 2], ['stick', 2], ['rope', 1]], 'workbench'),
  r('iron_pickaxe', 'iron_pickaxe', 1, [['iron_ingot', 3], ['stick', 2], ['rope', 1]], 'workbench'),
  r('iron_spear', 'iron_spear', 1, [['iron_ingot', 2], ['stick', 2], ['rope', 1]], 'workbench'),
  // campfire (lit; instant)
  r('cooked_meat', 'cooked_meat', 1, [['raw_meat', 1]], 'campfire'),
  r('cooked_fish', 'cooked_fish', 1, [['raw_fish', 1]], 'campfire'),
  r('snow_water', 'snow_water', 1, [], 'campfire', ['tin_pot']),            // "gather snow" is free
  r('clean_water', 'clean_water', 1, [['snow_water', 1]], 'campfire', ['tin_pot']),
  r('herbal_tea', 'herbal_tea', 1, [['clean_water', 1], ['herb', 1]], 'campfire', ['tin_pot']),
  // furnace (lit)
  r('iron_ingot', 'iron_ingot', 1, [['iron_ore', 2], ['coal', 1]], 'furnace'),
];

export const recipesFor = (station) => RECIPES.filter((x) => x.station === station);
export const recipeById = (id) => RECIPES.find((x) => x.id === id) || null;
