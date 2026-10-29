import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonGroups, parseRoute, routePath, createRouter } from '../web/routes.js';

test('page, tab, group, case and practice URLs roundtrip independently of device preferences', () => {
  const paths = ['/timer', '/analysis', '/analysis/solves', '/lessons', '/practice', '/splits', '/settings'];
  for (const group of lessonGroups) {
    for (const tab of ['lesson', 'practice']) {
      paths.push(`/lessons/${group.lessonId}/${group.slug}/${tab}?case=${group.cases.at(-1).id}&cases=${group.cases[0].id}`);
    }
    paths.push(`/practice/${group.lessonId}/${group.slug}`);
  }
  for (const path of paths) {
    const route = parseRoute(path);
    assert.notEqual(route.page, 'not-found', path);
    assert.deepEqual(parseRoute(routePath(route)), route, path);
  }
  assert.equal(routePath(parseRoute('/')), '/timer');
  assert.equal(routePath(parseRoute('/analysis/solves/')), '/analysis/solves');
});

test('mixed practice and settings preserve their full background selection', () => {
  const groups = lessonGroups.slice(0, 2);
  const route = { page: 'practice', lessonId: 'mixed', tab: 'practice',
    scopeCaseIds: groups.flatMap(g => g.cases.map(c => c.id)),
    caseIds: groups.map(g => g.cases[0].id), demoCaseId: groups[0].cases[1].id };
  const path = routePath(route);
  const restored = parseRoute(path);
  assert.deepEqual(restored.caseIds, route.caseIds);
  assert.deepEqual(restored.scopeCaseIds, route.scopeCaseIds);
  assert.equal(restored.demoCaseId, route.demoCaseId);
  assert.equal(routePath(parseRoute(routePath({ ...route, settings: true }))), routePath({ ...route, settings: true }));
  assert.equal(parseRoute('/settings?from=https://evil.example').page, 'timer');
  assert.equal(parseRoute('/settings?from=//evil.example').page, 'timer');
});

test('unknown pages, lessons, groups, tabs, and unavailable cases produce a missing page', () => {
  for (const path of ['/missing', '/lessons/missing', '/lessons/f2l/missing/lesson', '/lessons/f2l/easy-inserts/unknown', '/practice/f2l/missing', '/practice/mixed?groups=missing', '/lessons/f2l/lesson?case=missing', '/practice/f2l/easy-inserts?cases=missing']) {
    assert.equal(parseRoute(path).page, 'not-found', path);
  }
});

test('browser history restores routes, ignores duplicate clicks and blocks traversal during an attempt', () => {
  let listener, position = 0, locked = false;
  const entries = [{ path: '/', state: null }], applied = [];
  const view = { location: new URL('https://cube.example/'),
    addEventListener(_, callback) { listener = callback; },
    history: {
      get state() { return entries[position].state; },
      replaceState(state, _, path) { entries[position] = { state, path }; view.location = new URL(path, view.location); },
      pushState(state, _, path) { entries.splice(++position); entries.push({ state, path }); view.location = new URL(path, view.location); },
      go(delta) { position += delta; view.location = new URL(entries[position].path, view.location); listener(); },
      back() { this.go(-1); },
    } };
  const router = createRouter({ view, blocked: () => locked, apply: route => applied.push(route.page) });
  router.start();
  router.commit({ page: 'history' });
  router.commit({ page: 'history' });
  assert.equal(entries.length, 2);
  locked = true;
  view.history.back();
  assert.equal(view.location.pathname, '/analysis/solves');
  assert.deepEqual(applied, ['timer']);
  locked = false;
  view.history.back();
  assert.equal(view.location.pathname, '/timer');
  assert.equal(applied.at(-1), 'timer');
  view.history.go(1);
  assert.equal(applied.at(-1), 'history');
});
