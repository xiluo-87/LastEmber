// Entry point: wires game + input + renderer + UI + loop. Nothing game-specific lives here.
import { createGame, startLoop } from './game.js';
import { createInput } from './input.js';
import { createRenderer } from './render/renderer.js';
import { createUI } from './ui/index.js';
import { installAutosave } from './save.js';
import { installDebug } from './debug.js';
import { createState } from './state.js';
import { randomSeed } from './rng.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');

const game = createGame({ params });
game.canvas = canvas;
createInput(game);
game.renderer = createRenderer(game, canvas);
game.renderer.resize();
createUI(game, { hud: $('hud'), panels: $('panels'), title: $('title'), touch: $('touch-layer') });
installAutosave(game);
const dbg = installDebug(game);
window.__game = game;

// Attract-mode world behind the title screen (not simulated, not saved).
game.attachState(createState(params.seed != null ? Number(params.seed) >>> 0 : randomSeed()));

let resizeT = 0;
const onResize = () => { game.renderer.resize(); };
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(onResize, 50); });
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));

startLoop(game, (dt, time) => {
  game.renderer.render(dt, time);
  game.ui.update();
  dbg?.update(dt);
});
