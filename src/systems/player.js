// Player movement: input intent -> position with circle-vs-tile collision (sliding), sprint, terrain speed, facing, walk bob.
// Speed modifiers: push fn(game) -> multiplier into `game.speedModifiers` (weather, cold slowdown, ...). They multiply.
import { TILE, PLAYER } from '../data/balance.js';
import { moveCircle } from '../logic/collision.js';

export default {
  name: 'player',
  init(game) { game.speedModifiers = game.speedModifiers || []; },
  update(game, dt) {
    const p = game.state.player, world = game.world, intent = game.input.intent;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    let mx = intent.uiBlocked ? 0 : intent.moveX, my = intent.uiBlocked ? 0 : intent.moveY;
    let len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; len = 1; }
    const wantMove = len > 0.05;
    p.sprinting = wantMove && !!intent.sprint && p.stamina > 0 && !intent.uiBlocked;

    const ox = p.x, oy = p.y;
    if (wantMove) {
      const here = world.worldToTile(p.x, p.y);
      let mult = world.terrainSpeed(here.tx, here.ty);
      for (const fn of game.speedModifiers) mult *= fn(game);
      const speed = (p.sprinting ? PLAYER.sprint : PLAYER.walk) * TILE * mult * Math.min(1, len < 0.98 ? len : 1);
      const dirx = mx / len, diry = my / len;
      const res = moveCircle(world, p.x, p.y, dirx * speed * dt, diry * speed * dt, PLAYER.radius * TILE);
      p.x = res.x; p.y = res.y;
    }
    const moved = Math.hypot(p.x - ox, p.y - oy);
    p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt;
    p.moving = moved > 0.02;
    if (moved > 0) p.bob += (moved / TILE) * PLAYER.bobPerTile * Math.PI;

    // facing: mouse aim wins while recently used; otherwise movement direction (touch/keyboard keep last direction)
    if (intent.aimActive && !intent.uiBlocked) p.facing = Math.atan2(intent.pointer.wy - p.y, intent.pointer.wx - p.x);
    else if (wantMove) p.facing = Math.atan2(my, mx);
  },
};
