import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../../web/core.js';
import * as cube from '../../web/cube.js';
import * as lessons from '../../web/lessons.js';
import {createExercise} from '../../web/lesson-scrambler.js';
import {createMotion} from '../../web/motion.js';

const source=(await readFile(new URL('../../web/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const exercises=[createExercise(),createExercise()],demoExercise=createExercise('13',{varied:false});
export function harness({online=false,fetch:fetchRequest=async()=>({ok:true,json:async()=>({solves:[]})}),saved=null,deferLessonScrambles=false}={}){
  const elements=new Map(),listeners=new Map(),timers=new Map(),storage=new Map(),intervals=[];
  if(saved)storage.set('cube-studio-v1',JSON.stringify(saved));
  let timerId=0,now=1000,demoResets=0,demoDestroys=0;
  const lessonRequests=[];
  class Worker{
    postMessage(data){const complete=()=>this.onmessage({data:{request:data.request,exercise:exercises.find(e=>e.scramble!==data.previousScramble),demoExercise:data.withDemo?demoExercise:null}});if(deferLessonScrambles)lessonRequests.push(complete);else complete();}
    terminate(){}
  }
  function element(selector){
    if(elements.has(selector))return elements.get(selector);
    const classes=new Set(),attrs=new Map();
    const el={id:selector.slice(1),tagName:'DIV',hidden:false,disabled:false,textContent:'',innerHTML:'',value:'',dataset:{},clientWidth:500,
      classList:{add:c=>classes.add(c),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:c=>classes.has(c),toggle(c,on){if(on??!classes.has(c))classes.add(c);else classes.delete(c);}},
      style:{setProperty(){}},setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),removeAttribute:k=>attrs.delete(k),
      replaceChildren(){el.textContent='';},append(child){if(typeof child==='object')child.parentElement=el;},scrollIntoView(){},blur(){},focus(){document.activeElement=el;},
      getClientRects:()=>[],getBoundingClientRect:()=>({height:68,top:90,width:68,right:68,bottom:158}),addEventListener:(name,fn)=>listeners.set(selector+':'+name,fn),
      getContext:()=>({measureText:()=>({width:10})}),setPointerCapture(){},showModal(){el.open=true;},close(){el.open=false;},
    };
    elements.set(selector,el);return el;
  }
  const pages=['timer','history','insights','lessons'].map(name=>element('#'+name+'-page'));
  const nav=['timer','history','insights','lessons'].map(name=>{const el=element('nav-'+name);el.dataset.page=name;el.tagName='BUTTON';return el;});
  const groups=['history','insights','lesson'].map(name=>{const el=element('[data-header-context=\"'+name+'\"]');el.dataset.headerContext=name;return el;});
  element('#lesson-back').tagName='BUTTON';
  for(const id of ['history-scope','insight-scope','insight-period'])element('#'+id).value='all';
  element('#split-preset').value='beginner';
  const document={documentElement:element('html'),querySelector:element,querySelectorAll(selector){if(selector==='.page')return pages;if(selector==='[data-header-context]')return groups;if(selector.includes('[data-page]'))return selector.includes('#lesson-back')?[...nav,element('#lesson-back'),element('.brand')]:nav;return [];},createElement:tag=>element('created-'+tag),createTextNode:text=>text,body:element('body'),addEventListener:(name,fn)=>listeners.set('document:'+name,fn),hidden:false};
  element('#timer-page').append(element('#timer-card'));
  const sandbox={...core,...cube,...lessons,document,navigator:{onLine:online},fetch:fetchRequest,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    window:{document,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>listeners.set('window:'+name,fn),scrollTo(){}},addEventListener(){},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),setInterval(fn,ms){intervals.push({fn,ms});},
    requestAnimationFrame(){return 1;},cancelAnimationFrame(){},ResizeObserver:class{observe(){}},
    matchMedia:()=>({matches:false}),innerWidth:1280,innerHeight:900,scrollY:0,getComputedStyle:()=>({fontWeight:'700',fontSize:'24px',fontFamily:'monospace',letterSpacing:'0'}),
    performance:{now:()=>now},crypto,console,AbortSignal,Worker,
    initPWA(){},initConnection(){},syncHeaders:()=>({}),initSplitCharts:()=>()=>{},initSolveFeedback:()=>({render(){},fit(){}}),formatDifference:String,
    createMotion:()=>createMotion(sandbox.window),initMobileNavigation:options=>{sandbox.mobileNavigation=options;},
    createLessonDemo:()=>({reset(){demoResets++;},setOrientation(){demoResets++;},destroy(){demoDestroys++;}}),
  };
  const context=vm.createContext(sandbox);
  vm.runInContext(source,context);
  return {element,storage,listeners,intervals,lessonRequests,run:code=>vm.runInContext(code,context),advance(ms){now+=ms;},arm(){const callback=[...timers.values()].at(-1);callback();},get demoResets(){return demoResets;},get demoDestroys(){return demoDestroys;}};
}
