import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {harness} from './helpers/app-harness.mjs';

const flush=()=>new Promise(setImmediate);
const response=(status=200,data={solves:[]})=>({ok:status>=200&&status<300,status,json:async()=>data});
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
function assertHealthy(h){
  for(const id of ['mobile-sync','sync-mobile','connect-sync','sync-attention'])assert.equal(h.element('#'+id).hidden,true,id);
}
function saveManual(h,time='12.34'){
  h.element('#manual-time').value=time;h.element('#save-manual').onclick();
  assert.equal(h.element('#manual-error').textContent,'');
}
function assertContext(h,active){
  for(const name of ['history','insights','lesson'])assert.equal(h.element(`[data-header-context="${name}"]`).hidden,name!==active,name);
}

test('page controls live once in the shared header and lessons retain only their detail heading',async()=>{
  const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  const header=html.match(/<header class="app-bar">([\s\S]*?)<\/header>/)[1];
  for(const id of ['history-scope','search','history-import','insight-period','lesson-back','mobile-sync','sync-mobile','connect-sync','open-settings','update-app']){
    assert.ok(header.includes(`id="${id}"`),id);
    assert.equal(html.split(`id="${id}"`).length-1,1,id);
  }
  for(const id of ['open-import','export','install-app'])assert.equal(html.split(`id="${id}"`).length-1,1,id);
  assert.doesNotMatch(html.match(/<aside class="sidebar">([\s\S]*?)<\/aside>/)[1],/id="open-settings"/);
  assert.doesNotMatch(html,/puzzle-label|class="lesson-intro"|<h2[^>]*>Lessons<\/h2>/);
  assert.match(html,/<header class="lesson-heading"><h2 id="lesson-title"/);
});

test('navigation, opening and leaving lessons show only the matching header group and preserve filter values',()=>{
  const h=harness();assertContext(h,null);
  h.element('nav-history').onclick();assertContext(h,'history');
  h.element('#history-scope').value='today';h.element('#history-scope').onchange();
  h.element('#search').value='old note';h.element('#search').oninput();
  h.element('#history-import').onclick();assert.equal(h.element('#import-dialog').open,true);
  h.element('nav-insights').onclick();assertContext(h,'insights');
  h.element('#insight-period').value='7';h.element('#insight-period').onchange();
  h.element('nav-lessons').onclick();assertContext(h,null);
  assert.match(h.element('#lesson-cards').innerHTML,/<strong>Use one F2L pair<\/strong>/);
  assert.match(h.element('#lesson-cards').innerHTML,/<strong>Build an F2L pair<\/strong>/);
  assert.doesNotMatch(h.element('#lesson-cards').innerHTML,/<strong>\d/);
  h.element('#lesson-cards').onclick({target:{closest:()=>({dataset:{lesson:'13'}})}});
  assertContext(h,'lesson');assert.equal(h.element('#lesson-title').textContent,'Use one F2L pair');
  h.element('#lesson-tab-practice').onclick();assertContext(h,'lesson');
  h.element('#lesson-back').onclick();assertContext(h,null);
  assert.equal(h.element('#lesson-detail').hidden,true);
  h.element('nav-history').onclick();assertContext(h,'history');
  assert.equal(h.element('#history-scope').value,'today');assert.equal(h.element('#search').value,'old note');
  h.element('nav-insights').onclick();assert.equal(h.element('#insight-period').value,'7');
  h.element('.brand').onclick({preventDefault(){}});assertContext(h,null);
});

test('the header back button stays locked for arming, armed and running lesson attempts',()=>{
  const h=harness();h.run("setPage('lessons');openLesson('13');setLessonTab('practice');arm()");
  for(const advance of [()=>{},()=>h.arm(),()=>h.run('start()')]){
    advance();assert.equal(h.element('#lesson-back').disabled,true);
    h.element('#lesson-back').onclick();assertContext(h,'lesson');
    assert.equal(h.element('#lesson-detail').hidden,false);
  }
  h.run('cancel()');assert.equal(h.element('#lesson-back').disabled,false);
  h.element('#lesson-back').onclick();assertContext(h,null);
});

test('swipe navigation includes restored lessons and preserves the shared timer on return',()=>{
  const h=harness(),scramble=h.run('scramble');
  assert.deepEqual(Array.from(h.run('mobileNavigation.pages')),['timer','history','insights','lessons']);
  h.run("mobileNavigation.navigate('lessons');openLesson('13');setLessonTab('practice')");
  assert.equal(h.element('#timer-card').parentElement.id,'lesson-practice-mount');
  assert.equal(h.run('mobileNavigation.blocked()'),false);
  h.run('arm()');assert.equal(h.run('mobileNavigation.blocked()'),true);
  h.run("cancel();mobileNavigation.navigate('timer')");
  assert.equal(h.element('#timer-card').parentElement.id,'timer-page');
  assert.equal(h.run('scramble'),scramble);
  h.element('#open-settings').onclick();assert.equal(h.element('#settings-dialog').open,true);
});

test('startup and healthy periodic background refreshes never show sync status or retry',async()=>{
  let next=deferred(),calls=0;
  const h=harness({online:true,fetch:()=>{calls++;return next.promise;}});
  assert.equal(calls,1);assertHealthy(h);
  next.resolve(response());await flush();assertHealthy(h);
  next=deferred();h.intervals.find(i=>i.ms===60000).fn();
  assert.equal(calls,2);assertHealthy(h);
  next.resolve(response());await flush();assertHealthy(h);
});

test('a failed background refresh exposes retry and the next automatic refresh hides it after success',async()=>{
  let next=response();const h=harness({online:true,fetch:async()=>next});
  await flush();assertHealthy(h);
  next=response(500);h.intervals[0].fn();await flush();
  assert.equal(h.element('#mobile-sync').hidden,false);
  assert.equal(h.element('#mobile-sync').textContent,'Sync failed');
  assert.equal(h.element('#sync-mobile').hidden,false);
  assert.equal(h.element('#sync-mobile').disabled,false);
  assert.equal(h.element('#connect-sync').hidden,true);
  const recovering=deferred();next=recovering.promise;h.intervals[0].fn();
  assert.equal(h.element('#mobile-sync').hidden,false);
  assert.equal(h.element('#sync-mobile').disabled,true);
  recovering.resolve(response());await flush();assertHealthy(h);
});

test('pending saves are visible during upload without offering routine manual sync',async()=>{
  const upload=deferred(),calls=[];
  const h=harness({online:true,fetch:async(url,options)=>{calls.push(options);return options.method==='POST'?upload.promise:response();}});
  await flush();saveManual(h);
  assert.equal(h.element('#mobile-sync').hidden,false);
  assert.match(h.element('#mobile-sync').textContent,/1 waiting to sync/);
  assert.equal(h.element('#sync-mobile').hidden,true);
  assert.equal(h.element('#connect-sync').hidden,true);
  upload.resolve(response());await flush();assertHealthy(h);
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
  assert.deepEqual(JSON.parse(h.storage.get('cube-studio-v1')).pending,[]);
});

test('offline saves automatically upload when online and preserve existing lesson notes',async()=>{
  const old={id:'old',date:'2026-01-01T12:00:00Z',ms:14000,splits:[],penalty:'none',note:'13 · Use one F2L pair · Ready right · Full cube',updatedAt:1};
  const calls=[],h=harness({saved:{solves:[old],pending:[]},fetch:async(url,options)=>{calls.push(options);return response();}});
  assert.equal(h.element('#mobile-sync').textContent,'Offline');
  saveManual(h);
  assert.equal(h.element('#mobile-sync').textContent,'1 saved offline');
  assert.equal(h.element('#sync-mobile').hidden,false);assert.equal(calls.length,0);
  h.run('navigator.onLine=true');await h.listeners.get('window:online')();
  assertHealthy(h);assert.equal(calls.filter(c=>c.method==='POST').length,1);
  const saved=JSON.parse(h.storage.get('cube-studio-v1'));
  assert.equal(saved.solves.find(s=>s.id==='old').note,old.note);assert.deepEqual(saved.pending,[]);
  h.run('navigator.onLine=false');h.listeners.get('window:offline')();
  assert.equal(h.element('#mobile-sync').textContent,'Offline');
});

test('auth failures show Connect only, while setup and network failures expose retry',async()=>{
  for(const status of [401,403,503,'network']){
    let fail=true;
    const h=harness({online:true,fetch:async()=>{if(!fail)return response();if(status==='network')throw Error('Network unavailable');return response(status,{setupRequired:true});}});
    await flush();const auth=status===401||status===403;
    assert.equal(h.element('#mobile-sync').hidden,false);
    assert.equal(h.element('#connect-sync').hidden,!auth);
    assert.equal(h.element('#sync-mobile').hidden,auth);
    fail=false;h.run('lastSync=0');h.listeners.get('document:visibilitychange')();await flush();assertHealthy(h);
  }
});

test('saves and edits during an upload drain automatically without parallel requests or losing newer versions',async()=>{
  const firstUpload=deferred(),uploads=[];let active=0,maxActive=0;
  const h=harness({online:true,fetch:async(url,options)=>{
    active++;maxActive=Math.max(maxActive,active);
    try{
      if(options.method==='POST'){
        uploads.push(JSON.parse(options.body).solves);
        if(uploads.length===1)return await firstUpload.promise;
      }
      return response();
    }finally{active--;}
  }});
  await flush();saveManual(h);
  const first=uploads[0][0];h.run(`openSolve(${JSON.stringify(first.id)})`);
  h.element('#solve-note').value='Changed during upload';h.element('#save-solve').onclick();
  saveManual(h,'15.67');assert.equal(uploads.length,1);
  firstUpload.resolve(response());await flush();
  assert.equal(maxActive,1);assert.equal(uploads.length,2);
  const edited=uploads[1].find(s=>s.id===first.id);
  assert.equal(edited.note,'Changed during upload');assert.ok(edited.updatedAt>first.updatedAt);
  assert.equal(uploads[1].length,2);
  assert.deepEqual(JSON.parse(h.storage.get('cube-studio-v1')).pending,[]);assertHealthy(h);
});

test('a connection change during a failing request gets one queued retry and repeated failures stop',async()=>{
  for(const recovered of [true,false]){
    const first=deferred();let calls=0;
    const h=harness({online:true,fetch:async()=>++calls===1?first.promise:response(recovered?200:500)});
    h.listeners.get('window:online')();h.listeners.get('window:online')();
    assert.equal(calls,1);
    first.resolve(response(401));await flush();assert.equal(calls,2);
    if(recovered)assertHealthy(h);
    else{assert.equal(h.element('#sync-mobile').hidden,false);assert.equal(h.element('#sync-mobile').disabled,false);}
  }
});
