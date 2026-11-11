// Initial game state. `game.state` is plain JSON-safe data. Systems add their own namespaced slice via `defaults()`
// (see systems/index.js), so this file only holds the shared core.
import { MAP, PLAYER, STATE_VERSION, TILE } from './data/balance.js';
import { generateWorld } from './world/gen.js';
import { createInventory, makeStack } from './logic/inventory.js';

export function createPlayer(world) {
  const s = world.spawn;
  return {
    x: s.tx * TILE + TILE / 2, y: s.ty * TILE + TILE / 2, vx: 0, vy: 0,
    facing: Math.PI / 2,            // radians, 0 = east, PI/2 = south (screen down)
    moving: false, sprinting: false, bob: 0,
    health: PLAYER.startStat, hunger: PLAYER.startStat, thirst: PLAYER.startStat, warmth: PLAYER.startStat, stamina: PLAYER.startStat,
    status: {},                     // active status effects: { bleeding:{...}, poison:{until:..} } (survival system owns the shape)
    invuln: 0,                      // i-frame seconds remaining
  };
}

export function createState(seed) {
  const world = generateWorld(seed);
  const inventory = createInventory();
  inventory.clothing[1] = makeStack(PLAYER.startClothing.body);
  return {
    version: STATE_VERSION,
    seed,
    world,
    player: createPlayer(world),
    inventory,
    flags: {},                      // free-form booleans/counters for tutorial, quests, endgame...
    stats: { daysSurvived: 1, createdAt: Date.now(), playSeconds: 0 },
  };
}
export { MAP };
