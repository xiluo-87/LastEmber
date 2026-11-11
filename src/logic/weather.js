// Pure, deterministic weather schedule (DESIGN §4). The weather of a day is a function of (seed, day) only:
// planDay(seed, day) -> [{ type:'snow'|'blizzard', start, end }]  (seconds since sunrise, non-overlapping, never crossing midnight)
// weatherAt(plan, t) -> { type, remaining, warnIn }   warnIn = seconds until the next blizzard if within warnSeconds, else 0
import { WEATHER, TIME } from '../data/balance.js';
import { mulberry32 } from '../rng.js';

export function blizzardChance(day) {
  const B = WEATHER.blizzard;
  if (day < B.firstDay) return 0;
  return Math.min(B.chanceMax, B.chanceBase + B.chancePerDay * (day - B.firstDay));
}

export function planDay(seed, day) {
  const rnd = mulberry32(((seed >>> 0) ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0);
  rnd(); rnd();
  const B = WEATHER.blizzard, S = WEATHER.snow;
  const earliest = Math.max(B.warnSeconds + 5, day === 1 ? WEATHER.day1ClearSeconds : 0);
  const plan = [];
  const place = (type, minD, maxD) => {
    const dur = Math.round(minD + rnd() * (maxD - minD));
    const hi = TIME.dayLength - dur - 1;
    if (hi <= earliest) return;
    const start = Math.round(earliest + rnd() * (hi - earliest));
    const end = start + dur;
    // keep a gap (the warning window) between episodes
    if (plan.some((e) => start < e.end + B.warnSeconds && end + B.warnSeconds > e.start)) return;
    plan.push({ type, start, end });
  };
  if (rnd() < blizzardChance(day)) place('blizzard', B.minDuration, B.maxDuration);
  if (rnd() < S.chance) place('snow', S.minDuration, S.maxDuration);
  plan.sort((a, b) => a.start - b.start);
  return plan;
}

export function weatherAt(plan, t) {
  const B = WEATHER.blizzard;
  let warnIn = 0;
  for (const e of plan) {
    if (t >= e.start && t < e.end) return { type: e.type, remaining: e.end - t, warnIn: 0 };
    if (e.type === 'blizzard' && t < e.start && e.start - t <= B.warnSeconds) warnIn = e.start - t;
  }
  return { type: 'clear', remaining: 0, warnIn };
}
