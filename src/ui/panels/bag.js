// Bag panel: tabs [Bag | Craft]. Phone-first, one-thumb, no hover.
//   Bag tab:   clothing slots, hotbar, 4x4 bag grid; tap a slot -> item detail card (sticky at the bottom) with Use/Equip/Drop,
//              durability bar, and "put in hotbar slot 1-5" buttons.
//   Craft tab: recipes grouped by station, craftable first, have/need chips, missing station/ingredient shown on greyed rows.
// open: game.ui.panels.open('bag', { tab: 'craft' }) or game.ui.openCraft()  (C key)
import * as inv from '../../logic/inventory.js';
import { paintSlot } from '../slots.js';
import { itemIcon } from '../../render/icons.js';
import { ITEMS } from '../../data/items.js';
import { describe, describeStats } from '../../data/itemdesc.js';
import { CLOTHING_SLOTS } from '../../data/balance.js';
import { groupRecipes, recipeLabel } from '../../logic/crafting.js';
import { useStack, dropStack, unequip, eatSnow } from '../../systems/itemactions.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function iconEl(id, px, cls = 'icon') {
  const c = document.createElement('canvas'); c.width = c.height = 64; c.className = cls; c.style.width = c.style.height = `${px}px`;
  c.getContext('2d').drawImage(itemIcon(id), 0, 0); return c;
}
const iconHtml = (id, px) => `<canvas class="ico" width="64" height="64" data-ico="${id}" style="width:${px}px;height:${px}px"></canvas>`;
function paintIcons(root) { root.querySelectorAll('canvas[data-ico]').forEach((c) => { if (!c._p) { c._p = 1; c.getContext('2d').drawImage(itemIcon(c.dataset.ico), 0, 0); } }); }

const invSig = (st) => JSON.stringify([st.bag, st.hotbar, st.clothing, st.selected]);

export function renderInventoryPanel(game, body, payload = {}, ctl) {
  const st = game.state.inventory;
  let tab = payload.tab === 'craft' ? 'craft' : 'bag';
  let sel = null; // slot ref of the selected stack
  body.innerHTML = `
    <div class="tabs" role="tablist"><button class="tab" data-tab="bag" type="button">Bag</button><button class="tab" data-tab="craft" type="button">Craft</button></div>
    <div class="tab-bag inv">
      <div class="inv-label">Worn <span class="ins muted"></span></div><div class="inv-row clothing"></div>
      <div class="inv-label">Hotbar</div><div class="inv-row hotbar-row"></div>
      <div class="inv-label">Bag</div><div class="inv-grid"></div>
      <div class="detail" hidden></div>
    </div>
    <div class="tab-craft" hidden></div>`;
  const $ = (s) => body.querySelector(s);
  const bagTab = $('.tab-bag'), craftTab = $('.tab-craft'), detail = $('.detail'), insEl = $('.ins');

  const cells = [];
  const mk = (area, i, parent) => {
    const b = document.createElement('button'); b.className = 'slot'; b.type = 'button';
    if (area === 'clothing') b.dataset.hint = CLOTHING_SLOTS[i];
    b.dataset.area = area; b.dataset.i = i;
    b.addEventListener('click', () => {
      const r = inv.ref(area, i);
      sel = inv.getSlot(st, r) && !(sel && sel.a === area && sel.i === i) ? r : null;
      refreshBag(true);
    });
    parent.appendChild(b); cells.push({ b, area, i });
  };
  st.clothing.forEach((_, i) => mk('clothing', i, $('.clothing')));
  st.hotbar.forEach((_, i) => mk('hotbar', i, $('.hotbar-row')));
  st.bag.forEach((_, i) => mk('bag', i, $('.inv-grid')));

  // ---- detail card ----
  let detailSig = '';
  function renderDetail() {
    const s = sel && inv.getSlot(st, sel);
    if (!s) { sel = null; detail.hidden = true; detailSig = ''; return; }
    const sig = `${sel.a}${sel.i}|${s.id}:${s.n}:${s.dur ?? ''}`;
    if (sig === detailSig) return; detailSig = sig;
    const def = ITEMS[s.id], inHand = sel.a === 'hotbar', worn = sel.a === 'clothing';
    const chips = describeStats(def).map((c) => `<span class="chip2">${esc(c)}</span>`).join('');
    const durMax = def.tool?.dur;
    const durBar = s.dur !== undefined && durMax ? `<div class="durbar"><i style="width:${Math.max(0, Math.min(100, (s.dur / durMax) * 100))}%"></i><span>Durability ${Math.ceil(s.dur)} / ${durMax}</span></div>` : '';
    let primary = '';
    if (def.clothing) primary = worn ? '<button class="btn" data-a="unequip">Take off</button>' : '<button class="btn primary" data-a="use">Wear</button>';
    else if (def.tool || def.kind === 'weapon') primary = inHand ? (sel.i === st.selected ? '' : '<button class="btn primary" data-a="use">Hold</button>') : '<button class="btn primary" data-a="use">Equip</button>';
    else if (def.food) primary = `<button class="btn primary" data-a="use">${def.kind === 'drink' ? 'Drink' : def.kind === 'medical' ? 'Apply' : 'Eat'}</button>`;
    const hot = worn ? '' : `<div class="hotpick"><span class="muted small">Hotbar slot</span>${st.hotbar.map((_, i) => `<button class="hp${sel.a === 'hotbar' && sel.i === i ? ' cur' : ''}" data-hot="${i}" type="button">${i + 1}</button>`).join('')}</div>`;
    detail.hidden = false;
    detail.innerHTML = `<div class="d-head">${iconHtml(s.id, 44)}<div class="d-title"><b>${esc(def.name)}</b>${s.n > 1 ? ` <span class="muted">x${s.n}</span>` : ''}<div class="muted small">${esc(def.kind)}</div></div></div>
      <p class="d-desc">${esc(describe(s.id))}</p><div class="chips2">${chips}</div>${durBar}
      <div class="d-btns">${primary}${inHand ? '<button class="btn" data-a="tobag">To bag</button>' : ''}${s.n > 1 ? '<button class="btn" data-a="drop1">Drop 1</button>' : ''}<button class="btn" data-a="drop">${s.n > 1 ? 'Drop all' : 'Drop'}</button></div>${hot}`;
    paintIcons(detail);
  }
  detail.addEventListener('click', (e) => {
    const hot = e.target.closest('[data-hot]');
    if (hot && sel) {
      const to = inv.ref('hotbar', Number(hot.dataset.hot));
      if (inv.move(st, sel, to)) { sel = to; game.events.emit('hotbar:changed', { index: st.selected }); }
      refreshBag(true); return;
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a || !sel) return;
    const r = sel;
    if (a === 'use') { const was = inv.getSlot(st, r), def = ITEMS[was.id]; useStack(game, r); const now = inv.getSlot(st, r); if (!now || now.id !== was.id || def.tool || def.clothing) sel = null; }
    else if (a === 'unequip') { if (unequip(game, r)) sel = null; }
    else if (a === 'tobag') { const f = st.bag.findIndex((x) => x === null); if (f >= 0) { inv.move(st, r, inv.ref('bag', f)); sel = inv.ref('bag', f); } else game.ui.toast('Bag full', 'bad'); }
    else if (a === 'drop' || a === 'drop1') { dropStack(game, r, a === 'drop1' ? 1 : Infinity); }
    refreshBag(true);
  });

  function refreshBag(force) {
    for (const c of cells) {
      paintSlot(c.b, st[c.area][c.i]);
      c.b.classList.toggle('picked', !!sel && sel.a === c.area && sel.i === c.i);
      c.b.classList.toggle('sel', c.area === 'hotbar' && st.selected === c.i);
    }
    insEl.textContent = `warmth +${inv.insulation(st)}°C`;
    if (force) detailSig = '';
    renderDetail();
  }

  // ---- craft tab ----
  let craftSig = '';
  function renderCraft(force) {
    const stations = game.stationQuery ? game.stationQuery() : ['hand'];
    const sig = invSig(st) + stations.join();
    if (!force && sig === craftSig) return; craftSig = sig;
    const groups = groupRecipes(st, stations);
    const near = stations.filter((s) => s !== 'hand');
    let html = `<div class="snowrow"><div><b>Snow</b><div class="muted small">+8 thirst, -10 warmth</div></div><button class="btn" data-a="snow" type="button">Eat snow</button></div>
      <div class="muted small stations">${near.length ? `Nearby: ${near.join(', ')}` : 'No crafting station nearby (workbench, lit campfire, lit furnace)'}</div>`;
    for (const g of groups) {
      html += `<h3 class="grp">${esc(g.label)}</h3>`;
      for (const { recipe, status } of g.recipes) {
        const ing = recipe.in.map((x) => {
          const have = status.missing.find((m) => m.item === x.item)?.have ?? x.n;
          const ok = have >= x.n;
          return `<span class="need ${ok ? 'ok' : 'no'}">${iconHtml(x.item, 20)}${Math.min(have, 99)}/${x.n}</span>`;
        }).join('') + (recipe.tools || []).map((t) => `<span class="need tool ${status.missingTool.includes(t) ? 'no' : 'ok'}">${iconHtml(t, 20)}tool</span>`).join('');
        const note = status.ok ? '' : `<div class="r-note">${esc(status.reason)}</div>`;
        html += `<div class="recipe ${status.ok ? 'ok' : 'no'}">${iconHtml(recipe.out.item, 44)}<div class="r-main"><b>${esc(recipeLabel(recipe))}</b><div class="needs">${ing || '<span class="muted small">free</span>'}</div>${note}</div>
          <button class="btn craft" data-recipe="${recipe.id}" type="button" ${status.ok ? '' : 'disabled'}>Craft</button></div>`;
      }
    }
    craftTab.innerHTML = html; paintIcons(craftTab);
  }
  craftTab.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.recipe) { game.crafting.craft(b.dataset.recipe); renderCraft(true); }
    else if (b.dataset.a === 'snow') eatSnow(game);
  });

  function setTab(t) {
    tab = t;
    body.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    bagTab.hidden = t !== 'bag'; craftTab.hidden = t !== 'craft';
    if (t === 'craft') renderCraft(true); else refreshBag(true);
    body.scrollTop = 0;
  }
  body.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  setTab(tab);
  return { update() { if (tab === 'bag') refreshBag(false); else renderCraft(false); } };
}

export default { id: 'bag', title: 'Bag', modal: true, render: renderInventoryPanel };
