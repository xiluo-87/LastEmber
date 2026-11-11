// Unified input -> intent API. Keyboard + mouse here; touch lives in ui/touch.js and feeds the same `input` object.
//
// game.input.intent (polled by systems in update(); edge flags are true for exactly the FIRST tick after the event):
//   moveX, moveY        -1..1 (length <= 1), analog from joystick, digital from keys
//   sprint              bool (Shift, or joystick pushed to edge)
//   actionPressed       edge   actionHeld  level      (Space / left mouse / Action button)
//   interactPressed     edge   (E / tap on target)    usePressed edge (F / Use button)
//   hotbarSelect        -1 or 0..4 (edge)             toggleBag, toggleBuild, escape: edges
//   pointer             { sx, sy (screen css px), wx, wy (world px), active (mouse seen), down }
//   aimActive           true while the mouse moved recently -> player.facing follows pointer
//   worldTap            null | { sx, sy, wx, wy }  (edge) touch tap on the world (not on UI)
//   uiBlocked           a modal panel is open: systems should ignore movement/action
// The same UI-ish edges are ALSO emitted immediately on game.events (work while paused):
//   'input:toggleBag', 'input:toggleBuild', 'input:escape', 'input:hotbar' {index}, 'input:worldTap' {sx,sy,wx,wy}
import { PLAYER } from './data/balance.js';

export function createIntent() {
  return {
    moveX: 0, moveY: 0, sprint: false,
    actionPressed: false, actionHeld: false, interactPressed: false, usePressed: false,
    hotbarSelect: -1, toggleBag: false, toggleBuild: false, escape: false,
    pointer: { sx: 0, sy: 0, wx: 0, wy: 0, active: false, down: false }, aimActive: false,
    worldTap: null, uiBlocked: false,
  };
}

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

export function createInput(game) {
  const intent = game.input.intent;
  const keys = new Set();
  const touch = { x: 0, y: 0, sprint: false, action: false, active: false };  // written by ui/touch.js
  let mouseHeld = false, lastMouse = -1e9;

  function edge(name) { intent[name] = true; }
  const ui = (evt, payload) => game.events.emit(evt, payload);

  const input = {
    intent, touch,
    /** Called by touch.js / tests. name: 'action'|'interact'|'use'|'bag'|'build'|'escape' */
    press(name) {
      if (name === 'action') edge('actionPressed');
      else if (name === 'interact') edge('interactPressed');
      else if (name === 'use') edge('usePressed');
      else if (name === 'bag') { edge('toggleBag'); ui('input:toggleBag'); }
      else if (name === 'build') { edge('toggleBuild'); ui('input:toggleBuild'); }
      else if (name === 'escape') { edge('escape'); ui('input:escape'); }
    },
    selectHotbar(i) { intent.hotbarSelect = i; ui('input:hotbar', { index: i }); },
    worldTap(sx, sy) {
      const w = game.renderer ? game.renderer.screenToWorld(sx, sy) : { x: sx, y: sy };
      intent.worldTap = { sx, sy, wx: w.x, wy: w.y };
      ui('input:worldTap', intent.worldTap);
    },
    setPointer(sx, sy, active) {
      intent.pointer.sx = sx; intent.pointer.sy = sy;
      if (active) { intent.pointer.active = true; lastMouse = performance.now(); }
    },

    /** Called at the start of every fixed tick. */
    update() {
      const k = (n) => (keys.has(n) ? 1 : 0);
      let mx = k('right') - k('left'), my = k('down') - k('up');
      if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
      if (touch.active) { mx += touch.x; my += touch.y; }
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      intent.moveX = mx; intent.moveY = my;
      intent.sprint = keys.has('sprint') || touch.sprint;
      intent.actionHeld = mouseHeld || keys.has('action') || touch.action;
      intent.uiBlocked = !!game.ui?.panels?.modalOpen?.();
      if (game.renderer && intent.pointer.active) {
        const w = game.renderer.screenToWorld(intent.pointer.sx, intent.pointer.sy);
        intent.pointer.wx = w.x; intent.pointer.wy = w.y;
      }
      intent.pointer.down = mouseHeld;
      intent.aimActive = intent.pointer.active && !touch.active && performance.now() - lastMouse < PLAYER.aimIdleSeconds * 1000;
    },
    /** Called after all systems ran for a tick: clears edge flags. */
    endTick() {
      intent.actionPressed = intent.interactPressed = intent.usePressed = false;
      intent.toggleBag = intent.toggleBuild = intent.escape = false;
      intent.hotbarSelect = -1; intent.worldTap = null;
    },
    /** Reset everything held (blur, panel open, new game). */
    releaseAll() { keys.clear(); mouseHeld = false; touch.x = touch.y = 0; touch.sprint = false; touch.action = false; touch.active = false; },
  };
  game.input = input;

  if (typeof window === 'undefined') return input;

  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEYMAP[e.code];
    if (dir) { keys.add(dir); e.preventDefault(); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { keys.add('sprint'); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { edge('actionPressed'); } keys.add('action'); return; }
    if (e.repeat) { if (e.code === 'Tab') e.preventDefault(); return; }
    if (e.code === 'KeyE') input.press('interact');
    else if (e.code === 'KeyF') input.press('use');
    else if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); input.press('bag'); }
    else if (e.code === 'KeyB') input.press('build');
    else if (e.code === 'Escape') input.press('escape');
    else if (/^Digit[1-9]$/.test(e.code)) { const i = Number(e.code.slice(5)) - 1; if (i < 5) input.selectHotbar(i); }
  });
  window.addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.code];
    if (dir) keys.delete(dir);
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('sprint');
    else if (e.code === 'Space') keys.delete('action');
  });
  window.addEventListener('blur', () => input.releaseAll());

  const canvas = game.canvas;
  if (canvas) {
    canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') input.setPointer(e.clientX, e.clientY, true); });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      input.setPointer(e.clientX, e.clientY, true); mouseHeld = true; edge('actionPressed');
      canvas.setPointerCapture?.(e.pointerId);
    });
    const up = (e) => { if (e.pointerType === 'mouse') mouseHeld = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('click', (e) => { if (e.pointerType === 'mouse' || e.detail) input.worldTap(e.clientX, e.clientY); });
  }
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  return input;
}
