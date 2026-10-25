import {createExercise} from './lesson-scrambler.js';

self.onmessage=({data:{request,lessonId,previousScramble,withDemo,caseIds,demoCaseId}})=>{
  try{self.postMessage({request,exercise:createExercise(lessonId,{previousScramble,caseIds}),demoExercise:withDemo?createExercise(lessonId,{varied:false,caseIds:[demoCaseId]}):null});}
  catch{self.postMessage({request,error:true});}
};
