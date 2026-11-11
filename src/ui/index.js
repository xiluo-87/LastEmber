// UI assembly: HUD, hotbar, panels, touch controls, title. Exposes game.ui.
import { createHud } from './hud.js';
import { createHotbar } from './hotbar.js';
import { createPanels } from './panels.js';
import { createTouch, isTouchDevice } from './touch.js';
import { createTitle } from './title.js';
import { createObjective } from './objective.js';
import { createCompass } from './compass.js';
import { PANELS } from './panels/index.js';
import { installInventoryUi } from './inventory-ui.js';

/**
 * game.ui = {
 *   toast(msg, kind='info'|'good'|'bad', ms), setBanner(text|null), setObjective(text|null), setActionLabel(text),
 *   panels: {register, open, close, toggle, closeAll, isOpen, modalOpen, topId}, hud, hotbar, touch|null, update()
 * }
 */
export function createUI(game, { hud: hudRoot, panels: panelsRoot, title: titleRoot, touch: touchRoot }) {
  const hud = createHud(game, hudRoot);
  const hotbar = createHotbar(game, hudRoot);
  const panels = createPanels(game, panelsRoot);
  for (const def of PANELS) panels.register(def.id, def);
  const touchOn = isTouchDevice(game.params);
  document.body.classList.toggle('touch', touchOn);
  const ui = {
    hud, hotbar, panels, touch: null,
    toast: hud.toast, setBanner: hud.setBanner, setObjective: hud.setObjective,
    setActionLabel(text) { ui.touch?.setActionLabel(text); },
    update() { hud.update(); hotbar.update(); panels.update(); objective.update(); compass.update(); },
  };
  game.ui = ui;
  const objective = createObjective(game, hudRoot), compass = createCompass(game, hudRoot);
  installInventoryUi(game, ui);
  if (touchOn) ui.touch = createTouch(game, touchRoot, game.input);
  createTitle(game, titleRoot);

  // global UI wiring from input events
  game.events.on('input:toggleBag', () => { if (game.mode === 'playing' && !game.paused) panels.toggle('bag'); });
  game.events.on('input:toggleBuild', () => {
    if (game.mode !== 'playing' || game.paused) return;
    if (game.building?.onToggle?.()) return;   // placing / dismantling: Build button cancels
    panels.toggle('build'); game.events.emit('build:toggle', { open: panels.isOpen('build') });
  });
  game.events.on('input:escape', () => {
    if (game.mode !== 'playing') return;
    const top = panels.topId();
    if (top) panels.close(top); else panels.open('pause');
  });
  game.events.on('game:over', (info) => { panels.closeAll(); panels.open('gameover', info); });
  game.events.on('game:new', () => { panels.closeAll(); game.input.releaseAll?.(); });
  game.events.on('game:loaded', () => { panels.closeAll(); game.input.releaseAll?.(); });
  game.events.on('game:title', () => { panels.closeAll(); });
  // action label follows the current target
  game.events.on('target:changed', (t) => ui.setActionLabel(t ? t.verb : ''));
  return ui;
}
