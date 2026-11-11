// Title screen: New game / Continue.
export function createTitle(game, root) {
  root.innerHTML = `<div class="title-card"><div class="logo"><span class="ember"></span><h1>LAST EMBER</h1></div>
    <p class="tag">The cold is patient. Keep the fire alive.</p>
    <div class="stack"><button id="btn-continue" class="btn primary" type="button">Continue</button>
    <button id="btn-new" class="btn" type="button">New game</button></div>
    <p class="muted small">WASD move &middot; Shift sprint &middot; Space action &middot; E interact &middot; I bag &middot; B build</p></div>`;
  const cont = root.querySelector('#btn-continue'), nu = root.querySelector('#btn-new');
  const refresh = () => {
    const has = game.hasSave();
    cont.hidden = !has; nu.classList.toggle('primary', !has);
    root.hidden = game.mode !== 'title';
    document.body.classList.toggle('mode-title', game.mode === 'title');
    document.body.classList.toggle('mode-playing', game.mode === 'playing');
  };
  const start = (fn) => (e) => { e.preventDefault(); if (fn()) refresh(); };
  nu.addEventListener('click', start(() => { game.newGame(); return true; }));
  cont.addEventListener('click', start(() => game.loadGame()));
  for (const evt of ['game:new', 'game:loaded', 'game:title', 'game:over']) game.events.on(evt, refresh);
  refresh();
  return { refresh };
}
