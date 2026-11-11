// Per-type custom object drawing (for animated / stateful objects like a lit campfire).
//   registerObjectDrawer('campfire', (ctx, obj, x, y, game, time) => { ... })   x,y = ground point of the object
// If no drawer is registered the renderer draws the cached sprite named `obj.type` (variant obj.variant),
// or `<type>:empty` when obj.depleted and such a sprite exists.
import { drawSprite, hasSprite } from './sprites.js';

const drawers = new Map();
/** Object types drawn flat on the ground (sorted before the player; their sprites anchor at the tile top, ground y = ty*32+2). */
export const FLAT_OBJECTS = new Set(['bedroll', 'snare', 'fishing_hole']);
export const registerObjectDrawer = (type, fn) => drawers.set(type, fn);

export const spriteKeyFor = (obj) => (obj.depleted && hasSprite(`${obj.type}:empty`) ? `${obj.type}:empty` : obj.type);

export function drawObject(ctx, obj, x, y, game, time) {
  const d = drawers.get(obj.type);
  if (d) { d(ctx, obj, x, y, game, time); return; }
  drawSprite(ctx, spriteKeyFor(obj), obj.variant || 0, x, y);
}
