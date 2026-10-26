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
});

function record(value, path, issues, lesson) {
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
  const field = (name, valid, fallback) => {
    if (!valid(value[name])) {
      if (value[name] !== undefined) issues.push(`${path}.${name}`);
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
  return result;
}

function validate(value) {
  const issues = [];
  if (!isObject(value)) {
    issues.push('root');
    value = {};
  }
  const snapshot = { ...value };
  for (const name of ['solves', 'pending', 'lessonAttempts']) {
    if (value[name] !== undefined && !Array.isArray(value[name]))
      issues.push(name);
    snapshot[name] = Array.isArray(value[name])
      ? value[name]
          .map((item, i) =>
            record(item, `${name}[${i}]`, issues, name === 'lessonAttempts'),
          )
          .filter(Boolean)
      : [];
  }
  const settings = isObject(value.settings) ? value.settings : {};
  if (value.settings !== undefined && !isObject(value.settings))
    issues.push('settings');
  snapshot.settings = { ...defaults(), ...settings };
  const rules = {
    preset: (v) => ['beginner', 'cfop', 'custom'].includes(v),
    custom: (v) =>
      Array.isArray(v) &&
      v.length <= 12 &&
      v.every((name) => nonempty(name) && name.length <= 50) &&
      (settings.preset !== 'custom' || v.length >= 2),
    hold: (v) => Number.isFinite(v) && v >= 0 && v <= 2147483647,
    track: (v) => typeof v === 'boolean',
    orientation: (v) => ['white-top', 'white-bottom'].includes(v),
    lessonOrientation: (v) => ['white-top', 'white-bottom'].includes(v),
  };
  for (const [name, valid] of Object.entries(rules))
    if (settings[name] !== undefined && !valid(settings[name])) {
      issues.push(`settings.${name}`);
      snapshot.settings[name] = defaults()[name];
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
  return { snapshot, issues };
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
  function read() {
    if (loaded) return { snapshot: structuredClone(cached), state: getState() };
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
    const { snapshot, issues } = validate(value);
    if (parseFailed) issues.unshift('json');
    cached = snapshot;
    loaded = true;
    state = {
      status: issues.length ? 'recovered' : 'ready',
      persisted: !issues.length,
      error: null,
      recovery: issues.length
        ? { raw, issues, backupKey: null, backedUp: false }
        : null,
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
  return { read, write, getState };
}
