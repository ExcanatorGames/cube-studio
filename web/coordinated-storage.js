const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const index = (values = []) =>
  new Map(values.map((value) => [value.id, value]));

export function mergeSnapshots(base, local, remote) {
  const merged = { ...remote, lessonSyncVersion: local.lessonSyncVersion };
  for (const [history, queue] of [
    ['solves', 'pending'],
    ['lessonAttempts', 'pendingLessons'],
  ]) {
    const records = index(remote[history]);
    for (const value of [
      ...(remote[queue] || []),
      ...(local[history] || []),
      ...(local[queue] || []),
    ]) {
      const current = records.get(value.id);
      if (!current || value.updatedAt > current.updatedAt)
        records.set(value.id, value);
    }
    const previous = index(base[queue]),
      pending = index(
        queue === 'pendingLessons' && remote.lessonSyncVersion !== 1
          ? [...(remote.lessonAttempts || []), ...(remote[queue] || [])]
          : remote[queue],
      );
    const current = index(local[queue]);
    for (const id of new Set([...previous.keys(), ...current.keys()])) {
      const before = previous.get(id),
        value = current.get(id),
        other = pending.get(id);
      if (equal(before, value)) continue;
      if (!value) {
        if (other && other.updatedAt <= before.updatedAt) pending.delete(id);
      } else if (!other || value.updatedAt > other.updatedAt)
        pending.set(id, value);
    }
    for (const [id, value] of pending) {
      const winner = records.get(id);
      if (
        winner &&
        winner.updatedAt >= value.updatedAt &&
        !equal(winner, value)
      )
        pending.delete(id);
    }
    merged[history] = [...records.values()];
    merged[queue] = [...pending.values()];
  }
  merged.settings = { ...remote.settings };
  for (const [key, value] of Object.entries(local.settings || {})) {
    if (key === 'lessonCaseSelections') {
      merged.settings[key] = { ...remote.settings?.[key] };
      for (const [lesson, ids] of Object.entries(value)) {
        if (!equal(ids, base.settings?.[key]?.[lesson]))
          merged.settings[key][lesson] = ids;
      }
    } else if (!equal(value, base.settings?.[key]))
      merged.settings[key] = value;
  }
  return merged;
}

// IndexedDB readwrite transactions serialize across tabs too. This fallback
// supports browsers/contexts without Web Locks; the callback must be synchronous.
function databaseLock(callback) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cube-studio-coordination', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('lock');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Storage coordination blocked'));
    request.onsuccess = () => {
      const db = request.result,
        transaction = db.transaction('lock', 'readwrite');
      let result;
      transaction.objectStore('lock').get('writer').onsuccess = () => {
        try {
          result = callback();
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

export function createCoordinatedStorage({
  store,
  initial,
  getSnapshot,
  apply,
  onChange,
  locks,
}) {
  let base = structuredClone(initial),
    outstanding = 0;
  function save() {
    outstanding++;
    store.unsaved();
    const transaction = () => {
      const { snapshot: remote, state } = store.read({ fresh: true });
      if (state.error) return false;
      const merged = mergeSnapshots(base, getSnapshot(), remote);
      if (!store.write(merged).ok) return false;
      base = structuredClone(merged);
      apply(merged);
      return true;
    };
    let result;
    try {
      result = locks?.request
        ? locks.request('cube-studio-storage', transaction)
        : databaseLock(transaction);
    } catch {
      store.fail('write-failed');
      result = false;
    }
    const finish = (ok) => {
      outstanding--;
      onChange();
      return ok;
    };
    if (!result?.then) return finish(result);
    return result.then(finish, () => {
      store.fail('write-failed');
      return finish(false);
    });
  }
  return {
    save,
    get busy() {
      return outstanding > 0;
    },
  };
}
