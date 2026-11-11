import { audio } from '../../audio.js';
import { clear as clearSave } from '../../save.js';

export default {
  id: 'pause', title: 'Paused', modal: true, pauses: true,
  render(game, body, _p, ctl) {
    const objLabel = () => (game.tutorial?.dismissed() ? 'Show objectives' : 'Hide objectives');
    const menu = () => {
      body.innerHTML = `<div class="stack"><button class="btn primary" data-a="resume">Resume</button>
      <button class="btn" data-a="howto">How to play</button>
      <button class="btn" data-a="save">Save game</button><button class="btn" data-a="mute">${audio.muted ? 'Unmute sound' : 'Mute sound'}</button>
      ${game.tutorial ? `<button class="btn" data-a="obj">${objLabel()}</button>` : ''}
      <button class="btn" data-a="title">Save &amp; quit to title</button>
      <button class="btn danger" data-a="abandon">Abandon run</button></div>`;
    };
    const confirm = () => {
      body.innerHTML = `<p class="go-cause" style="font-size:18px">Abandon this run?</p><p class="muted">Your progress is deleted for good (permadeath). This cannot be undone.</p>
      <div class="stack"><button class="btn danger" data-a="abandon-yes">Yes, abandon</button><button class="btn primary" data-a="abandon-no">Keep playing</button></div>`;
    };
    menu();
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]'), a = btn?.dataset.a;
      if (a === 'resume') ctl.close();
      else if (a === 'save') { game.save(); game.ui.toast('Game saved', 'good'); }
      else if (a === 'mute') { audio.toggleMuted(); btn.textContent = audio.muted ? 'Unmute sound' : 'Mute sound'; }
      else if (a === 'howto') game.ui.panels.open('howto');
      else if (a === 'obj') { game.tutorial.setDismissed(!game.tutorial.dismissed()); btn.textContent = objLabel(); }
      else if (a === 'title') { ctl.close(); game.toTitle(); }
      else if (a === 'abandon') confirm();
      else if (a === 'abandon-no') menu();
      else if (a === 'abandon-yes') { ctl.close(); game.toTitle(); clearSave(game.storage); game.events.emit('game:title'); }
    });
    return {};
  },
};
