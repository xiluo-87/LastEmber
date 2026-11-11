// Quick bot readiness probe: N seeds, state at the START of a given day (default 8) + outcome. node tests/sim/evalbot.mjs [seeds=10] [day=8] [profile=competent] [--set k=v]
import { createGame } from '../../src/game.js';
import { createBot } from './bot.mjs';
import { memStorage } from './run.mjs';
const N = +(process.argv[2] || 10), DAY = +(process.argv[3] || 8), PF = process.argv[4] || 'competent';
const setArg = process.argv.indexOf('--set'); const over = setArg > 0 ? Object.fromEntries(process.argv[setArg + 1].split(',').map((kv) => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number.isNaN(+v) ? v : +v]; })) : {};
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : '-'; };
const rows = [];
for (let seed = 1; seed <= N; seed++) {
  const g = createGame({ storage: memStorage() }); g.newGame(seed);
  const b = createBot(g, PF, { profile: over });
  const cnt = (t) => { let n = 0; for (const _ of g.building.list(t)) n++; return n; };
  let snap = null, over2 = null; g.events.on('game:over', (e) => { over2 = e; });
  let ld = 1;
  while (g.mode === 'playing' && g.state.time.day <= DAY) {
    b.think(); g.step(6);
    if (g.state.time.day !== ld) { ld = g.state.time.day; g.save(); g.loadGame(); b.core.nav.reset?.(); if (ld === DAY) snap = { stone: cnt('stone_wall'), wood: cnt('wood_wall'), spikes: cnt('spike_barricade'), parts: b.parts || 0, ingot: b.core.count('iron_ingot') + (b.core.has('iron_spear') ? 2 : 0), coat: g.state.inventory.clothing.some((c) => c && c.id === 'fur_coat') ? 1 : 0, hp: Math.round(g.state.player.health), bow: b.core.hasTool('bow') ? 1 : 0, furnace: cnt('furnace') }; }
  }
  rows.push({ seed, snap, dead: over2 && over2.causeId, day: g.state.time.day });
}
console.log(`day ${DAY} snapshot (median): ` + ['stone', 'wood', 'spikes', 'parts', 'ingot', 'coat', 'furnace', 'hp'].map((k) => `${k} ${med(rows.filter((r) => r.snap).map((r) => r.snap[k]))}`).join(' | '), `| alive at day ${DAY}: ${rows.filter((r) => r.snap).length}/${N}`);
console.log(rows.map((r) => `${r.seed}:${r.dead || 'ok'}${r.snap ? '' : '(d' + r.day + ')'}`).join(' '));
