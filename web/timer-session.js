export function createTimerSession({
  now = () => performance.now(),
  wallNow = () => Date.now(),
  schedule = (fn, delay) => setTimeout(fn, delay),
  unschedule = (id) => clearTimeout(id),
} = {}) {
  let state = 'idle',
    started = 0,
    elapsed = 0,
    marks = [],
    attempt = null;
  let lastFinished = -Infinity,
    holdTimeout;
  const busy = () => ['arming', 'armed', 'running'].includes(state);
  const view = Object.freeze({
    get state() {
      return state;
    },
    get elapsed() {
      return state === 'running' ? now() - started : elapsed;
    },
    get splitMarks() {
      return marks;
    },
    get activeNames() {
      return attempt?.splitNames || [];
    },
    get activeAttempt() {
      return attempt;
    },
  });
  function reset() {
    unschedule(holdTimeout);
    state = 'idle';
    elapsed = 0;
    marks = [];
    attempt = null;
  }
  function disarm() {
    unschedule(holdTimeout);
    if (state !== 'arming' && state !== 'armed') return false;
    state = 'idle';
    return true;
  }
  function stop() {
    if (state !== 'running') return null;
    elapsed = Math.max(1, Math.round(now() - started));
    if (attempt.track)
      marks = [
        ...marks,
        { name: attempt.splitNames[marks.length], ms: elapsed },
      ];
    state = 'stopped';
    lastFinished = wallNow();
    return { ms: elapsed, splits: [...marks], attempt };
  }
  return {
    view,
    busy,
    reset,
    disarm,
    stop,
    arm(hold, ready) {
      if (busy() || wallNow() - lastFinished < 700) return false;
      reset();
      state = 'arming';
      holdTimeout = schedule(() => {
        if (state !== 'arming') return;
        state = 'armed';
        ready();
      }, hold);
      return true;
    },
    start(value) {
      if (state !== 'armed') return false;
      unschedule(holdTimeout);
      const copy = structuredClone(value);
      if (copy.exercise) {
        Object.freeze(copy.exercise.target);
        Object.freeze(copy.exercise);
      }
      attempt = Object.freeze({
        ...copy,
        splitNames: Object.freeze(copy.splitNames),
      });
      state = 'running';
      started = now();
      elapsed = 0;
      marks = [];
      return true;
    },
    mark() {
      if (state !== 'running') return null;
      if (!attempt.track && now() - started < 350) return null;
      if (!attempt.track || marks.length >= attempt.splitNames.length - 1)
        return { finished: stop() };
      marks = [
        ...marks,
        {
          name: attempt.splitNames[marks.length],
          ms: Math.round(now() - started),
        },
      ];
      return { split: true };
    },
    cancel() {
      if (state !== 'running') return disarm();
      reset();
      lastFinished = wallNow();
      return true;
    },
  };
}
