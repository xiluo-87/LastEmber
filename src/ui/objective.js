// Objective tracker widget (DESIGN §11). Drives the existing `.objective` element of the HUD from game.tutorial (systems/tutorial.js):
// one current objective, subtle tick + slide-in of the next one, tap for the one-line hint, dismissible (x). Phone friendly (44px tap rows).
import { TUTORIAL } from '../data/balance.js';

export function createObjective(game, root) {
  const el = root.querySelector('.objective');
  if (!el) return { update() {} };
  el.classList.add('tracker');
  el.innerHTML = `<div class="obj-row"><span class="obj-tick" aria-hidden="true"></span>
    <button class="obj-main" type="button" aria-label="Show hint"><span class="obj-text"></span><i class="obj-prog"></i></button>
    <button class="obj-x" type="button" aria-label="Hide objectives">&times;</button></div><div class="obj-hint" hidden></div>`;
  const $ = (s) => el.querySelector(s);
  const textEl = $('.obj-text'), progEl = $('.obj-prog'), hintEl = $('.obj-hint'), tick = $('.obj-tick');
  let animating = false, hintOpen = false, key = '', timer = 0;

  function render(enter) {
    const cur = game.tutorial?.current();
    const hide = !cur || game.tutorial.dismissed() || game.mode !== 'playing';
    el.hidden = hide;
    if (hide) { key = '|hide'; return; }
    textEl.textContent = cur.text; progEl.textContent = cur.progress ? ` ${cur.progress}` : '';
    hintEl.textContent = cur.hint; hintEl.hidden = !hintOpen;
    el.dataset.id = cur.id; tick.textContent = '';
    key = `${cur.id}|${cur.progress}`;
    if (enter) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
  }

  $('.obj-main').addEventListener('click', () => { hintOpen = !hintOpen; hintEl.hidden = !hintOpen; });
  $('.obj-x').addEventListener('click', () => { game.tutorial.dismiss(); game.ui.toast?.('Objectives hidden. Turn them back on in the pause menu.', 'info', 2600); });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());

  game.events.on('tutorial:complete', () => {
    if (el.hidden) return;
    animating = true; el.classList.add('ticking'); tick.textContent = '✓';
    clearTimeout(timer);
    timer = setTimeout(() => { animating = false; el.classList.remove('ticking'); hintOpen = false; render(true); }, TUTORIAL.tickSeconds * 1000);
  });
  game.events.on('tutorial:step', (e) => { if (!animating) { if (!e.load) hintOpen = false; render(!e.load); } });
  game.events.on('tutorial:dismissed', () => render(false));
  for (const e of ['game:new', 'game:loaded', 'game:title', 'game:over']) game.events.on(e, () => { clearTimeout(timer); animating = false; hintOpen = false; el.classList.remove('ticking'); render(false); });
  render(false);
  return {
    update() {
      if (animating) return;
      const cur = game.tutorial?.current();
      const k = cur && !game.tutorial.dismissed() && game.mode === 'playing' ? `${cur.id}|${cur.progress}` : '|hide';
      if (k !== key) render(false);
    },
  };
}
