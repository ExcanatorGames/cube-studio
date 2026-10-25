import {lessonCubeSVG} from './lesson-cube.js';
import {cubeFrame} from './cube.js';
import {orientLessonCase} from './lessons.js';

export function createLessonDemo(root,lesson,runtime=globalThis){
  let {setup,scramble,solution,orientation,target}=orientLessonCase(lesson.case,lesson.case.orientation);
  let step=0,playing=false,turn=null,timeout=null,frame=null,destroyed=false,generation=0,speed=1;
  root.innerHTML=`<p class="lesson-demo-setup" aria-label="Demo scramble"><code>${scramble}</code></p><div class="lesson-demo-layout"><div class="lesson-cube"></div><div class="lesson-demo-guide">
    <div class="lesson-moves" aria-label="Moves"></div>
  <div class="lesson-playback" role="group" aria-label="Playback controls"><button type="button" class="small-button" data-action="reset">Reset</button><button type="button" class="small-button" data-action="previous" aria-label="Previous move">←</button><button type="button" class="small-button" data-action="play" aria-pressed="false">Play</button><button type="button" class="small-button" data-action="next" aria-label="Next move">→</button></div>
    <label class="lesson-speed" for="lesson-animation-speed"><span>Animation speed</span><input id="lesson-animation-speed" type="range" min="0.5" max="4" step="0.25" value="1"><output for="lesson-animation-speed">1×</output></label></div></div>`;
  const find=selector=>root.querySelector(selector);
  const moves=()=>solution.trim().split(/\s+/).filter(Boolean);
  const algorithm=()=>[setup,...moves().slice(0,step)].join(' ');
  const paint=()=>{find('.lesson-cube').innerHTML=lessonCubeSVG(algorithm(),{orientation,target});find('.lesson-demo-setup').title=`Scramble with ${cubeFrame(orientation).label}. Moves follow the cube's U, F and R faces.`;};
  function renderControls(){
    const sequence=moves();
    const current=turn?turn.index:step-1;
    find('.lesson-moves').innerHTML=sequence.map((move,i)=>`<span class="${i<step?'done':''} ${i===current?'current':''}" ${i===current?'aria-current="step"':''}>${move}</span>`).join(' ');
    find('.lesson-moves .current')?.scrollIntoView?.({block:'nearest'});
    find('[data-action="play"]').textContent=playing?'Pause':'Play';
    find('[data-action="play"]').setAttribute('aria-pressed',String(playing));
    find('[data-action="play"]').disabled=!sequence.length;
    find('[data-action="previous"]').disabled=!!turn||step===0;
    find('[data-action="next"]').disabled=!!turn||step===sequence.length;
  }
  function pause(){playing=false;runtime.clearTimeout(timeout);timeout=null;++generation;}
  function cancel(){pause();runtime.cancelAnimationFrame(frame);frame=null;turn=null;}
  function schedule(delay){
    const expected=generation;
    timeout=runtime.setTimeout(()=>{
      if(destroyed||expected!==generation||!playing)return;
      timeout=null;advance(1);
    },delay/speed);
  }
  function advance(direction){
    if(destroyed||turn)return;
    const to=step+direction;
    if(to<0||to>moves().length)return;
    const index=direction>0?step:step-1,token=moves()[index];
    const move=direction>0||token.endsWith('2')?token:token.endsWith("'")?token.slice(0,-1):token+"'";
    const active={move,index,to,alg:algorithm(),lastFrame:runtime.performance.now(),elapsed:0};
    turn=active;
    renderControls();
    function finish(){
      step=to;turn=null;frame=null;paint();
      if(step===moves().length)playing=false;
      if(playing)schedule(470);
      renderControls();
    }
    if(runtime.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return;}
    function animate(now){
      if(destroyed||turn!==active)return;
      active.elapsed+=Math.max(0,now-active.lastFrame)*speed;active.lastFrame=now;
      const progress=Math.min(1,active.elapsed/480);
      if(progress===1){finish();return;}
      const eased=progress*progress*(3-2*progress);
      find('.lesson-cube').innerHTML=lessonCubeSVG(active.alg,{orientation,target,move,progress:eased});
      frame=runtime.requestAnimationFrame(animate);
    }
    frame=runtime.requestAnimationFrame(animate);
  }
  function onClick(event){
    const button=event.target.closest('button');
    if(destroyed||!button||!root.contains(button))return;
    if(button.dataset.action==='play'){
      if(!moves().length)return;
      if(playing)pause();
      else{
        playing=true;
        if(!turn){if(step===moves().length){step=0;paint();}schedule(600);}
      }
    }else{
      if(button.dataset.action==='reset'){cancel();step=0;paint();}
      else if(!turn){
        pause();
        if(button.dataset.action==='previous')advance(-1);
        if(button.dataset.action==='next')advance(1);
      }
    }
    renderControls();
  }
  function onSpeed(event){
    if(event.target!==find('#lesson-animation-speed'))return;
    const next=Number(event.target.value);if(!Number.isFinite(next)||next<0.5||next>4)return;
    if(turn){const now=runtime.performance.now();turn.elapsed+=Math.max(0,now-turn.lastFrame)*speed;turn.lastFrame=now;}
    speed=next;find('.lesson-speed output').textContent=`${speed}×`;
    if(timeout!==null){runtime.clearTimeout(timeout);timeout=null;if(playing)schedule(470);}
  }
  root.addEventListener('click',onClick);
  root.addEventListener('input',onSpeed);
  paint();renderControls();
  return {
    setOrientation(next){
      if(destroyed||next===orientation)return;
      cancel();step=0;
      ({setup,scramble,solution,orientation,target}=orientLessonCase(lesson.case,next));
      find('.lesson-demo-setup code').textContent=scramble;
      paint();renderControls();
    },
    reset(){if(destroyed)return;cancel();step=0;paint();renderControls();},
    destroy(){if(destroyed)return;cancel();destroyed=true;root.removeEventListener('click',onClick);root.removeEventListener('input',onSpeed);root.replaceChildren();},
  };
}
