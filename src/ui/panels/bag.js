// Bag panel (basic): 16 bag slots, hotbar, clothing. Tap a slot to pick it up, tap another to move / swap / merge.
// Crafting/equipment engineers can extend or replace this file (it is a plain panel def).
import * as inv from '../../logic/inventory.js';
import { paintSlot } from '../slots.js';
import { ITEMS } from '../../data/items.js';
import { CLOTHING_SLOTS } from '../../data/balance.js';

export default {
  id: 'bag', title: 'Bag', modal: true,
  render(game, body) {
    const st = game.state.inventory;
    let picked = null;
    body.innerHTML = `<div class="inv"><div class="inv-label">Clothing</div><div class="inv-row clothing"></div>
      <div class="inv-label">Hotbar</div><div class="inv-row hotbar-row"></div>
      <div class="inv-label">Bag</div><div class="inv-grid"></div><div class="inv-info">Tap an item, then a slot.</div></div>`;
    const info = body.querySelector('.inv-info');
    const mk = (area, i, parent) => {
      const b = document.createElement('button'); b.className = 'slot'; b.type = 'button';
      if (area === 'clothing') b.dataset.hint = CLOTHING_SLOTS[i];
      b.addEventListener('click', () => {
        const r = inv.ref(area, i);
        if (picked) {
          const was = picked; picked = null;
          if (!(was.a === area && was.i === i)) inv.move(st, was, r);
        } else if (inv.getSlot(st, r)) {
          picked = r;
          const s = inv.getSlot(st, r), d = ITEMS[s.id];
          if (d.clothing && area !== 'clothing') { inv.equip(st, r); picked = null; }
        }
        refresh();
      });
      parent.appendChild(b); return { b, area, i };
    };
    const cells = [
      ...st.clothing.map((_, i) => mk('clothing', i, body.querySelector('.clothing'))),
      ...st.hotbar.map((_, i) => mk('hotbar', i, body.querySelector('.hotbar-row'))),
      ...st.bag.map((_, i) => mk('bag', i, body.querySelector('.inv-grid'))),
    ];
    function refresh() {
      for (const c of cells) {
        paintSlot(c.b, st[c.area][c.i]);
        c.b.classList.toggle('picked', !!picked && picked.a === c.area && picked.i === c.i);
      }
      const s = picked && inv.getSlot(st, picked);
      info.textContent = s ? `${ITEMS[s.id].name}${s.n > 1 ? ` x${s.n}` : ''}${s.dur !== undefined ? ` (durability ${s.dur})` : ''} - tap a destination` : 'Tap an item, then a slot. Clothing equips automatically.';
    }
    refresh();
    return { update: refresh };
  },
};
