import {PRESETS,formatTime,result,summary,average,parseCSV,parseTime,exportCSV,practiceScramble,decodeCSV,splitProgress,solveFeedback,normalizeSolve,insightPeriods,metricChange,timeExtremes,solveDistribution,splitComparisons} from './core.js';
import {initPWA} from './pwa.js';
import {cubeSVG,scrambleLines,cubeFrame,orientAlgorithm} from './cube.js';
import {initSplitCharts} from './split-charts.js';
import {initSolveFeedback,formatDifference} from './solve-feedback.js';
import {initConnection,syncHeaders} from './connect.js';
import {LESSONS,orientLessonCase} from './lessons.js';
import {createLessonDemo} from './lesson-view.js';
import {lessonCubeSVG} from './lesson-cube.js';
import {initMobileNavigation} from './mobile-navigation.js';
import {createMotion} from './motion.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const motion=createMotion();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='cube-studio-v1';
let saved={},storageReadFailed=false;try{saved=JSON.parse(localStorage.getItem(STORE)||'{}');}catch{storageReadFailed=true;}
let records=new Map((saved.solves||[]).map(s=>[s.id,normalizeSolve(s)])), pending=new Map((saved.pending||[]).map(s=>[s.id,normalizeSolve(s)]));
let lessonAttempts=new Map((saved.lessonAttempts||[]).map(s=>[s.id,{...normalizeSolve(s),lessonId:s.lessonId,caseId:s.caseId}]));
let settings={preset:'beginner',custom:['Cross','First pair','Remaining F2L','Last layer'],hold:550,track:false,orientation:'white-top',lessonOrientation:'white-bottom',...saved.settings};
settings.orientation=settings.orientation==='white-bottom'?'white-bottom':'white-top';
settings.lessonOrientation=settings.lessonOrientation==='white-top'?'white-top':'white-bottom';
let page='timer', historyPage=0, selected=null, imported=[], toastTimeout;
let syncBusy=false,syncRequested=false,syncState='healthy',lastSync=0;
let state='idle',started=0,elapsed=0,splitMarks=[],activeNames=[],scramble='',scrambleKind='',lastFinished=0,armTimeout,keyboardHeld=false,frame,wakeLock;
let lastSolveId=null,stepsHTML='';
let touches=new Set(),gesture=false,scrambleRequest=0;
// normalScramble retains the generator's white-top frame; scramble is the
// notation displayed and applied in the currently selected cube frame.
let timerContext={kind:'normal'},normalScramble=null,activeAttempt=null,lessonDemo=null;
const tracking=()=>timerContext.kind!=='lesson'&&settings.track;
const cubeOrientation=()=>timerContext.kind==='lesson'?settings.lessonOrientation:settings.orientation;
const lessonExercise=()=>timerContext.exercise?orientLessonCase(timerContext.exercise,settings.lessonOrientation):null;
const timerVisible=()=>page==='timer'||page==='lessons'&&timerContext.kind==='lesson'&&timerContext.tab==='practice';
const all=()=>[...records.values()].filter(s=>!s.deleted).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));
const names=()=>timerContext.kind==='lesson'?[]:settings.preset==='custom'?settings.custom:PRESETS[settings.preset];
function persist(){try{localStorage.setItem(STORE,JSON.stringify({solves:[...records.values()],pending:[...pending.values()],lessonAttempts:[...lessonAttempts.values()],settings}));return true;}catch{toast('Device storage is full or blocked. Keep this page open and export your solves.');return false;}}
function toast(message,undo){clearTimeout(toastTimeout);const t=$('#toast');t.replaceChildren(document.createTextNode(message));if(undo){const b=document.createElement('button');b.textContent='Undo';b.onclick=()=>{undo();t.hidden=true;};t.append(b);}t.hidden=false;toastTimeout=setTimeout(()=>t.hidden=true,undo?12000:5500);}
function renderSyncStatus(){
  const messages={healthy:pending.size?`${pending.size} waiting to sync`:'',offline:pending.size?`${pending.size} saved offline`:'Offline',auth:pending.size?`${pending.size} saved · connect to sync`:'Not connected',setup:'Cloud sync setup needed',error:pending.size?`${pending.size} saved on device · sync failed`:'Sync failed'};
  const text=messages[syncState];
  $('#mobile-sync').textContent=text;$('#mobile-sync').hidden=!text;
  $('#connect-sync').hidden=syncState!=='auth';
  $('#sync-mobile').hidden=syncState==='healthy'||syncState==='auth';
  $('#sync-mobile').disabled=syncBusy;
  $('#sync-attention').hidden=!text;
}
function updateSolve(s){s=normalizeSolve({...s,updatedAt:Math.max(Date.now(),(records.get(s.id)?.updatedAt||0)+1)});records.set(s.id,s);pending.set(s.id,s);persist();render();sync();return s;}
function saveAttempt(s,attempt){
  if(attempt.context!=='lesson')return updateSolve(s);
  const exercise=attempt.exercise;
  const practice={...s,lessonId:exercise.lessonId,caseId:exercise.caseId};
  lessonAttempts.set(s.id,practice);persist();render();return practice;
}
function practiceTimes(){return [...lessonAttempts.values()].filter(s=>!s.deleted&&s.lessonId===timerContext.lessonId).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));}
async function sync(){
  if(syncBusy){syncRequested=true;renderSyncStatus();return;}
  syncBusy=true;renderSyncStatus();
  try{
    do{
      syncRequested=false;
      if(!navigator.onLine){syncState='offline';break;}
      try{
        const batch=[...pending.values()];
        for(let i=0;i<batch.length;i+=350){
          const part=batch.slice(i,i+350),r=await fetch('/api/solves',{method:'POST',headers:{'content-type':'application/json',...syncHeaders()},body:JSON.stringify({solves:part}),redirect:'manual',signal:AbortSignal.timeout(15000)});
          if(!r.ok){if(r.status===401||r.status===403||r.type==='opaqueredirect')throw Error('sign-in');throw Error('Sync failed');}
          for(const s of part)if(pending.get(s.id)?.updatedAt===s.updatedAt)pending.delete(s.id);
          persist();
        }
        const r=await fetch('/api/solves',{headers:syncHeaders(),redirect:'manual',signal:AbortSignal.timeout(15000)});
        if(!r.ok){
          if(r.status===401||r.status===403||r.type==='opaqueredirect')throw Error('sign-in');
          if(r.status===503){const data=await r.json().catch(()=>({}));if(data.setupRequired)throw Error('setup');}
          throw Error('Unable to load shared storage');
        }
        const data=await r.json();
        for(const s of data.solves){const local=records.get(s.id);if(!local||s.updatedAt>local.updatedAt)records.set(s.id,normalizeSolve(s));}
        persist();lastSync=Date.now();syncState=navigator.onLine?'healthy':'offline';render();
      }catch(e){
        syncState=e.message==='sign-in'?'auth':e.message==='setup'?'setup':navigator.onLine?'error':'offline';
        if(!syncRequested)break;
      }
      renderSyncStatus();
    }while(syncRequested||pending.size);
  }finally{syncBusy=false;renderSyncStatus();}
}
function filtered(scope,period='all'){let a=all();if(scope==='today')a=a.filter(s=>new Date(s.date).toDateString()===new Date().toDateString());if(period!=='all')a=a.filter(s=>Date.parse(s.date)>=Date.now()-Number(period)*86400000);return a;}
function renderHeader(){
  const context=page==='lessons'&&timerContext.kind==='lesson'?'lesson':page;
  $$('[data-header-context]').forEach(group=>group.hidden=group.dataset.headerContext!==context);
}
function setPage(p){
  if(busy()||p===page&&timerContext.kind!=='lesson')return;
  const previous=page;page=p;
  focusView(false,{immediate:true});
  $('#page-title').textContent={timer:'Timer',history:'Solves',insights:'Analysis',lessons:'Lessons'}[p];
  // Selection is immediate and stays outside the moving page snapshots.
  $$('.sidebar [data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===p);if(b.dataset.page===p)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const order=$$('.sidebar nav [data-page]').map(b=>b.dataset.page),direction=order.indexOf(p)>order.indexOf(previous)?1:-1;
  const animated=motion.swap('page',()=>{
    lessonDemo?.destroy();lessonDemo=null;
    if(timerContext.kind==='lesson')leaveLesson();
    $$('.page').forEach(el=>el.hidden=el.id!==p+'-page');
    render();window.scrollTo({top:0,behavior:'instant'});
    // A long Insights snapshot must stay inside the space above the phone navigation.
    const nav=$('.sidebar').getBoundingClientRect(),mobile=nav.top>0&&nav.width>nav.height;
    const root=document.documentElement.style;
    root.setProperty('--page-clip-top',Math.max(0,$('.app-bar').getBoundingClientRect().bottom)+'px');
    root.setProperty('--page-clip-left',(mobile?0:nav.right)+'px');
    root.setProperty('--page-clip-bottom',(mobile?innerHeight-nav.top:0)+'px');
  },{direction});
  if(!animated)motion.play($('#'+p+'-page'),[{translate:`${direction*innerWidth}px 0`},{translate:'0 0'}],{duration:260});
}
$$('[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
$('.brand').onclick=e=>{e.preventDefault();setPage('timer');};
function renderLessonCards(){
  $('#lesson-cards').innerHTML=LESSONS.map(lesson=>{
    const preview=lesson.case;
    return `<button type="button" class="lesson-card" data-lesson="${lesson.id}"><span class="lesson-card-cube" aria-hidden="true">${lessonCubeSVG(preview.setup,preview)}</span><span class="lesson-card-copy"><strong>${esc(lesson.title)}</strong><small>Ready right · One pair, then a full solve</small></span><span class="lesson-card-arrow" aria-hidden="true">→</span></button>`;
  }).join('');
}
renderLessonCards();
$('#lesson-cards').onclick=e=>{const button=e.target.closest('[data-lesson]');if(button)openLesson(button.dataset.lesson);};
$('#lesson-back').onclick=()=>setPage('lessons');
const lessonTabs=['lesson','practice'];
for(const tab of lessonTabs){
  const button=$('#lesson-tab-'+tab);
  button.onclick=()=>setLessonTab(tab);
  button.onkeydown=event=>{
    if(busy())return;
    const index=lessonTabs.indexOf(tab);
    const next={ArrowRight:lessonTabs[(index+1)%lessonTabs.length],ArrowLeft:lessonTabs[(index+lessonTabs.length-1)%lessonTabs.length],Home:'lesson',End:'practice'}[event.key];
    if(!next)return;
    event.preventDefault();setLessonTab(next);$('#lesson-tab-'+next).focus();
  };
}
function renderLessonTabs(){
  if(timerContext.kind!=='lesson')return;
  for(const tab of lessonTabs){
    const selected=timerContext.tab===tab,button=$('#lesson-tab-'+tab);
    button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;button.disabled=busy();
    $('#lesson-panel-'+tab).hidden=!selected;
  }
}
function setLessonTab(tab){
  if(busy()||timerContext.kind!=='lesson'||!lessonTabs.includes(tab)||timerContext.tab===tab)return;
  lessonDemo?.reset();keyboardHeld=false;touches.clear();gesture=false;
  timerContext.tab=tab;renderLessonTabs();updateTimerHeight();layoutScramble();
  requestAnimationFrame(()=>feedbackView.fit());
}
function resetTimerContext(){
  clearTimeout(armTimeout);keyboardHeld=false;touches.clear();gesture=false;
  state='idle';elapsed=0;splitMarks=[];activeNames=[];activeAttempt=null;lastSolveId=null;
  $('#clock').textContent='0.00';
}
function openLesson(id){
  if(busy())return;
  const lesson=LESSONS.find(item=>item.id===id);if(!lesson)return;
  ++scrambleRequest;
  resetTimerContext();
  timerContext={kind:'lesson',lessonId:id,tab:'lesson',exercise:null,assistance:false};
  $('#lesson-list').hidden=true;$('#lesson-detail').hidden=false;
  $('#lesson-title').textContent=lesson.title;
  renderHeader();
  $('#lesson-practice-mount').append($('#timer-card'));
  lessonDemo?.destroy();lessonDemo=null;
  $('#lesson-demo').innerHTML='<p role="status">Preparing scramble…</p>';
  newScramble();timerVisual();updateTimerHeight();window.scrollTo({top:0,behavior:'instant'});
}
function leaveLesson(){
  ++scrambleRequest;resetTimerContext();timerContext={kind:'normal'};
  $('#timer-page').prepend($('#timer-card'));
  $('#lesson-detail').hidden=true;$('#lesson-list').hidden=false;
  renderHeader();
  if(normalScramble){scramble=orientAlgorithm(normalScramble.scramble,'white-top',settings.orientation);scrambleKind=normalScramble.kind;showScramble();}
  else newScramble();
  timerVisual();
}
function renderLessonAssistance(){
  const lesson=timerContext.kind==='lesson',enabled=lesson&&timerContext.assistance;
  $('#fullscreen-lesson-title').hidden=!lesson;
  $('#fullscreen-lesson-title').setAttribute('aria-hidden',String(!document.body.classList.contains('focus-mode')));
  $('#fullscreen-lesson-title').textContent=lesson?LESSONS.find(item=>item.id===timerContext.lessonId).title:'';
  $('#lesson-help').hidden=!lesson;
  $('#manual-entry').hidden=lesson;
  $('#timer-pad').setAttribute('aria-label',lesson?'Hold Space or two fingers, then release to start. Tap to stop.':'Hold Space or two fingers, then release to start. Tap to stop or mark a split.');
  $('#lesson-help').disabled=busy()||lesson&&!timerContext.exercise;
  $('#lesson-help').setAttribute('aria-pressed',String(enabled));
  $('#lesson-help').innerHTML=`<span aria-hidden="true">${enabled?'✓':'✕'}</span> Hints`;
  $('#lesson-solution').hidden=!enabled||busy();
  $('#timer-card').classList.toggle('lesson-assisted',enabled&&!busy());
  if(lesson){
    const exercise=lessonExercise();
    $('#lesson-solution strong').textContent=exercise?.solution||'';
    $('#lesson-solution span').textContent=exercise?.slot?`Insert the marked pair · ${exercise.slot}`:'Insert the marked pair';
  }
}
$('#lesson-help').onclick=()=>{
  if(busy()||timerContext.kind!=='lesson'||!timerContext.exercise)return;
  timerContext.assistance=!timerContext.assistance;
  if(!timerContext.assistance)lessonDemo?.reset();
  renderLessonAssistance();showScramble({animate:false});$('#lesson-help').blur();
};
function render(){renderHeader();renderSteps();renderRecent();if(page==='history')renderHistory();if(page==='insights')renderInsights();updateTimerHeight();}
function renderRecent(){
  const solves=all(),recent=solves.slice(-12).reverse();
  $('#recent-solves').innerHTML=recent.length?recent.map((s,i)=>`<li><button class="recent-solve" data-id="${esc(s.id)}" title="${esc(new Date(s.date).toLocaleString())}" aria-label="Open solve ${solves.length-i}, ${esc(formatTime(result(s)))}"><span class="recent-solve-index">${solves.length-i}</span><span class="recent-solve-time">${formatTime(result(s))}${s.penalty==='+2'?'<small>+2</small>':''}</span><span class="recent-solve-date">${esc(new Date(s.date).toLocaleDateString(undefined,{month:'short',day:'numeric'}))} · ${esc(new Date(s.date).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</span></button></li>`).join(''):'<li class="empty">No solves yet.</li>';
}
function renderSteps(){
  const lesson=timerContext.kind==='lesson';
  const currentSolve=state==='stopped'&&lastSolveId?(lesson?lessonAttempts:records).get(lastSolveId):null;
  const feedback=currentSolve?solveFeedback(lesson?practiceTimes():all(),currentSolve):null;
  feedbackView.render(feedback);
  if(currentSolve&&!currentSolve.deleted)$('#clock').textContent=formatTime(result(currentSolve));
  const labels=state==='running'||state==='stopped'&&splitMarks.length?activeNames:names();
  const current=state==='running'&&tracking()?splitMarks.length:-1;
  const html=labels.map((name,i)=>{
    const detail=i<splitMarks.length&&feedback?.splits[i]?.name===name?feedback.splits[i]:null;
    const delta=detail?.delta??null,tone=detail?.tone?' solve-'+detail.tone:'';
    const comparison=delta===null?'':`${formatDifference(delta)} versus the median of ${detail.count} previous matching split solves`;
    return `<div role="listitem" style="--focus-part:focus-split-${i};--focus-number:focus-number-${i};--focus-label:focus-label-${i};--focus-value:focus-value-${i}" class="split-row ${i<splitMarks.length?'done':''} ${i===current?'current':''}" ${i===current?'aria-current="step"':''} ${detail?`aria-label="${esc(name)}, ${formatTime(detail.ms)}${comparison?', '+esc(comparison):''}${detail.isPB?', personal best':''}"`:''}><span class="split-number${detail?.isPB?' solve-gold':''}" aria-hidden="true">${detail?.isPB?'★':i<splitMarks.length?'✓':i+1}</span><span class="split-name">${esc(name)}</span><span class="split-value${tone}${delta!==null?' has-difference':''}">${splitMarks[i]?formatTime(splitMarks[i].ms-(splitMarks[i-1]?.ms||0)):i===current?formatTime(Math.max(0,elapsed-(splitMarks[i-1]?.ms||0))):'—'}${delta!==null?`<span class="split-difference${detail?.isPB?' solve-gold':delta<0?' solve-good':''}" title="${esc(comparison)}">${formatDifference(delta)}</span>`:''}</span></div>`;
  }).join('');
  if(html!==stepsHTML){$('#fullscreen-splits').innerHTML=html;stepsHTML=html;}
  $('#fullscreen-splits').hidden=!tracking();
  $('#timer-card').classList.toggle('with-splits',tracking());
  $('#fullscreen-splits .current')?.scrollIntoView({block:'nearest'});
  $('#fullscreen-track').setAttribute('aria-pressed',String(tracking()));
  $('#fullscreen-track').hidden=lesson;
  $('#fullscreen-track').innerHTML=`<span aria-hidden="true">${tracking()?'✓':'✕'}</span> Splits`;
  $('#fullscreen-track').disabled=['running','arming','armed'].includes(state);
  const bottom=cubeOrientation()==='white-bottom';
  $('#cube-orientation').textContent=bottom?'White ↓':'White ↑';
  $('#cube-orientation').title=`Scramble with ${cubeFrame(cubeOrientation()).label}. Switch to white on ${bottom?'top':'bottom'}.`;
  $('#cube-orientation').setAttribute('aria-label',`White on ${bottom?'bottom':'top'}. Switch to white on ${bottom?'top':'bottom'}.`);
  $('#cube-orientation').disabled=['running','arming','armed'].includes(state)||!scramble;
}
function renderHistory(){
  const previousRows=$('#history-body').innerHTML;
  const a=filtered($('#history-scope').value).reverse().filter(s=>[s.date,new Date(s.date).toLocaleString(),s.scramble,s.note].join(' ').toLowerCase().includes($('#search').value.toLowerCase())),n=25;
  historyPage=Math.max(0,Math.min(historyPage,Math.ceil(a.length/n)-1));
  const rows=a.slice(historyPage*n,(historyPage+1)*n);
  $('#history-body').innerHTML=rows.length?rows.map((s,i)=>`<tr><td class="history-index">${a.length-historyPage*n-i}</td><td class="history-date">${esc(new Date(s.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}))}<small>${esc(new Date(s.date).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</small></td><td class="history-time">${formatTime(result(s))}${s.penalty==='+2'?'<small>includes +2</small>':''}</td><td class="history-splits">${s.splits.length||'—'}</td><td class="history-action"><button class="small-button" data-id="${esc(s.id)}" aria-label="Open solve ${esc(formatTime(result(s)))}"><span class="history-details-label">Details </span><span aria-hidden="true">↗</span></button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">No matching solves.</td></tr>';
  $('#history-summary').textContent=a.length?`${historyPage*n+1}–${Math.min(a.length,(historyPage+1)*n)} of ${a.length} solves`:'0 solves';
  $('#prev').disabled=historyPage===0;$('#next').disabled=(historyPage+1)*n>=a.length;
  $('.history-scroll').scrollTop=0;
  if(previousRows!==$('#history-body').innerHTML)motion.play($('#history-body'),[{opacity:.55},{opacity:1}],{duration:140});
}
function chart(a,width,history=a){
  if(a.length<2)return '<div class="empty">Not enough solves.</div>';
  const w=Math.max(260,width||950),h=280,left=44,right=16,top=12,bottom=44,values=a.map(result).filter(Number.isFinite),extremes=timeExtremes(values);
  if(!values.length)return '<div class="empty">No completed solves.</div>';
  const indices=new Map(history.map((s,i)=>[s.id,i]));
  const averages=a.map(s=>{const i=indices.get(s.id);return i===undefined?null:average(history.slice(Math.max(0,i-11),i+1),12);});
  const scaleValues=[...values,...averages.filter(Number.isFinite)];
  let low=Math.max(0,Math.floor(Math.min(...scaleValues)/10000)*10000-10000),high=Math.ceil(Math.max(...scaleValues)/10000)*10000+5000;
  if(low===high)high+=10000;
  const x=i=>left+i/(a.length-1)*(w-left-right),y=v=>h-bottom-(v-low)/(high-low)*(h-top-bottom);
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${a.length} solve times in seconds by solve number, oldest to newest">`;
  for(let i=0;i<=3;i++){const v=low+(high-low)*i/3,yy=y(v);svg+=`<line x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}" stroke="#eef1f6"/><text x="${left-9}" y="${yy+4}" text-anchor="end">${(v/1000).toFixed(0)}s</text>`;}
  let path='',avgPath='',dots='',avgOpen=false,open=false;
  for(let i=0;i<a.length;i++){
    const v=result(a[i]);
    if(Number.isFinite(v)){const fastest=v===extremes.fastest,slowest=v===extremes.slowest,label=fastest&&slowest?'Fastest and slowest':fastest?'Fastest':slowest?'Slowest':'';path+=`${open?'L':'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)} `;open=true;dots+=`<circle class="solve-point${fastest?' fastest':''}${slowest?' slowest':''}" data-id="${esc(a[i].id)}" cx="${x(i)}" cy="${y(v)}" r="${label?4.5:2.8}" fill="#b9c5e9"><title>${label?label+' · ':''}Solve #${i+1} · ${esc(new Date(a[i].date).toLocaleString())} · ${formatTime(v)}</title></circle>`;}else open=false;
    const av=averages[i];
    if(Number.isFinite(av)&&av!==null){avgPath+=`${avgOpen?'L':'M'}${x(i)} ${y(av)} `;avgOpen=true;}else avgOpen=false;
  }
  svg+=`<path d="${path}" fill="none" stroke="#bdc9ed" stroke-width="1" opacity=".65" pointer-events="none"/><path class="solve-average-line" d="${avgPath}" fill="none" stroke="#7489d4" stroke-width="2.5" stroke-linecap="round" pointer-events="none"/>${dots}`;
  svg+=`<text x="${left}" y="${h-24}">#1</text><text x="${w-right}" y="${h-24}" text-anchor="end">#${a.length}</text><text x="${(left+w-right)/2}" y="${h-5}" text-anchor="middle">Solve</text></svg>`;
  return svg;
}
let mainChartWidth=0;
function renderMainChart(a){mainChartWidth=Math.floor($('#main-chart').clientWidth);$('#main-chart').innerHTML=chart(a,mainChartWidth,insightPeriods(all()).view);motion.play($('#main-chart'),[{opacity:.5},{opacity:1}],{duration:200});}
new ResizeObserver(()=>requestAnimationFrame(()=>{if(page==='insights'&&Math.floor($('#main-chart').clientWidth)!==mainChartWidth)renderMainChart(insightPeriods(all(),$('#insight-period').value).view);})).observe($('#main-chart'));
function renderInsights(){
  const periods=insightPeriods(all(),$('#insight-period').value),a=periods.view,s=summary(a),current=summary(periods.current),previous=summary(periods.previous);
  const subMinute=stats=>stats.completed?100*stats.sub60/stats.completed:null;
  const cards=[
    ['BEST',formatTime(s.best),'Fastest result in this view','best'],
    ['AO5',formatTime(s.ao5),'Latest 5 · best and worst removed','ao5'],
    ['AO12',formatTime(s.ao12),'Latest 12 · best and worst removed','ao12'],
    ['SUB-MINUTE',s.completed?`${Math.round(subMinute(s))}%`:'—',`${s.sub60} of ${s.completed} completed solves`,'subMinute'],
    ['MEAN',formatTime(s.mean),'Completed solves, including +2','mean'],
    ['MEDIAN',formatTime(s.median),'Middle completed result','median'],
    ['AO100',formatTime(s.ao100),'Latest 100 · trim 5 on each side','ao100'],
    ['SOLVES',String(s.count),'All attempts in this view','count'],
  ];
  $('#insight-comparison').textContent=`Change: ${periods.label.toLowerCase()}.`;
  let comparisonCount=0;
  $('#insight-stats').innerHTML=cards.map(([label,value,help,key])=>{
    const higherBetter=key==='subMinute'||key==='count';
    const change=metricChange(key==='subMinute'?subMinute(current):current[key],key==='subMinute'?subMinute(previous):previous[key],{higherBetter});
    const direction=change?.tone==='neutral'?'unchanged':key==='count'?(change?.percent>0?'more solves':'fewer solves'):change?.tone==='good'?'improved':'slower';
    const description=key==='subMinute'&&change?.tone==='bad'?'lower sub-minute rate':direction;
    const percent=change?`${change.percent>0?'+':''}${change.percent.toFixed(1)}%`:null;
    if(change)comparisonCount++;
    const badge=change?`<small class="stat-change ${change.tone}" title="${esc(periods.label)}" aria-label="${esc(percent+' '+description+'. '+periods.label)}">${percent} <span>${description}</span></small>`:'';
    return `<div class="stat" title="${esc(help)}"><span>${label}</span><strong>${value}</strong>${badge}</div>`;
  }).join('');
  $('#insight-comparison').hidden=comparisonCount===0;
  renderMainChart(a);
  const bins=solveDistribution(a),max=Math.max(...bins.map(bin=>bin.count),1);
  $('#distribution').innerHTML=bins.length?bins.map(bin=>`<div class="bar-row"><span>${bin.label}</span><div class="bar-track"><div class="bar-fill" style="width:${bin.count/max*100}%"></div></div><strong>${bin.count}</strong></div>`).join(''):'<div class="empty">No completed solves.</div>';
  const preset=$('#split-preset').value,labels=preset==='custom'?settings.custom:PRESETS[preset],progress=splitProgress(a,labels,insightPeriods(all()).view);
progress.comparisons=splitComparisons(periods.current,periods.previous,labels);
progress.comparisonLabel=periods.label;
renderSplitProgress(progress);
if(!progress.count){$('#split-chart').innerHTML='<div class="empty">No split data.</div>';return;}
const mx=Math.max(...progress.means,1);
$('#split-chart').innerHTML=`<p class="muted">${progress.count} solves</p>`+labels.map((name,i)=>`<div class="bar-row"><span>${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${progress.means[i]/mx*100}%"></div></div><strong>${formatTime(progress.means[i])}</strong></div>`).join('');}

function timerVisual(){
  const c=$('#timer-card');c.classList.remove('arming','armed','running');
  if(busy())c.classList.add(state);
  const hint=state==='running'&&tracking()?activeNames[splitMarks.length]:'';
  $('#timer-hint').textContent=hint;$('#timer-hint').hidden=!hint;
  $('#timer-instruction').innerHTML=state==='armed'?'<span>Release</span>':state==='arming'?'<span>Hold…</span>':state==='running'?`<kbd>space</kbd><span>${tracking()?'Split':'Stop'}</span>`:'<kbd>space</kbd><span>Hold · release</span>';
  $('#touch-instruction').textContent=state==='armed'?'Release':state==='arming'?'Hold…':state==='running'?(tracking()?'Tap to split':'Tap to stop'):'Two fingers · hold · release';
  const preparing=timerContext.kind==='lesson'&&!timerContext.exercise;
  $('#new-scramble').disabled=busy()||preparing;$('#manual-entry').disabled=busy()||preparing;
  $$('[data-page],#lesson-back,.brand').forEach(el=>{if(el.tagName==='BUTTON')el.disabled=busy();else el.setAttribute('aria-disabled',String(busy()));});
  document.body.classList.toggle('lesson-busy',timerContext.kind==='lesson'&&busy());
  renderLessonTabs();renderLessonAssistance();renderSteps();
}
function arm(){if(!timerVisible()||busy()||!scramble||Date.now()-lastFinished<700)return;motion.clear();clearTimeout(armTimeout);elapsed=0;splitMarks=[];lastSolveId=null;lessonDemo?.reset();state='arming';$('#clock').textContent='0.00';timerVisual();armTimeout=setTimeout(()=>{if(state==='arming'){state='armed';timerVisual();navigator.vibrate?.(20);}},settings.hold);}
function disarm(){clearTimeout(armTimeout);if(state==='arming'||state==='armed'){state='idle';timerVisual();}}
async function keepAwake(){try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}}
function snapshotAttempt(){
  const lesson=timerContext.kind==='lesson'?LESSONS.find(item=>item.id===timerContext.lessonId):null;
  return Object.freeze({scramble,context:timerContext.kind,exercise:lesson?timerContext.exercise:null,
    note:lesson?`${lesson.id} · ${lesson.title} · ${lesson.case.title} · Full cube`:'',
    track:tracking(),splitNames:Object.freeze([...names()])});
}
function start(){
  if(state!=='armed')return;
  clearTimeout(armTimeout);state='running';started=performance.now();elapsed=0;splitMarks=[];
  activeAttempt=snapshotAttempt();activeNames=activeAttempt.splitNames;
  lessonDemo?.reset();automaticFocus=!document.body.classList.contains('focus-mode');
  focusView(true);timerVisual();keepAwake();frame=requestAnimationFrame(tick);
}
function tick(){if(state!=='running')return;elapsed=performance.now()-started;$('#clock').textContent=formatTime(elapsed);const activeSplit=$('#fullscreen-splits .current .split-value');if(activeSplit)activeSplit.textContent=formatTime(Math.max(0,elapsed-(splitMarks.at(-1)?.ms||0)));frame=requestAnimationFrame(tick);}
function makeSolve(ms,splits=[],manual=false){
  const attempt=manual?snapshotAttempt():activeAttempt;
  return normalizeSolve({id:crypto.randomUUID(),date:new Date().toISOString(),ms:Math.max(1,Math.round(ms)),penalty:'none',scramble:attempt.scramble,splits,source:manual?'manual':'timer',note:attempt.note,updatedAt:Date.now()});
}
function stop(){if(state!=='running')return;elapsed=Math.max(1,Math.round(performance.now()-started));cancelAnimationFrame(frame);if(activeAttempt.track)splitMarks.push({name:activeNames[splitMarks.length],ms:elapsed});state='stopped';lastFinished=Date.now();$('#clock').textContent=formatTime(elapsed);const solve=makeSolve(elapsed,[...splitMarks]);lastSolveId=solve.id;saveAttempt(solve,activeAttempt);wakeLock?.release();automaticFocus=false;timerVisual();animateResult();newScramble();}
function mark(){if(state!=='running')return;if(!activeAttempt.track||splitMarks.length>=activeNames.length-1){stop();return;}splitMarks.push({name:activeNames[splitMarks.length],ms:Math.round(performance.now()-started)});navigator.vibrate?.(10);timerVisual();motion.reveal($('#fullscreen-splits .current'),{distance:3,duration:150});}
function animateResult(){
  motion.reveal($('.timer-readout'),{distance:4});
  $$('#fullscreen-splits .split-row').forEach((row,i)=>motion.reveal(row,{delay:i*18,distance:4}));
  motion.reveal($('.timer-recent .recent-solve'),{distance:4});
  requestAnimationFrame(()=>{
    if(state!=='stopped')return;
    feedbackView.fit();
    motion.reveal($('#solve-feedback'),{delay:50,distance:4});
    motion.reveal($('#solve-ranking'),{delay:80,distance:4,duration:260});
    $$('#ranking-squares span').forEach((square,i)=>motion.play(square,[{opacity:.2,scale:'1 .5'},{opacity:1,scale:'1 1'}],{delay:80+i*3,duration:200}));
  });
}
function cancel(){if(automaticFocus){focusView(false);automaticFocus=false;}if(state==='running'){cancelAnimationFrame(frame);wakeLock?.release();state='idle';splitMarks=[];elapsed=0;$('#clock').textContent='0.00';toast('Cancelled.');lastFinished=Date.now();timerVisual();}else disarm();}
const pad=$('#timer-pad');
pad.addEventListener('pointerdown',e=>{if(e.target.closest('#fullscreen-splits')&&state!=='running')return;if(e.pointerType==='touch'){e.preventDefault();touches.add(e.pointerId);pad.setPointerCapture(e.pointerId);if(state==='running'){if(!gesture){gesture=true;mark();}return;}if(touches.size===2){gesture=true;arm();}}else if(e.button===0){if(state==='running'){mark();return;}keyboardHeld=true;pad.setPointerCapture(e.pointerId);arm();}});
pad.addEventListener('pointerup',e=>{if(e.pointerType==='touch'){e.preventDefault();touches.delete(e.pointerId);if(touches.size<2&&state==='arming')disarm();if(touches.size===0){if(gesture&&state==='armed')start();gesture=false;}}else if(keyboardHeld){keyboardHeld=false;if(state==='armed')start();else disarm();}});
pad.addEventListener('pointercancel',()=>{touches.clear();gesture=false;keyboardHeld=false;disarm();});
window.addEventListener('keydown',e=>{if(e.repeat||$$('dialog').some(d=>d.open)||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.code==='Escape'){cancel();focusView(false);return;}if(!timerVisible())return;if(e.code==='Space'){if(e.target.tagName==='BUTTON')return;e.preventDefault();if(state==='running'){mark();return;}keyboardHeld=true;arm();}if(e.code==='Enter'&&state==='running'){e.preventDefault();mark();}});
window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboardHeld){e.preventDefault();keyboardHeld=false;if(state==='armed')start();else disarm();}});
window.addEventListener('blur',()=>{keyboardHeld=false;touches.clear();gesture=false;disarm();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(state==='running')keepAwake();if(Date.now()-lastSync>20000)sync();}else disarm();});
function setTracking(enabled){if(busy()||timerContext.kind==='lesson')return;motion.layout([$('.timer-center')],()=>{settings.track=enabled;persist();splitMarks=[];timerVisual();});if(enabled)motion.reveal($('#fullscreen-splits'),{distance:5});}
$('#fullscreen-track').onclick=()=>{setTracking(!tracking());$('#fullscreen-track').blur();};
function refreshOrientation(){
  if(timerContext.kind==='lesson'){
    const exercise=lessonExercise();
    if(exercise){scramble=exercise.scramble;scrambleKind=`Ready right · White on ${settings.lessonOrientation==='white-top'?'top':'bottom'}`;scrambleLayoutKey='';}
    lessonDemo?.setOrientation(settings.lessonOrientation);
    renderLessonAssistance();
  }else if(normalScramble){
    scramble=orientAlgorithm(normalScramble.scramble,'white-top',settings.orientation);
  }
  if(scramble)showScramble({animate:false});
  renderSteps();
}
$('#cube-orientation').onclick=()=>{
  if(busy()||!scramble)return;
  const key=timerContext.kind==='lesson'?'lessonOrientation':'orientation';
  settings[key]=cubeOrientation()==='white-top'?'white-bottom':'white-top';
  persist();refreshOrientation();$('#cube-orientation').blur();
};
let automaticFocus=false,focusRequested=document.body.classList.contains('focus-mode');
function focusView(enabled,{immediate=false}={}){
  if(enabled===focusRequested&&enabled===document.body.classList.contains('focus-mode'))return;
  focusRequested=enabled;
  const title=$('#fullscreen-lesson-title'),before=timerContext.kind==='lesson'?title.getBoundingClientRect():null;
  // Fill the app viewport without invoking the browser's fullscreen notice.
  const animated=motion.swap('focus',()=>{
    // Capture the current painted positions before settling entrance animations.
    motion.settle();
    document.body.classList.toggle('focus-mode',enabled);
    title.setAttribute('aria-hidden',String(!enabled));
    if(enabled)lessonDemo?.reset();
    $('#focus').setAttribute('aria-pressed',String(enabled));
    $('#focus').title=enabled?'Exit fullscreen':'Fullscreen';
    updateTimerHeight();layoutScramble();
    requestAnimationFrame(()=>feedbackView.fit());
  },{immediate:immediate||['running','arming','armed'].includes(state)});
  if(!animated&&before){
    const after=title.getBoundingClientRect();
    motion.play(title,[{translate:`${before.left-after.left}px ${before.top-after.top}px`},{translate:'0 0'}],{duration:320});
  }
}
$('#focus').onclick=()=>{automaticFocus=false;focusView(!focusRequested);$('#focus').blur();};
function updateTimerHeight(){
  if(document.body.classList.contains('focus-mode'))return;
  const bottomNavigation=matchMedia('(max-width:740px)').matches&&!matchMedia('(orientation:landscape) and (max-height:500px) and (max-width:1100px)').matches;
  const navigation=bottomNavigation?$('.sidebar').getBoundingClientRect().height:0;
  if(page==='lessons'&&timerContext.kind==='lesson'){
    const detail=$('#lesson-detail');
    document.body.style.setProperty('--lesson-navigation-height',navigation+'px');
    detail.style.setProperty('--lesson-available-height',Math.max(0,innerHeight-detail.getBoundingClientRect().top-scrollY-navigation-12)+'px');
    return;
  }
  if(page==='history'){
    const history=$('#history-page');
    history.style.setProperty('--history-available-height',Math.max(0,innerHeight-history.getBoundingClientRect().top-scrollY-navigation-12)+'px');
    return;
  }
  if(!timerVisible())return;
  const card=$('#timer-card');
  const available=Math.max(0,innerHeight-card.getBoundingClientRect().top-scrollY-navigation-12)+'px';
  card.style.setProperty('--timer-available-height',available);
  $('#timer-page').style.setProperty('--timer-available-height',available);
}
const chromeObserver=new ResizeObserver(()=>requestAnimationFrame(updateTimerHeight));
[$('.app-bar'),$('.sidebar')].forEach(el=>chromeObserver.observe(el));
addEventListener('resize',updateTimerHeight);
let officialScrambler,lessonScrambler;
$('#lesson-demo').onclick=e=>{if(e.target.closest('[data-lesson-retry]'))newScramble();};
function requestLessonScramble(request,previousScramble){
  const failed=()=>{
    if(request!==scrambleRequest||timerContext.kind!=='lesson')return;
    scramble='';scrambleKind='Scramble unavailable';
    $('#fullscreen-scramble').textContent='Could not prepare a scramble.';
    $('#scramble-type').textContent=scrambleKind;$('#new-scramble').disabled=false;
    if(!lessonDemo)$('#lesson-demo').innerHTML='<p role="status">Could not prepare a scramble.</p><button type="button" class="small-button" data-lesson-retry>Try again</button>';
  };
  try{
    lessonScrambler ||= new Worker('/lesson-scramble-worker.js',{type:'module'});
    lessonScrambler.onmessage=({data})=>{
      if(data.request!==scrambleRequest||timerContext.kind!=='lesson')return;
      if(data.error){failed();return;}
      const exercise=data.exercise;
      timerContext.exercise=Object.freeze({...exercise,target:Object.freeze([...exercise.target])});
      const oriented=lessonExercise();
      scramble=oriented.scramble;scrambleKind=`Ready right · White on ${settings.lessonOrientation==='white-top'?'top':'bottom'}`;scrambleLayoutKey='';
      if(!lessonDemo){
        const lesson=LESSONS.find(item=>item.id===timerContext.lessonId);
        lessonDemo=createLessonDemo($('#lesson-demo'),{...lesson,case:orientLessonCase({...lesson.case,...data.demoExercise},settings.lessonOrientation)});
      }
      showScramble();renderLessonAssistance();renderSteps();$('#new-scramble').disabled=false;$('#manual-entry').disabled=busy();
    };
    lessonScrambler.onerror=()=>{lessonScrambler?.terminate();lessonScrambler=null;failed();};
    lessonScrambler.postMessage({request,lessonId:timerContext.lessonId,previousScramble,withDemo:!lessonDemo});
  }catch{failed();}
}
async function newScramble(){
  if(busy())return;
  $('#cube-orientation').disabled=true;
  const req=++scrambleRequest;
  if(timerContext.kind==='lesson'){
    const previousScramble=timerContext.exercise?.scramble;
    timerContext.exercise=null;scramble='';scrambleLayoutKey='';
    $('#fullscreen-scramble').textContent='Preparing scramble…';$('#cube-preview').replaceChildren();
    $('#scramble-type').textContent='Preparing…';$('#new-scramble').disabled=true;$('#manual-entry').disabled=true;
    renderLessonAssistance();requestLessonScramble(req,previousScramble);return;
  }
  normalScramble=null;
  $('#new-scramble').disabled=true;scramble='';scrambleLayoutKey='';
  $('#fullscreen-scramble').textContent='…';$('#cube-preview').replaceChildren();$('#scramble-type').textContent='Preparing…';
  let timeout;
  try{
    if(!navigator.onLine)throw Error('Offline practice');
    officialScrambler ||= import('https://cdn.cubing.net/v0/js/cubing/scramble');
    const generated=officialScrambler.then(lib=>lib.randomScrambleForEvent('333'));
    const alg=await Promise.race([generated,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Scrambler timed out')),6000);})]);
    if(req!==scrambleRequest)return;
    scramble=alg.toString();scrambleKind='Random state';
  }catch{
    if(req!==scrambleRequest)return;
    scramble=practiceScramble();scrambleKind='25-move practice';officialScrambler=null;
  }finally{
    clearTimeout(timeout);
    if(req===scrambleRequest){normalScramble={scramble,kind:scrambleKind};scramble=orientAlgorithm(normalScramble.scramble,'white-top',settings.orientation);showScramble();if(!busy())$('#new-scramble').disabled=false;}
  }
}
const scrambleMeasure=document.createElement('canvas').getContext('2d');let scrambleLayoutKey='';
function layoutScramble(){
  if(!scramble)return;
  const targets=[$('#fullscreen-scramble')].filter(target=>target.clientWidth);
  const layouts=targets.map(target=>{
    const style=getComputedStyle(target);let capacity=Infinity;
    if(target.id==='fullscreen-scramble'||matchMedia('(max-width:740px)').matches){
      if(scrambleMeasure)scrambleMeasure.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const charWidth=scrambleMeasure?.measureText('M').width||parseFloat(style.fontSize)*.62;
      capacity=Math.max(3,Math.floor((target.clientWidth-2)/(charWidth+(parseFloat(style.letterSpacing)||0))));
    }
    return {target,capacity};
  });
  const key=`${scramble}|${layouts.map(({target,capacity})=>target.id+':'+capacity).join('|')}`;
  if(key===scrambleLayoutKey)return;scrambleLayoutKey=key;
  for(const {target,capacity} of layouts){
    const lines=scrambleLines(scramble,capacity);target.replaceChildren();
    let moveIndex=0;
    lines.forEach((line,i)=>{
      if(i)target.append(' ');
      const span=document.createElement('span');span.className='scramble-line';
      line.split(' ').forEach((token,j)=>{
        if(j)span.append(' ');
        const move=document.createElement('span');move.className='scramble-move';
        move.style.setProperty('--focus-move','focus-move-'+moveIndex++);move.textContent=token;span.append(move);
      });
      target.append(span);
    });
  }
}
const scrambleObserver=new ResizeObserver(()=>requestAnimationFrame(layoutScramble));
scrambleObserver.observe($('#fullscreen-scramble'));
document.fonts?.ready.then(layoutScramble);
function showScramble({animate=true}={}){
  layoutScramble();
  const instruction=`Scramble with ${cubeFrame(cubeOrientation()).label}. Moves follow the cube's U, F and R faces.`;
  $('#fullscreen-scramble').title=instruction;
  $('#fullscreen-scramble').setAttribute('aria-label',instruction);
  $('#cube-orientation').disabled=busy()||!scramble;
  $('#scramble-type').textContent=scrambleKind;
  $('#scramble-type').classList.toggle('sr-only',scrambleKind==='Random state');
  try{const exercise=timerContext.kind==='lesson'?lessonExercise():null;$('#cube-preview').innerHTML=cubeSVG(exercise?exercise.setup:scramble,{orientation:cubeOrientation(),target:exercise&&timerContext.assistance?exercise.target:[]});}catch{$('#cube-preview').replaceChildren();}
  if(animate&&state!=='running'){motion.reveal($('#fullscreen-scramble'),{distance:4});motion.reveal($('#cube-preview'),{delay:35,distance:5,duration:260});}
}
$('#new-scramble').onclick=()=>newScramble();
function openDialog(id){if(state==='running'||state==='arming'||state==='armed')return;$(id).showModal();}
$('#open-settings').onclick=()=>{if(state==='running')return;$('#preset').value=settings.preset;$('#custom-steps').value=settings.custom.join(', ');$('#custom-field').hidden=settings.preset!=='custom';$('#hold-duration').value=settings.hold;$('#lesson-orientation').value=settings.lessonOrientation;openDialog('#settings-dialog');};
$('#preset').onchange=()=>$('#custom-field').hidden=$('#preset').value!=='custom';
$('#save-settings').onclick=()=>{if(busy())return;const custom=$('#custom-steps').value.split(',').map(s=>s.trim()).filter(Boolean);if($('#preset').value==='custom'&&(custom.length<2||custom.length>12||custom.some(x=>x.length>50))){toast('Use 2–12 steps, with names under 50 characters.');return;}settings={...settings,preset:$('#preset').value,custom,hold:Number($('#hold-duration').value),lessonOrientation:$('#lesson-orientation').value==='white-top'?'white-top':'white-bottom'};splitMarks=[];persist();$('#settings-dialog').close();refreshOrientation();};
function openImport(){$('#settings-dialog').close();imported=[];$('#import-preview').textContent='';$('#confirm-import').disabled=true;$('#csv-file').value='';openDialog('#import-dialog');}
$('#open-import').onclick=openImport;
$('#history-import').onclick=openImport;
async function previewImport(){try{const file=$('#csv-file').files[0];if(!file)return;if(file.size>5000000)throw Error('Please import a file smaller than 5 MB.');imported=parseCSV(decodeCSV(await file.arrayBuffer()));const duplicates=imported.filter(s=>records.has(s.id)).length;$('#import-preview').textContent=`${imported.length} solves found. ${duplicates} already in your history.`;$('#import-preview').className='info-box';$('#confirm-import').disabled=imported.length===duplicates;}catch(e){imported=[];$('#import-preview').textContent=e.message;$('#confirm-import').disabled=true;}}
$('#csv-file').onchange=previewImport;
$('#confirm-import').onclick=()=>{let count=0;for(const s of imported)if(!records.has(s.id)){records.set(s.id,s);pending.set(s.id,s);count++;}persist();$('#import-dialog').close();render();toast(`${count} solves imported. Duplicates skipped.`);sync();};
function openSolve(id){if(state==='running')return;const s=records.get(id);if(!s||s.deleted)return;selected={...s,splits:s.splits.map(x=>({...x}))};$('#solve-title').textContent='Solve';$('#solve-note').value=s.note||'';renderSolveDetails();openDialog('#solve-dialog');}
function renderSolveDetails(){const s=selected;$('#solve-details').innerHTML=`<div class="detail-time">${formatTime(result(s))}</div><div class="detail-date">${esc(new Date(s.date).toLocaleString())} ${s.penalty==='+2'?'· raw time '+formatTime(s.ms):''}</div><div class="detail-scramble">${esc(s.scramble||'No scramble recorded')}</div>`+s.splits.map((x,i)=>`<div class="detail-split"><span>${esc(x.name)}</span><span>${formatTime(x.ms-(s.splits[i-1]?.ms||0))}</span></div>`).join('');$$('[data-penalty]').forEach(b=>b.classList.toggle('active',b.dataset.penalty===s.penalty));}
$$('[data-penalty]').forEach(b=>b.onclick=()=>{selected.penalty=b.dataset.penalty;renderSolveDetails();});
$('#save-solve').onclick=()=>{if(!selected)return;updateSolve({...selected,note:$('#solve-note').value});$('#solve-dialog').close();toast('Solve updated.');};
$('#delete-solve').onclick=()=>{if(!selected)return;const old={...selected};updateSolve({...selected,deleted:true});$('#solve-dialog').close();toast('Solve deleted.',()=>updateSolve({...old,deleted:false}));};
document.addEventListener('click',e=>{const el=e.target.closest('[data-id]');if(el)openSolve(el.dataset.id);});
$('#manual-entry').onclick=()=>{if(timerContext.kind==='lesson')return;$('#manual-time').value='';$('#manual-error').textContent='';openDialog('#manual-dialog');};
$('#save-manual').onclick=()=>{if(timerContext.kind==='lesson')return;try{const ms=parseTime($('#manual-time').value);saveAttempt(makeSolve(ms,[],true),snapshotAttempt());$('#manual-dialog').close();toast('Solve added.');}catch(e){$('#manual-error').textContent=e.message;}};
$('#manual-time').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#save-manual').click();}};
$('#history-scope').onchange=()=>{historyPage=0;renderHistory();};$('#search').oninput=()=>{historyPage=0;renderHistory();};$('#prev').onclick=()=>{historyPage--;renderHistory();};$('#next').onclick=()=>{historyPage++;renderHistory();};
$('#insight-period').onchange=renderInsights;$('#split-preset').onchange=renderInsights;
$('#export').onclick=()=>{const blob=new Blob(['\uFEFF'+exportCSV(all())],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`cube-studio-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('CSV exported.');};
$('#sync-mobile').onclick=()=>{sync();};window.addEventListener('online',sync);window.addEventListener('offline',()=>{syncState='offline';renderSyncStatus();});setInterval(()=>{if(!document.hidden&&state!=='running')sync();},60000);
const busy=()=>['running','arming','armed'].includes(state);
initMobileNavigation({pages:$$('.sidebar nav [data-page]').map(button=>button.dataset.page),getPage:()=>page,navigate:setPage,blocked:()=>busy()||document.body.classList.contains('focus-mode')||$$('dialog').some(dialog=>dialog.open)});
const renderSplitProgress=initSplitCharts({openSolve});
const feedbackView=initSolveFeedback();
render();timerVisual();newScramble();initConnection({busy,sync,notify:toast});sync();initPWA({busy,notify:toast});if(storageReadFailed)toast('Could not read saved data. Please connect to sync or import a backup.');
