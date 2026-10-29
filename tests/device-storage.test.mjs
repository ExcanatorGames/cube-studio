import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceStorage } from '../web/device-storage.js';

const key = 'cube-studio-v1';
const solve = {
  id: 'solve-1',
  date: '2026-01-01T12:00:00Z',
  ms: 12340,
  penalty: 'none',
  scramble: "R U R'",
  splits: [
    { name: 'Cross', ms: 3000 },
    { name: 'Finish', ms: 12340 },
  ],
  note: 'Keep this',
  updatedAt: 1,
};
function memory(raw) {
  const values = new Map(raw === undefined ? [] : [[key, raw]]);
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, value) => values.set(k, String(value)),
  };
}

test('recovery uses trustworthy same-version fields without rolling history backward', () => {
  const cases = [
    {
      name: 'history note',
      history: { note: {} },
      queued: {},
      note: 'Keep this',
      pendingNote: 'Keep this',
    },
    {
      name: 'queued note',
      history: {},
      queued: { note: {} },
      note: 'Keep this',
      pendingNote: 'Keep this',
    },
    {
      name: 'both notes damaged',
      history: { note: {} },
      queued: { note: {} },
      note: '',
      pendingNote: '',
    },
    {
      name: 'intentional empty note',
      history: { note: '' },
      queued: {},
      note: '',
      pendingNote: 'Keep this',
    },
    {
      name: 'older pending',
      history: { note: {}, updatedAt: 2 },
      queued: {},
      note: '',
      pendingNote: 'Keep this',
    },
    {
      name: 'newer pending',
      history: { note: {} },
      queued: { note: 'New note', updatedAt: 2, deleted: true },
      note: 'New note',
      pendingNote: 'New note',
      deleted: true,
    },
    {
      name: 'newer damaged pending',
      history: {},
      queued: { note: {}, updatedAt: 2 },
      note: '',
      pendingNote: '',
    },
    {
      name: 'untrusted history version',
      history: { note: {}, updatedAt: 'invalid' },
      queued: { updatedAt: Date.parse(solve.date) },
      note: '',
      pendingNote: 'Keep this',
    },
    {
      name: 'untrusted pending version',
      history: { note: {}, updatedAt: Date.parse(solve.date) },
      queued: { updatedAt: 'invalid' },
      note: '',
      pendingNote: 'Keep this',
    },
  ];
  for (const c of cases) {
    const input = {
      solves: [{ ...solve, ...c.history }],
      pending: [{ ...solve, ...c.queued }],
    };
    const raw = JSON.stringify(input);
    const storage = memory(raw);
    const device = createDeviceStorage({ storage });
    const { snapshot, state } = device.read();
    assert.equal(snapshot.solves[0].note, c.note, c.name);
    assert.equal(snapshot.pending[0].note, c.pendingNote, c.name);
    assert.equal(snapshot.solves[0].deleted, c.deleted, c.name);
    assert.equal(snapshot.pending.length, 1, c.name);
    assert.equal(storage.getItem(key), raw, c.name);
    assert.deepEqual(device.read().snapshot, snapshot, c.name);
    if (state.recovery) {
      assert.equal(state.recovery.raw, raw, c.name);
      assert.ok(state.recovery.issues.length, c.name);
      assert.equal(device.write(input).ok, false, c.name);
      assert.equal(device.write(snapshot).ok, true, c.name);
      assert.equal(
        storage.getItem(device.getState().recovery.backupKey),
        raw,
        c.name,
      );
    }
  }
});

test('malformed JSON and root/collection shapes recover without overwriting the original', () => {
  for (const raw of [
    '{',
    'null',
    'false',
    '42',
    '[]',
    '{"solves":{},"pending":false,"lessonAttempts":"bad"}',
  ]) {
    const storage = memory(raw),
      device = createDeviceStorage({ storage, key });
    const { snapshot, state } = device.read();
    assert.deepEqual(snapshot.solves, []);
    assert.deepEqual(snapshot.pending, []);
    assert.deepEqual(snapshot.lessonAttempts, []);
    assert.equal(state.status, 'recovered');
    assert.equal(state.persisted, false);
    assert.equal(state.recovery.raw, raw);
    assert.equal(storage.getItem(key), raw);
  }
});

test('equal-version copies restore complementary damaged fields and retain deletion', () => {
  const device = createDeviceStorage({
    storage: memory(
      JSON.stringify({
        solves: [{ ...solve, note: {}, deleted: true }],
        pending: [{ ...solve, splits: [null], deleted: 'damaged' }],
      }),
    ),
  });
  const { snapshot } = device.read();
  for (const record of [snapshot.solves[0], snapshot.pending[0]]) {
    assert.equal(record.note, solve.note);
    assert.deepEqual(record.splits, solve.splits);
    assert.equal(record.deleted, true);
    assert.equal(record.updatedAt, solve.updatedAt);
  }
});

test('retains valid history, pending deletions, and historical lesson metadata beside damaged records', () => {
  const deleted = { ...solve, id: 'deleted', deleted: true, penalty: 'dnf' };
  const legacy = {
    id: 'legacy',
    date: solve.date,
    ms: 60000,
    penalty: '+2',
    splits: [],
    trust: 'uncertain',
    usedScramble: false,
  };
  const attempt = {
    ...solve,
    id: 'attempt',
    lessonId: '13',
    caseId: 'ready-right',
  };
  const input = {
    solves: [
      solve,
      null,
      { ...solve, id: 42 },
      { ...solve, id: 'bad-time', ms: '12' },
      { ...solve, id: 'bad-date', date: 'invalid' },
      legacy,
    ],
    pending: [deleted, null],
    lessonAttempts: [
      attempt,
      { ...attempt, id: 'recognition', completion: 'pair' },
      false,
    ],
  };
  const { snapshot, state } = createDeviceStorage({
    storage: memory(JSON.stringify(input)),
  }).read();
  assert.deepEqual(
    snapshot.solves.map((s) => s.id),
    ['solve-1', 'legacy'],
  );
  assert.deepEqual(snapshot.solves[0].splits, solve.splits);
  assert.equal(snapshot.solves[0].note, 'Keep this');
  assert.equal(snapshot.solves[1].scramble, '');
  assert.equal(snapshot.solves[1].updatedAt, Date.parse(solve.date));
  assert.equal(snapshot.solves[1].trust, 'confirmed');
  assert.equal(snapshot.pending[0].deleted, true);
  assert.equal(snapshot.pending[0].penalty, 'dnf');
  assert.deepEqual(
    snapshot.lessonAttempts.map((s) => s.completion),
    ['full-cube', 'pair'],
  );
  assert.equal(state.status, 'recovered');
});

test('absent optional historical fields are compatible, without a false corruption warning', () => {
  const { snapshot, state } = createDeviceStorage({
    storage: memory(
      JSON.stringify({ solves: [{ id: 'old', date: solve.date, ms: 5000 }] }),
    ),
  }).read();
  assert.equal(state.status, 'ready');
  assert.equal(snapshot.solves[0].penalty, 'none');
  assert.deepEqual(snapshot.solves[0].splits, []);
});

test('repairs malformed optional record fields and settings while retaining usable preferences', () => {
  const input = {
    solves: [
      {
        ...solve,
        splits: [null],
        note: {},
        updatedAt: 'bad',
        penalty: 'wat',
        deleted: 'yes',
      },
    ],
    settings: {
      preset: 'custom',
      custom: {},
      hold: '550',
      track: 'false',
      orientation: 'white-bottom',
      lessonOrientation: 'bad',
      lessonCaseSelections: { 13: {}, 14: ['valid', null, 'another'] },
    },
  };
  const { snapshot, state } = createDeviceStorage({
    storage: memory(JSON.stringify(input)),
  }).read();
  assert.equal(snapshot.solves.length, 1);
  assert.deepEqual(snapshot.solves[0].splits, []);
  assert.equal(snapshot.solves[0].note, '');
  assert.equal(snapshot.solves[0].deleted, false);
  assert.equal(snapshot.solves[0].penalty, 'none');
  assert.equal(
    snapshot.settings.custom.join(', '),
    'Cross, First pair, Remaining F2L, Last layer',
  );
  assert.equal(snapshot.settings.hold, 500);
  assert.equal(snapshot.settings.track, false);
  assert.equal(snapshot.settings.orientation, 'white-bottom');
  assert.equal(snapshot.settings.lessonOrientation, 'white-bottom');
  assert.deepEqual(snapshot.settings.lessonCaseSelections, {
    14: ['valid', 'another'],
  });
  assert.ok(state.recovery.issues.includes('settings.custom'));
  for (const settings of [
    null,
    [],
    42,
    'bad',
    { preset: 'unknown' },
    { hold: -1 },
    { custom: [null], preset: 'custom' },
  ]) {
    const result = createDeviceStorage({
      storage: memory(JSON.stringify({ settings })),
    }).read();
    assert.equal(result.state.status, 'recovered');
    assert.ok(
      ['beginner', 'cfop', 'custom'].includes(result.snapshot.settings.preset),
    );
    assert.ok(Array.isArray(result.snapshot.settings.custom));
  }
});

test('writes the v1 snapshot and exposes a durable failure state until a successful retry', () => {
  const storage = memory(),
    device = createDeviceStorage({ storage });
  const { snapshot } = device.read();
  snapshot.solves.push(solve);
  snapshot.pending.push(solve);
  assert.equal(device.write(snapshot).ok, true);
  const write = storage.setItem;
  storage.setItem = () => {
    throw new DOMException('Full', 'QuotaExceededError');
  };
  snapshot.solves.push({ ...solve, id: 'unsaved' });
  const failed = device.write(snapshot);
  assert.equal(failed.ok, false);
  assert.equal(device.getState().persisted, false);
  assert.equal(device.getState().error, 'write-failed');
  assert.equal(
    createDeviceStorage({ storage }).read().snapshot.solves.length,
    1,
  );
  storage.setItem = write;
  assert.equal(device.write(snapshot).ok, true);
  assert.equal(device.getState().persisted, true);
  assert.equal(device.getState().error, null);
  const reloaded = createDeviceStorage({ storage }).read();
  assert.deepEqual(
    reloaded.snapshot.solves.map((s) => s.id),
    ['solve-1', 'unsaved'],
  );
  assert.equal(reloaded.snapshot.pending.length, 1);
  assert.equal(JSON.parse(storage.getItem(key)).solves.length, 2);
});

test('backs up exact damaged bytes before replacement and keeps prior backups intact', () => {
  const raw = ' {"solves": [null], "settings": null} ',
    storage = memory(raw);
  const device = createDeviceStorage({ storage }),
    { snapshot } = device.read();
  snapshot.solves.push(solve);
  assert.equal(device.write(snapshot).ok, true);
  const recovery = device.getState().recovery;
  assert.equal(recovery.raw, raw);
  assert.equal(recovery.backedUp, true);
  assert.equal(storage.getItem(recovery.backupKey), raw);
  assert.notEqual(recovery.backupKey, key);
  assert.equal(
    device.getState().status,
    'recovered',
    'the UI must retain a recovery notice after a successful save',
  );
  assert.equal(device.getState().persisted, true);
  const raw2 = 'another broken payload';
  storage.setItem(key, raw2);
  const second = createDeviceStorage({ storage }),
    next = second.read();
  assert.equal(second.write(next.snapshot).ok, true);
  assert.equal(storage.getItem(recovery.backupKey), raw);
  assert.equal(storage.getItem(second.getState().recovery.backupKey), raw2);
});

test('failed backup refuses replacement; successful backup followed by a failed save is still unsaved', () => {
  const raw = '{bad',
    storage = memory(raw),
    device = createDeviceStorage({ storage });
  const { snapshot } = device.read(),
    write = storage.setItem;
  storage.setItem = () => {
    throw new DOMException('Full', 'QuotaExceededError');
  };
  assert.equal(device.write(snapshot).ok, false);
  assert.equal(device.getState().error, 'backup-failed');
  assert.equal(device.getState().persisted, false);
  assert.equal(storage.getItem(key), raw);
  assert.equal(device.getState().recovery.raw, raw);
  storage.setItem = (k, value) => {
    if (k === key) throw Error('Full');
    write(k, value);
  };
  assert.equal(device.write(snapshot).ok, false);
  assert.equal(device.getState().error, 'write-failed');
  assert.equal(device.getState().recovery.backedUp, true);
  assert.equal(storage.getItem(key), raw);
  storage.setItem = write;
  assert.equal(device.write(snapshot).ok, true);
  assert.equal(storage.getItem(device.getState().recovery.backupKey), raw);
});

test('blocked storage access is caught and cannot overwrite previously unread history on retry', () => {
  const raw = JSON.stringify({ solves: [solve] }),
    storage = memory(raw);
  let blocked = true;
  const device = createDeviceStorage({
    storage: () => {
      if (blocked) throw new DOMException('Denied', 'SecurityError');
      return storage;
    },
  });
  const { snapshot, state } = device.read();
  assert.deepEqual(snapshot.solves, []);
  assert.equal(state.error, 'read-failed');
  assert.equal(state.persisted, false);
  assert.equal(device.write(snapshot).ok, false);
  blocked = false;
  assert.equal(device.write(snapshot).ok, false);
  assert.equal(device.getState().error, 'read-failed');
  assert.equal(storage.getItem(key), raw);
  assert.equal(
    device.write(snapshot).ok,
    false,
    'a repeated retry must not bypass the protection',
  );
  const recovered = device.read();
  assert.equal(recovered.snapshot.solves[0].id, solve.id);
  assert.equal(recovered.state.status, 'ready');
  recovered.snapshot.solves.push({ ...solve, id: 'created-while-blocked' });
  assert.equal(device.write(recovered.snapshot).ok, true);
  assert.deepEqual(
    createDeviceStorage({ storage })
      .read()
      .snapshot.solves.map((s) => s.id),
    ['solve-1', 'created-while-blocked'],
  );
});

test('a blocked startup can retry saving when the previously unread store is empty', () => {
  const storage = memory();
  let blocked = true;
  const device = createDeviceStorage({
    storage: () => {
      if (blocked) throw Error('Denied');
      return storage;
    },
  });
  const { snapshot } = device.read();
  snapshot.solves.push(solve);
  blocked = false;
  assert.equal(device.write(snapshot).ok, false);
  assert.equal(device.read().state.status, 'ready');
  assert.equal(device.write(snapshot).ok, true);
  assert.equal(
    createDeviceStorage({ storage }).read().snapshot.solves.length,
    1,
  );
});

test('invalid or unserializable writes fail without replacing valid persisted history', () => {
  const raw = JSON.stringify({ solves: [solve] }),
    storage = memory(raw),
    device = createDeviceStorage({ storage });
  device.read();
  const circular = {};
  circular.self = circular;
  for (const invalid of [
    { solves: {} },
    { solves: [{ ...solve, ms: Infinity }] },
    { solves: [null] },
    null,
    { extra: 1n },
    circular,
  ]) {
    assert.equal(device.write(invalid).ok, false);
    assert.equal(device.getState().persisted, false);
    assert.equal(device.getState().error, 'invalid-snapshot');
    assert.equal(storage.getItem(key), raw);
  }
});

test('legacy hold times above one second are capped without losing other settings', () => {
  const storage = createDeviceStorage({ storage: memory(JSON.stringify({ settings: { hold: 2000, orientation: 'white-bottom' } })) });
  const { snapshot } = storage.read();
  assert.equal(snapshot.settings.hold, 1000);
  assert.equal(snapshot.settings.orientation, 'white-bottom');
});
