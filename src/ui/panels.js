// Generic panel manager. Panels are DOM overlays (scrollable, one-thumb friendly).
//   panels.register('craft', {
//     title: 'Crafting', modal: true (blocks game input, default true), pauses: false (pause the simulation while open),
//     render(game, body, payload, ctl) { ...build DOM into `body`...; return { update?(), destroy?() } }   // ctl: { close(), setTitle(t) }
//   })
//   panels.open(id, payload) / close(id) / toggle(id) / closeAll() / isOpen(id) / modalOpen() / topId()
// Register definitions by appending to src/ui/panels/index.js. Events: 'panel:open' {id}, 'panel:close' {id}.
export function createPanels(game, root) {
  const defs = new Map();
  const open = new Map(); // id -> { el, inst, def }

  const api = {
    register(id, def) { defs.set(id, { modal: true, pauses: false, ...def, id }); },
    isOpen: (id) => open.has(id),
    anyOpen: () => open.size > 0,
    modalOpen() { for (const { def } of open.values()) if (def.modal) return true; return false; },
    topId() { let t = null; for (const id of open.keys()) t = id; return t; },
    open(id, payload) {
      const def = defs.get(id);
      if (!def) { console.warn(`[panels] unknown panel "${id}"`); return false; }
      if (open.has(id)) api.close(id);
      const el = document.createElement('div');
      el.className = `panel-backdrop${def.modal ? ' modal' : ''}`;
      el.innerHTML = `<section class="panel panel-${id}" role="dialog" aria-label="${def.title || id}">
        <header><h2></h2><button class="x" type="button" aria-label="Close">&times;</button></header><div class="panel-body"></div></section>`;
      const titleEl = el.querySelector('h2'); titleEl.textContent = def.title || id;
      const ctl = { close: () => api.close(id), setTitle: (t) => { titleEl.textContent = t; } };
      el.querySelector('.x').addEventListener('click', ctl.close);
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === el && def.dismissOnBackdrop !== false) ctl.close(); });
      root.appendChild(el);
      const inst = def.render?.(game, el.querySelector('.panel-body'), payload, ctl) || {};
      open.set(id, { el, inst, def });
      if (def.modal) game.input.releaseAll?.();
      if (def.pauses) game.pause();
      game.events.emit('panel:open', { id });
      return true;
    },
    close(id) {
      const p = open.get(id); if (!p) return;
      open.delete(id);
      try { p.inst.destroy?.(); } catch (e) { console.error(e); }
      p.el.remove();
      if (p.def.pauses && ![...open.values()].some((o) => o.def.pauses)) game.resume();
      game.events.emit('panel:close', { id });
    },
    toggle(id, payload) { if (open.has(id)) api.close(id); else api.open(id, payload); },
    closeAll() { for (const id of [...open.keys()]) api.close(id); },
    update() { for (const { inst } of open.values()) inst.update?.(); },
  };
  return api;
}
