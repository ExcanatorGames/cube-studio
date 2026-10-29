import { $$ } from './dom.js';

export function initTimerInput({
  pad,
  getState,
  timerVisible,
  arm,
  disarm,
  start,
  mark,
  escape,
}) {
  let keyboardHeld = false,
    gesture = false;
  const touches = new Set();
  function reset() {
    keyboardHeld = false;
    touches.clear();
    gesture = false;
  }
  pad.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#fullscreen-splits') && getState() !== 'running')
      return;
    if (e.pointerType === 'touch') {
      e.preventDefault();
      touches.add(e.pointerId);
      pad.setPointerCapture(e.pointerId);
      if (getState() === 'running') {
        if (!gesture) {
          gesture = true;
          mark();
        }
        return;
      }
      if (touches.size === 2) {
        gesture = true;
        arm();
      }
    } else if (e.button === 0) {
      if (getState() === 'running') {
        mark();
        return;
      }
      keyboardHeld = true;
      pad.setPointerCapture(e.pointerId);
      arm();
    }
  });
  pad.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      touches.delete(e.pointerId);
      if (touches.size < 2 && getState() === 'arming') disarm();
      if (touches.size === 0) {
        if (gesture && getState() === 'armed') start();
        gesture = false;
      }
    } else if (keyboardHeld) {
      keyboardHeld = false;
      if (getState() === 'armed') start();
      else disarm();
    }
  });
  pad.addEventListener('pointercancel', () => {
    touches.clear();
    gesture = false;
    keyboardHeld = false;
    disarm();
  });
  window.addEventListener('keydown', (e) => {
    if (
      e.repeat ||
      $$('dialog').some((d) => d.open) ||
      $$('#app-controls:popover-open').length > 0 ||
      /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
    )
      return;
    if (e.code === 'Escape') {
      escape();
      return;
    }
    if (!timerVisible()) return;
    if (e.code === 'Space') {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (getState() === 'running') {
        mark();
        return;
      }
      keyboardHeld = true;
      arm();
    }
    if (e.code === 'Enter' && getState() === 'running') {
      e.preventDefault();
      mark();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && keyboardHeld) {
      e.preventDefault();
      keyboardHeld = false;
      if (getState() === 'armed') start();
      else disarm();
    }
  });
  window.addEventListener('blur', () => {
    reset();
    disarm();
  });
  return { reset };
}
