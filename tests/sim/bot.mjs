// Headless playtest bot for Last Ember. It plays the REAL game: movement through the touch-joystick intent, gathering/combat/interaction via
// the Action button path, crafting via game.crafting.craft, building via the build menu + tap-to-place, item use via itemactions.
// It READS world state freely to decide but never writes it. See bot-core.mjs for the action primitives and nav.mjs for walking.
//
//   const bot = createBot(game, 'competent');   // 'idle' | 'sloppy' | 'competent' | 'rusher'
//   loop: bot.think(); game.step(6);            // decisions at 10 Hz; movement/action intents persist between decisions
//
// The bot is a priority policy: [fight] > [vitals] > [night/dusk routine] > [fire upkeep] > [progression projects]. Each rule returns true when
// it set intents for this decision. Projects are expressed as base-item shopping lists so one generic `fetch` walks the world and gathers.
import { TILE } from '../../src/data/balance.js';
import { STRUCTURES } from '../../src/data/structures.js';
import { ITEMS } from '../../src/data/items.js';
import { RECIPES } from '../../src/data/recipes.js';
import { FIRE } from '../../src/data/balance.js';
import { createBotCore } from './bot-core.mjs';
import { eatSnow } from '../../src/systems/itemactions.js';
import { PROFILES } from './profiles.mjs';
import { createGoals } from './goals.mjs';

export { PROFILES };

export function createBot(game, profileName = 'competent', opts = {}) {
  const prof = { ...PROFILES[profileName], name: profileName, ...(opts.profile || {}) };
  const core = createBotCore(game);
  const bot = {
    core, prof, game, name: profileName, status: 'init', miles: {}, notes: [], counters: core.counters,
    home: null, plan: {}, mem: { warming: false, drinking: false }, lastThinkT: -9,
  };
  const S = () => game.state, P = () => game.state.player;

  // ------------------------------------------------------------ milestones (first time each happens, in play seconds)
  const mark = (id, extra) => { if (bot.miles[id] === undefined) { bot.miles[id] = +S().stats.playSeconds.toFixed(1); if (extra) bot.notes.push(`${id}: ${extra}`); } };
  bot.mark = mark;
  game.events.on('craft:done', ({ recipe }) => {
    const o = recipe.out.item;
    if (o === 'stone_axe') mark('axe'); else if (o === 'stone_pickaxe') mark('pickaxe'); else if (o === 'spear') mark('spear');
    else if (o === 'bow') mark('bow'); else if (o === 'fur_coat') mark('coat'); else if (o === 'iron_ingot') mark('ingot');
    else if (o === 'iron_axe' || o === 'iron_spear' || o === 'iron_pickaxe') mark(o);
    else if (o === 'clean_water') mark('boil');
  });
  game.events.on('fire:lit', ({ type }) => mark(type === 'campfire' ? 'fire' : type === 'furnace' ? 'furnace' : 'torch_post'));
  game.events.on('room:formed', () => mark('shelter'));
  game.events.on('sleep:start', () => mark('sleep'));
  game.events.on('structure:placed', ({ type }) => { mark(`built_${type}`); });
  game.events.on('item:used', ({ id }) => { if (id === 'cooked_meat' || id === 'cooked_fish' || id === 'jerky') mark('meal'); if (id === 'clean_water') mark('drink'); });
  game.events.on('loot:opened', ({ obj }) => { if (obj.type === 'crash_site') mark('crate'); });
  game.events.on('radio:partFound', () => { mark('part1'); bot.parts = (bot.parts || 0) + 1; if (bot.parts >= 3) mark('parts3'); });
  game.events.on('creature:killed', ({ c }) => { if (c.type === 'wolf') mark('wolf_kill'); else if (c.type === 'bear') mark('bear_kill'); else mark('first_hunt'); });
  game.events.on('signal:night', ({ counted }) => { if (counted) mark(`signal_${game.state.endgame?.nights ?? ''}`); });
  game.events.on('radio:transmit', ({ on }) => { if (on) mark('transmit'); });

  bot.stopAll = () => { core.stop(); };

  if (profileName === 'idle') {
    bot.think = () => { bot.status = 'idle'; core.stop(); };
    return bot;
  }

  const goals = createGoals(bot);
  bot.think = () => {
    if (game.mode !== 'playing') return;
    core.refresh && game.tick % 60 === 0 && core.refresh();
    const t = game.state.stats.playSeconds;
    bot.lastThinkT = t;
    if (game.sleep?.active) { bot.status = 'sleep'; core.stop(); goals.sleepWatch(); return; }
    for (const rule of goals.rules) {
      let r;
      try { r = rule(); } catch (e) { bot.errors = (bot.errors || 0) + 1; bot.lastError = e; if (bot.errors < 4) console.error('bot error', rule.name, e.stack); r = false; }
      if (r) { bot.status = rule.name; return; }
    }
    bot.status = 'idle'; core.stop();
  };
  bot.goals = goals;
  return bot;
}
