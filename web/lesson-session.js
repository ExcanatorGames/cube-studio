import { LESSONS, orientLessonCase } from './lessons.js';

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
  const lesson = () => LESSONS.find((item) => item.id === context.lessonId);
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
    open(id) {
      const selected = LESSONS.find((item) => item.id === id);
      if (!selected) return false;
      generation++;
      const saved = selected.cases
        .filter((item) =>
          getSettings().lessonCaseSelections?.[id]?.includes(item.id),
        )
        .map((item) => item.id);
      context = Object.freeze({
        kind: 'lesson',
        lessonId: id,
        tab: 'lesson',
        exercise: null,
        assistance: false,
        demoCaseId: selected.case.id,
        caseIds: saved.length ? saved : selected.cases.map((item) => item.id),
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
            s.completion === lesson()?.case.completion &&
            s.lessonId === context.lessonId &&
            context.caseIds.includes(s.caseId),
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
