// Crafting system: station detection seam + `game.crafting` API used by the Craft UI. Pure rules: logic/crafting.js.
//
// STATION SEAM (building engineer, read this):
//   game.stationProviders: Array<(game) => string[]>   push a function returning the station ids that are NEAR the player right now:
//     'workbench' (within 2 tiles of a workbench), 'campfire' (within reach of a LIT campfire), 'furnace' (a LIT furnace).
//   game.stationQuery() -> string[]    union of every provider's ids, always including 'hand'.
//   game.crafting = { stations(), status(recipe), craft(recipeId) -> {ok,reason?,produced?}, recipes }
// Default: no providers except the debug one. Debug/tests: game.fakeStations is a Set of station ids that are reported as nearby
//   (e.g. game.fakeStations.add('workbench')); with ?debug=1 the V key toggles workbench+campfire+furnace.
// Events: 'craft:done' { recipe, produced }
import { RECIPES, recipeById } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { craft, craftStatus } from '../logic/crafting.js';

export default {
  name: 'crafting',
  init(game) {
    game.fakeStations = new Set();
    game.stationProviders = [() => [...game.fakeStations]];
    game.stationQuery = () => {
      const out = new Set(['hand']);
      for (const fn of game.stationProviders) for (const id of fn(game) || []) out.add(id);
      return [...out];
    };
    game.crafting = {
      recipes: RECIPES,
      stations: () => game.stationQuery(),
      status: (recipe) => craftStatus(recipe, game.state.inventory, game.stationQuery()),
      craft(id) {
        const recipe = typeof id === 'string' ? recipeById(id) : id;
        if (!recipe) return { ok: false, reason: 'Unknown recipe' };
        const res = craft(recipe, game.state.inventory, game.stationQuery());
        if (!res.ok) { game.ui.toast?.(res.reason, 'bad'); return res; }
        game.ui.toast?.(`Crafted ${ITEMS[recipe.out.item].name}${recipe.out.n > 1 ? ` x${recipe.out.n}` : ''}`, 'good');
        game.events.emit('craft:done', { recipe, produced: res.produced });
        return res;
      },
    };
    if (game.params.debug === '1' && typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.code !== 'KeyV' || e.ctrlKey || e.metaKey || e.altKey || game.mode !== 'playing') return;
        const on = game.fakeStations.size === 0;
        game.fakeStations.clear();
        if (on) for (const s of ['workbench', 'campfire', 'furnace']) game.fakeStations.add(s);
        game.ui.toast?.(on ? 'Debug: all stations nearby' : 'Debug: stations off', 'info');
      });
    }
  },
  onLoad(game) { if (game.debug) game.debug.fakeStations = (list = ['workbench', 'campfire', 'furnace']) => { game.fakeStations.clear(); for (const s of list) game.fakeStations.add(s); }; },
  update() {},
};
