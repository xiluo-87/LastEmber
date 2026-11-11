import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnclosure } from '../../src/logic/enclosure.js';
import { BUILDING } from '../../src/data/balance.js';
import { OBJECTIVES } from '../../src/logic/tutorial.js';

// Walls as a Set of "x,y" keys; the fire tile counts as blocked (campfire blocks).
function world(blocked) {
  const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return { isBlocked: (x, y) => set.has(`${x},${y}`) };
}
const ring = (cx, cy, r) => {
  const out = [];
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) if (Math.abs(x - cx) === r || Math.abs(y - cy) === r) out.push([x, y]);
  return out;
};

test('a 1-tile enclosure forms a room smaller than roomMinToast (the "too cramped" case)', () => {
  const walls = [[5, 4], [5, 6], [4, 5], [6, 5]];           // free tile at (5,5) walled on 4 sides
  const w = world(walls);
  const enc = createEnclosure({ w: 12, h: 12, isBlocked: w.isBlocked });
  const res = enc.update(4, 5);                              // last wall placed
  const formed = res.formed.find((r) => r.size === 1);
  assert.ok(formed, 'a size-1 room forms');
  assert.ok(formed.size < BUILDING.roomMinToast);
});

test('8 walls around a campfire leave no free tile: no room forms', () => {
  const walls = ring(5, 5, 1);                               // fire at (5,5) is itself blocked
  const enc = createEnclosure({ w: 12, h: 12, isBlocked: world([...walls, [5, 5]]).isBlocked });
  let formed = 0;
  for (const [x, y] of walls) formed += enc.update(x, y).formed.length;
  assert.equal(formed, 0);
  assert.equal(enc.rooms.size, 0);
});

test('tutorial shelter step uses the clearer objective and hint', () => {
  const s = OBJECTIVES.find((o) => o.id === 'shelter');
  assert.equal(s.text, 'Build a hut: walls and a door around your fire');
  assert.match(s.hint, /5×4 ring of walls with one door/);
  assert.match(s.hint, /fully closed/);
});
