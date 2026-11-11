import {Cube} from './cube-solver.js';
import {getLesson,changeLessonFrame,freezeLessonExercise,PRACTICE_COMPLETION,PRACTICE_STEPS_COMPLETION,LAST_LAYER_STAGES} from './lessons.js';

// cubejs order: URF UFL ULB UBR DFR DLF DBL DRB;
// UR UF UL UB DR DF DL DB FR FL BL BR. Keep D cross edges fixed.
const slots=['Front right','Back right','Back left','Front left'];
const slotCorners=[4,7,6,5],slotEdges=[8,11,10,9];
const topTurns=['','U','U2',"U'"],undoTop=['',"U'",'U2','U'];
// Whole-cube turns that bring slot 1, 2 or 3 to the front right (slot 0).
const rotations=['','y','y2',"y'"];
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
function randomBackground(random,fixedSlots=[0]){
  const corners=Array.from({length:8},(_,i)=>i).filter(i=>!fixedSlots.some(slot=>slotCorners[slot]===i));
  const edges=[0,1,2,3,8,9,10,11].filter(i=>!fixedSlots.some(slot=>slotEdges[slot]===i));
  const state=new Cube().toJSON();
  shuffle(state.cp,corners,random);shuffle(state.ep,edges,random);
  if(parity(state.cp)!==parity(state.ep))[state.ep[edges[0]],state.ep[edges[1]]]=[state.ep[edges[1]],state.ep[edges[0]]];
  orient(state.co,corners,3,random);orient(state.eo,edges,2,random);
  return new Cube(state);
}

/** First two layers solved, with the last layer solved as far as `stage`
 * (an index into LAST_LAYER_STAGES) and random beyond it: edge orientation,
 * then corner orientation, corner permutation and edge permutation. Corners
 * permuted relative to each other may still need a turn of the top layer.
 * A fully solved background stays solved: the final step ends the solve.
 */
function lastLayerBackground(random,stage){
  const state=new Cube().toJSON(),top=[0,1,2,3];
  if(stage<2)shuffle(state.cp,top,random);
  if(stage<3)shuffle(state.ep,top,random);
  if(parity(state.cp)!==parity(state.ep))[state.ep[0],state.ep[1]]=[state.ep[1],state.ep[0]];
  if(stage<1)orient(state.co,top,3,random);
  return new Cube(state).move(stage===2?topTurns[Math.floor(random()*4)]:'');
}
// What each last-layer stage must achieve, checked on a cube whose last
// layer was solved apart from what this stage's case changed.
const top=[0,1,2,3];
const stageGoals={
  'oll-edges':state=>top.every(i=>!state.eo[i]),
  'oll-corners':state=>top.every(i=>!state.eo[i]&&!state.co[i]),
  // Corners solved relative to each other; the top layer may still be turned.
  'pll-corners':state=>top.every(i=>!state.eo[i]&&!state.co[i]&&(state.cp[i]-i-state.cp[0]+8)%4===0),
  'pll-edges':state=>new Cube(state).isSolved(),
};
const moveCount=algorithm=>algorithm.split(' ').filter(Boolean).length;
/** One last-layer case, aligned with a top turn and solved from `facing`
 * (the slot the previous F2L pair left at the front right). `finish` adds a
 * final top turn, as edge permutation algorithms often need. */
function lastLayerStep(selected,{auf=0,facing=0,finish=0}={}){
  const aligned=(before,after)=>simplify([undoTop[before],selected.solution,undoTop[after]].filter(Boolean).join(' '));
  // Symmetric cases look the same after some top turns. Of the alignments
  // that solve exactly this step's case, use the shortest: no U2 before H perm.
  let insert=aligned(auf,finish);
  const exposed=new Cube().move(Cube.inverse(insert)),goal=stageGoals[selected.stage];
  for(let before=0;before<4;before++)for(let after=0;after<4;after++){
    const candidate=aligned(before,after);
    if(moveCount(candidate)<moveCount(insert)&&goal(exposed.clone().move(candidate).toJSON()))insert=candidate;
  }
  return {
    lessonId:selected.sourceLessonId,caseId:selected.id,stage:selected.stage,
    solution:rotateSlot(insert,facing),insert,rotation:'',
    orientation:selected.orientation,fixedOrientation:true,target:selected.target,
    auf,completion:selected.completion,
  };
}
const stageIndex=item=>LAST_LAYER_STAGES.indexOf(item.stage);

/** Work backwards from four solved slots. Each inverse insertion exposes an
 * enabled case; solving it restores the exact state for the following pair.
 * Only the remaining pieces form the random background, so earlier slots and
 * the cross are restored after every insertion, regardless of the case mix.
 *
 * Enabled last-layer cases add one step per last-layer stage, after any F2L
 * pairs. Their background keeps the first two layers solved and the last
 * layer solved up to the latest enabled stage, so each earlier inverse
 * algorithm exposes exactly its case's pattern.
 */
export function createPracticeExercise(lessonId='f2l',{previousScramble='',random=Math.random,caseIds}={}){
  const lesson=getLesson(lessonId);
  if(!lesson)throw Error('Unknown lesson');
  const cases=caseIds===undefined?lesson.cases:caseIds.map(id=>lesson.cases.find(item=>item.id===id));
  if(!cases.length||cases.some(item=>!item))throw Error('Select valid lesson cases');
  if(!initialized){Cube.initSolver();initialized=true;}
  const pairCases=cases.filter(item=>!item.stage);
  const stageCases=LAST_LAYER_STAGES.map(stage=>cases.filter(item=>item.stage===stage));
  const lastStage=stageCases.findLastIndex(list=>list.length);
  function sample(){
    const availableSlots=[0,1,2,3];
    let facing=0;
    const steps=pairCases.length?Array.from({length:slots.length},()=>{
      const slot=availableSlots.splice(Math.floor(random()*availableSlots.length),1)[0];
      const auf=Math.floor(random()*4),selected=pairCases[Math.floor(random()*pairCases.length)];
      const insert=selected.alignmentSolutions[auf]||simplify([undoTop[auf],selected.solution].filter(Boolean).join(' '));
      // Hints turn the cube so each slot is solved at the front right, as taught.
      // Rotations are relative to where the previous pair left the cube.
      const rotation=rotations[(slot-facing+4)%4];
      facing=slot;
      return {
        lessonId:selected.sourceLessonId||lessonId,caseId:selected.id,
        solution:rotateSlot(insert,slot),insert,rotation,
        orientation:selected.orientation,target:rotateTarget(selected.target,slot),
        slot:slots[slot],auf,completion:selected.completion,
      };
    }):[];
    if(lastStage<0)return {steps,background:randomBackground(random,steps.map(step=>slots.indexOf(step.slot)))};
    const background=lastLayerBackground(random,lastStage);
    stageCases.forEach((list,stage)=>{
      if(!list.length)return;
      steps.push(lastLayerStep(list[Math.floor(random()*list.length)],
        {auf:Math.floor(random()*4),facing,finish:stage===LAST_LAYER_STAGES.length-1?Math.floor(random()*4):0}));
    });
    return {steps,background};
  }
  const construct=({steps,background})=>{
    const reverse=steps.toReversed().map(step=>Cube.inverse(step.solution)).join(' ');
    return Cube.inverse(background.clone().move(reverse).solve());
  };
  let sampled=sample(),setup=construct(sampled);
  if(changeLessonFrame(setup)===previousScramble){
    // A last-layer background fixes what the final step solves, so draw a new
    // exercise instead of turning the background's top layer.
    if(lastStage<0)setup=construct({...sampled,background:sampled.background.move('U')});
    else for(let attempt=0;attempt<8&&changeLessonFrame(setup)===previousScramble;attempt++)setup=construct(sampled=sample());
  }
  const {steps}=sampled;
  return freezeLessonExercise({
    ...steps[0],scramble:changeLessonFrame(setup),setup,steps,
    solution:steps.map(step=>step.solution).join(' '),
    target:steps.flatMap(step=>step.target),
    completion:lastStage<0?PRACTICE_COMPLETION:PRACTICE_STEPS_COMPLETION,
  });
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
  if(selected.stage)return lastLayerExercise(selected,{previousScramble,random,auf,varied});
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

/** A single last-layer case on a background solved up to its stage. */
function lastLayerExercise(selected,{previousScramble,random,auf,varied}){
  const stage=stageIndex(selected);
  let setup,step;
  for(let attempt=0;attempt<8&&(!setup||changeLessonFrame(setup)===previousScramble);attempt++){
    const cube=lastLayerBackground(random,stage);
    const finish=varied&&stage===LAST_LAYER_STAGES.length-1?Math.floor(random()*4):0;
    step=lastLayerStep(selected,{auf,finish});
    setup=Cube.inverse(cube.move(Cube.inverse(step.solution)).solve());
  }
  const {lessonId,caseId,solution,orientation,fixedOrientation,target,completion}=step;
  return Object.freeze({lessonId,caseId,stage:selected.stage,scramble:changeLessonFrame(setup),setup,solution,orientation,fixedOrientation,target,auf,completion});
}
