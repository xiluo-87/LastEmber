import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnclosure, floodRoom } from '../../src/logic/enclosure.js';

// Tiny grid helper: '#' wall, 'D' door (both block the flood), '.' floor. The pattern sits in a big open field (PAD tiles of
// snow each side) so the outside is never itself a small "room" bounded by the map edge. Coordinates passed to the helper are
// pattern-relative.
const PAD = 12;
function grid(rows) {
  const iw = rows[0].length, w = iw + PAD * 2, h = rows.length + PAD * 2;
  const cells = Array.from({ length: h }, () => Array(w).fill('.'));
  rows.forEach((r, y) => r.split('').forEach((c, x) => { cells[y + PAD][x + PAD] = c; }));
  const isBlocked = (x, y) => cells[y][x] === '#' || cells[y][x] === 'D';
  const enc = createEnclosure({ w, h, isBlocked, max: 60 });
  return {
    w, h, cells, enc, rebuild: () => enc.rebuild(),
    set(x, y, c) { cells[y + PAD][x + PAD] = c; return enc.update(x + PAD, y + PAD); },
    room: (x, y) => enc.roomAt(x + PAD, y + PAD), isRoom: (x, y) => enc.isRoomTile(x + PAD, y + PAD), sheltered: (x, y) => enc.isSheltered(x + PAD, y + PAD), isBlocked,
  };
}

test('enclosure: closed room is detected, outside is not', () => {
  const g = grid(['#####', '#...#', '#...#', '#...#', '#####']);
  g.rebuild();
  assert.equal(g.enc.rooms.size, 1);
  assert.ok(g.isRoom(2, 2)); assert.ok(!g.isRoom(-3, -3));
  assert.equal(g.room(2, 2).size, 9);
});

test('enclosure: an open ring is not a room; closing it forms one; breaching it removes it (incremental update)', () => {
  const g = grid(['#####', '#...#', '#....', '#...#', '#####']);
  g.rebuild();
  assert.equal(g.enc.rooms.size, 0);
  const closed = g.set(4, 2, '#');
  assert.equal(closed.formed.length, 1); assert.equal(closed.formed[0].size, 9);
  assert.ok(g.sheltered(2, 2));
  const breached = g.set(4, 2, '.');
  assert.equal(breached.breached.length, 1); assert.equal(g.enc.rooms.size, 0); assert.ok(!g.sheltered(2, 2));
});

test('enclosure: a door counts as a wall for the flood fill (closed door = room, any gap = no room)', () => {
  const g = grid(['#######', '#.....#', '#.....#', '###D###']);
  g.rebuild();
  assert.equal(g.room(1, 1).size, 10);
  g.set(3, 3, '.');
  assert.equal(g.enc.rooms.size, 0);
  assert.equal(g.set(3, 3, 'D').formed.length, 1);
});

test('enclosure: max 60 tiles — exactly 60 is a room, 66 is not', () => {
  const box = (iw, ih) => { const rows = []; for (let y = 0; y < ih + 2; y++) rows.push([...Array(iw + 2)].map((_, x) => (x === 0 || y === 0 || x === iw + 1 || y === ih + 1 ? '#' : '.')).join('')); return grid(rows); };
  const small = box(10, 6); small.rebuild(); assert.equal(small.enc.rooms.size, 1); assert.equal([...small.enc.rooms.values()][0].size, 60);
  const big = box(11, 6); big.rebuild(); assert.equal(big.enc.rooms.size, 0);
  assert.equal(floodRoom(big.isBlocked, big.w, big.h, PAD + 3, PAD + 3, 60).closed, false);
});

test('enclosure: splitting a room makes two; walls touching a room count as sheltered', () => {
  const g = grid(['#######', '#.....#', '#.....#', '#######']);
  g.rebuild(); assert.equal(g.enc.rooms.size, 1);
  g.set(3, 1, '#'); g.set(3, 2, '#');
  assert.equal(g.enc.rooms.size, 2);
  assert.ok(g.sheltered(3, 1));
  assert.ok(!g.sheltered(-5, -5));
});
