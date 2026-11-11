// Fuel panel for campfire / furnace / torch post: burn-time bar, one tap per fuel item (hold to keep adding), Light button,
// Cook shortcut, Repair when damaged. payload { tx, ty }.
import { STRUCTURES } from '../../data/structures.js';
import { ITEMS } from '../../data/items.js';
import { BUILDING } from '../../data/balance.js';
import { count, has } from '../../logic/inventory.js';
import { fuelSeconds, repairItem } from '../../logic/structures.js';
import { paintCanvases } from './build.js';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default {
  id: 'fuel', title: 'Fire', modal: true,
  render(game, body, payload = {}, ctl) {
    const o = game.world.objectAt(payload.tx, payload.ty), def = o && STRUCTURES[o.type];
    if (!def?.fuel) { setTimeout(ctl.close, 0); return {}; }
    ctl.setTitle(def.name);
    const S = game.structures, inv = game.state.inventory;
    const canLight = o.type !== 'torch_post';
    body.innerHTML = `<div class="fuelhead"><span class="fstate"></span><b class="fleft"></b></div>
      <div class="fbar"><i></i></div><div class="small muted ftip"></div>
      <div class="fitems">${def.fuel.accepts.map((id) => `<button class="fitem" type="button" data-id="${id}"><canvas class="ico" width="64" height="64" data-ico="${id}" style="width:36px;height:36px"></canvas>
        <span class="fi-main"><b>${ITEMS[id].name}</b><span class="small muted">+${fuelSeconds(o.type, id)}s</span></span><span class="fi-n">0</span></button>`).join('')}</div>
      <div class="fbtns">${canLight ? '<button class="btn primary flight" type="button" data-a="light">Light fire</button>' : ''}
        ${def.station && o.type !== 'torch_post' ? '<button class="btn" type="button" data-a="cook">Cook / Craft</button>' : ''}
        <button class="btn frepair" type="button" data-a="repair" hidden>Repair</button></div>`;
    paintCanvases(body);
    const $ = (s) => body.querySelector(s);
    const stateEl = $('.fstate'), leftEl = $('.fleft'), bar = $('.fbar i'), tip = $('.ftip'), lightBtn = $('.flight'), repBtn = $('.frepair');
    const add = (id) => { const r = S.addFuel(o, id); if (r.ok) paint(true); return r.ok; };
    // tap = add one; hold = keep adding
    let holdT = null, rep = null;
    const stop = () => { clearTimeout(holdT); clearInterval(rep); holdT = rep = null; };
    body.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.fitem'); if (!b || b.disabled) return;
      e.preventDefault(); stop(); add(b.dataset.id);
      holdT = setTimeout(() => { rep = setInterval(() => { if (!add(b.dataset.id)) stop(); }, BUILDING.fuelHold.every * 1000); }, BUILDING.fuelHold.delay * 1000);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) body.addEventListener(ev, stop);
    body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'light') { S.light(o); paint(true); }
      else if (a === 'cook') { ctl.close(); game.ui.openCraft?.(); }
      else if (a === 'repair') { S.repair(o); paint(true); }
    });
    let last = '';
    function paint(force) {
      const f = o.fuel / def.fuel.max, sig = `${Math.ceil(o.fuel)}|${o.lit}|${Math.ceil(o.hp)}|${def.fuel.accepts.map((id) => count(inv, id)).join(',')}|${has(inv, 'flint')}`;
      if (!force && sig === last) return; last = sig;
      bar.style.width = `${Math.min(100, f * 100)}%`; bar.className = o.lit && o.fuel < BUILDING.lowFuelSeconds ? 'low' : '';
      stateEl.textContent = o.lit ? 'Burning' : o.fuel > 0 ? 'Unlit' : 'Out of fuel'; stateEl.className = `fstate ${o.lit ? 'on' : 'off'}`;
      leftEl.textContent = o.fuel > 0 ? `${mmss(o.fuel)} of fuel` : 'No fuel';
      for (const b of body.querySelectorAll('.fitem')) {
        const id = b.dataset.id, n = count(inv, id), full = o.fuel + fuelSeconds(o.type, id) > def.fuel.max + 1e-6;
        b.querySelector('.fi-n').textContent = n; b.disabled = n <= 0 || full; b.classList.toggle('full', full && n > 0);
      }
      if (lightBtn) {
        const needFlint = def.needsFlint && !o.everLit && !has(inv, 'flint');
        lightBtn.hidden = o.lit; lightBtn.disabled = !(o.fuel > 0) || needFlint;
        lightBtn.textContent = needFlint ? 'Needs flint to light' : 'Light fire';
      }
      tip.textContent = !o.lit && def.needsFlint && !o.everLit ? 'Add fuel, then light it with flint (not used up).' : o.lit && def.heat ? 'Walls trap heat: a fire inside a closed room warms 1.5x.' : o.type === 'torch_post' ? 'Fat or coal keeps it burning.' : '';
      const need = repairItem(o.type), dmg = o.hp < def.hp;
      repBtn.hidden = !dmg; if (dmg) { repBtn.textContent = `Repair (${ITEMS[need].name})`; repBtn.disabled = !has(inv, need); }
    }
    paint(true);
    return {
      update() { if (game.world.objectAt(payload.tx, payload.ty) !== o) { ctl.close(); return; } paint(false); },
      destroy: stop,
    };
  },
};
