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
