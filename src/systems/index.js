// System registry. Systems run IN THIS ORDER every fixed tick. To add a system: create src/systems/<name>.js and append
// ONE import + ONE entry below.
//
// System shape:
//   {
//     name: 'survival',
//     defaults?: () => ({...}),      // initial state slice -> game.state[stateKey ?? name]; also fills missing slices on old saves
//     stateKey?: 'survival',
//     init(game),                    // once at boot: subscribe to events, build caches, register providers
//     onLoad?(game),                 // every time a state is attached (new game / load): rebuild runtime caches from state
//     update(game, dt),              // fixed 1/60 s step while playing & unpaused
//     // optional render hooks (see render/renderer.js): drawGround, drawables, drawFx, lights, drawScreen
//   }
import time from './time.js';
import player from './player.js';
import targeting from './targeting.js';
import interact from './interact.js';
import gather from './gather.js';
import items from './items.js';
import crafting from './crafting.js';
import weather from './weather.js';
import survival from './survival.js';
import creatures from './creatures.js';
import combat from './combat.js';
import building from './building.js';
import structures from './structures.js';
import sleep from './sleep.js';
import audio from './audio.js';

export const SYSTEMS = [
  time,
  player,
  targeting,
  interact,   // interaction registry + swing (must precede gather/items/crafting: they register handlers in init)
  gather,
  items,
  crafting,
  weather,
  survival,
  creatures,  // wildlife AI, spawning, carcasses (after survival: uses damagePlayer)
  combat,     // player:swing -> creatures, bow/arrows, butchering
  building,   // build mode, placement, rooms/shelter, structure hp (game.building)
  structures, // fires, racks, snares, fishing, workbench/chest handlers (game.structures)
  sleep,      // bedroll sleeping (game.sleep)
  audio,      // WebAudio sound effects + ambience (src/audio.js engine; presentation only)
  // append new systems below (one line each), e.g.:  weather, survival, gather, crafting, building, structures, creatures, combat, endgame, tutorial
];
