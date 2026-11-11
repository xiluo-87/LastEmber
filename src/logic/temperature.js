// Pure felt-temperature + warmth model (DESIGN §5). No DOM, no game object.
//
//   feltBreakdown(inputs, out?) -> { ambient, weather, heat, shelter, clothing, torch, felt, sheltered }
//   inputs = {
//     ambient       degC from the time system (state.time.ambient)
//     weatherOffset degC (<= 0) from the weather system (removed when sheltered)
//     sources       [{ x, y, heat, radius }]  world px position, peak degC at the centre, radius in TILES (linear falloff to 0)
//     px, py        player world px
//     sheltered     bool: player stands in an enclosed room
//     shelteredAt   optional (xPx, yPx) -> bool: is a heat source inside an enclosed room (then its heat is x1.5 when the player is sheltered too)
//     insulation    degC summed from equipped clothing
//     torch         degC from a held burning torch
//   }
import { TILE, TEMPERATURE as T } from '../data/balance.js';

/** Heat contributed by one source at distance d (world px). Linear: peak at the centre -> 0 at radius. */
export function heatAt(src, px, py) {
  const dx = px - src.x, dy = py - src.y, r = src.radius * TILE;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return 0;
  return src.heat * (1 - Math.sqrt(d2) / r);
}

export function feltBreakdown(inp, out = {}) {
  const sheltered = !!inp.sheltered;
  let heat = 0;
  const src = inp.sources || [];
  for (let i = 0; i < src.length; i++) {
    let h = heatAt(src[i], inp.px, inp.py);
    if (h > 0 && sheltered && inp.shelteredAt && inp.shelteredAt(src[i].x, src[i].y)) h *= T.enclosedFireMult;
    heat += h;
  }
  out.ambient = inp.ambient;
  out.weather = sheltered ? 0 : (inp.weatherOffset || 0);       // walls take the wind/weather penalty away
  out.heat = heat;
  out.shelter = sheltered ? T.shelterBonus : 0;
  out.clothing = inp.insulation || 0;
  out.torch = inp.torch || 0;
  out.sheltered = sheltered;
  out.felt = out.ambient + out.weather + out.heat + out.shelter + out.clothing + out.torch;
  return out;
}

export const feltTemperature = (inp) => feltBreakdown(inp).felt;

/** Warmth change per second for a felt temperature: clamp((felt - 10) * 0.06, -2.5, +3). */
export function warmthRate(felt) {
  const r = (felt - T.comfort) * T.warmthRate;
  return r < T.rateMin ? T.rateMin : r > T.rateMax ? T.rateMax : r;
}
