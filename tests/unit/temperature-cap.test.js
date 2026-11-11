import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPERATURE as T } from '../../src/data/balance.js';
import { feltBreakdown, feltTemperature, warmthRate } from '../../src/logic/temperature.js';

test('felt temperature is capped at TEMPERATURE.feltMax (26 degC)', () => {
  assert.equal(T.feltMax, 26);
  // A campfire at the centre next to a sheltered player with an enclosed fire: far above the cap.
  const src = { x: 0, y: 0, heat: T.campfire.peak, radius: T.campfire.radius };
  const hot = feltBreakdown({ ambient: 5, weatherOffset: 0, sources: [src], px: 0, py: 0, sheltered: true, shelteredAt: () => true, insulation: 10, torch: 4 });
  assert.ok(hot.heat > 26);
  assert.equal(hot.felt, 26);
  assert.equal(feltTemperature({ ambient: 0, sources: [src], px: 0, py: 0 }), 26);
  // Below the cap nothing changes.
  assert.equal(feltTemperature({ ambient: -4, weatherOffset: -12, sources: [], px: 0, py: 0 }), -16);
});

test('warmth rate uses the capped felt value (rate is still clamped at +3/s)', () => {
  const src = { x: 0, y: 0, heat: T.campfire.peak, radius: T.campfire.radius };
  const b = feltBreakdown({ ambient: 0, sources: [src], px: 0, py: 0 });
  assert.equal(b.felt, 26);
  assert.equal(warmthRate(b.felt), (26 - T.comfort) * T.warmthRate);
  assert.ok(warmthRate(b.felt) <= T.rateMax);
});
