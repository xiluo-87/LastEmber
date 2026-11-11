// Flavour text + stat lines for the item detail card (Bag panel). Keyed by item id; missing ids fall back to a generic line.
import { ITEMS } from './items.js';

export const DESCRIPTIONS = {
  wood: 'Heavy pine logs. Walls, workbenches and long-burning fuel.',
  stick: 'Light and dry. Fuel, tool handles, arrow shafts.',
  stone: 'Hard grey stone for tools and walls.',
  flint: 'Sharp black flint. Strikes sparks and makes spearheads.',
  fiber: 'Tough plant fibre. Twist it into rope or bind a tool.',
  rope: 'Twisted fibre rope. Binds iron tools, bows and doors.',
  hide: 'A raw animal pelt. Warm clothing starts here.',
  bone: 'Pale and sturdy.',
  fat: 'Rendered animal fat. Burns slow and bright.',
  iron_ore: 'Rusty rock streaked with iron. Needs a furnace.',
  iron_ingot: 'Smelted iron bar for the best tools and the radio tower.',
  coal: 'Black fuel that burns for a long time.',
  herb: 'A bitter winter herb. Good in tea and bandages.',
  cloth: 'Clean cloth from the wreck. Makes a bandage.',
  radio_antenna: 'Radio part 1 of 3. Needed for the tower.',
  radio_battery: 'Radio part 2 of 3. Needed for the tower.',
  radio_circuit: 'Radio part 3 of 3. Needed for the tower.',
  flight_map: 'Your flight plan. Rough directions to the wreckage.',
  berries: 'Frost-sweet berries. A light snack.',
  raw_meat: 'Raw and risky. Cook it first.',
  cooked_meat: 'Hot, filling and safe.',
  jerky: 'Dried meat. Keeps well, fills you up.',
  raw_fish: 'Fresh from the ice. Cook it to be safe.',
  cooked_fish: 'Flaky and warm.',
  snow_water: 'Melted snow. Could make you sick. Boil it.',
  clean_water: 'Boiled and safe to drink.',
  herbal_tea: 'Warming tea. Settles a bad stomach.',
  tin_pot: 'Needed to melt snow and boil water at a fire.',
  bandage: 'Stops bleeding and patches you up.',
  stone_axe: 'Chops trees three times as fast as bare hands.',
  stone_pickaxe: 'Breaks rock, ore and coal.',
  spear: 'Long reach. Keeps wolves at arm’s length.',
  bow: 'Ranged weapon. Needs arrows.',
  arrow: 'Ammunition for the bow.',
  torch: 'Light and warmth while held. Burns out in three minutes. Wolves hate it.',
  iron_axe: 'Fells trees twice as fast as stone.',
  iron_pickaxe: 'A tough pick for the deep veins.',
  iron_spear: 'Heavy hitting spear with long reach.',
  fur_hat: 'Fur hat. Keeps your head warm.',
  fur_coat: 'Thick fur coat. The best insulation you can make.',
  fur_boots: 'Warm fur-lined boots.',
  worn_jacket: 'Your old flight jacket. Better than nothing.',
};

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
const STAT = { hunger: 'Hunger', thirst: 'Thirst', warmth: 'Warmth', health: 'Health' };

/** Short stat chips for an item definition: ['Damage 10', 'Reach 1.1', 'Warmth +9°C', ...]. */
export function describeStats(def) {
  const out = [];
  if (!def) return out;
  const t = def.tool;
  if (t && t.class !== 'hands') {
    if (t.dmg) out.push(`Damage ${t.dmg}`);
    if (t.reach && t.class !== 'bow') out.push(`Reach ${t.reach}`);
    if (t.class === 'bow') out.push(`Range ${t.range}`);
    const best = Object.values(t.mult || {})[0];
    if (best) out.push(`x${best} vs ${t.class === 'axe' ? 'trees' : 'rock'}`);
    if (t.light) out.push(`Light ${t.light}`);
    if (t.heat) out.push(`Heat +${t.heat}°C`);
    if (t.burn) out.push(`Burns ${t.burn}s`);
  }
  if (def.clothing) out.push(`Warmth ${sign(def.clothing.insulation)}°C`, `Slot: ${def.clothing.slot}`);
  if (def.food) {
    for (const k of Object.keys(STAT)) if (def.food[k]) out.push(`${STAT[k]} ${sign(def.food[k])}`);
    if (def.food.poison) out.push(`${Math.round(def.food.poison * 100)}% sickness`);
    if (def.food.cures) out.push(`Cures ${def.food.cures === 'poison' ? 'sickness' : def.food.cures}`);
  }
  if (def.fuel) out.push(`Fuel ${def.fuel}s`);
  if (def.unique) out.push('Unique');
  return out;
}
export const describe = (id) => DESCRIPTIONS[id] || ITEMS[id]?.name || id;
