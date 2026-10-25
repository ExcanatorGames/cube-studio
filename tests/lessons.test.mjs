import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS,changeLessonFrame,orientLessonCase} from '../web/lessons.js';
import {createExercise} from '../web/lesson-scrambler.js';
import {cubeStickers,cubeSVG,cubeFaces} from '../web/cube.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';

test('lesson card preview depicts the taught case in either saved orientation',()=>{
  for(const orientation of ['white-top','white-bottom']){
    const preview=orientLessonCase(LESSONS[0].case,orientation);
    assert.deepEqual(cubeFaces(preview.setup+' '+preview.solution),cubeFaces(''));
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
    const inserted=cubeStickers(top.setup+' '+top.solution),solved=cubeStickers();
    for(let j=0;j<inserted.length;j++)if(top.target.includes(inserted[j].cubie))assert.equal(JSON.stringify(inserted[j]),JSON.stringify(solved[j]));
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

test('practice covers four white color pairs and all top-layer positions with matching insertion hints',()=>{
  const slots=['Front right','Back right','Back left','Front left'];
  const targets=[['1,-1,1','1,0,1'],['1,-1,-1','1,0,-1'],['-1,-1,-1','-1,0,-1'],['-1,-1,1','-1,0,1']];
  const sides=['R','B','L','F'],lead=['U','',"U'",'U2'];
  const inverted=algorithm=>algorithm.split(' ').reverse().map(move=>move.endsWith('2')?move:move.endsWith("'")?move.slice(0,-1):move+"'").join(' ');
  const solvedStickers=cubeStickers(),topPositions=new Set(),colorPairs=new Set();
  let seed=654321;const next=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for(let slot=0;slot<4;slot++)for(let auf=0;auf<4;auf++){
    const choices=[slot/4,auf/4],exercise=createExercise('13',{random:()=>choices.length?choices.shift():next()});
    const expected=[lead[auf],sides[slot],"U'",sides[slot]+"'"].filter(Boolean).join(' ');
    assert.equal(exercise.slot,slots[slot]);assert.equal(exercise.auf,auf);
    assert.equal(exercise.solution,expected);assert.deepEqual(exercise.target,targets[slot]);
    const scrambled=simulate(exercise.scramble);
    for(const sticker of cross)assert.equal(scrambled[sticker],sticker,'white-up scramble preserves the white cross');
    const initial=cubeStickers(exercise.setup),canonical=cubeStickers(inverted(expected));
    const inserted=cubeStickers(exercise.setup+' '+exercise.solution);
    for(let i=0;i<initial.length;i++){
      if(exercise.target.includes(initial[i].cubie)){
        assert.equal(JSON.stringify(initial[i]),JSON.stringify(canonical[i]),'the pair remains the taught insertion case');
        assert.equal(JSON.stringify(inserted[i]),JSON.stringify(solvedStickers[i]),'the hint solves both target pieces');
      }
      if(['0,-1,1','1,-1,0','0,-1,-1','-1,-1,0'].includes(initial[i].cubie))assert.equal(JSON.stringify(inserted[i]),JSON.stringify(solvedStickers[i]));
    }
    colorPairs.add(exercise.target.join('|'));
    topPositions.add(initial.find(s=>s.cubie===exercise.target[0]).position.join(','));
  }
  assert.equal(colorPairs.size,4);assert.equal(topPositions.size,4);
});

test('cubie markers follow both physical pieces through every demonstration turn',()=>{
  const lesson=LESSONS[0],target=lesson.case.target,exercise=createExercise('13',{varied:false});
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
