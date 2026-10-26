import { normalizeSolve } from './core.js';

export function createSync({
  getRecords,
  getPending,
  persist,
  onChange,
  onStatus,
  syncHeaders,
}) {
  let syncBusy = false,
    syncRequested = false,
    syncState = 'healthy',
    lastSync = 0;
  async function run() {
    if (syncBusy) {
      syncRequested = true;
      onStatus();
      return;
    }
    syncBusy = true;
    onStatus();
    try {
      do {
        syncRequested = false;
        if (!navigator.onLine) {
          syncState = 'offline';
          break;
        }
        try {
          const batch = [...getPending().values()];
          for (let i = 0; i < batch.length; i += 350) {
            const part = batch.slice(i, i + 350),
              r = await fetch('/api/solves', {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  ...syncHeaders(),
                },
                body: JSON.stringify({ solves: part }),
                redirect: 'manual',
                signal: AbortSignal.timeout(15000),
              });
            if (!r.ok) {
              if (
                r.status === 401 ||
                r.status === 403 ||
                r.type === 'opaqueredirect'
              )
                throw Error('sign-in');
              throw Error('Sync failed');
            }
            for (const s of part)
              if (getPending().get(s.id)?.updatedAt === s.updatedAt)
                getPending().delete(s.id);
            persist();
          }
          const r = await fetch('/api/solves', {
            headers: syncHeaders(),
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) {
            if (
              r.status === 401 ||
              r.status === 403 ||
              r.type === 'opaqueredirect'
            )
              throw Error('sign-in');
            if (r.status === 503) {
              const data = await r.json().catch(() => ({}));
              if (data.setupRequired) throw Error('setup');
            }
            throw Error('Unable to load shared storage');
          }
          const data = await r.json();
          for (const s of data.solves) {
            const local = getRecords().get(s.id);
            if (!local || s.updatedAt > local.updatedAt)
              getRecords().set(s.id, normalizeSolve(s));
          }
          persist();
          lastSync = Date.now();
          syncState = navigator.onLine ? 'healthy' : 'offline';
          onChange();
        } catch (e) {
          syncState =
            e.message === 'sign-in'
              ? 'auth'
              : e.message === 'setup'
                ? 'setup'
                : navigator.onLine
                  ? 'error'
                  : 'offline';
          if (!syncRequested) break;
        }
        onStatus();
      } while (syncRequested || getPending().size);
    } finally {
      syncBusy = false;
      onStatus();
    }
  }
  return {
    run,
    get state() {
      return syncState;
    },
    get busy() {
      return syncBusy;
    },
    get lastSuccess() {
      return lastSync;
    },
    offline() {
      syncState = 'offline';
      onStatus();
    },
  };
}
