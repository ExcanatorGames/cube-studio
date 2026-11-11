import { getLesson, orientLessonCase, freezeLessonExercise, PRACTICE_COMPLETION } from './lessons.js';

/** Cases turned off for practice, remembered per case on this device. */
export const disabledCaseIds = (settings) =>
  new Set(Array.isArray(settings.disabledCases) ? settings.disabledCases : []);

/** Save which of `scope` are enabled without touching other cases. */
export function withEnabledCases(settings, scope, enabled) {
  const disabled = disabledCaseIds(settings);
  for (const id of scope) {
    if (enabled.includes(id)) disabled.delete(id);
    else disabled.add(id);
  }
  return { ...settings, disabledCases: [...disabled] };
}

/** Case IDs a practice attempt covered. Older records only name one case. */
export const attemptCaseIds = (attempt) =>
  Array.isArray(attempt.caseIds) && attempt.caseIds.length ? attempt.caseIds : [attempt.caseId];

export function createLessonSession({
  getSettings,
  createWorker = () =>
    new Worker('/lesson-scramble-worker.js', { type: 'module' }),
}) {
  let context = Object.freeze({ kind: 'normal' }),
    worker,
    sequence = 0,
    // Latest request for each result; 0 means none is wanted.
    practiceRequest = 0,
    demoRequest = 0,
    practiceCallbacks = null,
    demoCallbacks = null;
  const update = (values) => {
    context = Object.freeze({ ...context, ...values });
  };
  const lesson = () => {
    const selected = getLesson(context.lessonId);
    if (!selected || !context.scopeCaseIds) return selected;
    const cases = selected.cases.filter(item => context.scopeCaseIds.includes(item.id));
    return { ...selected, cases, case: cases[0] };
  };
  function invalidate() {
    practiceRequest = 0;
    demoRequest = 0;
  }
  function failRequests(practice, demo) {
    if (context.kind !== 'lesson') return;
    const practiceFailed = practice ? practiceCallbacks : null,
      demoFailed = demo && !practice ? demoCallbacks : null;
    if (practice) practiceRequest = 0;
    if (demo) demoRequest = 0;
    practiceFailed?.failed();
    demoFailed?.failed?.();
  }
  function post(message) {
    worker ||= createWorker();
    const activeWorker = worker;
    worker.onmessage = ({ data }) => {
      const practice = data.request === practiceRequest,
        demo = data.request === demoRequest;
      if ((!practice && !demo) || context.kind !== 'lesson') return;
      if (data.error) {
        failRequests(practice, demo);
        return;
      }
      if (demo) demoRequest = 0;
      if (practice) {
        practiceRequest = 0;
        update({ exercise: freezeLessonExercise(data.exercise) });
        practiceCallbacks.ready(demo ? data.demoExercise : null);
      } else demoCallbacks.ready(data.demoExercise);
    };
    worker.onerror = () => {
      if (worker !== activeWorker) return;
      activeWorker.terminate();
      worker = null;
      failRequests(practiceRequest !== 0, demoRequest !== 0);
    };
    worker.postMessage(message);
  }
  return {
    get context() {
      return context;
    },
    get lesson() {
      return lesson();
    },
    get exerciseCase() {
      return lesson()?.cases.find(
        (item) => item.id === context.exercise?.caseId,
      );
    },
    get exercise() {
      return context.exercise
        ? orientLessonCase(context.exercise, getSettings().lessonOrientation)
        : null;
    },
    open(id, { caseIds, title, scopeCaseIds } = {}) {
      const source = getLesson(id);
      if (!source) return false;
      const cases = scopeCaseIds ? source.cases.filter(item => scopeCaseIds.includes(item.id)) : source.cases;
      if (!cases.length) return false;
      const selected = { ...source, cases, case: cases[0] };
      const requested = caseIds && selected.cases.filter(item => caseIds.includes(item.id)).map(item => item.id);
      if (requested && !requested.length) return false;
      invalidate();
      const disabled = disabledCaseIds(getSettings());
      const saved = selected.cases.filter(item => !disabled.has(item.id)).map(item => item.id);
      context = Object.freeze({
        kind: 'lesson',
        lessonId: id,
        title: title || selected.title,
        scopeCaseIds: scopeCaseIds ? cases.map(item => item.id) : undefined,
        tab: 'lesson',
        exercise: null,
        assistance: false,
        demoCaseId: selected.case.id,
        caseIds: requested || (saved.length ? saved : selected.cases.map((item) => item.id)),
      });
      return true;
    },
    leave() {
      invalidate();
      context = Object.freeze({ kind: 'normal' });
    },
    selectCases(ids) {
      const valid = lesson()
        ?.cases.filter((item) => ids.includes(item.id))
        .map((item) => item.id);
      if (!valid?.length) return false;
      practiceRequest = 0;
      update({ caseIds: valid });
      return true;
    },
    selectDemo(id) {
      if (
        !lesson()?.cases.some((item) => item.id === id) ||
        id === context.demoCaseId
      )
        return false;
      demoRequest = 0;
      update({ demoCaseId: id });
      return true;
    },
    setTab(tab) {
      if (
        context.kind !== 'lesson' ||
        !['lesson', 'practice'].includes(tab) ||
        context.tab === tab
      )
        return false;
      update({ tab });
      return true;
    },
    toggleHints() {
      if (!context.exercise) return false;
      update({ assistance: !context.assistance });
      return true;
    },
    /** Earlier practice attempts comparable with the enabled cases: every pair
     * of the attempt came from a case that is enabled now. */
    times(attempts) {
      const cases = lesson()?.cases || [];
      return [...attempts]
        .filter((s) => {
          if (s.deleted || s.completion !== PRACTICE_COMPLETION) return false;
          if (Array.isArray(s.caseIds) && s.caseIds.length)
            return s.caseIds.every(id => context.caseIds?.includes(id) && cases.some(item => item.id === id));
          return context.caseIds?.includes(s.caseId) &&
            cases.some(item => item.id === s.caseId &&
              (item.sourceLessonId || context.lessonId) === s.lessonId);
        })
        .sort(
          (a, b) =>
            Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id),
        );
    },
    /** New four-pair practice exercise. With withDemo, the same worker reply
     * also carries a demonstration for the selected demo case. */
    prepare({ withDemo, ready, failed }) {
      if (context.kind !== 'lesson') return;
      const request = ++sequence,
        previousScramble = context.exercise?.scramble;
      practiceRequest = request;
      practiceCallbacks = { ready, failed };
      if (withDemo) {
        demoRequest = request;
        demoCallbacks = { ready: () => {}, failed: () => {} };
      }
      update({ exercise: null });
      try {
        post({
          request,
          lessonId: context.lessonId,
          previousScramble,
          withDemo,
          caseIds: [...context.caseIds],
          demoCaseId: context.demoCaseId,
        });
      } catch {
        failRequests(true, withDemo);
      }
    },
    /** Demonstration only; the current practice scramble is kept. */
    prepareDemo({ ready, failed }) {
      if (context.kind !== 'lesson') return;
      const request = ++sequence;
      demoRequest = request;
      demoCallbacks = { ready, failed };
      try {
        post({
          request,
          demoOnly: true,
          lessonId: context.lessonId,
          demoCaseId: context.demoCaseId,
        });
      } catch {
        failRequests(false, true);
      }
    },
  };
}
