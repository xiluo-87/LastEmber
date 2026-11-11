// Hotbar (5 slots, bottom-centre). Tap/click selects. Bound to state.inventory.hotbar / selected.
import { selectHotbar } from '../logic/inventory.js';
import { paintSlot } from './slots.js';

export function createHotbar(game, root) {
  const el = document.createElement('div');
  el.className = 'hotbar';
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('button');
    b.className = 'slot'; b.type = 'button'; b.dataset.i = i; b.setAttribute('aria-label', `Hotbar slot ${i + 1}`);
    const k = document.createElement('span'); k.className = 'key'; k.textContent = i + 1;
    b.appendChild(k);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.input.selectHotbar?.(i); });
    el.appendChild(b); slots.push(b);
  }
  root.appendChild(el);
  game.events.on('input:hotbar', ({ index }) => {
    if (game.state && selectHotbar(game.state.inventory, index)) game.events.emit('hotbar:changed', { index });
  });
  return {
    el,
    update() {
      const inv = game.state?.inventory; if (!inv) return;
      slots.forEach((b, i) => {
        paintSlot(b, inv.hotbar[i]);
        b.classList.toggle('sel', inv.selected === i);
      });
    },
  };
}
