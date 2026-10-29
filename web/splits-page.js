import { $, esc } from './dom.js';
import { splitMethods, validSplitSteps } from './split-methods.js';

export function initSplitsPage({ getSettings, save, busy, toast, openDialog }) {
  let editing = null;
  function edit(id = null) {
    if (busy()) return;
    editing = id;
    const method = splitMethods(getSettings()).find(method => method.id === id);
    $('#split-editor-title').textContent = method ? 'Edit split list' : 'New split list';
    $('#split-name').value = method?.name || '';
    $('#split-words').value = method?.steps.join('\n') || '';
    $('#split-editor-error').textContent = '';
    openDialog('#split-editor-dialog');
  }
  function render() {
    const settings = getSettings(), methods = splitMethods(settings);
    $('#split-tracking').checked = settings.track;
    $('#split-method-list').innerHTML = methods.length ? methods.map(method => `<article class="split-method-card${settings.preset === method.id ? ' selected' : ''}">
      <div class="card-top"><h2>${esc(method.name)}</h2><button type="button" class="small-button" data-use="${esc(method.id)}" aria-pressed="${settings.preset === method.id}">${settings.preset === method.id ? 'Selected' : 'Use for timer'}</button></div>
      <ol class="split-word-list">${method.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
      <div class="split-method-actions"><button type="button" class="text-button" data-edit="${esc(method.id)}" aria-label="Edit ${esc(method.name)}">Edit</button><button type="button" class="text-button" data-delete="${esc(method.id)}" aria-label="Delete ${esc(method.name)}">Delete</button></div>
    </article>`).join('') : '<p class="empty">Create a split list to start tracking your steps.</p>';
  }
  $('#new-split-method').onclick = () => edit();
  $('#split-method-list').onclick = event => {
    if (busy()) return;
    const button = event.target.closest('button');
    if (!button) return;
    const settings = getSettings(), methods = splitMethods(settings);
    if (button.dataset.edit) edit(button.dataset.edit);
    if (button.dataset.use) {
      save({ ...settings, splitMethods: methods, preset: button.dataset.use });
      toast('Split list selected for the timer.');
    }
    if (button.dataset.delete) {
      const remaining = methods.filter(method => method.id !== button.dataset.delete);
      save({ ...settings, splitMethods: remaining, preset: settings.preset === button.dataset.delete ? remaining[0]?.id || 'beginner' : settings.preset, track: remaining.length ? settings.track : false });
    }
  };
  $('#split-tracking').onchange = () => {
    if (busy()) return;
    if ($('#split-tracking').checked && !splitMethods(getSettings()).length) {
      $('#split-tracking').checked = false;
      toast('Create a split list first.');
      return;
    }
    save({ ...getSettings(), track: $('#split-tracking').checked });
  };
  $('#save-split-method').onclick = async () => {
    if (busy() || $('#save-split-method').disabled) return;
    const name = $('#split-name').value.trim();
    const steps = $('#split-words').value.split(/[,\n]/).map(word => word.trim()).filter(Boolean);
    if (!name || name.length > 60 || !validSplitSteps(steps)) {
      $('#split-editor-error').textContent = 'Give the list a name and add 1–12 steps, each up to 50 characters.';
      return;
    }
    const settings = getSettings(), methods = splitMethods(settings);
    if (editing && !methods.some(method => method.id === editing)) {
      $('#split-editor-error').textContent = 'This list was deleted in another tab. Close this editor and create a new list.';
      return;
    }
    const method = { id: editing || crypto.randomUUID(), name, steps };
    const next = editing ? methods.map(item => item.id === editing ? method : item) : [...methods, method];
    editing = method.id;
    $('#save-split-method').disabled = true;
    $('#save-split-method').textContent = 'Saving…';
    try {
      const saved = await save({ ...settings, splitMethods: next, preset: methods.length ? settings.preset : method.id });
      if (saved === false) $('#split-editor-error').textContent = 'The list is still in memory. Retry saving before closing.';
      else $('#split-editor-dialog').close();
    } finally {
      $('#save-split-method').disabled = false;
      $('#save-split-method').textContent = 'Save split list';
    }
  };
  return render;
}
