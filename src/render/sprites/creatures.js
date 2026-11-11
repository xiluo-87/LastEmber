// Procedural creature sprites (DESIGN §9, §12). All sprites face RIGHT; the renderer mirrors for left.
// Each registered name has `frames` animation frames; variants [frames..2*frames) are the white "hurt flash" versions.
//   rabbit  frames: 0 sit, 1 hop-stretch, 2 hop-up              deer   frames: 0-3 walk cycle
//   wolf    frames: 0-3 trot, 4 crouch (telegraph), 5 lunge, 6 feeding   bear  frames: 0-3 lumber, 4 rear-up (windup)
//   carcass variants: 0 rabbit, 1 deer, 2 wolf, 3 bear          arrow (rotated at draw time)
import { registerSprite } from '../sprites.js';
import { shadow, ellipse, smoothPoly } from './util.js';

const OUT = 'rgba(28,34,46,0.6)';

function outlineEllipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
}
function limb(ctx, x0, y0, x1, y1, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
/** Leg with a knee bend: hip (x,y) -> foot (fx,fy). */
function leg(ctx, hx, hy, fx, fy, w, col, kneeDir = 1) {
  const mx = (hx + fx) / 2 + kneeDir * 1.6, my = (hy + fy) / 2;
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(mx, my); ctx.lineTo(fx, fy); ctx.stroke();
}
function tri(ctx, ax, ay, bx, by, cx, cy, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
}

/** Register `name` with N frames + N flash frames. paint(ctx, frame) draws the animal (no flash handling). */
function creature(name, w, h, ax, ay, frames, paint) {
  registerSprite(name, {
    w, h, ax, ay, variants: frames * 2,
    draw(ctx, v) {
      const flash = v >= frames, f = v % frames;
      paint(ctx, f);
      if (flash) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
    },
  });
}

// ------------------------------------------------------------------ rabbit
creature('rabbit', 28, 24, 14, 20, 3, (ctx, f) => {
  const fur = '#e4dfd4', fur2 = '#bdb3a2', hop = f === 2 ? -3 : 0, st = f === 1 ? 2 : 0;
  shadow(ctx, 14, 20, f === 0 ? 8 : 7, 2.6, 0.3);
  const by = 14 + hop;
  // haunch + back leg
  ellipse(ctx, 10 - st, by + 1, 5.6, 5, fur2);
  outlineEllipse(ctx, 12 - st * 0.4, by, 7, 5.4, fur);
  // tail
  ellipse(ctx, 4.6 - st, by - 0.5, 2.4, 2.4, '#fbfaf6');
  // front legs
  if (f === 1) limb(ctx, 19, by + 2, 23, by + 4, 2, fur2); else limb(ctx, 18, by + 3, 19, 19, 2, fur2);
  // head
  outlineEllipse(ctx, 20 + st * 0.5, by - 3, 4.3, 3.9, fur);
  ellipse(ctx, 24, by - 2, 2, 1.6, '#f3efe6');
  ellipse(ctx, 25.6, by - 2.4, 0.9, 0.8, '#d98a8a');
  // ears (long, upright; stretched back on a hop)
  const ea = f === 1 ? -0.7 : -0.12;
  ctx.save(); ctx.translate(19, by - 6); ctx.rotate(ea);
  outlineEllipse(ctx, 0, -4.2, 1.6, 4.6, fur); ellipse(ctx, 0, -4, 0.8, 3.2, '#e6b0b0'); ctx.restore();
  ctx.save(); ctx.translate(21.4, by - 6); ctx.rotate(ea + 0.25);
  outlineEllipse(ctx, 0, -3.8, 1.5, 4.2, fur2); ctx.restore();
  ellipse(ctx, 22, by - 4, 0.9, 0.9, '#20242c');
});

// ------------------------------------------------------------------ deer
creature('deer', 60, 54, 30, 47, 4, (ctx, f) => {
  const hide = '#b58757', hide2 = '#8e6641', dark = '#5d4128';
  const ph = (f / 4) * Math.PI * 2, bob = Math.abs(Math.sin(ph)) * -0.8;
  shadow(ctx, 30, 47, 21, 4.2, 0.3);
  // legs: far pair darker
  const sw = (a) => Math.sin(ph + a) * 6, lift = (a) => Math.max(0, Math.cos(ph + a)) * 3;
  const hipR = 17, hipF = 40, hy = 30 + bob;
  leg(ctx, hipR + 1.5, hy, hipR + 1.5 + sw(Math.PI), 47 - lift(Math.PI), 2.4, dark, -1);
  leg(ctx, hipF + 1.5, hy, hipF + 1.5 + sw(0), 47 - lift(0), 2.4, dark, -1);
  // body
  outlineEllipse(ctx, 28, 28 + bob, 17, 9, hide);
  ellipse(ctx, 27, 33 + bob, 13, 4, '#e2cba6');
  ellipse(ctx, 28, 24 + bob, 12, 3.4, hide2);
  // near legs
  leg(ctx, hipR, hy + 1, hipR + sw(0), 47 - lift(0), 2.8, hide2, -1);
  leg(ctx, hipF, hy + 1, hipF + sw(Math.PI), 47 - lift(Math.PI), 2.8, hide2, -1);
  // tail tuft
  tri(ctx, 11.5, 22 + bob, 8, 25 + bob, 12, 29 + bob, '#f1e4cc');
  // neck + head
  ctx.fillStyle = hide; smoothPoly(ctx, [[38, 22 + bob], [43, 12 + bob], [47, 12 + bob], [45, 25 + bob]]); ctx.fill();
  outlineEllipse(ctx, 48.5, 11.5 + bob, 5.2, 4, hide, 0.25);
  outlineEllipse(ctx, 53, 13 + bob, 3.2, 2.2, '#cfae84', 0.3);
  ellipse(ctx, 56, 13.4 + bob, 1.1, 1, '#2a2018');
  ellipse(ctx, 49.2, 10.3 + bob, 0.9, 0.9, '#171717');
  // ears + antlers
  tri(ctx, 44.5, 9 + bob, 41.5, 4 + bob, 47, 8 + bob, hide2);
  ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(47, 7 + bob); ctx.lineTo(46, 0 + bob); ctx.moveTo(46.4, 3 + bob); ctx.lineTo(43, 0.5 + bob); ctx.moveTo(46.2, 1.5 + bob); ctx.lineTo(49.5, 0 + bob); ctx.stroke();
});

// ------------------------------------------------------------------ wolf
creature('wolf', 64, 40, 32, 34, 7, (ctx, f) => {
  const fur = '#7d8696', furD = '#4a5361', furL = '#b1b9c4', dark = '#363d49';
  const crouch = f === 4, lunge = f === 5, feed = f === 6;
  const ph = (f < 4 ? f / 4 : 0) * Math.PI * 2;
  const low = crouch ? 6 : feed ? 3 : 0, bob = f < 4 ? Math.abs(Math.sin(ph)) * -0.9 : 0;
  shadow(ctx, 31, 34, 22 + (lunge ? 4 : 0), 4.2, 0.32);
  const hy = 22 + low + bob, hipR = lunge ? 14 : 17, hipF = lunge ? 38 : 35;
  const sw = (a) => (lunge ? (a ? -9 : 10) : crouch || feed ? 0 : Math.sin(ph + a) * 7);
  const lf = (a) => (crouch || feed || lunge ? 0 : Math.max(0, Math.cos(ph + a)) * 3.5);
  // far legs
  leg(ctx, hipR + 2, hy, hipR + 2 + sw(Math.PI), 34 - lf(Math.PI), 2.6, dark, -1);
  leg(ctx, hipF + 2, hy, hipF + 2 + sw(0), 34 - lf(0), 2.6, dark, -1);
  // tail
  ctx.strokeStyle = furD; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hipR - 3, hy - 3); ctx.quadraticCurveTo(hipR - 12, hy - (lunge ? 3 : crouch ? 0 : -2), hipR - 14, hy + (crouch ? 4 : 7)); ctx.stroke();
  ctx.strokeStyle = fur; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(hipR - 3, hy - 3); ctx.quadraticCurveTo(hipR - 11, hy - (crouch ? 0 : -2), hipR - 13, hy + (crouch ? 4 : 6)); ctx.stroke();
  // body
  outlineEllipse(ctx, 27, hy - 2 + (lunge ? 1 : 0), lunge ? 18 : 16, 8, fur);
  ellipse(ctx, 27, hy - 6, lunge ? 17 : 15, 4.2, furD);
  ellipse(ctx, 26, hy + 3, 12, 3, furL);
  if (crouch) { ctx.strokeStyle = '#2f3641'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(16 + i * 4.2, hy - 8); ctx.lineTo(17 + i * 4.2, hy - 11); } ctx.stroke(); }
  // near legs
  leg(ctx, hipR, hy + 1, hipR + sw(0), 34 - lf(0), 3, furD, -1);
  leg(ctx, hipF, hy + 1, hipF + sw(Math.PI), 34 - lf(Math.PI), 3, furD, -1);
  // head
  const hx = lunge ? 47 : crouch ? 45 : feed ? 45 : 43, hyy = lunge ? hy - 2 : crouch ? hy + 3 : feed ? hy + 8 : hy - 6;
  ctx.save(); ctx.translate(hx, hyy); ctx.rotate(feed ? 0.55 : crouch ? 0.18 : lunge ? -0.1 : 0.06);
  outlineEllipse(ctx, 0, 0, 7, 5.6, fur);
  ellipse(ctx, 0, 2.2, 5, 2.6, furL);
  // snout
  ctx.fillStyle = fur; ctx.beginPath(); ctx.moveTo(4, -2.6); ctx.lineTo(13, 0.6); ctx.lineTo(12, 3.4); ctx.lineTo(3, 3.8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
  ellipse(ctx, 12.8, 0.9, 1.5, 1.3, '#15181d');
  if (crouch || lunge) { ctx.strokeStyle = '#f4f1e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, 3.8); ctx.lineTo(7, 5.8); ctx.moveTo(9, 3.5); ctx.lineTo(10, 5.5); ctx.stroke(); ctx.fillStyle = '#7a1f2a'; ctx.fillRect(5, 3.4, 7, 1.2); }
  // ears
  tri(ctx, -3, -4, -4 - (crouch ? 3 : 0), -10 + (crouch ? 4 : 0), 2, -5, furD);
  tri(ctx, 1, -4.4, 1 - (crouch ? 2 : 0), -10.5 + (crouch ? 4 : 0), 5.5, -3.6, fur);
  // eye
  const ec = crouch || lunge ? '#ffd23f' : '#f2dc7d';
  ellipse(ctx, 4.2, -1.4, 1.35, 1.1, ec); ellipse(ctx, 4.5, -1.4, 0.5, 0.7, '#14171c');
  ctx.restore();
});

// ------------------------------------------------------------------ bear
creature('bear', 84, 72, 42, 62, 5, (ctx, f) => {
  const fur = '#6e5240', furD = '#4a3629', furL = '#8a6a52', dark = '#33261d';
  const rear = f === 4, ph = (f < 4 ? f / 4 : 0) * Math.PI * 2, bob = f < 4 ? Math.abs(Math.sin(ph)) * -1.2 : 0;
  shadow(ctx, 42, 62, rear ? 18 : 26, 5.4, 0.34);
  if (rear) {
    // standing on hind legs, front paws raised
    leg(ctx, 34, 44, 33, 62, 6.5, dark, -1); leg(ctx, 46, 44, 49, 62, 6.5, furD, -1);
    outlineEllipse(ctx, 41, 36, 15, 21, fur, -0.12);
    ellipse(ctx, 43, 41, 8, 12, furL);
    limb(ctx, 31, 24, 21, 12, 7, furD); limb(ctx, 51, 24, 61, 11, 7, fur);
    ellipse(ctx, 20, 10, 3.6, 3.2, dark); ellipse(ctx, 62, 9.5, 3.6, 3.2, dark);
    ctx.strokeStyle = '#efe7d6'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const [x, y] of [[18, 7], [20.5, 6.5], [60, 6], [62.5, 6.5]]) { ctx.moveTo(x, y); ctx.lineTo(x - 0.5, y - 3); } ctx.stroke();
    outlineEllipse(ctx, 42, 17, 10, 9, fur);
    ellipse(ctx, 47, 20, 5.5, 4, furL); ellipse(ctx, 50, 18.4, 1.9, 1.5, '#17120f');
    ctx.fillStyle = '#7a1f2a'; ctx.fillRect(44, 22, 7, 1.6); ctx.fillStyle = '#f4f1e8'; ctx.fillRect(45, 21.6, 1.1, 2.2); ctx.fillRect(48.5, 21.6, 1.1, 2.2);
    outlineEllipse(ctx, 35, 10, 3.2, 3.2, furD); outlineEllipse(ctx, 49, 9.5, 3.2, 3.2, fur);
    ellipse(ctx, 45.5, 14.5, 1.2, 1.2, '#ff6b4a');
    return;
  }
  const sw = (a) => Math.sin(ph + a) * 6, lf = (a) => Math.max(0, Math.cos(ph + a)) * 3;
  const hipR = 22, hipF = 56, hy = 44 + bob;
  leg(ctx, hipR + 2, hy, hipR + 2 + sw(Math.PI), 62 - lf(Math.PI), 8, dark, -1);
  leg(ctx, hipF + 2, hy, hipF + 2 + sw(0), 62 - lf(0), 8, dark, -1);
  outlineEllipse(ctx, 38, 38 + bob, 26, 16, fur);
  ellipse(ctx, 50, 30 + bob, 14, 11, furD); // shoulder hump
  ellipse(ctx, 34, 47 + bob, 17, 4.6, furL);
  ellipse(ctx, 28, 27 + bob, 16, 6, furD);
  leg(ctx, hipR, hy + 2, hipR + sw(0), 62 - lf(0), 9, furD, -1);
  leg(ctx, hipF, hy + 2, hipF + sw(Math.PI), 62 - lf(Math.PI), 9, furD, -1);
  ellipse(ctx, 12, 33 + bob, 3.6, 3.6, furD);
  // head
  outlineEllipse(ctx, 64, 30 + bob, 10.5, 9, fur, 0.1);
  ellipse(ctx, 71, 34 + bob, 6.5, 4.6, furL); ellipse(ctx, 75.8, 32.6 + bob, 2.1, 1.7, '#17120f');
  outlineEllipse(ctx, 58.5, 21.4 + bob, 3.4, 3.4, furD); outlineEllipse(ctx, 69, 21.6 + bob, 3.4, 3.4, fur);
  ellipse(ctx, 69.6, 27.4 + bob, 1.25, 1.25, '#15110e');
});

// ------------------------------------------------------------------ carcasses (variant: 0 rabbit, 1 deer, 2 wolf, 3 bear)
registerSprite('carcass', {
  w: 90, h: 56, ax: 45, ay: 40, variants: 4,
  draw(ctx, v) {
    const sc = [0.55, 1, 0.9, 1.3][v], col = ['#e4dfd4', '#b58757', '#7d8696', '#6e5240'][v], colD = ['#bdb3a2', '#8e6641', '#4a5361', '#4a3629'][v];
    ctx.save(); ctx.translate(45, 34); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(120,20,34,0.55)'; ctx.beginPath(); ctx.ellipse(2, 3, 25, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,26,40,0.5)'; ctx.beginPath(); ctx.ellipse(10, 6, 12, 5, 0.3, 0, Math.PI * 2); ctx.fill();
    shadow(ctx, 0, 6, 24, 6, 0.28);
    outlineEllipse(ctx, 0, 0, 20, 8.5, col);
    ellipse(ctx, -2, -3, 15, 3.6, colD);
    ellipse(ctx, 0, 4, 12, 2.4, 'rgba(255,255,255,0.35)');
    // legs sticking out
    ctx.strokeStyle = colD; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(-13, 12); ctx.moveTo(8, 5); ctx.lineTo(12, 12); ctx.moveTo(-8, -3); ctx.lineTo(-14, -9); ctx.moveTo(10, -3); ctx.lineTo(16, -8); ctx.stroke();
    outlineEllipse(ctx, 22, 1.5, 6, 4.8, col, 0.3);
    ellipse(ctx, 26, 3, 3, 2, colD);
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(22, -1); ctx.lineTo(24, 1); ctx.moveTo(24, -1); ctx.lineTo(22, 1); ctx.stroke();
    ctx.restore();
  },
});

// ------------------------------------------------------------------ arrow (points right, centre = anchor)
registerSprite('arrow', {
  w: 20, h: 8, ax: 10, ay: 4, variants: 1,
  draw(ctx) {
    ctx.strokeStyle = '#c9a77a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(17, 4); ctx.stroke();
    ctx.fillStyle = '#c8cdd4'; ctx.beginPath(); ctx.moveTo(19.5, 4); ctx.lineTo(15.5, 1.8); ctx.lineTo(15.5, 6.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4f1de'; ctx.beginPath(); ctx.moveTo(1, 4); ctx.lineTo(4.5, 1); ctx.lineTo(6, 4); ctx.lineTo(4.5, 7); ctx.closePath(); ctx.fill();
  },
});
