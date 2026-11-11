// Player sprite: 8 facing variants (0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE). Drawn small parka figure with hood.
import { registerSprite } from '../sprites.js';
import { shadow, ellipse, roundRect } from './util.js';

registerSprite('player', { w: 36, h: 44, ax: 18, ay: 38, variants: 8, draw(ctx, v) {
  const a = (v * Math.PI) / 4, fx = Math.cos(a), fy = Math.sin(a);
  const front = fy > -0.5; // facing toward camera (or sideways): face visible
  shadow(ctx, 18, 38, 12, 4.2, 0.36);
  // boots
  ellipse(ctx, 18 - 4 - fx * 1, 36 + fy * 0.6, 3.6, 2.6, '#2a2f3a'); ellipse(ctx, 18 + 4 - fx * 1, 36 + fy * 0.6, 3.6, 2.6, '#2a2f3a');
  // arms behind body (rendered first when facing away)
  const arm = (side) => ellipse(ctx, 18 + side * 9.2 + fx * 1.5, 25 + fy * 1.4, 3.3, 5, '#a63f2b', side * 0.15);
  if (!front) { arm(-1); arm(1); }
  // parka body
  const g = ctx.createLinearGradient(8, 14, 28, 36);
  g.addColorStop(0, '#e0654a'); g.addColorStop(1, '#a8402b');
  ctx.fillStyle = g; roundRect(ctx, 9.5, 17, 17, 19, 7); ctx.fill();
  ctx.strokeStyle = '#6e2616'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#2f3b4c'; ctx.fillRect(10, 29, 16, 2.2); // belt
  ctx.fillStyle = '#f2e9d0'; roundRect(ctx, 10, 34, 16, 2.6, 1.3); ctx.fill(); // fur hem
  if (front && Math.abs(fx) < 0.8) { ctx.fillStyle = '#f2e9d0'; ctx.fillRect(17, 19, 2, 11); } // zipper placket
  if (front) { arm(-1); arm(1); }
  // hood + head
  const hx = 18 + fx * 1.8, hy = 14 + fy * 1.2;
  ellipse(ctx, hx, hy, 8.6, 8.2, '#c2553a');
  ellipse(ctx, hx, hy - 0.5, 8.6, 8.2, 'rgba(0,0,0,0)');
  ctx.strokeStyle = '#6e2616'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(hx, hy, 8.6, 8.2, 0, 0, Math.PI * 2); ctx.stroke();
  if (front) { // face
    const fxp = hx + fx * 3.2, fyp = hy + 1.5 + fy * 1.8;
    ellipse(ctx, fxp, fyp, 5, 4.6, '#f1c9a5');
    ctx.fillStyle = '#2a2f3a'; const ex = fx * 1.2;
    if (Math.abs(fx) < 0.95) { ctx.fillRect(fxp - 2.6 + ex, fyp - 1.2, 1.4, 1.8); ctx.fillRect(fxp + 1.2 + ex, fyp - 1.2, 1.4, 1.8); }
    else ctx.fillRect(fxp + Math.sign(fx) * 1.4, fyp - 1.2, 1.4, 1.8);
  } else { ellipse(ctx, hx, hy - 1, 6, 5.4, '#b04a32'); }
  // fur trim around the hood
  ctx.strokeStyle = '#f2e9d0'; ctx.lineWidth = 2.2; ctx.beginPath();
  ctx.arc(hx, hy, 7.6, front ? a - 2.1 : 0, front ? a + 2.1 : Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(hx - 2.5, hy - 5, 3.2, 1.4, -0.4, 0, Math.PI * 2); ctx.fill(); // highlight
} });
