import { $ } from './dom.js';
import { routeClick } from './routes.js';
import { CUBE_COLORS, cubeOrientationId, orientationColors, validOrientation, cubeSVG } from './cube.js';

export function initSettingsDialog({
  getSettings,
  save,
  busy,
  openDialog,
  toast,
  onOpen,
}) {
  const colorOptions = selected => Object.keys(CUBE_COLORS).map(color => `<option value="${color}" ${color === selected ? 'selected' : ''}>${color[0].toUpperCase() + color.slice(1)}</option>`).join('');
  function preview() {
    const top = $('#cube-top').value, front = $('#cube-front').value;
    $('#cube-front').innerHTML = Object.keys(CUBE_COLORS).filter(color => validOrientation(top, color)).map(color => `<option value="${color}" ${color === front ? 'selected' : ''}>${color[0].toUpperCase() + color.slice(1)}</option>`).join('');
    if (!validOrientation(top, front)) $('#cube-front').value = Object.keys(CUBE_COLORS).find(color => validOrientation(top, color));
    $('#settings-cube-preview').innerHTML = cubeSVG('', { orientation: cubeOrientationId(top, $('#cube-front').value) });
  }
  function open() {
    if (busy()) return;
    const {top, front} = orientationColors(getSettings().orientation);
    $('#cube-top').innerHTML = colorOptions(top);
    $('#cube-top').value = top;
    $('#cube-front').innerHTML = colorOptions(front);
    $('#cube-front').value = front;
    preview();
    $('#hold-duration').value = getSettings().hold / 1000;
    $('#lesson-orientation').value = getSettings().lessonOrientation;
    $('#solve-colors').value = getSettings().solveColors || 'white';
    openDialog('#settings-dialog');
    onOpen?.();
  }
  $('#open-settings').onclick = event => { if (routeClick(event)) open(); };
  $('#cube-top').onchange = preview;
  $('#cube-front').onchange = preview;
  $('#save-settings').onclick = () => {
    if (busy()) return;
    const top = $('#cube-top').value, front = $('#cube-front').value;
    if (!validOrientation(top, front)) {
      toast('Choose adjacent colors for the top and front.');
      return;
    }
    const hold = String($('#hold-duration').value).trim();
    if (hold === '' || !Number.isFinite(Number(hold)) || Number(hold) < 0 || Number(hold) > 1) {
      toast('Enter a hold time from 0 to 1 second.');
      $('#hold-duration').focus();
      return;
    }
    const lessonOrientation = $('#lesson-orientation').value === 'white-top' ? 'white-top' : 'white-bottom';
    const next = {
      ...getSettings(),
      orientation: cubeOrientationId(top, front),
      hold: Math.round(Number(hold) * 1000),
      lessonOrientation,
      crossPosition: lessonOrientation === 'white-top' ? 'top' : 'bottom',
      solveColors: $('#solve-colors').value,
    };
    save(next);
    $('#settings-dialog').close();
  };
  return { open };
}
