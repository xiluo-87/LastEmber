// Chest panel: 12-slot chest on top, bag + hotbar below. Tap an item to move its whole stack to the other side. payload { tx, ty }.
import { STRUCTURES } from '../../data/structures.js';
import { transferStack } from '../../logic/structures.js';
import { paintSlot } from '../slots.js';

export default {
  id: 'chest', title: 'Chest', modal: true,
  render(game, body, payload = {}, ctl) {
    const o = game.world.objectAt(payload.tx, payload.ty);
    if (!o?.inv) { setTimeout(ctl.close, 0); return {}; }
    const inv = game.state.inventory, chest = o.inv;
    body.innerHTML = `<div class="inv chestui"><div class="inv-label">Chest <span class="ins muted ccount"></span></div><div class="inv-grid cgrid"></div>
      <div class="inv-label">Your bag <span class="ins muted">tap to store</span></div><div class="inv-grid bgrid2"></div>
      <div class="inv-label">Hotbar</div><div class="inv-row hrow"></div></div>`;
    const cells = [];
    const mk = (parent, store, area, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; parent.appendChild(b); cells.push({ b, store, area, i });
      b.addEventListener('click', () => {
        const s = store[area][i]; if (!s) return;
        const toChest = store === inv, dst = toChest ? chest : inv;
        const moved = toChest ? transferStack(inv, area, i, chest, ['bag']) : transferStack(chest, area, i, inv, ['bag', 'hotbar']);
        if (!moved) game.ui.toast(toChest ? 'Chest is full' : 'Bag is full', 'bad', 1400);
        void dst;
      });
    };
    chest.bag.forEach((_, i) => mk(body.querySelector('.cgrid'), chest, 'bag', i));
    inv.bag.forEach((_, i) => mk(body.querySelector('.bgrid2'), inv, 'bag', i));
    inv.hotbar.forEach((_, i) => mk(body.querySelector('.hrow'), inv, 'hotbar', i));
    const cc = body.querySelector('.ccount');
    const refresh = () => { for (const c of cells) paintSlot(c.b, c.store[c.area][c.i]); cc.textContent = `${chest.bag.filter(Boolean).length}/${STRUCTURES.chest.storage}`; };
    refresh();
    return { update() { if (game.world.objectAt(payload.tx, payload.ty) !== o) { ctl.close(); return; } refresh(); } };
  },
};
