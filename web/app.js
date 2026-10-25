import {PRESETS,formatTime,result,summary,average,parseCSV,parseTime,exportCSV,practiceScramble,decodeCSV,splitProgress,solveFeedback,normalizeSolve} from './core.js';
import {initPWA} from './pwa.js';
import {cubeSVG,scrambleLines} from './cube.js';
import {initSplitCharts} from './split-charts.js';
import {initSolveFeedback,formatDifference} from './solve-feedback.js';
import {initConnection,syncHeaders} from './connect.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='cube-studio-v1';
let saved={},storageReadFailed=false;try{saved=JSON.parse(localStorage.getItem(STORE)||'{}');}catch{storageReadFailed=true;}
let records=new Map((saved.solves||[]).map(s=>[s.id,normalizeSolve(s)])), pending=new Map((saved.pending||[]).map(s=>[s.id,normalizeSolve(s)]));
let settings={preset:'beginner',custom:['Cross','First pair','Remaining F2L','Last layer'],hold:550,track:false,...saved.settings};
let page='timer', historyPage=0, selected=null, imported=[], toastTimeout, syncBusy=false, lastSync=0;
let state='idle',started=0,elapsed=0,splitMarks=[],activeNames=[],scramble='',scrambleKind='',activeScramble='',lastFinished=0,armTimeout,keyboardHeld=false,frame,wakeLock;
let lastSolveId=null;
let touches=new Set(),gesture=false,scrambleRequest=0;
const all=()=>[...records.values()].filter(s=>!s.deleted).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));
const names=()=>settings.preset==='custom'?settings.custom:PRESETS[settings.preset];
function persist(){try{localStorage.setItem(STORE,JSON.stringify({solves:[...records.values()],pending:[...pending.values()],settings}));return true;}catch{toast('Device storage is full or blocked. Keep this page open and export your solves.');return false;}}
function toast(message,undo){clearTimeout(toastTimeout);const t=$('#toast');t.replaceChildren(document.createTextNode(message));if(undo){const b=document.createElement('button');b.textContent='Undo';b.onclick=()=>{undo();t.hidden=true;};t.append(b);}t.hidden=false;toastTimeout=setTimeout(()=>t.hidden=true,undo?12000:5500);}
function status(text){$('#mobile-sync').textContent=text;}
function updateSolve(s){s=normalizeSolve({...s,updatedAt:Math.max(Date.now(),(records.get(s.id)?.updatedAt||0)+1)});records.set(s.id,s);pending.set(s.id,s);persist();render();sync();return s;}
async function sync(){if(syncBusy)return;if(!navigator.onLine){status(pending.size?`${pending.size} saved offline`:'Offline');return;}syncBusy=true;status('Syncing…');try{
  const batch=[...pending.values()];
  for(let i=0;i<batch.length;i+=350){const part=batch.slice(i,i+350),r=await fetch('/api/solves',{method:'POST',headers:{'content-type':'application/json',...syncHeaders()},body:JSON.stringify({solves:part}),redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok){if(r.status===401||r.status===403||r.type==='opaqueredirect')throw Error('sign-in');throw Error('Sync failed');}for(const s of part)if(pending.get(s.id)?.updatedAt===s.updatedAt)pending.delete(s.id);persist();}
  const r=await fetch('/api/solves',{headers:syncHeaders(),redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok){if(r.status===401||r.status===403||r.type==='opaqueredirect')throw Error('sign-in');if(r.status===503){const data=await r.json().catch(()=>({}));if(data.setupRequired)throw Error('setup');}throw Error('Unable to load shared storage');}const data=await r.json();for(const s of data.solves){const local=records.get(s.id);if(!local||s.updatedAt>local.updatedAt)records.set(s.id,normalizeSolve(s));}persist();lastSync=Date.now();$('#connect-sync').hidden=true;status(pending.size?`${pending.size} waiting to sync`:'Synced');render();
}catch(e){const auth=e.message==='sign-in';$('#connect-sync').hidden=!auth;status(auth?(pending.size?`${pending.size} saved · connect to sync`:'Not connected'):e.message==='setup'?'Cloud sync setup needed':pending.size?`${pending.size} saved on device`:'Offline');}finally{syncBusy=false;}}
function filtered(scope,period='all'){let a=all();if(scope==='today')a=a.filter(s=>new Date(s.date).toDateString()===new Date().toDateString());if(period!=='all')a=a.filter(s=>Date.parse(s.date)>=Date.now()-Number(period)*86400000);return a;}
function setPage(p){if(state==='running'||state==='arming'||state==='armed')return;page=p;focusView(false);$('#page-title').textContent={timer:'Timer',history:'History',insights:'Insights'}[p];$$('.page').forEach(el=>el.hidden=el.id!==p+'-page');$$('.sidebar [data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===p);if(b.dataset.page===p)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});render();window.scrollTo({top:0,behavior:'instant'});}
$$('[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
function render(){renderSteps();renderRecent();if(page==='history')renderHistory();if(page==='insights')renderInsights();updatePageHeight();}
function renderRecent(){
  const solves=all(),recent=solves.slice(-12).reverse();
  $('#recent-solves').innerHTML=recent.length?recent.map((s,i)=>`<li><button class="recent-solve" data-id="${esc(s.id)}" title="${esc(new Date(s.date).toLocaleString())}" aria-label="Open solve ${solves.length-i}, ${esc(formatTime(result(s)))}"><span class="recent-solve-index">${solves.length-i}</span><span class="recent-solve-time">${formatTime(result(s))}${s.penalty==='+2'?'<small>+2</small>':''}</span><span class="recent-solve-date">${esc(new Date(s.date).toLocaleDateString(undefined,{month:'short',day:'numeric'}))} · ${esc(new Date(s.date).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</span></button></li>`).join(''):'<li class="empty">No solves yet.</li>';
}
function renderSteps(){
  const currentSolve=state==='stopped'&&lastSolveId?records.get(lastSolveId):null;
  const feedback=currentSolve?solveFeedback(all(),currentSolve):null;
  feedbackView.render(feedback);
  if(currentSolve&&!currentSolve.deleted)$('#clock').textContent=formatTime(result(currentSolve));
  const labels=state==='running'||state==='stopped'&&splitMarks.length?activeNames:names();
  const current=state==='running'&&settings.track?splitMarks.length:-1;
  $('#fullscreen-splits').innerHTML=labels.map((name,i)=>{
    const detail=i<splitMarks.length&&feedback?.splits[i]?.name===name?feedback.splits[i]:null;
    const delta=detail?.delta??null,tone=detail?.tone?' solve-'+detail.tone:'';
    const comparison=delta===null?'':`${formatDifference(delta)} versus the median of ${detail.count} previous matching split solves`;
    return `<div role="listitem" class="split-row ${i<splitMarks.length?'done':''} ${i===current?'current':''}" ${i===current?'aria-current="step"':''} ${detail?`aria-label="${esc(name)}, ${formatTime(detail.ms)}${comparison?', '+esc(comparison):''}${detail.isPB?', personal best':''}"`:''}><span class="split-number${detail?.isPB?' solve-gold':''}" aria-hidden="true">${detail?.isPB?'★':i<splitMarks.length?'✓':i+1}</span><span class="split-name">${esc(name)}</span><span class="split-value${tone}${delta!==null?' has-difference':''}">${splitMarks[i]?formatTime(splitMarks[i].ms-(splitMarks[i-1]?.ms||0)):i===current?formatTime(Math.max(0,elapsed-(splitMarks[i-1]?.ms||0))):'—'}${delta!==null?`<span class="split-difference${detail?.isPB?' solve-gold':delta<0?' solve-good':''}" title="${esc(comparison)}">${formatDifference(delta)}</span>`:''}</span></div>`;
  }).join('');
  $('#fullscreen-splits').hidden=!settings.track;
  $('#timer-card').classList.toggle('with-splits',settings.track);
  $('#fullscreen-splits .current')?.scrollIntoView({block:'nearest'});
  $('#fullscreen-track').setAttribute('aria-pressed',String(settings.track));
  $('#fullscreen-track').disabled=['running','arming','armed'].includes(state);
}
function renderHistory(){
  const a=filtered($('#history-scope').value).reverse().filter(s=>[s.date,new Date(s.date).toLocaleString(),s.scramble,s.note].join(' ').toLowerCase().includes($('#search').value.toLowerCase())),n=25;
  historyPage=Math.max(0,Math.min(historyPage,Math.ceil(a.length/n)-1));
  const rows=a.slice(historyPage*n,(historyPage+1)*n);
  $('#history-body').innerHTML=rows.length?rows.map((s,i)=>`<tr><td class="history-index">${a.length-historyPage*n-i}</td><td class="history-date">${esc(new Date(s.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}))}<small>${esc(new Date(s.date).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</small></td><td class="history-time">${formatTime(result(s))}${s.penalty==='+2'?'<small>includes +2</small>':''}</td><td class="history-splits">${s.splits.length||'—'}</td><td class="history-action"><button class="small-button" data-id="${esc(s.id)}" aria-label="Open solve ${esc(formatTime(result(s)))}"><span class="history-details-label">Details </span><span aria-hidden="true">↗</span></button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">No matching solves.</td></tr>';
  $('#history-summary').textContent=a.length?`${historyPage*n+1}–${Math.min(a.length,(historyPage+1)*n)} of ${a.length} solves`:'0 solves';
  $('#prev').disabled=historyPage===0;$('#next').disabled=(historyPage+1)*n>=a.length;
  $('.history-scroll').scrollTop=0;
}
function chart(a,width){
  if(a.length<2)return '<div class="empty">Not enough solves.</div>';
  const w=Math.max(260,width||950),h=280,left=44,right=16,top=12,bottom=44,values=a.map(result).filter(Number.isFinite);
  if(!values.length)return '<div class="empty">No completed solves.</div>';
  let low=Math.max(0,Math.floor(Math.min(...values)/10000)*10000-10000),high=Math.ceil(Math.max(...values)/10000)*10000+5000;
  if(low===high)high+=10000;
  const x=i=>left+i/(a.length-1)*(w-left-right),y=v=>h-bottom-(v-low)/(high-low)*(h-top-bottom);
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${a.length} solve times in seconds by solve number, oldest to newest">`;
  for(let i=0;i<=3;i++){const v=low+(high-low)*i/3,yy=y(v);svg+=`<line x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}" stroke="#eef1f6"/><text x="${left-9}" y="${yy+4}" text-anchor="end">${(v/1000).toFixed(0)}s</text>`;}
  let path='',avgPath='',avgOpen=false,open=false;
  for(let i=0;i<a.length;i++){
    const v=result(a[i]);
    if(Number.isFinite(v)){path+=`${open?'L':'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)} `;open=true;svg+=`<circle data-id="${esc(a[i].id)}" cx="${x(i)}" cy="${y(v)}" r="2.8" fill="#b9c5e9"><title>Solve #${i+1} · ${esc(new Date(a[i].date).toLocaleString())} · ${formatTime(v)}</title></circle>`;}else open=false;
    const av=i>=11?average(a.slice(0,i+1),12):null;
    if(Number.isFinite(av)&&av!==null){avgPath+=`${avgOpen?'L':'M'}${x(i)} ${y(av)} `;avgOpen=true;}else avgOpen=false;
  }
  svg+=`<path d="${path}" fill="none" stroke="#bdc9ed" stroke-width="1" opacity=".65" pointer-events="none"/><path d="${avgPath}" fill="none" stroke="#7489d4" stroke-width="2.5" stroke-linecap="round" pointer-events="none"/>`;
  svg+=`<text x="${left}" y="${h-24}">#1</text><text x="${w-right}" y="${h-24}" text-anchor="end">#${a.length}</text><text x="${(left+w-right)/2}" y="${h-5}" text-anchor="middle">Solve</text></svg>`;
  return svg;
}
let mainChartWidth=0;
function renderMainChart(a){mainChartWidth=Math.floor($('#main-chart').clientWidth);$('#main-chart').innerHTML=chart(a,mainChartWidth);}
new ResizeObserver(()=>requestAnimationFrame(()=>{if(page==='insights'&&Math.floor($('#main-chart').clientWidth)!==mainChartWidth)renderMainChart(filtered($('#insight-scope').value,$('#insight-period').value));})).observe($('#main-chart'));
function renderInsights(){const a=filtered($('#insight-scope').value,$('#insight-period').value),s=summary(a);const cards=[['BEST',formatTime(s.best),'Fastest result in this view'],['AO5',formatTime(s.ao5),'Latest 5 · best and worst removed'],['AO12',formatTime(s.ao12),'Latest 12 · best and worst removed'],['SUB-MINUTE',s.completed?`${Math.round(100*s.sub60/s.completed)}%`:'—',`${s.sub60} of ${s.completed} completed solves`],['MEAN',formatTime(s.mean),'Completed solves, including +2'],['MEDIAN',formatTime(s.median),'Middle completed result'],['AO100',formatTime(s.ao100),'Latest 100 · trim 5 on each side'],['SOLVES',String(s.count),'All attempts in this view']];$('#insight-stats').innerHTML=cards.map(c=>`<div class="stat" title="${esc(c[2])}"><span>${c[0]}</span><strong>${c[1]}</strong></div>`).join('');renderMainChart(a);const bins=[['Under 45s',0,45000],['45–60s',45000,60000],['1:00–1:30',60000,90000],['1:30–2:00',90000,120000],['Over 2:00',120000,Infinity]],counts=bins.map(b=>a.filter(x=>Number.isFinite(result(x))&&result(x)>=b[1]&&result(x)<b[2]).length),max=Math.max(...counts,1);$('#distribution').innerHTML=s.completed?bins.map((b,i)=>`<div class="bar-row"><span>${b[0]}</span><div class="bar-track"><div class="bar-fill" style="width:${counts[i]/max*100}%"></div></div><strong>${counts[i]}</strong></div>`).join(''):'<div class="empty">No completed solves.</div>';const preset=$('#split-preset').value,labels=preset==='custom'?settings.custom:PRESETS[preset],progress=splitProgress(a,labels);
renderSplitProgress(progress);
if(!progress.count){$('#split-chart').innerHTML='<div class="empty">No split data.</div>';return;}
const mx=Math.max(...progress.means,1);
$('#split-chart').innerHTML=`<p class="muted">${progress.count} solves</p>`+labels.map((name,i)=>`<div class="bar-row"><span>${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${progress.means[i]/mx*100}%"></div></div><strong>${formatTime(progress.means[i])}</strong></div>`).join('');}

function timerVisual(){const c=$('#timer-card');c.classList.remove('arming','armed','running');if(['arming','armed','running'].includes(state))c.classList.add(state);const hint=state==='running'&&settings.track?activeNames[splitMarks.length]:'';$('#timer-hint').textContent=hint;$('#timer-hint').hidden=!hint;$('#timer-instruction').innerHTML=state==='armed'?'<span>Release</span>':state==='arming'?'<span>Hold…</span>':state==='running'?`<kbd>space</kbd><span>${settings.track?'Split':'Stop'}</span>`:'<kbd>space</kbd><span>Hold · release</span>';$('#touch-instruction').textContent=state==='armed'?'Release':state==='arming'?'Hold…':state==='running'?(settings.track?'Tap to split':'Tap to stop'):'Two fingers · hold · release';$('#new-scramble').disabled=['running','arming','armed'].includes(state);$('#manual-entry').disabled=state==='running';renderSteps();}
function arm(){if(state==='running'||!scramble||Date.now()-lastFinished<700)return;clearTimeout(armTimeout);elapsed=0;splitMarks=[];lastSolveId=null;state='arming';$('#clock').textContent='0.00';timerVisual();armTimeout=setTimeout(()=>{if(state==='arming'){state='armed';timerVisual();navigator.vibrate?.(20);}},settings.hold);}
function disarm(){clearTimeout(armTimeout);if(state==='arming'||state==='armed'){state='idle';timerVisual();}}
async function keepAwake(){try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}}
function start(){if(state!=='armed')return;clearTimeout(armTimeout);state='running';started=performance.now();elapsed=0;splitMarks=[];activeNames=[...names()];activeScramble=scramble;automaticFocus=!document.body.classList.contains('focus-mode');focusView(true);timerVisual();keepAwake();frame=requestAnimationFrame(tick);}
function tick(){if(state!=='running')return;elapsed=performance.now()-started;$('#clock').textContent=formatTime(elapsed);const activeSplit=$('#fullscreen-splits .current .split-value');if(activeSplit)activeSplit.textContent=formatTime(Math.max(0,elapsed-(splitMarks.at(-1)?.ms||0)));frame=requestAnimationFrame(tick);}
function makeSolve(ms,splits=[],manual=false){return normalizeSolve({id:crypto.randomUUID(),date:new Date().toISOString(),ms:Math.max(1,Math.round(ms)),penalty:'none',scramble:manual?scramble:activeScramble,splits,source:manual?'manual':'timer',note:'',updatedAt:Date.now()});}
function stop(){if(state!=='running')return;elapsed=Math.max(1,Math.round(performance.now()-started));cancelAnimationFrame(frame);if(settings.track)splitMarks.push({name:activeNames[splitMarks.length],ms:elapsed});state='stopped';lastFinished=Date.now();$('#clock').textContent=formatTime(elapsed);const solve=makeSolve(elapsed,[...splitMarks]);lastSolveId=solve.id;updateSolve(solve);wakeLock?.release();automaticFocus=false;timerVisual();newScramble();}
function mark(){if(state!=='running')return;if(!settings.track||splitMarks.length>=activeNames.length-1){stop();return;}splitMarks.push({name:activeNames[splitMarks.length],ms:Math.round(performance.now()-started)});navigator.vibrate?.(10);timerVisual();}
function cancel(){if(automaticFocus){focusView(false);automaticFocus=false;}if(state==='running'){cancelAnimationFrame(frame);wakeLock?.release();state='idle';splitMarks=[];elapsed=0;$('#clock').textContent='0.00';toast('Cancelled.');lastFinished=Date.now();timerVisual();}else disarm();}
const pad=$('#timer-pad');
pad.addEventListener('pointerdown',e=>{if(e.target.closest('#fullscreen-splits')&&state!=='running')return;if(e.pointerType==='touch'){e.preventDefault();touches.add(e.pointerId);pad.setPointerCapture(e.pointerId);if(state==='running'){if(!gesture){gesture=true;mark();}return;}if(touches.size===2){gesture=true;arm();}}else if(e.button===0){if(state==='running'){mark();return;}keyboardHeld=true;pad.setPointerCapture(e.pointerId);arm();}});
pad.addEventListener('pointerup',e=>{if(e.pointerType==='touch'){e.preventDefault();touches.delete(e.pointerId);if(touches.size<2&&state==='arming')disarm();if(touches.size===0){if(gesture&&state==='armed')start();gesture=false;}}else if(keyboardHeld){keyboardHeld=false;if(state==='armed')start();else disarm();}});
pad.addEventListener('pointercancel',()=>{touches.clear();gesture=false;keyboardHeld=false;disarm();});
window.addEventListener('keydown',e=>{if(e.repeat||$$('dialog').some(d=>d.open)||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.code==='Escape'){cancel();focusView(false);return;}if(page!=='timer')return;if(e.code==='Space'){if(e.target.tagName==='BUTTON')return;e.preventDefault();if(state==='running'){mark();return;}keyboardHeld=true;arm();}if(e.code==='Enter'&&state==='running'){e.preventDefault();mark();}});
window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboardHeld){e.preventDefault();keyboardHeld=false;if(state==='armed')start();else disarm();}});
window.addEventListener('blur',()=>{keyboardHeld=false;touches.clear();gesture=false;disarm();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(state==='running')keepAwake();if(Date.now()-lastSync>20000)sync();}else disarm();});
function setTracking(enabled){if(['running','arming','armed'].includes(state))return;settings.track=enabled;splitMarks=[];persist();timerVisual();}
$('#fullscreen-track').onclick=()=>{setTracking(!settings.track);$('#fullscreen-track').blur();};
let automaticFocus=false;
function focusView(enabled){
  // Fill the app viewport without invoking the browser's fullscreen notice.
  document.body.classList.toggle('focus-mode',enabled);
  $('#focus').setAttribute('aria-pressed',String(enabled));
  $('#focus').title=enabled?'Exit fullscreen':'Fullscreen';
  updatePageHeight();
  layoutScramble();
  requestAnimationFrame(()=>feedbackView.fit());
}
$('#focus').onclick=()=>{automaticFocus=false;focusView(!document.body.classList.contains('focus-mode'));$('#focus').blur();};
function updatePageHeight(){
  if(document.body.classList.contains('focus-mode')||!['timer','history'].includes(page))return;
  const target=$(page==='timer'?'#timer-page':'#history-page'),navigation=matchMedia('(max-width:740px)').matches?$('.sidebar').getBoundingClientRect().height:0;
  const available=innerHeight-target.getBoundingClientRect().top-scrollY-navigation-12;
  target.style.setProperty(page==='timer'?'--timer-available-height':'--history-available-height',Math.max(page==='timer'?320:220,available)+'px');
}
const chromeObserver=new ResizeObserver(()=>requestAnimationFrame(updatePageHeight));
[$('.app-bar'),$('.sidebar')].forEach(el=>chromeObserver.observe(el));
addEventListener('resize',updatePageHeight);
let officialScrambler;
async function newScramble(){const req=++scrambleRequest;$('#new-scramble').disabled=true;scramble='';scrambleLayoutKey='';$('#fullscreen-scramble').textContent='…';$('#cube-preview').replaceChildren();$('#scramble-type').textContent='Preparing…';let timeout;try{if(!navigator.onLine)throw Error('Offline practice');officialScrambler ||= import('https://cdn.cubing.net/v0/js/cubing/scramble');const generated=officialScrambler.then(lib=>lib.randomScrambleForEvent('333'));const alg=await Promise.race([generated,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Scrambler timed out')),6000);})]);if(req!==scrambleRequest)return;scramble=alg.toString();scrambleKind='Random state';}catch{if(req!==scrambleRequest)return;scramble=practiceScramble();scrambleKind='25-move practice';officialScrambler=null;}finally{clearTimeout(timeout);if(req===scrambleRequest){showScramble();if(!['running','arming','armed'].includes(state))$('#new-scramble').disabled=false;}}}
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
    lines.forEach((line,i)=>{if(i)target.append(' ');const span=document.createElement('span');span.className='scramble-line';span.textContent=line;target.append(span);});
  }
}
const scrambleObserver=new ResizeObserver(()=>requestAnimationFrame(layoutScramble));
scrambleObserver.observe($('#fullscreen-scramble'));
document.fonts?.ready.then(layoutScramble);
function showScramble(){
  layoutScramble();
  $('#scramble-type').textContent=scrambleKind;
  $('#scramble-type').classList.toggle('sr-only',scrambleKind==='Random state');
  try{$('#cube-preview').innerHTML=cubeSVG(scramble);}catch{$('#cube-preview').replaceChildren();}
}
$('#new-scramble').onclick=()=>newScramble();
function openDialog(id){if(state==='running'||state==='arming'||state==='armed')return;$(id).showModal();}
$('#open-settings').onclick=()=>{if(state==='running')return;$('#preset').value=settings.preset;$('#custom-steps').value=settings.custom.join(', ');$('#custom-field').hidden=settings.preset!=='custom';$('#hold-duration').value=settings.hold;openDialog('#settings-dialog');};
$('#preset').onchange=()=>$('#custom-field').hidden=$('#preset').value!=='custom';
$('#save-settings').onclick=()=>{const custom=$('#custom-steps').value.split(',').map(s=>s.trim()).filter(Boolean);if($('#preset').value==='custom'&&(custom.length<2||custom.length>12||custom.some(x=>x.length>50))){toast('Use 2–12 steps, with names under 50 characters.');return;}settings={...settings,preset:$('#preset').value,custom,hold:Number($('#hold-duration').value)};splitMarks=[];persist();$('#settings-dialog').close();renderSteps();};
function openImport(){$('#settings-dialog').close();imported=[];$('#import-preview').textContent='';$('#confirm-import').disabled=true;$('#csv-file').value='';openDialog('#import-dialog');}
$('#open-import').onclick=openImport;
async function previewImport(){try{const file=$('#csv-file').files[0];if(!file)return;if(file.size>5000000)throw Error('Please import a file smaller than 5 MB.');imported=parseCSV(decodeCSV(await file.arrayBuffer()));const duplicates=imported.filter(s=>records.has(s.id)).length;$('#import-preview').textContent=`${imported.length} solves found. ${duplicates} already in your history.`;$('#import-preview').className='info-box';$('#confirm-import').disabled=imported.length===duplicates;}catch(e){imported=[];$('#import-preview').textContent=e.message;$('#confirm-import').disabled=true;}}
$('#csv-file').onchange=previewImport;
$('#confirm-import').onclick=()=>{let count=0;for(const s of imported)if(!records.has(s.id)){records.set(s.id,s);pending.set(s.id,s);count++;}persist();$('#import-dialog').close();render();toast(`${count} solves imported. Duplicates skipped.`);sync();};
function openSolve(id){if(state==='running')return;const s=records.get(id);if(!s||s.deleted)return;selected={...s,splits:s.splits.map(x=>({...x}))};$('#solve-title').textContent='Solve';$('#solve-note').value=s.note||'';renderSolveDetails();openDialog('#solve-dialog');}
function renderSolveDetails(){const s=selected;$('#solve-details').innerHTML=`<div class="detail-time">${formatTime(result(s))}</div><div class="detail-date">${esc(new Date(s.date).toLocaleString())} ${s.penalty==='+2'?'· raw time '+formatTime(s.ms):''}</div><div class="detail-scramble">${esc(s.scramble||'No scramble recorded')}</div>`+s.splits.map((x,i)=>`<div class="detail-split"><span>${esc(x.name)}</span><span>${formatTime(x.ms-(s.splits[i-1]?.ms||0))}</span></div>`).join('');$$('[data-penalty]').forEach(b=>b.classList.toggle('active',b.dataset.penalty===s.penalty));}
$$('[data-penalty]').forEach(b=>b.onclick=()=>{selected.penalty=b.dataset.penalty;renderSolveDetails();});
$('#save-solve').onclick=()=>{if(!selected)return;updateSolve({...selected,note:$('#solve-note').value});$('#solve-dialog').close();toast('Solve updated.');};
$('#delete-solve').onclick=()=>{if(!selected)return;const old={...selected};updateSolve({...selected,deleted:true});$('#solve-dialog').close();toast('Solve deleted.',()=>updateSolve({...old,deleted:false}));};
document.addEventListener('click',e=>{const el=e.target.closest('[data-id]');if(el)openSolve(el.dataset.id);});
$('#manual-entry').onclick=()=>{$('#manual-time').value='';$('#manual-error').textContent='';openDialog('#manual-dialog');};
$('#save-manual').onclick=()=>{try{const ms=parseTime($('#manual-time').value);updateSolve(makeSolve(ms,[],true));$('#manual-dialog').close();toast('Solve added.');}catch(e){$('#manual-error').textContent=e.message;}};
$('#manual-time').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#save-manual').click();}};
$('#history-scope').onchange=()=>{historyPage=0;renderHistory();};$('#search').oninput=()=>{historyPage=0;renderHistory();};$('#prev').onclick=()=>{historyPage--;renderHistory();};$('#next').onclick=()=>{historyPage++;renderHistory();};
$('#insight-scope').onchange=renderInsights;$('#insight-period').onchange=renderInsights;$('#split-preset').onchange=renderInsights;
$('#export').onclick=()=>{const blob=new Blob(['\uFEFF'+exportCSV(all())],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`cube-studio-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('CSV exported.');};
$('#sync-mobile').onclick=()=>{sync();};window.addEventListener('online',sync);window.addEventListener('offline',()=>status(pending.size?`${pending.size} saved offline`:'Offline'));setInterval(()=>{if(!document.hidden&&state!=='running')sync();},60000);
const busy=()=>['running','arming','armed'].includes(state);
const renderSplitProgress=initSplitCharts({openSolve});
const feedbackView=initSolveFeedback();
render();timerVisual();newScramble();initConnection({busy,sync,notify:toast});sync();initPWA({busy,notify:toast});if(storageReadFailed)toast('Could not read saved data. Please connect to sync or import a backup.');
