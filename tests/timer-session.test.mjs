import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimerSession } from '../web/timer-session.js';

function session() {
  let time = 0,
    ready;
  const timer = createTimerSession({
    now: () => time,
    wallNow: () => time,
    schedule: (fn) => {
      ready = fn;
    },
    unschedule() {},
  });
  return {
    timer,
    advance: (ms) => {
      time += ms;
    },
    ready: () => ready(),
  };
}
const attempt = {
  scramble: 'R U',
  context: 'normal',
  track: true,
  splitNames: ['Cross', 'Finish'],
};

test('timing captures immutable context, completes splits once and enforces restart cooldown', () => {
  const h = session(),
    input = structuredClone(attempt);
  assert.equal(h.timer.start(input), false);
  assert.equal(
    h.timer.arm(500, () => {}),
    true,
  );
  h.ready();
  assert.equal(h.timer.start(input), true);
  input.splitNames[0] = 'Changed';
  input.scramble = 'F';
  h.advance(1234);
  assert.deepEqual(h.timer.mark(), { split: true });
  h.advance(2000);
  const { finished } = h.timer.mark();
  assert.deepEqual(finished.splits, [
    { name: 'Cross', ms: 1234 },
    { name: 'Finish', ms: 3234 },
  ]);
  assert.equal(finished.attempt.scramble, 'R U');
  assert.equal(h.timer.stop(), null);
  assert.equal(
    h.timer.arm(500, () => {}),
    false,
  );
  h.advance(700);
  assert.equal(
    h.timer.arm(500, () => {}),
    true,
  );
});

test('cancel and disarm invalidate delayed ready callbacks and never finish an attempt', () => {
  const h = session();
  h.timer.arm(500, () => assert.fail('Cancelled hold became ready'));
  h.timer.disarm();
  h.ready();
  assert.equal(h.timer.view.state, 'idle');
  h.timer.arm(500, () => {});
  h.ready();
  h.timer.start({ ...attempt, track: false });
  h.advance(349);
  assert.equal(h.timer.mark(), null);
  h.timer.cancel();
  assert.equal(h.timer.stop(), null);
  assert.equal(h.timer.view.elapsed, 0);
});
