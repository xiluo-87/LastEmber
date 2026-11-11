import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, createRng, valueNoise, fbm, hash2 } from '../../src/rng.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(123), b = mulberry32(123);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});
test('createRng helpers stay in range', () => {
  const r = createRng(5);
  for (let i = 0; i < 200; i++) { const v = r.int(3, 7); assert.ok(v >= 3 && v <= 7 && Number.isInteger(v)); }
  const arr = r.shuffle([1, 2, 3, 4, 5]); assert.deepEqual([...arr].sort(), [1, 2, 3, 4, 5]);
  assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
});
test('value noise is smooth, bounded and deterministic', () => {
  assert.equal(valueNoise(9, 1.3, 2.7), valueNoise(9, 1.3, 2.7));
  let maxStep = 0;
  for (let x = 0; x < 20; x += 0.05) {
    const v = valueNoise(3, x, 4.4); assert.ok(v >= 0 && v <= 1);
    maxStep = Math.max(maxStep, Math.abs(v - valueNoise(3, x + 0.05, 4.4)));
  }
  assert.ok(maxStep < 0.2, `noise should be continuous (max step ${maxStep})`);
  const f = fbm(4, 3.3, 1.1, 4); assert.ok(f >= 0 && f <= 1);
  assert.equal(hash2(1, 2, 3), hash2(1, 2, 3));
});
