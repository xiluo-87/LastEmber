// Build menu (non-modal bottom sheet, one-thumb): Dismantle toggle + structures grouped, each card = icon, name, cost have/need
// chips, blurb. Greyed when unaffordable (tapping explains what is missing). Picking a structure enters placement mode
// (game.building.select) and shows the placement bar (panels/buildbar.js).
import { STRUCTURES, BUILD_MENU, BLURB } from '../../data/structures.js';
import { ITEMS } from '../../data/items.js';
import { count } from '../../logic/inventory.js';
import { missingCost, hasToolClass } from '../../logic/placement.js';
import { itemIcon } from '../../render/icons.js';
import { structureIcon } from '../../render/sprites/structures.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function paintCanvases(root) {
  root.querySelectorAll('canvas[data-ico],canvas[data-sti]').forEach((c) => {
    if (c._p) return; c._p = 1;
    const src = c.dataset.sti ? structureIcon(c.dataset.sti) : itemIcon(c.dataset.ico);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  });
}
export const costChips = (inv, cost) => cost.map((c) => {
  const have = count(inv, c.item), ok = have >= c.n;
  return `<span class="need ${ok ? 'ok' : 'no'}"><canvas class="ico" width="40" height="40" data-ico="${c.item}" style="width:18px;height:18px"></canvas>${have}/${c.n}</span>`;
}).join('');

export default {
  id: 'build', title: 'Build', modal: false,
  render(game, body, payload, ctl) {
    const inv = game.state.inventory, B = game.building;
    const card = (id) => {
      const d = STRUCTURES[id];
      return `<button class="bcard" type="button" data-id="${id}"><canvas class="bicon" width="96" height="96" data-sti="${id}"></canvas>
        <span class="bmain"><b>${esc(d.name)}</b><span class="needs">${costChips(inv, d.cost)}</span><span class="blurb">${esc(BLURB[id] || '')}</span></span></button>`;
    };
    body.innerHTML = `<button class="btn dismantle" type="button" data-a="dismantle">Dismantle mode<span class="small muted">Hold Action on a structure. 50% back.</span></button>
      ${BUILD_MENU.map((g) => `<div class="grp">${g.group}</div><div class="bgrid">${g.items.map(card).join('')}</div>`).join('')}`;
    paintCanvases(body);
    const sheet = body.closest('.panel'); sheet?.classList.add('sheet');
    const reason = (id) => {
      const d = STRUCTURES[id], m = missingCost(inv, d.cost);
      if (m) return `Need ${m.need} more ${ITEMS[m.item].name.toLowerCase()}`;
      if (d.requires?.toolAny && !hasToolClass(inv, d.requires.toolAny)) return 'Needs an axe or pickaxe';
      return null;
    };
    body.addEventListener('click', (e) => {
      if (e.target.closest('[data-a="dismantle"]')) { B.toggleDismantle(); return; }
      const c = e.target.closest('.bcard'); if (!c) return;
      const why = reason(c.dataset.id);
      if (why) { game.ui.toast(why, 'bad', 1800); return; }
      B.select(c.dataset.id);
    });
    let sig = '';
    return {
      update() {
        const s = JSON.stringify(Object.values(STRUCTURES).map((d) => d.cost.map((c) => count(inv, c.item)))) + (hasToolClass(inv, ['axe', 'pickaxe']) ? 1 : 0);
        if (s === sig) return; sig = s;
        for (const el of body.querySelectorAll('.bcard')) {
          const id = el.dataset.id, d = STRUCTURES[id];
          el.querySelector('.needs').innerHTML = costChips(inv, d.cost);
          el.classList.toggle('no', !!reason(id));
        }
        paintCanvases(body);
      },
    };
  },
};
