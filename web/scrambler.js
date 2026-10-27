// Keep initialization and solver search off the UI thread. Each caller receives
// its own result; app navigation can discard superseded results independently.
export function createScrambler({
  workerFactory = () => new Worker('/scramble-worker.js', { type: 'module' }),
  timeoutMs = 30000,
} = {}) {
  let worker,
    sequence = 0;
  const pending = new Map();
  function reset(error) {
    worker?.terminate();
    worker = null;
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
  }
  return {
    next() {
      return new Promise((resolve, reject) => {
        if (!worker) {
          worker = workerFactory();
          worker.onerror = () => reset(Error('Scrambler unavailable'));
          worker.onmessage = ({ data }) => {
            const request = pending.get(data.id);
            if (!request) return;
            pending.delete(data.id);
            clearTimeout(request.timeout);
            if (data.error) request.reject(Error(data.error));
            else request.resolve(data.scramble);
          };
        }
        const id = ++sequence;
        pending.set(id, {
          resolve,
          reject,
          timeout: setTimeout(
            () => reset(Error('Scrambler timed out')),
            timeoutMs,
          ),
        });
        try {
          worker.postMessage(id);
        } catch (error) {
          reset(error);
        }
      });
    },
  };
}
