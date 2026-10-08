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
  assert.match(rendererSource, /Answer anyway/);
  assert.doesNotMatch(rendererSource, /button\.textContent = '[↗↻]'/);
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
  assert.match(htmlSource, /<section class="settings-view"[\s\S]*id="model"[\s\S]*id="model-download"/);
  assert.match(htmlSource, /id="settings-tab-appearance"/);
  assert.match(htmlSource, /id="settings-tab-ai"/);
  assert.match(rendererSource, /function setSettingsTab/);
  const headerMarkup = htmlSource.match(/<header>[\s\S]*?<\/header>/)?.[0] || '';
  assert.doesNotMatch(headerMarkup, /id="model"/);
  assert.match(rendererSource, /modelSelect\.hidden = !settingsOpen/);
  assert.match(rendererSource, /local-ai-appearance-v1/);
  assert.match(rendererSource, /--app-opacity/);
  assert.match(rendererSource, /--text-opacity/);
  assert.match(htmlSource, /\.interview-questions[^}]+var\(--app-opacity\)/s);
  assert.match(htmlSource, /\.question-suggestion-group[^}]+var\(--app-opacity\)/s);
  assert.match(htmlSource, /\.interview-question-suggestion[^}]+var\(--app-opacity\)/s);
  assert.match(htmlSource, /#send[^}]+var\(--accent-bg\)/s);
  assert.match(htmlSource, /\.audio-toggle\[aria-pressed="true"\][^}]+var\(--accent-bg\)/s);
});

test('logout clears user workspace data before ending the session', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  assert.match(rendererSource, /async function clearLocalUserWorkspace/);
  assert.match(rendererSource, /localStorage\.removeItem\(STORAGE_KEY\)/);
  assert.match(rendererSource, /resetTranscriptHistory\(\)/);
  assert.match(rendererSource, /window\.overlay\.saveNotes\(''\)/);
  assert.match(rendererSource, /window\.overlay\.saveContext\(contextState\)/);
  assert.match(rendererSource, /await clearLocalUserWorkspace\(\);\s*applyAuthState\(await window\.overlay\.logout\(\)\)/s);
});

test('account popover opens a dedicated recharge and offers screen', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const htmlSource = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  const serverSource = fs.readFileSync(require.resolve('./server/auth-server'), 'utf8');
  assert.match(htmlSource, /id="coupon-form"/);
  assert.match(htmlSource, /id="coupon-code"/);
  assert.match(htmlSource, /id="open-offers"/);
  assert.match(htmlSource, /id="offers-view"/);
  assert.match(htmlSource, /\.offers-view \.coupon-row, \.offers-view \.recharge-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(htmlSource, /\.offers-view #coupon-code, \.offers-view #recharge-plan \{ display: block; width: 100%; min-width: 0; height: 42px;/);
  assert.match(htmlSource, /#composer \{ width: 100%;[\s\S]*grid-template-columns: minmax\(0, 1fr\) 62px;/);
  assert.doesNotMatch(htmlSource, /\n    form \{ width: 100%;/);
  assert.match(rendererSource, /openOffers\.addEventListener\('click'/);
  assert.match(rendererSource, /setView\('offers'\)/);
  assert.match(rendererSource, /loadPaymentPlans\(\);/);
  assert.match(rendererSource, /Payment server is unavailable\. Start it, then reopen this screen\./);
  assert.match(rendererSource, /function couponErrorMessage/);
  assert.match(rendererSource, /This coupon has already been redeemed on your account\./);
  assert.match(rendererSource, /couponStatus\.textContent = couponErrorMessage\(error\)/);
  assert.match(rendererSource, /form\.hidden = notesOpen \|\| contextOpen \|\| summaryOpen \|\| settingsOpen \|\| offersOpen \|\| !sessionActive/);
  assert.match(rendererSource, /promptSuggestions\.hidden = notesOpen \|\| contextOpen \|\| summaryOpen \|\| settingsOpen \|\| offersOpen/);
  assert.match(htmlSource, /\.panel\.offers-mode #composer, \.panel\.offers-mode #prompt-suggestions \{ display: none !important; \}/);
  assert.match(rendererSource, /window\.overlay\.redeemCoupon\(code\)/);
  assert.match(serverSource, /url\.pathname === '\/coupons\/redeem'/);
  assert.match(serverSource, /benefitType === 'free_seconds'/);
  assert.match(serverSource, /benefitType === 'percent_off'/);
});

test('dedicated offers screen provides server-defined recharge plans and wallet balance', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const htmlSource = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  assert.match(htmlSource, /id="wallet-balance"/);
  assert.match(htmlSource, /id="recharge-plan"/);
  assert.match(rendererSource, /window\.overlay\.getPaymentPlans\(\)/);
  assert.match(rendererSource, /window\.overlay\.startRecharge\(rechargePlan\.value\)/);
  assert.match(rendererSource, /result\.status === 'credited'/);
});

test('microphone can be enabled without a headphone check and keeps echo cancellation', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const htmlSource = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  assert.match(rendererSource, /microphone: false/);
  assert.doesNotMatch(rendererSource, /checkHeadphones|detectHeadphones|requestHeadphones|HEADPHONE_NAME/);
  assert.doesNotMatch(htmlSource, /headphone-gate|Connect headphones first/);
  assert.match(rendererSource, /echoCancellation: true/);
});

test('starting transcription activates usage before requesting audio', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const start = rendererSource.indexOf('async function startLiveTranscription()');
  const end = rendererSource.indexOf('async function stopLiveTranscription()', start);
  const source = rendererSource.slice(start, end);
  assert.ok(source.indexOf('await ensureUsageSession()') < source.indexOf('permissionStreams.computer'));
});
