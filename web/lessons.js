import {orientAlgorithm,cubeStickers} from './cube.js';

const target=Object.freeze(['1,-1,1','1,0,1']);
const inverse=algorithm=>algorithm.split(' ').reverse().map(move=>move.endsWith('2')?move:move.endsWith("'")?move.slice(0,-1):move+"'").join(' ');
function defineCase(id,title,setupInsertion,description,group='Ready pairs',solution=setupInsertion,alignmentSolutions={}){
  return Object.freeze({id,title,setup:inverse(setupInsertion),solution,alignmentSolutions:Object.freeze(alignmentSolutions),description,group,orientation:'white-bottom',target,completion:'insertion'});
}
const readyRight=defineCase('ready-right','Ready right',"U R U' R'",'Insert the matching block with the edge to the right of the corner.','Ready pairs',"U R U' R'",{2:"R U2 R'"});
const readyLeft=defineCase('ready-left','Ready left',"U' F' U F",'Insert the matching block with the edge to the left of the corner.','Ready pairs',"U' F' U F",{2:"F' U2 F"});

// All 24 top-layer configurations, normalized with the corner above FR:
// 3 corner twists × 4 edge positions × 2 edge flips. The two joined
// configurations belong to lesson 13; the other 22 belong to lesson 14.
// Keys are cubejs corner twist, edge position (UR UF UL UB), edge flip.
// The second field defines the original starting state via its inverse.
// The third field is the efficient full solution. It may join the pieces
// during insertion; do not force a separate ready-pair alignment stage.
const pairingAlgorithms=[
  ["1,3,0","R U R'","R U R'"],
  ["2,2,1","F' U' F","F' U' F"],
  ["2,3,0","U' R U R' U2 R U' R'","U' R U R' U2 R U' R'"],
  ["2,2,0","U' R U2 R' U2 R U' R'","U' R U2 R' U2 R U' R'"],
  ["1,3,1","U F' U2 F U2 F' U F","U F' U2 F U2 F' U F"],
  ["0,0,0","R U2 R' U' R U R'","R U2 R' U' R U R'"],
  ["0,2,0","R U' R' U2 R U R'","R U' R' U2 R U R'",{1:"U F' U' F R U R'",2:"F' U' F R U R'",3:"U' F' U' F R U R'"}],
  ["2,1,0","F' U F U2 R U R'","F' U F U2 R U R'"],
  ["0,1,0","R U R' F' U F R U R'","R U R' F' U F R U R'",{1:"F' U' F R U2 R' F' U' F"}],
  ["0,1,1","F' U2 F U F' U' F","F' U2 F U F' U' F"],
  ["1,0,1","R U' R' U2 F' U' F","R U' R' U2 F' U' F"],
  ["0,3,1","F' U F U2 F' U' F","F' U F U2 F' U' F",{1:"U R U R' F' U' F",2:"R U R' F' U' F",3:"U' R U R' F' U' F"}],
  ["0,0,1","F' U' F R U' R' F' U' F","F' U' F R U' R' F' U' F",{3:"R U R' F' U2 F R U R'"}],
  ["0,3,0","U R U2 R' U R U' R'","U R U2 R' U R U' R'"],
  ["1,2,0","R U R' F' U F U R U' R'","U' R U R' U R U R'",{1:"F' U F U' R U R'",2:"R U' R' U' R U R'"}],
  ["0,2,1","R U2 R' F' U' F U' R U R'","U' F' U2 F U' F' U F"],
  ["1,1,0","U F' U2 F U' R U R'","U F' U2 F U' R U R'"],
  ["1,0,0","U' R U' R' U R U R'","U' R U' R' U R U R'"],
  ["2,3,1","F' U2 F R U2 R' U R U R'","U' R U' R' U F' U' F",{1:"R U R' U2 F' U' F",2:"F' U F U F' U' F"}],
  ["2,0,1","F' U F R U2 R' F' U F R U R'","U' R U2 R' U F' U' F"],
  ["2,1,1","R U' R' U F' U2 F R U R'","U F' U F U' F' U' F"],
  ["1,2,1","R U' R' F' U F U F' U' F","U F' U' F U2 F' U F"],
];
const pairingCases=pairingAlgorithms.map(([key,setupInsertion,solution,alignmentSolutions],index)=>{
  const [twist,edge,flip]=key.split(',').map(Number);
  const stickers=cubeStickers(inverse(setupInsertion));
  const white=stickers.find(s=>s.cubie===target[0]&&s.face==='D');
  const topCorner=stickers.find(s=>s.cubie===target[0]&&s.normal[1]===1);
  const topEdge=stickers.find(s=>s.cubie===target[1]&&s.normal[1]===1);
  const joinedWrong=twist!==0&&edge<2;
  const group=twist===0?'White on top':joinedWrong?'Incorrectly joined':topCorner.face===topEdge.face?'Matching top colors':'Different top colors';
  const facing=white.normal[1]===1?'up':white.normal[0]===1?'right':'front';
  const title=`${index+1}. White ${facing} · edge ${['right','front','left','back'][edge]} · ${flip?'right':'front'} color up`;
  const description=`${joinedWrong?'Separate the incorrectly joined pieces. ':''}Join and insert the matching pieces with simple slot triggers, preserving the white cross.`;
  return defineCase(`pair-${twist}-${edge}-${flip}`,title,setupInsertion,description,group,solution,alignmentSolutions);
});
function defineLesson(id,title,summary,introduction,cases){
  return Object.freeze({id,title,summary,introduction,cases:Object.freeze(cases),case:cases[0]});
}
export const LESSONS=Object.freeze([
  defineLesson('13','Use one F2L pair','Insert a ready pair · Either direction',
    "Recognize and insert a matching corner-edge block using U R U' R' or U' F' U F. Practice ends when that pair is inserted; no full solve is required.",[readyRight,readyLeft]),
  defineLesson('14','Build an F2L pair','22 top-layer cases · Pair and insert',
    "Start with a solved white cross and both matching pieces in the top layer. Join and insert the pair using simple slot triggers. Some cases pair as they enter the slot. Practice ends once the pair is slotted in and the white cross is restored.",pairingCases),
]);

// The original IDs remain valid for saved attempts and selections. The visible
// catalog combines them into one lesson; new cases use the stable F2L ID.
// Recognition groups follow CubeHead's All Standard F2L Cases chapters:
// https://www.youtube.com/watch?v=3tYj-9f4dA0
export const F2L_GROUPS=Object.freeze([
  'Easy Inserts','Disconnected Pairs','Corner in Slot',
  'Edge in Slot','Connected Pairs','Both Pieces in Slot',
]);
const slotAlgorithms=[
  ['0,0,8,1',"F' U F R U2 R'",["R U2 R' F' U' F","U F' U2 F R U R'","F' U2 F R U R'"]],
  ['4,1,0,0',"F' U2 F R U2 R'"],
  ['4,2,0,0',"R U R' U' R U R'",["U F' U F R U R'","F' U F R U R'","R U2 R' U2 R U R'"]],
  ['4,0,0,1',"R U2 R' U2 F' U' F",["U R U' R' U' F' U F","R U' R' U' F' U F","U' R U' R' U' F' U F"]],
  ['4,2,0,1',"U R U2 R' F' U2 F"],
  ['4,1,0,1',"U' R U' R' F' U' F",["F' U' F U F' U' F","F' U2 F U2 F' U' F","R U' R' F' U' F"]],
  ['0,1,8,0',"U' R U2 R' U R U R'",["R U R' U2 R U R'","U R U2 R' U R U R'","R U2 R' U R U R'"]],
  ['0,2,8,1',"U2 R U R' U' F' U F",["U R U R' U' F' U F","R U R' U' F' U F","R U R' U F' U' F"]],
  ['4,0,0,0',"U' F' U' F U R U R'",["F' U2 F U2 R U R'","U F' U' F U R U R'","F' U' F U R U R'"]],
  ['0,1,8,1',"U2 F' U F U R U R'",["F' U' F U' R U R'","F' U F U R U R'","U' F' U F U R U R'"]],
  ['4,1,8,1',"F' U F R U' R' U2 R U R'"],
  ['0,0,8,0',"R U2 R' F' U2 F U' R U R'",["R U' R' U F' U2 F R U2 R'","R U R' F' U F U2 R U R'","R U R' U' F' U' F R U R'"]],
  ['0,2,8,0',"U' R U' R' U' R U2 R'",["F' U2 F U' F' U' F","U R U' R' U' R U2 R'","R U' R' U' R U2 R'"]],
  ['4,2,8,1',"R U' R' F' U F U2 F' U' F"],
  ['4,2,8,0',"R U2 R' U R U' R' U R U R'"],
  ['4,1,8,0',"R U2 R' U2 R U2 R' U' R U R'"],
  ['4,0,8,1',"F' U' F U2 F' U2 F U' R U R'"],
];
const slotCases=slotAlgorithms.map(([key,solution,alignments])=>{
  const [corner,twist,edge,flip]=key.split(',').map(Number);
  const group=corner===4?(edge===8?'Both Pieces in Slot':'Corner in Slot'):'Edge in Slot';
  const white=cubeStickers(inverse(solution)).find(s=>s.cubie===target[0]&&s.face==='D');
  const facing=white.normal[1]===1?'up':white.normal[1]===-1?'down':white.normal[0]===1?'right':'front';
  const title=`${group} · white ${facing} · ${flip?'flipped edge':'oriented edge'}`;
  const alignmentSolutions=Object.fromEntries((alignments||(corner===4&&edge===8?[solution,solution,solution]:[])).map((alg,i)=>[i+1,alg]));
  return Object.freeze({...defineCase('slot-'+key.replaceAll(',','-'),title,solution,
    'Free the target pieces, then pair and insert them while preserving the cross.',group,solution,alignmentSolutions),sourceLessonId:'f2l'});
});
const topCases=LESSONS.flatMap(lesson=>lesson.cases.map(item=>{
  const easy=lesson.id==='13'||['pair-1-3-0','pair-2-2-1'].includes(item.id);
  const edge=Number(item.id.split('-')[2]);
  return Object.freeze({...item,sourceLessonId:lesson.id,
    group:easy?'Easy Inserts':edge<2?'Connected Pairs':'Disconnected Pairs'});
}));
const f2lCases=F2L_GROUPS.flatMap(group=>[...topCases,...slotCases].filter(item=>item.group===group));
export const LESSON_CATALOG=Object.freeze([
  defineLesson('f2l','F2L','41 cases · 6 practice groups',
    'Learn to pair and insert a corner and edge. Practice any group, or mix groups together.',f2lCases),
]);
export function getLesson(id){
  if(id==='mixed')return defineLesson('mixed','Mixed practice','Choose lessons and groups','',LESSON_CATALOG.flatMap(lesson=>lesson.cases));
  return LESSON_CATALOG.find(item=>item.id===id)||LESSONS.find(item=>item.id===id);
}

// Turn over about the front/back axis: green stays in front while white-top,
// red-right scrambling coordinates become white-bottom, orange-right solving.
export function changeLessonFrame(algorithm){
  return orientAlgorithm(algorithm,'white-top','white-bottom');
}

// Keep the same physical exercise when turning the cube over, including its
// move notation and the identities of the two marked pieces. Green stays front.
export function orientLessonCase(exercise,orientation){
  const flip=exercise.orientation!==orientation;
  const setup=flip?changeLessonFrame(exercise.setup):exercise.setup;
  return {...exercise,orientation,setup,scramble:setup,
    solution:flip?changeLessonFrame(exercise.solution):exercise.solution,
    target:flip?exercise.target.map(cubie=>{const [x,y,z]=cubie.split(',').map(Number);return [-x,-y,z].join(',');}):exercise.target,
    slot:flip?exercise.slot?.replace(/right|left/g,side=>side==='right'?'left':'right'):exercise.slot,
  };
}
