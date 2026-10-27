import { createDeviceStorage, validateSnapshot } from './device-storage.js';

const collections = ['solves', 'pending', 'lessonAttempts', 'pendingLessons'];
const same = (a, b) => a === b || (a && b && a.updatedAt === b.updatedAt);
const requestValue = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const completed = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () =>
      reject(tx.error || Error('Storage transaction aborted'));
  });

// One row per record; the changes index lets an already-open tab read only rows
// changed since its last transaction. Both record changes and metadata commit
// atomically. Readwrite transactions also serialize writers across tabs.
export function createIndexedStorage({
  indexedDB = globalThis.indexedDB,
  storage = () => localStorage,
} = {}) {
  const legacy = createDeviceStorage({ storage });
  let opening,
    cached,
    revision = 0;
  let state = {
    status: 'unread',
    persisted: false,
    error: null,
    recovery: null,
  };
  const getState = () => ({ ...state });
  const fail = (error) => {
    state = { ...state, status: 'error', persisted: false, error };
    return { ok: false, state: getState() };
  };
  function open() {
    if (!opening)
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('cube-studio-history', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of collections)
            db.createObjectStore(name, { keyPath: 'id' });
          db.createObjectStore('meta');
          db.createObjectStore('changes', {
            keyPath: ['collection', 'id'],
          }).createIndex('revision', 'revision');
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(Error('History database is blocked'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            opening = null;
          };
          resolve(db);
        };
      }).catch((error) => {
        opening = null;
        throw error;
      });
    return opening;
  }
  async function transaction(transform) {
    const db = await open();
    const tx = db.transaction([...collections, 'meta', 'changes'], 'readwrite');
    const done = completed(tx);
    // Attach a handler immediately, including if an intermediate request fails.
    done.catch(() => {});
    try {
      const meta = tx.objectStore('meta');
      let info = await requestValue(meta.get('state'));
      let remote;
      if (!info) {
        const original = legacy.read({ fresh: true });
        if (original.state.error) throw Error('read-failed');
        remote = original.snapshot;
        // The exact original stays in localStorage and recovery is stored in the
        // same transaction as the migrated records. Never overwrite the backup.
        info = {
          revision: 0,
          settings: remote.settings,
          lessonSyncVersion: remote.lessonSyncVersion,
          recovery: original.state.recovery,
        };
        for (const name of collections)
          for (const value of remote[name]) tx.objectStore(name).put(value);
        meta.put(info, 'state');
      } else if (!cached) {
        remote = { ...info };
        await Promise.all(
          collections.map(async (name) => {
            remote[name] = await requestValue(tx.objectStore(name).getAll());
          }),
        );
      } else {
        remote = { ...cached, ...info };
        const changes = await requestValue(
          tx
            .objectStore('changes')
            .index('revision')
            .getAll(IDBKeyRange.lowerBound(revision, true)),
        );
        for (const name of collections) {
          const rows = new Map(cached[name].map((value) => [value.id, value]));
          for (const change of changes)
            if (change.collection === name) {
              if (change.value) rows.set(change.id, change.value);
              else rows.delete(change.id);
            }
          remote[name] = [...rows.values()];
        }
      }
      let result = transform ? transform(remote) : remote;
      let changed = false;
      const nextRevision = info.revision + 1;
      if (transform) {
        for (const name of collections) {
          const before = new Map(
            remote[name].map((value) => [value.id, value]),
          );
          const after = new Map(result[name].map((value) => [value.id, value]));
          for (const id of new Set([...before.keys(), ...after.keys()])) {
            const value = after.get(id);
            if (same(before.get(id), value) || (!before.has(id) && !value))
              continue;
            changed = true;
            if (value) {
              const checked = validateSnapshot({ [name]: [value] });
              if (checked.issues.length) throw Error('invalid-snapshot');
              tx.objectStore(name).put(value);
            } else tx.objectStore(name).delete(id);
            tx.objectStore('changes').put({
              collection: name,
              id,
              value: value || null,
              revision: nextRevision,
            });
          }
        }
        if (validateSnapshot({ settings: result.settings }).issues.length)
          throw Error('invalid-snapshot');
        changed ||=
          JSON.stringify(info.settings) !== JSON.stringify(result.settings) ||
          info.lessonSyncVersion !== result.lessonSyncVersion;
        if (changed) {
          info = {
            ...info,
            revision: nextRevision,
            settings: result.settings,
            lessonSyncVersion: result.lessonSyncVersion,
          };
          meta.put(info, 'state');
        }
      }
      await done;
      cached = result;
      revision = info.revision;
      state = {
        status: info.recovery ? 'recovered' : 'ready',
        persisted: true,
        error: null,
        recovery: info.recovery,
      };
      return { snapshot: result, changed };
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw error;
    }
  }
  // Serialize calls within a tab too: its cache/revision advances only on commit.
  let queue = Promise.resolve();
  function enqueue(transform) {
    const result = queue.then(() => transaction(transform));
    queue = result.catch(() => {});
    return result;
  }
  return {
    getState,
    fail,
    unsaved() {
      state.persisted = false;
    },
    async read() {
      try {
        return { ...(await enqueue()), state: getState() };
      } catch {
        fail('read-failed');
        return { snapshot: validateSnapshot({}).snapshot, state: getState() };
      }
    },
    async commit(transform) {
      try {
        return { ok: true, ...(await enqueue(transform)) };
      } catch (error) {
        return fail(
          ['read-failed', 'invalid-snapshot'].includes(error.message)
            ? error.message
            : 'write-failed',
        );
      }
    },
  };
}
