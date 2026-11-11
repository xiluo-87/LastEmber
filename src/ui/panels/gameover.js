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
    // shared run stats (systems/stats.js -> logic/stats.js): days, time alive, animals hunted, structures built, coldest night, distance...
    const rows = game.stats ? game.stats.rows() : [['Days survived', day], ['Time alive', mmss(payload.stats?.playSeconds ?? 0)]];
    body.innerHTML = `<p class="go-cause${win ? ' win' : ''}">${payload.cause || (win ? 'The rescue plane found you.' : 'The cold took you.')}</p>
      ${payload.tip ? `<p class="go-tip">${payload.tip}</p>` : ''}
      <div class="go-stats">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
      <div class="stack"><button class="btn primary" data-a="again">${win ? 'Play again' : 'Try again'}</button></div>`;
    body.querySelector('[data-a="again"]').addEventListener('click', () => { ctl.close(); game.newGame(randomSeed()); });
    return {};
  },
};
