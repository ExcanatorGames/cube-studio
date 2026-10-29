import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initPracticeSelection} from '../web/lesson-presentation.js';

function harness() {
  const events=new Map(),timers=new Map(),held=[];
  let next=0;
  const root={addEventListener(type,callback){events.set(type,callback);}};
  const view={setTimeout(callback){timers.set(++next,callback);return next;},clearTimeout(id){timers.delete(id);},addEventListener(type,callback){events.set('view:'+type,callback);}};
  const button={dataset:{practiceOpen:'f2l-2'}};
  initPracticeSelection({root,view,onHold:id=>held.push(id)});
  const emit=(type,values={})=>{
    const event={button:0,pointerId:1,isPrimary:true,clientX:20,clientY:20,detail:1,
      target:{closest:selector=>selector==='[data-practice-open]'?button:null},
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};
    events.get(type)?.(event);return event;
  };
  const hold=()=>{for(const [id,callback] of timers){timers.delete(id);callback();}};
  return {emit,hold,held};
}

test('holding enters selection once and consumes the release click',()=>{
  const h=harness();h.emit('pointerdown');h.hold();h.hold();h.emit('pointerup');
  assert.deepEqual(h.held,['f2l-2']);
  const click=h.emit('click');assert.equal(click.prevented,true);assert.equal(click.stopped,true);
  h.emit('pointerdown');h.emit('pointerup');
  assert.notEqual(h.emit('click').prevented,true,'a fresh tap may open the mix');
});

test('short taps, scrolling, cancellation and multiple contacts do not enter selection',()=>{
  for(const interrupt of [h=>h.emit('pointerup'),h=>h.emit('pointermove',{clientY:45}),
    h=>h.emit('pointercancel'),h=>h.emit('pointerleave'),h=>h.emit('view:scroll'),
    h=>h.emit('view:blur'),h=>h.emit('pointerdown',{pointerId:2,isPrimary:false})]){
    const h=harness();h.emit('pointerdown');interrupt(h);h.hold();
    assert.deepEqual(h.held,[]);
  }
  const h=harness();
  const checkbox={closest:()=>null};
  h.emit('pointerdown',{target:checkbox});
  assert.notEqual(h.emit('click',{target:checkbox}).prevented,true,'checkbox clicks keep their native toggle behavior');
});

test('small finger movement permits a hold and keyboard selection preserves normal activation',()=>{
  const h=harness();h.emit('pointerdown');h.emit('pointermove',{clientX:24,clientY:24});h.hold();
  assert.deepEqual(h.held,['f2l-2']);
  assert.notEqual(h.emit('click',{detail:0}).prevented,true);
  const key=h.emit('keydown',{key:'F10',shiftKey:true});
  assert.equal(key.prevented,true);assert.deepEqual(h.held,['f2l-2','f2l-2']);
});
