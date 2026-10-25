import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLessonDemo} from '../web/lesson-view.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';
import {LESSONS} from '../web/lessons.js';

function demo({reduced=false}={}){
  const elements=new Map(),timers=new Map(),frames=new Map();let click,now=0,id=0;
  const runtime={
    performance:{now:()=>now},matchMedia:()=>({matches:reduced}),
    setTimeout(fn,delay){timers.set(++id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},
  };
  const get=selector=>{
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',disabled:false,attrs:{},setAttribute(name,value){this.attrs[name]=value;}});
    return elements.get(selector);
  };
  const root={innerHTML:'',querySelector:get,querySelectorAll:()=>[],contains:()=>true,addEventListener(name,fn){click=fn;},removeEventListener(){click=null;},replaceChildren(){this.innerHTML='';}};
  const view=createLessonDemo(root,LESSONS[0],runtime);
  return {view,get,root,frames,timers,
    click(dataset){click?.({target:{closest:()=>({dataset})}});},
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
    status:()=>get('.lesson-move-status').textContent,
  };
}
const options=LESSONS[0].case;
const expected=alg=>lessonCubeSVG(alg,options);

test('Next and Previous tween the affected layer and settle on authoritative lesson states',()=>{
  const d=demo(),initial=d.svg();
  assert.equal(initial,expected(options.setup));
  d.click({action:'next'});
  assert.match(d.status(),/Move 1 of 4 · U · Turning/);
  assert.match(d.get('.lesson-moves').innerHTML,/aria-current="step">U/);
  assert.ok(d.get('[data-action="next"]').disabled);
  assert.ok(d.get('[data-action="previous"]').disabled);
  d.tick(240);const halfway=d.svg();
  assert.notEqual(halfway,initial);
  assert.notEqual(halfway,expected(options.setup+' U'));
  d.click({action:'next'});d.click({action:'previous'});
  d.tick(240);assert.equal(d.svg(),expected(options.setup+' U'));
  assert.match(d.status(),/^Move 1 of 4 · U$/);
  d.click({action:'previous'});
  assert.match(d.status(),/Move 1 of 4 · U' · Undoing/);
  d.tick(240);assert.notEqual(d.svg(),initial);
  d.tick(240);assert.equal(d.svg(),initial);
  assert.ok(d.get('[data-action="previous"]').disabled);
});

test('Play leaves a reading pause between turns and stops at the last completed move',()=>{
  const d=demo();d.click({action:'play'});
  d.tick(599);assert.equal(d.svg(),expected(options.setup));
  d.tick(1);assert.match(d.status(),/Turning/);
  for(let i=0;i<4;i++){
    d.tick(240);assert.match(d.status(),/Turning/);
    d.tick(240);
    assert.equal(d.svg(),expected([options.setup,...options.solution.split(' ').slice(0,i+1)].join(' ')));
    if(i<3){const rest=d.svg();d.tick(469);assert.equal(d.svg(),rest);d.tick(1);}
  }
  assert.match(d.status(),/Move 4 of 4 · R' · Pair inserted/);
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
  d.click({action:'play'});d.tick(600);assert.match(d.status(),/Move 2 of 4 · R/);
});

test('Pause during the reading delay cancels it, and resume midturn schedules only one successor',()=>{
  const d=demo();d.click({action:'play'});const stale=[...d.timers.values()][0].fn;
  d.click({action:'play'});stale();d.tick(3000);assert.equal(d.svg(),expected(options.setup));
  d.click({action:'next'});d.tick(240);
  d.click({action:'play'});d.click({action:'play'});d.click({action:'play'});
  d.tick(240);assert.equal(d.timers.size,1);
  d.click({action:'play'});d.tick(5000);assert.equal(d.svg(),expected(options.setup+' U'));
});

for(const action of ['reset','external reset','setup','destroy'])test(action+' cancels frames and stale callbacks without ghost updates',()=>{
  const d=demo();d.click({action:'play'});const timer=[...d.timers.values()][0].fn;
  d.tick(600);d.tick(240);const frame=[...d.frames.values()][0];
  if(action==='reset')d.click({action:'reset'});
  if(action==='external reset')d.view.reset();
  if(action==='setup')d.click({mode:'setup'});
  if(action==='destroy')d.view.destroy();
  const snapshot=d.svg(),status=d.status();
  assert.equal(d.frames.size+d.timers.size,0);
  timer();frame(10000);d.tick(10000);
  assert.equal(d.svg(),snapshot);assert.equal(d.status(),status);
  if(action==='destroy'){
    assert.equal(d.root.innerHTML,'');d.view.reset();d.view.destroy();assert.equal(d.root.innerHTML,'');
  }else{
    assert.equal(d.svg(),expected(action==='setup'?'':options.setup));
    d.click({action:'next'});d.tick(480);
    assert.equal(d.svg(),expected(action==='setup'?'R':options.setup+' U'));
  }
});

test('setup animates forward and backward, and switching mode cancels its current turn',()=>{
  const d=demo();d.click({mode:'setup'});assert.equal(d.svg(),expected(''));
  d.click({action:'next'});d.tick(240);assert.notEqual(d.svg(),expected('R'));d.tick(240);
  assert.equal(d.svg(),expected('R'));
  d.click({action:'previous'});d.tick(480);assert.equal(d.svg(),expected(''));
  d.click({action:'play'});d.tick(600);d.tick(240);
  d.click({mode:'solution'});d.tick(3000);assert.equal(d.svg(),expected(options.setup));
});

test('reduced motion advances canonical steps without tween frames and retains playback pauses',()=>{
  const d=demo({reduced:true});d.click({action:'next'});
  assert.equal(d.svg(),expected(options.setup+' U'));assert.equal(d.frames.size,0);
  d.click({action:'previous'});assert.equal(d.svg(),expected(options.setup));
  d.click({action:'play'});d.tick(600);assert.equal(d.svg(),expected(options.setup+' U'));
  d.tick(470);assert.equal(d.svg(),expected(options.setup+' U R'));
  d.view.reset();d.tick(5000);assert.equal(d.svg(),expected(options.setup));
});
