import {Cube} from './cube-solver.js';
import {LESSONS,changeLessonFrame} from './lessons.js';

// cubejs order: URF UFL ULB UBR DFR DLF DBL DRB;
// UR UF UL UB DR DF DL DB FR FL BL BR. Fix D cross edges and the FR pair.
const corners=[0,1,2,3,5,6,7],edges=[0,1,2,3,9,10,11];
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
export function createExercise(lessonId='13',{previousScramble='',random=Math.random}={}){
  const lesson=LESSONS.find(item=>item.id===lessonId);
  if(!lesson)throw Error('Unknown lesson');
  if(!initialized){Cube.initSolver();initialized=true;}
  const {solution,orientation,target,id:caseId}=lesson.case;
  const background=randomBackground(random);
  const solve=state=>Cube.inverse(state.solve());
  let setup=solve(background.clone().move(Cube.inverse(solution)));
  let scramble=changeLessonFrame(setup);
  // Also ensure refresh changes the state with deterministic random sources.
  if(scramble===previousScramble){
    setup=solve(background.move('U').move(Cube.inverse(solution)));
    scramble=changeLessonFrame(setup);
  }
  return Object.freeze({lessonId,caseId,scramble,setup,solution,orientation,target});
}
