// Title screen: name, premise, animated falling snow + flickering ember glow (canvas), New game / Continue (Day N) / How to play / mute.
// New game over an existing save asks first. The animation only runs while the title is visible.
import { audio } from '../audio.js';
import { load as loadSave } from '../save.js';

export function createTitle(game, root) {
  root.innerHTML = `<canvas class="title-bg" aria-hidden="true"></canvas>
    <div class="title-card"><div class="logo"><h1>LAST EMBER</h1></div>
    <p class="tag">Your plane is down in the snow. Keep the fire alive until rescue comes.</p>
    <div class="stack title-menu"><button id="btn-continue" class="btn primary" type="button">Continue</button>
    <button id="btn-new" class="btn" type="button">New game</button>
    <button id="btn-how" class="btn" type="button">How to play</button></div>
    <div class="title-confirm" hidden><p>Start a new game? Your saved run (<b class="tc-day">Day 1</b>) will be lost.</p>
      <div class="stack"><button class="btn danger" id="btn-new-yes" type="button">Start new game</button><button class="btn" id="btn-new-no" type="button">Cancel</button></div></div>
    <button class="title-mute" id="btn-mute" type="button" aria-label="Toggle sound"></button>
    <p class="muted small title-keys">WASD move &middot; Shift sprint &middot; Space action &middot; E interact &middot; I bag &middot; B build</p></div>`;
  const $ = (s) => root.querySelector(s);
  const cont = $('#btn-continue'), nu = $('#btn-new'), how = $('#btn-how'), menu = $('.title-menu'), confirm = $('.title-confirm'), mute = $('#btn-mute');
  const cv = $('.title-bg'), g = cv.getContext('2d');
  const muteLabel = () => { mute.textContent = audio.muted ? 'Sound: off' : 'Sound: on'; };
  let raf = 0, flakes = [], sparks = [], W = 0, H = 0, dpr = 1, last = 0;

  function dayOfSave() { try { return loadSave(game.storage)?.time?.day ?? null; } catch { return null; } }
  const refresh = () => {
    const has = game.hasSave();
    cont.hidden = !has; nu.classList.toggle('primary', !has);
    if (has) { const d = dayOfSave(); cont.textContent = d ? `Continue · Day ${d}` : 'Continue'; $('.tc-day').textContent = d ? `Day ${d}` : 'a previous run'; }
    menu.hidden = false; confirm.hidden = true;
    root.hidden = game.mode !== 'title';
    document.body.classList.toggle('mode-title', game.mode === 'title');
    document.body.classList.toggle('mode-playing', game.mode === 'playing');
    muteLabel();
    if (game.mode === 'title') startAnim(); else stopAnim();
  };

  // ---- background animation
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = root.clientWidth || window.innerWidth; H = root.clientHeight || window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const n = Math.round(Math.min(160, (W * H) / 6000));
    while (flakes.length < n) flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 2, v: 18 + Math.random() * 46, ph: Math.random() * 6.28 });
    flakes.length = n;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = now / 1000, dt = Math.min(0.05, last ? t - last : 0.016); last = t;
    if (!W || W !== (root.clientWidth || window.innerWidth)) size();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0a1018'); sky.addColorStop(1, '#1a2431');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // ember glow: layered flicker
    const cx = W / 2, cy = H * 0.27, fl = 0.85 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 17.1 + 1) + 0.05 * Math.sin(t * 3.1);
    const R = Math.max(W, H) * 0.5 * fl;
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    glow.addColorStop(0, 'rgba(255,159,28,0.34)'); glow.addColorStop(0.35, 'rgba(231,29,54,0.13)'); glow.addColorStop(1, 'rgba(16,24,32,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // snowy ground line + the ember itself
    g.fillStyle = 'rgba(210,222,235,0.07)'; g.beginPath(); g.ellipse(cx, H + 20, W * 0.8, H * 0.32, 0, 0, 6.29); g.fill();
    const flame = g.createRadialGradient(cx, cy, 0, cx, cy, 26 * fl);
    flame.addColorStop(0, 'rgba(255,230,160,0.95)'); flame.addColorStop(0.4, 'rgba(255,159,28,0.8)'); flame.addColorStop(1, 'rgba(231,29,54,0)');
    g.fillStyle = flame; g.beginPath(); g.ellipse(cx, cy, 15 * fl, 24 * fl, 0, 0, 6.29); g.fill();
    // rising sparks
    if (Math.random() < dt * 9 && sparks.length < 40) sparks.push({ x: cx + (Math.random() - 0.5) * 24, y: cy, vx: (Math.random() - 0.5) * 18, vy: -(26 + Math.random() * 40), life: 0, max: 1.6 + Math.random() * 1.4 });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life += dt; s.x += (s.vx + Math.sin(s.life * 4) * 8) * dt; s.y += s.vy * dt;
      if (s.life > s.max) { sparks.splice(i, 1); continue; }
      const a = 1 - s.life / s.max; g.fillStyle = `rgba(255,${Math.round(150 + 80 * a)},60,${(a * 0.9).toFixed(2)})`; g.fillRect(s.x, s.y, 2, 2);
    }
    // falling snow
    g.fillStyle = 'rgba(240,247,255,0.8)';
    for (const f of flakes) {
      f.y += f.v * dt; f.x += Math.sin(t * 0.8 + f.ph) * 14 * dt + 8 * dt;
      if (f.y > H + 4) { f.y = -4; f.x = Math.random() * W; } if (f.x > W + 4) f.x = -4;
      g.globalAlpha = 0.35 + f.r / 3; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 6.29); g.fill();
    }
    g.globalAlpha = 1;
  }
  function startAnim() { if (!raf && typeof requestAnimationFrame !== 'undefined') { last = 0; size(); raf = requestAnimationFrame(frame); } }
  function stopAnim() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  // ---- actions
  const on = (el, fn) => el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
  on(cont, () => { if (game.loadGame()) refresh(); });
  on(nu, () => { if (game.hasSave()) { menu.hidden = true; confirm.hidden = false; } else { game.newGame(); refresh(); } });
  on($('#btn-new-yes'), () => { game.newGame(); refresh(); });
  on($('#btn-new-no'), () => { menu.hidden = false; confirm.hidden = true; });
  on(how, () => game.ui.panels.open('howto'));
  on(mute, () => { audio.toggleMuted(); muteLabel(); });
  for (const evt of ['game:new', 'game:loaded', 'game:title', 'game:over']) game.events.on(evt, refresh);
  window.addEventListener('resize', () => { if (game.mode === 'title') size(); });
  refresh();
  return { refresh };
}
