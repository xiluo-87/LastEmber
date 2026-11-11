// Shared DOM helper for rendering an inventory slot (icon + count + durability).
import { ITEMS } from '../data/items.js';
import { itemIcon } from '../render/icons.js';

export const slotSignature = (s) => (s ? `${s.id}:${s.n}:${s.dur ?? ''}:${s.burn !== undefined ? Math.ceil(s.burn) : ''}` : '');

/** Fill a slot element (class "slot") with the stack's visuals. Cheap no-op if unchanged. */
export function paintSlot(el, stack) {
  const sig = slotSignature(stack);
  if (el._sig === sig) return;
  el._sig = sig;
  el.querySelectorAll('.icon,.count,.dur').forEach((n) => n.remove());
  el.classList.toggle('empty', !stack);
  if (!stack) { el.removeAttribute('title'); return; }
  const def = ITEMS[stack.id];
  const c = document.createElement('canvas'); c.width = c.height = 64; c.className = 'icon';
  c.getContext('2d').drawImage(itemIcon(stack.id), 0, 0);
  el.appendChild(c);
  if (stack.n > 1) { const n = document.createElement('i'); n.className = 'count'; n.textContent = stack.n; el.appendChild(n); }
  const bar = stack.dur !== undefined && def?.tool?.dur ? stack.dur / def.tool.dur : stack.burn !== undefined && def?.tool?.burn ? stack.burn / def.tool.burn : null; // durability or torch burn
  if (bar !== null) {
    const d = document.createElement('u'); d.className = 'dur';
    const f = Math.max(0, Math.min(1, bar));
    d.style.setProperty('--f', f); d.style.setProperty('--c', f > 0.5 ? '#7bd389' : f > 0.25 ? '#e9a23b' : '#e63946');
    el.appendChild(d);
  }
  el.title = def?.name || stack.id;
}
