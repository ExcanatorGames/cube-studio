import {orientAlgorithm} from './cube.js';

const target=Object.freeze(['1,-1,1','1,0,1']);
const readyRight=Object.freeze({id:'ready-right',title:'Ready right',solution:"U R U' R'",orientation:'white-bottom',target});
export const LESSONS=Object.freeze([Object.freeze({id:'13',title:'Use one F2L pair',case:readyRight})]);

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
