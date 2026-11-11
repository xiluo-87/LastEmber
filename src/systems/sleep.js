// Sleeping (DESIGN §5). Bedroll interaction -> preconditions with clear refusals, time x12, 'sleeping' effect (hunger/thirst x0.5),
// stamina/health restore, modal "Sleeping…" overlay with a Wake button. Interrupted by damage, felt temp < 0, hostile near, dawn.
// Because survival integrates in real seconds, the extra (x12 - 1) game seconds of hunger/thirst/warmth are applied here so a
// night's sleep costs what a night costs.
import { TIME, SURVIVAL, BUILDING } from '../data/balance.js';
import { applyEffect, clearEffect, restoreStat } from './vitals.js';
import { warmthRate } from '../logic/temperature.js';

export default {
  name: 'sleep',
  init(game) {
    const Z = game.sleep = {
      active: false, since: 0,
      /** Why you cannot sleep right now -> string | null */
      refusal() {
        const st = game.state, p = st.player;
        if (st.time.phase !== 'night') return st.time.phase === 'dusk' ? 'Not dark enough yet. Wait for night.' : 'You can only sleep at night.';
        if ((st.survival?.felt ?? 99) < SURVIVAL.sleep.minFeltTemp) return `Too cold to sleep (need ${SURVIVAL.sleep.minFeltTemp}°C). Light a fire or build walls.`;
        if (game.creatures?.hasHostileNear?.(game, p.x, p.y, SURVIVAL.sleep.hostileRadius)) return 'Something is nearby. You cannot sleep.';
        return null;
      },
      start(obj) {
        if (Z.active) return false;
        const why = Z.refusal();
        if (why) { game.ui.toast?.(why, 'bad', 3000); return false; }
        const c = game.world.tileCenter(obj.tx, obj.ty), p = game.state.player;
        p.x = c.x; p.y = c.y; p.vx = p.vy = 0;
        Z.active = true; Z.since = game.time;
        game.state.time.speed = TIME.sleepScale;
        applyEffect(game, 'sleeping');
        game.ui.panels.open('sleep');
        game.events.emit('sleep:start', {});
        return true;
      },
      wake(reason = 'manual') {
        if (!Z.active) return false;
        Z.active = false;
        game.state.time.speed = 1;
        clearEffect(game, 'sleeping');
        game.ui.panels.close('sleep');
        const msg = { dawn: 'You wake with the dawn.', cold: 'You wake up freezing!', hostile: 'Something woke you!', damage: 'You are jolted awake!', manual: null }[reason];
        if (msg) game.ui.toast?.(msg, reason === 'dawn' ? 'good' : 'bad', 3000);
        game.events.emit('sleep:end', { reason });
        return true;
      },
    };
    game.interactions.register('bedroll', { label: () => 'Sleep', cooldown: 0.5, onAction: (g, t) => (Z.start(t.obj) ? undefined : false) });
    game.events.on('player:damaged', () => Z.wake('damage'));
    game.events.on('game:over', () => Z.wake('manual'));
  },
  onLoad(game) { const Z = game.sleep; Z.active = false; game.state.time.speed = 1; clearEffect(game, 'sleeping'); },
  update(game, dt) {
    const Z = game.sleep;
    if (!Z.active) return;
    const st = game.state, p = st.player, sv = st.survival, S = SURVIVAL;
    if (st.time.phase !== 'night') return void Z.wake('dawn');
    if ((sv?.felt ?? 99) < BUILDING.sleep.wakeFeltBelow) return void Z.wake('cold');
    if (game.creatures?.hasHostileNear?.(game, p.x, p.y, S.sleep.hostileRadius)) return void Z.wake('hostile');
    const extra = dt * (st.time.speed - 1);                     // the game seconds survival did not integrate
    restoreStat(game, 'stamina', BUILDING.sleep.staminaPerSec * dt);
    restoreStat(game, 'hunger', -(S.hungerPerMin / 60) * S.sleep.hungerThirstMult * extra);
    restoreStat(game, 'thirst', -(S.thirstPerMin / 60) * S.sleep.hungerThirstMult * extra);
    if (sv) restoreStat(game, 'warmth', warmthRate(sv.felt) * extra);
    if (p.hunger > 0 && p.thirst > 0 && p.warmth > 0) restoreStat(game, 'health', BUILDING.sleep.healthPerGameSec * extra);
  },
};
