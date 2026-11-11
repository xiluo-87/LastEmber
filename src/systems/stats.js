// Run-stats tracker (state.runstats): listens to events, integrates walked distance. Shown on the death and victory screens.
// Pure helpers in logic/stats.js. `game.stats.rows()` -> [[label, value]...]
import { TILE } from '../data/balance.js';
import { defaultRunStats, addDistance, applyStatEvent, statRows } from '../logic/stats.js';

const EVENTS = ['creature:killed', 'structure:placed', 'craft:done', 'radio:partFound'];

export default {
  name: 'stats',
  stateKey: 'runstats',
  defaults: defaultRunStats,
  init(game) {
    for (const e of EVENTS) game.events.on(e, (p) => { if (game.state?.runstats && game.mode === 'playing') applyStatEvent(game.state.runstats, e, p); });
    game.statsLast = { x: null, y: null };
    game.stats = { rows: () => statRows(game.state) };
  },
  onLoad(game) { game.statsLast.x = null; game.statsLast.y = null; },
  update(game) {
    const st = game.state, rs = st.runstats;
    if (!rs || game.mode !== 'playing') return;
    addDistance(rs, game.statsLast, st.player.x, st.player.y, TILE);
  },
};
