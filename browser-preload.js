const { ipcRenderer } = require('electron');
let interactive = false;
ipcRenderer.on('overlay:interactive', (_event, enabled) => { interactive = enabled; });

// Keep Ctrl+Shift-wheel usable in nested page scroll containers.
window.addEventListener('wheel', (event) => {
  if (!interactive || !event.ctrlKey || !event.shiftKey) return;
  event.preventDefault();
  let target = event.target instanceof Element ? event.target : document.documentElement;
  while (target && target !== document.documentElement) {
    if (target.scrollHeight > target.clientHeight && /auto|scroll/.test(getComputedStyle(target).overflowY)) break;
    target = target.parentElement;
  }
  target = target || document.scrollingElement;
  if (!target) return;
  const unit = event.deltaMode === 1 ? 21 : event.deltaMode === 2 ? target.clientHeight : 1;
  target.scrollTop += (event.deltaY || event.deltaX) * unit;
}, { capture: true, passive: false });
