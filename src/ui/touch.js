// Touch controls (DESIGN §11): floating joystick on the left 45%, Action/Use/Bag/Build buttons on the right, taps on the
// world on the right zone -> worldTap. Everything uses Pointer Events + per-pointer capture so multi-touch works
// (move while holding Action). Feeds game.input (input.touch.*, input.press()).
const R = 58; // joystick radius px

export function isTouchDevice(params = {}) {
  if (params.touch === '1') return true;
  if (params.touch === '0') return false;
  return typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
}

export function createTouch(game, root, input) {
  root.innerHTML = `
    <div class="tz tz-left" data-zone="left"></div>
    <div class="tz tz-right" data-zone="right"></div>
    <div class="joy" hidden><div class="joy-base"></div><div class="joy-knob"></div></div>
    <button class="tbtn tbtn-use" data-btn="use" aria-label="Use item"><b>Use</b></button>
    <button class="tbtn tbtn-bag" data-btn="bag" aria-label="Bag"><b>Bag</b></button>
    <button class="tbtn tbtn-build" data-btn="build" aria-label="Build"><b>Build</b></button>
    <div class="dpad" hidden>
      <button class="dbtn d-up" data-nudge="0,-1" aria-label="Move tile up"><b>&#9650;</b></button>
      <button class="dbtn d-left" data-nudge="-1,0" aria-label="Move tile left"><b>&#9664;</b></button>
      <button class="dbtn d-right" data-nudge="1,0" aria-label="Move tile right"><b>&#9654;</b></button>
      <button class="dbtn d-down" data-nudge="0,1" aria-label="Move tile down"><b>&#9660;</b></button>
    </div>
    <button class="tbtn tbtn-action" data-btn="action" aria-label="Action"><b class="act-label">Act</b></button>`;
  const $ = (s) => root.querySelector(s);
  const joy = $('.joy'), base = $('.joy-base'), knob = $('.joy-knob'), actLabel = $('.act-label');
  const t = input.touch;
  let joyId = null, ox = 0, oy = 0, joyT0 = 0;

  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };
  function joyStart(e) {
    if (joyId !== null) return;
    joyId = e.pointerId; ox = e.clientX; oy = e.clientY; joyT0 = performance.now();
    joy.hidden = false; joy.style.left = `${ox}px`; joy.style.top = `${oy}px`; setKnob(0, 0);
    e.currentTarget.setPointerCapture(e.pointerId);
    t.active = true; t.x = t.y = 0; e.preventDefault();
  }
  function joyMove(e) {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const len = Math.hypot(dx, dy), dead = 8;
    if (len < dead) { t.x = t.y = 0; t.sprint = false; setKnob(0, 0); return; }
    const f = Math.min(1, (len - dead) / (R - dead));
    t.x = (dx / len) * f; t.y = (dy / len) * f;
    t.sprint = t.sprint ? len > R * 0.8 : len >= R * 0.97;   // push to the edge = sprint (with hysteresis)
    const k = Math.min(len, R) / len;
    setKnob(dx * k, dy * k);
    joy.classList.toggle('sprint', t.sprint);
  }
  function joyEnd(e) {
    if (e.pointerId !== joyId) return;
    // placement mode: a quick tap (no drag) on the joystick side also picks the ghost tile; a drag still just moves
    if (e.type === 'pointerup' && game.building?.mode === 'place' && performance.now() - joyT0 < 350 && Math.hypot(e.clientX - ox, e.clientY - oy) < 14) input.worldTap(e.clientX, e.clientY);
    joyId = null; joy.hidden = true; joy.classList.remove('sprint');
    t.active = false; t.x = t.y = 0; t.sprint = false;
  }
  const left = $('.tz-left');
  left.addEventListener('pointerdown', joyStart); left.addEventListener('pointermove', joyMove);
  left.addEventListener('pointerup', joyEnd); left.addEventListener('pointercancel', joyEnd);

  // world taps on the right zone (short, small movement)
  const right = $('.tz-right');
  const taps = new Map();
  right.addEventListener('pointerdown', (e) => { taps.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() }); right.setPointerCapture(e.pointerId); e.preventDefault(); });
  right.addEventListener('pointerup', (e) => {
    const d = taps.get(e.pointerId); taps.delete(e.pointerId);
    if (d && performance.now() - d.t < 400 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 14) input.worldTap(e.clientX, e.clientY);
  });
  right.addEventListener('pointercancel', (e) => taps.delete(e.pointerId));

  // buttons
  for (const btn of root.querySelectorAll('[data-btn]')) {
    const name = btn.dataset.btn;
    btn.addEventListener('pointerdown', (e) => {
      btn.setPointerCapture(e.pointerId); btn.classList.add('down'); e.preventDefault(); e.stopPropagation();
      if (name === 'action') { t.action = true; input.press('action'); } else input.press(name);
    });
    const up = (e) => { btn.classList.remove('down'); if (name === 'action') t.action = false; e.preventDefault(); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  }

  // placement cursor d-pad (build mode only): steps the ghost tile; hold to repeat
  const dpad = $('.dpad');
  for (const btn of dpad.querySelectorAll('[data-nudge]')) {
    const [dx, dy] = btn.dataset.nudge.split(',').map(Number);
    let timer = 0;
    const step = () => game.building?.nudge(dx, dy);
    const end = (e) => { clearTimeout(timer); clearInterval(timer); timer = 0; btn.classList.remove('down'); e?.preventDefault(); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); btn.setPointerCapture(e.pointerId); btn.classList.add('down');
      step(); clearTimeout(timer); timer = setTimeout(() => { timer = setInterval(step, 120); }, 320);
    });
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end); btn.addEventListener('lostpointercapture', end);
  }
  game.events.on('build:mode', ({ mode }) => {
    const placing = mode === 'place';
    dpad.hidden = !placing; document.body.classList.toggle('build-place', placing);
    if (game.building) { game.building.cursorMode = true; if (placing) game.building.pinHere(); }
  });

  // block scrolling / pinch-zoom / selection / context menu everywhere,
  // except one-finger scrolling inside a panel's scrollable body
  const stop = (e) => e.preventDefault();
  const stopMove = (e) => {
    if (e.touches && e.touches.length === 1 && e.target?.closest?.('.panel-body')) return;
    e.preventDefault();
  };
  document.addEventListener('touchmove', stopMove, { passive: false });
  document.addEventListener('gesturestart', stop); document.addEventListener('gesturechange', stop);
  document.addEventListener('selectstart', stop); document.addEventListener('dblclick', stop);

  return {
    setActionLabel(text) { actLabel.textContent = text || 'Act'; },
    el: root,
  };
}
