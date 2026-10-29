import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/app-harness.mjs';
import {cubeSVG,orientAlgorithm} from '../web/cube.js';

test('practice scramble preview follows the default scramble orientation instead of the lesson cross position',()=>{
  const h=harness({saved:{settings:{orientation:'white-top',scrambleOrientation:'default',lessonOrientation:'white-bottom'}}});
  h.run("setPage('practice');openLesson('13')");
  assert.match(h.element('#fullscreen-scramble').title, /white on top and green in front/);
  assert.match(h.element('#cube-preview').innerHTML, /white on top and green in front/);
});

function setTimerOrientation(h, orientation) {
  h.element('#open-settings').onclick();
  h.element('#cube-top').value = orientation === 'white-bottom' ? 'yellow' : 'white';
  h.element('#cube-front').value = 'green';
  h.element('#save-settings').onclick();
}
function setLessonOrientation(h, orientation) {
  h.element('#open-settings').onclick();
  h.element('#lesson-orientation').value = orientation;
  h.element('#save-settings').onclick();
}


test('timer orientation updates the preview, persists, and stays separate from lessons',()=>{
  const h=harness(),scramble=h.run('scramble');
  setTimerOrientation(h,'white-bottom');
  assert.equal(h.run('settings.orientation'),'white-bottom');
  assert.equal(h.run('settings.lessonOrientation'),'white-bottom');
  const bottomScramble=orientAlgorithm(scramble,'white-top','white-bottom');
  assert.equal(h.run('scramble'),bottomScramble);
  assert.equal(h.run('normalScramble.scramble'),scramble);
  assert.equal(h.element('#cube-preview').innerHTML,cubeSVG(bottomScramble,{orientation:'white-bottom'}));
  assert.match(h.element('#cube-preview').innerHTML,/yellow on top, white on bottom/);
  const reloaded=harness({saved:JSON.parse(h.storage.get('cube-studio-v1'))});
  assert.equal(reloaded.run('settings.orientation'),'white-bottom');
  h.run("setPage('lessons');openLesson('13')");
  setLessonOrientation(h,'white-top');
  assert.equal(h.run('settings.lessonOrientation'),'white-top');
  assert.equal(h.run('settings.orientation'),'white-bottom');
  assert.equal(h.run('scramble'),h.run('lessonSession.context.exercise.scramble'));
  h.element('#lesson-help').onclick();
  assert.equal(h.element('#lesson-solution strong').textContent,orientAlgorithm(h.run('lessonSession.context.exercise.solution'),'white-bottom','white-top'));
  assert.ok(h.run('lessonSession.context.exercise.solution').length);
  assert.match(h.element('#cube-preview').innerHTML,/yellow on top, white on bottom/);
  h.run("setPage('timer')");
  assert.equal(h.run('scramble'),bottomScramble);
  setTimerOrientation(h,'white-top');
  assert.equal(h.run('scramble'),scramble);
});

test('new timer scrambles use the selected frame once and survive visits to lessons',async()=>{
  const h=harness({saved:{settings:{orientation:'white-bottom'}}});
  h.run(`navigator.onLine=true;officialScrambler=({next:async()=>"R U F' D2 L' B"})`);
  await h.run('newScramble()');
  assert.equal(h.run('normalScramble.scramble'),"R U F' D2 L' B");
  assert.equal(h.run('scramble'),"L D F' U2 R' B");
  h.run("setPage('lessons');openLesson('13');setPage('timer')");
  assert.equal(h.run('scramble'),"L D F' U2 R' B");
  setTimerOrientation(h,'white-top');
  assert.equal(h.run('scramble'),"R U F' D2 L' B");
});

test('lesson scramble preview keeps the selected scramble frame across solving orientations',()=>{
  const h=harness();h.run("setPage('lessons');openLesson('13')");
  const original=h.run('lessonSession.context.exercise');
  for(const orientation of ['white-bottom','white-top','white-bottom']){
    if(h.run('cubeOrientation()')!==orientation)setLessonOrientation(h,orientation);
    const displayed=h.run('scramble');
    assert.equal(h.element('#cube-preview').innerHTML,cubeSVG(h.run('displayedScramble()'),{orientation:'white-top'}));
    assert.equal(h.run('lessonSession.context.exercise'),original);
    assert.equal(displayed,orientation==='white-bottom'?original.setup:original.scramble);
  }
});

test('lesson preference in Settings applies to the current exercise and persists independently',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13')");
  const canonical=h.run('lessonSession.context.exercise');
  h.element('#open-settings').onclick();
  assert.equal(h.element('#lesson-orientation').value,'white-bottom');
  h.element('#lesson-orientation').value='white-top';
  h.element('#save-settings').onclick();
  assert.equal(h.run('lessonSession.context.exercise'),canonical);
  assert.equal(h.run('scramble'),canonical.scramble);
  assert.equal(h.run('settings.orientation'),'white-top');
  assert.equal(JSON.parse(h.storage.get('cube-studio-v1')).settings.lessonOrientation,'white-top');
});

test('Settings cannot change orientation while arming and timing, including lesson practice',()=>{
  for(const lesson of [false,true]){
    const h=harness();
    if(lesson)h.run("setPage('lessons');openLesson('13');setLessonTab('practice')");
    const original=h.run('cubeOrientation()'),scramble=h.run('displayedScramble()');
    const change=()=>lesson?setLessonOrientation(h,'white-top'):setTimerOrientation(h,'white-bottom');
    h.run('arm()');
    change();
    assert.equal(h.run('cubeOrientation()'),original);
    h.arm();h.run('start()');
    change();
    assert.equal(h.run('cubeOrientation()'),original);
    assert.equal(h.run('timing.activeAttempt.scramble'),scramble);
    h.run('cancel()');
    change();
    assert.notEqual(h.run('cubeOrientation()'),original);
  }
});

test('pending lesson requests use the latest Settings preference',()=>{
  const h=harness({deferLessonScrambles:true});
  h.run("setPage('lessons');openLesson('13')");
  h.element('#open-settings').onclick();
  h.element('#lesson-orientation').value='white-top';h.element('#save-settings').onclick();
  assert.equal(h.run('scramble'),'');
  h.lessonRequests[0]();
  assert.equal(h.run('scramble'),h.run('lessonSession.context.exercise.scramble'));
  assert.match(h.element('#cube-preview').innerHTML,/white on top and green in front/);
});
