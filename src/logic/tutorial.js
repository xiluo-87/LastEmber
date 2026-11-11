// Onboarding objectives (DESIGN §11), pure. Facts are sticky booleans/counters set by events or by inventory snapshots;
// the CURRENT objective is the first one whose `done(facts)` is false. Completing facts out of order is fine (they are skipped later).
import { TUTORIAL } from '../data/balance.js';

export const OBJECTIVES = [
  { id: 'gather', text: 'Gather sticks and stones', hint: 'Sticks and stones lie on the snow. Walk up to one and press Act.', done: (f) => !!f.gathered },
  { id: 'crate', text: 'Open the crate at the crash site', hint: 'The crate near where you woke holds a tin pot, a map and cloth. Stand next to it and press Act.', done: (f) => !!f.crate },
  { id: 'campfire', text: 'Build a campfire', hint: 'Tap Build, choose Campfire (3 sticks, 3 stones), then tap Place.', done: (f) => !!f.campfire },
  { id: 'light', text: 'Light it and add fuel', hint: 'Face the fire and press Act. Add sticks or wood, then light it. Flint lights it for the first time.', done: (f) => !!f.lit },
  { id: 'axe', text: 'Craft a stone axe', hint: 'Open Bag, then the Craft tab: stone axe needs 2 sticks, 2 stones and 1 fibre. Put it on your hotbar.', done: (f) => !!f.axe },
  { id: 'chop', text: 'Chop wood', hint: 'Select the axe on your hotbar, face a pine tree and hold Act.', done: (f) => !!f.chopped },
  { id: 'shelter', text: 'Wall in your fire (walls and a door)', hint: 'In Build, place wood walls around the campfire and finish the ring with a door. Walls hold heat in.', done: (f) => !!f.shelter },
  { id: 'cook', text: 'Cook food or boil water', hint: 'Stand by a lit fire. In Craft, cook meat or boil water (needs the tin pot).', done: (f) => !!f.cooked },
  { id: 'spear', text: 'Craft a spear', hint: 'Spear needs 2 sticks, 1 flint and 1 fibre. Flint is sometimes found when mining boulders.', done: (f) => !!f.spear },
  { id: 'sleep', text: 'Make a bedroll and sleep', hint: 'Build a bedroll (fibre and hide) inside your shelter, then press Act on it at night.', done: (f) => !!f.slept },
  { id: 'wreck', text: 'Find the three wreckage sites', hint: 'The flight map shows arrows at the screen edge. Each wreck holds a radio part.', done: (f) => (f.parts || 0) >= 3, progress: (f) => `${Math.min(3, f.parts || 0)}/3` },
  { id: 'smelt', text: 'Smelt iron', hint: 'Mine iron ore and coal near the bear dens, build a furnace, light it and craft ingots.', done: (f) => !!f.smelted },
  { id: 'tower', text: 'Build the radio tower', hint: 'In Build, Endgame: 6 iron ingots, 6 wood, 2 rope and the three radio parts.', done: (f) => !!f.tower },
  { id: 'signal', text: 'Transmit for 3 nights', hint: 'Keep a fire within 4 tiles of the tower and start transmitting. Wolves will come. Defend it.', done: (f) => (f.nights || 0) >= 3, progress: (f) => `${Math.min(3, f.nights || 0)}/3` },
];

export const defaultTutorial = () => ({ facts: {}, tips: {}, dismissed: false, seq: 0 });

/** Index of the current objective, or OBJECTIVES.length when all are done. */
export function currentIndex(facts) {
  for (let i = 0; i < OBJECTIVES.length; i++) if (!OBJECTIVES[i].done(facts)) return i;
  return OBJECTIVES.length;
}
export const currentObjective = (facts) => OBJECTIVES[currentIndex(facts)] || null;
export const progressText = (facts, obj = currentObjective(facts)) => (obj?.progress ? obj.progress(facts) : '');

/** Event -> facts. Returns true if a fact changed. `p` is the event payload. */
export function applyEvent(facts, evt, p = {}) {
  const set = (k, v = true) => { if (facts[k] === v || (typeof v === 'number' && facts[k] >= v)) return false; facts[k] = v; return true; };
  switch (evt) {
    case 'loot:opened': return p.obj?.type === 'crash_site' ? set('crate') : false;
    case 'structure:placed': return p.type === 'campfire' ? set('campfire') : p.type === 'radio_tower' ? set('tower') : false;
    case 'fire:lit': return p.type === 'campfire' || p.type === 'furnace' ? set('lit') : false;
    case 'gather:harvest': return p.obj?.type === 'tree' && (p.drops || []).some((d) => d.item === 'wood') ? set('chopped') : false;
    case 'room:formed': return set('shelter');
    case 'sleep:start': return set('slept');
    case 'radio:partFound': return set('parts', (facts.parts || 0) + 1);
    case 'craft:done': {
      const id = p.recipe?.id;
      if (id === 'stone_axe') return set('axe');
      if (id === 'spear') return set('spear');
      if (id === 'cooked_meat' || id === 'cooked_fish' || id === 'clean_water') return set('cooked');
      if (id === 'iron_ingot') return set('smelted');
      return false;
    }
    default: return false;
  }
}

/** Snapshot-derived facts: `count(itemId)` over the inventory. */
export function applySnapshot(facts, count) {
  let ch = false;
  if (!facts.gathered && count('stick') >= TUTORIAL.campfireSticks && count('stone') >= TUTORIAL.campfireStones) { facts.gathered = true; ch = true; }
  if (!facts.axe && (count('stone_axe') || count('iron_axe'))) { facts.axe = true; ch = true; }
  if (!facts.spear && (count('spear') || count('iron_spear'))) { facts.spear = true; ch = true; }
  return ch;
}

/** Contextual one-time tips: id -> message. */
export const TIPS = {
  dusk: 'Night is coming. Get to your fire.',
  blizzard: 'A blizzard is coming. Fuel your fire and get inside walls.',
  howl: 'Wolves are howling. Stay by a lit fire and keep your walls up.',
  bleeding: 'You are bleeding. Craft a bandage from cloth and use it.',
  cold: 'Getting cold. Stand near a fire or put on warmer clothes.',
  durability: 'Your tool is nearly worn out. Craft a spare.',
};
