// Item use system: Use button / F, held torch (burns while selected, light + `state.flags.torchLit`), dropped-item pickup handler.
//   * Use (intent.usePressed): eat/drink/bandage/equip the selected hotbar stack (itemactions.useSelected).
//   * Torch: slot.burn counts down from tool.burn (180 s) ONLY while the torch is the selected hotbar item. At 0 it is removed
//     ("Torch burnt out"). While lit it registers a light (game.lightProviders) and sets state.flags.torchLit = true so the
//     survival engineer can add the held-torch heat (TEMPERATURE.torchHeld) — they read `game.state.flags.torchLit`.
import { ITEMS } from '../data/items.js';
import { ITEM_USE, SWING } from '../data/balance.js';
import { selectedStack, removeAt, ref } from '../logic/inventory.js';
import { useSelected, pickupDropped, heldTorch } from './itemactions.js';

export default {
  name: 'items',
  init(game) {
    game.interactions.register('dropped_item', {
      label: () => 'Take',
      name: (g, t) => ITEMS[t.obj.stack?.id]?.name || 'Item',
      cooldown: SWING.pickupCooldown,
      onAction: (g, t) => pickupDropped(g, t.obj),
    });
    game.lightProviders.push((g, push) => {
      const s = g.state && heldTorch(g);
      if (!s) return;
      const t = ITEMS.torch.tool, p = g.state.player;
      push({ x: p.x, y: p.y - 6, radius: t.light, flicker: 0.14, color: '255,170,80' });
    });
  },
  onLoad(game) { game.state.flags.torchLit = false; warned = false; },
  update(game, dt) {
    if (game.mode !== 'playing') return;
    const it = game.input.intent, st = game.state;
    if (it.usePressed && !it.uiBlocked) useSelected(game);
    const s = selectedStack(st.inventory);
    if (s && s.id === 'torch') {
      const max = ITEMS.torch.tool.burn;
      if (s.burn === undefined) s.burn = max;
      s.burn -= dt;
      if (s.burn <= 0) {
        removeAt(st.inventory, ref('hotbar', st.inventory.selected), 1);
        game.ui.toast?.('Your torch burnt out', 'bad'); st.flags.torchLit = false; warned = false;
      } else {
        st.flags.torchLit = true;
        if (s.burn <= ITEM_USE.torchWarnSeconds && !warned) { warned = true; game.ui.toast?.('Torch is dying', 'bad'); }
      }
    } else st.flags.torchLit = false;
  },
};
let warned = false;
