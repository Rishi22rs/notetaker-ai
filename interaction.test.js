const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('hold-to-resize clamps size and release restores click-through', () => {
  let tick;
  let held = false;
  let down = false;
  let cursor = { x: 630, y: 290 };
  let bounds = { x: 0, y: 0, width: 640, height: 300 };
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
  cursor = { x: 730, y: 390 };
  tick();
  assert.equal(bounds.width, 740);
  assert.equal(bounds.height, 400);
  cursor = { x: -1000, y: -1000 };
  tick();
  assert.equal(bounds.width, 620);
  assert.equal(bounds.height, 220);
  held = false;
  tick();
  assert.equal(ignored, true);
  cursor = { x: 900, y: 900 };
  tick();
  assert.equal(bounds.width, 620);
});

test('window opens at 65 percent of the usable display', () => {
  const source = fs.readFileSync(require.resolve('./main'), 'utf8');
  assert.match(source, /area\.width \* 0\.65/);
  assert.match(source, /area\.height \* 0\.65/);
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

test('computer transcript bubbles expose a manual answer fallback', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  assert.match(rendererSource, /function addManualAnswerButton/);
  assert.match(rendererSource, /Answer this manually/);
  assert.match(rendererSource, /answerTranscriptTurnManually/);
  assert.match(rendererSource, /retrieveInterviewContext/);
  assert.match(rendererSource, /generateInterviewAnswer/);
});

test('account menu exposes locally persisted independent appearance controls', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const htmlSource = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  assert.match(htmlSource, /id="show-account"/);
  assert.match(htmlSource, /Privacy Policy/);
  assert.match(htmlSource, /Terms &amp; Conditions/);
  assert.match(htmlSource, /class="logout"/);
  assert.match(htmlSource, /id="app-opacity"/);
  assert.match(htmlSource, /id="text-opacity"/);
  assert.match(rendererSource, /local-ai-appearance-v1/);
  assert.match(rendererSource, /--app-opacity/);
  assert.match(rendererSource, /--text-opacity/);
  assert.match(htmlSource, /\.interview-questions[^}]+var\(--app-opacity\)/s);
  assert.match(htmlSource, /\.question-suggestion-group[^}]+var\(--app-opacity\)/s);
  assert.match(htmlSource, /\.interview-question-suggestion[^}]+var\(--app-opacity\)/s);
  assert.match(htmlSource, /#send[^}]+var\(--accent-bg\)/s);
  assert.match(htmlSource, /\.audio-toggle\[aria-pressed="true"\][^}]+var\(--accent-bg\)/s);
});
