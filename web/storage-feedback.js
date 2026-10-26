import { $ } from './dom.js';

export function initStorageFeedback({
  store,
  getSnapshot,
  retry,
  busy,
  notify,
}) {
  function render() {
    const { status, error, recovery, persisted } = store.getState();
    $('#storage-warning').hidden = status !== 'error' && !recovery;
    $('#retry-storage').hidden = persisted;
    $('#storage-message').textContent =
      error === 'read-failed'
        ? 'Could not read saved data. Keep this page open and retry before closing it. Existing history has not been replaced.'
        : status === 'error'
          ? 'Changes are not saved on this device. Keep this page open, retry saving, or download recovery data.'
          : recovery
            ? 'Recovered usable history from damaged saved data. Download recovery data to keep the original contents.'
            : '';
  }

  $('#retry-storage').onclick = () => {
    if (busy()) {
      notify('Finish or cancel your solve before retrying storage.');
      return;
    }
    retry();
  };

  $('#export-recovery').onclick = () => {
    if (busy()) {
      notify('Finish or cancel your solve before downloading recovery data.');
      return;
    }
    const recovery = store.getState().recovery;
    const data = {
      exportedAt: new Date().toISOString(),
      current: getSnapshot(),
      original: recovery?.raw ?? null,
      issues: recovery?.issues ?? [],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cube-studio-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify('Recovery data downloaded. Keep this file as a backup.');
  };

  return { render };
}
