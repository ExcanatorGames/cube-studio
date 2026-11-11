import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/app-harness.mjs';
import { createPracticeExercise } from '../web/lesson-scrambler.js';
import { validateSnapshot } from '../web/device-storage.js';
import { getLesson, stepHint, caseLabel } from '../web/lessons.js';
import { lessonGroups } from '../web/routes.js';

const key = (code, target = { tagName: 'DIV' }) => ({ code, target, preventDefault() { this.prevented = true; } });
const button = (insideCard) => ({ tagName: 'BUTTON', closest: (selector) => (selector === '#timer-card' && insideCard ? {} : null) });

test('Space on a focused timer-card button starts the timer instead of pressing the button', () => {
  const h = harness(), down = h.listeners.get('window:keydown'), up = h.listeners.get('window:keyup');
  const press = key('Space', button(true));
  down(press);
  assert.equal(press.prevented, true);
  assert.equal(h.run('timing.state'), 'arming');
  h.arm(); up(key('Space', button(true)));
  assert.equal(h.run('timing.state'), 'running');
  const other = key('Space', button(false));
  h.advance(400);
  down(other);
  assert.equal(h.run('timing.state'), 'stopped', 'Space always stops a running timer, even on a button');
  const outside = key('Space', button(false));
  h.run('Date.now = (n => () => n)(Date.now() + 1000)');
  down(outside);
  assert.equal(outside.prevented, undefined, 'buttons outside the timer card keep Space');
  assert.equal(h.run('timing.state'), 'stopped');
});

test('a hold that starts during the restart pause arms once the pause ends', () => {
  const h = harness(), down = h.listeners.get('window:keydown'), up = h.listeners.get('window:keyup');
  down(key('Space')); h.arm(); up(key('Space'));
  h.advance(400); down(key('Space'));
  assert.equal(h.run('timing.state'), 'stopped');
  down(key('Space'));
  assert.equal(h.run('timing.state'), 'stopped', 'still inside the restart pause');
  h.run('Date.now = (n => () => n)(Date.now() + 1000)');
  h.arm();
  assert.equal(h.run('timing.state'), 'arming', 'the held key starts the hold after the pause');
  h.arm();
  up(key('Space'));
  assert.equal(h.run('timing.state'), 'running');
});

test('fingers left down from the stopping tap never arm, and the whole card stops a solve', () => {
  const h = harness();
  const touch = (id, inPad = true) => ({ pointerType: 'touch', pointerId: id, button: 0, target: { closest: (s) => (s === '#timer-pad' && inPad ? {} : null) }, preventDefault() {} });
  const pad = (type, id) => h.listeners.get('#timer-pad:' + type)(touch(id));
  const card = (type, id) => h.listeners.get('#timer-card:' + type)(touch(id, false));
  pad('pointerdown', 1); pad('pointerdown', 2); h.arm(); pad('pointerup', 1); pad('pointerup', 2);
  assert.equal(h.run('timing.state'), 'running');
  h.advance(500);
  card('pointerdown', 3);
  assert.equal(h.run('timing.state'), 'stopped', 'a tap on the toolbar stops the timer');
  h.run('Date.now = (n => () => n)(Date.now() + 1000)');
  pad('pointerdown', 4);
  assert.equal(h.run('timing.state'), 'stopped', 'a second finger of the stopping tap does not arm');
  card('pointerup', 3); pad('pointerup', 4);
  pad('pointerdown', 5); pad('pointerdown', 6);
  assert.equal(h.run('timing.state'), 'arming', 'a fresh two-finger hold arms');
  assert.equal(h.element('#focus').disabled, true, 'fullscreen is locked while timing');
});

test('practice attempts record every case, can be edited or deleted, and keep the session title', () => {
  const h = harness();
  const group = lessonGroups.find((item) => item.title === 'Easy Inserts');
  h.run(`setPage('practice');openLesson('mixed',{scopeCaseIds:${JSON.stringify(group.cases.map((c) => c.id))},title:'F2L · Easy Inserts'})`);
  h.run('arm()'); h.arm(); h.run('start()'); h.advance(5000); h.run('mark()');
  const attempt = h.run('lessonAttempts.get(lastSolveId)');
  assert.equal(attempt.caseIds.length, 4);
  assert.equal(attempt.caseId, attempt.caseIds[0]);
  assert.match(attempt.note, /^F2L · Easy Inserts · Easy \d → Easy \d → Easy \d → Easy \d · 4 pairs inserted$/);
  assert.equal(h.element('#edit-result').hidden, false);
  h.element('#edit-result').onclick();
  assert.equal(h.element('#solve-dialog').open, true);
  assert.equal(h.element('#solve-title').textContent, 'Practice attempt');
  h.element('#delete-solve').onclick();
  assert.equal(h.run('lessonAttempts.get(lastSolveId).deleted'), true);
  assert.equal(h.run('pendingLessons.get(lastSolveId).deleted'), true);
  assert.equal(h.run('practiceTimes().length'), 0);
  assert.equal(h.run('records.size'), 0, 'practice attempts never become normal solves');
  assert.equal(h.element('#edit-result').hidden, true);
  assert.equal(h.element('#clock').textContent, '0.00');
});

test('changing split settings after a solve keeps the result on screen', () => {
  const h = harness();
  h.run('arm()'); h.arm(); h.run('start()'); h.advance(5000); h.run('mark()');
  assert.equal(h.run('timing.state'), 'stopped');
  h.run('setTracking(true)');
  assert.equal(h.run('timing.state'), 'stopped');
  assert.equal(h.element('#edit-result').hidden, false);
});

test('manual times are saved without the timer scramble and leave it in place', () => {
  const h = harness();
  const scramble = h.run('scramble');
  h.element('#manual-time').value = '12.34';
  h.element('#save-manual').onclick();
  const solve = h.run('all()[0]');
  assert.equal(solve.ms, 12340);
  assert.equal(solve.scramble, '');
  assert.equal(h.run('scramble'), scramble);
});

test('old shared case lists become per-case choices and checked practice groups', () => {
  const f2l = getLesson('f2l').cases;
  const easy = lessonGroups.find((g) => g.title === 'Easy Inserts'),
    edge = lessonGroups.find((g) => g.title === 'Edge in Slot');
  const { snapshot, issues } = validateSnapshot({ settings: { lessonCaseSelections: {
    f2l: easy.cases.slice(1).map((c) => c.id),
    mixed: [edge.cases[0].id],
  } } });
  assert.deepEqual(issues, []);
  assert.deepEqual(snapshot.settings.disabledCases, [easy.cases[0].id], 'only the edited group loses a case');
  assert.deepEqual(snapshot.settings.practiceGroups, [edge.id]);
  const legacy = validateSnapshot({ settings: { lessonCaseSelections: { 13: ['ready-left'] } } }).snapshot.settings;
  assert.deepEqual(legacy.disabledCases, ['ready-right']);
  const kept = validateSnapshot({ settings: { disabledCases: ['a', 'a', 7], practiceGroups: [] } });
  assert.deepEqual(kept.snapshot.settings.disabledCases, ['a']);
  assert.ok(kept.issues.includes('settings.disabledCases'));
  assert.equal(f2l.length, 41);
});

test('case labels are numbered inside their group and stay the same in every list', () => {
  const cases = getLesson('f2l').cases;
  assert.equal(new Set(cases.map(caseLabel)).size, 41);
  for (const group of lessonGroups.filter((item) => item.lessonId === 'f2l'))
    group.cases.forEach((item, i) => assert.match(caseLabel(item), new RegExp(` ${i + 1}$`)));
  assert.equal(caseLabel(getLesson('13').cases[1]), 'Easy 2', 'legacy lessons use the same labels');
});

test('practice hints turn each slot to the front right relative to the previous pair', () => {
  // Letters after turning the whole cube by y^k, written in the original frame.
  const map = { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' };
  const turn = (alg, k) => { for (let i = 0; i < k; i++) alg = alg.replace(/[URFDLB]/g, (f) => map[f]); return alg; };
  const quarter = { '': 0, y: 1, y2: 2, "y'": 3 };
  for (let n = 0; n < 20; n++) {
    const exercise = createPracticeExercise('f2l');
    let facing = 0;
    for (const step of exercise.steps) {
      facing = (facing + quarter[step.rotation]) % 4;
      assert.equal(turn(step.insert, facing), step.solution);
      assert.equal(stepHint(step), [step.rotation, step.insert].filter(Boolean).join(' '));
      assert.ok(!/[BL]/.test(step.insert), 'hint moves only use the front-right slot');
    }
  }
});

test('two tabs turning off cases in different groups keep both choices', async () => {
  const { mergeSnapshots } = await import('../web/coordinated-storage.js');
  const empty = { solves: [], pending: [], lessonAttempts: [], pendingLessons: [] };
  const base = { ...empty, settings: { disabledCases: ['a'] } };
  const local = { ...empty, settings: { disabledCases: ['b'] } };
  const remote = { ...empty, settings: { disabledCases: ['a', 'c'] } };
  assert.deepEqual(mergeSnapshots(base, local, remote).settings.disabledCases.sort(), ['b', 'c']);
});

test('manual times accept a decimal comma, and the solve list can be searched by time', async () => {
  const { parseTime } = await import('../web/core.js');
  assert.equal(parseTime('12,34'), 12340);
  assert.equal(parseTime('1:02,5'), 62500);
  assert.throws(() => parseTime('1,234,5'));
  const h = harness();
  h.element('#manual-time').value = '12,34';
  h.element('#save-manual').onclick();
  h.element('#history-scope').value = 'all';
  h.element('#search').value = '12.34';
  h.run("setPage('history')");
  assert.match(h.element('#history-body').innerHTML, /12\.34/);
  h.element('#search').value = '99.99';
  h.element('#search').oninput();
  assert.match(h.element('#history-body').innerHTML, /No matching solves/);
});

test('settings apply as soon as they change, keeping the saved hold time when the entry is invalid', () => {
  const h = harness();
  h.element('#open-settings').onclick();
  h.element('#hold-duration').value = '0.3';
  h.element('#settings-panel-general').onchange();
  assert.equal(h.run('settings.hold'), 300);
  assert.equal(h.element('#settings-dialog').open, true, 'saving does not close Settings');
  h.element('#hold-duration').value = '5';
  h.element('#settings-panel-general').onchange();
  assert.equal(h.run('settings.hold'), 300);
  assert.equal(h.element('#hold-duration').value, 0.3);
});

test('a deleted split list can be restored with Undo', () => {
  const h = harness();
  h.run("settingsDialog.open('splits')");
  const before = h.run('splitMethods(settings).map(m => m.id).join()');
  h.run("settings.preset = 'cfop'");
  h.element('#split-method-list').onclick({ target: { closest: () => ({ dataset: { delete: 'cfop' } }) } });
  assert.ok(!h.run('splitMethods(settings).some(m => m.id === "cfop")'));
  assert.notEqual(h.run('settings.preset'), 'cfop');
  h.run("$('#toast').children.at(-1)?.onclick?.()");
  assert.equal(h.run('splitMethods(settings).map(m => m.id).join()'), before);
  assert.equal(h.run('settings.preset'), 'cfop');
});
