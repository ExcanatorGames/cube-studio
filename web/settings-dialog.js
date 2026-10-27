import { $ } from './dom.js';

export function initSettingsDialog({
  getSettings,
  save,
  busy,
  openDialog,
  toast,
}) {
  $('#open-settings').onclick = () => {
    if (busy()) return;
    $('#preset').value = getSettings().preset;
    $('#custom-steps').value = getSettings().custom.join(', ');
    $('#custom-field').hidden = getSettings().preset !== 'custom';
    $('#hold-duration').value = getSettings().hold;
    $('#lesson-orientation').value = getSettings().lessonOrientation;
    openDialog('#settings-dialog');
  };
  $('#preset').onchange = () =>
    ($('#custom-field').hidden = $('#preset').value !== 'custom');
  $('#save-settings').onclick = () => {
    if (busy()) return;
    const preset = $('#preset').value;
    const custom =
      preset === 'custom'
        ? $('#custom-steps')
            .value.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : getSettings().custom;
    if (
      preset === 'custom' &&
      (custom.length < 2 ||
        custom.length > 12 ||
        custom.some((x) => x.length > 50))
    ) {
      toast('Use 2–12 steps, with names under 50 characters.');
      return;
    }
    const next = {
      ...getSettings(),
      preset,
      custom,
      hold: Number($('#hold-duration').value),
      lessonOrientation:
        $('#lesson-orientation').value === 'white-top'
          ? 'white-top'
          : 'white-bottom',
    };
    save(next);
    $('#settings-dialog').close();
  };
}
