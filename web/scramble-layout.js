import { $ } from './dom.js';
import { scrambleLines } from './cube.js';

export function createScrambleLayout(getScramble) {
  const scrambleMeasure = document.createElement('canvas').getContext('2d');
  let layoutKey = '';
  function layoutScramble() {
    const scramble = getScramble();
    if (!scramble) return;
    const targets = [$('#fullscreen-scramble')].filter(
      (target) => target.clientWidth,
    );
    const layouts = targets.map((target) => {
      const style = getComputedStyle(target);
      let capacity = Infinity;
      if (
        target.id === 'fullscreen-scramble' ||
        matchMedia('(max-width:740px)').matches
      ) {
        if (scrambleMeasure)
          scrambleMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const charWidth =
          scrambleMeasure?.measureText('M').width ||
          parseFloat(style.fontSize) * 0.62;
        capacity = Math.max(
          3,
          Math.floor(
            (target.clientWidth - 2) /
              (charWidth + (parseFloat(style.letterSpacing) || 0)),
          ),
        );
      }
      return { target, capacity };
    });
    const key = `${scramble}|${layouts.map(({ target, capacity }) => target.id + ':' + capacity).join('|')}`;
    if (key === layoutKey) return;
    layoutKey = key;
    for (const { target, capacity } of layouts) {
      const lines = scrambleLines(scramble, capacity);
      target.replaceChildren();
      let moveIndex = 0;
      lines.forEach((line, i) => {
        if (i) target.append(' ');
        const span = document.createElement('span');
        span.className = 'scramble-line';
        line.split(' ').forEach((token, j) => {
          if (j) span.append(' ');
          const move = document.createElement('span');
          move.className = 'scramble-move';
          move.style.setProperty('--focus-move', 'focus-move-' + moveIndex++);
          move.textContent = token;
          span.append(move);
        });
        target.append(span);
      });
    }
  }
  const scrambleObserver = new ResizeObserver(() =>
    requestAnimationFrame(layoutScramble),
  );
  scrambleObserver.observe($('#fullscreen-scramble'));
  document.fonts?.ready.then(layoutScramble);
  return layoutScramble;
}
