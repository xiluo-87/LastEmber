// Onboarding (DESIGN §11): one current objective at a time + contextual one-time tips (toasts). State: state.tutorial
// { facts, tips, dismissed, seq }. Pure rules in logic/tutorial.js. The tracker widget is ui/objective.js (listens to the events below).
//
// API  game.tutorial = { current() -> {id,text,hint,progress,index,total}|null, dismiss(), restore(), setDismissed(b), dismissed(), tip(id) }
// Events: 'tutorial:complete' {id,index}  'tutorial:step' {id,index}  'tutorial:dismissed' {dismissed}  'tutorial:tip' {id}
import { TUTORIAL } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { count } from '../logic/inventory.js';
import { defaultTutorial, OBJECTIVES, currentIndex, applyEvent, applySnapshot, progressText, TIPS } from '../logic/tutorial.js';

const EVENTS = ['loot:opened', 'structure:placed', 'fire:lit', 'gather:harvest', 'room:formed', 'sleep:start', 'radio:partFound', 'craft:done'];
const T = (game) => game.state.tutorial;

function lowDurability(game) {
  const inv = game.state.inventory;
  for (const s of [...inv.hotbar, ...inv.bag]) {
    if (!s || s.dur == null) continue;
    const max = ITEMS[s.id]?.tool?.dur;
    if (max && s.dur / max < TUTORIAL.lowDurFrac) return true;
  }
  return false;
}

export default {
  name: 'tutorial',
  defaults: defaultTutorial,
  init(game) {
    const rt = game.tutorialRt = { idx: -1, t: 0 };
    const tip = (id) => {
      const t = game.state?.tutorial; if (!t || t.tips[id] || game.mode !== 'playing') return false;
      t.tips[id] = true; game.ui.toast?.(TIPS[id], id === 'bleeding' || id === 'cold' ? 'bad' : 'info', 3200); game.events.emit('tutorial:tip', { id }); return true;
    };
    game.tutorial = {
      tip,
      dismissed: () => !!game.state?.tutorial?.dismissed,
      setDismissed(b) { const t = T(game); t.dismissed = !!b; game.events.emit('tutorial:dismissed', { dismissed: !!b }); },
      dismiss() { game.tutorial.setDismissed(true); },
      restore() { game.tutorial.setDismissed(false); },
      current() {
        const f = game.state?.tutorial?.facts; if (!f) return null;
        const i = currentIndex(f), o = OBJECTIVES[i]; if (!o) return null;
        return { id: o.id, text: o.text, hint: o.hint, progress: progressText(f, o), index: i, total: OBJECTIVES.length };
      },
    };
    const sync = () => {
      const t = game.state?.tutorial; if (!t) return;
      const i = currentIndex(t.facts);
      if (rt.idx >= 0 && i > rt.idx) game.events.emit('tutorial:complete', { id: OBJECTIVES[rt.idx].id, index: rt.idx });
      if (i !== rt.idx) { rt.idx = i; game.events.emit('tutorial:step', { id: OBJECTIVES[i]?.id || null, index: i }); }
    };
    rt.sync = sync;
    for (const e of EVENTS) game.events.on(e, (p) => { const t = game.state?.tutorial; if (t && game.mode === 'playing' && applyEvent(t.facts, e, p)) sync(); });
    game.events.on('time:dusk', () => tip('dusk'));
    game.events.on('weather:warning', () => tip('blizzard'));
    game.events.on('creature:howl', () => tip('howl'));
    game.events.on('effect:applied', (e) => { if (e.id === 'bleeding') tip('bleeding'); });
    game.events.on('signal:night', (e) => { const t = game.state?.tutorial; if (t && e.counted) { t.facts.nights = e.nights; sync(); } });
    game.events.on('tool:broken', () => tip('durability'));
  },
  onLoad(game) {
    const t = T(game), rt = game.tutorialRt;
    t.facts.parts = Math.max(t.facts.parts || 0, Object.keys(game.state.flags.partsFound || {}).length);
    rt.idx = currentIndex(t.facts); rt.t = 0;
    game.events.emit('tutorial:step', { id: OBJECTIVES[rt.idx]?.id || null, index: rt.idx, load: true });
  },
  update(game, dt) {
    const t = game.state?.tutorial, rt = game.tutorialRt;
    if (!t || game.mode !== 'playing') return;
    rt.t -= dt; if (rt.t > 0) return;
    rt.t = TUTORIAL.checkEvery;
    const inv = game.state.inventory;
    if (applySnapshot(t.facts, (id) => count(inv, id))) rt.sync();
    const tg = game.state.endgame; if (tg && (t.facts.nights || 0) !== tg.nights && tg.nights >= (t.facts.nights || 0)) { t.facts.nights = tg.nights; rt.sync(); }
    if (game.state.player.warmth < TUTORIAL.coldWarmth) game.tutorial.tip('cold');
    if (lowDurability(game)) game.tutorial.tip('durability');
  },
};
