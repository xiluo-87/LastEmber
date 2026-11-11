// Screen-edge compass markers (DESIGN §10): wreckage sites (flight map / proximity) and the "home" campfire when off-screen.
// Data comes from game.endgame.markers() (systems/endgame.js, pure rules in logic/endgame.js). Also fades the HUD during the rescue.
const ICON = {
  wreck: '<svg viewBox="0 0 24 24"><path d="M22 11 15 10 11 3H8l2 7-5 1-2-3H1l1 4-1 4h2l2-3 5 1-2 7h3l4-7 7-1z" fill="currentColor"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 0-4-1-6 1-9.500z" fill="currentColor"/></svg>',
};

export function createCompass(game, root) {
  const layer = document.createElement('div'); layer.className = 'compass'; root.appendChild(layer);
  const pool = new Map();   // key -> { el, arrow, dist }
  const body = document.body;

  function upsert(m) {
    let e = pool.get(m.key);
    if (!e) {
      const el = document.createElement('div'); el.className = `cm ${m.kind}`;
      el.innerHTML = `<div class="cm-arrow"></div><div class="cm-badge">${ICON[m.kind] || ''}</div><b class="cm-dist"></b>`;
      layer.appendChild(el);
      e = { el, arrow: el.querySelector('.cm-arrow'), dist: el.querySelector('.cm-dist'), d: -1 };
      pool.set(m.key, e);
    }
    e.seen = true;
    e.el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
    e.arrow.style.transform = `rotate(${m.angle.toFixed(3)}rad)`;
    if (e.d !== m.dist) { e.d = m.dist; e.dist.textContent = `${m.dist} tiles`; }
    e.el.dataset.label = m.label;
  }

  const clearRescue = () => body.classList.remove('rescuing');
  game.events.on('rescue:arriving', () => body.classList.add('rescuing'));
  for (const e of ['game:new', 'game:loaded', 'game:title', 'game:over']) game.events.on(e, clearRescue);

  return {
    update() {
      for (const e of pool.values()) e.seen = false;
      if (game.mode === 'playing' && game.endgame && !game.endgame.rescue) for (const m of game.endgame.markers()) upsert(m);
      for (const [k, e] of pool) if (!e.seen) { e.el.remove(); pool.delete(k); }
    },
  };
}
