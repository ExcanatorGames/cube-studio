import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/app-harness.mjs';
import {cubeSVG,orientAlgorithm} from '../web/cube.js';

test('timer orientation updates the preview, persists, and stays separate from lessons',()=>{
  const h=harness(),scramble=h.run('scramble');
  assert.equal(h.element('#cube-orientation').disabled,false);
  h.element('#cube-orientation').onclick();
  assert.equal(h.run('settings.orientation'),'white-bottom');
  assert.equal(h.run('settings.lessonOrientation'),'white-bottom');
  const bottomScramble=orientAlgorithm(scramble,'white-top','white-bottom');
  assert.equal(h.run('scramble'),bottomScramble);
  assert.equal(h.run('normalScramble.scramble'),scramble);
  assert.equal(h.element('#cube-preview').innerHTML,cubeSVG(bottomScramble,{orientation:'white-bottom'}));
  assert.match(h.element('#cube-preview').innerHTML,/yellow on top, white on bottom/);
  assert.equal(h.element('#cube-orientation').textContent,'White ↓');
  const reloaded=harness({saved:JSON.parse(h.storage.get('cube-studio-v1'))});
  assert.equal(reloaded.run('settings.orientation'),'white-bottom');
  assert.equal(reloaded.element('#cube-orientation').textContent,'White ↓');
  h.run("setPage('lessons');openLesson('13')");
  h.element('#cube-orientation').onclick();
  assert.equal(h.run('settings.lessonOrientation'),'white-top');
  assert.equal(h.run('settings.orientation'),'white-bottom');
  assert.equal(h.run('scramble'),h.run('timerContext.exercise.scramble'));
  h.element('#lesson-help').onclick();
  assert.equal(h.element('#lesson-solution strong').textContent,h.run('changeLessonFrame(timerContext.exercise.solution)'));
  assert.match(h.element('#cube-preview').innerHTML,/white on top and green in front/);
  h.run("setPage('timer')");
  assert.equal(h.element('#cube-orientation').textContent,'White ↓');
  assert.equal(h.run('scramble'),bottomScramble);
  h.element('#cube-orientation').onclick();
  assert.equal(h.run('scramble'),scramble);
});

test('new timer scrambles use the selected frame once and survive visits to lessons',async()=>{
  const h=harness({saved:{settings:{orientation:'white-bottom'}}});
  h.run(`navigator.onLine=true;officialScrambler=Promise.resolve({randomScrambleForEvent:async()=>"R U F' D2 L' B"})`);
  await h.run('newScramble()');
  assert.equal(h.run('normalScramble.scramble'),"R U F' D2 L' B");
  assert.equal(h.run('scramble'),"L D F' U2 R' B");
  h.run("setPage('lessons');openLesson('13');setPage('timer')");
  assert.equal(h.run('scramble'),"L D F' U2 R' B");
  h.element('#cube-orientation').onclick();
  assert.equal(h.run('scramble'),"R U F' D2 L' B");
});

test('lesson scrambles and previews use the same U/F/R frame in both orientations',()=>{
  const h=harness();h.run("setPage('lessons');openLesson('13')");
  const original=h.run('timerContext.exercise');
  for(const orientation of ['white-bottom','white-top','white-bottom']){
    if(h.run('cubeOrientation()')!==orientation)h.element('#cube-orientation').onclick();
    const displayed=h.run('scramble');
    assert.equal(h.element('#cube-preview').innerHTML,cubeSVG(displayed,{orientation}));
    assert.equal(h.run('timerContext.exercise'),original);
    assert.equal(displayed,orientation==='white-bottom'?original.setup:original.scramble);
  }
});

test('lesson preference in Settings applies to the current exercise and persists independently',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13')");
  const canonical=h.run('timerContext.exercise');
  h.element('#open-settings').onclick();
  assert.equal(h.element('#lesson-orientation').value,'white-bottom');
  h.element('#lesson-orientation').value='white-top';
  h.element('#save-settings').onclick();
  assert.equal(h.run('timerContext.exercise'),canonical);
  assert.equal(h.run('scramble'),canonical.scramble);
  assert.equal(h.run('settings.orientation'),'white-top');
  assert.equal(h.element('#cube-orientation').textContent,'White ↑');
  assert.equal(JSON.parse(h.storage.get('cube-studio-v1')).settings.lessonOrientation,'white-top');
});

test('orientation is locked while arming and timing, including lesson practice',()=>{
  for(const lesson of [false,true]){
    const h=harness();
    if(lesson)h.run("setPage('lessons');openLesson('13');setLessonTab('practice')");
    const original=h.run('cubeOrientation()'),scramble=h.run('scramble');
    h.run('arm()');
    assert.equal(h.element('#cube-orientation').disabled,true);
    h.element('#cube-orientation').onclick();
    assert.equal(h.run('cubeOrientation()'),original);
    h.arm();h.run('start()');
    h.element('#cube-orientation').onclick();
    assert.equal(h.run('cubeOrientation()'),original);
    assert.equal(h.run('activeAttempt.scramble'),scramble);
    assert.equal(h.element('#cube-orientation').disabled,true);
    h.run('cancel()');
    assert.equal(h.element('#cube-orientation').disabled,false);
  }
});

test('pending lesson requests use the latest preference and cannot be toggled early',()=>{
  const h=harness({deferLessonScrambles:true});
  h.run("setPage('lessons');openLesson('13')");
  assert.equal(h.element('#cube-orientation').disabled,true);
  h.element('#open-settings').onclick();
  h.element('#lesson-orientation').value='white-top';h.element('#save-settings').onclick();
  assert.equal(h.run('scramble'),'');
  h.lessonRequests[0]();
  assert.equal(h.element('#cube-orientation').disabled,false);
  assert.equal(h.run('scramble'),h.run('timerContext.exercise.scramble'));
  assert.match(h.element('#cube-preview').innerHTML,/white on top and green in front/);
});
