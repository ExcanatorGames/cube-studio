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
  h.element('#analysis-tab-history').onclick();
  assert.match(h.element('#history-body').innerHTML, /12\.34/);
  assert.equal(h.element('#storage-warning').hidden, false);
});

test('an intact pending copy restores damaged history before a user edits it', () => {
  const intact = { ...savedSolve, note: 'Preserve my practice note' };
  const h = harness({
    saved: {
      solves: [{ ...intact, note: { damaged: true } }],
      pending: [intact],
    },
  });
  h.run(`openSolve(${JSON.stringify(intact.id)})`);
  assert.equal(h.element('#solve-note').value, intact.note);
  h.element('#save-solve').onclick();
  const stored = JSON.parse(h.storage.get('cube-studio-v1'));
  assert.equal(stored.solves[0].note, intact.note);
  assert.equal(stored.pending[0].note, intact.note);
});

test('an invalid split-list draft cannot poison later settings or solve saves', () => {
  const accepted = ['First phase', 'Second phase'];
  for (const draft of [
    Array.from({ length: 13 }, (_, i) => `Step ${i + 1}`).join(', '),
    'x'.repeat(51) + ', Finish',
  ]) {
    const h = harness({ saved: { settings: { custom: accepted } } });
    h.element('#new-split-method').onclick();
    h.element('#split-name').value = 'Draft';
    h.element('#split-words').value = draft;
    h.element('#save-split-method').onclick();
    assert.match(h.element('#split-editor-error').textContent, /12 steps/);
    h.element('#split-editor-dialog').close();
    h.element('#open-settings').onclick();
    h.element('#save-settings').onclick();
    addTime(h);
    assert.equal(h.element('#storage-warning').hidden, true);
    const stored = JSON.parse(h.storage.get('cube-studio-v1'));
    assert.equal(stored.solves.length, 1);
    assert.deepEqual(stored.settings.custom, accepted);
  }
});
