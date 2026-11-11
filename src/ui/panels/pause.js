import { audio } from '../../audio.js';

export default {
  id: 'pause', title: 'Paused', modal: true, pauses: true,
  render(game, body, _p, ctl) {
    body.innerHTML = `<div class="stack"><button class="btn primary" data-a="resume">Resume</button>
      <button class="btn" data-a="save">Save game</button><button class="btn" data-a="mute">${audio.muted ? 'Unmute sound' : 'Mute sound'}</button><button class="btn" data-a="title">Save &amp; quit to title</button></div>`;
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]'), a = btn?.dataset.a;
      if (a === 'resume') ctl.close();
      else if (a === 'save') { game.save(); game.ui.toast('Game saved', 'good'); }
      else if (a === 'mute') { audio.toggleMuted(); btn.textContent = audio.muted ? 'Unmute sound' : 'Mute sound'; }
      else if (a === 'title') { ctl.close(); game.toTitle(); }
    });
    return {};
  },
};
