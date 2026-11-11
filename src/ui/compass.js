// Screen-edge compass markers (DESIGN §10): wreckage sites (flight map / proximity) and the "home" campfire when off-screen.
// Data comes from game.endgame.markers() (systems/endgame.js, pure rules in logic/endgame.js). Also fades the HUD during the rescue.
const ICON = {
  wreck: '<svg viewBox="0 0 24 24"><path d="M22 11 15 10 11 3H8l2 7-5 1-2-3H1l1 4-1 4h2l2-3 5 1-2 7h3l4-7 7-1z" fill="currentColor"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 0-4-1-6 1-9.500z" fill="currentColor"/></svg>',
};

// Markers slide along the screen-edge rectangle so they never sit on HUD controls or on each other.
const OBSTACLES = '.hud-stats .bar, .hud-stats .objective, .hud-stats .chips, .hud-top .pill, .hud-pause, .toast, .banner:not([hidden]), .hotbar, .tbtn, .hint:not([hidden]), #debug';
const BOX = { l: -40, t: -22, r: 40, b: 36 };   // marker footprint around its anchor (badge, arrow, distance label)
const hit = (a, x, y, m = 0) => x + BOX.r + m > a.x0 && x + BOX.l - m < a.x1 && y + BOX.b + m > a.y0 && y + BOX.t - m < a.y1;

export function createCompass(game, root) {
  const layer = document.createElement('div'); layer.className = 'compass'; root.appendChild(layer);
  const pool = new Map();   // key -> { el, arrow, dist }
  const body = document.body;
  let rects = [], rectT = 0;
  function refreshRects() {
    rects = [];
    for (const el of document.querySelectorAll(OBSTACLES)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
  }
  /** Slide the marker along the edge rectangle until its footprint is clear of every obstacle and of earlier markers. */
  function resolve(m, placed) {
    const v = game.view;
    const l = -BOX.l, r = v.w + BOX.l, t = -BOX.t + 6, b = v.h - BOX.b - 2, W = r - l, H = b - t, per = 2 * (W + H);   // the whole badge + label stays on screen
    m.x = Math.min(r, Math.max(l, m.x)); m.y = Math.min(b, Math.max(t, m.y));
    const free = (x, y) => !rects.some((a) => hit(a, x, y)) && !placed.some((q) => hit({ x0: q.x + BOX.l, y0: q.y + BOX.t, x1: q.x + BOX.r, y1: q.y + BOX.b }, x, y, 4));
    if (W <= 0 || H <= 0 || free(m.x, m.y)) return;
    // perimeter coordinate (clockwise from the top-left corner)
    const cx = Math.min(r, Math.max(l, m.x)), cy = Math.min(b, Math.max(t, m.y));
    const dTop = cy - t, dBot = b - cy, dL = cx - l, dR = r - cx, dm = Math.min(dTop, dBot, dL, dR);
    const u0 = dm === dTop ? cx - l : dm === dR ? W + (cy - t) : dm === dBot ? W + H + (r - cx) : 2 * W + H + (b - cy);
    const at = (u) => { u = ((u % per) + per) % per; return u < W ? [l + u, t] : u < W + H ? [r, t + u - W] : u < 2 * W + H ? [r - (u - W - H), b] : [l, b - (u - 2 * W - H)]; };
    for (let k = 6; k <= per / 2; k += 6) for (const s of [1, -1]) {
      const [x, y] = at(u0 + s * k);
      if (free(x, y)) { m.x = x; m.y = y; return; }
    }
  }

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
      if (game.mode === 'playing' && game.endgame && !game.endgame.rescue) {
        if (!rects.length || ++rectT % 8 === 0) refreshRects();
        const placed = [];
        for (const m of game.endgame.markers().slice().sort((a, b) => (a.key < b.key ? -1 : 1))) { resolve(m, placed); placed.push(m); upsert(m); }
      }
      for (const [k, e] of pool) if (!e.seen) { e.el.remove(); pool.delete(k); }
    },
  };
}
