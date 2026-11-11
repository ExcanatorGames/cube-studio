import { $$ } from './dom.js';

export function initTimerInput({
  pad,
  surface,
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
  function down(e, capture) {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      touches.add(e.pointerId);
      capture.setPointerCapture(e.pointerId);
      if (getState() === 'running') {
        if (!gesture) {
          gesture = true;
          mark();
        }
        return;
      }
      // Fingers left down from the tap that stopped the timer never arm it;
      // a new hold starts once every finger has been lifted.
      if (touches.size === 2 && !gesture) {
        gesture = true;
        arm();
      }
    } else if (e.button === 0) {
      if (getState() === 'running') {
        e.preventDefault();
        mark();
        return;
      }
      keyboardHeld = true;
      capture.setPointerCapture(e.pointerId);
      arm();
    }
  }
  function up(e) {
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
  }
  function cancelPointers() {
    touches.clear();
    gesture = false;
    keyboardHeld = false;
    disarm();
  }
  // Case buttons inside the pad keep their own clicks and never arm the timer.
  const control = (e) => e.target.closest('#practice-case-picker');
  pad.addEventListener('pointerdown', (e) => {
    if (control(e)) return;
    if (e.target.closest('#fullscreen-splits') && getState() !== 'running')
      return;
    down(e, pad);
  });
  pad.addEventListener('pointerup', (e) => {
    if (control(e)) return;
    up(e);
  });
  pad.addEventListener('pointercancel', cancelPointers);
  // While a solve runs, the whole timer card (including its toolbar) stops
  // the timer or marks a split. Outside a solve only the pad starts timing.
  surface?.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#timer-pad') || getState() !== 'running') return;
    down(e, surface);
  });
  surface?.addEventListener('pointerup', (e) => {
    if (e.target.closest('#timer-pad')) return;
    up(e);
  });
  surface?.addEventListener('pointercancel', (e) => {
    if (!e.target.closest('#timer-pad')) cancelPointers();
  });
  window.addEventListener('keydown', (e) => {
    if (
      e.repeat ||
      $$('dialog').some((d) => d.open) ||
      $$('#timer-split-menu:popover-open').length > 0 ||
      /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
    )
      return;
    if (e.code === 'Escape') {
      escape();
      return;
    }
    if (!timerVisible()) return;
    if (e.code === 'Space') {
      if (getState() === 'running') {
        e.preventDefault();
        mark();
        return;
      }
      // Space belongs to the timer inside the timer card, even when one of its
      // buttons has focus after a click. Other buttons keep their default.
      if (e.target.tagName === 'BUTTON' && !e.target.closest?.('#timer-card'))
        return;
      e.preventDefault();
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
  return {
    reset,
    // A key, mouse button or two fresh fingers are still holding the timer.
    held: () => keyboardHeld || (gesture && touches.size >= 2),
  };
}
