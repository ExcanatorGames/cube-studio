import { LESSONS } from './lessons.js';
import { lessonCubeSVG } from './lesson-cube.js';
import { $, esc } from './dom.js';

export const lessonTabs = ['lesson', 'practice'];

export function createLessonPresentation() {
  const lessonCasePreviews = new Map();
  function renderLessonCards() {
    $('#lesson-cards').innerHTML = LESSONS.map((lesson) => {
      const preview = lesson.case;
      return `<button type="button" class="lesson-card" data-lesson="${lesson.id}"><span class="lesson-card-cube" aria-hidden="true">${lessonCubeSVG(preview.setup, preview)}</span><span class="lesson-card-copy"><strong>${esc(lesson.title)}</strong><small>${esc(lesson.summary)}</small></span><span class="lesson-card-arrow" aria-hidden="true">→</span></button>`;
    }).join('');
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
    if (list.dataset.lessonId !== lesson.id) {
      list.innerHTML = lesson.cases
        .map((item, index) => {
          if (!lessonCasePreviews.has(item.id))
            lessonCasePreviews.set(item.id, lessonCubeSVG(item.setup, item));
          const label = lesson.id === '13' ? item.title : `Case ${index + 1}`;
          return `<button type="button" id="lesson-case-${item.id}" class="lesson-case-tile" data-lesson-case="${item.id}" aria-label="${esc(item.title)}" aria-pressed="false" title="${esc(item.group + ' · ' + item.title)}"><span class="lesson-case-thumbnail" aria-hidden="true">${lessonCasePreviews.get(item.id)}</span><span>${esc(label)}</span></button>`;
        })
        .join('');
      list.dataset.lessonId = lesson.id;
    }
    for (const item of lesson.cases)
      $('#lesson-case-' + item.id).setAttribute(
        'aria-pressed',
        String(item.id === timerContext.demoCaseId),
      );
    const selected = lesson.cases.find(
      (item) => item.id === timerContext.demoCaseId,
    );
    $('#lesson-case-title').textContent = selected.title;
    const practiceList = $('#lesson-practice-case-list');
    if (practiceList.dataset.lessonId !== lesson.id) {
      practiceList.innerHTML = lesson.cases
        .map(
          (item) =>
            `<button type="button" id="practice-case-${item.id}" class="lesson-case-tile lesson-practice-tile" data-practice-case="${item.id}" aria-label="${esc(item.title)}" aria-pressed="false" title="${esc(item.group + ' · ' + item.title)}"><span class="lesson-case-thumbnail" aria-hidden="true">${lessonCasePreviews.get(item.id)}</span><span class="lesson-practice-case-title">${esc(item.title)}</span><span class="lesson-case-selected" aria-hidden="true">✓</span></button>`,
        )
        .join('');
      practiceList.dataset.lessonId = lesson.id;
    }
    for (const item of lesson.cases)
      $('#practice-case-' + item.id).setAttribute(
        'aria-pressed',
        String(timerContext.caseIds.includes(item.id)),
      );
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
      ? LESSONS.find((item) => item.id === timerContext.lessonId).title
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
    renderTabs: renderLessonTabs,
    renderCases: renderLessonCases,
    renderAssistance: renderLessonAssistance,
  };
}
