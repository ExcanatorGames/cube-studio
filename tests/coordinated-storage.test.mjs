import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceStorage } from '../web/device-storage.js';
import {
  createCoordinatedStorage,
  mergeSnapshots,
} from '../web/coordinated-storage.js';

const solve = (id, updatedAt = 1, extra = {}) => ({
  id,
  updatedAt,
  date: '2026-01-01T12:00:00Z',
  ms: 1234,
  penalty: 'none',
  scramble: 'R U',
  splits: [],
  note: '',
  source: 'timer',
  trust: 'confirmed',
  usedScramble: true,
  ...extra,
});
const empty = () => ({
  solves: [],
  pending: [],
  lessonAttempts: [],
  pendingLessons: [],
  settings: {},
});

test('edits made while an asynchronous commit finishes survive its apply and the following save', async () => {
  const initial = empty();
  let local = structuredClone(initial), disk = structuredClone(initial), release;
  const store = {
    unsaved() {},
    commit(transform) {
      const next = transform(disk);
      return new Promise(resolve => {
        release = () => { disk = next; resolve({ok:true, snapshot:next, changed:true}); };
      });
    },
  };
  const coordinator = createCoordinatedStorage({store, initial, getSnapshot:() => ({...local, solves:[...local.solves], pending:[...local.pending]}), apply:value => {local=value;}, onChange() {}});
  local.solves.push(solve('first'));
  local.pending.push(solve('first'));
  const saving = coordinator.save();
  local.solves.push(solve('second'));
  local.pending.push(solve('second'));
  local.settings.hold = 1000;
  release();
  await saving;
  assert.deepEqual(local.solves.map(s => s.id), ['first', 'second']);
  assert.equal(local.settings.hold, 1000);
  const next = coordinator.save();
  release();
  await next;
  assert.deepEqual(disk.solves.map(s => s.id), ['first', 'second']);
  assert.equal(disk.pending.length, 2);
  assert.equal(disk.settings.hold, 1000);
});

test('retry after an unreadable startup recovers queued records and migrates old lesson history', () => {
  const queued = solve('queued-only');
  const practice = solve('old-practice', 1, { lessonId: '13', caseId: 'ready-right', completion: 'insertion' });
  const remote = { ...empty(), pending: [queued], lessonAttempts: [practice] };
  const merged = mergeSnapshots(empty(), { ...empty(), lessonSyncVersion: 1 }, remote);
  assert.deepEqual(merged.solves, [queued]);
  assert.deepEqual(merged.pending, [queued]);
  assert.deepEqual(merged.pendingLessons, [practice]);
  assert.equal(merged.lessonSyncVersion, 1);
});

test('overlapping tab saves merge independent records, settings, lessons and pending writes', async () => {
  const values = new Map(),
    storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
  let queue = Promise.resolve();
  const locks = {
    request: (_name, callback) => {
      const result = queue.then(callback);
      queue = result.catch(() => {});
      return result;
    },
  };
  function tab() {
    const store = createDeviceStorage({ storage }),
      initial = store.read().snapshot;
    let local = structuredClone(initial);
    const coordinator = createCoordinatedStorage({
      store,
      initial,
      locks,
      getSnapshot: () => local,
      apply: (value) => {
        local = value;
      },
      onChange() {},
    });
    return {
      coordinator,
      get local() {
        return local;
      },
    };
  }
  const a = tab(),
    b = tab();
  a.local.solves.push(solve('a'));
  a.local.pending.push(solve('a'));
  a.local.settings.hold = 750;
  b.local.solves.push(solve('b'));
  b.local.pending.push(solve('b'));
  b.local.settings.orientation = 'white-bottom';
  const lesson = solve('practice', 1, {
    lessonId: '13',
    caseId: 'ready-right',
    completion: 'insertion',
  });
  b.local.lessonAttempts.push(lesson);
  b.local.pendingLessons.push(lesson);
  await Promise.all([a.coordinator.save(), b.coordinator.save()]);
  await a.coordinator.save();
  const saved = JSON.parse(values.get('cube-studio-v1'));
  assert.deepEqual(saved.solves.map((s) => s.id).sort(), ['a', 'b']);
  assert.equal(saved.pending.length, 2);
  assert.equal(saved.pendingLessons.length, 1);
  assert.equal(saved.settings.hold, 750);
  assert.equal(saved.settings.orientation, 'white-bottom');
  assert.deepEqual(a.local, b.local);
});

test('stale tabs cannot resurrect deleted solves or acknowledged pending versions', () => {
  const base = { ...empty(), solves: [solve('a')], pending: [solve('a')] };
  const deleted = solve('a', 2, { deleted: true });
  const remote = { ...base, solves: [deleted], pending: [] };
  const merged = mergeSnapshots(base, base, remote);
  assert.deepEqual(merged.solves, [deleted]);
  assert.deepEqual(merged.pending, []);
});

test('acknowledging an old upload preserves a newer edit pending in another tab', () => {
  for (const [history, queue] of [
    ['solves', 'pending'],
    ['lessonAttempts', 'pendingLessons'],
  ]) {
    const base = { ...empty(), [history]: [solve('a')], [queue]: [solve('a')] };
    const newer = solve('a', 2, { note: 'Edited while uploading' });
    const merged = mergeSnapshots(
      base,
      { ...base, [queue]: [] },
      { ...base, [history]: [newer], [queue]: [newer] },
    );
    assert.deepEqual(merged[history], [newer]);
    assert.deepEqual(merged[queue], [newer]);
  }
});

test('a failed coordinated write retains both the in-memory work and existing disk data for retry', async () => {
  let raw = JSON.stringify({ ...empty(), solves: [solve('existing')] }),
    fail = true;
  const store = createDeviceStorage({
    storage: {
      getItem: () => raw,
      setItem: (_key, value) => {
        if (fail) throw Error('Quota');
        raw = value;
      },
    },
  });
  const initial = store.read().snapshot,
    local = structuredClone(initial);
  local.solves.push(solve('new'));
  local.pending.push(solve('new'));
  const coordinator = createCoordinatedStorage({
    store,
    initial,
    locks: { request: (_name, callback) => Promise.resolve().then(callback) },
    getSnapshot: () => local,
    apply() {},
    onChange() {},
  });
  assert.equal(await coordinator.save(), false);
  assert.equal(store.getState().persisted, false);
  assert.equal(JSON.parse(raw).solves.length, 1);
  assert.equal(local.solves.length, 2);
  fail = false;
  assert.equal(await coordinator.save(), true);
  assert.equal(JSON.parse(raw).solves.length, 2);
});
