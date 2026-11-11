// HUD skeleton (DOM): 5 stat bars, day/clock/temperature/weather pill, status chips, toasts, banner, objective, target hint.
import { SURVIVAL } from '../data/balance.js';

const ICONS = {
  health: '<path d="M12 21s-7-4.6-9.3-9.2C1.2 8.6 3 5 6.4 5c2 0 3.6 1.1 5.6 3.3C14 6.1 15.600 5 17.600 5 21 5 22.800 8.600 21.300 11.800 19 16.400 12 21 12 21z"/>',
  hunger: '<path d="M15 3c3 0 6 2.500 6 5.500S18 14 15.500 14L11 18.500a2.100 2.100 0 1 1-3-3L12.500 11C12.500 6 12 3 15 3z"/><circle cx="6" cy="19" r="2"/>',
  thirst: '<path d="M12 2.500s6.500 7 6.500 11.500a6.500 6.500 0 0 1-13 0C5.500 9.500 12 2.500 12 2.500z"/>',
  warmth: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 0-4-1-6 1-9.500z"/>',
  stamina: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
};
const STATS = [
  ['health', '#e63946'], ['hunger', '#e9a23b'], ['thirst', '#4aa3df'], ['warmth', '#ff7a45'], ['stamina', '#7bd389'],
];
const WEATHER_ICON = { clear: '', snow: '*', blizzard: '**' };
/** Status-effect chip labels: statuses[id] = { label, color }. Systems can add: import { STATUS_DEFS } and assign. */
export const STATUS_DEFS = {
  bleeding: { label: 'Bleeding', color: '#e63946' }, poison: { label: 'Poisoned', color: '#8fbf5a' },
  sleeping: { label: 'Sleeping', color: '#4aa3df' },
};

export function createHud(game, root) {
  root.innerHTML = `
    <div class="hud-stats">${STATS.map(([k, c]) => `<div class="bar" data-k="${k}" style="--c:${c}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><div class="track"><div class="fill"></div></div></div>`).join('')}
      <div class="chips"></div><div class="objective" hidden></div></div>
    <div class="hud-top"><div class="pill"><span class="day">Day 1</span>
      <svg class="dial" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="dial-bg"/><path class="dial-day" d=""/><line class="dial-hand" x1="18" y1="18" x2="18" y2="6"/></svg>
      <span class="clock">06:00</span><span class="temp">-4&deg;C</span><span class="wx"></span></div></div>
    <button class="hud-pause" type="button" aria-label="Pause">II</button>
    <div class="banner" hidden></div><div class="toasts"></div><div class="hint" hidden></div>`;
  const $ = (s) => root.querySelector(s);
  const bars = Object.fromEntries(STATS.map(([k]) => [k, { el: $(`.bar[data-k="${k}"]`), fill: $(`.bar[data-k="${k}"] .fill`), v: -1 }]));
  const dayEl = $('.day'), clockEl = $('.clock'), tempEl = $('.temp'), wxEl = $('.wx'), hand = $('.dial-hand'), dialDay = $('.dial-day');
  const chips = $('.chips'), obj = $('.objective'), banner = $('.banner'), toasts = $('.toasts'), hint = $('.hint');
  $('.hud-pause').addEventListener('pointerdown', (e) => { e.stopPropagation(); game.ui.panels.open('pause'); });

  let lastChips = '', lastHint = '', lastDial = '';
  const api = {
    toast(msg, kind = 'info', ms = 2600) {
      const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
      toasts.appendChild(t);
      while (toasts.children.length > 4) toasts.firstChild.remove();
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
    },
    setBanner(text, kind = 'warn') { banner.hidden = !text; banner.textContent = text || ''; banner.dataset.kind = kind; },
    setObjective(text) { obj.hidden = !text; obj.textContent = text ? `▸ ${text}` : ''; },
    update() {
      const st = game.state; if (!st) return;
      const p = st.player;
      for (const [k] of STATS) {
        const b = bars[k], v = Math.max(0, Math.min(100, Math.round(p[k])));
        if (b.v !== v) { b.v = v; b.fill.style.width = `${v}%`; b.el.classList.toggle('low', v < SURVIVAL.warnBelow); }
      }
      const t = st.time; if (!t) return;
      dayEl.textContent = `Day ${t.day}`; clockEl.textContent = t.clock;
      tempEl.textContent = `${Math.round(t.ambient + (st.weather?.offset || 0))}°C`;
      wxEl.textContent = WEATHER_ICON[st.weather?.type] || '';
      hand.setAttribute('transform', `rotate(${(t.t / 480) * 360} 18 18)`);
      const dl = 480 - Math.min(300, 180 + 6 * (t.day - 1)), end = (dl / 480) * Math.PI * 2 - Math.PI / 2;
      const d = `M18 18 L18 3 A15 15 0 ${dl / 480 > 0.5 ? 1 : 0} 1 ${(18 + 15 * Math.cos(end)).toFixed(2)} ${(18 + 15 * Math.sin(end)).toFixed(2)} Z`;
      if (d !== lastDial) { lastDial = d; dialDay.setAttribute('d', d); }
      const cs = Object.keys(p.status || {}).map((k) => `${k}`).join(',');
      if (cs !== lastChips) {
        lastChips = cs;
        chips.innerHTML = Object.keys(p.status || {}).map((k) => { const d = STATUS_DEFS[k] || { label: k, color: '#ccc' }; return `<span class="chip" style="--c:${d.color}">${d.label}</span>`; }).join('');
      }
      const tg = game.target, h = tg ? `${tg.verb || 'Use'} · ${tg.name}` : '';
      if (h !== lastHint) { lastHint = h; hint.hidden = !h; hint.textContent = h; }
    },
  };
  return api;
}
