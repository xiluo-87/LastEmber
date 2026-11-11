// Glue for the Bag/Craft UI: game.ui.openCraft(), C key, and keeping the hotbar tidy. Installed from ui/index.js.
export function installInventoryUi(game, ui) {
  ui.openCraft = () => {
    if (game.mode !== 'playing' || game.paused) return;
    ui.panels.open('bag', { tab: 'craft' });   // re-opening replaces the current instance
  };
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyC' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    if (game.mode !== 'playing') return;
    if (ui.panels.isOpen('bag')) ui.panels.close('bag'); else ui.openCraft();
  });
}
