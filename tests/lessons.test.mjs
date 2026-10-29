import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS,LESSON_CATALOG,F2L_GROUPS,changeLessonFrame,orientLessonCase} from '../web/lessons.js';
import {createExercise} from '../web/lesson-scrambler.js';
import {cubeStickers,cubeSVG,cubeFaces} from '../web/cube.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';
import {Cube} from '../web/cube-solver.js';

function assertFormedPair(stickers,target,top=1){
  const corner=stickers.filter(s=>s.cubie===target[0]),edge=stickers.filter(s=>s.cubie===target[1]);
  assert.equal(corner[0].position[1],top,'corner remains in the unsolved layer');
  assert.equal(edge[0].position[1],top,'edge remains in the unsolved layer');
  assert.equal(corner[0].position.reduce((sum,v,i)=>sum+Math.abs(v-edge[0].position[i]),0),1,'pieces touch');
  for(const sticker of edge)assert.equal(JSON.stringify(corner.find(s=>s.face===sticker.face).normal),JSON.stringify(sticker.normal),'matching colors face the same direction');
}
function rotateReference(algorithm,turns){
  const faces={F:'R',R:'B',B:'L',L:'F',U:'U',D:'D'};
  for(let i=0;i<turns;i++)algorithm=algorithm.replace(/[URFDLB]/g,face=>faces[face]);
  return algorithm;
}

function assertInserted(stickers,target){
  const solved=cubeStickers();
  for(let i=0;i<stickers.length;i++)if(target.includes(stickers[i].cubie))assert.equal(JSON.stringify(stickers[i]),JSON.stringify(solved[i]),'target pair is inserted');
}
test('simple joining cases use their direct three-move insertions',()=>{
  assert.deepEqual(LESSONS[0].cases.map(c=>c.solution),["U R U' R'","U' F' U F"]);
  assert.equal(LESSONS[1].cases[0].solution,"R U R'");
  assert.equal(LESSONS[1].cases[1].solution,"F' U' F");
});

function targetStateKey(cube){
  const state=cube.toJSON(),corner=state.cp.indexOf(4),edge=state.ep.indexOf(8);
  return [corner,state.co[corner],edge,state.eo[edge]].join(',');
}
function shortestTriggerCosts(){
  const key=targetStateKey;
  const start={cube:new Cube(),cost:0},best=new Map([[key(start.cube),start]]),queue=[start];
  const triggers=['U','U2',"U'","R U R'","R U2 R'","R U' R'","F' U F","F' U2 F","F' U' F"];
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost);const current=queue.shift();
    if(best.get(key(current.cube))!==current)continue;
    for(const trigger of triggers){
      const cube=current.cube.clone().move(Cube.inverse(trigger)),id=key(cube),cost=current.cost+trigger.split(' ').length;
      if(best.has(id)&&best.get(id).cost<=cost)continue;
      const next={cube,cost};best.set(id,next);queue.push(next);
    }
  }
  return best;
}
const triggerCosts=shortestTriggerCosts();

test('one F2L lesson covers all 41 standard cases in the video groups without duplicates',()=>{
  assert.equal(LESSON_CATALOG.length,1);
  const lesson=LESSON_CATALOG[0];
  assert.deepEqual(F2L_GROUPS.map(group=>lesson.cases.filter(item=>item.group===group).length),[4,10,6,6,10,5]);
  const seen=new Set();
  for(const item of lesson.cases){
    const cube=new Cube().move(item.setup),key=targetStateKey(cube);
    assert.ok(!seen.has(key),'duplicate physical case '+key);seen.add(key);
    const [corner,,edge]=key.split(',').map(Number);
    if(item.group==='Corner in Slot')assert.deepEqual([corner,edge],[4,0]);
    if(item.group==='Edge in Slot')assert.deepEqual([corner,edge],[0,8]);
    if(item.group==='Both Pieces in Slot')assert.deepEqual([corner,edge],[4,8]);
    if(item.group==='Connected Pairs')assert.ok(corner===0&&edge<2);
    if(item.group==='Disconnected Pairs')assert.ok(corner===0&&edge>=2&&edge<4);
    const solved=cubeStickers(),prepared=cubeStickers(item.setup),after=cubeStickers(item.setup+' '+item.solution);
    for(const sticker of solved.filter(s=>s.position[1]<1&&!item.target.includes(s.cubie))){
      const match=items=>items.find(s=>s.cubie===sticker.cubie&&s.face===sticker.face);
      assert.equal(JSON.stringify(match(prepared)),JSON.stringify(sticker),'setup preserves other slots and cross');
      assert.equal(JSON.stringify(match(after)),JSON.stringify(sticker),'solution preserves other slots and cross');
    }
    assertInserted(after,item.target);
  }
  assert.equal(seen.size,41);
  assert.ok(!seen.has('4,0,8,0'),'solved pair is not a practice case');
});

test('every pairing solution is as short as an independently searched route using basic slot triggers',()=>{
  assert.equal(triggerCosts.size,150,'covers every target-pair configuration reachable with these triggers');
  for(const item of LESSONS[1].cases){
    const cost=triggerCosts.get(targetStateKey(new Cube().move(item.setup))).cost;
    assert.ok(item.solution.split(' ').length<=cost,`${item.id} has a simpler ${cost}-move trigger solution`);
  }
});

test('the two lessons cover all 24 top-layer configurations exactly once',()=>{
  assert.equal(LESSONS[0].cases.length,2);
  assert.equal(LESSONS[1].cases.length,22);
  const signatures=new Set();
  for(const lesson of LESSONS)for(const item of lesson.cases){
    const state=new Cube().move(item.setup).toJSON(),corner=state.cp.indexOf(4),edge=state.ep.indexOf(8);
    assert.equal(corner,0,'canonical corner is above front-right');
    assert.ok(edge<4,'matching edge is also in the top layer');
    const key=[state.co[corner],edge,state.eo[edge]].join(',');
    assert.ok(!signatures.has(key),'no duplicate case '+key);signatures.add(key);
    const prepared=cubeStickers(item.setup);
    // D face carries white in the solving frame. Pair formation also
    // restores the other three F2L slots when they were already solved.
    const solved=cubeStickers();
    const formed=cubeStickers(item.setup+' '+item.solution);
    const fixed=solved.filter(s=>!item.target.includes(s.cubie)&&s.position[1]<1);
    for(const original of fixed){
      const sticker=prepared.find(s=>s.cubie===original.cubie&&s.face===original.face);
      assert.equal(JSON.stringify(sticker),JSON.stringify(original),item.id+' preserves existing F2L work');
      assert.equal(JSON.stringify(formed.find(s=>s.cubie===original.cubie&&s.face===original.face)),JSON.stringify(original),item.id+' restores existing F2L work after pairing');
    }
    for(const orientation of ['white-top','white-bottom']){
      const oriented=orientLessonCase(item,orientation);
      const after=cubeStickers(oriented.setup+' '+oriented.solution);
      assertInserted(after,oriented.target);
    }
    const moves=item.solution.split(' ');
    assert.ok(moves.every((move,i)=>!i||move[0]!==moves[i-1][0]),'no redundant adjacent turns');
  }
  for(let twist=0;twist<3;twist++)for(let edge=0;edge<4;edge++)for(let flip=0;flip<2;flip++)assert.ok(signatures.has([twist,edge,flip].join(',')));
});

test('every case supports all slots and alignments with random backgrounds and independently verified hints',()=>{
  let seed=235178;const next=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  const solvedStickers=cubeStickers(),crossCubies=['0,-1,1','1,-1,0','0,-1,-1','-1,-1,0'];
  for(const lesson of LESSON_CATALOG)for(const item of lesson.cases){
    const backgrounds=new Set();
    for(let slot=0;slot<4;slot++)for(let auf=0;auf<4;auf++){
      const choices=[slot/4,auf/4];
      const exercise=createExercise(lesson.id,{caseIds:[item.id],random:()=>choices.length?choices.shift():next()});
      assert.equal(exercise.lessonId,item.sourceLessonId);assert.equal(exercise.caseId,item.id);
      assert.equal(exercise.auf,auf);assert.equal(changeLessonFrame(exercise.scramble),exercise.setup);
      const before=cubeStickers(exercise.setup),after=cubeStickers(exercise.setup+' '+exercise.solution);
      const expected=cubeStickers(rotateReference(item.setup,slot)+' '+['','U','U2',"U'"][auf]);
      assert.equal(exercise.completion,'insertion');
      assertInserted(after,exercise.target);
      const moves=exercise.solution.split(' ');
      assert.ok(moves.every((move,i)=>!i||move[0]!==moves[i-1][0]),'alignment turns are combined');
      const cost=triggerCosts.get(targetStateKey(new Cube().move(item.setup+' '+['','U','U2',"U'"][auf]))).cost;
      assert.ok(moves.length<=cost,`${item.id}, alignment ${auf} has a simpler ${cost}-move trigger solution`);
      const state=new Cube().move(exercise.setup+' '+exercise.solution).toJSON();
      const corner=[4,7,6,5][slot],edge=[8,11,10,9][slot];
      assert.equal(state.cp[corner],corner);assert.equal(state.co[corner],0);
      assert.equal(state.ep[edge],edge);assert.equal(state.eo[edge],0);
      for(let i=0;i<before.length;i++){
        if(exercise.target.includes(before[i].cubie)){
          assert.equal(JSON.stringify(before[i]),JSON.stringify(expected[i]),`${item.id}: exact case in slot ${slot}, alignment ${auf}`);
        }
        if(crossCubies.includes(before[i].cubie)){
          assert.equal(JSON.stringify(before[i]),JSON.stringify(solvedStickers[i]),'cross starts solved');
          assert.equal(JSON.stringify(after[i]),JSON.stringify(solvedStickers[i]),'cross stays solved after the solution');
        }
      }
      const physical=simulate(exercise.scramble),inserted=simulate(exercise.scramble+' '+changeLessonFrame(exercise.solution));
      for(const sticker of cross){assert.equal(physical[sticker],sticker);assert.equal(inserted[sticker],sticker);}
      backgrounds.add(before.filter(s=>!exercise.target.includes(s.cubie)&&!crossCubies.includes(s.cubie)).map(s=>s.position+':'+s.normal).join('|'));
    }
    assert.equal(backgrounds.size,16,'backgrounds vary for '+item.id);
  }
});

test('practice only samples selected cases and rejects empty or foreign selections',()=>{
  const selected=LESSONS[1].cases.slice(0,2).map(item=>item.id);
  for(const [index,id] of selected.entries()){
    let calls=0,seed=91234;const next=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
    const exercise=createExercise('14',{caseIds:selected,random:()=>++calls===3?index/2:next()});
    assert.equal(exercise.caseId,id);
  }
  for(const caseIds of [[],['ready-right'],['missing']])assert.throws(()=>createExercise('14',{caseIds}),/Select valid/);
});

test('ready-pair cases demonstrate insertion in either orientation',()=>{
  for(const orientation of ['white-top','white-bottom']){
    const preview=orientLessonCase(LESSONS[0].case,orientation);
    assert.ok(preview.solution);
    assertInserted(cubeStickers(preview.setup+' '+preview.solution),preview.target);
    assertFormedPair(cubeStickers(preview.setup),preview.target,orientation==='white-bottom'?1:-1);
    const svg=lessonCubeSVG(preview.setup,preview);
    assert.match(svg,/data-target=/);
    assert.notEqual(svg,lessonCubeSVG('',preview),'Preview shows the case before insertion');
  }
});

test('lesson and practice colors represent a physical rotation with white down and green front',()=>{
  for(const render of [cubeSVG,lessonCubeSVG]){
    const svg=render('',{orientation:'white-bottom'});
    const centerColor=id=>svg.match(new RegExp(`data-cubie="${id}"[^>]*fill="([^"]+)"`))[1];
    assert.equal(centerColor('0,1,0'),'#f5d447','yellow top');
    assert.equal(centerColor('0,0,1'),'#29b875','green front');
    assert.equal(centerColor('1,0,0'),'#ff942f','orange right when white is down');
    assert.match(svg,/yellow on top, white on bottom, green in front and orange on the right/);
    const normal=render('');
    assert.match(normal,/data-cubie="1,0,0"[^>]*fill="#e9474f"/,'normal timer retains red right');
  }
});

const strips={
  U:[['F0','L0','B0','R0'],['F1','L1','B1','R1'],['F2','L2','B2','R2']],
  D:[['F6','R6','B6','L6'],['F7','R7','B7','L7'],['F8','R8','B8','L8']],
  R:[['U2','B6','D2','F2'],['U5','B3','D5','F5'],['U8','B0','D8','F8']],
  L:[['U0','F0','D0','B8'],['U3','F3','D3','B5'],['U6','F6','D6','B2']],
  F:[['U6','R0','D2','L8'],['U7','R3','D1','L5'],['U8','R6','D0','L2']],
  B:[['U0','L6','D8','R2'],['U1','L3','D7','R5'],['U2','L0','D6','R8']],
};
function simulate(alg){
  const state=Object.fromEntries([...'URFDLB'].flatMap(f=>Array.from({length:9},(_,i)=>[f+i,f+i])));
  for(const token of alg.split(/\s+/).filter(Boolean)){
    assert.match(token,/^[URFDLB](2|')?$/);
    const face=token[0],cycles=[[0,2,8,6],[1,5,7,3]].map(c=>c.map(i=>face+i)).concat(strips[face]);
    for(let turn=0;turn<(token.endsWith('2')?2:token.endsWith("'")?3:1);turn++){
      for(const cycle of cycles){const values=cycle.map(p=>state[p]);cycle.forEach((p,i)=>state[cycle[(i+1)%4]]=values[i]);}
    }
  }
  return state;
}
const cross=['U1','B1','U3','L1','U5','R1','U7','F1'];
const pair=['U6','F0','L2','F3','L5'];
const solved=simulate('');

test('lesson orientation rotates the physical state, target pieces and solution together',()=>{
  const faces={U:'D',D:'U',R:'L',L:'R',F:'F',B:'B'};
  const rotate=([x,y,z])=>[-x,-y,z].map(n=>n||0);
  let seed=87654;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for(let i=0;i<16;i++){
    const exercise=createExercise('13',{random}),top=orientLessonCase(exercise,'white-top');
    assert.equal(top.setup,exercise.scramble);
    assert.equal(top.scramble,top.setup);
    const rotated=cubeStickers(exercise.setup).map(s=>({face:faces[s.face],normal:rotate(s.normal),position:rotate(s.position),cubie:rotate(s.cubie.split(',').map(Number)).join(',')}));
    const byPiece=stickers=>JSON.parse(JSON.stringify(stickers.sort((a,b)=>(a.cubie+a.face).localeCompare(b.cubie+b.face))));
    assert.deepEqual(byPiece(cubeStickers(top.setup)),byPiece(rotated));
    assertInserted(cubeStickers(top.setup+' '+top.solution),top.target);
    const bottom=orientLessonCase(top,'white-bottom');
    assert.equal(bottom.setup,exercise.setup);
    assert.equal(bottom.solution,exercise.solution);
    assert.deepEqual(bottom.target,exercise.target);
    assert.equal(bottom.slot,exercise.slot);
  }
});

test('every exercise starts with the solved cross and the exact ready-right pair, leaving other F2L work',()=>{
  const canonical=simulate("L D L' D'"),seen=new Set();
  let seed=123456;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for(let i=0;i<48;i++){
    const exercise=createExercise('13',{random,varied:false});
    seen.add(exercise.scramble);
    const state=simulate(exercise.scramble);
    for(const sticker of cross)assert.equal(state[sticker],sticker,exercise.scramble);
    for(const sticker of pair)assert.equal(Object.keys(state).find(p=>state[p]===sticker),Object.keys(canonical).find(p=>canonical[p]===sticker));
    const inserted=simulate(`${exercise.scramble} D L D' L'`);
    for(const sticker of [...cross,...pair])assert.equal(inserted[sticker],sticker);
    assert.ok(Object.keys(solved).some(p=>(p[0]==='U'||'FRBL'.includes(p[0])&&Number(p[1])<=5)&&inserted[p]!==p));
    assert.ok(exercise.scramble.split(' ').length>=12&&exercise.scramble.split(' ').length<=22);
    assert.equal(changeLessonFrame(exercise.scramble),exercise.setup);
    const tokens=exercise.scramble.split(' ');
    assert.ok(tokens.every((move,i)=>!i||move[0]!==tokens[i-1][0]));
    assert.equal(exercise.orientation,'white-bottom');
    assert.ok(Object.isFrozen(exercise));
  }
  assert.ok(seen.size>=16);
});

test('refresh produces a different exercise even with a repeated random sample',()=>{
  let previousScramble='';
  for(let i=0;i<4;i++){
    const exercise=createExercise('13',{previousScramble,random:()=>0});
    assert.notEqual(exercise.scramble,previousScramble);
    previousScramble=exercise.scramble;
  }
  assert.throws(()=>createExercise('missing'),/Unknown lesson/);
});

test('ready-pair practice varies four color pairs and all top-layer positions with correct insertion hints',()=>{
  const slots=['Front right','Back right','Back left','Front left'];
  const targets=[['1,-1,1','1,0,1'],['1,-1,-1','1,0,-1'],['-1,-1,-1','-1,0,-1'],['-1,-1,1','-1,0,1']];
  const sides=['R','B','L','F'],lead=['U','',"U'",'U2'];
  const inverted=algorithm=>algorithm.split(' ').reverse().map(move=>move.endsWith('2')?move:move.endsWith("'")?move.slice(0,-1):move+"'").join(' ');
  const solvedStickers=cubeStickers(),topPositions=new Set(),colorPairs=new Set();
  let seed=654321;const next=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for(let slot=0;slot<4;slot++)for(let auf=0;auf<4;auf++){
    const choices=[slot/4,auf/4],exercise=createExercise('13',{caseIds:['ready-right'],random:()=>choices.length?choices.shift():next()});
    const expected=(auf===2?[sides[slot],'U2',sides[slot]+"'"]:[lead[auf],sides[slot],"U'",sides[slot]+"'"]).filter(Boolean).join(' ');
    assert.equal(exercise.slot,slots[slot]);assert.equal(exercise.auf,auf);
    assert.equal(exercise.solution,expected);assert.deepEqual(exercise.target,targets[slot]);
    const scrambled=simulate(exercise.scramble);
    for(const sticker of cross)assert.equal(scrambled[sticker],sticker,'white-up scramble preserves the white cross');
    const initial=cubeStickers(exercise.setup),canonical=cubeStickers(inverted(expected));
    const inserted=cubeStickers(exercise.setup+' '+exercise.solution);
    assertInserted(inserted,exercise.target);
    for(let i=0;i<initial.length;i++){
      if(exercise.target.includes(initial[i].cubie)){
        assert.equal(JSON.stringify(initial[i]),JSON.stringify(canonical[i]),'the pair remains the taught insertion case');
        assert.equal(JSON.stringify(inserted[i]),JSON.stringify(solvedStickers[i]),'the insertion solves the pair');
      }
      if(['0,-1,1','1,-1,0','0,-1,-1','-1,-1,0'].includes(initial[i].cubie))assert.equal(JSON.stringify(inserted[i]),JSON.stringify(solvedStickers[i]));
    }
    colorPairs.add(exercise.target.join('|'));
    topPositions.add(initial.find(s=>s.cubie===exercise.target[0]).position.join(','));
  }
  assert.equal(colorPairs.size,4);assert.equal(topPositions.size,4);
});

test('cubie markers follow both physical pieces through every demonstration turn',()=>{
  const lesson=LESSONS[1],target=lesson.case.target,exercise=createExercise('14',{varied:false});
  const moves=`${exercise.setup} ${lesson.case.solution}`.split(' ');
  for(let i=0;i<=moves.length;i++){
    const alg=moves.slice(0,i).join(' '),state=cubeStickers(alg);
    const stickers=state.filter(s=>target.includes(s.cubie));
    assert.equal(stickers.length,5);
    for(const id of target){
      const piece=stickers.filter(s=>s.cubie===id);
      assert.ok(piece.every(s=>s.position.join(',')===piece[0].position.join(',')));
    }
    const svg=cubeSVG(alg,{orientation:'white-bottom',target});
    assert.match(svg,/yellow on top, white on bottom/);
    assert.equal((svg.match(/data-target=/g)||[]).length,stickers.filter(s=>s.normal.some(v=>v===1)).length);
    assert.doesNotMatch(cubeSVG(alg),/data-target=/);
  }
  const whiteBottom=cubeSVG('',{orientation:'white-bottom'});
  assert.match(whiteBottom,/<g data-face="U">.*?fill="#f5d447"/);
  assert.match(cubeSVG(''),/<g data-face="U">.*?fill="#f4f4ef"/);
});
