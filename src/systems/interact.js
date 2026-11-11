// Interaction dispatcher + swing engine (DESIGN §11).
//
// `game.interactions` is a REGISTRY: other systems plug handlers in without editing this file.
//
//   game.interactions.register(match, handler) -> unregister fn
//     match    'tree' (obj.type, or target.kind for non-object targets, e.g. 'creature') | ['a','b'] | (target) => bool
//     handler  {
//       label(game, target) -> string        Action button + hint verb ("Chop", "Open"...). Default: target.verb.
//       name?(game, target)  -> string       override the hint's target name (dropped items).
//       icon?                string          reserved (not drawn yet)
//       onAction(game, target, api) -> false | any
//                Action/E pressed (or Action held when handler.repeat). Return false = nothing happened (no cooldown).
//                api.swing(onImpact?) plays the swing (animation, stamina, cooldown) and calls onImpact(swingInfo) at impact time.
//                Without api.swing the handler is instant and `cooldown` seconds (default SWING.openCooldown) apply.
//       repeat?: bool                        keep firing while Action is held (gathering). Default false.
//       cooldown?(game,target)|number        seconds between instant actions.
//       onHold?(game, target, dt, heldSeconds)   called every tick while Action is held on this target (dismantle-hold etc.)
//       priority?: number                    higher wins when several handlers match (ties: last registered wins).
//     }
//   game.interactions.find(target) -> handler|null     game.interactions.startSwing(game, onImpact?) -> bool
//   game.interactions.swingState  -> null | { t, dur, impactAt, cls, facing, reachPx }    (renderer / combat can read)
//
// Action with no target (or a target nobody handles) = free swing: stamina (SURVIVAL.swingStamina), cooldown by tool class
// (SWING.time), and at impact the event  'player:swing' { origin:{x,y}, facing, reach (tiles), reachPx, arc (half-angle rad),
// damage, tool (item id|'hands'), toolClass, slot (hotbar ref), stack, ammo? }  that the combat system consumes.
// E (interactPressed) only triggers handlers, never a free swing.
import { TILE, SWING } from '../data/balance.js';
import { HANDS, ITEMS } from '../data/items.js';
import { selectedStack, ref } from '../logic/inventory.js';
import { swing as vitalSwing } from './vitals.js';

const targetKey = (t) => (t ? (t.obj ? `${t.obj.type}@${t.tx},${t.ty}` : `${t.kind}:${t.name}`) : '');

function createInteractions() {
  const entries = []; let seq = 0;
  const api = {
    cd: 0, swingState: null, held: { key: '', t: 0 },
    register(match, handler) {
      const e = { match, handler, seq: seq++ };
      entries.push(e);
      return () => { const i = entries.indexOf(e); if (i >= 0) entries.splice(i, 1); };
    },
    find(target) {
      if (!target) return null;
      const type = target.obj?.type, kind = target.kind;
      let best = null;
      for (const e of entries) {
        const m = e.match;
        const ok = typeof m === 'function' ? m(target) : Array.isArray(m) ? m.includes(type) || m.includes(kind) : m === type || m === kind;
        if (!ok) continue;
        if (!best || (e.handler.priority ?? 0) >= (best.handler.priority ?? 0)) best = e;
      }
      return best ? best.handler : null;
    },
    /** Tool stack currently in hand (selected hotbar slot) or null. */
    heldStack: (game) => selectedStack(game.state.inventory),
    /** Tool definition in hand: the item's `tool` block or HANDS.tool. */
    heldTool(game) { const s = selectedStack(game.state.inventory); return (s && ITEMS[s.id]?.tool) || HANDS.tool; },
    startSwing(game, onImpact) {
      if (api.cd > 0 || api.swingState) return false;
      const inv = game.state.inventory, s = selectedStack(inv), tdef = (s && ITEMS[s.id]?.tool) || HANDS.tool;
      const p = game.state.player, cls = tdef.class || 'hands';
      const dur = (SWING.time[cls] ?? SWING.time.hands) * vitalSwing(game); // survival: spends swing stamina, x1.4 when exhausted
      api.swingState = { t: 0, dur, impactAt: dur * SWING.impact, fired: false, cb: onImpact || null, cls, facing: p.facing, reachPx: (tdef.reach ?? HANDS.tool.reach) * TILE };
      api.cd = dur;
      return true;
    },
  };
  return api;
}

export function swingInfo(game) {
  const p = game.state.player, inv = game.state.inventory, s = selectedStack(inv), tdef = (s && ITEMS[s.id]?.tool) || HANDS.tool;
  const info = {
    origin: { x: p.x, y: p.y }, facing: p.facing, reach: tdef.reach ?? HANDS.tool.reach, reachPx: (tdef.reach ?? HANDS.tool.reach) * TILE,
    arc: (SWING.arcHalfDeg * Math.PI) / 180, damage: tdef.dmg ?? HANDS.tool.dmg, tool: s ? s.id : 'hands', toolClass: tdef.class || 'hands',
    slot: ref('hotbar', inv.selected), stack: s,
  };
  if (tdef.ammo) info.ammo = tdef.ammo;
  return info;
}

export default {
  name: 'interact',
  init(game) {
    game.interactions = createInteractions();
    game.events.on('target:changed', () => { lastLabel = null; });
  },
  onLoad(game) { const r = game.interactions; r.cd = 0; r.swingState = null; r.held = { key: '', t: 0 }; lastLabel = null; },
  update(game, dt) {
    const R = game.interactions, it = game.input.intent;
    R.cd = Math.max(0, R.cd - dt);
    const sw = R.swingState;
    if (sw) {
      sw.t += dt;
      if (!sw.fired && sw.t >= sw.impactAt) {
        sw.fired = true;
        if (sw.cb) sw.cb(swingInfo(game)); else game.events.emit('player:swing', swingInfo(game));
      }
      if (sw.t >= sw.dur) R.swingState = null;
    }
    if (game.mode !== 'playing') return;

    const target = game.target, handler = R.find(target);
    const s = selectedStack(game.state.inventory), held = s && ITEMS[s.id];
    let label;
    if (target) {
      label = handler?.label ? handler.label(game, target) : (target.verb || 'Use');
      target.verb = label;
      if (handler?.name) target.name = handler.name(game, target);
    } else label = held?.tool?.class === 'bow' ? 'Shoot' : held?.kind === 'weapon' ? 'Attack' : 'Swing';
    if (label !== lastLabel) { lastLabel = label; game.ui.setActionLabel?.(label); }

    if (it.uiBlocked) { R.held = { key: '', t: 0 }; return; }
    const pressed = it.actionPressed, interact = it.interactPressed, down = it.actionHeld;
    // hold tracking (for onHold handlers)
    const key = down ? targetKey(target) : '';
    if (key && key === R.held.key) R.held.t += dt; else R.held = { key, t: 0 };
    if (down && handler?.onHold && R.held.t > 0) handler.onHold(game, target, dt, R.held.t);

    if (R.cd > 0 || R.swingState) return;
    if (handler && (pressed || interact || (down && handler.repeat))) {
      const r = handler.onAction(game, target, { swing: (cb) => R.startSwing(game, cb) });
      if (r === false) return;
      if (R.cd <= 0) {
        const c = typeof handler.cooldown === 'function' ? handler.cooldown(game, target) : handler.cooldown;
        R.cd = c ?? SWING.openCooldown;
      }
    } else if (!handler && (pressed || down)) {
      R.startSwing(game, null);
    }
  },
  // swing arc flash (world space, above entities)
  drawFx(game, ctx) {
    const sw = game.interactions?.swingState;
    if (!sw || sw.t < sw.impactAt * 0.4) return;
    const p = game.state.player, k = Math.min(1, (sw.t - sw.impactAt * 0.4) / Math.max(0.001, sw.dur * 0.5));
    const arc = (SWING.arcHalfDeg * Math.PI) / 180, a0 = sw.facing - arc, a1 = a0 + 2 * arc * Math.min(1, k * 1.4);
    ctx.save();
    ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - k)})`; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(p.x, p.y + 2, Math.max(14, sw.reachPx * 0.8), a0, a1); ctx.stroke();
    ctx.restore();
  },
};
let lastLabel = null;
