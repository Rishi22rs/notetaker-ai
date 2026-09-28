const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('hold-to-resize clamps size and release restores click-through', () => {
  let tick;
  let held = false;
  let down = false;
  let cursor = { x: 410, y: 290 };
  let bounds = { x: 0, y: 0, width: 420, height: 300 };
  let ignored = true;
  const window = {
    isDestroyed: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (next) => { bounds = next; },
    setPosition: (x, y) => { bounds = { ...bounds, x, y }; },
    setIgnoreMouseEvents: (value) => { ignored = value; },
    setFocusable() {},
    focus() {},
    webContents: { send() {} }
  };
  const context = {
    __dirname, process: { platform: 'win32' }, setInterval(fn) { tick = fn; }, clearInterval() {},
    require(name) {
      if (name === './captions') return () => ({});
      if (name === 'koffi') return { load: () => ({ func: () => (key) =>
        (key === 1 ? down : held) ? 0x8000 : 0 }) };
      if (name === 'electron') return {
        app: { whenReady: () => ({ then: () => ({ catch() {} }) }), on() {} },
        screen: { getCursorScreenPoint: () => cursor },
        ipcMain: { handle() {}, on() {} }
      };
      return require(name);
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./main'), 'utf8'), context);
  vm.runInContext('browseMode = false;', context);
  context.enableHoldToDrag(window);
  held = true;
  tick();
  assert.equal(ignored, false);
  down = true;
  tick();
  cursor = { x: 510, y: 390 };
  tick();
  assert.equal(bounds.width, 520);
  assert.equal(bounds.height, 400);
  cursor = { x: -1000, y: -1000 };
  tick();
  assert.equal(bounds.width, 300);
  assert.equal(bounds.height, 220);
  held = false;
  tick();
  assert.equal(ignored, true);
  cursor = { x: 900, y: 900 };
  tick();
  assert.equal(bounds.width, 300);
});

test('embedded browser modifier wheel scrolls the page without zooming', () => {
  let interaction;
  let wheel;
  const page = { scrollTop: 100, clientHeight: 200 };
  vm.runInNewContext(fs.readFileSync(require.resolve('./browser-preload'), 'utf8'), {
    require: () => ({ ipcRenderer: { on(_name, fn) { interaction = fn; } } }),
    window: { addEventListener(_name, fn) { wheel = fn; } },
    Element: class {},
    document: { documentElement: page, scrollingElement: page }
  });
  let prevented = false;
  interaction(null, true);
  wheel({ ctrlKey: true, shiftKey: true, deltaMode: 0, deltaY: 50, deltaX: 0, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(page.scrollTop, 150);
  interaction(null, false);
  prevented = false;
  wheel({ deltaY: 50, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
});
