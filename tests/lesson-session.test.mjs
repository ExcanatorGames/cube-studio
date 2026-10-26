import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLessonSession } from '../web/lesson-session.js';

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
