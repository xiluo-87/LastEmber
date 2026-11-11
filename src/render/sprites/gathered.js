// Leftovers of gathering: tree stump, rubble, and the placeholder silhouette used to outline dropped items.
import { registerSprite } from '../sprites.js';
import { shadow, ellipse, tinyRock } from './util.js';

registerSprite('stump', { w: 40, h: 36, ax: 20, ay: 28, variants: 2, draw(ctx, v) {
  shadow(ctx, 21, 28, 12, 4.5, 0.3);
  ctx.fillStyle = '#5b3a1e'; ctx.beginPath(); ctx.ellipse(20, 24, 9.5, 4, 0, 0, Math.PI); ctx.lineTo(10.5, 16); ctx.lineTo(29.5, 16); ctx.fill();
  ctx.fillStyle = '#7a5230'; ctx.fillRect(10.5, 16, 5, 8.5);
  ellipse(ctx, 20, 16, 9.5, 4, '#d9b383');
  ctx.strokeStyle = '#b98a55'; ctx.lineWidth = 0.9;
  for (const r of [6, 3.2]) { ctx.beginPath(); ctx.ellipse(20, 16, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); }
  ellipse(ctx, 20, 12.5, 6.5, 2, '#f2f7fb'); // snow cap
  if (v) ellipse(ctx, 29, 26, 3, 1.4, '#e8eef4');
} });

registerSprite('rubble', { w: 40, h: 32, ax: 20, ay: 24, variants: 2, draw(ctx, v, rng) {
  shadow(ctx, 21, 24, 13, 4.5, 0.28);
  tinyRock(ctx, 15, 19, 4.2, rng, '#7b8492'); tinyRock(ctx, 24, 21, 3.2, rng, '#6b7280'); tinyRock(ctx, 20, 17, 2.6, rng, '#8a93a0');
  if (v) tinyRock(ctx, 29, 20, 2.4, rng, '#78818e');
  ellipse(ctx, 18, 15, 5, 1.3, '#f2f7fb');
} });

registerSprite('dropped_item', { w: 28, h: 22, ax: 14, ay: 18, draw(ctx) { shadow(ctx, 14, 18, 9, 3.2, 0.12); } });
