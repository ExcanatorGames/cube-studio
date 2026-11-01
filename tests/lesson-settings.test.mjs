import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/app-harness.mjs';

test('Lessons settings save preparation independently without replacing the four-pair practice exercise',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13')");
  const exercise=h.run('lessonSession.context.exercise');
  const requests=h.lessonMessages.length;
  h.element('#open-settings').onclick();
  h.element('#settings-tab-lessons').onclick();
  assert.equal(h.element('#settings-panel-lessons').hidden,false);
  assert.equal(h.element('#settings-panel-general').hidden,true);
  assert.equal(h.element('#lesson-scramble-mode').value,'random');
  h.element('#lesson-scramble-mode').value='setup';
  h.element('#save-lesson-settings').onclick();
  assert.equal(h.run('settings.lessonScrambleMode'),'setup');
  assert.equal(h.run('lessonSession.context.exercise'),exercise);
  assert.equal(h.lessonMessages.length,requests);
  assert.equal(exercise.steps.length,4);
  const reloaded=harness({saved:JSON.parse(h.storage.get('cube-studio-v1'))});
  reloaded.element('#open-settings').onclick();
  assert.equal(reloaded.element('#lesson-scramble-mode').value,'setup');
  reloaded.element('#settings-tab-lessons').onkeydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(reloaded.element('#settings-tab-splits').getAttribute('aria-selected'),'true');
});

test('lesson preparation cannot change during a practice attempt',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13');setLessonTab('practice');arm()");
  h.arm();h.run('start()');
  h.element('#lesson-scramble-mode').value='setup';
  h.element('#save-lesson-settings').onclick();
  assert.equal(h.run('settings.lessonScrambleMode'),'random');
  assert.equal(h.run('timing.state'),'running');
});
