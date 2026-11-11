// Debug tooling. window.__game is always exposed (main.js). With ?debug=1: FPS/position overlay + cheat keys.
//   T +60s time   Y jump to dusk   U jump to sunrise   G give starter kit   H restore stats   J toggle bright debug light
//   K teleport to next POI   Z toggle 3x walk speed   X toggle noclip-ish speed boost off
// Also available: __game.debug.teleport(tx,ty), .give(id,n), .setTime(day,t), .tp(poiIndex)
import { TILE, TIME } from './data/balance.js';
import { daylightLength } from './logic/clock.js';
import { add } from './logic/inventory.js';

export function installDebug(game) {
  let light = false, fast = false, poiIdx = 0;
  const api = game.debug = {
    teleport(tx, ty) { const c = game.world.tileCenter(tx, ty); Object.assign(game.state.player, { x: c.x, y: c.y }); game.renderer?.snapCamera(); },
    give(id, n = 1) { return add(game.state.inventory, id, n); },
    setTime(day, t) { Object.assign(game.state.time, { day, t }); },
    tp(i) { const p = game.world.pois()[i % game.world.pois().length]; api.teleport(p.tx, p.ty + 2); return p; },
    kit() {
      for (const [id, n] of [['stone_axe', 1], ['stone_pickaxe', 1], ['spear', 1], ['torch', 1], ['wood', 12], ['stick', 15], ['stone', 10], ['coal', 4], ['raw_meat', 3], ['bandage', 2], ['fur_coat', 1]]) api.give(id, n);
    },
  };
  game.speedModifiers.push(() => (fast ? 3 : 1));
  game.lightProviders.push((g, push) => { if (light) push({ x: g.state.player.x, y: g.state.player.y, radius: 6, flicker: 0.06 }); });

  if (game.params.debug !== '1') return;
  const el = document.createElement('div'); el.id = 'debug'; document.body.appendChild(el);
  let frames = 0, acc = 0, fps = 0;
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !game.state) return;
    const t = game.state.time;
    switch (e.code) {
      case 'KeyT': t.t += 60; break;
      case 'KeyY': t.t = daylightLength(t.day) - TIME.duskLength; break;
      case 'KeyU': t.day++; t.t = 0; break;
      case 'KeyG': api.kit(); game.ui.toast('Debug kit', 'good'); break;
      case 'KeyH': Object.assign(game.state.player, { health: 100, hunger: 100, thirst: 100, warmth: 100, stamina: 100 }); break;
      case 'KeyJ': light = !light; break;
      case 'KeyK': api.tp(poiIdx++); break;
      case 'KeyZ': fast = !fast; break;
      default: return;
    }
  });
  return {
    update(dt) {
      frames++; acc += dt;
      if (acc < 0.3) return;
      fps = Math.round(frames / acc); frames = 0; acc = 0;
      const s = game.state; if (!s) return;
      const p = s.player, tl = game.world.worldToTile(p.x, p.y);
      el.textContent = `${fps} fps  seed ${s.seed}\npos ${p.x.toFixed(0)},${p.y.toFixed(0)} tile ${tl.tx},${tl.ty} ${game.world.terrainAt(tl.tx, tl.ty)}\nday ${s.time.day} ${s.time.clock} ${s.time.phase} light ${s.time.light.toFixed(2)}\ntarget ${game.target ? game.target.name : '-'}`;
    },
  };
}
