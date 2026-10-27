import { createScrambleLayout } from './scramble-layout.js';
import { initSettingsDialog } from './settings-dialog.js';
import { initHistoryDialogs } from './history-dialogs.js';
import {
  PRESETS,
  formatTime,
  result,
  practiceScramble,
  solveFeedback,
  normalizeSolve,
} from './core.js';
import { initPWA } from './pwa.js';
import { cubeSVG, cubeFrame, orientAlgorithm } from './cube.js';
import { initSolveFeedback, formatDifference } from './solve-feedback.js';
import { initConnection, syncHeaders } from './connect.js';
import { LESSONS, orientLessonCase } from './lessons.js';
import { createLessonDemo } from './lesson-view.js';
import { initMobileNavigation } from './mobile-navigation.js';
import { createMotion } from './motion.js';
import { $, $$, esc } from './dom.js';
import { createSolveViews } from './solve-views.js';
import { createSync } from './sync.js';
import { createLessonPresentation, lessonTabs } from './lesson-presentation.js';
import { createTimerSession } from './timer-session.js';
import { createLessonSession } from './lesson-session.js';
import { initTimerInput } from './timer-input.js';
import { createScrambler } from './scrambler.js';
import { createIndexedStorage } from './indexed-storage.js';
import { createCoordinatedStorage } from './coordinated-storage.js';
import { initStorageFeedback } from './storage-feedback.js';
const motion = createMotion();
const deviceStorage = createIndexedStorage();
const { snapshot: saved } = await deviceStorage.read();
let records = new Map(
    (saved.solves || []).map((s) => [s.id, normalizeSolve(s)]),
  ),
  pending = new Map(
    (saved.pending || []).map((s) => [s.id, normalizeSolve(s)]),
  );
let lessonAttempts = new Map(
  (saved.lessonAttempts || []).map((s) => [
    s.id,
    {
      ...normalizeSolve(s),
      lessonId: s.lessonId,
      caseId: s.caseId,
      completion: s.completion || 'full-cube',
    },
  ]),
);
let pendingLessons = new Map(
  (saved.lessonSyncVersion === 1
    ? saved.pendingLessons
    : saved.lessonAttempts
  ).map((s) => [s.id, normalizeSolve(s)]),
);
let settings = {
  preset: 'beginner',
  custom: ['Cross', 'First pair', 'Remaining F2L', 'Last layer'],
  hold: 550,
  track: false,
  orientation: 'white-top',
  lessonOrientation: 'white-bottom',
  ...saved.settings,
};
settings.orientation =
  settings.orientation === 'white-bottom' ? 'white-bottom' : 'white-top';
settings.lessonOrientation =
  settings.lessonOrientation === 'white-top' ? 'white-top' : 'white-bottom';
let page = 'timer',
  toastTimeout;
const syncService = createSync({
  getRecords: () => records,
  getPending: () => pending,
  getLessonAttempts: () => lessonAttempts,
  getPendingLessons: () => pendingLessons,
  persist,
  onChange: render,
  onStatus: renderSyncStatus,
  syncHeaders,
});
const sync = syncService.run;
const timer = createTimerSession(),
  timing = timer.view;
let scramble = '',
  scrambleKind = '',
  frame,
  wakeLock;
let lastSolveId = null,
  stepsHTML = '';
let scrambleRequest = 0;
// normalScramble retains the generator's white-top frame; scramble is the
// notation displayed and applied in the currently selected cube frame.
const lessonSession = createLessonSession({ getSettings: () => settings });
let normalScramble = null,
  lessonDemo = null;
const tracking = () =>
  timing.state === 'running'
    ? timing.activeAttempt.track
    : lessonSession.context.kind !== 'lesson' && settings.track;
const cubeOrientation = () =>
  lessonSession.context.kind === 'lesson'
    ? settings.lessonOrientation
    : settings.orientation;
const lessonExercise = () => lessonSession.exercise;
const timerVisible = () =>
  page === 'timer' ||
  (page === 'lessons' &&
    lessonSession.context.kind === 'lesson' &&
    lessonSession.context.tab === 'practice');
const all = () =>
  [...records.values()]
    .filter((s) => !s.deleted)
    .sort(
      (a, b) =>
        Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id),
    );
const names = () =>
  lessonSession.context.kind === 'lesson'
    ? []
    : settings.preset === 'custom'
      ? settings.custom
      : PRESETS[settings.preset];
function deviceSnapshot() {
  return {
    solves: [...records.values()],
    pending: [...pending.values()],
    lessonAttempts: [...lessonAttempts.values()],
    pendingLessons: [...pendingLessons.values()],
    lessonSyncVersion: 1,
    settings,
  };
}
const storageFeedback = initStorageFeedback({
  store: deviceStorage,
  getSnapshot: deviceSnapshot,
  retry: retryStorage,
  busy: () => busy(),
  notify: toast,
});
let orientationChanged = false;
const coordinatedStorage = createCoordinatedStorage({
  store: deviceStorage,
  initial: saved,
  locks: navigator.locks,
  getSnapshot: deviceSnapshot,
  apply(snapshot) {
    records = new Map(snapshot.solves.map((s) => [s.id, s]));
    pending = new Map(snapshot.pending.map((s) => [s.id, s]));
    lessonAttempts = new Map(snapshot.lessonAttempts.map((s) => [s.id, s]));
    pendingLessons = new Map(snapshot.pendingLessons.map((s) => [s.id, s]));
    orientationChanged ||=
      settings.orientation !== snapshot.settings.orientation ||
      settings.lessonOrientation !== snapshot.settings.lessonOrientation;
    settings = snapshot.settings;
  },
  onChange() {
    storageFeedback.render();
    renderSyncStatus();
    if (!busy()) {
      if (orientationChanged) {
        orientationChanged = false;
        refreshOrientation();
      }
      render();
    }
  },
});
function persist() {
  return coordinatedStorage.save();
}
function retryStorage() {
  persist();
  sync();
}
window.addEventListener('storage', (event) => {
  if (event.key === 'cube-studio-v1' && !busy()) persist();
});
const storageChannel =
  typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('cube-studio-history')
    : null;
deviceStorage.broadcast = () => storageChannel?.postMessage('changed');
if (storageChannel)
  storageChannel.onmessage = () => {
    if (!busy()) persist();
  };
window.addEventListener('focus', () => {
  if (!busy()) persist();
});
window.addEventListener('beforeunload', (event) => {
  if (coordinatedStorage.busy || !deviceStorage.getState().persisted) {
    event.preventDefault();
    event.returnValue = '';
  }
});
function toast(message, undo) {
  clearTimeout(toastTimeout);
  const t = $('#toast');
  t.replaceChildren(document.createTextNode(message));
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.onclick = () => {
      undo();
      t.hidden = true;
    };
    t.append(b);
  }
  t.hidden = false;
  toastTimeout = setTimeout(() => (t.hidden = true), undo ? 12000 : 5500);
}
function renderSyncStatus() {
  const syncState = syncService.state;
  const pendingCount = pending.size + pendingLessons.size;
  const messages = {
    healthy: pendingCount ? `${pendingCount} waiting to sync` : '',
    offline: pendingCount ? `${pendingCount} saved offline` : 'Offline',
    auth: pendingCount
      ? `${pendingCount} saved · connect to sync`
      : 'Not connected',
    setup: 'Cloud sync setup needed',
    error: pendingCount
      ? `${pendingCount} saved on device · sync failed`
      : 'Sync failed',
  };
  const text = deviceStorage.getState().persisted
    ? messages[syncState]
    : 'Device data not saved';
  $('#mobile-sync').textContent = text;
  $('#mobile-sync').hidden = !text;
  $('#connect-sync').hidden = syncState !== 'auth';
  $('#sync-mobile').hidden = syncState === 'healthy' || syncState === 'auth';
  $('#sync-mobile').disabled = syncService.busy;
  $('#sync-attention').hidden = !text;
}
function updateSolve(s) {
  s = normalizeSolve({
    ...s,
    updatedAt: Math.max(Date.now(), (records.get(s.id)?.updatedAt || 0) + 1),
  });
  records.set(s.id, s);
  pending.set(s.id, s);
  persist();
  render();
  sync();
  return s;
}
function saveAttempt(s, attempt) {
  if (attempt.context !== 'lesson') return updateSolve(s);
  const exercise = attempt.exercise;
  const practice = {
    ...s,
    lessonId: exercise.lessonId,
    caseId: exercise.caseId,
    completion: exercise.completion,
  };
  lessonAttempts.set(s.id, practice);
  pendingLessons.set(s.id, practice);
  persist();
  render();
  sync();
  return practice;
}
function practiceTimes() {
  return lessonSession.times(lessonAttempts.values());
}
function renderHeader() {
  const context =
    page === 'lessons' && lessonSession.context.kind === 'lesson'
      ? 'lesson'
      : page;
  $$('[data-header-context]').forEach(
    (group) => (group.hidden = group.dataset.headerContext !== context),
  );
}
function setPage(p) {
  if (busy() || (p === page && lessonSession.context.kind !== 'lesson')) return;
  const previous = page;
  page = p;
  focusView(false, { immediate: true });
  $('#page-title').textContent = {
    timer: 'Timer',
    history: 'Solves',
    insights: 'Analysis',
    lessons: 'Lessons',
  }[p];
  // Selection is immediate and stays outside the moving page snapshots.
  $$('.sidebar [data-page]').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === p);
    if (b.dataset.page === p) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const order = $$('.sidebar nav [data-page]').map((b) => b.dataset.page),
    direction = order.indexOf(p) > order.indexOf(previous) ? 1 : -1;
  const animated = motion.swap(
    'page',
    () => {
      lessonDemo?.destroy();
      lessonDemo = null;
      if (lessonSession.context.kind === 'lesson') leaveLesson();
      $$('.page').forEach((el) => (el.hidden = el.id !== p + '-page'));
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
      // A long Insights snapshot must stay inside the space above the phone navigation.
      const nav = $('.sidebar').getBoundingClientRect(),
        mobile = nav.top > 0 && nav.width > nav.height;
      const root = document.documentElement.style;
      root.setProperty(
        '--page-clip-top',
        Math.max(0, $('.app-bar').getBoundingClientRect().bottom) + 'px',
      );
      root.setProperty('--page-clip-left', (mobile ? 0 : nav.right) + 'px');
      root.setProperty(
        '--page-clip-bottom',
        (mobile ? innerHeight - nav.top : 0) + 'px',
      );
    },
    { direction },
  );
  if (!animated)
    motion.play(
      $('#' + p + '-page'),
      [{ translate: `${direction * innerWidth}px 0` }, { translate: '0 0' }],
      { duration: 260 },
    );
}
$$('[data-page]').forEach((b) => (b.onclick = () => setPage(b.dataset.page)));
$('.brand').onclick = (e) => {
  e.preventDefault();
  setPage('timer');
};
const lessonPresentation = createLessonPresentation();
lessonPresentation.renderCards();
function renderLessonTabs() {
  lessonPresentation.renderTabs(lessonSession.context, busy());
}
function renderLessonCases() {
  lessonPresentation.renderCases(currentLesson(), lessonSession.context);
}
function renderLessonAssistance() {
  lessonPresentation.renderAssistance(
    lessonSession.context,
    lessonExercise(),
    busy(),
  );
}
$('#lesson-cards').onclick = (e) => {
  const button = e.target.closest('[data-lesson]');
  if (button) openLesson(button.dataset.lesson);
};
$('#lesson-back').onclick = () => setPage('lessons');
for (const tab of lessonTabs) {
  const button = $('#lesson-tab-' + tab);
  button.onclick = () => setLessonTab(tab);
  button.onkeydown = (event) => {
    if (busy()) return;
    const index = lessonTabs.indexOf(tab);
    const next = {
      ArrowRight: lessonTabs[(index + 1) % lessonTabs.length],
      ArrowLeft:
        lessonTabs[(index + lessonTabs.length - 1) % lessonTabs.length],
      Home: 'lesson',
      End: 'practice',
    }[event.key];
    if (!next) return;
    event.preventDefault();
    setLessonTab(next);
    $('#lesson-tab-' + next).focus();
  };
}
function setLessonTab(tab) {
  if (
    busy() ||
    lessonSession.context.kind !== 'lesson' ||
    !lessonTabs.includes(tab) ||
    lessonSession.context.tab === tab
  )
    return;
  lessonDemo?.reset();
  timerInput.reset();
  lessonSession.setTab(tab);
  renderLessonTabs();
  updateTimerHeight();
  layoutScramble();
  requestAnimationFrame(() => feedbackView.fit());
}
function resetTimerContext() {
  timerInput.reset();
  timer.reset();
  lastSolveId = null;
  $('#clock').textContent = '0.00';
}
function currentLesson() {
  return lessonSession.lesson;
}
function exerciseCase() {
  return lessonSession.exerciseCase;
}
function setPracticeCases(caseIds) {
  if (busy() || lessonSession.context.kind !== 'lesson') return;
  if (!lessonSession.selectCases(caseIds)) {
    renderLessonCases();
    toast('Keep at least one practice case selected.');
    return;
  }
  settings.lessonCaseSelections = {
    ...settings.lessonCaseSelections,
    [lessonSession.context.lessonId]: lessonSession.context.caseIds,
  };
  persist();
  resetTimerContext();
  renderLessonCases();
  newScramble();
  timerVisual();
  renderSteps();
}
$('#lesson-practice-case-list').onclick = (e) => {
  if (busy() || lessonSession.context.kind !== 'lesson') return;
  const id = e.target.closest('[data-practice-case]')?.dataset.practiceCase;
  if (!currentLesson().cases.some((item) => item.id === id)) return;
  setPracticeCases(
    lessonSession.context.caseIds.includes(id)
      ? lessonSession.context.caseIds.filter((item) => item !== id)
      : [...lessonSession.context.caseIds, id],
  );
};
$('#lesson-case-list').onclick = (e) => {
  if (busy() || lessonSession.context.kind !== 'lesson') return;
  const id = e.target.closest('[data-lesson-case]')?.dataset.lessonCase;
  if (!currentLesson().cases.some((item) => item.id === id)) return;
  $('#lesson-case-dropdown').open = false;
  $('#lesson-case-dropdown summary').focus();
  if (!lessonSession.selectDemo(id)) return;
  lessonDemo?.destroy();
  lessonDemo = null;
  $('#lesson-demo').innerHTML = '<p role="status">Preparing scramble…</p>';
  renderLessonCases();
  newScramble();
};
function fitLessonCaseDropdown() {
  const menu = $('#lesson-case-dropdown');
  if (menu.open)
    menu.style.setProperty(
      '--case-menu-height',
      Math.max(
        80,
        $('#lesson-panel-lesson').getBoundingClientRect().bottom -
          menu.getBoundingClientRect().bottom -
          12,
      ) + 'px',
    );
}
$('#lesson-case-dropdown').ontoggle = fitLessonCaseDropdown;
$('#lesson-case-dropdown').onkeydown = (e) => {
  if (e.key === 'Escape') {
    $('#lesson-case-dropdown').open = false;
    $('#lesson-case-dropdown summary').focus();
  }
};
addEventListener('resize', fitLessonCaseDropdown);
function openLesson(id) {
  if (busy()) return;
  if (!lessonSession.open(id)) return;
  const lesson = currentLesson();
  ++scrambleRequest;
  resetTimerContext();
  $('#lesson-list').hidden = true;
  $('#lesson-detail').hidden = false;
  $('#lesson-title').textContent = lesson.title;
  $('#lesson-case-dropdown').open = false;
  renderLessonCases();
  renderHeader();
  $('#lesson-practice-mount').append($('#timer-card'));
  lessonDemo?.destroy();
  lessonDemo = null;
  $('#lesson-demo').innerHTML = '<p role="status">Preparing scramble…</p>';
  newScramble();
  timerVisual();
  updateTimerHeight();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function leaveLesson() {
  ++scrambleRequest;
  resetTimerContext();
  lessonSession.leave();
  $('#timer-page').prepend($('#timer-card'));
  $('#lesson-detail').hidden = true;
  $('#lesson-list').hidden = false;
  renderHeader();
  if (normalScramble) {
    scramble = orientAlgorithm(
      normalScramble.scramble,
      'white-top',
      settings.orientation,
    );
    scrambleKind = normalScramble.kind;
    showScramble();
  } else newScramble();
  timerVisual();
}
$('#lesson-help').onclick = () => {
  if (
    busy() ||
    lessonSession.context.kind !== 'lesson' ||
    !lessonSession.context.exercise
  )
    return;
  lessonSession.toggleHints();
  if (!lessonSession.context.assistance) lessonDemo?.reset();
  renderLessonAssistance();
  showScramble({ animate: false });
  $('#lesson-help').blur();
};
function render() {
  renderHeader();
  renderSteps();
  renderRecent();
  if (page === 'history') renderHistory();
  if (page === 'insights') renderInsights();
  updateTimerHeight();
}
function renderSteps() {
  const lesson = lessonSession.context.kind === 'lesson';
  const currentSolve =
    timing.state === 'stopped' && lastSolveId
      ? (lesson ? lessonAttempts : records).get(lastSolveId)
      : null;
  const feedback = currentSolve
    ? solveFeedback(lesson ? practiceTimes() : all(), currentSolve)
    : null;
  feedbackView.render(feedback);
  if (currentSolve && !currentSolve.deleted)
    $('#clock').textContent = formatTime(result(currentSolve));
  const labels =
    timing.state === 'running' ||
    (timing.state === 'stopped' && timing.splitMarks.length)
      ? timing.activeNames
      : names();
  const current =
    timing.state === 'running' && tracking() ? timing.splitMarks.length : -1;
  const html = labels
    .map((name, i) => {
      const detail =
        i < timing.splitMarks.length && feedback?.splits[i]?.name === name
          ? feedback.splits[i]
          : null;
      const delta = detail?.delta ?? null,
        tone = detail?.tone ? ' solve-' + detail.tone : '';
      const comparison =
        delta === null
          ? ''
          : `${formatDifference(delta)} versus the median of ${detail.count} previous matching split solves`;
      return `<div role="listitem" style="--focus-part:focus-split-${i};--focus-number:focus-number-${i};--focus-label:focus-label-${i};--focus-value:focus-value-${i}" class="split-row ${i < timing.splitMarks.length ? 'done' : ''} ${i === current ? 'current' : ''}" ${i === current ? 'aria-current="step"' : ''} ${detail ? `aria-label="${esc(name)}, ${formatTime(detail.ms)}${comparison ? ', ' + esc(comparison) : ''}${detail.isPB ? ', personal best' : ''}"` : ''}><span class="split-number${detail?.isPB ? ' solve-gold' : ''}" aria-hidden="true">${detail?.isPB ? '★' : i < timing.splitMarks.length ? '✓' : i + 1}</span><span class="split-name">${esc(name)}</span><span class="split-value${tone}${delta !== null ? ' has-difference' : ''}">${timing.splitMarks[i] ? formatTime(timing.splitMarks[i].ms - (timing.splitMarks[i - 1]?.ms || 0)) : i === current ? formatTime(Math.max(0, timing.elapsed - (timing.splitMarks[i - 1]?.ms || 0))) : '—'}${delta !== null ? `<span class="split-difference${detail?.isPB ? ' solve-gold' : delta < 0 ? ' solve-good' : ''}" title="${esc(comparison)}">${formatDifference(delta)}</span>` : ''}</span></div>`;
    })
    .join('');
  if (html !== stepsHTML) {
    $('#fullscreen-splits').innerHTML = html;
    stepsHTML = html;
  }
  $('#fullscreen-splits').hidden = !tracking();
  $('#timer-card').classList.toggle('with-splits', tracking());
  $('#fullscreen-splits .current')?.scrollIntoView({ block: 'nearest' });
  $('#fullscreen-track').setAttribute('aria-pressed', String(tracking()));
  $('#fullscreen-track').hidden = lesson;
  $('#fullscreen-track').innerHTML =
    `<span aria-hidden="true">${tracking() ? '✓' : '✕'}</span> Splits`;
  $('#fullscreen-track').disabled = ['running', 'arming', 'armed'].includes(
    timing.state,
  );
  const bottom = cubeOrientation() === 'white-bottom';
  $('#cube-orientation').textContent = bottom ? 'White ↓' : 'White ↑';
  $('#cube-orientation').title =
    `Scramble with ${cubeFrame(cubeOrientation()).label}. Switch to white on ${bottom ? 'top' : 'bottom'}.`;
  $('#cube-orientation').setAttribute(
    'aria-label',
    `White on ${bottom ? 'bottom' : 'top'}. Switch to white on ${bottom ? 'top' : 'bottom'}.`,
  );
  $('#cube-orientation').disabled =
    ['running', 'arming', 'armed'].includes(timing.state) || !scramble;
}
function timerVisual() {
  if (!busy() && orientationChanged) {
    orientationChanged = false;
    refreshOrientation();
  }
  const c = $('#timer-card');
  c.classList.remove('arming', 'armed', 'running');
  if (busy()) c.classList.add(timing.state);
  const hint =
    timing.state === 'running' && tracking()
      ? timing.activeNames[timing.splitMarks.length]
      : '';
  $('#timer-hint').textContent = hint;
  $('#timer-hint').hidden = !hint;
  $('#timer-instruction').innerHTML =
    timing.state === 'armed'
      ? '<span>Release</span>'
      : timing.state === 'arming'
        ? '<span>Hold…</span>'
        : timing.state === 'running'
          ? `<kbd>space</kbd><span>${tracking() ? 'Split' : 'Stop'}</span>`
          : '<kbd>space</kbd><span>Hold · release</span>';
  $('#touch-instruction').textContent =
    timing.state === 'armed'
      ? 'Release'
      : timing.state === 'arming'
        ? 'Hold…'
        : timing.state === 'running'
          ? tracking()
            ? 'Tap to split'
            : 'Tap to stop'
          : 'Two fingers · hold · release';
  const preparing =
    lessonSession.context.kind === 'lesson' && !lessonSession.context.exercise;
  $('#new-scramble').disabled = busy() || preparing;
  $('#manual-entry').disabled = busy() || preparing;
  $$('[data-page],#lesson-back,.brand').forEach((el) => {
    if (el.tagName === 'BUTTON') el.disabled = busy();
    else el.setAttribute('aria-disabled', String(busy()));
  });
  document.body.classList.toggle(
    'lesson-busy',
    lessonSession.context.kind === 'lesson' && busy(),
  );
  $('#lesson-case-picker').disabled = busy();
  $('#lesson-practice-cases').disabled = busy();
  renderLessonTabs();
  renderLessonAssistance();
  renderSteps();
}
function arm() {
  if (!timerVisible() || !scramble) return;
  if (
    !timer.arm(settings.hold, () => {
      timerVisual();
      navigator.vibrate?.(20);
    })
  )
    return;
  motion.clear();
  lastSolveId = null;
  lessonDemo?.reset();
  $('#clock').textContent = '0.00';
  timerVisual();
}
function disarm() {
  if (timer.disarm()) timerVisual();
}
async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {}
}
function snapshotAttempt() {
  const lesson =
    lessonSession.context.kind === 'lesson'
      ? LESSONS.find((item) => item.id === lessonSession.context.lessonId)
      : null;
  return Object.freeze({
    scramble,
    context: lessonSession.context.kind,
    exercise: lesson ? lessonSession.context.exercise : null,
    note: lesson
      ? `${lesson.title} · ${exerciseCase()?.title || ''} · Pair inserted`
      : '',
    track: tracking(),
    splitNames: Object.freeze([...names()]),
  });
}
function start() {
  if (!timer.start(snapshotAttempt())) return;
  lessonDemo?.reset();
  automaticFocus = !document.body.classList.contains('focus-mode');
  focusView(true);
  timerVisual();
  keepAwake();
  frame = requestAnimationFrame(tick);
}
function tick() {
  if (timing.state !== 'running') return;
  $('#clock').textContent = formatTime(timing.elapsed);
  const activeSplit = $('#fullscreen-splits .current .split-value');
  if (activeSplit)
    activeSplit.textContent = formatTime(
      Math.max(0, timing.elapsed - (timing.splitMarks.at(-1)?.ms || 0)),
    );
  frame = requestAnimationFrame(tick);
}
function makeSolve(ms, splits = [], manual = false) {
  const attempt = manual ? snapshotAttempt() : timing.activeAttempt;
  return normalizeSolve({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    ms: Math.max(1, Math.round(ms)),
    penalty: 'none',
    scramble: attempt.scramble,
    splits,
    source: manual ? 'manual' : 'timer',
    note: attempt.note,
    updatedAt: Date.now(),
  });
}
function stop() {
  finishAttempt(timer.stop());
}
function finishAttempt(finished) {
  if (!finished) return;
  cancelAnimationFrame(frame);
  $('#clock').textContent = formatTime(finished.ms);
  const solve = makeSolve(finished.ms, finished.splits);
  lastSolveId = solve.id;
  saveAttempt(solve, finished.attempt);
  wakeLock?.release();
  automaticFocus = false;
  timerVisual();
  animateResult();
  newScramble();
}
function mark() {
  const result = timer.mark();
  if (result?.finished) finishAttempt(result.finished);
  else if (result?.split) {
    navigator.vibrate?.(10);
    timerVisual();
    motion.reveal($('#fullscreen-splits .current'), {
      distance: 3,
      duration: 150,
    });
  }
}
function animateResult() {
  motion.reveal($('.timer-readout'), { distance: 4 });
  $$('#fullscreen-splits .split-row').forEach((row, i) =>
    motion.reveal(row, { delay: i * 18, distance: 4 }),
  );
  motion.reveal($('.timer-recent .recent-solve'), { distance: 4 });
  requestAnimationFrame(() => {
    if (timing.state !== 'stopped') return;
    feedbackView.fit();
    motion.reveal($('#solve-feedback'), { delay: 50, distance: 4 });
    motion.reveal($('#solve-ranking'), {
      delay: 80,
      distance: 4,
      duration: 260,
    });
    $$('#ranking-squares span').forEach((square, i) =>
      motion.play(
        square,
        [
          { opacity: 0.2, scale: '1 .5' },
          { opacity: 1, scale: '1 1' },
        ],
        { delay: 80 + i * 3, duration: 200 },
      ),
    );
  });
}
function cancel() {
  if (automaticFocus) {
    focusView(false);
    automaticFocus = false;
  }
  const running = timing.state === 'running';
  if (!timer.cancel()) return;
  if (running) {
    cancelAnimationFrame(frame);
    wakeLock?.release();
    $('#clock').textContent = '0.00';
    toast('Cancelled.');
  }
  timerVisual();
}
const timerInput = initTimerInput({
  pad: $('#timer-pad'),
  getState: () => timing.state,
  timerVisible,
  arm,
  disarm,
  start,
  mark,
  escape: () => {
    cancel();
    focusView(false);
  },
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (timing.state === 'running') keepAwake();
    if (Date.now() - syncService.lastSuccess > 20000) sync();
  } else disarm();
});
function setTracking(enabled) {
  if (busy() || lessonSession.context.kind === 'lesson') return;
  motion.layout([$('.timer-center')], () => {
    settings.track = enabled;
    persist();
    timer.reset();
    timerVisual();
  });
  if (enabled) motion.reveal($('#fullscreen-splits'), { distance: 5 });
}
$('#fullscreen-track').onclick = () => {
  setTracking(!tracking());
  $('#fullscreen-track').blur();
};
function refreshOrientation() {
  if (lessonSession.context.kind === 'lesson') {
    const exercise = lessonExercise();
    if (exercise) {
      scramble = exercise.scramble;
      scrambleKind = `${exerciseCase()?.title} · White on ${settings.lessonOrientation === 'white-top' ? 'top' : 'bottom'}`;
    }
    lessonDemo?.setOrientation(settings.lessonOrientation);
    renderLessonAssistance();
  } else if (normalScramble) {
    scramble = orientAlgorithm(
      normalScramble.scramble,
      'white-top',
      settings.orientation,
    );
  }
  if (scramble) showScramble({ animate: false });
  renderSteps();
}
$('#cube-orientation').onclick = () => {
  if (busy() || !scramble) return;
  const key =
    lessonSession.context.kind === 'lesson'
      ? 'lessonOrientation'
      : 'orientation';
  settings[key] =
    cubeOrientation() === 'white-top' ? 'white-bottom' : 'white-top';
  persist();
  refreshOrientation();
  $('#cube-orientation').blur();
};
let automaticFocus = false,
  focusRequested = document.body.classList.contains('focus-mode');
function focusView(enabled, { immediate = false } = {}) {
  if (
    enabled === focusRequested &&
    enabled === document.body.classList.contains('focus-mode')
  )
    return;
  focusRequested = enabled;
  const title = $('#fullscreen-lesson-title'),
    before =
      lessonSession.context.kind === 'lesson'
        ? title.getBoundingClientRect()
        : null;
  // Fill the app viewport without invoking the browser's fullscreen notice.
  const animated = motion.swap(
    'focus',
    () => {
      // Capture the current painted positions before settling entrance animations.
      motion.settle();
      document.body.classList.toggle('focus-mode', enabled);
      title.setAttribute('aria-hidden', String(!enabled));
      if (enabled) lessonDemo?.reset();
      $('#focus').setAttribute('aria-pressed', String(enabled));
      $('#focus').title = enabled ? 'Exit fullscreen' : 'Fullscreen';
      updateTimerHeight();
      layoutScramble();
      requestAnimationFrame(() => feedbackView.fit());
    },
    {
      immediate:
        immediate || ['running', 'arming', 'armed'].includes(timing.state),
    },
  );
  if (!animated && before) {
    const after = title.getBoundingClientRect();
    motion.play(
      title,
      [
        {
          translate: `${before.left - after.left}px ${before.top - after.top}px`,
        },
        { translate: '0 0' },
      ],
      { duration: 320 },
    );
  }
}
$('#focus').onclick = () => {
  automaticFocus = false;
  focusView(!focusRequested);
  $('#focus').blur();
};
function updateTimerHeight() {
  if (document.body.classList.contains('focus-mode')) return;
  const bottomNavigation =
    matchMedia('(max-width:740px)').matches &&
    !matchMedia(
      '(orientation:landscape) and (max-height:500px) and (max-width:1100px)',
    ).matches;
  const navigation = bottomNavigation
    ? $('.sidebar').getBoundingClientRect().height
    : 0;
  if (page === 'lessons' && lessonSession.context.kind === 'lesson') {
    const detail = $('#lesson-detail');
    document.body.style.setProperty(
      '--lesson-navigation-height',
      navigation + 'px',
    );
    detail.style.setProperty(
      '--lesson-available-height',
      Math.max(
        0,
        innerHeight -
          detail.getBoundingClientRect().top -
          scrollY -
          navigation -
          12,
      ) + 'px',
    );
    return;
  }
  if (page === 'history') {
    const history = $('#history-page');
    history.style.setProperty(
      '--history-available-height',
      Math.max(
        0,
        innerHeight -
          history.getBoundingClientRect().top -
          scrollY -
          navigation -
          12,
      ) + 'px',
    );
    return;
  }
  if (!timerVisible()) return;
  const card = $('#timer-card');
  const available =
    Math.max(
      0,
      innerHeight -
        card.getBoundingClientRect().top -
        scrollY -
        navigation -
        12,
    ) + 'px';
  card.style.setProperty('--timer-available-height', available);
  $('#timer-page').style.setProperty('--timer-available-height', available);
}
const chromeObserver = new ResizeObserver(() =>
  requestAnimationFrame(updateTimerHeight),
);
[$('.app-bar'), $('.sidebar')].forEach((el) => chromeObserver.observe(el));
addEventListener('resize', updateTimerHeight);
let officialScrambler = createScrambler();
$('#lesson-demo').onclick = (e) => {
  if (e.target.closest('[data-lesson-retry]')) newScramble();
};
function requestLessonScramble() {
  lessonSession.prepare({
    withDemo: !lessonDemo,
    failed() {
      scramble = '';
      scrambleKind = 'Scramble unavailable';
      $('#fullscreen-scramble').textContent = 'Could not prepare a scramble.';
      $('#scramble-type').textContent = scrambleKind;
      $('#new-scramble').disabled = false;
      if (!lessonDemo)
        $('#lesson-demo').innerHTML =
          '<p role="status">Could not prepare a scramble.</p><button type="button" class="small-button" data-lesson-retry>Try again</button>';
    },
    ready(demoExercise) {
      scramble = lessonExercise().scramble;
      scrambleKind = `${exerciseCase()?.title} · White on ${settings.lessonOrientation === 'white-top' ? 'top' : 'bottom'}`;
      if (!lessonDemo) {
        const lesson = currentLesson();
        const selected = lesson.cases.find(
          (item) => item.id === lessonSession.context.demoCaseId,
        );
        lessonDemo = createLessonDemo($('#lesson-demo'), {
          ...lesson,
          case: orientLessonCase(
            { ...selected, ...demoExercise },
            settings.lessonOrientation,
          ),
        });
      }
      showScramble();
      renderLessonAssistance();
      renderSteps();
      $('#new-scramble').disabled = false;
      $('#manual-entry').disabled = busy();
    },
  });
}
async function newScramble() {
  if (busy()) return;
  $('#cube-orientation').disabled = true;
  const req = ++scrambleRequest;
  if (lessonSession.context.kind === 'lesson') {
    scramble = '';
    $('#fullscreen-scramble').textContent = 'Preparing scramble…';
    $('#cube-preview').replaceChildren();
    $('#scramble-type').textContent = 'Preparing…';
    $('#new-scramble').disabled = true;
    $('#manual-entry').disabled = true;
    requestLessonScramble();
    renderLessonAssistance();
    return;
  }
  normalScramble = null;
  $('#new-scramble').disabled = true;
  scramble = '';
  $('#fullscreen-scramble').textContent = '…';
  $('#cube-preview').replaceChildren();
  $('#scramble-type').textContent = 'Preparing…';
  try {
    const alg = await officialScrambler.next();
    if (req !== scrambleRequest) return;
    scramble = alg.toString();
    scrambleKind = 'Random state';
  } catch {
    if (req !== scrambleRequest) return;
    scramble = practiceScramble();
    scrambleKind = '25-move practice';
  } finally {
    if (req === scrambleRequest) {
      normalScramble = { scramble, kind: scrambleKind };
      scramble = orientAlgorithm(
        normalScramble.scramble,
        'white-top',
        settings.orientation,
      );
      showScramble();
      if (!busy()) $('#new-scramble').disabled = false;
    }
  }
}
const layoutScramble = createScrambleLayout(() => scramble);
function showScramble({ animate = true } = {}) {
  layoutScramble();
  const instruction = `Scramble with ${cubeFrame(cubeOrientation()).label}. Moves follow the cube's U, F and R faces.`;
  $('#fullscreen-scramble').title = instruction;
  $('#fullscreen-scramble').setAttribute('aria-label', instruction);
  $('#cube-orientation').disabled = busy() || !scramble;
  $('#scramble-type').textContent = scrambleKind;
  $('#scramble-type').classList.toggle(
    'sr-only',
    scrambleKind === 'Random state',
  );
  try {
    const exercise =
      lessonSession.context.kind === 'lesson' ? lessonExercise() : null;
    $('#cube-preview').innerHTML = cubeSVG(
      exercise ? exercise.setup : scramble,
      {
        orientation: cubeOrientation(),
        target:
          exercise && lessonSession.context.assistance ? exercise.target : [],
      },
    );
  } catch {
    $('#cube-preview').replaceChildren();
  }
  if (animate && timing.state !== 'running') {
    motion.reveal($('#fullscreen-scramble'), { distance: 4 });
    motion.reveal($('#cube-preview'), {
      delay: 35,
      distance: 5,
      duration: 260,
    });
  }
}
$('#new-scramble').onclick = () => newScramble();
function openDialog(id) {
  if (
    timing.state === 'running' ||
    timing.state === 'arming' ||
    timing.state === 'armed'
  )
    return;
  $(id).showModal();
}
initSettingsDialog({
  getSettings: () => settings,
  busy: () => busy(),
  openDialog,
  toast,
  save(next) {
    settings = next;
    timer.reset();
    persist();
    refreshOrientation();
  },
});
const { openSolve } = initHistoryDialogs({
  getRecords: () => records,
  getLessons: () => lessonAttempts,
  busy: () => busy(),
  openDialog,
  toast,
  updateSolve,
  allowManual: () => lessonSession.context.kind !== 'lesson',
  addManual: (ms) => saveAttempt(makeSolve(ms, [], true), snapshotAttempt()),
  importRecords(imported) {
    let count = 0;
    for (const solve of imported) {
      if (records.has(solve.id) || lessonAttempts.has(solve.id)) continue;
      (solve.lessonId ? lessonAttempts : records).set(solve.id, solve);
      (solve.lessonId ? pendingLessons : pending).set(solve.id, solve);
      count++;
    }
    persist();
    render();
    sync();
    return count;
  },
});
$('#sync-mobile').onclick = () => {
  sync();
};
window.addEventListener('online', sync);
window.addEventListener('offline', () => syncService.offline());
setInterval(() => {
  if (!document.hidden && timing.state !== 'running') sync();
}, 60000);
const busy = () => timer.busy();
initMobileNavigation({
  pages: $$('.sidebar nav [data-page]').map((button) => button.dataset.page),
  getPage: () => page,
  navigate: setPage,
  blocked: () =>
    busy() ||
    document.body.classList.contains('focus-mode') ||
    $$('dialog').some((dialog) => dialog.open),
});
const { renderRecent, renderHistory, renderInsights } = createSolveViews({
  getSolves: all,
  getPage: () => page,
  getCustomSteps: () => settings.custom,
  motion,
  openSolve,
});
const feedbackView = initSolveFeedback();
render();
timerVisual();
newScramble();
initConnection({ busy, sync, notify: toast });
storageFeedback.render();
sync();
initPWA({ busy: () => busy() || coordinatedStorage.busy, notify: toast });
