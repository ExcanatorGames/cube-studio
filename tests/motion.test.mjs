import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMotion} from '../web/motion.js';

function harness(reduce=false){
  const preference={matches:reduce,addEventListener(_,listener){this.listener=listener;}};
  const motion=createMotion({matchMedia:()=>preference});
  const calls=[];
  function element(){
    return {rect:{left:20,top:100,width:300,height:600},getClientRects(){return [this.rect];},getBoundingClientRect(){return {...this.rect};},animate(frames,options){
      let finish,reject;
      const animation={finished:new Promise((resolve,fail)=>{finish=resolve;reject=fail;}),cancelled:false,cancel(){this.cancelled=true;reject(Error('Cancelled'));},finish(){finish();}};
      calls.push({frames,options,animation});return animation;
    }};
  }
  return {motion,preference,calls,element};
}

test('layout updates happen synchronously, including with reduced motion or a hidden surface',()=>{
  for(const reduced of [true,false]){
    const h=harness(reduced),el=h.element();let changed=false;
    if(!reduced)el.getClientRects=()=>[];
    h.motion.layout([el],()=>{changed=true;el.rect.top=0;});
    assert.equal(changed,true);assert.equal(h.calls.length,0);
  }
});

test('split layout motion uses final live layout and can be interrupted by another toggle',()=>{
  const h=harness(),el=h.element();
  h.motion.layout([el],()=>{el.rect={left:0,top:0,width:400,height:800};});
  assert.equal(el.rect.height,800);
  assert.equal(h.calls[0].frames[0].translate,'20px 100px');
  h.motion.layout([el],()=>{el.rect.top=50;});
  assert.equal(h.calls[0].animation.cancelled,true);
  assert.equal(h.calls[1].animation.cancelled,false);
  h.motion.clear();assert.equal(h.calls[1].animation.cancelled,true);
});

function transitionHarness(){
  const h=harness(),queued=[];
  const document={documentElement:{dataset:{},style:{setProperty(){}}},startViewTransition(callback){
    let finish,ready,reject;
    const t={ready:new Promise((resolve,fail)=>{ready=resolve;reject=fail;}),finished:new Promise(resolve=>{finish=resolve;}),skipped:false,skipTransition(){this.skipped=true;reject(Error('Skipped'));},async commit(){await callback();ready();finish();}};
    queued.push(t);return t;
  }};
  return {...h,document,queued,motion:createMotion({document,matchMedia:()=>h.preference})};
}

test('rapid page changes commit only the newest snapshot callback',async()=>{
  const h=transitionHarness(),states=[];
  assert.equal(h.motion.swap('page',()=>states.push('history')),true);
  h.motion.swap('page',()=>states.push('insights'));
  assert.equal(h.queued[0].skipped,true);
  await h.queued[0].commit();await h.queued[1].commit();
  assert.deepEqual(states,['insights']);
});

test('timer-start fullscreen state is immediate and cannot be overwritten by an older transition',async()=>{
  const h=transitionHarness(),states=[];
  h.motion.swap('focus',()=>states.push('normal'));
  h.motion.swap('focus',()=>states.push('fullscreen'),{immediate:true});
  assert.deepEqual(states,['fullscreen']);
  await h.queued[0].commit();assert.deepEqual(states,['fullscreen']);
});

test('changing reduced-motion preference preserves the requested destination',async()=>{
  const h=transitionHarness();let destination='timer';
  h.motion.swap('page',()=>destination='history');
  h.preference.matches=true;h.preference.listener({matches:true});
  assert.equal(h.queued[0].skipped,true);
  await h.queued[0].commit();assert.equal(destination,'history');
  h.motion.swap('page',()=>destination='insights');assert.equal(destination,'insights');
});

test('clearing motion before timing prevents any delayed state change',async()=>{
  const h=transitionHarness();let changed=false;
  h.motion.swap('focus',()=>changed=true);h.motion.clear();
  await h.queued[0].commit();assert.equal(changed,false);
});

test('reduced motion cancels active and staggered animations immediately and prevents new ones',()=>{
  const h=harness(),el=h.element();
  h.motion.reveal(el,{delay:100});assert.equal(h.calls.length,1);
  h.preference.matches=true;h.preference.listener({matches:true});
  assert.equal(h.calls[0].animation.cancelled,true);
  h.motion.reveal(el);assert.equal(h.calls.length,1);
});

test('finishing an older animation cannot discard the replacement animation',async()=>{
  const h=harness(),el=h.element();
  h.motion.reveal(el);h.calls[0].animation.finish();
  h.motion.reveal(el);await Promise.resolve();
  h.motion.clear();assert.equal(h.calls[1].animation.cancelled,true);
});
