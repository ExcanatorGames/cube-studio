import { $, $$, esc } from './dom.js';

export function initTimerSplitPicker({ select }) {
  const trigger = $('#timer-split-method');
  const menu = $('#timer-split-menu');
  const options = $('#timer-split-options');
  let focusEdge = null;

  function position() {
    const bounds = $('#timer-split-control').getBoundingClientRect();
    const width = Math.min(Math.max(240, bounds.width), innerWidth - 24, bounds.right - 12);
    const top = bounds.bottom + 6;
    menu.style.width = width + 'px';
    menu.style.left = Math.max(12, Math.min(bounds.right - width, innerWidth - width - 12)) + 'px';
    menu.style.top = top + 'px';
    menu.style.maxHeight = Math.max(80, Math.min(360, innerHeight - top - 12)) + 'px';
  }

  menu.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') position();
  });
  menu.addEventListener('toggle', event => {
    const open = event.newState === 'open';
    trigger.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const buttons = $$('#timer-split-options button');
    const target = focusEdge === 'first' ? buttons[0]
      : focusEdge === 'last' ? buttons.at(-1)
        : buttons.find(button => button.getAttribute('aria-checked') === 'true') || buttons[0];
    focusEdge = null;
    target?.focus();
  });
  trigger.onkeydown = event => {
    if (trigger.disabled || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    focusEdge = event.key === 'ArrowDown' ? 'first' : 'last';
    menu.showPopover();
  };
  menu.onkeydown = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = $$('#timer-split-options button');
    const current = buttons.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  menu.onclick = event => {
    const button = event.target.closest('[data-split-method]');
    if (!button || trigger.disabled) return;
    menu.hidePopover();
    select(button.dataset.splitMethod);
    trigger.focus();
  };
  window.addEventListener('resize', () => {
    if (trigger.getAttribute('aria-expanded') === 'true') position();
  });

  return {
    render({ methods, selected, disabled }) {
      const html = methods.map(method => `<button type="button" role="menuitemradio" aria-checked="${method.id === selected?.id}" data-split-method="${esc(method.id)}"><span>${esc(method.name)}</span><span class="split-menu-check" aria-hidden="true">✓</span></button>`).join('');
      if (options.innerHTML !== html) options.innerHTML = html;
      trigger.title = selected ? `Choose a split list · ${selected.name}` : 'Create a list in the Splits tab';
      trigger.disabled = disabled;
      if (disabled) menu.hidePopover();
    },
  };
}
