// Minimal game-over panel (death / victory). The endgame engineers can extend with stats, cause of death, etc.
export default {
  id: 'gameover', title: 'Game over', modal: true, dismissOnBackdrop: false,
  render(game, body, payload = {}, ctl) {
    const win = payload.kind === 'victory';
    ctl.setTitle(win ? 'Rescued!' : 'You died');
    body.innerHTML = `<p>${payload.cause || (win ? 'The rescue plane found you.' : 'The cold took you.')}</p>
      <p class="muted">Days survived: <b>${payload.day ?? game.state?.time?.day ?? 1}</b></p>
      <div class="stack"><button class="btn primary" data-a="again">Try again</button></div>`;
    body.querySelector('[data-a="again"]').addEventListener('click', () => { ctl.close(); game.newGame(); });
    return {};
  },
};
