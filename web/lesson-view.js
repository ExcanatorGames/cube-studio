import {lessonCubeSVG} from './lesson-cube.js';

export function createLessonDemo(root,lesson,runtime=globalThis){
  const {setup,solution,orientation,target}=lesson.case;
  let mode='solution',step=0,playing=false,turn=null,timeout=null,frame=null,destroyed=false,generation=0;
  root.innerHTML=`<p class="lesson-demo-setup">Demo scramble · Start solved <code>${setup}</code></p><div class="lesson-demo-layout"><div class="lesson-cube"></div><div class="lesson-demo-guide">
    <div class="lesson-demo-modes" role="group" aria-label="Demonstration sequence"><button type="button" class="small-button" data-mode="setup">Watch setup</button><button type="button" class="small-button" data-mode="solution">Insert pair</button></div>
    <div class="lesson-moves" aria-label="Moves"></div>
    <p class="lesson-move-status" role="status" aria-live="polite"></p>
    <div class="lesson-playback" role="group" aria-label="Playback controls"><button type="button" class="small-button" data-action="reset">Reset</button><button type="button" class="small-button" data-action="previous" aria-label="Previous move">←</button><button type="button" class="small-button" data-action="play" aria-pressed="false">Play</button><button type="button" class="small-button" data-action="next" aria-label="Next move">→</button></div>
    <p class="lesson-marker-key">Dots mark the corner and edge.</p>
  </div></div>`;
  const find=selector=>root.querySelector(selector);
  const moves=()=> (mode==='setup'?setup:solution).trim().split(/\s+/).filter(Boolean);
  const algorithm=()=>[mode==='solution'?setup:'',...moves().slice(0,step)].filter(Boolean).join(' ');
  const paint=()=>{find('.lesson-cube').innerHTML=lessonCubeSVG(algorithm(),{orientation,target});};
  function renderControls(){
    const sequence=moves();
    const current=turn?turn.index:step-1;
    find('.lesson-moves').innerHTML=sequence.map((move,i)=>`<span class="${i<step?'done':''} ${i===current?'current':''}" ${i===current?'aria-current="step"':''}>${move}</span>`).join(' ');
    find('.lesson-move-status').textContent=turn?`Move ${turn.index+1} of ${sequence.length} · ${turn.move}${turn.to<step?' · Undoing':' · Turning'}`:step?`Move ${step} of ${sequence.length} · ${sequence[step-1]}${step===sequence.length?mode==='setup'?' · Pair ready':' · Pair inserted':''}`:mode==='setup'?'Start with a solved cube':'Find the marked pair in the top layer';
    find('[data-action="play"]').textContent=playing?'Pause':'Play';
    find('[data-action="play"]').setAttribute('aria-pressed',String(playing));
    find('[data-action="previous"]').disabled=!!turn||step===0;
    find('[data-action="next"]').disabled=!!turn||step===sequence.length;
    for(const button of root.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  }
  function pause(){playing=false;runtime.clearTimeout(timeout);timeout=null;++generation;}
  function cancel(){pause();runtime.cancelAnimationFrame(frame);frame=null;turn=null;}
  function schedule(delay){
    const expected=generation;
    timeout=runtime.setTimeout(()=>{
      if(destroyed||expected!==generation||!playing)return;
      timeout=null;advance(1);
    },delay);
  }
  function advance(direction){
    if(destroyed||turn)return;
    const to=step+direction;
    if(to<0||to>moves().length)return;
    const index=direction>0?step:step-1,token=moves()[index];
    const move=direction>0||token.endsWith('2')?token:token.endsWith("'")?token.slice(0,-1):token+"'";
    const active={move,index,to,alg:algorithm(),started:runtime.performance.now()};
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
      const progress=Math.min(1,Math.max(0,(now-active.started)/480));
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
    if(button.dataset.mode){cancel();mode=button.dataset.mode;step=0;paint();}
    else if(button.dataset.action==='play'){
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
  root.addEventListener('click',onClick);
  paint();renderControls();
  return {
    reset(){if(destroyed)return;cancel();step=0;paint();renderControls();},
    destroy(){if(destroyed)return;cancel();destroyed=true;root.removeEventListener('click',onClick);root.replaceChildren();},
  };
}
