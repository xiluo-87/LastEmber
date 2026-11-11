// Radio tower panel (DESIGN §10): power status, signal progress (3 nights), Start/Stop transmitting. Opened by systems/endgame.js.
import { ENDGAME } from '../../data/balance.js';

export default {
  id: 'tower', title: 'Radio tower', modal: true,
  render(game, body, _payload, ctl) {
    body.innerHTML = `<div class="tw"><div class="tw-row"><span class="tw-label">Power</span><b class="tw-power"></b></div>
      <p class="muted small tw-powerinfo"></p>
      <div class="tw-row"><span class="tw-label">Signal</span><b class="tw-nights"></b></div>
      <div class="tw-nights-bar"></div>
      <p class="muted small tw-info"></p>
      <div class="stack"><button class="btn primary tw-toggle" type="button"></button><button class="btn" type="button" data-a="close">Close</button></div></div>`;
    const $ = (s) => body.querySelector(s);
    const power = $('.tw-power'), pinfo = $('.tw-powerinfo'), nightsEl = $('.tw-nights'), bar = $('.tw-nights-bar'), info = $('.tw-info'), btn = $('.tw-toggle');
    bar.innerHTML = Array.from({ length: ENDGAME.signalNights }, () => '<div class="tw-seg"><i></i></div>').join('');
    const fills = [...bar.querySelectorAll('i')];
    let sig = '';
    btn.addEventListener('click', () => { game.endgame.setTransmitting(!game.state.endgame.transmitting); });
    $('[data-a="close"]').addEventListener('click', () => ctl.close());
    return {
      update() {
        const eg = game.state.endgame, powered = game.endgame.powered(), nl = game.endgame.nightLength(), t = game.state.time;
        const cur = eg.nightKey === t.day && t.phase === 'night' ? Math.min(1, eg.poweredSecs / (ENDGAME.poweredFraction * nl)) : 0;
        const s = `${powered}|${eg.transmitting}|${eg.nights}|${cur.toFixed(2)}|${t.phase}`;
        if (s === sig) return; sig = s;
        power.textContent = powered ? 'Powered' : 'No power'; power.className = `tw-power ${powered ? 'ok' : 'bad'}`;
        pinfo.textContent = powered ? 'A lit fire is within 4 tiles.' : `Needs a lit campfire or furnace within ${ENDGAME.towerPowerRadius} tiles. Progress pauses without it.`;
        nightsEl.textContent = `${eg.nights} / ${ENDGAME.signalNights} nights`;
        fills.forEach((f, i) => { f.style.width = `${eg.nights > i ? 100 : eg.nights === i ? cur * 100 : 0}%`; });
        btn.textContent = eg.transmitting ? 'Stop transmitting' : 'Start transmitting';
        btn.classList.toggle('primary', !eg.transmitting);
        info.textContent = eg.transmitting
          ? (t.phase === 'night' ? 'Transmitting. Wolves hunt the tower. Defend it and keep the fire fed.' : 'Transmitting. The signal only counts at night: be powered for 80% of it.')
          : 'Transmit through three full nights. Each signal night draws an enraged wolf pack to the tower.';
      },
    };
  },
};
