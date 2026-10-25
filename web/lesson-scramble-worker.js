import {createExercise} from './lesson-scrambler.js';

self.onmessage=({data:{request,lessonId,previousScramble,withDemo}})=>{
  try{self.postMessage({request,exercise:createExercise(lessonId,{previousScramble}),demoExercise:withDemo?createExercise(lessonId,{varied:false}):null});}
  catch{self.postMessage({request,error:true});}
};
