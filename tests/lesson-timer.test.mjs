import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/app-harness.mjs';
import {LESSONS} from '../web/lessons.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';

test('lesson card keeps the canonical teaching view across saved orientations and later preference changes',()=>{
  const lesson=LESSONS[0],expected=lessonCubeSVG(lesson.case.setup,lesson.case);
  for(const orientation of ['white-top','white-bottom']){
    const h=harness({saved:{settings:{orientation,lessonOrientation:orientation}}});
    assert.ok(h.element('#lesson-cards').innerHTML.includes(expected),'Thumbnail must show yellow up and the marked ready-right pair');
    const initial=h.element('#lesson-cards').innerHTML;
    h.run(`settings.orientation='${orientation==='white-top'?'white-bottom':'white-top'}';settings.lessonOrientation=settings.orientation;refreshOrientation()`);
    assert.equal(h.element('#lesson-cards').innerHTML,initial,'Changing orientation must not change the lesson thumbnail');
  }
});

test('returning from lessons repeatedly restores the timer before recent solves',()=>{
  const h=harness();
  for(let i=0;i<3;i++){
    h.run("setPage('lessons');openLesson('13');setLessonTab('practice');setPage('timer')");
    assert.deepEqual(h.element('#timer-page').children.map(child=>child.id),['timer-card','timer-recent']);
  }
});

test('lesson shares the actual timer card and restores the prepared normal scramble and preferences',()=>{
  const h=harness(),normal=h.run('scramble');
  assert.match(h.element('#timer-instruction').innerHTML,/Hold · release/);
  h.run("setTracking(true);setPage('lessons');openLesson('13')");
  assert.equal(h.element('#timer-card').parentElement.id,'lesson-practice-mount');
  assert.equal(h.element('#fullscreen-lesson-title').textContent,'Use one F2L pair');
  assert.equal(h.element('#lesson-panel-lesson').hidden,false);
  assert.equal(h.element('#lesson-panel-practice').hidden,true);
  h.element('#lesson-tab-practice').onclick();
  assert.equal(h.run('names().length'),0);
  assert.equal(h.run('tracking()'),false);
  assert.equal(h.element('#fullscreen-track').hidden,true);
  assert.equal(h.element('#manual-entry').hidden,true);
  h.run('setTracking(false)');
  assert.equal(h.run('settings.track'),true);
  h.element('#lesson-help').onclick();
  assert.equal(h.element('#lesson-help').getAttribute('aria-pressed'),'true');
  assert.equal(h.element('#lesson-solution').hidden,false);
  assert.match(h.element('#cube-preview').innerHTML,/data-target=/);
  h.element('#lesson-help').onclick();
  assert.equal(h.element('#lesson-solution').hidden,true);
  assert.doesNotMatch(h.element('#cube-preview').innerHTML,/data-target=/);
  assert.ok(h.demoResets>0);
  h.run("setPage('timer')");
  assert.equal(h.element('#timer-card').parentElement.id,'timer-page');
  assert.equal(h.element('#fullscreen-lesson-title').hidden,true);
  assert.equal(h.run('scramble'),normal);
  assert.equal(h.run('tracking()'),true);
  assert.equal(h.run('settings.preset'),'beginner');
  assert.equal(h.demoDestroys,1);
});

test('busy lesson attempts lock context and finish on the first stop, with no splits',()=>{
  const h=harness();
  h.run("setTracking(true);setPage('lessons');openLesson('13');setLessonTab('practice');setTracking(true)");
  const initial=h.run('scramble');
  h.run('arm()');h.arm();h.run('start()');
  assert.equal(h.run('state'),'running');
  assert.ok(h.run('Object.isFrozen(activeAttempt)&&Object.isFrozen(activeAttempt.exercise)&&Object.isFrozen(activeAttempt.splitNames)'));
  assert.equal(h.element('#lesson-help').disabled,true);
  h.run("setPage('timer');newScramble();setTracking(false);openLesson('13')");
  assert.equal(h.run('scramble'),initial);
  assert.equal(h.run('page'),'lessons');
  assert.equal(h.run('activeAttempt.track'),false);
  assert.equal(h.run('activeAttempt.splitNames.length'),0);
  h.advance(6000);h.run('mark()');
  const stored=JSON.parse(h.storage.get('cube-studio-v1')),saved=stored.lessonAttempts[0];
  assert.equal(stored.solves.length,0);
  assert.equal(stored.pending.length,0);
  assert.equal(saved.lessonId,'13');
  assert.equal(saved.caseId,'ready-right');
  assert.equal(h.run('records.size'),0);
  assert.equal(saved.scramble,initial);
  assert.equal(saved.ms,6000);
  assert.deepEqual(saved.splits,[]);
  assert.match(saved.note,/13 · Use one F2L pair.*Full cube/);
  assert.notEqual(h.run('scramble'),initial);
  assert.equal(saved.source,'timer');
  assert.equal(h.run('state'),'stopped');
});

test('Space only arms a visible timer and Escape cancels a lesson without a saved solve',()=>{
  const h=harness(),keydown=h.listeners.get('window:keydown'),keyup=h.listeners.get('window:keyup');
  const event=code=>({code,target:{tagName:'DIV'},preventDefault(){}});
  h.run("setPage('lessons')");keydown(event('Space'));keyup(event('Space'));
  assert.equal(h.run('state'),'idle');
  h.run("openLesson('13')");keydown(event('Space'));keyup(event('Space'));
  assert.equal(h.run('state'),'idle');
  h.run('arm()');
  assert.equal(h.run('state'),'idle');
  h.element('#lesson-tab-practice').onclick();
  keydown(event('Space'));h.arm();keyup(event('Space'));
  assert.equal(h.run('state'),'running');
  keydown(event('Escape'));
  assert.equal(h.run('state'),'idle');
  assert.equal(h.run('records.size'),0);
  assert.equal(h.element('body').classList.contains('focus-mode'),false);
});

test('a delayed normal scramble cannot replace an exercise after opening a lesson',async()=>{
  const h=harness();
  h.run('navigator.onLine=true');
  h.run('officialScrambler=Promise.resolve({randomScrambleForEvent:()=>new Promise(resolve=>globalThis.completeScramble=resolve)})');
  const pending=h.run('newScramble()');
  await Promise.resolve();
  const complete=h.run('completeScramble');
  h.run("setPage('lessons');openLesson('13')");
  const exercise=h.run('scramble');
  complete('R2 U2 F2');await pending;
  assert.equal(h.run('scramble'),exercise);
  assert.equal(h.run('scrambleKind'),'Ready right · White on bottom');
});

test('leaving a lesson regenerates an interrupted replacement scramble without reusing the finished solve',async()=>{
  const h=harness(),used=h.run('scramble');
  h.run('arm()');h.arm();h.run('start()');h.advance(5000);
  h.run('navigator.onLine=true;globalThis.scrambleCompletions=[];officialScrambler=Promise.resolve({randomScrambleForEvent:()=>new Promise(resolve=>scrambleCompletions.push(resolve))})');
  h.run('stop()');
  await new Promise(setImmediate);
  assert.equal(JSON.parse(h.storage.get('cube-studio-v1')).solves[0].scramble,used);
  const completeStale=h.run('scrambleCompletions[0]');
  h.run("setPage('lessons');openLesson('13');setPage('timer')");
  assert.equal(h.element('#scramble-type').textContent,'Preparing…');
  assert.notEqual(h.run('scramble'),used);
  await new Promise(setImmediate);
  h.run("scrambleCompletions[1]('F2 D2 L2')");
  await new Promise(setImmediate);
  assert.equal(h.run('scramble'),'F2 D2 L2');
  assert.equal(h.element('#new-scramble').disabled,false);
  completeStale('R2 U2 F2');
  await new Promise(setImmediate);
  assert.equal(h.run('scramble'),'F2 D2 L2');
  assert.equal(h.element('#scramble-type').textContent,'Random state');
  h.run("setPage('lessons');openLesson('13');setPage('timer')");
  assert.equal(h.run('scramble'),'F2 D2 L2');
});

test('two-finger hold and release starts the shared lesson timer and a later tap finishes it',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13');setLessonTab('practice')");
  const down=h.listeners.get('#timer-pad:pointerdown'),up=h.listeners.get('#timer-pad:pointerup');
  const touch=id=>({pointerType:'touch',pointerId:id,target:{closest:()=>null},preventDefault(){}});
  down(touch(1));assert.equal(h.run('state'),'idle');
  down(touch(2));assert.equal(h.run('state'),'arming');
  h.arm();up(touch(1));assert.equal(h.run('state'),'armed');
  up(touch(2));assert.equal(h.run('state'),'running');
  h.advance(5000);down(touch(3));up(touch(3));
  assert.equal(h.run('state'),'stopped');
  assert.equal(h.run('records.size'),0);
  assert.equal(h.run('lessonAttempts.size'),1);
});

test('lesson tabs preserve the generated exercise and hints while keeping splits unavailable',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13')");
  const exercise=h.run('timerContext.exercise'),scramble=h.run('scramble'),card=h.element('#timer-card');
  const resets=h.demoResets;
  h.element('#lesson-tab-practice').onclick();
  assert.equal(h.demoResets,resets+1);
  h.element('#lesson-help').onclick();
  h.element('#fullscreen-track').onclick();
  h.element('#lesson-tab-lesson').onclick();
  assert.equal(h.run('timerVisible()'),false);
  assert.equal(h.element('#lesson-panel-practice').hidden,true);
  assert.equal(h.element('#lesson-panel-lesson').hidden,false);
  h.element('#lesson-tab-practice').onclick();
  assert.equal(h.run('timerContext.exercise'),exercise);
  assert.equal(h.run('scramble'),scramble);
  assert.equal(h.element('#timer-card'),card);
  assert.equal(card.parentElement.id,'lesson-practice-mount');
  assert.equal(h.element('#lesson-help').getAttribute('aria-pressed'),'true');
  assert.equal(h.element('#fullscreen-track').getAttribute('aria-pressed'),'false');
  assert.equal(h.element('#fullscreen-track').hidden,true);
  assert.equal(h.element('#lesson-panel-lesson').hidden,true);
  assert.equal(h.element('#lesson-panel-practice').hidden,false);
});

test('tabs expose their selected state and support wrapping arrows, Home and End with focus',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13')");
  function press(from,key,expected){
    let prevented=false;
    h.element('#lesson-tab-'+from).onkeydown({key,preventDefault(){prevented=true;}});
    const selected=h.element('#lesson-tab-'+expected),other=h.element('#lesson-tab-'+(expected==='lesson'?'practice':'lesson'));
    assert.equal(prevented,true);
    assert.equal(h.run('document.activeElement'),selected);
    assert.equal(selected.getAttribute('aria-selected'),'true');assert.equal(selected.tabIndex,0);
    assert.equal(other.getAttribute('aria-selected'),'false');assert.equal(other.tabIndex,-1);
    assert.equal(h.element('#lesson-panel-'+expected).hidden,false);
  }
  press('lesson','ArrowRight','practice');
  press('practice','ArrowRight','lesson');
  press('lesson','ArrowLeft','practice');
  press('practice','Home','lesson');
  press('lesson','End','practice');
});

test('arming, armed and running attempts lock tab clicks and keyboard navigation until cancelled',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13');setLessonTab('practice');arm()");
  const scramble=h.run('scramble');
  function locked(expected){
    assert.equal(h.run('state'),expected);
    assert.equal(h.element('#lesson-tab-lesson').disabled,true);
    assert.equal(h.element('#lesson-tab-practice').disabled,true);
    h.element('#lesson-tab-lesson').onclick();
    h.element('#lesson-tab-practice').onkeydown({key:'Home',preventDefault(){}});
    assert.equal(h.element('#lesson-panel-practice').hidden,false);
    assert.equal(h.element('#lesson-panel-lesson').hidden,true);
    assert.equal(h.run('scramble'),scramble);
    assert.equal(h.run('state'),expected);
  }
  locked('arming');h.arm();locked('armed');h.run('start()');locked('running');
  h.run('cancel()');
  assert.equal(h.element('#lesson-tab-lesson').disabled,false);
  assert.equal(h.element('#lesson-tab-practice').disabled,false);
  h.element('#lesson-tab-lesson').onclick();
  assert.equal(h.element('#lesson-panel-practice').hidden,true);
  assert.equal(h.run('records.size'),0);
});

test('practice times survive reload and stay out of history, exports, sync and normal comparisons',()=>{
  const h=harness();
  h.run("setPage('lessons');openLesson('13');setLessonTab('practice');arm()");h.arm();h.run('start()');
  h.advance(4321);h.run('stop()');
  assert.equal(h.run('lessonAttempts.size'),1);
  assert.equal(h.run('all().length'),0);
  assert.equal(h.run('pending.size'),0);
  assert.equal(h.run('practiceTimes()[0].ms'),4321);
  const stored=JSON.parse(h.storage.get('cube-studio-v1'));
  const reloaded=harness({saved:stored});
  reloaded.run("setPage('lessons');openLesson('13')");
  assert.equal(reloaded.run('practiceTimes()[0].ms'),4321);
  reloaded.run("setPage('timer');arm()");reloaded.arm();reloaded.run('start()');reloaded.advance(9000);reloaded.run('stop()');
  assert.equal(reloaded.run('records.size'),1);
  assert.equal(reloaded.run('lessonAttempts.size'),1);
  assert.equal(reloaded.run('all()[0].ms'),9000);
  assert.equal(reloaded.run('pending.size'),1);
});

test('practice keeps hints but removes manual entry and split timing, restoring normal controls on exit',()=>{
  const h=harness();h.run("setPage('lessons');openLesson('13');setLessonTab('practice')");
  assert.match(h.element('#lesson-help').innerHTML,/✕.*Hints/);
  assert.equal(h.element('#fullscreen-track').hidden,true);
  assert.equal(h.element('#manual-entry').hidden,true);
  h.element('#lesson-help').onclick();h.element('#fullscreen-track').onclick();
  assert.match(h.element('#lesson-help').innerHTML,/✓.*Hints/);
  assert.equal(h.run('tracking()'),false);
  assert.equal(h.element('#fullscreen-splits').hidden,true);
  h.element('#manual-time').value='12.34';h.element('#save-manual').onclick();
  assert.equal(h.run('lessonAttempts.size'),0);
  assert.equal(h.run('records.size'),0);
  assert.equal(h.run('pending.size'),0);
  h.run("setPage('timer')");
  assert.equal(h.element('#fullscreen-track').hidden,false);
  assert.equal(h.element('#manual-entry').hidden,false);
  h.element('#manual-time').value='12.34';h.element('#save-manual').onclick();
  assert.equal(h.run('records.size'),1);
});

test('toggling hints updates markers immediately without fading the cube or scramble out',()=>{
  const h=harness();h.run("setPage('lessons');openLesson('13');setLessonTab('practice')");
  const animations=[];
  for(const selector of ['#cube-preview','#fullscreen-scramble']){
    const element=h.element(selector);
    element.getClientRects=()=>[{}];
    element.animate=(keyframes)=>{animations.push({selector,keyframes});return {finished:Promise.resolve(),cancel(){}};};
  }
  h.element('#lesson-help').onclick();
  assert.match(h.element('#cube-preview').innerHTML,/data-target=/);
  assert.equal(h.element('#lesson-solution').hidden,false);
  assert.equal(animations.length,0,'enabling hints must not start an opacity-zero reveal');
  h.element('#lesson-help').onclick();
  assert.doesNotMatch(h.element('#cube-preview').innerHTML,/data-target=/);
  assert.equal(h.element('#lesson-solution').hidden,true);
  assert.equal(animations.length,0,'disabling hints must not start an opacity-zero reveal');
});

test('pending lesson scrambles cannot start or save a timer, and leaving ignores the worker result',()=>{
  const h=harness({deferLessonScrambles:true}),normal=h.run('scramble');
  h.run("setPage('lessons');openLesson('13');setLessonTab('practice');arm()");
  assert.equal(h.run('state'),'idle');assert.equal(h.run('scramble'),'');
  assert.equal(h.element('#new-scramble').disabled,true);
  assert.equal(h.element('#manual-entry').disabled,true);
  assert.equal(h.element('#lesson-help').disabled,true);
  assert.equal(h.run('lessonDemo'),null);
  h.run("setPage('timer')");h.lessonRequests[0]();
  assert.equal(h.run('scramble'),normal);
  assert.equal(h.run('timerContext.kind'),'normal');
  assert.equal(h.run('lessonDemo'),null);
});

test('only the newest lesson request can install a case, including after a worker failure',()=>{
  const h=harness({deferLessonScrambles:true});
  h.run("setPage('lessons');openLesson('13');newScramble()");
  h.lessonRequests[0]();assert.equal(h.run('scramble'),'');
  h.lessonRequests[1]();
  assert.ok(h.run('scramble.length')>0);
  assert.equal(h.element('#new-scramble').disabled,false);
  assert.equal(h.element('#manual-entry').disabled,false);
  assert.ok(h.run('Object.isFrozen(timerContext.exercise.target)'));
  h.run('newScramble();lessonScrambler.onerror()');
  assert.equal(h.run('scramble'),'');
  assert.equal(h.element('#new-scramble').disabled,false);
  assert.equal(h.element('#manual-entry').disabled,true);
  h.run('newScramble()');h.lessonRequests.at(-1)();
  assert.ok(h.run('scramble.length')>0);
});
