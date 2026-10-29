import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/app-harness.mjs';

test('timer split selection preserves the toggle and locks during arming and solving', () => {
  const h = harness();
  const picker = h.element('#timer-split-method');
  const choose = id => h.element('#timer-split-menu').onclick({target:{closest:()=>({dataset:{splitMethod:id}})}});
  choose('cfop');
  assert.equal(h.run('settings.preset'), 'cfop');
  assert.equal(h.run('settings.track'), false);
  h.element('#fullscreen-track').onclick();
  assert.equal(h.run('settings.track'), true);
  assert.deepEqual(Array.from(h.run('names()')), ['Cross','F2L','OLL','PLL']);
  h.run('arm()');
  assert.equal(picker.disabled, true);
  choose('roux');
  assert.equal(h.run('settings.preset'), 'cfop');
  h.arm();
  h.run('start()');
  choose('roux');
  assert.equal(h.run('settings.preset'), 'cfop');
  assert.deepEqual(Array.from(h.run('timing.activeNames')), ['Cross','F2L','OLL','PLL']);
  h.run('cancel()');
  assert.equal(picker.disabled, false);
});

test('the split selector handles no lists and stays hidden in lesson practice', () => {
  const empty = harness({saved:{settings:{splitMethods:[]}}});
  assert.equal(empty.element('#timer-split-method').disabled, true);
  empty.element('#fullscreen-track').onclick();
  assert.equal(empty.run('settings.track'), false);
  const h = harness();
  h.run("setPage('lessons');openLesson('13');setLessonTab('practice')");
  assert.equal(h.element('#timer-split-control').hidden, true);
  assert.equal(h.element('#timer-split-method').disabled, true);
  h.run("setPage('timer')");
  assert.equal(h.element('#timer-split-control').hidden, false);
  assert.equal(h.element('#timer-split-method').disabled, false);
});
