import { $, $$, esc } from './dom.js';
import {
  formatTime,
  result,
  parseTime,
  parseCSV,
  decodeCSV,
  exportCSV,
} from './core.js';

export function initHistoryDialogs({
  getRecords,
  getLessons,
  importRecords,
  updateSolve,
  addManual,
  allowManual,
  busy,
  openDialog,
  toast,
}) {
  let selected = null,
    imported = [];
  function openImport() {
    $('#settings-dialog').close();
    imported = [];
    $('#import-preview').textContent = '';
    $('#confirm-import').disabled = true;
    $('#csv-file').value = '';
    openDialog('#import-dialog');
  }
  $('#open-import').onclick = openImport;
  async function previewImport() {
    try {
      const file = $('#csv-file').files[0];
      if (!file) return;
      if (file.size > 5000000)
        throw Error('Please import a file smaller than 5 MB.');
      imported = parseCSV(decodeCSV(await file.arrayBuffer()));
      const duplicates = imported.filter(
        (s) => getRecords().has(s.id) || getLessons().has(s.id),
      ).length;
      $('#import-preview').textContent =
        `${imported.length} solves and lesson attempts found. ${duplicates} already in your history.`;
      $('#import-preview').className = 'info-box';
      $('#confirm-import').disabled = imported.length === duplicates;
    } catch (e) {
      imported = [];
      $('#import-preview').textContent = e.message;
      $('#confirm-import').disabled = true;
    }
  }
  $('#csv-file').onchange = previewImport;
  $('#confirm-import').onclick = () => {
    const count = importRecords(imported);
    $('#import-dialog').close();
    toast(`${count} solves and lesson attempts imported. Duplicates skipped.`);
  };
  function openSolve(id) {
    if (busy()) return;
    const s = getRecords().get(id);
    if (!s || s.deleted) return;
    selected = { ...s, splits: s.splits.map((x) => ({ ...x })) };
    $('#solve-title').textContent = 'Solve';
    $('#solve-note').value = s.note || '';
    renderSolveDetails();
    openDialog('#solve-dialog');
  }
  function renderSolveDetails() {
    const s = selected;
    $('#solve-details').innerHTML =
      `<div class="detail-time">${formatTime(result(s))}</div><div class="detail-date">${esc(new Date(s.date).toLocaleString())} ${s.penalty === '+2' ? '· raw time ' + formatTime(s.ms) : ''}</div><div class="detail-scramble">${esc(s.scramble || 'No scramble recorded')}</div>` +
      s.splits
        .map(
          (x, i) =>
            `<div class="detail-split"><span>${esc(x.name)}</span><span>${formatTime(x.ms - (s.splits[i - 1]?.ms || 0))}</span></div>`,
        )
        .join('');
    $$('[data-penalty]').forEach((b) =>
      b.classList.toggle('active', b.dataset.penalty === s.penalty),
    );
  }
  $$('[data-penalty]').forEach(
    (b) =>
      (b.onclick = () => {
        selected.penalty = b.dataset.penalty;
        renderSolveDetails();
      }),
  );
  $('#save-solve').onclick = () => {
    if (!selected) return;
    updateSolve({ ...selected, note: $('#solve-note').value });
    $('#solve-dialog').close();
    toast('Solve updated.');
  };
  $('#delete-solve').onclick = () => {
    if (!selected) return;
    const old = { ...selected };
    updateSolve({ ...selected, deleted: true });
    $('#solve-dialog').close();
    toast('Solve deleted.', () => updateSolve({ ...old, deleted: false }));
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-id]');
    if (el) openSolve(el.dataset.id);
  });
  $('#manual-entry').onclick = () => {
    if (!allowManual()) return;
    $('#manual-time').value = '';
    $('#manual-error').textContent = '';
    openDialog('#manual-dialog');
  };
  $('#save-manual').onclick = () => {
    if (!allowManual()) return;
    try {
      const ms = parseTime($('#manual-time').value);
      addManual(ms);
      $('#manual-dialog').close();
      toast('Solve added.');
    } catch (e) {
      $('#manual-error').textContent = e.message;
    }
  };
  $('#manual-time').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#save-manual').click();
    }
  };
  $('#export').onclick = () => {
    const blob = new Blob(
        [
          '\uFEFF' +
            exportCSV(
              [...getRecords().values(), ...getLessons().values()].filter(
                (s) => !s.deleted,
              ),
            ),
        ],
        {
          type: 'text/csv;charset=utf-8',
        },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `cube-studio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('CSV exported.');
  };
  return { openSolve };
}
