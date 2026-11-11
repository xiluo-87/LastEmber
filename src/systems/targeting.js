// Computes game.target each tick: nearest interactable in the facing cone, from world objects plus any registered providers.
//   game.target = null | { kind, x, y, name, verb, radius, obj?, tx?, ty?, def?, ref? }   (x,y world px of the target centre)
// Other systems add targetables: game.targetProviders.push((game, px, py) => [{ kind:'creature', x, y, name, verb, radius, ref }, ...])
import { PLAYER } from '../data/balance.js';
import { objectCandidates, pickTarget } from '../logic/targeting.js';

export default {
  name: 'targeting',
  init(game) { game.target = null; game.targetProviders = game.targetProviders || []; },
  onLoad(game) { game.target = null; },
  update(game) {
    const p = game.state.player;
    const cands = objectCandidates(game.world, p.x, p.y, PLAYER.interactCone.range + 1);
    for (const fn of game.targetProviders) { const extra = fn(game, p.x, p.y); if (extra) for (const c of extra) cands.push(c); }
    let t = pickTarget(cands, p.x, p.y, p.facing);
    if (game.targetOverride) t = game.targetOverride(game, t);   // build mode (placement ghost / dismantle) replaces the target
    const prev = game.target;
    game.target = t;
    if ((prev?.obj ?? prev?.ref) !== (t?.obj ?? t?.ref)) game.events.emit('target:changed', t);
  },
};
