// "Before" numbers: re-applies the ORIGINAL (pre-balance-pass) values in-process, then runs the same profiles, so before/after tables are comparable.
//   node tests/sim/baseline.mjs --profile competent --seeds 10 --days 14
import { TEMPERATURE as T, WEATHER as W } from '../../src/data/balance.js';
import { ITEMS } from '../../src/data/items.js';
import { NODES, STRUCTURES } from '../../src/data/structures.js';
import { RECIPES } from '../../src/data/recipes.js';

T.noonBase = -4; T.perDay = -1.2; T.day1Bonus = 0; W.day1ClearSeconds = 120;
ITEMS.worn_jacket.clothing.insulation = 3;
NODES.rock_node.gather.drops.find((d) => d.item === 'flint').chance = 0.35;
RECIPES.find((r) => r.id === 'arrow').out.n = 4;
RECIPES.splice(RECIPES.findIndex((r) => r.id === 'bandage_hide'), 1);
NODES.iron_node.gather.drops[0].n = [2, 3]; NODES.coal_node.gather.drops[0].n = [2, 4];
STRUCTURES.snare.extra.dawnChance = 0.35; ITEMS.jerky.food.hunger = 25;
const { runOne, summarize } = await import('./run.mjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
for (const pf of String(args.profile || 'competent').split(',')) {
  const rs = []; for (let s = 1; s <= +(args.seeds || 10); s++) rs.push(runOne(pf, s, { days: +(args.days || 14) }));
  console.log('BASELINE (original numbers)'); console.log(summarize(rs));
}
