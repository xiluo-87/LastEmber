// Pure crafting logic (DESIGN §7). DOM-free.
//
//   craftStatus(recipe, inv, stations) -> { ok, reason, missing:[{item,have,need}], missingTool:[itemId], missingStation:'workbench'|null, noRoom }
//   canCraft(recipe, inv, stations)    -> boolean
//   craft(recipe, inv, stations)       -> { ok, reason?, produced?:{item,n}, leftover? }   (mutates inv only on success)
//   groupRecipes(inv, stations, recipes?) -> [{ station, label, recipes:[{recipe,status}] }]  craftable first, groups in STATION_ORDER
//
// `stations`: iterable of station ids the player is currently near ('workbench','campfire','furnace'); 'hand' is always available.
// Alternate ingredient sets (torch: fat OR fiber+coal) are separate recipes sharing out.item. Recipe `tools` are required
// in the inventory but NOT consumed (tin_pot).
import { RECIPES } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { add, canAdd, count, hasAll, removeAll, has } from './inventory.js';

export const STATION_ORDER = ['hand', 'workbench', 'campfire', 'furnace'];
export const STATION_LABEL = { hand: 'By hand', workbench: 'Workbench', campfire: 'Campfire (lit)', furnace: 'Furnace (lit)' };

const asSet = (s) => (s instanceof Set ? s : new Set(s || []));
const clone = (inv) => JSON.parse(JSON.stringify(inv));

export function craftStatus(recipe, inv, stations) {
  const st = asSet(stations);
  const missing = [];
  for (const x of recipe.in) {
    const have = count(inv, x.item);
    if (have < x.n) missing.push({ item: x.item, have, need: x.n });
  }
  const missingTool = (recipe.tools || []).filter((t) => !has(inv, t));
  const missingStation = recipe.station && recipe.station !== 'hand' && !st.has(recipe.station) ? recipe.station : null;
  let noRoom = false;
  if (!missing.length && !missingTool.length) {
    const sim = clone(inv); removeAll(sim, recipe.in);
    noRoom = !canAdd(sim, recipe.out.item, recipe.out.n);
  }
  const ok = !missing.length && !missingTool.length && !missingStation && !noRoom;
  const reason = ok ? null : missingStation ? `Needs ${STATION_LABEL[missingStation] || missingStation}`
    : missingTool.length ? `Needs ${ITEMS[missingTool[0]]?.name || missingTool[0]}`
    : missing.length ? `Need ${missing[0].need - missing[0].have} more ${ITEMS[missing[0].item]?.name?.toLowerCase() || missing[0].item}`
    : 'Bag full';
  return { ok, reason, missing, missingTool, missingStation, noRoom };
}
export const canCraft = (recipe, inv, stations) => craftStatus(recipe, inv, stations).ok;

export function craft(recipe, inv, stations) {
  const s = craftStatus(recipe, inv, stations);
  if (!s.ok) return { ok: false, reason: s.reason };
  removeAll(inv, recipe.in);
  const leftover = add(inv, recipe.out.item, recipe.out.n);
  return { ok: true, produced: { item: recipe.out.item, n: recipe.out.n - leftover }, leftover };
}

export function groupRecipes(inv, stations, recipes = RECIPES) {
  const groups = new Map(STATION_ORDER.map((s) => [s, []]));
  for (const recipe of recipes) {
    const key = groups.has(recipe.station) ? recipe.station : 'hand';
    groups.get(key).push({ recipe, status: craftStatus(recipe, inv, stations) });
  }
  const rank = (e) => (e.status.ok ? 0 : e.status.missingStation ? 3 : e.status.missing.length || e.status.missingTool.length ? 2 : 1);
  return STATION_ORDER.map((station) => ({
    station, label: STATION_LABEL[station],
    recipes: groups.get(station).map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e),
  })).filter((g) => g.recipes.length);
}

/** Display name for a recipe; alternates share an output so disambiguate by key ingredient. */
export function recipeLabel(recipe, all = RECIPES) {
  const name = ITEMS[recipe.out.item]?.name || recipe.out.item;
  const n = recipe.out.n > 1 ? ` x${recipe.out.n}` : '';
  const alts = all.filter((r) => r.out.item === recipe.out.item);
  const key = recipe.in[recipe.in.length - 1]; // alternates differ in their last ingredient (torch: fat | coal, bandage: cloth | herb)
  if (alts.length > 1 && key) return `${name}${n} (${(ITEMS[key.item]?.name || key.item).toLowerCase()})`;
  return `${name}${n}`;
}
