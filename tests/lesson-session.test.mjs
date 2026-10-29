import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLessonSession } from '../web/lesson-session.js';
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

test('unified F2L restores old selections and includes legacy records without rewriting their IDs',()=>{
  const session=createLessonSession({getSettings:()=>({lessonCaseSelections:{'13':['ready-left'],'14':['pair-1-3-0']}})});
  session.open('f2l');
  assert.equal(session.context.caseIds.length,19,'two old selected cases plus 17 newly available cases');
  assert.ok(!session.context.caseIds.includes('ready-right'));
  const attempt={id:'old',lessonId:'13',caseId:'ready-left',completion:'insertion',date:'2026-01-01'};
  assert.deepEqual(session.times([attempt,{...attempt,id:'wrong-source',lessonId:'f2l'}]),[attempt]);
});

test('mixed practice restores an exact cross-group subset and records its source identities',()=>{
  const cases=getLesson('f2l').cases;
  const ids=['ready-left',cases.find(c=>c.group==='Both Pieces in Slot').id];
  const session=createLessonSession({getSettings:()=>({lessonCaseSelections:{mixed:ids}})});
  session.open('mixed');
  assert.deepEqual(session.context.caseIds,ids);
  const attempts=ids.map((caseId,i)=>({id:String(i),caseId,lessonId:i?'f2l':'13',completion:'insertion',date:'2026-01-01'}));
  assert.deepEqual(session.times(attempts),attempts);
  assert.equal(session.selectCases(['removed']),false);
  session.open('f2l');assert.equal(session.context.caseIds.length,41,'lesson-specific selection stays independent');
});

test('lesson selection restores valid saved cases and cannot select an empty practice set', () => {
  const session = createLessonSession({ getSettings: () => ({ lessonCaseSelections: { '13': ['ready-left', 'removed-case'] } }) });
  assert.equal(session.open('missing'), false);
  assert.equal(session.open('13'), true);
  assert.deepEqual(session.context.caseIds, ['ready-left']);
  assert.equal(session.selectCases([]), false);
  assert.deepEqual(session.context.caseIds, ['ready-left']);
  assert.equal(session.setTab('practice'), true);
  assert.equal(session.selectDemo('ready-left'), true);
  const attempt = { id: 'practice', lessonId: '13', caseId: 'ready-left', completion: 'insertion', date: '2026-01-01' };
  assert.deepEqual(session.times([attempt, { ...attempt, id: 'other', caseId: 'ready-right' }]), [attempt]);
  session.leave(); assert.equal(session.context.kind, 'normal');
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
