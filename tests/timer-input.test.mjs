import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/app-harness.mjs';

function pointers(h,type='mouse'){
  const event=id=>({pointerType:type,pointerId:id,button:0,target:{closest:()=>null},preventDefault(){}});
  return {
    down(id=1){h.listeners.get('#timer-pad:pointerdown')(event(id));},
    up(id=1){h.listeners.get('#timer-pad:pointerup')(event(id));},
  };
}

test('mouse and touch interaction with practice cases inside the timer never arm or start it',()=>{
  for(const pointerType of ['mouse','touch']){
    const h=harness();
    h.run("setPage('practice');openLesson('13')");
    for(const pointerId of [1,2]){
      const event={pointerType,pointerId,button:0,target:{closest:selector=>selector==='#practice-case-picker'?{}:null},preventDefault(){}};
      h.listeners.get('#timer-pad:pointerdown')(event);
      assert.equal(h.run('timing.state'),'idle');
      h.listeners.get('#timer-pad:pointerup')(event);
    }
    const pad=pointers(h);pad.down();h.arm();pad.up();
    assert.equal(h.run('timing.state'),'running');
  }
});

test('non-split mouse timing ignores an immediate second press and repeat presses after stopping',()=>{
  const h=harness(),p=pointers(h);
  p.down();h.arm();p.up();assert.equal(h.run('timing.state'),'running');
  h.advance(100);p.down();p.up();
  assert.equal(h.run('timing.state'),'running');assert.equal(h.run('records.size'),0);
  h.advance(250);p.down();p.up();
  assert.equal(h.run('timing.state'),'stopped');assert.equal(h.run('all()[0].ms'),350);
  p.down();p.up();assert.equal(h.run('timing.state'),'stopped');assert.equal(h.run('records.size'),1);
});

test('non-split touch timing ignores an accidental tap after releasing the starting hold',()=>{
  const h=harness();h.run("setPage('lessons');openLesson('13');setLessonTab('practice')");
  const p=pointers(h,'touch');p.down(1);p.down(2);h.arm();p.up(1);p.up(2);
  h.advance(349);p.down(3);p.up(3);
  assert.equal(h.run('timing.state'),'running');assert.equal(h.run('lessonAttempts.size'),0);
  h.advance(1);p.down(4);p.up(4);
  assert.equal(h.run('timing.state'),'stopped');assert.equal(h.run('practiceTimes()[0].ms'),350);
  p.down(5);p.down(6);p.up(5);p.up(6);
  assert.equal(h.run('timing.state'),'stopped');assert.equal(h.run('lessonAttempts.size'),1);
});

test('non-split keyboard timing applies the same protection to Space and Enter',()=>{
  for(const code of ['Space','Enter']){
    const h=harness(),down=h.listeners.get('window:keydown'),up=h.listeners.get('window:keyup');
    const event=code=>({code,target:{tagName:'DIV'},preventDefault(){}});
    down(event('Space'));h.arm();up(event('Space'));
    h.advance(100);down(event(code));up(event(code));assert.equal(h.run('timing.state'),'running');
    h.advance(250);down(event(code));up(event(code));assert.equal(h.run('timing.state'),'stopped');
    assert.equal(h.run('all()[0].ms'),350);
  }
});

test('split timing still accepts rapid consecutive split and finish taps',()=>{
  const h=harness();h.run('setTracking(true)');
  const p=pointers(h);p.down();h.arm();p.up();
  const count=h.run('timing.activeAttempt.splitNames.length');
  for(let i=1;i<=count;i++){
    h.advance(50);p.down();p.up();
    assert.equal(h.run('timing.state'),i===count?'stopped':'running');
  }
  assert.equal(h.run('all()[0].ms'),50*count);
  assert.deepEqual(Array.from(h.run('all()[0].splits'),s=>s.ms),Array.from({length:count},(_,i)=>(i+1)*50));
});
