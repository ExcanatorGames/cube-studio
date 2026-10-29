import { LESSON_CATALOG, getLesson } from './lessons.js';

export const lessonGroups = LESSON_CATALOG.flatMap(lesson =>
  [...new Set(lesson.cases.map(item => item.group))].map((group, index) => ({
    id: `${lesson.id}-${index}`,
    slug: group.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: group,
    fullTitle: `${lesson.title} · ${group}`,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    cases: lesson.cases.filter(item => item.group === group),
  })),
);

const pagePaths = { timer: '/timer', insights: '/analysis', history: '/analysis/solves', lessons: '/lessons', practice: '/practice' };
const notFound = () => ({ page: 'not-found' });
const selectedIds = (value, cases) => value === null ? undefined :
  cases.filter(item => value.split(',').includes(item.id)).map(item => item.id);

export function routeClick(event) {
  if (event && (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return false;
  event?.preventDefault?.();
  return true;
}

export function parseRoute(input) {
  const url = new URL(input, 'https://cube.invalid');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/splits') return {page:'timer',settings:true,settingsTab:'splits'};
  if (path === '/settings') {
    const from = url.searchParams.get('from');
    const background = from?.startsWith('/') && !from.startsWith('//') && !from.startsWith('/settings')
      ? parseRoute(from) : { page: 'timer' };
    const tab = url.searchParams.get('tab');
    return { ...background, settings: true, ...(['splits','app'].includes(tab) ? {settingsTab:tab} : {}) };
  }
  if (path === '/' || path === '/index.html') return { page: 'timer' };
  for (const [page, value] of Object.entries(pagePaths)) if (value === path) return { page };
  const parts = path.slice(1).split('/');
  const [page, lessonId] = parts;
  if (!['lessons', 'practice'].includes(page) || parts.length < 2) return notFound();
  const lesson = getLesson(lessonId);
  if (!lesson || (page === 'lessons' && lessonId === 'mixed')) return notFound();
  let group, tab = page === 'practice' ? 'practice' : 'lesson';
  if (page === 'lessons') {
    if (parts.length === 3) tab = parts[2];
    else if (parts.length === 4) {
      group = lessonGroups.find(item => item.lessonId === lessonId && item.slug === parts[2]);
      if (!group) return notFound();
      tab = parts[3];
    } else if (parts.length !== 2) return notFound();
    if (!['lesson', 'practice'].includes(tab)) return notFound();
  } else if (parts.length === 3) {
    group = lessonGroups.find(item => item.lessonId === lessonId && item.slug === parts[2]);
    if (!group) return notFound();
  } else if (parts.length !== 2) return notFound();
  let scopeCaseIds = group?.cases.map(item => item.id);
  if (lessonId === 'mixed' && url.searchParams.has('groups')) {
    const slugs = url.searchParams.get('groups').split(',');
    const groups = slugs.map(slug => lessonGroups.find(item => `${item.lessonId}/${item.slug}` === slug));
    if (groups.some(item => !item)) return notFound();
    scopeCaseIds = groups.flatMap(item => item.cases.map(c => c.id));
  }
  const cases = scopeCaseIds ? lesson.cases.filter(item => scopeCaseIds.includes(item.id)) : lesson.cases;
  const caseIds = selectedIds(url.searchParams.get('cases'), cases);
  const demoCaseId = url.searchParams.get('case') || cases[0]?.id;
  if (!cases.length || (caseIds && !caseIds.length) || !cases.some(item => item.id === demoCaseId)) return notFound();
  // Practice catalog entries use the combined lesson so their saved selections
  // and recorded attempts behave exactly like a catalog click.
  return { page, lessonId: page === 'practice' && group ? 'mixed' : lessonId,
    scopeCaseIds, title: group?.fullTitle, tab, demoCaseId, caseIds };
}

export function routePath(route) {
  if (route.settings) {
    const from = routePath({ ...route, settings: false });
    const query = new URLSearchParams();
    if (from !== '/timer') query.set('from',from);
    if (['splits','app'].includes(route.settingsTab)) query.set('tab',route.settingsTab);
    return '/settings' + (query.size ? '?' + query : '');
  }
  if (route.page === 'not-found') return route.path || '/not-found';
  if (!route.lessonId) return pagePaths[route.page] || '/timer';
  const lesson = getLesson(route.lessonId);
  const cases = route.scopeCaseIds ? lesson.cases.filter(item => route.scopeCaseIds.includes(item.id)) : lesson.cases;
  const group = lessonGroups.find(item => item.cases.length === cases.length && item.cases.every(c => cases.some(value => value.id === c.id)));
  let path = `/${route.page}/${group?.lessonId || route.lessonId}`;
  if (group) path += '/' + group.slug;
  if (route.page === 'lessons') path += '/' + route.tab;
  const query = new URLSearchParams();
  if (route.lessonId === 'mixed' && !group && route.scopeCaseIds) {
    query.set('groups', lessonGroups.filter(item => item.cases.some(c => route.scopeCaseIds.includes(c.id))).map(item => `${item.lessonId}/${item.slug}`).join(','));
  }
  if (route.demoCaseId && route.demoCaseId !== cases[0]?.id) query.set('case', route.demoCaseId);
  if (route.caseIds && (route.caseIds.length !== cases.length || !cases.every(item => route.caseIds.includes(item.id)))) query.set('cases', route.caseIds.join(','));
  return path + (query.size ? '?' + query : '');
}

export function createRouter({ apply, blocked, view = window }) {
  let current, index = view.history.state?.cubeStudioRoute?.index || 0;
  const locationPath = () => view.location.pathname + view.location.search;
  function write(path, { replace = false, overlay = false } = {}) {
    if (path === current && !replace) return;
    if (!replace) index++;
    view.history[replace ? 'replaceState' : 'pushState'](
      { ...view.history.state, cubeStudioRoute: { index, overlay } }, '', path + view.location.hash,
    );
    current = path;
  }
  view.addEventListener('popstate', () => {
    const target = view.history.state?.cubeStudioRoute?.index;
    if (blocked()) {
      if (Number.isInteger(target) && target !== index) view.history.go(index - target);
      else write(current, { replace: true });
      return;
    }
    index = target ?? index;
    current = locationPath();
    apply(parseRoute(current));
  });
  return {
    start() {
      current = locationPath();
      const route = parseRoute(current);
      const overlay = !!view.history.state?.cubeStudioRoute?.overlay;
      if (route.page !== 'not-found') write(routePath(route), { replace: true, overlay });
      else write(current, { replace: true });
      apply(route);
    },
    commit(route, options) { write(routePath(route), options); },
    closeOverlay(route) {
      if (view.history.state?.cubeStudioRoute?.overlay) view.history.back();
      else write(routePath(route), { replace: true });
    },
  };
}
