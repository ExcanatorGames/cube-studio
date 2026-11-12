import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLessonDemo} from '../web/lesson-view.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';
import {LESSONS,getLesson,orientLessonCase} from '../web/lessons.js';
import {createExercise} from '../web/lesson-scrambler.js';
import {cubeStickers} from '../web/cube.js';
import {lessonPhases,lessonFocus} from '../web/lesson-phases.js';

const playbackCase=LESSONS[1].cases.find(item=>item.id==='pair-0-3-0');
const options={...playbackCase,...createExercise('14',{varied:false,caseIds:[playbackCase.id]})};

function demo({reduced=false,lesson=LESSONS[1],exercise=options,getScrambleOrientation,getScrambleMode,setupCase,focus=false,onFocus,caseHref}={}){
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
  const view=createLessonDemo(root,{...lesson,case:exercise},runtime,{getScrambleOrientation,getScrambleMode,setupCase,focus,onFocus,caseHref});
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

test('setup moves always use the displayed cube perspective regardless of scramble preferences',()=>{
  for(const orientation of ['white-bottom','white-top'])for(const scrambleOrientation of ['white-top','white-bottom','blue-red']){
    const exercise=orientLessonCase(options,orientation);
    const source=orientLessonCase(playbackCase,orientation);
    const d=demo({reduced:true,exercise,setupCase:playbackCase,getScrambleMode:()=>'setup',getScrambleOrientation:()=>scrambleOrientation});
    assert.equal(d.get('.lesson-demo-setup code').textContent,source.setup);
    assert.equal(d.svg(),lessonCubeSVG(source.setup,source));
    d.click({action:'next'});
    assert.equal(d.get('.lesson-demo-setup code').textContent,source.setup);
    d.click({action:'reset'});
    assert.equal(d.svg(),lessonCubeSVG(source.setup,source));
    d.view.setOrientation(orientation==='white-top'?'white-bottom':'white-top');
    const flipped=orientLessonCase(playbackCase,orientation==='white-top'?'white-bottom':'white-top');
    assert.equal(d.get('.lesson-demo-setup code').textContent,flipped.setup);
  }
});

test('lesson preparation switches between short canonical setup moves and the original random example',()=>{
  let mode='setup';
  const d=demo({exercise:options,setupCase:playbackCase,getScrambleMode:()=>mode});
  assert.equal(d.svg(),lessonCubeSVG(playbackCase.setup,playbackCase));
  assert.equal(d.get('.lesson-demo-setup code').textContent,playbackCase.setup);
  assert.equal(d.get('.lesson-demo-setup').attrs['aria-label'],'Setup moves');
  d.click({action:'play'});d.tick(100);
  mode='random';d.view.setOrientation('white-bottom');
  assert.equal(d.frames.size+d.timers.size,0,'changing preparation cancels the old playback');
  assert.equal(d.svg(),expected(options.setup));
  assert.equal(d.get('.lesson-demo-setup code').textContent,options.setup);
  assert.equal(d.get('.lesson-demo-setup').attrs['aria-label'],'Demo scramble');
  mode='setup';d.view.setOrientation('white-top');
  const top=orientLessonCase(playbackCase,'white-top');
  assert.equal(d.svg(),lessonCubeSVG(top.setup,top));
  assert.equal(d.get('.lesson-demo-setup code').textContent,top.setup);
  d.click({action:'next'});d.tick(480);
  assert.equal(d.svg(),lessonCubeSVG(top.setup+' '+top.solution.split(' ')[0],top));
  d.click({action:'reset'});
  assert.equal(d.svg(),lessonCubeSVG(top.setup,top));
});

test('lesson cube keeps the solving position at rest, during playback and after reset independently of scramble notation',()=>{
  const d=demo({reduced:true,getScrambleOrientation:()=>'white-top'});
  assert.match(d.svg(), /yellow on top, white on bottom/);
  d.click({action:'next'});
  assert.match(d.svg(), /yellow on top, white on bottom/);
  d.click({action:'reset'});
  assert.match(d.svg(), /yellow on top, white on bottom/);
});

test('white-up lesson moves physically produce the taught white-cross case while its preview uses white cross on bottom',()=>{
  const exercise=LESSONS[0].case;
  const d=demo({exercise,getScrambleOrientation:()=>'white-top'});
  const notation=d.get('.lesson-demo-setup code').textContent;
  assert.equal(notation,"L D L' D'");
  assert.equal(JSON.stringify(cubeStickers(notation+" D L D' L'")),JSON.stringify(cubeStickers()));
  assert.match(d.svg(), /yellow on top, white on bottom/);
});

test('the two direct joining cases play exactly three moves and stop with the pair inserted',()=>{
  for(const exercise of LESSONS[1].cases.slice(0,2)){
    const d=demo({reduced:true,exercise});
    assert.equal(d.get('.lesson-moves').innerHTML.match(/<span/g).length,3);
    d.click({action:'play'});d.tick(600+470*2);
    assert.equal(d.get('[data-action="play"]').textContent,'Play');
    assert.equal(d.get('[data-action="next"]').disabled,true);
    assert.equal(d.frames.size+d.timers.size,0);
    assert.equal(d.svg(),lessonCubeSVG(exercise.setup+' '+exercise.solution,exercise));
  }
});

test('both ready-pair directions play their insertion algorithms through to the solved slot',()=>{
  for(const exercise of LESSONS[0].cases){
    const d=demo({reduced:true,lesson:LESSONS[0],exercise});
    assert.equal(exercise.solution.split(' ').length,4);
    assert.doesNotMatch(d.get('.lesson-moves').innerHTML,/Pair already formed/);
    assert.equal(d.get('[data-action="play"]').disabled,false);
    assert.equal(d.get('[data-action="next"]').disabled,false);
    d.click({action:'play'});d.tick(600+470*3);
    assert.equal(d.frames.size+d.timers.size,0);
    assert.equal(d.get('[data-action="next"]').disabled,true);
    assert.equal(d.svg(),lessonCubeSVG(exercise.setup+' '+exercise.solution,exercise));
    d.click({action:'reset'});
    assert.equal(d.svg(),lessonCubeSVG(exercise.setup,exercise));
  }
});

test('pairing playback follows the displayed solution move by move in both cross positions',()=>{
  const lesson=LESSONS[1],exercise=lesson.cases.find(item=>item.id==='pair-0-0-0');
  const d=demo({reduced:true,lesson,exercise});
  d.click({action:'next'});
  assert.equal(d.svg(),lessonCubeSVG(exercise.setup+' R',exercise));
  d.view.setOrientation('white-top');
  const top=orientLessonCase(exercise,'white-top');
  assert.equal(d.svg(),lessonCubeSVG(top.setup,top));
  d.view.setOrientation('white-bottom');
  for(const move of exercise.solution.split(' '))d.click({action:'next'});
  assert.equal(d.svg(),lessonCubeSVG(exercise.setup+' '+exercise.solution,exercise));
});

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
  const count=options.solution.split(' ').length,steps=lessonPhases(options);
  assert.deepEqual(steps.map(phase=>phase.end),[4,8]);
  for(let i=0;i<count;i++){
    d.tick(240);
    d.tick(240);
    assert.equal(d.svg(),expected([options.setup,...options.solution.split(' ').slice(0,i+1)].join(' ')));
    // The pause doubles where one step of the solution ends.
    const pause=steps.some(phase=>phase.end===i+1)?940:470;
    if(i<count-1){const rest=d.svg();d.tick(pause-1);assert.equal(d.svg(),rest);d.tick(1);}
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

test('demo exposes pairing playback with a scramble matching its cube orientation',()=>{
  const d=demo();
  assert.doesNotMatch(d.root.innerHTML,/Watch setup|data-mode|Demonstration sequence|lesson-move-status|lesson-marker-key/);
  assert.ok(d.root.innerHTML.includes(`<code>${options.setup}</code>`));
  assert.equal(d.svg(),expected(options.setup));
  assert.equal(d.get('.lesson-moves').innerHTML.match(/<span/g).length,8);
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

const strip=d=>d.get('.lesson-moves').innerHTML;
const note=d=>d.get('.lesson-phase-note').innerHTML;

test('the solution is shown as named steps with the case each one leaves',()=>{
  const d=demo({reduced:true,caseHref:id=>'/case/'+id});
  // U R U2 R' joins the pair; U R U' R' inserts it.
  assert.equal(strip(d).match(/data-phase=/g).length,2);
  assert.equal(strip(d).match(/<span/g).length,8,'move tokens stay the only spans');
  assert.match(strip(d),/data-phase="0"[^>]*aria-current="true"/);
  assert.match(strip(d),/<small>Pair up<\/small>/);
  assert.match(strip(d),/<small>Insert<\/small>/);
  assert.match(strip(d),/<a class="lesson-phase-case" data-reduce-case="ready-right" href="\/case\/ready-right"/);
  assert.match(strip(d),/<small>Easy 1<\/small>/);
  assert.match(strip(d),/class=" *align"[^>]*>U</,'the turn that lines up is marked');
  assert.equal(d.get('.lesson-phase-note').hidden,false);
  // Narrow layouts show the case in the note instead of a tile.
  assert.equal(note(d),'<strong>Pair up.</strong> Line up, then join the corner and edge in the top layer.'+
    '<a class="lesson-phase-leaves" data-reduce-case="ready-right" href="/case/ready-right" title="This step leaves Easy 1 · Ready right" aria-label="This step leaves Easy 1 · Ready right">Leaves <b>Easy 1</b></a>');
  for(let i=0;i<4;i++)d.click({action:'next'});
  assert.match(strip(d),/class="lesson-phase done" data-phase="0"/);
  assert.match(strip(d),/data-phase="1"[^>]*aria-current="true"/);
  assert.match(strip(d),/class="lesson-phase-case here"/,'the cube now shows the case the step left');
  assert.equal(note(d),'<strong>Insert.</strong> Line up, then put the joined pair into its slot.');
  for(let i=0;i<4;i++)d.click({action:'next'});
  assert.doesNotMatch(strip(d),/aria-current="true"/);
  assert.equal(note(d),'<strong>Solved.</strong> The pair is in its slot.');
  d.view.setOrientation('white-top');
  assert.ok(note(d).startsWith('<strong>Pair up.</strong> Line up, then join the corner and edge in the bottom layer.<a '));
  assert.match(strip(d),/class=" *align"[^>]*>D</);
});

test('a step without a link target still names the case it leaves',()=>{
  const d=demo({reduced:true});
  assert.match(strip(d),/<div class="lesson-phase-case" data-reduce-case="ready-right" title=/);
  assert.doesNotMatch(strip(d),/href=/);
  assert.match(note(d),/<em class="lesson-phase-leaves" data-reduce-case="ready-right" title=/);
  assert.doesNotMatch(note(d),/href=/);
  assert.equal(strip(d).match(/<span/g).length,8);
});

test('choosing a step replays only that step and then stops',()=>{
  const d=demo({reduced:true});
  d.click({phase:'1'});
  assert.equal(d.svg(),expected(options.setup+" U R U2 R'"),'jumps to the start of the step');
  d.tick(300);assert.equal(d.svg(),expected(options.setup+" U R U2 R' U"));
  d.tick(470*3);assert.equal(d.svg(),expected(options.setup+' '+options.solution));
  assert.equal(d.frames.size+d.timers.size,0);
  d.click({phase:'0'});d.tick(300+470*3);
  assert.equal(d.svg(),expected(options.setup+" U R U2 R'"));
  d.tick(5000);
  assert.equal(d.svg(),expected(options.setup+" U R U2 R'"),'stops where the step ends');
  assert.equal(d.get('[data-action="play"]').textContent,'Play');
  assert.equal(d.frames.size+d.timers.size,0);
  // Play then continues with the rest of the solution.
  d.click({action:'play'});d.tick(600+470*3);
  assert.equal(d.svg(),expected(options.setup+' '+options.solution));
});

test('focus dims everything except the pair, the cross and the centers, and can be turned off',()=>{
  const changes=[],d=demo({reduced:true,focus:true,onFocus:value=>changes.push(value)});
  const focused=alg=>lessonCubeSVG(alg,{...options,focus:lessonFocus(options.target)});
  assert.equal(d.svg(),focused(options.setup));
  assert.match(d.svg(),/data-dim/);
  assert.equal(d.get('[data-action="focus"]').hidden,false);
  assert.equal(d.get('[data-action="focus"]').attrs['aria-pressed'],'true');
  d.click({action:'next'});
  assert.equal(d.svg(),focused(options.setup+' U'));
  d.click({action:'focus'});
  assert.deepEqual(changes,[false]);
  assert.equal(d.svg(),expected(options.setup+' U'),'the move in progress is kept');
  assert.doesNotMatch(d.svg(),/data-dim/);
  assert.equal(d.get('[data-action="focus"]').attrs['aria-pressed'],'false');
  d.click({action:'focus'});
  assert.deepEqual(changes,[false,true]);
  assert.equal(d.svg(),focused(options.setup+' U'));
});

test('last-layer algorithms keep a plain row of moves without steps or focus',()=>{
  const lesson=getLesson('ll'),exercise=lesson.cases[0];
  const d=demo({reduced:true,lesson,exercise,focus:true});
  assert.doesNotMatch(strip(d),/data-phase|lesson-phase/);
  assert.equal(strip(d).match(/<span/g).length,exercise.solution.split(' ').length);
  assert.equal(d.get('.lesson-phase-note').hidden,true);
  assert.equal(d.get('[data-action="focus"]').hidden,true);
  assert.doesNotMatch(d.svg(),/data-dim/);
});
