// Game-over panel (death / victory). Death: cause in words, a fairness tip, days survived and a few stats; "Try again" = new seed
// (the save was already cleared by game.end -> permadeath).
import { randomSeed } from '../../rng.js';

const mmss = (s) => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;

export default {
  id: 'gameover', title: 'Game over', modal: true, dismissOnBackdrop: false,
  render(game, body, payload = {}, ctl) {
    const win = payload.kind === 'victory';
    ctl.setTitle(win ? 'Rescued!' : 'You died');
    const day = payload.day ?? game.state?.time?.day ?? 1;
    const ex = payload.extra || {}, secs = payload.stats?.playSeconds ?? ex.playSeconds ?? 0;
    const rows = [['Days survived', day], ['Time alive', mmss(secs)]];
    if (!win) {
      if (ex.minFelt != null && ex.minFelt < 99) rows.push(['Coldest you felt', `${Math.round(ex.minFelt)}°C`]);
      if (ex.hits) rows.push(['Hits taken', ex.hits]);
    }
    body.innerHTML = `<p class="go-cause">${payload.cause || (win ? 'The rescue plane found you.' : 'The cold took you.')}</p>
      ${payload.tip ? `<p class="go-tip">${payload.tip}</p>` : ''}
      <div class="go-stats">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
      <div class="stack"><button class="btn primary" data-a="again">Try again</button></div>`;
    body.querySelector('[data-a="again"]').addEventListener('click', () => { ctl.close(); game.newGame(randomSeed()); });
    return {};
  },
};
