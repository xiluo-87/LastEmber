// Playtest runner: N seeds x profile at max speed. Prints survival, cause of death, milestone timeline and per-stat summaries.
//   node tests/sim/run.mjs [--profile competent,sloppy,idle] [--seeds 10] [--first 1] [--days 8] [--json out.json] [--quiet]
// Every sim-day the run is saved -> loaded (JSON round trip through the real save module) and continues; divergence is reported.
import { createGame } from '../../src/game.js';
import { createBot } from './bot.mjs';
import * as saves from '../../src/save.js';
import { TIME } from '../../src/data/balance.js';
import { add as addItem } from '../../src/logic/inventory.js';
const scenarioDay = () => 8;

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const STATS = ['health', 'hunger', 'thirst', 'warmth', 'stamina'];

export function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

/** Late-game scenario kit: a player who already did the mid-game (harness shortcut for testing the endgame; NOT used by the profile runs). */
export const LATE_KIT = [['stone_axe', 1], ['stone_pickaxe', 1], ['spear', 1], ['bow', 1], ['fur_coat', 1], ['fur_boots', 1], ['fur_hat', 1], ['arrow', 12], ['wood', 20], ['stone', 20], ['stick', 20],
  ['rope', 6], ['iron_ingot', 8], ['radio_antenna', 1], ['radio_battery', 1], ['radio_circuit', 1], ['cooked_meat', 12], ['flint', 2], ['fiber', 6]];

/** HARNESS ASSIST (clearly not gameplay): at the start of day `giveDay` put the iron/parts the tower needs into the bag, so the bot's own endgame play
 *  (tower near the fire, transmit, hold 3 signal nights) can be measured without the iron logistics the bot is still bad at. */
export const GIVE_KIT = [['iron_ingot', 10], ['rope', 3], ['wood', 12]];
const giveKit = (game) => {
  const inv0 = game.state.inventory;
  for (const [id, n] of GIVE_KIT) { const have = inv0.bag.concat(inv0.hotbar).reduce((a, x) => a + (x && x.id === id ? x.n : 0), 0); if (have < n) addItem(inv0, id, n - have); }
  for (const id of ['radio_antenna', 'radio_battery', 'radio_circuit']) { const have = inv0.bag.concat(inv0.hotbar).some((x) => x && x.id === id); if (!have) addItem(inv0, id, 1); }
};
export function runOne(profile, seed, { days = 8, saveEvery = true, maxSeconds = null, overrides = null, scenario = null, giveDay = 0 } = {}) {
  const game = createGame({ storage: memStorage() });
  game.newGame(seed);
  if (scenario === 'late') {
    const inv = game.state.inventory;
    for (const [id, n] of LATE_KIT) addItem(inv, id, n);
    for (const id of ['fur_coat', 'fur_boots', 'fur_hat']) { const i = inv.hotbar.concat(inv.bag).findIndex((x) => x && x.id === id); void i; }
    Object.assign(game.state.time, { day: scenarioDay(scenario), t: TIME.startT });
  }
  const bot = createBot(game, profile, { profile: overrides || {} });
  let over = null;
  game.events.on('game:over', (e) => { over = e; });
  const perDay = {}, below = { health: 0, hunger: 0, thirst: 0, warmth: 0, stamina: 0 };
  const startDay = game.state.time.day, limit = maxSeconds ?? days * TIME.dayLength + (startDay - 1) * TIME.dayLength;
  const gameSecs = (st) => (st.time.day - 1) * TIME.dayLength + st.time.t - TIME.startT;   // game time (sleep runs x12)
  let tick = 0, lastDay = 1, roundTrips = 0, diverged = 0;
  const t0 = Date.now();
  while (!over && gameSecs(game.state) < limit) {
    bot.think();
    game.step(6); tick += 6;
    const st = game.state, p = st.player, d = st.time.day;
    const row = perDay[d] || (perDay[d] = { n: 0, min: {}, sum: {} });
    row.n++;
    for (const k of STATS) { const v = p[k]; row.min[k] = Math.min(row.min[k] ?? 100, v); row.sum[k] = (row.sum[k] || 0) + v; if (v < 25) below[k] += 0.1 * (st.time.speed || 1); if (!Number.isFinite(v)) bot.nan = k; }
    if (d !== lastDay) {
      lastDay = d;
      if (giveDay && d === giveDay) giveKit(game);
      if (saveEvery && !over) {            // save -> load round trip, then keep playing from the loaded state
        const before = JSON.stringify(game.state.player), pos = { ...game.state.player };
        game.save();
        const ok = game.loadGame();
        if (!ok) { diverged++; bot.notes.push(`load failed day ${d}`); } else {
          roundTrips++;
          if (Math.abs(game.state.player.x - pos.x) > 1e-6 || game.state.player.health !== pos.health) { diverged++; bot.notes.push(`divergence day ${d}`); }
          bot.core.nav.reset?.();
        }
        void before;
      }
    }
  }
  const st = game.state, secs = gameSecs(st);
  return {
    profile, seed, died: !!over && over.kind === 'death', won: !!over && over.kind === 'victory', cause: over?.causeId || over?.cause || (over ? over.kind : 'alive'),
    secs, day: st.time.day, miles: bot.miles, perDay, below, roundTrips, diverged, wall: (Date.now() - t0) / 1000, notes: bot.notes, nan: bot.nan, errors: bot.errors || 0,
    status: bot.status, inv: Object.fromEntries(['wood', 'stick', 'stone', 'fiber', 'hide', 'raw_meat', 'cooked_meat'].map((i) => [i, bot.core.count(i)])),
  };
}

const f = (v, d = 0) => (v === undefined || v === null ? '-' : (+v).toFixed(d));
export function summarize(rs) {
  const out = [];
  const profile = rs[0].profile;
  const surv = rs.map((r) => r.secs).sort((a, b) => a - b);
  const med = surv[Math.floor(surv.length / 2)];
  const died = rs.filter((r) => r.died).length, won = rs.filter((r) => r.won).length;
  const dayOf = (s) => 1 + Math.floor((s + TIME.startT) / TIME.dayLength);
  const causes = {};
  for (const r of rs) causes[r.cause] = (causes[r.cause] || 0) + 1;
  const reach = (n) => rs.filter((r) => r.day >= n || r.won).length;
  out.push(`== ${profile}: ${rs.length} seeds | died ${died} won ${won} | median survival ${f(med)}s (day ${dayOf(med)}) min ${f(surv[0])}s | >=day3 ${reach(3)} >=day6 ${reach(6)} >=day9 ${reach(9)} | causes ${JSON.stringify(causes)}`);
  const ms = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.miles)) (ms[k] ||= []).push(v);
  const keys = Object.keys(ms).sort((a, b) => median(ms[a]) - median(ms[b]));
  out.push('   milestones (median s [reached/N]): ' + keys.map((k) => `${k} ${f(median(ms[k]))} [${ms[k].length}]`).join(' | '));
  // per-stat across all seeds: overall min, mean, seconds below 25
  const agg = {};
  for (const k of STATS) {
    let mn = 100, sum = 0, n = 0, bl = 0;
    for (const r of rs) { for (const row of Object.values(r.perDay)) { mn = Math.min(mn, row.min[k]); sum += row.sum[k]; n += row.n; } bl += r.below[k]; }
    agg[k] = `${k} min ${f(mn)} avg ${f(sum / Math.max(1, n))} <25: ${f(bl / rs.length)}s/run`;
  }
  out.push('   ' + Object.values(agg).join(' | '));
  const flags = rs.filter((r) => r.nan || r.diverged || r.errors);
  if (flags.length) out.push(`   !! NaN/diverged/bot-errors: ${flags.map((r) => `seed ${r.seed}(nan:${r.nan || 0} div:${r.diverged} err:${r.errors})`).join(', ')}`);
  return out.join('\n');
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const profiles = String(args.profile || 'competent').split(',');
  const n = +(args.seeds || 10), first = +(args.first || 1), days = +(args.days || 8);
  const all = {};
  for (const pf of profiles) {
    const overrides = args.set ? Object.fromEntries(String(args.set).split(',').map((kv) => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number.isNaN(+v) ? v : +v]; })) : null;
    const rs = [];
    for (let s = first; s < first + n; s++) {
      const r = runOne(pf, s, { days, overrides, scenario: args.scenario || null, giveDay: +(args.give || 0) });
      rs.push(r);
      if (!args.quiet) console.log(`  ${pf} seed ${s}: ${r.won ? 'WON' : r.died ? 'died' : 'alive'} t=${f(r.secs)}s day ${r.day} ${r.cause} | fire ${f(r.miles.fire)} axe ${f(r.miles.axe)} shelter ${f(r.miles.shelter)} meal ${f(r.miles.meal)} | wall ${f(r.wall, 1)}s${r.errors ? ' ERR' + r.errors : ''}${r.status ? ' last:' + r.status : ''}`);
    }
    all[pf] = rs;
    console.log(summarize(rs));
  }
  if (args.json) (await import('node:fs')).writeFileSync(args.json, JSON.stringify(all));
}
