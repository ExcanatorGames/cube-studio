import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/app-harness.mjs';

const savedSolve = {
  id: 'recoverable-solve',
  date: '2026-01-01T12:00:00Z',
  ms: 12340,
  penalty: 'none',
  scramble: "R U R'",
  splits: [],
  updatedAt: 1,
};

function addTime(h) {
  h.element('#manual-time').value = '12.34';
  h.element('#save-manual').onclick();
}

test('a failed device save stays visibly unsaved until retry succeeds', () => {
  const h = harness();
  h.run(
    'globalThis.originalWrite = localStorage.setItem; localStorage.setItem = () => { throw Error("Quota exceeded"); }',
  );
  addTime(h);
  assert.equal(h.element('#storage-warning').hidden, false);
  assert.match(
    h.element('#storage-message').textContent,
    /not saved|could not save/i,
  );
  assert.doesNotMatch(
    h.element('#mobile-sync').textContent,
    /saved offline|saved on device/i,
  );
  h.run('localStorage.setItem = globalThis.originalWrite');
  h.element('#retry-storage').onclick();
  assert.equal(h.element('#storage-warning').hidden, true);
  assert.equal(JSON.parse(h.storage.get('cube-studio-v1')).solves.length, 1);
  assert.match(h.element('#mobile-sync').textContent, /saved offline/i);
});

test('malformed stored collections do not prevent timing and expose recovery', () => {
  const h = harness({
    saved: { solves: {}, pending: null, lessonAttempts: 'invalid' },
  });
  assert.equal(h.element('#storage-warning').hidden, false);
  assert.match(
    h.element('#storage-message').textContent,
    /recover|damaged|read/i,
  );
  addTime(h);
  assert.equal(h.element('#manual-error').textContent, '');
});

test('recovery retains valid history beside invalid records', () => {
  const h = harness({
    saved: { solves: [savedSolve, null], pending: [], settings: null },
  });
  h.element('nav-history').onclick();
  assert.match(h.element('#history-body').innerHTML, /12\.34/);
  assert.equal(h.element('#storage-warning').hidden, false);
});
