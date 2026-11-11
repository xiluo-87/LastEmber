// Day counter, clock, phases, ambient temperature. state.time (owned here):
//   { day, t (seconds since sunrise, 0..480), speed (time multiplier, 1 normal; sleep sets 12), phase, light (0..1), ambient (degC), clock:'HH:MM' }
// Events: 'time:phase' {phase, prev, day}, 'time:newDay' {day} (fires at sunrise), 'time:dawn'|'time:dusk'|'time:night' {day}
import { TIME } from '../data/balance.js';
import { phaseAt, clockString, ambientTemperature } from '../logic/clock.js';

function derive(t) {
  const p = phaseAt(t.day, t.t);
  t.phase = p.phase; t.light = p.light; t.phaseT = p.phaseT; t.phaseLen = p.phaseLen;
  t.clock = clockString(t.t);
  t.ambient = ambientTemperature(t.day, t.light, t.t);
}

export default {
  name: 'time',
  defaults: () => ({ day: 1, t: TIME.startT, speed: 1, phase: 'day', light: 1, ambient: 0, clock: '06:00', phaseT: 0, phaseLen: 1 }),
  init() {},
  onLoad(game) { derive(game.state.time); },
  update(game, dt) {
    const t = game.state.time, prev = t.phase;
    t.t += dt * t.speed;
    game.state.stats.playSeconds += dt;
    while (t.t >= TIME.dayLength) {
      t.t -= TIME.dayLength; t.day++;
      game.state.stats.daysSurvived = t.day;
      game.events.emit('time:newDay', { day: t.day });
    }
    derive(t);
    if (t.phase !== prev) {
      game.events.emit('time:phase', { phase: t.phase, prev, day: t.day });
      game.events.emit(`time:${t.phase}`, { day: t.day });
    }
  },
};
