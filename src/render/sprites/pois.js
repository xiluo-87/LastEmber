// Points of interest: crash-site crate, wreckage (3 variants), bear den.
import { registerSprite } from '../sprites.js';
import { PAL, shadow, ellipse, smoothPoly, roundRect, boulder } from './util.js';

function crate(ctx, x, y, s) {
  ctx.fillStyle = '#7a5230'; roundRect(ctx, x, y, s, s * 0.85, 2); ctx.fill();
  ctx.strokeStyle = '#4e3320'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = '#a77848'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 1.5, y + s * 0.3); ctx.lineTo(x + s - 1.5, y + s * 0.3); ctx.moveTo(x + 1.5, y + s * 0.6); ctx.lineTo(x + s - 1.5, y + s * 0.6); ctx.stroke();
  ctx.fillStyle = '#e6c27a'; ctx.fillRect(x + s / 2 - 1.5, y + s * 0.35, 3, 3);
  ctx.fillStyle = 'rgba(247,250,252,0.95)'; ctx.beginPath(); ctx.ellipse(x + s * 0.4, y + 1, s * 0.5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
}
function metalPanel(ctx, pts, base = '#c9d3df', edge = '#6b7787') {
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
  g.addColorStop(0, '#e8eef5'); g.addColorStop(1, base);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();
}
function snowDrift(ctx, x, y, rx, ry) { ctx.fillStyle = 'rgba(247,250,252,0.96)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

registerSprite('crash_site', { w: 72, h: 60, ax: 36, ay: 50, draw(ctx) {
  shadow(ctx, 38, 50, 28, 8, 0.33);
  // torn fuselage chunk
  metalPanel(ctx, [[8, 44], [14, 22], [40, 14], [50, 34], [44, 46]], '#bfcad8');
  ctx.fillStyle = '#d1495b'; ctx.beginPath(); ctx.moveTo(13, 30); ctx.lineTo(44, 24); ctx.lineTo(46, 31); ctx.lineTo(12, 37); ctx.fill(); // livery stripe
  ctx.fillStyle = '#26323f'; ctx.beginPath(); ctx.ellipse(27, 22, 5.5, 3.6, -0.2, 0, Math.PI * 2); ctx.fill(); // window
  ctx.strokeStyle = '#3b4655'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(14, 22); ctx.lineTo(18, 16); ctx.lineTo(24, 20); ctx.stroke(); // ragged tear
  ctx.fillStyle = 'rgba(30,30,36,0.55)'; ctx.beginPath(); ctx.ellipse(46, 42, 9, 4, 0, 0, Math.PI * 2); ctx.fill(); // scorch
  crate(ctx, 44, 30, 18);
  snowDrift(ctx, 22, 17, 12, 3); snowDrift(ctx, 55, 46, 9, 2.6);
} });

registerSprite('wreckage', { w: 84, h: 64, ax: 42, ay: 52, variants: 3, draw(ctx, v, rng) {
  shadow(ctx, 42, 52, 32, 8, 0.34);
  ctx.fillStyle = 'rgba(25,25,30,0.5)'; ctx.beginPath(); ctx.ellipse(40, 48, 26, 6, 0, 0, Math.PI * 2); ctx.fill(); // scorch
  if (v === 0) { // wing
    metalPanel(ctx, [[6, 40], [20, 18], [70, 26], [78, 44]], '#c3ceda');
    ctx.fillStyle = '#d1495b'; ctx.fillRect(58, 28, 14, 7);
    ctx.strokeStyle = '#6b7787'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(30, 22); ctx.lineTo(24, 40); ctx.moveTo(48, 24); ctx.lineTo(44, 42); ctx.stroke();
  } else if (v === 1) { // tail
    metalPanel(ctx, [[10, 46], [18, 36], [60, 34], [70, 48]], '#bfcad8');
    metalPanel(ctx, [[52, 36], [60, 8], [70, 10], [68, 36]], '#d6dee8');
    ctx.fillStyle = '#d1495b'; ctx.fillRect(60, 14, 8, 9);
  } else { // engine + prop
    metalPanel(ctx, [[12, 44], [16, 26], [44, 22], [52, 42]], '#b6c2d0');
    boulder(ctx, 58, 36, 9, '#4b5563', '#76828f', '#2a313b', rng, false);
    ctx.strokeStyle = '#8c98a6'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(44, 16); ctx.lineTo(70, 26); ctx.stroke();
  }
  ctx.fillStyle = '#e6c27a'; ctx.fillRect(34, 26, 4, 4); // salvage marker glint
  snowDrift(ctx, 22, 40, 14, 3.4); snowDrift(ctx, 58, 47, 12, 3); snowDrift(ctx, 40, 22 + v * 2, 10, 2.4);
} });

registerSprite('bear_den', { w: 84, h: 64, ax: 42, ay: 54, draw(ctx, v, rng) {
  shadow(ctx, 42, 54, 34, 9, 0.36);
  boulder(ctx, 42, 34, 29, '#69727f', '#9aa4b1', '#3b4350', rng);
  boulder(ctx, 18, 42, 12, '#6b7280', '#929cab', '#3f4856', rng);
  boulder(ctx, 68, 42, 12, '#6b7280', '#929cab', '#3f4856', rng);
  const g = ctx.createRadialGradient(42, 46, 2, 42, 44, 17);
  g.addColorStop(0, '#05070a'); g.addColorStop(1, '#161c25');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(26, 52); ctx.quadraticCurveTo(26, 28, 42, 28); ctx.quadraticCurveTo(58, 28, 58, 52); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2b323d'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#e8e3d3'; for (const [x, y] of [[32, 53], [50, 54], [58, 51]]) { ctx.fillRect(x, y - 1, 5, 1.8); } // scattered bones
  snowDrift(ctx, 42, 16, 15, 4);
} });
