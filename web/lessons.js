const target=Object.freeze(['1,-1,1','1,0,1']);
const readyRight=Object.freeze({id:'ready-right',title:'Ready right',solution:"U R U' R'",orientation:'white-bottom',target});
export const LESSONS=Object.freeze([Object.freeze({id:'13',title:'Use one F2L pair',case:readyRight})]);
export const LESSON_SPLITS=Object.freeze(['First pair','Remaining F2L','Last layer']);

// Turn over about the front/back axis: green stays in front while white-top,
// red-right scrambling coordinates become white-bottom, orange-right solving.
export function changeLessonFrame(algorithm){
  const faces={U:'D',D:'U',R:'L',L:'R',F:'F',B:'B'};
  return algorithm.trim().split(/\s+/).filter(Boolean).map(move=>faces[move[0]]+move.slice(1)).join(' ');
}
