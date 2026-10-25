import {createExercise} from './lesson-scrambler.js';

self.onmessage=({data:{request,lessonId,previousScramble}})=>{
  try{self.postMessage({request,exercise:createExercise(lessonId,{previousScramble})});}
  catch{self.postMessage({request,error:true});}
};
