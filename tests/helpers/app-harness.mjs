import {createDeviceStorage} from '../../web/device-storage.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../../web/core.js';
import * as cube from '../../web/cube.js';
import * as lessons from '../../web/lessons.js';
import { lessonCubeSVG } from '../../web/lesson-cube.js';
import { createExercise } from '../../web/lesson-scrambler.js';
import { createMotion } from '../../web/motion.js';

const boundaryModules = new Set([
  'indexed-storage.js',
  'scrambler.js',
  'core.js',
  'cube.js',
  'lessons.js',
  'lesson-cube.js',
  'pwa.js',
  'connect.js',
  'split-charts.js',
  'solve-feedback.js',
  'motion.js',
  'mobile-navigation.js',
  'lesson-view.js',
]);
const moduleSources = new Map();
const namedImports = /^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"];?/gm;
async function readModule(name) {
  if (boundaryModules.has(name) || moduleSources.has(name)) return;
  const source = await readFile(
    new URL('../../web/' + name, import.meta.url),
    'utf8',
  );
  moduleSources.set(name, source);
  for (const match of source.matchAll(namedImports)) await readModule(match[2]);
}
await readModule('app.js');
function linkNamedImports(source) {
  return source.replace(
    namedImports,
    (_, names, name) =>
      `const {${names.replace(/\s+as\s+/g, ':')}} = __loadNamedModule(${JSON.stringify(name)});`,
  );
}
const exerciseCache = new Map();
function lessonSamples(lessonId, caseId) {
  const key = lessonId + ':' + caseId;
  if (!exerciseCache.has(key))
    exerciseCache.set(key, [
      createExercise(lessonId, { caseIds: [caseId] }),
      createExercise(lessonId, { caseIds: [caseId] }),
    ]);
  return exerciseCache.get(key);
}
export function harness({
  online = false,
  fetch: fetchRequest = async () => ({
    ok: true,
    json: async () => ({ solves: [] }),
  }),
  saved = null,
  deferLessonScrambles = false,
} = {}) {
  const elements = new Map(),
    listeners = new Map(),
    timers = new Map(),
    storage = new Map(),
    intervals = [];
  if (saved) storage.set('cube-studio-v1', JSON.stringify(saved));
  let timerId = 0,
    now = 1000,
    demoResets = 0,
    demoDestroys = 0;
  const lessonRequests = [];
  const lessonMessages = [];
  let latestLessonWorker;
  class Worker {
    constructor() { latestLessonWorker = this; }
    postMessage(data) {
      lessonMessages.push(data);
      const caseId = data.caseIds[0],
        samples = lessonSamples(data.lessonId, caseId);
      const demoExercise = data.withDemo
        ? createExercise(data.lessonId, {
            varied: false,
            caseIds: [data.demoCaseId],
          })
        : null;
      const complete = () =>
        this.onmessage({
          data: {
            request: data.request,
            exercise: samples.find((e) => e.scramble !== data.previousScramble),
            demoExercise,
          },
        });
      if (deferLessonScrambles) lessonRequests.push(complete);
      else complete();
    }
    terminate() {}
  }
  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const classes = new Set(),
      attrs = new Map();
    const el = {
      id: selector.slice(1),
      tagName: 'DIV',
      hidden: false,
      disabled: false,
      textContent: '',
      innerHTML: '',
      value: '',
      dataset: {},
      clientWidth: 500,
      children: [],
      classList: {
        add: (c) => classes.add(c),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        contains: (c) => classes.has(c),
        toggle(c, on) {
          if (on ?? !classes.has(c)) classes.add(c);
          else classes.delete(c);
        },
      },
      style: { setProperty() {} },
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => attrs.get(k),
      removeAttribute: (k) => attrs.delete(k),
      replaceChildren() {
        el.textContent = '';
      },
      append(child) {
        if (typeof child === 'object') {
          if (child.parentElement)
            child.parentElement.children = child.parentElement.children.filter(
              (item) => item !== child,
            );
          child.parentElement = el;
          el.children.push(child);
        }
      },
      prepend(child) {
        if (typeof child === 'object') {
          if (child.parentElement)
            child.parentElement.children = child.parentElement.children.filter(
              (item) => item !== child,
            );
          child.parentElement = el;
          el.children.unshift(child);
        }
      },
      scrollIntoView() {},
      blur() {},
      focus() {
        document.activeElement = el;
      },
      getClientRects: () => [],
      getBoundingClientRect: () => ({
        height: 68,
        top: 90,
        width: 68,
        right: 68,
        bottom: 158,
      }),
      addEventListener: (name, fn) => listeners.set(selector + ':' + name, fn),
      getContext: () => ({ measureText: () => ({ width: 10 }) }),
      setPointerCapture() {},
      showModal() {
        el.open = true;
      },
      close() {
        el.open = false;
      },
      hidePopover() { el.open = false; },
      showPopover() { el.open = true; },
    };
    elements.set(selector, el);
    return el;
  }
  const pages = ['timer', 'analysis', 'lessons', 'practice', 'splits'].map((name) =>
    element('#' + name + '-page'),
  );
  const nav = ['timer', 'insights', 'lessons', 'practice', 'splits'].map((name) => {
    const el = element('nav-' + name);
    el.dataset.page = name;
    el.tagName = 'BUTTON';
    return el;
  });
  const groups = ['history', 'insights', 'lesson', 'practice-detail'].map((name) => {
    const el = element('[data-header-context=\"' + name + '\"]');
    el.dataset.headerContext = name;
    return el;
  });
  element('#lesson-back').tagName = 'BUTTON';
  for (const id of ['history-scope', 'insight-period'])
    element('#' + id).value = 'all';
  element('#split-preset').value = 'beginner';
  element('#update-app').hidden = true;
  const document = {
    documentElement: element('html'),
    querySelector: element,
    querySelectorAll(selector) {
      if (selector === '.page') return pages;
      if (selector === '[data-header-context]') return groups;
      if (selector.includes('[data-page]'))
        return selector.includes('#lesson-back')
          ? [...nav, element('#lesson-back'), element('.brand')]
          : nav;
      return [];
    },
    createElement: (tag) => element('created-' + tag),
    createTextNode: (text) => text,
    body: element('body'),
    addEventListener: (name, fn) => listeners.set('document:' + name, fn),
    hidden: false,
  };
  element('#timer-page').append(element('#timer-card'));
  element('#timer-page').append(element('.timer-recent'));
  const sandbox = {
    ...core,
    ...cube,
    ...lessons,
    lessonCubeSVG,
    document,
    navigator: { onLine: online, locks: { request: (_name, callback) => callback() } },
    fetch: fetchRequest,
    localStorage: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
    },
    window: {
      document,
      matchMedia: () => ({ matches: false }),
      addEventListener: (name, fn) => listeners.set('window:' + name, fn),
      scrollTo() {},
    },
    addEventListener() {},
    setTimeout(fn) {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval(fn, ms) {
      intervals.push({ fn, ms });
    },
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    ResizeObserver: class {
      observe() {}
    },
    matchMedia: () => ({ matches: false }),
    innerWidth: 1280,
    innerHeight: 900,
    scrollY: 0,
    getComputedStyle: () => ({
      fontWeight: '700',
      fontSize: '24px',
      fontFamily: 'monospace',
      letterSpacing: '0',
    }),
    performance: { now: () => now },
    crypto,
    structuredClone,
    console,
    AbortSignal,
    Worker,
    initPWA() {},
    initConnection() {},
    syncHeaders: () => ({}),
    initSplitCharts: () => (next) => {
      sandbox.lastSplitProgress = next;
    },
    initSolveFeedback: () => ({ render() {}, fit() {} }),
    formatDifference: String,
    createMotion: () => createMotion(sandbox.window),
    initMobileNavigation: (options) => {
      sandbox.mobileNavigation = options;
    },
    createLessonDemo: () => ({
      reset() {
        demoResets++;
      },
      setOrientation() {
        demoResets++;
      },
      destroy() {
        demoDestroys++;
      },
    }),
  };
  const context = vm.createContext(sandbox);
  const modules = new Map([
    ['indexed-storage.js', {createIndexedStorage: () => createDeviceStorage({storage: sandbox.localStorage})}],
    ['scrambler.js', {createScrambler: () => ({next() { throw Error('Synthetic scrambler failure'); }})}],
    ['core.js', core],
    ['cube.js', cube],
    ['lessons.js', lessons],
    ['lesson-cube.js', { lessonCubeSVG }],
    ...[
      ['pwa.js', ['initPWA']],
      ['connect.js', ['initConnection', 'syncHeaders']],
      ['split-charts.js', ['initSplitCharts']],
      ['solve-feedback.js', ['initSolveFeedback', 'formatDifference']],
      ['motion.js', ['createMotion']],
      ['mobile-navigation.js', ['initMobileNavigation']],
      ['lesson-view.js', ['createLessonDemo']],
    ].map(([name, exports]) => [
      name,
      Object.fromEntries(exports.map((key) => [key, sandbox[key]])),
    ]),
  ]);
  sandbox.__loadNamedModule = (name) => {
    if (modules.has(name)) return modules.get(name);
    const source = moduleSources.get(name);
    if (source === undefined) throw Error('Unknown harness module: ' + name);
    const exports = [
      ...source.matchAll(
        /^export\s+(?:async\s+)?(?:function|const|let)\s+([\w$]+)/gm,
      ),
    ].map((match) => match[1]);
    const linked = linkNamedImports(source).replace(/^export\s+/gm, '');
    const module = vm.runInContext(
      `(()=>{"use strict";\n${linked}\nreturn {${exports.join(',')}};})()`,
      context,
      { filename: name },
    );
    modules.set(name, module);
    return module;
  };
  vm.runInContext(linkNamedImports(moduleSources.get('app.js')).replace('await deviceStorage.read()', 'deviceStorage.read()'), context, {
    filename: 'app.js',
  });
  return {
    element,
    storage,
    listeners,
    intervals,
    lessonRequests,
    lessonMessages,
    failLessonWorker: () => latestLessonWorker.onerror(),
    run: (code) => vm.runInContext(code, context),
    advance(ms) {
      now += ms;
    },
    arm() {
      const callback = [...timers.values()].at(-1);
      callback();
    },
    get demoResets() {
      return demoResets;
    },
    get demoDestroys() {
      return demoDestroys;
    },
  };
}
