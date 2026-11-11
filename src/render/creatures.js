// Creature rendering (DOM/canvas): y-sorted drawables (creatures, carcasses, arrows), night visibility, hp bars, telegraph marker,
// wolf eye-shine and off-screen danger arrows (screen space, after the darkness layer). No game logic here.
import { TILE, LIGHT } from '../data/balance.js';
import { CREATURES, AI } from '../data/creatures.js';
import { drawSprite } from './sprites.js';
import './sprites/creatures.js';

const FRAMES = { rabbit: 3, deer: 4, wolf: 7, bear: 5 };
const BAR = { rabbit: [14, -22], deer: [22, -52], wolf: [22, -40], bear: [32, -68] };
const CARCASS_VARIANT = { rabbit: 0, deer: 1, wolf: 2, bear: 3 };
const pool = [], arrowPool = [];
let G = null, T = 0, LIGHTS = [], nLights = 0, pushLight = null, AMB = 1;

function frameOf(c) {
  const moving = c.vx * c.vx + c.vy * c.vy > 64;
  switch (c.type) {
    case 'rabbit': return moving ? (Math.floor(c.anim * 0.9) % 2 === 0 ? 1 : 2) : 0;
    case 'deer': return moving ? Math.floor(c.anim * 0.55) % 4 : 0;
    case 'wolf': return c.ai === 'telegraph' ? 4 : c.ai === 'lunge' ? 5 : c.ai === 'feed' ? 6 : moving ? Math.floor(c.anim * 0.7) % 4 : 0;
    case 'bear': return c.ai === 'windup' ? 4 : moving ? Math.floor(c.anim * 0.5) % 4 : 0;
  }
  return 0;
}

/** Light at a world point: 0..1 from the light sources collected this frame. */
function litAt(x, y) {
  let best = 0;
  for (let i = 0; i < nLights; i++) {
    const l = LIGHTS[i], r = l.radius * TILE, dx = x - l.x, dy = y - l.y, d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    const v = Math.min(1, (1 - Math.sqrt(d2) / r) * 1.7);
    if (v > best) best = v;
  }
  return best;
}
function collectLights(game) {
  nLights = 0;
  if (!pushLight) pushLight = (l) => { const o = LIGHTS[nLights] || (LIGHTS[nLights] = { x: 0, y: 0, radius: 0 }); o.x = l.x; o.y = l.y; o.radius = l.radius; nLights++; };
  const p = game.state.player;
  pushLight({ x: p.x, y: p.y, radius: LIGHT.personal });
  for (const s of game.systems) s.lights?.(game, pushLight);
  for (const fn of game.lightProviders) fn(game, pushLight);
}
const visibility = (x, y) => Math.min(1, AMB + (1 - AMB) * litAt(x, y) * 1.25);

function drawCreature(ctx) {
  const c = this.c, def = CREATURES[c.type];
  const vis = this.vis;
  const frames = FRAMES[c.type], v = frameOf(c) + (c.hurt > 0 ? frames : 0);
  if (vis < 1) ctx.globalAlpha = vis;
  ctx.save();
  ctx.translate(c.x, c.y + 4);
  if (c.face < 0) ctx.scale(-1, 1);
  // slight squash on lunge / bear rear, bob handled in the sprite frames
  drawSprite(ctx, c.type, v, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
  // telegraph marker
  if (c.ai === 'telegraph' || c.ai === 'windup') {
    const k = c.t / (c.type === 'bear' ? AI.bear.telegraph : AI.wolf.telegraph), s = 1 + 0.18 * Math.sin(T * 30);
    const bx = c.x, by = c.y + BAR[c.type][1] - 8;
    ctx.save(); ctx.translate(bx, by); ctx.scale(s, s);
    ctx.fillStyle = `rgba(230,57,70,${0.55 + 0.45 * k})`; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,12,0.75)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(-1.3, -5.4, 2.6, 6.4); ctx.beginPath(); ctx.arc(0, 4.2, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // hp bar
  if (c.hp < def.hp && vis > 0.3) {
    const [w, oy] = BAR[c.type], x = c.x - w / 2, y = c.y + oy, f = Math.max(0, c.hp / def.hp);
    ctx.fillStyle = 'rgba(12,16,22,0.78)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = f > 0.5 ? '#7bd389' : f > 0.25 ? '#e9a23b' : '#e63946'; ctx.fillRect(x, y, w * f, 3);
  }
}

function drawCarcass(ctx) {
  const k = this.k, vis = this.vis;
  if (vis < 1) ctx.globalAlpha = vis;
  const blink = k.ttl < 15 && Math.floor(T * 4) % 2 === 0;
  if (!blink) drawSprite(ctx, 'carcass', CARCASS_VARIANT[k.type] || 0, k.x, k.y + 4);
  ctx.globalAlpha = 1;
  if (G.tick - k.btTick < 4 && k.bt > 0) { // butcher progress
    const f = Math.min(1, k.bt / AI.butcherSeconds), w = 30;
    ctx.fillStyle = 'rgba(12,16,22,0.8)'; ctx.fillRect(k.x - w / 2 - 1, k.y - 30, w + 2, 6);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(k.x - w / 2, k.y - 29, w * f, 4);
  }
}

function drawArrow(ctx) {
  const a = this.a;
  ctx.save(); ctx.translate(a.x, a.y - 8); ctx.rotate(Math.atan2(a.vy, a.vx));
  drawSprite(ctx, 'arrow', 0, 0, 0); ctx.restore();
}

export function pushCreatureDrawables(game, cam, push) {
  const s = game.state.creatures; if (!s) return;
  G = game; T = game.time || 0;
  const st = game.state.time; AMB = st.light;
  const night = AMB < 0.97;
  if (night) collectLights(game);
  const x0 = cam.rx - 60, x1 = cam.rx + cam.w + 60, y0 = cam.ry - 40, y1 = cam.ry + cam.h + 90;
  let n = 0;
  for (const c of s.list) {
    if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    const vis = night ? visibility(c.x, c.y) : 1;
    if (vis < 0.1) continue;
    const d = pool[n] || (pool[n] = { y: 0, c: null, k: null, vis: 1, draw: drawCreature });
    d.draw = drawCreature; d.c = c; d.vis = vis; d.y = c.y + 4; push(d); n++;
  }
  for (const k of s.carcasses) {
    if (k.x < x0 || k.x > x1 || k.y < y0 || k.y > y1) continue;
    const vis = night ? visibility(k.x, k.y) : 1;
    if (vis < 0.1) continue;
    const d = pool[n] || (pool[n] = { y: 0, c: null, k: null, vis: 1, draw: drawCarcass });
    d.draw = drawCarcass; d.k = k; d.vis = vis; d.y = k.y + 2; push(d); n++;
  }
  let m = 0;
  for (const a of s.arrows) {
    const d = arrowPool[m] || (arrowPool[m] = { y: 0, a: null, draw: drawArrow });
    d.a = a; d.y = a.y; push(d); m++;
  }
}

// ---------------------------------------------------------------- screen space
const DANGER = '#e63946';
export function drawCreatureScreen(game, ctx, w, h) {
  const s = game.state.creatures, r = game.renderer; if (!s || !r) return;
  const p = game.state.player, cam = game.camera, amb = game.state.time.light, t = game.time || 0;
  // eye shine (wolves in the dark, outside any light)
  if (amb < 0.5) {
    for (const c of s.list) {
      if (c.type !== 'wolf') continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d > 8 * TILE) continue;
      collectLightsOnce(game);
      if (litAt(c.x, c.y) > 0.35) continue;
      if (Math.sin(t * 1.3 + c.id * 2.7) > 0.985 || Math.sin(t * 0.9 + c.id * 5.1) > 0.992) continue; // blink
      const sc = r.worldToScreen(c.x + c.face * 15, c.y - 13);
      const hunting = c.mode === 'hunt', col = hunting ? '255,120,70' : '230,235,150', a = 0.9 * Math.min(1, (8 * TILE - d) / (3 * TILE));
      const sep = 3.4 * cam.scale, rr = 1.7 * cam.scale;
      for (const ex of [-sep, sep]) {
        ctx.fillStyle = `rgba(${col},${0.16 * a})`; ctx.beginPath(); ctx.arc(sc.x + ex, sc.y, rr * 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.arc(sc.x + ex, sc.y, rr, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // off-screen aggro indicators
  let shown = 0;
  const cx = w / 2, cy = h / 2, margin = 30;
  for (const c of s.list) {
    if (shown >= 4) break;
    const hostile = CREATURES[c.type].hostile;
    if (!hostile || !(c.mode === 'hunt' || c.mode === 'charge' || c.ai === 'charge' || c.ai === 'windup')) continue;
    const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy);
    if (d > 24 * TILE || d < 1) continue;
    const sp = r.worldToScreen(c.x, c.y);
    if (sp.x > -10 && sp.x < w + 10 && sp.y > -10 && sp.y < h + 10) continue;
    const ang = Math.atan2(sp.y - cy, sp.x - cx), ca = Math.cos(ang), sa = Math.sin(ang);
    const k = Math.min((cx - margin) / Math.abs(ca || 1e-6), (cy - margin) / Math.abs(sa || 1e-6));
    const ax = cx + ca * k, ay = cy + sa * k, pulse = 0.65 + 0.35 * Math.sin(t * 8 + c.id);
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
    ctx.fillStyle = `rgba(230,57,70,${pulse})`; ctx.strokeStyle = 'rgba(16,10,12,0.8)'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    shown++;
  }
  void DANGER;
}
let lightStamp = -1;
function collectLightsOnce(game) { if (lightStamp === game.time) return; lightStamp = game.time; collectLights(game); }
