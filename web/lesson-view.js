import {lessonCubeSVG} from './lesson-cube.js';
import {cubeFrame,orientAlgorithm,orientationColors} from './cube.js';
import {orientLessonCase,getLesson,caseLabel,caseName} from './lessons.js';
import {lessonPhases,lessonFocus} from './lesson-phases.js';

const escape=text=>text.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const thumbnails=new Map();
// The case a step leaves behind, drawn like the case picker's tiles.
function caseThumbnail(item,orientation){
  const key=item.id+':'+orientation;
  if(!thumbnails.has(key)){
    const view=orientLessonCase(item,orientation);
    thumbnails.set(key,lessonCubeSVG(view.setup,view));
  }
  return thumbnails.get(key);
}

export function createLessonDemo(root,lesson,runtime=globalThis,{getScrambleOrientation,getScrambleMode=()=>'random',setupCase=lesson.case,speed:initialSpeed=1,onSpeed:speedChanged=()=>{},focus:initialFocus=true,onFocus:focusChanged=()=>{},caseHref=()=>null}={}){
  let scrambleMode=getScrambleMode();
  const example=()=>scrambleMode==='setup'?setupCase:lesson.case;
  let {setup,scramble,solution,orientation,target}=orientLessonCase(example(),lesson.case.orientation);
  // The chosen speed carries over between demonstrations.
  // phases: the solution's steps for an F2L pair, null for other algorithms.
  // stopAt: playing one step ends at this move instead of the last one.
  let phases=null,focused=null,focusOn=initialFocus!==false,stopAt=null;
  let step=0,playing=false,turn=null,timeout=null,frame=null,destroyed=false,generation=0,speed=Number.isFinite(initialSpeed)&&initialSpeed>=0.5&&initialSpeed<=4?initialSpeed:1;
  root.innerHTML=`<div class="lesson-demo-layout"><p class="lesson-demo-setup" aria-label="Demo scramble"><span class="lesson-demo-frame scramble-frame muted"></span><code>${scramble}</code></p><div class="lesson-cube"></div><div class="lesson-demo-guide"><p class="lesson-view-frame"></p>
    <div class="lesson-moves" aria-label="Moves"></div>
    <p class="lesson-phase-note" hidden></p>
  <div class="lesson-playback" role="group" aria-label="Playback controls"><button type="button" class="small-button" data-action="reset">Reset</button><button type="button" class="small-button" data-action="previous" aria-label="Previous move">←</button><button type="button" class="small-button" data-action="play" aria-pressed="false">Play</button><button type="button" class="small-button" data-action="next" aria-label="Next move">→</button><button type="button" class="small-button lesson-focus" data-action="focus" aria-pressed="false" title="Dim the pieces that are not part of this pair" hidden>Focus</button></div>
    <label class="lesson-speed" for="lesson-animation-speed"><span class="lesson-speed-heading"><span>Animation speed</span><output for="lesson-animation-speed">${speed}×</output></span><input id="lesson-animation-speed" type="range" min="0.5" max="4" step="0.25" value="${speed}"></label></div></div>`;
  const find=selector=>root.querySelector(selector);
  const moves=()=>solution.trim().split(/\s+/).filter(Boolean);
  const algorithm=()=>[setup,...moves().slice(0,step)].join(' ');
  const scrambleFrame=()=>getScrambleOrientation?.() || orientation;
  // Read the steps and the pieces to follow from the displayed exercise.
  function analyse(){
    phases=lessonPhases({setup,solution,target});
    focused=lessonFocus(target);
  }
  const view=()=>({orientation,target,focus:focusOn?focused:null});
  const frameLabel=frame=>{const {top,front}=orientationColors(frame);return `${top} top · ${front} front`;};
  function paintScramble(){
    const frame=scrambleMode==='setup'?orientation:scrambleFrame();
    find('.lesson-demo-setup').setAttribute('aria-label',scrambleMode==='setup'?'Setup moves':'Demo scramble');
    find('.lesson-demo-setup code').textContent=orientAlgorithm(scramble,orientation,frame);
    find('.lesson-demo-setup').title=`${scrambleMode==='setup'?'Set up':'Scramble'} with ${cubeFrame(frame).label}. Moves follow the cube's U, F and R faces.`;
    // Name the holding position, as the timer and practice do.
    find('.lesson-demo-frame').textContent=`${scrambleMode==='setup'?'Setup':'Scramble'}: ${frameLabel(frame)}`;
  }
  function paint(){
    find('.lesson-cube').innerHTML=lessonCubeSVG(algorithm(),view());
    find('.lesson-view-frame').textContent=`Solve: ${frameLabel(orientation)}`;
    paintScramble();
  }
  function renderControls(){
    const sequence=moves();
    const current=turn?turn.index:step-1;
    const token=(move,i,align=false)=>`<span class="${i<step?'done':''} ${i===current?'current':''}${align?' align':''}" ${i===current?'aria-current="step"':''}>${move}</span>`;
    const strip=find('.lesson-moves'),note=find('.lesson-phase-note');
    note.hidden=!phases;
    if(phases){
      // The step being played, or the one the next move belongs to.
      const at=turn?turn.index:step,active=phases.findIndex(phase=>at>=phase.start&&at<phase.end);
      const cases=getLesson('f2l').cases;
      // The case a step leaves: a tile between the steps, or a line of the
      // note where the strip has no room for tiles.
      const leaves=(phase,className,plain,content)=>{
        const next=phase?.after&&cases.find(item=>item.id===phase.after);
        if(!next)return '';
        const href=caseHref(next.id),tag=href?'a':plain,label=escape('This step leaves '+caseName(next));
        return `<${tag} class="${className}" data-reduce-case="${next.id}"${href?` href="${escape(href)}"`:''} title="${label}" aria-label="${label}">${content(next)}</${tag}>`;
      };
      // Rebuilding the strip must not drop keyboard focus from a step.
      const held=root.ownerDocument?.activeElement,heldPhase=strip.contains?.(held)?held.dataset?.phase:undefined;
      strip.innerHTML=phases.map((phase,i)=>{
        const text=sequence.slice(phase.start,phase.end).join(' ');
        return `<button type="button" class="lesson-phase${i===active?' active':''}${step>=phase.end?' done':''}" data-phase="${i}" aria-label="${escape(phase.label+': '+text)}. Play this step"${i===active?' aria-current="true"':''}>${
          sequence.slice(phase.start,phase.end).map((move,k)=>token(move,phase.start+k,k<phase.align)).join(' ')}<small>${escape(phase.label)}</small></button>`+
          leaves(phase,'lesson-phase-case'+(!turn&&step===phase.end?' here':''),'div',next=>`<i aria-hidden="true">${caseThumbnail(next,orientation)}</i><small>${escape(caseLabel(next))}</small>`);
      }).join('');
      if(heldPhase!==undefined)find(`[data-phase="${heldPhase}"]`)?.focus?.({preventScroll:true});
      const phase=phases[active];
      note.innerHTML=phase?`<strong>${escape(phase.label)}.</strong> ${escape(phase.detail)}`+leaves(phase,'lesson-phase-leaves','em',next=>`Leaves <b>${escape(caseLabel(next))}</b>`):'<strong>Solved.</strong> The pair is in its slot.';
    }else strip.innerHTML=sequence.map((move,i)=>token(move,i)).join(' ');
    find('.lesson-moves .current')?.scrollIntoView?.({block:'nearest'});
    const focusButton=find('[data-action="focus"]');
    focusButton.hidden=!focused;
    focusButton.setAttribute('aria-pressed',String(focusOn));
    find('[data-action="play"]').textContent=playing?'Pause':'Play';
    find('[data-action="play"]').setAttribute('aria-pressed',String(playing));
    find('[data-action="play"]').disabled=!sequence.length;
    find('[data-action="previous"]').disabled=!!turn||step===0;
    find('[data-action="next"]').disabled=!!turn||step===sequence.length;
  }
  function pause(){playing=false;stopAt=null;runtime.clearTimeout(timeout);timeout=null;++generation;}
  // Playback rests longer between steps, so each one reads as a unit.
  const rest=()=>phases?.some(phase=>phase.end===step)?940:470;
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
    find('.lesson-view-frame').textContent=`Solve: ${frameLabel(orientation)}`;
    renderControls();
    function finish(){
      step=to;turn=null;frame=null;paint();
      if(step===moves().length||step===stopAt){playing=false;stopAt=null;}
      if(playing)schedule(rest());
      renderControls();
    }
    if(runtime.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return;}
    function animate(now){
      if(destroyed||turn!==active)return;
      active.elapsed+=Math.max(0,now-active.lastFrame)*speed;active.lastFrame=now;
      const progress=Math.min(1,active.elapsed/480);
      if(progress===1){finish();return;}
      const eased=progress*progress*(3-2*progress);
      find('.lesson-cube').innerHTML=lessonCubeSVG(active.alg,{...view(),move,progress:eased});
      frame=runtime.requestAnimationFrame(animate);
    }
    frame=runtime.requestAnimationFrame(animate);
  }
  function onClick(event){
    const button=event.target.closest('button');
    if(destroyed||!button||!root.contains(button))return;
    if(button.dataset.phase!==undefined){
      // Replay one step from its start, then stop.
      const phase=phases?.[Number(button.dataset.phase)];
      if(!phase)return;
      cancel();step=phase.start;stopAt=phase.end;playing=true;paint();schedule(300);
    }else if(button.dataset.action==='focus'){
      focusOn=!focusOn;focusChanged(focusOn);
      if(!turn)paint();
    }else if(button.dataset.action==='play'){
      if(!moves().length)return;
      if(playing)pause();
      else{
        playing=true;
        if(!turn){if(step===moves().length)step=0;paint();schedule(600);}
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
    speed=next;find('.lesson-speed output').textContent=`${speed}×`;speedChanged(speed);
    if(timeout!==null){runtime.clearTimeout(timeout);timeout=null;if(playing)schedule(rest());}
  }
  root.addEventListener('click',onClick);
  root.addEventListener('input',onSpeed);
  analyse();paint();renderControls();
  return {
    setOrientation(next){
      if(destroyed)return;
      if(next===orientation&&scrambleMode===getScrambleMode()){if(!turn)paint();else paintScramble();return;}
      cancel();step=0;
      scrambleMode=getScrambleMode();
      ({setup,scramble,solution,orientation,target}=orientLessonCase(example(),next));
      analyse();
      find('.lesson-demo-setup code').textContent=scramble;
      paint();renderControls();
    },
    reset(){if(destroyed)return;cancel();step=0;paint();renderControls();},
    destroy(){if(destroyed)return;cancel();destroyed=true;root.removeEventListener('click',onClick);root.removeEventListener('input',onSpeed);root.replaceChildren();},
  };
}
