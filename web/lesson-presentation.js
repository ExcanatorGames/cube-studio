import { LESSON_CATALOG, getLesson } from './lessons.js';
import { lessonCubeSVG } from './lesson-cube.js';
import { $, esc } from './dom.js';

export const lessonTabs = ['lesson', 'practice'];
export const practiceOptions = LESSON_CATALOG.flatMap(lesson =>
  [...new Set(lesson.cases.map(item => item.group))].map((group, index) => ({
    id: `${lesson.id}-${index}`,
    title: group,
    fullTitle: `${lesson.title} · ${group}`,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    cases: lesson.cases.filter(item => item.group === group),
  })),
);

export function initPracticeSelection({ root, onHold, view = window }) {
  let pending = null, suppressClick = null;
  function cancel() {
    if (pending) view.clearTimeout(pending.timer);
    pending = null;
  }
  root.addEventListener('pointerdown', event => {
    cancel();
    suppressClick = null;
    if (event.isPrimary === false || event.button !== 0) return;
    const button = event.target.closest('[data-practice-open]');
    if (!button) return;
    const press = { button, id: event.pointerId, x: event.clientX, y: event.clientY };
    press.timer = view.setTimeout(() => {
      if (pending !== press) return;
      pending = null;
      suppressClick = button;
      onHold(button.dataset.practiceOpen);
    }, 500);
    pending = press;
  });
  root.addEventListener('pointermove', event => {
    if (pending && event.pointerId === pending.id &&
      Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10) cancel();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(type, cancel);
  view.addEventListener('blur', cancel);
  view.addEventListener('scroll', cancel, true);
  root.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0 && suppressClick === event.target.closest('[data-practice-open]')) {
      suppressClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener('contextmenu', event => {
    if (event.target.closest('[data-practice-open]')) event.preventDefault();
  });
  root.addEventListener('keydown', event => {
    const button = event.target.closest('[data-practice-open]');
    if (button && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
      event.preventDefault();
      cancel();
      onHold(button.dataset.practiceOpen);
    }
  });
  return { cancel };
}

export function createLessonPresentation() {
  const lessonCasePreviews = new Map();
  function casePreview(item) {
    if (!lessonCasePreviews.has(item.id))
      lessonCasePreviews.set(item.id, lessonCubeSVG(item.setup, item));
    return lessonCasePreviews.get(item.id);
  }
  function casePreviews(cases) {
    return `<span class="catalog-case-previews" style="--case-count:${cases.length}" aria-hidden="true">${cases.map(item => `<span class="catalog-case-preview" title="${esc(item.title)}">${casePreview(item)}</span>`).join('')}</span>`;
  }
  let practiceCardsRendered = false;
  function renderPracticeCards(caseIds, selecting = false) {
    const selected = new Set(caseIds);
    $('#practice-cards').classList.toggle('practice-selecting', selecting);
    if (!practiceCardsRendered) $('#practice-cards').innerHTML = LESSON_CATALOG.map(lesson => `
      <section class="practice-catalog-section" aria-label="${esc(lesson.title)} practices">
        ${practiceOptions.filter(option => option.lessonId === lesson.id).map(option => {
          const checked = option.cases.every(item => selected.has(item.id));
          return `<article class="lesson-card practice-card">
            <label class="practice-select" data-practice-selection-control="${option.id}" hidden><input type="checkbox" data-practice-select="${option.id}" aria-label="Include ${esc(option.fullTitle)}" ${checked ? 'checked' : ''}></label>
            <button type="button" class="practice-card-open" data-practice-open="${option.id}" aria-label="Practice ${esc(option.fullTitle)}" aria-keyshortcuts="Shift+F10">
              <span class="lesson-card-copy"><strong>${esc(option.fullTitle)}</strong><small>${option.cases.length} cases</small></span>
              ${casePreviews(option.cases)}
            </button>
          </article>`;
        }).join('')}
      </section>`).join('');
    practiceCardsRendered = true;
    for (const option of practiceOptions) {
      const count = option.cases.filter(item => selected.has(item.id)).length;
      $(`[data-practice-selection-control="${option.id}"]`).hidden = !selecting;
      $(`[data-practice-select="${option.id}"]`).checked = count === option.cases.length;
      $(`[data-practice-select="${option.id}"]`).indeterminate = count > 0 && count < option.cases.length;
    }
  }
  function renderLessonCards() {
    $('#lesson-cards').innerHTML = practiceOptions.map(option =>
      `<button type="button" class="lesson-card catalog-lesson-card" data-lesson="${option.lessonId}" data-lesson-group="${option.id}"><span class="lesson-card-copy"><strong>${esc(option.fullTitle)}</strong><small>${option.cases.length} cases</small></span>${casePreviews(option.cases)}</button>`,
    ).join('');
  }

  function renderLessonTabs(timerContext, locked) {
    if (timerContext.kind !== 'lesson') return;
    for (const tab of lessonTabs) {
      const selected = timerContext.tab === tab,
        button = $('#lesson-tab-' + tab);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.disabled = locked;
      $('#lesson-panel-' + tab).hidden = !selected;
    }
  }

  function renderLessonCases(lesson, timerContext) {
    const list = $('#lesson-case-list');
    const grouped = ['f2l', 'mixed'].includes(lesson.id);
    const selected = lesson.cases.find(item => item.id === timerContext.demoCaseId);
    const groups = [...new Set(lesson.cases.map(item => item.group))];
    $('#lesson-group-field').hidden = !grouped || groups.length === 1;
    $('#lesson-group').hidden = groups.length === 1;
    $('label[for="lesson-group"]').hidden = groups.length === 1;
    $('#lesson-group').innerHTML = groups.map(group => `<option value="${esc(group)}" ${group === selected.group ? 'selected' : ''}>${esc(group)} (${lesson.cases.filter(item => item.group === group).length})</option>`).join('');
    const caseListKey = lesson.id + ':' + lesson.cases.map(item => item.id).join(',');
    if (list.dataset.lessonId !== caseListKey) {
      list.innerHTML = lesson.cases
        .map((item, index) => {
          if (!lessonCasePreviews.has(item.id))
            lessonCasePreviews.set(item.id, lessonCubeSVG(item.setup, item));
          const label = lesson.id === '13' ? item.title : `Case ${index + 1}`;
          return `<button type="button" id="lesson-case-${item.id}" class="lesson-case-tile" data-lesson-case="${item.id}" aria-label="${esc(item.title)}" aria-pressed="false" title="${esc(item.group + ' · ' + item.title)}"><span class="lesson-case-thumbnail" aria-hidden="true">${lessonCasePreviews.get(item.id)}</span><span>${esc(label)}</span></button>`;
        })
        .join('');
      list.dataset.lessonId = caseListKey;
    }
    for (const item of lesson.cases) {
      $('#lesson-case-' + item.id).setAttribute(
        'aria-pressed',
        String(item.id === timerContext.demoCaseId),
      );
      $('#lesson-case-' + item.id).hidden = grouped && item.group !== selected.group;
    }
    $('#lesson-case-title').textContent = selected.title;
    const practiceList = $('#practice-case-list');
    if (practiceList.dataset.lessonId !== caseListKey) {
      practiceList.innerHTML = lesson.cases.map((item, index) =>
        `<button type="button" class="lesson-case-tile case-strip-tile" id="practice-case-${item.id}" data-practice-case="${item.id}" aria-label="${esc(item.title)}" aria-pressed="false"><span class="lesson-case-thumbnail" aria-hidden="true">${casePreview(item)}</span><span>Case ${index + 1}</span><span class="case-selection-mark" aria-hidden="true">✓</span></button>`,
      ).join('');
      practiceList.dataset.lessonId = caseListKey;
    }
    for (const item of lesson.cases)
      $('#practice-case-' + item.id).setAttribute('aria-pressed', String(timerContext.caseIds.includes(item.id)));
  }

  function renderLessonAssistance(timerContext, exercise, locked) {
    const lesson = timerContext.kind === 'lesson',
      enabled = lesson && timerContext.assistance;
    $('#fullscreen-lesson-title').hidden = !lesson;
    $('#fullscreen-lesson-title').setAttribute(
      'aria-hidden',
      String(!document.body.classList.contains('focus-mode')),
    );
    $('#fullscreen-lesson-title').textContent = lesson
      ? timerContext.title || getLesson(timerContext.lessonId).title
      : '';
    $('#lesson-help').hidden = !lesson;
    $('#manual-entry').hidden = lesson;
    $('#timer-pad').setAttribute(
      'aria-label',
      lesson
        ? 'Hold Space or two fingers, then release to start. Tap to stop.'
        : 'Hold Space or two fingers, then release to start. Tap to stop or mark a split.',
    );
    $('#lesson-help').disabled = locked || (lesson && !timerContext.exercise);
    $('#lesson-help').setAttribute('aria-pressed', String(enabled));
    $('#lesson-help').innerHTML =
      `<span aria-hidden="true">${enabled ? '✓' : '✕'}</span> Hints`;
    $('#lesson-solution').hidden = !enabled || locked;
    $('#timer-card').classList.toggle('lesson-assisted', enabled && !locked);
    if (lesson) {
      $('#lesson-solution strong').textContent = exercise?.solution || '';
    }
  }
  return {
    renderCards: renderLessonCards,
    renderPracticeCards,
    renderTabs: renderLessonTabs,
    renderCases: renderLessonCases,
    renderAssistance: renderLessonAssistance,
  };
}
