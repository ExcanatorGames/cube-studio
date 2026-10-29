import {Cube} from './cube-solver.js';
import {getLesson,changeLessonFrame} from './lessons.js';

// cubejs order: URF UFL ULB UBR DFR DLF DBL DRB;
// UR UF UL UB DR DF DL DB FR FL BL BR. Fix D cross edges and the FR pair.
const corners=[0,1,2,3,5,6,7],edges=[0,1,2,3,9,10,11];
const slots=['Front right','Back right','Back left','Front left'];
const topTurns=['','U','U2',"U'"],undoTop=['',"U'",'U2','U'];
function simplify(algorithm){
  const moves=[];
  for(const token of algorithm.split(/\s+/).filter(Boolean)){
    if(moves.at(-1)?.[0]!==token[0]){moves.push(token);continue;}
    const turns=move=>move.endsWith('2')?2:move.endsWith("'")?3:1;
    const sum=(turns(moves.pop())+turns(token))%4;
    if(sum)moves.push(token[0]+['','','2',"'"][sum]);
  }
  return moves.join(' ');
}
function rotateSlot(algorithm,turns){
  const faces={F:'R',R:'B',B:'L',L:'F',U:'U',D:'D'};
  for(let i=0;i<turns;i++)algorithm=algorithm.replace(/[URFDLB]/g,face=>faces[face]);
  return algorithm;
}
function rotateTarget(target,turns){
  return Object.freeze(target.map(cubie=>{
    let [x,y,z]=cubie.split(',').map(Number);
    for(let i=0;i<turns;i++)[x,z]=[z,-x];
    return [x,y,z].join(',');
  }));
}
let initialized=false;
const parity=permutation=>permutation.reduce((sum,value,i)=>sum+permutation.slice(i+1).filter(other=>other<value).length,0)%2;
function shuffle(array,positions,random){
  for(let i=positions.length-1;i>0;i--){
    const a=positions[i],b=positions[Math.floor(random()*(i+1))];
    [array[a],array[b]]=[array[b],array[a]];
  }
}
function orient(array,positions,modulus,random){
  let sum=0;
  for(const position of positions.slice(0,-1)){array[position]=Math.floor(random()*modulus);sum+=array[position];}
  array[positions.at(-1)]=(modulus-sum%modulus)%modulus;
}
function randomBackground(random){
  const state=new Cube().toJSON();
  shuffle(state.cp,corners,random);shuffle(state.ep,edges,random);
  if(parity(state.cp)!==parity(state.ep))[state.ep[edges[0]],state.ep[edges[1]]]=[state.ep[edges[1]],state.ep[edges[0]]];
  orient(state.co,corners,3,random);orient(state.eo,edges,2,random);
  return new Cube(state);
}

/** Sample legal random backgrounds, then expose the lesson's pair.
 * Run in the worker: solver initialization and search must not block the UI.
 */
export function createExercise(lessonId='13',{previousScramble='',random=Math.random,varied=true,caseIds}={}){
  const lesson=getLesson(lessonId);
  if(!lesson)throw Error('Unknown lesson');
  const cases=caseIds===undefined?lesson.cases:caseIds.map(id=>lesson.cases.find(item=>item.id===id));
  if(!cases.length||cases.some(item=>!item))throw Error('Select valid lesson cases');
  if(!initialized){Cube.initSolver();initialized=true;}
  const slot=varied?Math.floor(random()*4):0,auf=varied?Math.floor(random()*4):0;
  const selected=cases[varied?Math.floor(random()*cases.length):0];
  const {orientation,id:caseId}=selected;
  const solution=rotateSlot(selected.alignmentSolutions[auf]||simplify([undoTop[auf],selected.solution].filter(Boolean).join(' ')),slot);
  const target=rotateTarget(selected.target,slot);
  const background=randomBackground(random);
  const solve=state=>rotateSlot(Cube.inverse(state.move(selected.setup).move(topTurns[auf]).solve()),slot);
  let setup=solve(background.clone());
  let scramble=changeLessonFrame(setup);
  // Also ensure refresh changes the state with deterministic random sources.
  if(scramble===previousScramble){
    setup=solve(background.move('U'));
    scramble=changeLessonFrame(setup);
  }
  return Object.freeze({lessonId:selected.sourceLessonId||lessonId,caseId,scramble,setup,solution,orientation,target,slot:slots[slot],auf,completion:selected.completion});
}
