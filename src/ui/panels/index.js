// Panel registry: append ONE import + ONE entry per panel. Each panel module default-exports a def:
//   { id, title, modal?, pauses?, render(game, body, payload, ctl) }   (see ui/panels.js)
import bag from './bag.js';
import build from './build.js';
import pause from './pause.js';
import gameover from './gameover.js';

export const PANELS = [
  bag,
  build,
  pause,
  gameover,
  // append here
];
