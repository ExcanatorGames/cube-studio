import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLessonDemo} from '../web/lesson-view.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';
import {LESSONS,orientLessonCase} from '../web/lessons.js';
import {createExercise} from '../web/lesson-scrambler.js';

const options={...LESSONS[0].case,...createExercise('13',{varied:false})};

function demo({reduced=false}={}){
  const elements=new Map(),timers=new Map(),frames=new Map(),listeners=new Map();let now=0,id=0;
  const runtime={
    performance:{now:()=>now},matchMedia:()=>({matches:reduced}),
    setTimeout(fn,delay){timers.set(++id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},
  };
  const get=selector=>{
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',disabled:false,attrs:{},setAttribute(name,value){this.attrs[name]=value;}});
    return elements.get(selector);
  };
  const root={innerHTML:'',querySelector:get,querySelectorAll:()=>[],contains:()=>true,addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},replaceChildren(){this.innerHTML='';}};
  const view=createLessonDemo(root,{...LESSONS[0],case:options},runtime);
  return {view,get,root,frames,timers,
    click(dataset){listeners.get('click')?.({target:{closest:()=>({dataset})}});},
    speed(value){const input=get('#lesson-animation-speed');input.value=String(value);listeners.get('input')?.({target:input});},
    tick(ms){
      const end=now+ms;
      while(true){
        const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
        if(!entry||entry[1].at>end)break;
        now=entry[1].at;timers.delete(entry[0]);entry[1].fn();
      }
      now=end;
      const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(now);
    },
    svg:()=>get('.lesson-cube').innerHTML,
  };
}
const expected=alg=>lessonCubeSVG(alg,options);

test('Next and Previous tween the affected layer and settle on authoritative lesson states',()=>{
  const d=demo(),initial=d.svg();
  assert.equal(initial,expected(options.setup));
  d.click({action:'next'});
  assert.match(d.get('.lesson-moves').innerHTML,/aria-current="step">U/);
  assert.ok(d.get('[data-action="next"]').disabled);
  assert.ok(d.get('[data-action="previous"]').disabled);
  d.tick(240);const halfway=d.svg();
  assert.notEqual(halfway,initial);
  assert.notEqual(halfway,expected(options.setup+' U'));
  d.click({action:'next'});d.click({action:'previous'});
  d.tick(240);assert.equal(d.svg(),expected(options.setup+' U'));
  d.click({action:'previous'});
  d.tick(240);assert.notEqual(d.svg(),initial);
  d.tick(240);assert.equal(d.svg(),initial);
  assert.ok(d.get('[data-action="previous"]').disabled);
});

test('Play leaves a reading pause between turns and stops at the last completed move',()=>{
  const d=demo();d.click({action:'play'});
  d.tick(599);assert.equal(d.svg(),expected(options.setup));
  d.tick(1);
  for(let i=0;i<4;i++){
    d.tick(240);
    d.tick(240);
    assert.equal(d.svg(),expected([options.setup,...options.solution.split(' ').slice(0,i+1)].join(' ')));
    if(i<3){const rest=d.svg();d.tick(469);assert.equal(d.svg(),rest);d.tick(1);}
  }
  assert.equal(d.get('[data-action="play"]').textContent,'Play');
  assert.equal(d.frames.size+d.timers.size,0);
  d.click({action:'play'});assert.equal(d.svg(),expected(options.setup));
});

test('Pause during a turn finishes that turn once and does not advance again',()=>{
  const d=demo();d.click({action:'play'});d.tick(600);d.tick(240);
  const mid=d.svg();d.click({action:'play'});assert.equal(d.svg(),mid);
  d.tick(240);assert.equal(d.svg(),expected(options.setup+' U'));
  d.tick(5000);assert.equal(d.svg(),expected(options.setup+' U'));
  assert.equal(d.frames.size+d.timers.size,0);
  d.click({action:'play'});d.tick(600);assert.match(d.get('.lesson-moves').innerHTML,/aria-current="step">R/);
});

test('Pause during the reading delay cancels it, and resume midturn schedules only one successor',()=>{
  const d=demo();d.click({action:'play'});const stale=[...d.timers.values()][0].fn;
  d.click({action:'play'});stale();d.tick(3000);assert.equal(d.svg(),expected(options.setup));
  d.click({action:'next'});d.tick(240);
  d.click({action:'play'});d.click({action:'play'});d.click({action:'play'});
  d.tick(240);assert.equal(d.timers.size,1);
  d.click({action:'play'});d.tick(5000);assert.equal(d.svg(),expected(options.setup+' U'));
});

for(const action of ['reset','external reset','destroy'])test(action+' cancels frames and stale callbacks without ghost updates',()=>{
  const d=demo();d.click({action:'play'});const timer=[...d.timers.values()][0].fn;
  d.tick(600);d.tick(240);const frame=[...d.frames.values()][0];
  if(action==='reset')d.click({action:'reset'});
  if(action==='external reset')d.view.reset();
  if(action==='destroy')d.view.destroy();
  const snapshot=d.svg();
  assert.equal(d.frames.size+d.timers.size,0);
  timer();frame(10000);d.tick(10000);
  assert.equal(d.svg(),snapshot);
  if(action==='destroy'){
    assert.equal(d.root.innerHTML,'');d.view.reset();d.view.destroy();assert.equal(d.root.innerHTML,'');
  }else{
    assert.equal(d.svg(),expected(options.setup));
    d.click({action:'next'});d.tick(480);
    assert.equal(d.svg(),expected(options.setup+' U'));
  }
});

test('demo exposes insertion playback with a scramble matching its cube orientation',()=>{
  const d=demo();
  assert.doesNotMatch(d.root.innerHTML,/Watch setup|data-mode|Demonstration sequence|lesson-move-status|lesson-marker-key/);
  assert.ok(d.root.innerHTML.includes(`<code>${options.setup}</code>`));
  assert.equal(d.svg(),expected(options.setup));
  assert.equal(d.get('.lesson-moves').innerHTML.match(/<span/g).length,4);
});

test('changing orientation during playback cancels old turns and transforms the same exercise',()=>{
  const d=demo(),top=orientLessonCase(options,'white-top');
  d.click({action:'play'});d.tick(600);d.tick(240);
  const stale=[...d.frames.values()][0];
  d.view.setOrientation('white-top');
  assert.equal(d.frames.size+d.timers.size,0);
  assert.equal(d.svg(),lessonCubeSVG(top.setup,top));
  assert.equal(d.get('.lesson-demo-setup code').textContent,top.setup);
  assert.match(d.get('.lesson-moves').innerHTML,/>D<\/span>/);
  stale(10000);d.tick(10000);
  assert.equal(d.svg(),lessonCubeSVG(top.setup,top));
  d.click({action:'next'});d.tick(480);
  assert.equal(d.svg(),lessonCubeSVG(top.setup+' D',top));
  d.view.setOrientation('white-bottom');
  assert.equal(d.svg(),expected(options.setup));
});

test('reduced motion advances canonical steps without tween frames and retains playback pauses',()=>{
  const d=demo({reduced:true});d.click({action:'next'});
  assert.equal(d.svg(),expected(options.setup+' U'));assert.equal(d.frames.size,0);
  d.click({action:'previous'});assert.equal(d.svg(),expected(options.setup));
  d.click({action:'play'});d.tick(600);assert.equal(d.svg(),expected(options.setup+' U'));
  d.tick(470);assert.equal(d.svg(),expected(options.setup+' U R'));
  d.view.reset();d.tick(5000);assert.equal(d.svg(),expected(options.setup));
});

test('speed changes scale turns and pauses, including a change halfway through a turn',()=>{
  const d=demo();d.speed(0.5);d.click({action:'next'});
  d.tick(480);assert.notEqual(d.svg(),expected(options.setup+' U'));
  d.speed(4);d.tick(59);assert.notEqual(d.svg(),expected(options.setup+' U'));
  d.tick(1);assert.equal(d.svg(),expected(options.setup+' U'));
  assert.equal(d.get('.lesson-speed output').textContent,'4×');
  d.click({action:'play'});d.tick(149);assert.equal(d.frames.size,0);
  d.tick(1);assert.equal(d.frames.size,1);
  d.tick(120);assert.equal(d.svg(),expected(options.setup+' U R'));
  d.tick(117);assert.equal(d.frames.size,0);
  d.tick(0.5);assert.equal(d.frames.size,1);
  d.view.reset();assert.equal(d.frames.size+d.timers.size,0);
});

test('changing speed during a pending pause does not leave an extra scheduled move',()=>{
  const d=demo();d.click({action:'play'});d.tick(100);d.speed(2);
  assert.equal(d.timers.size,1);
  d.tick(235);assert.equal(d.frames.size,1);
  d.click({action:'play'});d.tick(240);d.tick(2000);
  assert.equal(d.svg(),expected(options.setup+' U'));
  assert.equal(d.frames.size+d.timers.size,0);
});
