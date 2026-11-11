import {createExercise,createPracticeExercise} from './lesson-scrambler.js';

self.onmessage=({data:{request,lessonId,previousScramble,withDemo,demoOnly,caseIds,demoCaseId}})=>{
  try{
    const demoExercise=withDemo||demoOnly?createExercise(lessonId,{varied:false,caseIds:[demoCaseId]}):null;
    if(demoOnly){self.postMessage({request,demoExercise});return;}
    self.postMessage({request,exercise:createPracticeExercise(lessonId,{previousScramble,caseIds}),demoExercise});
  }
  catch{self.postMessage({request,error:true});}
};
