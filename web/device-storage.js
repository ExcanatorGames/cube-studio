import { orientationColors, validOrientation } from './cube.js';
import { splitMethods, validSplitMethod } from './split-methods.js';

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) =>
  typeof value === 'string' && value.trim().length > 0;
const defaults = () => ({
  preset: 'beginner',
  custom: ['Cross', 'First pair', 'Remaining F2L', 'Last layer'],
  hold: 550,
  track: false,
  orientation: 'white-top',
  lessonOrientation: 'white-bottom',
  crossPosition: 'bottom',
  solveColors: 'white',
});

function record(value, path, issues, lesson, checks) {
  if (
    !isObject(value) ||
    !nonempty(value.id) ||
    typeof value.date !== 'string' ||
    !Number.isFinite(Date.parse(value.date)) ||
    !Number.isFinite(value.ms) ||
    value.ms <= 0
  ) {
    issues.push(path);
    return null;
  }
  if (lesson && (!nonempty(value.lessonId) || !nonempty(value.caseId))) {
    issues.push(path);
    return null;
  }
  const result = { ...value, trust: 'confirmed', usedScramble: true };
  const damagedFields = new Set(),
    validFields = new Set();
  const field = (name, valid, fallback) => {
    if (valid(value[name])) {
      validFields.add(name);
    } else {
      if (value[name] !== undefined) {
        issues.push(`${path}.${name}`);
        damagedFields.add(name);
      }
      result[name] = fallback;
    }
  };
  field('penalty', (v) => ['none', '+2', 'dnf'].includes(v), 'none');
  for (const name of ['scramble', 'note', 'source'])
    field(name, (v) => typeof v === 'string', '');
  field(
    'updatedAt',
    (v) => Number.isFinite(v) && v >= 0,
    Date.parse(value.date),
  );
  if (value.deleted !== undefined)
    field('deleted', (v) => typeof v === 'boolean', false);
  field(
    'splits',
    (v) =>
      Array.isArray(v) &&
      v.every(
        (step, i) =>
          isObject(step) &&
          typeof step.name === 'string' &&
          Number.isFinite(step.ms) &&
          step.ms >= 0 &&
          step.ms <= value.ms &&
          (i === 0 || step.ms >= v[i - 1].ms),
      ),
    [],
  );
  if (lesson) field('completion', nonempty, 'full-cube');
  checks.set(result, {
    damagedFields,
    validFields,
    originalVersion: validFields.has('updatedAt') ? value.updatedAt : null,
  });
  return result;
}

export function validateSnapshot(value) {
  const issues = [];
  const checks = new Map();
  if (!isObject(value)) {
    issues.push('root');
    value = {};
  }
  const snapshot = { ...value };
  for (const name of [
    'solves',
    'pending',
    'lessonAttempts',
    'pendingLessons',
  ]) {
    if (value[name] !== undefined && !Array.isArray(value[name]))
      issues.push(name);
    snapshot[name] = Array.isArray(value[name])
      ? value[name]
          .map((item, i) =>
            record(
              item,
              `${name}[${i}]`,
              issues,
              name === 'lessonAttempts' || name === 'pendingLessons',
              checks,
            ),
          )
          .filter(Boolean)
      : [];
  }
  const settings = isObject(value.settings) ? value.settings : {};
  if (value.settings !== undefined && !isObject(value.settings))
    issues.push('settings');
  snapshot.settings = { ...defaults(), ...settings };
  if (settings.crossPosition === undefined) snapshot.settings.crossPosition = settings.lessonOrientation === 'white-top' ? 'top' : 'bottom';
  if (settings.splitMethods !== undefined) {
    if (!Array.isArray(settings.splitMethods)) {
      issues.push('settings.splitMethods');
      delete snapshot.settings.splitMethods;
    } else {
      const ids = new Set();
      snapshot.settings.splitMethods = settings.splitMethods.filter((method, index) => {
        if (!validSplitMethod(method) || ids.has(method.id)) { issues.push(`settings.splitMethods[${index}]`); return false; }
        ids.add(method.id);
        return true;
      });
    }
  }
  const rules = {
    preset: (v) => splitMethods(snapshot.settings).some(method => method.id === v) || (!snapshot.settings.splitMethods?.length && ['beginner', 'cfop', 'custom'].includes(v)),
    custom: (v) =>
      Array.isArray(v) &&
      v.length <= 12 &&
      v.every((name) => nonempty(name) && name.length <= 50) &&
      (settings.preset !== 'custom' || v.length >= 2),
    hold: (v) => Number.isFinite(v) && v >= 0 && v <= 2147483647,
    track: (v) => typeof v === 'boolean',
    orientation: (v) => typeof v === 'string' && validOrientation(...Object.values(orientationColors(v))),
    lessonOrientation: (v) => ['white-top', 'white-bottom'].includes(v),
    crossPosition: (v) => ['top', 'bottom'].includes(v),
    solveColors: (v) => ['neutral', 'white-yellow', 'white'].includes(v),
  };
  for (const [name, valid] of Object.entries(rules))
    if (settings[name] !== undefined && !valid(settings[name])) {
      issues.push(`settings.${name}`);
      snapshot.settings[name] = defaults()[name];
    }
  if (snapshot.settings.splitMethods) {
    const methods = snapshot.settings.splitMethods;
    if (!methods.some(method => method.id === snapshot.settings.preset)) snapshot.settings.preset = methods[0]?.id || 'beginner';
    if (!methods.length) snapshot.settings.track = false;
  }
  if (settings.lessonCaseSelections !== undefined) {
    if (!isObject(settings.lessonCaseSelections)) {
      issues.push('settings.lessonCaseSelections');
      snapshot.settings.lessonCaseSelections = {};
    } else {
      snapshot.settings.lessonCaseSelections = Object.fromEntries(
        Object.entries(settings.lessonCaseSelections).flatMap(([id, ids]) => {
          if (!Array.isArray(ids)) {
            issues.push(`settings.lessonCaseSelections.${id}`);
            return [];
          }
          const valid = ids.filter(nonempty);
          if (valid.length !== ids.length)
            issues.push(`settings.lessonCaseSelections.${id}`);
          return [[id, valid]];
        }),
      );
    }
  }
  return { snapshot, issues, checks };
}

const validate = validateSnapshot;

function reconcileRecovery(snapshot, checks) {
  for (const [collection, queue] of [
    ['solves', 'pending'],
    ['lessonAttempts', 'pendingLessons'],
  ]) {
    const history = new Map(snapshot[collection].map((s) => [s.id, s]));
    for (const pending of snapshot[queue]) {
      const saved = history.get(pending.id);
      if (!saved) continue;
      const a = checks.get(saved),
        b = checks.get(pending);
      if (!a.damagedFields.size && !b.damagedFields.size) continue;
      if (a.originalVersion === null || b.originalVersion === null) continue;
      if (b.originalVersion > a.originalVersion) {
        history.set(pending.id, pending);
      } else if (a.originalVersion === b.originalVersion) {
        for (const [target, source, targetCheck, sourceCheck] of [
          [saved, pending, a, b],
          [pending, saved, b, a],
        ]) {
          for (const name of targetCheck.damagedFields) {
            if (!sourceCheck.validFields.has(name)) continue;
            if (
              name === 'splits' &&
              source[name].some((step) => step.ms > target.ms)
            )
              continue;
            target[name] = source[name];
          }
        }
      }
    }
    snapshot[collection] = [...history.values()];
  }
}

/**
 * Browser storage boundary. `storage` may be a Storage object or a lazy getter
 * (useful when accessing window.localStorage itself throws); omitted means the
 * browser's localStorage. The v1 JSON shape is retained.
 *
 * read() -> {snapshot,state}; startup validation is cached per instance.
 * write(snapshot) -> {ok,state}; only true means this snapshot was persisted.
 * A successful explicit read() is required before any write. After a failed
 * startup read, retry read(), merge its snapshot into memory, then write().
 * getState() -> {status,persisted,error,recovery}; snapshots of persistent status.
 * recovery is null or {raw,issues,backupKey,backedUp}; raw is the exact damaged
 * value for download, independently of the caller's current in-memory snapshot.
 * read() never writes. A recovery backup must succeed before replacing damage.
 * `persisted` describes the last read/write, not edits the caller has not passed
 * to write(). A recovered status remains visible after successful saves.
 * Errors: read-failed, write-failed, backup-failed, or invalid-snapshot.
 * Backups live at `${key}:recovery` (then :1, :2, ...); never auto-delete them.
 */
export function createDeviceStorage({ storage, key = 'cube-studio-v1' } = {}) {
  let loaded = false,
    cached;
  let state = {
    status: 'unread',
    persisted: false,
    error: null,
    recovery: null,
  };
  const getStorage = () =>
    typeof storage === 'function'
      ? storage()
      : (storage ?? globalThis.localStorage);
  const getState = () => ({
    ...state,
    recovery: state.recovery
      ? { ...state.recovery, issues: [...state.recovery.issues] }
      : null,
  });
  function read({ fresh = false } = {}) {
    if (loaded && !fresh)
      return { snapshot: structuredClone(cached), state: getState() };
    let raw;
    try {
      raw = getStorage().getItem(key);
    } catch {
      state = {
        ...state,
        status: 'error',
        persisted: false,
        error: 'read-failed',
      };
      return { snapshot: validate({}).snapshot, state: getState() };
    }
    let value = {},
      parseFailed = false;
    if (raw !== null && raw !== undefined) {
      try {
        value = JSON.parse(raw);
      } catch {
        parseFailed = true;
      }
    }
    const { snapshot, issues, checks } = validate(value);
    if (issues.length) reconcileRecovery(snapshot, checks);
    if (parseFailed) issues.unshift('json');
    cached = snapshot;
    loaded = true;
    state = {
      status: issues.length || state.recovery ? 'recovered' : 'ready',
      persisted: !issues.length,
      error: null,
      recovery: issues.length
        ? { raw, issues, backupKey: null, backedUp: false }
        : state.recovery,
    };
    return { snapshot: structuredClone(cached), state: getState() };
  }
  function fail(error) {
    state = { ...state, status: 'error', persisted: false, error };
    return { ok: false, state: getState() };
  }
  function backup(target) {
    const recovery = state.recovery;
    if (!recovery) return;
    let suffix = 0,
      backupKey,
      existing;
    do {
      backupKey = `${key}:recovery${suffix ? ':' + suffix : ''}`;
      existing = target.getItem(backupKey);
      suffix++;
    } while (
      existing !== null &&
      existing !== undefined &&
      existing !== recovery.raw
    );
    recovery.backedUp = false;
    if (existing !== recovery.raw) target.setItem(backupKey, recovery.raw);
    recovery.backupKey = backupKey;
    recovery.backedUp = true;
  }
  function write(snapshot) {
    if (!loaded) return fail('read-failed');
    let serialized, validated;
    try {
      serialized = JSON.stringify(snapshot);
      validated = validate(JSON.parse(serialized));
      if (validated.issues.length) return fail('invalid-snapshot');
    } catch {
      return fail('invalid-snapshot');
    }
    let target;
    try {
      target = getStorage();
    } catch {
      return fail('write-failed');
    }
    try {
      backup(target);
    } catch {
      return fail('backup-failed');
    }
    try {
      target.setItem(key, serialized);
    } catch {
      return fail('write-failed');
    }
    cached = validated.snapshot;
    state = {
      ...state,
      status: state.recovery ? 'recovered' : 'ready',
      persisted: true,
      error: null,
    };
    return { ok: true, state: getState() };
  }
  return {
    read,
    write,
    getState,
    fail,
    unsaved() {
      state.persisted = false;
    },
  };
}
