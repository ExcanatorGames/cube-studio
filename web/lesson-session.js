import { getLesson, orientLessonCase } from './lessons.js';

export function createLessonSession({
  getSettings,
  createWorker = () =>
    new Worker('/lesson-scramble-worker.js', { type: 'module' }),
}) {
  let context = Object.freeze({ kind: 'normal' }),
    worker,
    generation = 0;
  const update = (values) => {
    context = Object.freeze({ ...context, ...values });
  };
  const lesson = () => {
    const selected = getLesson(context.lessonId);
    if (!selected || !context.scopeCaseIds) return selected;
    const cases = selected.cases.filter(item => context.scopeCaseIds.includes(item.id));
    return { ...selected, cases, case: cases[0] };
  };
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
      generation++;
      const selections = getSettings().lessonCaseSelections || {};
      const saved = selected.cases
        .filter((item) => {
          const ids = selections[id] ?? selections[item.sourceLessonId];
          return ids === undefined || ids.includes(item.id);
        })
        .map((item) => item.id);
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
      generation++;
      context = Object.freeze({ kind: 'normal' });
    },
    selectCases(ids) {
      const valid = lesson()
        ?.cases.filter((item) => ids.includes(item.id))
        .map((item) => item.id);
      if (!valid?.length) return false;
      generation++;
      update({ caseIds: valid });
      return true;
    },
    selectDemo(id) {
      if (
        !lesson()?.cases.some((item) => item.id === id) ||
        id === context.demoCaseId
      )
        return false;
      generation++;
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
    times(attempts) {
      return [...attempts]
        .filter(
          (s) =>
            !s.deleted &&
            context.caseIds?.includes(s.caseId) &&
            lesson()?.cases.some(item => item.id === s.caseId &&
              (item.sourceLessonId || context.lessonId) === s.lessonId &&
              item.completion === s.completion),
        )
        .sort(
          (a, b) =>
            Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id),
        );
    },
    prepare({ withDemo, ready, failed }) {
      if (context.kind !== 'lesson') return;
      const request = ++generation,
        previousScramble = context.exercise?.scramble;
      update({ exercise: null });
      const fail = () => {
        if (request !== generation || context.kind !== 'lesson') return;
        generation++;
        failed();
      };
      try {
        worker ||= createWorker();
        const activeWorker = worker;
        worker.onmessage = ({ data }) => {
          if (data.request !== generation || context.kind !== 'lesson') return;
          if (data.error) {
            fail();
            return;
          }
          update({
            exercise: Object.freeze({
              ...data.exercise,
              target: Object.freeze([...data.exercise.target]),
            }),
          });
          ready(data.demoExercise);
        };
        worker.onerror = () => {
          if (worker !== activeWorker) return;
          activeWorker.terminate();
          worker = null;
          fail();
        };
        worker.postMessage({
          request,
          lessonId: context.lessonId,
          previousScramble,
          withDemo,
          caseIds: [...context.caseIds],
          demoCaseId: context.demoCaseId,
        });
      } catch {
        fail();
      }
    },
  };
}
