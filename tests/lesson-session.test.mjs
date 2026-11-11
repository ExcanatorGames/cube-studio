import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLessonSession, withEnabledCases, attemptCaseIds } from '../web/lesson-session.js';
import { getLesson } from '../web/lessons.js';

test('a lesson opened from a group card keeps demonstration and practice inside that group',()=>{
  const session=createLessonSession({getSettings:()=>({})});
  const source=getLesson('f2l');
  const cases=source.cases.filter(item=>item.group==='Edge in Slot');
  assert.equal(session.open('f2l',{scopeCaseIds:cases.map(item=>item.id),title:'F2L · Edge in Slot'}),true);
  assert.equal(session.lesson.cases.length,6);
  assert.equal(session.context.demoCaseId,cases[0].id);
  assert.deepEqual(session.context.caseIds,cases.map(item=>item.id));
  assert.equal(session.selectDemo('ready-right'),false);
  assert.equal(session.selectCases(['ready-right']),false);
  session.open('f2l');
  assert.equal(session.lesson.cases.length,41);
});

test('case choices are remembered per case, so each group keeps its own selection',()=>{
  const groups=['Easy Inserts','Edge in Slot'].map(group=>getLesson('f2l').cases.filter(c=>c.group===group).map(c=>c.id));
  let settings={};
  const session=createLessonSession({getSettings:()=>settings});
  session.open('f2l',{scopeCaseIds:groups[0]});
  assert.equal(session.selectCases(groups[0].slice(1)),true);
  settings=withEnabledCases(settings,groups[0],session.context.caseIds);
  session.open('f2l',{scopeCaseIds:groups[1]});
  assert.deepEqual(session.context.caseIds,groups[1]);
  session.selectCases(groups[1].slice(0,2));
  settings=withEnabledCases(settings,groups[1],session.context.caseIds);
  session.open('mixed',{scopeCaseIds:groups[0]});
  assert.deepEqual(session.context.caseIds,groups[0].slice(1),'the practice page shares the same choices');
  session.open('f2l',{scopeCaseIds:groups[1]});
  assert.deepEqual(session.context.caseIds,groups[1].slice(0,2));
  session.open('f2l',{scopeCaseIds:groups[1],caseIds:[groups[1][3]]});
  assert.deepEqual(session.context.caseIds,[groups[1][3]],'cases from the address win');
});

test('four-pair attempts compare against attempts whose every pair is enabled now',()=>{
  const session=createLessonSession({getSettings:()=>({disabledCases:['ready-right']})});
  session.open('13');
  assert.deepEqual(session.context.caseIds,['ready-left']);
  const base={completion:'four-insertions',date:'2026-01-01',lessonId:'13',caseId:'ready-left'};
  const attempts=[
    {...base,id:'only-left',caseIds:['ready-left','ready-left','ready-left','ready-left']},
    {...base,id:'mixed',caseIds:['ready-left','ready-right','ready-left','ready-left']},
    {...base,id:'legacy'},
    {...base,id:'legacy-other',caseId:'ready-right'},
    {...base,id:'wrong-source',lessonId:'f2l'},
  ];
  assert.deepEqual(session.times(attempts).map(a=>a.id),['legacy','only-left']);
  session.selectCases(['ready-left','ready-right']);
  assert.deepEqual(session.times(attempts).map(a=>a.id),['legacy','legacy-other','mixed','only-left']);
  assert.deepEqual(attemptCaseIds(attempts[2]),['ready-left']);
});

test('lesson selection ignores unknown saved cases and cannot select an empty practice set', () => {
  const session = createLessonSession({ getSettings: () => ({ disabledCases: ['ready-right', 'removed-case'] }) });
  assert.equal(session.open('missing'), false);
  assert.equal(session.open('13'), true);
  assert.deepEqual(session.context.caseIds, ['ready-left']);
  assert.equal(session.selectCases([]), false);
  assert.deepEqual(session.context.caseIds, ['ready-left']);
  assert.equal(session.setTab('practice'), true);
  assert.equal(session.selectDemo('ready-left'), true);
  session.leave(); assert.equal(session.context.kind, 'normal');
  const all = createLessonSession({ getSettings: () => ({ disabledCases: ['ready-right', 'ready-left'] }) });
  all.open('13'); assert.deepEqual(all.context.caseIds, ['ready-right', 'ready-left'], 'all cases off falls back to all');
});

test('a demonstration request never replaces the practice exercise, and a new demo choice drops an older demo', () => {
  const workers = [], requests = [];
  let practice = 0, demos = [];
  const session = createLessonSession({ getSettings: () => ({}), createWorker: () => {
    const worker = { postMessage: data => requests.push(data), terminate() {} };
    workers.push(worker); return worker;
  } });
  session.open('13');
  session.prepare({ withDemo: true, ready: demo => { practice++; demos.push(demo); }, failed() {} });
  session.selectDemo('ready-left');
  session.prepareDemo({ ready: demo => demos.push(demo), failed() {} });
  assert.equal(requests[1].demoOnly, true);
  workers[0].onmessage({ data: { request: requests[0].request, exercise: { lessonId: '13', caseId: 'ready-right', target: [], scramble: 'R' }, demoExercise: 'old' } });
  assert.equal(practice, 1);
  assert.deepEqual(demos, [null], 'the demo for the old choice is dropped');
  workers[0].onmessage({ data: { request: requests[1].request, demoExercise: 'new' } });
  assert.deepEqual(demos, [null, 'new']);
  assert.equal(session.context.exercise.scramble, 'R');
});

test('stale worker results and errors cannot replace a newer lesson request or survive leaving', () => {
  const workers = [], requests = [];
  let successes = 0, failures = 0;
  const session = createLessonSession({ getSettings: () => ({}), createWorker: () => {
    const worker = { postMessage: data => requests.push(data), terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  } });
  const prepare = () => session.prepare({ withDemo: true, ready: () => successes++, failed: () => failures++ });
  const respond = (worker, request) => worker.onmessage({ data: { request: request.request, exercise: { lessonId: '13', caseId: 'ready-right', target: [], scramble: 'R U' } } });
  session.open('13'); prepare(); prepare();
  respond(workers[0], requests[0]); assert.equal(successes, 0);
  workers[0].onerror(); assert.equal(failures, 1);
  respond(workers[0], requests[1]); assert.equal(successes, 0);
  prepare(); workers[0].onerror();
  assert.equal(workers[1].terminated, undefined);
  respond(workers[1], requests[2]); assert.equal(successes, 1);
  prepare(); session.leave(); respond(workers[1], requests[3]);
  assert.equal(successes, 1);
  assert.equal(session.context.exercise, undefined);
});
