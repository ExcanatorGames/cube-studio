import { $ } from './dom.js';
import { CUBE_COLORS, cubeOrientationId, orientationColors, validOrientation, cubeSVG } from './cube.js';

export function initSettingsDialog({
  getSettings,
  save,
  busy,
  openDialog,
  toast,
}) {
  const colorOptions = selected => Object.keys(CUBE_COLORS).map(color => `<option value="${color}" ${color === selected ? 'selected' : ''}>${color[0].toUpperCase() + color.slice(1)}</option>`).join('');
  function preview() {
    const top = $('#cube-top').value, front = $('#cube-front').value;
    $('#cube-front').innerHTML = Object.keys(CUBE_COLORS).filter(color => validOrientation(top, color)).map(color => `<option value="${color}" ${color === front ? 'selected' : ''}>${color[0].toUpperCase() + color.slice(1)}</option>`).join('');
    if (!validOrientation(top, front)) $('#cube-front').value = Object.keys(CUBE_COLORS).find(color => validOrientation(top, color));
    $('#settings-cube-preview').innerHTML = cubeSVG('', { orientation: cubeOrientationId(top, $('#cube-front').value) });
  }
  $('#open-settings').onclick = () => {
    if (busy()) return;
    const {top, front} = orientationColors(getSettings().orientation);
    $('#cube-top').innerHTML = colorOptions(top);
    $('#cube-top').value = top;
    $('#cube-front').innerHTML = colorOptions(front);
    $('#cube-front').value = front;
    preview();
    $('#hold-duration').value = getSettings().hold;
    $('#lesson-orientation').value = getSettings().lessonOrientation;
    $('#solve-colors').value = getSettings().solveColors || 'white';
    openDialog('#settings-dialog');
  };
  $('#cube-top').onchange = preview;
  $('#cube-front').onchange = preview;
  $('#save-settings').onclick = () => {
    if (busy()) return;
    const top = $('#cube-top').value, front = $('#cube-front').value;
    if (!validOrientation(top, front)) {
      toast('Choose adjacent colors for the top and front.');
      return;
    }
    const lessonOrientation = $('#lesson-orientation').value === 'white-top' ? 'white-top' : 'white-bottom';
    const next = {
      ...getSettings(),
      orientation: cubeOrientationId(top, front),
      hold: Number($('#hold-duration').value),
      lessonOrientation,
      crossPosition: lessonOrientation === 'white-top' ? 'top' : 'bottom',
      solveColors: $('#solve-colors').value,
    };
    save(next);
    $('#settings-dialog').close();
  };
}
