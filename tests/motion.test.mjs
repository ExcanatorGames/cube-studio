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
    h.motion.layout([el],()=>{changed=true;el.rect.top=0;},{surface:true});
    assert.equal(changed,true);assert.equal(h.calls.length,0);
  }
});

test('fullscreen animation uses final live layout and can be interrupted by another toggle',()=>{
  const h=harness(),el=h.element();
  h.motion.layout([el],()=>{el.rect={left:0,top:0,width:400,height:800};},{surface:true});
  assert.equal(el.rect.height,800);
  assert.match(h.calls[0].frames[0].transform,/translate\(20px,100px\) scale\(0.75,0.75\)/);
  h.motion.layout([el],()=>{el.rect.top=50;},{surface:true});
  assert.equal(h.calls[0].animation.cancelled,true);
  assert.equal(h.calls[1].animation.cancelled,false);
  h.motion.clear();assert.equal(h.calls[1].animation.cancelled,true);
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
