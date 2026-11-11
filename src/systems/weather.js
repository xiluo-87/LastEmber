// Weather state machine (DESIGN §4): clear / snow / blizzard. Deterministic: the weather of a day is a pure function of
// (seed, day, t) via logic/weather.js, so saves/loads and tests agree. Debug/tests can override with game.weather.force().
//
// state.weather = { type, offset (degC, eased), snow, bliz (0..1 intensities, eased), remaining (s of current episode),
//                   warnIn (s until a blizzard when inside the warning window, else 0), planDay, plan:[{type,start,end}], forced }
// Public API (also on `game.weather`):
//   weather.type() -> 'clear'|'snow'|'blizzard'      weather.isBlizzard()      weather.offset() -> degC
//   weather.fuelMult(sheltered) -> 2 for an UNSHELTERED fire during a blizzard, else 1   (campfire/furnace burn-rate multiplier)
//   weather.visibilityTiles() -> 4 in a blizzard (eased), else Infinity      weather.force(type|null, seconds)  (debug/tests)
// Events: 'weather:changed' {type, prev}, 'weather:warning' {in}. UI: banner "Storm coming" for the 30 s before a blizzard.
import { WEATHER, TEMPERATURE } from '../data/balance.js';
import { planDay, weatherAt } from '../logic/weather.js';
import { createParticles } from '../render/particles.js';
import { drawFog } from '../render/screenfx.js';

const targetOffset = (type) => (type === 'blizzard' ? TEMPERATURE.blizzard : type === 'snow' ? TEMPERATURE.snow : 0);
const ease = (cur, target, dt, span = 1) => { const k = (dt / WEATHER.fadeSeconds) * span; return Math.abs(target - cur) <= k ? target : cur + Math.sign(target - cur) * k; };

let particles = null, lastBanner = null, lastDraw = 0;

function evaluate(game) {
  const w = game.state.weather, t = game.state.time;
  if (w.planDay !== t.day) { w.planDay = t.day; w.plan = planDay(game.state.seed, t.day); }
  if (w.forced) return { type: w.forced.type, remaining: w.forced.left, warnIn: 0 };
  return weatherAt(w.plan, t.t);
}

function setBanner(game, text) {
  if (text === lastBanner) return;
  lastBanner = text; game.ui.setBanner?.(text);
}

function snap(game) {
  const w = game.state.weather;
  w.planDay = -1;
  const r = evaluate(game);
  w.type = r.type; w.remaining = r.remaining; w.warnIn = r.warnIn;
  w.offset = targetOffset(r.type); w.snow = r.type === 'clear' ? 0 : 1; w.bliz = r.type === 'blizzard' ? 1 : 0;
  lastBanner = null; setBanner(game, null);
}

export default {
  name: 'weather',
  defaults: () => ({ type: 'clear', offset: 0, snow: 0, bliz: 0, remaining: 0, warnIn: 0, planDay: -1, plan: [], forced: null }),
  init(game) {
    game.weather = {
      type: () => game.state.weather.type,
      isBlizzard: () => game.state.weather.type === 'blizzard',
      offset: () => game.state.weather.offset,
      fuelMult: (sheltered) => (game.state.weather.type === 'blizzard' && !sheltered ? WEATHER.blizzard.shelterlessFuelMult : 1),
      visibilityTiles: () => (game.state.weather.bliz > 0.5 ? WEATHER.blizzard.visibilityTiles : Infinity),
      /** Force a weather type for `seconds` (type null clears the override). Debug / tests. */
      force(type, seconds = 120) { game.state.weather.forced = type ? { type, left: seconds } : null; },
    };
    game.speedModifiers.push((g) => 1 - (1 - WEATHER.blizzard.moveMult) * (g.state.weather?.bliz || 0));
  },
  onLoad(game) { snap(game); },
  update(game, dt) {
    const w = game.state.weather;
    if (w.forced) { w.forced.left -= dt * (game.state.time.speed || 1); if (w.forced.left <= 0) w.forced = null; }
    const r = evaluate(game), prev = w.type;
    w.remaining = r.remaining;
    const prevWarn = w.warnIn; w.warnIn = r.warnIn;
    if (r.type !== prev) {
      w.type = r.type;
      game.events.emit('weather:changed', { type: r.type, prev });
      if (r.type === 'blizzard') game.ui.toast?.('The blizzard hits. Get to shelter.', 'bad', 3500);
      else if (prev === 'blizzard') game.ui.toast?.('The storm is passing.', 'good');
      else if (r.type === 'snow') game.ui.toast?.('Snow begins to fall.', 'info', 2000);
    }
    if (r.warnIn > 0 && prevWarn === 0) game.events.emit('weather:warning', { in: r.warnIn });
    w.offset = ease(w.offset, targetOffset(w.type), dt, Math.abs(TEMPERATURE.blizzard));
    w.snow = ease(w.snow, w.type === 'clear' ? 0 : 1, dt);
    w.bliz = ease(w.bliz, w.type === 'blizzard' ? 1 : 0, dt);
    // banner: "Storm coming" for the 30 s before a blizzard
    setBanner(game, w.warnIn > 0 ? `Storm coming · ${Math.ceil(w.warnIn)}s` : null);
  },
  drawScreen(game, ctx, w, h) {
    const wx = game.state?.weather; if (!wx) return;
    const now = performance.now() / 1000, dt = Math.min(0.05, now - lastDraw); lastDraw = now;
    if (wx.snow <= 0.01 && wx.bliz <= 0.01) return;
    if (!particles) particles = createParticles();
    const light = game.state.time.light;
    particles.update(game.mode === 'playing' && !game.paused ? dt : 0, w, h, wx.snow, wx.bliz, game.renderer?.fxScale?.() ?? 1);
    particles.draw(ctx, light < 0.4);
    drawFog(ctx, game, w, h, wx.bliz, light, now);
  },
};
