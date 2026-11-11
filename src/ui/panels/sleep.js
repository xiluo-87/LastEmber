// "Sleeping…" overlay: dims the screen, shows the clock, Wake button. Closing it (X / Wake) wakes the player.
export default {
  id: 'sleep', title: 'Sleeping…', modal: true, dismissOnBackdrop: false,
  render(game, body, _p, ctl) {
    body.closest('.panel-backdrop')?.classList.add('sleepy');
    body.innerHTML = `<div class="zz"><span>z</span><span>z</span><span>Z</span></div><p class="sleep-clock"></p><p class="muted small">Time passes quickly. You will wake at dawn, if it gets too cold, or if something comes.</p>
      <button class="btn primary" type="button" data-a="wake">Wake up</button>`;
    const clock = body.querySelector('.sleep-clock');
    body.querySelector('[data-a="wake"]').addEventListener('click', () => game.sleep.wake('manual'));
    let last = '';
    return {
      update() { const t = game.state.time, s = `Day ${t.day} · ${t.clock}`; if (s !== last) { last = s; clock.textContent = s; } },
      destroy() { game.sleep?.wake('manual'); },
    };
  },
};
