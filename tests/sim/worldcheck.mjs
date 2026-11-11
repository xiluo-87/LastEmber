// World-gen coverage check: counts of key resources within R tiles of spawn for many seeds. node tests/sim/worldcheck.mjs [seeds=40] [R=15]
import { generateWorld } from '../../src/world/gen.js';
import { createWorld } from '../../src/world/world.js';
export function census(seed, R = 15) {
  const data = generateWorld(seed), w = createWorld(data), sp = data.spawn, c = {};
  w.forEachObject((o) => { if (Math.hypot(o.tx - sp.tx, o.ty - sp.ty) <= R) c[o.type] = (c[o.type] || 0) + 1; });
  return c;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = +(process.argv[2] || 40), R = +(process.argv[3] || 15), keys = ['tree', 'dead_bush', 'rock_node', 'berry_bush', 'loose_stone', 'loose_stick', 'herb'];
  const rows = []; for (let s = 1; s <= n; s++) rows.push([s, census(s, R)]);
  console.log(`within ${R} tiles of spawn, ${n} seeds: min / median / max`);
  for (const k of keys) { const v = rows.map(([, c]) => c[k] || 0).sort((a, b) => a - b); console.log(k.padEnd(12), v[0], v[n >> 1], v[n - 1], ' seeds below 3:', rows.filter(([, c]) => (c[k] || 0) < 3).map(([s]) => s).join(',')); }
}
