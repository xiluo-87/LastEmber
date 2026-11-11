// Pure time-of-day maths (DESIGN §4). t = seconds since sunrise of the current day, 0..dayLength.
import { TIME, TEMPERATURE } from '../data/balance.js';

export const nightLength = (day) => Math.min(TIME.maxNight, TIME.baseNight + TIME.nightGrowPerDay * (day - 1));
export const daylightLength = (day) => TIME.dayLength - nightLength(day);
const smoothstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** -> { phase:'dawn'|'day'|'dusk'|'night', light:0..1 (ambient light), phaseT: seconds into phase, phaseLen } */
export function phaseAt(day, t) {
  const dl = daylightLength(day);
  if (t < TIME.dawnLength) return { phase: 'dawn', light: TIME.minAmbient + (1 - TIME.minAmbient) * smoothstep(t / TIME.dawnLength), phaseT: t, phaseLen: TIME.dawnLength };
  if (t < dl - TIME.duskLength) return { phase: 'day', light: 1, phaseT: t - TIME.dawnLength, phaseLen: dl - TIME.dawnLength - TIME.duskLength };
  if (t < dl) return { phase: 'dusk', light: TIME.minAmbient + (1 - TIME.minAmbient) * (1 - smoothstep((t - (dl - TIME.duskLength)) / TIME.duskLength)), phaseT: t - (dl - TIME.duskLength), phaseLen: TIME.duskLength };
  return { phase: 'night', light: TIME.minAmbient, phaseT: t - dl, phaseLen: nightLength(day) };
}

/** Hours on a 24h dial (t=0 -> 06:00). */
export const clockHours = (t) => (TIME.clockOffsetHours + (t / TIME.dayLength) * 24) % 24;
export function clockString(t) {
  const h = clockHours(t);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Ambient temperature in degC (before weather offsets): noon base falls per day; night colder, smooth via light. */
export function ambientTemperature(day, light) {
  const dayBase = Math.max(TEMPERATURE.floor, TEMPERATURE.noonBase + TEMPERATURE.perDay * (day - 1));
  const k = (1 - light) / (1 - TIME.minAmbient);
  return dayBase + TEMPERATURE.nightOffset * k;
}
