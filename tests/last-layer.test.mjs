import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getLesson,caseLabel,orientLessonCase,stepHint,changeLessonFrame,exerciseContents,exerciseCompletion,
  LAST_LAYER_STAGES,PRACTICE_COMPLETION,PRACTICE_STEPS_COMPLETION} from '../web/lessons.js';
import {createExercise,createPracticeExercise} from '../web/lesson-scrambler.js';
import {createLessonSession} from '../web/lesson-session.js';
import {lessonGroups,parseRoute,routePath} from '../web/routes.js';
import {Cube} from '../web/cube-solver.js';

// cubejs order: corners URF UFL ULB UBR DFR DLF DBL DRB; edges UR UF UL UB
// DR DF DL DB FR FL BL BR. In the solving frame U is the yellow last layer.
const top=[0,1,2,3];
const state=algorithm=>new Cube().move(algorithm).toJSON();
const firstTwoLayersSolved=s=>[4,5,6,7].every(i=>s.cp[i]===i&&!s.co[i])&&[4,5,6,7,8,9,10,11].every(i=>s.ep[i]===i&&!s.eo[i]);
const edgesOriented=s=>top.every(i=>!s.eo[i]);
const cornersOriented=s=>top.every(i=>!s.co[i]);
// Corners (or edges) solved relative to each other: one turn of U solves them.
const cyclic=permutation=>top.every(i=>(permutation[i]-i-permutation[0]+8)%4===0);
const goals={
  'oll-edges':edgesOriented,
  'oll-corners':s=>edgesOriented(s)&&cornersOriented(s),
  'pll-corners':s=>edgesOriented(s)&&cornersOriented(s)&&cyclic(s.cp),
  'pll-edges':s=>new Cube(s).isSolved(),
};
const turnTop=(values,k)=>top.map(i=>values[(i+k)%4]);
const sameUpToTopTurn=(a,b)=>top.some(k=>turnTop(a,k).join()===b.join());
const ll=getLesson('ll');
const byStage=stage=>ll.cases.filter(item=>item.stage===stage);
let seed=917;
const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);

test('the last-layer curriculum teaches 2-look OLL and PLL in four groups with unique short names', () => {
  assert.equal(ll.title,'Last Layer');
  assert.deepEqual(LAST_LAYER_STAGES.map(stage=>byStage(stage).length),[3,7,2,4]);
  assert.deepEqual([...new Set(ll.cases.map(item=>item.group))],['OLL Edges','OLL Corners','PLL Corners','PLL Edges']);
  assert.equal(new Set(ll.cases.map(item=>item.id)).size,16);
  assert.equal(new Set(ll.cases.map(caseLabel)).size,16);
  assert.deepEqual(lessonGroups.filter(group=>group.lessonId==='ll').map(group=>group.slug),['oll-edges','oll-corners','pll-corners','pll-edges']);
  for(const item of ll.cases){
    assert.equal(item.setup,Cube.inverse(item.solution).trim(),`${item.id} setup cancels its solution`);
    assert.match(item.solution,/^([URFDLB][2']?)( [URFDLB][2']?)*$/,'face turns only, so the cube views can play it');
    assert.equal(item.orientation,'white-bottom');
    assert.equal(item.sourceLessonId,'ll');
  }
});

test('each last-layer algorithm keeps the first two layers and solves exactly its own step', () => {
  for(const item of ll.cases){
    const s=state(item.setup),stage=LAST_LAYER_STAGES.indexOf(item.stage);
    assert.ok(firstTwoLayersSolved(s),`${item.id} keeps F2L solved`);
    // Earlier steps are already done; this step's goal is not.
    for(const earlier of LAST_LAYER_STAGES.slice(0,stage))assert.ok(goals[earlier](s),`${item.id} needs ${earlier} done first`);
    assert.ok(!goals[item.stage](s),`${item.id} is not already solved`);
    assert.ok(goals[item.stage](state(item.setup+' '+item.solution)));
  }
  const flipped=item=>top.filter(i=>state(item.setup).eo[i]);
  const [line,l,dot]=byStage('oll-edges');
  assert.deepEqual(flipped(line).map(i=>i%2),[1,1],'line: the front and back edges are flipped');
  assert.deepEqual(flipped(l),[0,1],'L: yellow edges at the back and left');
  assert.equal(flipped(dot).length,4);
  // The seven corner cases are distinct, whichever way the top is turned.
  const corners=byStage('oll-corners').map(item=>state(item.setup).co.slice(0,4));
  corners.forEach((a,i)=>corners.slice(i+1).forEach(b=>assert.ok(!sameUpToTopTurn(a,b))));
  assert.deepEqual(byStage('oll-corners').map(item=>state(item.setup).co.slice(0,4).filter(v=>!v).length),[1,1,0,0,2,2,2]);
  // Adjacent swap leaves one solved side (headlights); diagonal swap leaves none.
  const swapped=item=>top.filter(i=>state(item.setup).cp[i]!==i);
  assert.equal(Math.abs(swapped(byStage('pll-corners')[0]).reduce((a,b)=>a-b)),3);
  assert.equal(Math.abs(swapped(byStage('pll-corners')[1]).reduce((a,b)=>a-b)),2);
  for(const item of byStage('pll-edges'))assert.ok(top.every(i=>state(item.setup).cp[i]===i),`${item.id} keeps corners`);
});

test('last-layer cases keep yellow on top for either cross position', () => {
  for(const item of ll.cases){
    const turned=orientLessonCase(item,'white-top');
    assert.equal(turned.orientation,'white-bottom');
    assert.equal(turned.setup,item.setup);
    assert.equal(turned.solution,item.solution);
  }
});

test('demonstrations expose each case on a background solved only as far as its step', () => {
  for(const item of ll.cases)for(let n=0;n<3;n++){
    const exercise=createExercise('ll',{caseIds:[item.id],varied:n>0,random});
    assert.equal(exercise.caseId,item.id);assert.equal(exercise.lessonId,'ll');
    assert.equal(changeLessonFrame(exercise.scramble),exercise.setup);
    assert.equal(exercise.completion,'last-layer-step');
    const before=state(exercise.setup),after=state(exercise.setup+' '+exercise.solution);
    assert.ok(firstTwoLayersSolved(before)&&firstTwoLayersSolved(after));
    assert.ok(goals[item.stage](after),`${item.id} demonstration solves its step`);
  }
  // Without variation the canonical OLL edge pattern is shown.
  const dot=createExercise('ll',{caseIds:['oll-edges-dot'],varied:false,random});
  assert.equal(state(dot.setup).eo.slice(0,4).join(),'1,1,1,1');
});

function playSteps(exercise){
  let current=exercise.setup;
  return exercise.steps.map(step=>{
    const before=state(current);
    current+=' '+step.solution;
    return {step,before,after:state(current)};
  });
}

test('last-layer practice gives one enabled case per step, in solving order, on the same cube', () => {
  const subsets=[undefined,['oll-edges-line','oll-edges-dot'],['oll-corners-sune','pll-edges-z-perm'],
    ['pll-corners-adjacent'],['pll-edges-h-perm'],['oll-edges-l','pll-corners-diagonal','pll-edges-ua','pll-edges-ub']];
  for(const caseIds of subsets)for(let n=0;n<12;n++){
    const exercise=createPracticeExercise('ll',{caseIds,random});
    const enabled=caseIds||ll.cases.map(item=>item.id);
    const stages=LAST_LAYER_STAGES.filter(stage=>ll.cases.some(item=>item.stage===stage&&enabled.includes(item.id)));
    assert.deepEqual(exercise.steps.map(step=>step.stage),stages);
    assert.equal(exercise.completion,PRACTICE_STEPS_COMPLETION);
    assert.equal(changeLessonFrame(exercise.scramble),exercise.setup);
    assert.equal(exercise.solution,exercise.steps.map(step=>step.solution).join(' '));
    for(const {step,before,after} of playSteps(exercise)){
      assert.ok(enabled.includes(step.caseId));
      const item=ll.cases.find(c=>c.id===step.caseId);
      assert.ok(firstTwoLayersSolved(before)&&firstTwoLayersSolved(after));
      assert.ok(!goals[step.stage](before),'each step has work to do');
      assert.ok(goals[step.stage](after),`${step.caseId} hint solves its step`);
      assert.equal(stepHint(step),step.solution,'last-layer hints need no cube rotation');
      // The pattern a learner recognizes matches the taught case, turned by U.
      if(step.stage==='oll-edges')assert.ok(sameUpToTopTurn(before.eo.slice(0,4),state(item.setup).eo.slice(0,4)));
      if(step.stage==='oll-corners')assert.ok(sameUpToTopTurn(before.co.slice(0,4),state(item.setup).co.slice(0,4)));
    }
    // With edge permutation enabled, the last hint finishes the cube.
    const end=state(exercise.setup+' '+exercise.solution);
    if(stages.includes('pll-edges'))assert.ok(new Cube(end).isSolved());
    else assert.ok(goals[stages.at(-1)](end));
  }
});

test('symmetric cases use their shortest alignment in hints', () => {
  for(let n=0;n<30;n++){
    // H perm commutes with every top turn: one turn at most, before or after.
    const hperm=createPracticeExercise('ll',{caseIds:['pll-edges-h-perm'],random}).steps[0];
    assert.ok(hperm.insert.split(' ').length<=12,hperm.insert);
    const dot=createPracticeExercise('ll',{caseIds:['oll-edges-dot'],random}).steps[0];
    assert.ok(dot.insert.split(' ').length<=14);
  }
});

test('F2L and last-layer cases mix into four pairs followed by the last layer', () => {
  for(let n=0;n<10;n++){
    const exercise=createPracticeExercise('mixed',{caseIds:['ready-right','pair-1-3-0','oll-corners-sune','pll-edges-ua'],random});
    assert.deepEqual(exercise.steps.map(step=>step.stage||'f2l'),['f2l','f2l','f2l','f2l','oll-corners','pll-edges']);
    const played=playSteps(exercise);
    assert.ok(firstTwoLayersSolved(played[3].after),'four pairs complete the first two layers');
    assert.ok(new Cube(played.at(-1).after).isSolved());
    assert.equal(exerciseContents(exercise),'4 pairs + last layer');
    assert.equal(exerciseCompletion(exercise),'4 pairs inserted + 2 last-layer steps');
    // Cross on top: the pairs turn over, then z2 brings yellow up for the last layer.
    const turned=orientLessonCase(exercise,'white-top');
    assert.equal(turned.orientation,'white-top');
    assert.deepEqual(turned.steps.map(step=>step.orientation),['white-top','white-top','white-top','white-top','white-bottom','white-bottom']);
    assert.ok(stepHint(turned.steps[4]).startsWith('z2 '));
    assert.ok(!stepHint(turned.steps[5]).startsWith('z2'));
    assert.ok(!orientLessonCase(exercise,'white-bottom').steps.some(step=>step.rotation==='z2'));
  }
  const pairs=createPracticeExercise('f2l',{random});
  assert.equal(pairs.completion,PRACTICE_COMPLETION);
  assert.equal(exerciseContents(pairs),'4 pairs');
  assert.equal(exerciseCompletion(pairs),'4 pairs inserted');
  const lastLayer=createPracticeExercise('ll',{caseIds:['pll-edges-ua'],random});
  assert.equal(exerciseContents(lastLayer),'Last layer');
  assert.equal(exerciseCompletion(lastLayer),'1 last-layer step');
  assert.equal(orientLessonCase(lastLayer,'white-top').orientation,'white-bottom','last-layer practice keeps yellow up');
});

test('practice comparisons only include attempts with the same kinds of step', () => {
  const session=createLessonSession({getSettings:()=>({disabledCases:[]}),createWorker:()=>({postMessage(){}})});
  assert.equal(session.open('mixed',{caseIds:['oll-edges-dot','pll-edges-ua','pll-edges-ub','ready-right']}),true);
  const base={date:'2026-11-01T10:00:00.000Z',ms:9000,penalty:'none',lessonId:'ll',caseId:'oll-edges-dot',completion:PRACTICE_STEPS_COMPLETION};
  const attempts=[
    {...base,id:'both-stages',caseIds:['oll-edges-dot','pll-edges-ua']},
    {...base,id:'one-stage',caseIds:['pll-edges-ub']},
    {...base,id:'with-pairs',caseIds:['ready-right','ready-right','ready-right','ready-right','oll-edges-dot','pll-edges-ub']},
    {...base,id:'pairs-only',lessonId:'13',caseId:'ready-right',caseIds:['ready-right','ready-right','ready-right','ready-right'],completion:PRACTICE_COMPLETION},
    {...base,id:'disabled-case',caseIds:['ready-left','ready-left','ready-left','ready-left','oll-edges-dot','pll-edges-ua']},
  ];
  assert.deepEqual(session.times(attempts).map(a=>a.id),['with-pairs']);
  session.selectCases(['oll-edges-dot','pll-edges-ua','pll-edges-ub']);
  assert.deepEqual(session.times(attempts).map(a=>a.id),['both-stages']);
  session.selectCases(['pll-edges-ua','pll-edges-ub']);
  assert.deepEqual(session.times(attempts).map(a=>a.id),['one-stage']);
  session.selectCases(['ready-right']);
  assert.deepEqual(session.times(attempts).map(a=>a.id),['pairs-only']);
});

test('last-layer lessons and practices have their own addresses', () => {
  const lesson=parseRoute('/lessons/ll/pll-edges/lesson?case=pll-edges-z-perm');
  assert.equal(lesson.lessonId,'ll');
  assert.equal(lesson.demoCaseId,'pll-edges-z-perm');
  assert.deepEqual(lesson.scopeCaseIds,byStage('pll-edges').map(item=>item.id));
  assert.equal(routePath(lesson),'/lessons/ll/pll-edges/lesson?case=pll-edges-z-perm');
  const practice=parseRoute('/practice/ll/oll-corners');
  assert.equal(practice.lessonId,'mixed');
  assert.equal(practice.title,'Last Layer · OLL Corners');
  assert.equal(routePath(practice),'/practice/ll/oll-corners');
  const mix=parseRoute('/practice/mixed?groups=f2l/easy-inserts,ll/pll-edges');
  assert.equal(mix.scopeCaseIds.length,8);
  assert.equal(routePath(mix),'/practice/mixed?groups=f2l%2Feasy-inserts%2Cll%2Fpll-edges');
});
