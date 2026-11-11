// Small drawing helpers shared by sprite modules.
export const PAL = {
  snow: '#e8eef4', snow2: '#d5dfe9', snowHi: '#f7fafc', shade: '#8a9bb0', pine: '#1f4037', pine2: '#2f5d50', rock: '#6b7280', wood: '#8b5a2b',
  fire: '#ff9f1c', fire2: '#ffbf69', fire3: '#e71d36', ui: '#101820', text: '#f4f1de', danger: '#e63946', good: '#7bd389',
};

export function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Soft elliptical ground shadow. */
export function shadow(ctx, x, y, rx, ry, alpha = 0.28) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(70,88,115,${alpha})`); g.addColorStop(0.65, `rgba(70,88,115,${alpha * 0.7})`); g.addColorStop(1, 'rgba(70,88,115,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
}

/** Smooth closed blob through points (quadratic midpoints). */
export function smoothPoly(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Irregular rounded boulder with light top, dark bottom and a snow cap. Returns nothing. */
export function boulder(ctx, cx, cy, r, base, hi, lo, rng, snow = true) {
  const n = 9, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r * (0.82 + rng() * 0.3);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82]);
  }
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, hi); g.addColorStop(0.5, base); g.addColorStop(1, lo);
  ctx.fillStyle = g; smoothPoly(ctx, pts); ctx.fill();
  ctx.strokeStyle = 'rgba(20,28,40,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  if (snow) { // cap: upper cap of the blob
    ctx.save(); smoothPoly(ctx, pts); ctx.clip();
    ctx.fillStyle = PAL.snowHi; ctx.beginPath();
    ctx.ellipse(cx - r * 0.1, cy - r * 0.55, r * 0.95, r * 0.5, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,205,225,0.7)'; ctx.beginPath();
    ctx.ellipse(cx + r * 0.1, cy - r * 0.38, r * 0.7, r * 0.2, -0.1, 0, Math.PI); ctx.fill();
    ctx.restore();
  }
}

export function tinyRock(ctx, x, y, r, rng, col = '#7b8492') {
  boulder(ctx, x, y, r, col, '#aab3bf', '#4b5563', rng, true);
}
