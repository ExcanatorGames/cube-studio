import {cubeStickers} from './cube.js';

const target=Object.freeze(['1,-1,1','1,0,1']);
const readyRight=Object.freeze({id:'ready-right',title:'Ready right',setup:"R U R' U'",solution:"U R U' R'",orientation:'white-bottom',target});
export const LESSONS=Object.freeze([Object.freeze({id:'13',title:'Use one F2L pair',case:readyRight})]);
export const LESSON_SPLITS=Object.freeze(['First pair','Remaining F2L','Last layer']);

const solved=cubeStickers();
const cross=['0,-1,1','1,-1,0','0,-1,-1','-1,-1,0'];
const fixed=new Set([...cross,...target]);
const sameSticker=(a,b)=>a.position.every((v,i)=>v===b.position[i])&&a.normal.every((v,i)=>v===b.normal[i]);
const triggers=face=>[`${face} U ${face}' U'`,`${face} U' ${face}' U`,`${face}' U ${face} U'`,`${face}' U' ${face} U`];
const backgrounds=triggers('L').flatMap(l=>triggers('B').flatMap(b=>[`${l} ${b}`,`${b} ${l}`])).filter(alg=>{
  const state=cubeStickers(alg);
  return state.every((s,i)=>!fixed.has(s.cubie)||sameSticker(s,solved[i]))&&state.some((s,i)=>solved[i].position[1]<=0&&!sameSticker(s,solved[i]));
});

/** @returns {{lessonId:string,caseId:string,scramble:string,solution:string,orientation:string,target:readonly string[]}} */
export function createExercise(lessonId='13',{previousScramble='',random=Math.random}={}){
  const lesson=LESSONS.find(item=>item.id===lessonId);
  if(!lesson)throw Error('Unknown lesson');
  const {setup,solution,orientation,target,id:caseId}=lesson.case;
  const candidates=backgrounds.map(background=>`${background} ${setup}`).filter(scramble=>scramble!==previousScramble);
  const index=Math.max(0,Math.min(candidates.length-1,Math.floor(random()*candidates.length)));
  return Object.freeze({lessonId,caseId,scramble:candidates[index],solution,orientation,target});
}
