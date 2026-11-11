// Placement / dismantle bar: a small non-modal card at the top-right while build mode is active.
// Shows the selected structure (icon, name, cost chips), the live validity reason, Cancel and Menu buttons.
import { STRUCTURES } from '../../data/structures.js';
import { structureIcon } from '../../render/sprites/structures.js';
import { count } from '../../logic/inventory.js';
import { costChips, paintCanvases } from './build.js';

export default {
  id: 'buildbar', title: 'Building', modal: false,
  render(game, body, payload, ctl) {
    body.closest('.panel-backdrop')?.classList.add('bar');
    const B = game.building, inv = game.state.inventory;
    let sig = '', status = null, nameEl = null;
    const paint = () => {
      if (B.mode === 'place' && B.selected) {
        const d = STRUCTURES[B.selected];
        body.innerHTML = `<div class="bb-head"><canvas class="bicon" width="96" height="96" data-sti="${B.selected}"></canvas><div class="bb-t"><b>${d.name}</b><span class="needs"></span></div></div>
          <div class="bb-status"></div><div class="bb-btns"><button class="btn" data-a="cancel" type="button">Cancel</button><button class="btn" data-a="menu" type="button">Menu</button></div>`;
        status = body.querySelector('.bb-status');
      } else {
        body.innerHTML = `<div class="bb-head"><div class="bb-t"><b>Dismantle</b><span class="muted small">Face a structure, hold Action.</span></div></div>
          <div class="bb-status ok">Returns 50% of the materials.</div><div class="bb-btns"><button class="btn primary" data-a="cancel" type="button">Done</button><button class="btn" data-a="menu" type="button">Menu</button></div>`;
        status = null;
      }
      paintCanvases(body);
    };
    body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'cancel') B.cancel();
      else if (a === 'menu') game.ui.panels.open('build');
    });
    return {
      update() {
        const key = `${B.mode}|${B.selected}`;
        if (key !== sig) { sig = key; paint(); lastNeeds = ''; lastStatus = ''; }
        if (B.mode === 'place' && B.selected) {
          const d = STRUCTURES[B.selected], needs = body.querySelector('.needs');
          const n = JSON.stringify(d.cost.map((c) => count(inv, c.item)));
          if (n !== lastNeeds) { lastNeeds = n; needs.innerHTML = costChips(inv, d.cost); paintCanvases(body); }
          const g = B.ghost, txt = g.valid ? (B.cursorMode ? 'Ready: arrows move it, tap Place' : 'Ready: press Action or click the ghost') : g.reason || '';
          if (txt !== lastStatus) { lastStatus = txt; status.textContent = txt; status.className = `bb-status ${g.valid ? 'ok' : 'bad'}`; }
        }
      },
      destroy() { B.cancel(); },
    };
  },
};
let lastNeeds = '', lastStatus = '';
void structureIcon;
