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

test('only the latest computer line has an answer action below it', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  assert.match(rendererSource, /function addManualAnswerButton/);
  assert.match(rendererSource, /button\.textContent = 'Answer it'/);
  assert.match(rendererSource, /if \(!row\.contains\(oldButton\)\) oldButton\.remove\(\)/);
  assert.match(rendererSource, /row\.append\(button\)/);
  assert.doesNotMatch(rendererSource, /button\.textContent = '[↗↻]'/);
  assert.match(rendererSource, /answerTranscriptTurnManually/);
  assert.match(rendererSource, /retrieveInterviewContext/);
  assert.match(rendererSource, /generateInterviewAnswer/);
});

test('live answer waits for continuation and cancels when interviewer resumes', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  assert.match(source, /const CAPTION_PAUSE_MS = 7000/);
  assert.match(source, /answerStartTimer = setTimeout\(\(\) => \{[\s\S]*?\}, 200\)/);
  assert.match(source, /event\.speaker === 'computer' && latestComputerTurnEndedAt && capturedAt > latestComputerTurnEndedAt/);
  assert.match(source, /pendingComputerContinuation/);
});

test('interrupted AI answer cards are removed instead of left empty', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const functionSource = source.match(/function cancelUnfinishedInterviewAnswer\(keepTurnId = null\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  let removed = false;
  const result = vm.runInNewContext(`${functionSource}\ncancelUnfinishedInterviewAnswer(); activeInterviewAnswerTurnId`, {
    selectedAnswerId: null,
    updateAnswerNavigation() {},
    activeInterviewAnswerTurnId: 'old-question',
    cancelInterviewAnswer() {},
    transcriptFeed: { querySelectorAll: () => [{
      dataset: { turnId: 'old-question' },
      querySelector: () => ({}),
      remove() { removed = true; }
    }] }
  });
  assert.equal(result, null);
  assert.equal(removed, true);
});

test('typed interview questions and replies remain in the live conversation context', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const htmlSource = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  assert.doesNotMatch(htmlSource, /id="show-chat"/);
  assert.match(htmlSource, /id="show-home"/);
  assert.doesNotMatch(htmlSource, /id="show-transcript"/);
  assert.match(htmlSource, /<!-- Follow-up question suggestions are paused for now\./);
  assert.match(rendererSource, /appendTypedMessage\(userTurn\)/);
  assert.match(rendererSource, /appendTypedMessage\(assistantTurn\)/);
  const functionSource = rendererSource.match(/function interviewChatMessages\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  const messages = vm.runInNewContext(`${functionSource}\ninterviewChatMessages()`, {
    preferredCodeLanguage: '',
    transcriptContext: [
      { speaker: 'computer', text: 'Tell me about React.' },
      { speaker: 'user', source: 'typed', text: 'Use JavaScript in my answers.' },
      { speaker: 'assistant', text: 'I will use JavaScript.' },
      { speaker: 'user', source: 'typed', text: 'What about hooks?' },
      { speaker: 'assistant', text: '', pending: true }
    ]
  });
  assert.deepEqual(Array.from(messages, (item) => item.role), ['system', 'user', 'user', 'assistant', 'user']);
  assert.match(messages.at(-1).content, /What about hooks/);
  assert.match(messages[2].content, /Use JavaScript/);
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
  assert.match(htmlSource, /<section class="settings-view"[\s\S]*id="model"/);
  assert.match(htmlSource, /id="settings-tab-appearance"/);
  assert.match(htmlSource, /id="settings-tab-ai"/);
  assert.match(rendererSource, /function setSettingsTab/);
  const headerMarkup = htmlSource.match(/<header>[\s\S]*?<\/header>/)?.[0] || '';
  assert.doesNotMatch(headerMarkup, /id="model"/);
  assert.match(rendererSource, /modelSelect\.hidden = !settingsOpen/);
  assert.match(rendererSource, /local-ai-appearance-v1/);
  assert.match(rendererSource, /--floating-app-opacity/);
  assert.match(rendererSource, /--floating-text-opacity/);
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

test('sidebar opens a dedicated recharge and offers screen', () => {
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
  assert.match(rendererSource, /form\.hidden = !transcriptOpen \|\| !sessionActive/);
  assert.match(rendererSource, /promptSuggestions\.hidden = !transcriptOpen/);
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
  assert.match(rendererSource, /window\.overlay\.startRecharge\(rechargePlan\.value,/);
  assert.match(rendererSource, /result\.status === 'credited'/);
});

test('browser checkout shows a non-dismissible progress dialog until payment settles', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const htmlSource = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  assert.match(htmlSource, /<dialog[^>]*id="payment-wait-modal"/);
  assert.match(htmlSource, /Complete your payment in the browser/);
  assert.match(htmlSource, /payment-wait-spinner/);
  assert.match(rendererSource, /paymentWaitModal\.addEventListener\('cancel', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(rendererSource, /paymentWaitModal\.showModal\(\)/);
  assert.match(rendererSource, /await watchPayment\(payment\.paymentId\)/);
  assert.match(rendererSource, /if \(paymentWaitModal\.open\) paymentWaitModal\.close\(\)/);
});

test('microphone and system audio start enabled without a headphone check', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const htmlSource = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  assert.match(rendererSource, /transcriptionSources = \{ microphone: true, system: true \}/);
  assert.match(htmlSource, /id="settings-audio"/);
  assert.match(htmlSource, /id="permission-list"/);
  assert.doesNotMatch(rendererSource, /checkHeadphones|detectHeadphones|requestHeadphones|HEADPHONE_NAME/);
  assert.doesNotMatch(htmlSource, /headphone-gate|Connect headphones first/);
  assert.match(rendererSource, /echoCancellation: true/);
});

test('starting transcription checks permissions before charging session time', () => {
  const rendererSource = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const start = rendererSource.indexOf('async function startLiveTranscription()');
  const end = rendererSource.indexOf('async function stopLiveTranscription()', start);
  const source = rendererSource.slice(start, end);
  assert.ok(source.indexOf('await checkAudioPermissions()') < source.indexOf('await ensureUsageSession()'));
});

 test('code rendering preserves code, provides a language switch, and disables it while streaming', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const functionSource = source.match(/function renderAnswerContent\([\s\S]*?\n\}/)[0];
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; }
    append(...items) { this.children.push(...items); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    addEventListener(name, callback) { this.events[name] = callback; }
  }
  const root = new Element('div');
  const saved = {};
  let chosen;
  const context = { document: { createElement: tag => new Element(tag) }, codeLanguages: ['Python', 'JavaScript', 'C++'], preferredCodeLanguage: '', localStorage: { setItem: (key, value) => { saved[key] = value; } }, root, onChange: value => { chosen = value; } };
  const answer = 'Use **binary search**.\n- Sorted input\n```cpp\n#include <vector>\nbool less(int a, int b) { return a < b; }\n```';
  context.answer = answer;
  vm.runInNewContext(`${functionSource}\nrenderAnswerContent(root, answer, onChange)`, context);
  const wrapper = root.children.find(item => item.tag === 'section');
  assert.equal(wrapper.children[1].children[0].textContent, '#include <vector>\nbool less(int a, int b) { return a < b; }');
  const select = wrapper.children[0].children[1];
  assert.equal(select.value, 'C++');
  select.value = 'JavaScript'; select.events.change();
  assert.equal(chosen, 'JavaScript');
  assert.equal(saved['preferred-code-language-v2'], 'JavaScript');
  vm.runInNewContext('renderAnswerContent(root, answer, onChange, true)', context);
  assert.equal(root.children.find(item => item.tag === 'section').children[0].children[1].disabled, true);
});

 test('answer navigation follows question history and disables Next on the latest answer', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const functionSource = ['updateAnswerNavigation', 'navigateAnswer'].map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n');
  const cards = ['one', 'two', 'three'].map(id => {
    const controls = { '.answer-previous': {}, '.answer-next': {}, '.answer-position': {} };
    return { dataset: { turnId: id }, controls, querySelector: selector => controls[selector] };
  });
  const context = { document: { getElementById: () => null }, selectedAnswerId: 'three', answerHistoryCards: () => cards, selectAnswerCard: card => { if (card) context.selectedAnswerId = card.dataset.turnId; } };
  vm.runInNewContext(`${functionSource}\nupdateAnswerNavigation()`, context);
  assert.equal(cards[2].controls['.answer-next'].disabled, true);
  assert.equal(cards[2].controls['.answer-previous'].disabled, false);
  assert.equal(cards[2].controls['.answer-position'].textContent, '3 / 3');
  vm.runInNewContext('navigateAnswer(-1); updateAnswerNavigation()', context);
  assert.equal(context.selectedAnswerId, 'two');
  assert.equal(cards[1].controls['.answer-next'].disabled, false);
  vm.runInNewContext('navigateAnswer(-1); updateAnswerNavigation()', context);
  assert.equal(context.selectedAnswerId, 'one');
  assert.equal(cards[0].controls['.answer-previous'].disabled, true);
  vm.runInNewContext('navigateAnswer(1); navigateAnswer(1); updateAnswerNavigation()', context);
  assert.equal(context.selectedAnswerId, 'three');
  assert.equal(cards[2].controls['.answer-next'].disabled, true);
});

 test('question snippets are short and floating navigation lives outside the answer feed', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  const snippetFunction = source.match(/function compactQuestionSnippet\([\s\S]*?\n\}/)[0];
  const snippet = vm.runInNewContext(`${snippetFunction}\ncompactQuestionSnippet(question)`, {
    question: 'Okay, can you explain how caching works and how you would use it in a distributed system with multiple regions and failures?'
  });
  assert.ok(snippet.split(' ').length <= 12);
  assert.ok(snippet.startsWith('explain how caching'));
  assert.ok(html.indexOf('id="floating-answer-navigation"') < html.indexOf('id="transcript-feed"'));
  assert.match(html, /floating-mode \.interview-answer > \.answer-navigation \{ display: none/);
});

 test('cancelled current answer clears selection instead of falling back to old history', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const fn = source.match(/function cancelUnfinishedInterviewAnswer\([\s\S]*?\n\}/)[0];
  let selected = 'unchanged';
  const context = { selectedAnswerId: 'pending', activeInterviewAnswerTurnId: 'pending', cancelInterviewAnswer() {}, updateAnswerNavigation() {}, selectAnswerCard: card => { selected = card; }, transcriptFeed: { querySelectorAll: () => [{ dataset: { turnId: 'pending' }, querySelector: () => ({}), remove() {} }] } };
  vm.runInNewContext(`${fn}\ncancelUnfinishedInterviewAnswer()`, context);
  assert.equal(selected, null);
});
 test('answer rendering uses stable window height and leaves scroll position under user control', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  const generation = source.match(/function generateInterviewAnswer\([\s\S]*?\n\}/)[0];
  const selection = source.match(/function selectAnswerCard\([\s\S]*?\n\}/)[0];
  assert.doesNotMatch(generation, /scrollIntoView|scrollTop/);
  assert.doesNotMatch(selection, /scrollIntoView|scrollTop/);
  assert.doesNotMatch(source, /transcriptFeed\.scrollTop\s*=/);
  assert.match(source, /const answerHeight = expanded \? 520 : undefined/);
  assert.match(html, /overflow-anchor: none/);
});

 test('automatic answers wait for quiet in system audio and stop if speech resumes', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  assert.match(source, /event.type === 'computer-speech-activity'/);
  assert.match(source, /latestComputerSpeechAt = Date.now\(\)/);
  assert.match(source, /const remainingQuiet = INTERVIEWER_QUIET_MS - \(Date.now\(\) - latestComputerSpeechAt\)/);
  assert.match(source, /answerStartTimer = setTimeout\(beginWhenQuiet, remainingQuiet\)/);
  assert.match(source, /if \(automaticAnswerActive\) \{[\s\S]*?cancelUnfinishedInterviewAnswer\(\)/);
});

 test('new speech keeps the previous floating answer visible until its replacement is ready', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const fn = source.match(/function showPendingQuestion\([\s\S]*?\n\}/)[0];
  let cleared = false;
  vm.runInNewContext(`${fn}\nshowPendingQuestion('What is a closure?')`, {
    floatingView: true, selectedAnswerId: 'previous-answer', selectAnswerCard() { cleared = true; }
  });
  assert.equal(cleared, false);
  const generation = source.match(/function generateInterviewAnswer\([\s\S]*?\n\}/)[0];
  assert.match(generation, /renderInterviewContent\(card, answer, true\)/);
  assert.doesNotMatch(generation, /setTimeout\(revealAnswer/);
});

test('visibility hotkey works in both modes while interaction hotkeys remain floating-only', () => {
  const handlers = new Map(), shortcuts = new Map(); let ignored = false; let visible = true; const messages = [];
  const window = { isDestroyed: () => false, isVisible: () => visible, hide() { visible = false; }, show() { visible = true; }, showInactive() { visible = true; }, setAlwaysOnTop() {}, webContents: { send(channel) { messages.push(channel); } }, setFocusable() {}, focus() {}, setIgnoreMouseEvents(value) { ignored = value; } };
  const context = { __dirname, process: { platform: 'win32' }, setInterval, clearInterval,
    require(name) {
      if (name === 'electron') return {
        app: { whenReady: () => ({ then: () => ({ catch() {} }) }), on() {} },
        ipcMain: { handle(name, callback) { handlers.set(name, callback); }, on() {} },
        globalShortcut: { register(key, callback) { shortcuts.set(key, callback); return true; }, unregister(key) { shortcuts.delete(key); } }
      };
      return require(name);
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./main'), 'utf8'), context);
  context.testWindow = window;
  vm.runInContext('win = testWindow; floatingWindowController = { setMode: () => ({}) }; browseMode = true;', context);
  const mode = handlers.get('overlay:window-mode'); const event = { sender: window.webContents };
  assert.equal(shortcuts.size, 0);
  vm.runInContext('registerVisibilityHotkey();', context);
  const dashboardHide = shortcuts.get('CommandOrControl+Shift+H');
  dashboardHide(); assert.equal(visible, false, 'dashboard can be hidden');
  dashboardHide(); assert.equal(visible, true, 'dashboard can be restored');
  assert.equal(ignored, false);
  mode(event, 'floating');
  const shortcut = shortcuts.get('CommandOrControl+Shift+I'); assert.equal(typeof shortcut, 'function');
  const hideShortcut = shortcuts.get('CommandOrControl+Shift+H'); assert.equal(typeof hideShortcut, 'function');
  assert.equal(shortcuts.size, 7);
  const pauseShortcut = shortcuts.get('CommandOrControl+Shift+P');
  pauseShortcut(); assert.equal(messages.filter(channel => channel === 'overlay:toggle-session').length, 1);
  for (const direction of ['Left', 'Right', 'Up', 'Down']) assert.equal(typeof shortcuts.get(`CommandOrControl+Shift+${direction}`), 'function');
  hideShortcut(); assert.equal(visible, false);
  hideShortcut(); assert.equal(visible, true);
  shortcut(); assert.equal(ignored, true);
  mode(event, 'answer'); assert.equal(ignored, true);
  shortcut(); assert.equal(ignored, false);
  hideShortcut(); assert.equal(visible, false);
  mode(event, 'dashboard'); assert.equal(visible, true); assert.equal(shortcuts.size, 1); assert.equal(ignored, false);
  shortcut(); assert.equal(ignored, false, 'stale callback cannot change dashboard interaction');
  assert.equal(shortcuts.get('CommandOrControl+Shift+H'), dashboardHide);
  hideShortcut(); assert.equal(visible, false, 'hide remains active after returning to dashboard');
  hideShortcut(); assert.equal(visible, true, 'show remains active after returning to dashboard');
  pauseShortcut(); assert.equal(messages.filter(channel => channel === 'overlay:toggle-session').length, 1, 'pause is inactive on the dashboard');
});

function streamingAnswerHarness() {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const fn = source.match(/function generateInterviewAnswer\([\s\S]*?\n\}/)[0];
  const rendered = [], selected = [];
  const pending = new Set();
  const text = { classList: { add: value => pending.add(value), remove: value => pending.delete(value) } };
  const expand = { hidden: false };
  const previous = { dataset: { turnId: 'old' }, isConnected: true };
  const card = { dataset: { turnId: 'new' }, querySelector: selector => selector === '.interview-answer-text' ? text : expand, remove() { this.removed = true; } };
  const turn = { id: 'new' };
  let callbacks;
  const context = {
    floatingView: true, preferredCodeLanguage: 'JavaScript', selectedAnswerId: 'old', automaticAnswerActive: false,
    cancelUnfinishedInterviewAnswer() {}, answerHistoryCards: () => [previous], answerCardFor: () => card,
    selectAnswerCard(value) { selected.push(value); context.selectedAnswerId = value?.dataset.turnId; }, updateAnswerNavigation() {},
    showAnswerLoader() {}, setAnswerSnippet(_card, snippet) { card.answerSnippet = snippet; },
    renderInterviewContent(_card, answer, streaming) { rendered.push({ answer, streaming }); },
    transcriptStatus: { textContent: '' }, transcriptContext: [turn], saveTranscriptContext() {}, compactQuestionSnippet: value => value,
    isRateLimitNotice: () => false,
    window: { overlay: { generateInterviewAnswer(_request, handlers) { callbacks = handlers; return () => {}; } } },
    setTimeout() { throw new Error('Answer presentation must not use a delay'); }
  };
  vm.runInNewContext(`${fn}\ngenerateInterviewAnswer({ question: 'Explain closures' }, 'technical', 'new', 'concise');`, context);
  return { context, callbacks, rendered, selected, card, turn, pending };
}

test('floating answer shows the first meaningful chunk and completes without a reveal timer', () => {
  const h = streamingAnswerHarness();
  assert.equal(h.selected.length, 0);
  h.callbacks.onChunk('ANSWERING: Closures\n');
  assert.equal(h.selected.length, 0);
  h.callbacks.onChunk('A closure ');
  assert.equal(h.selected[0], h.card);
  assert.equal(h.rendered[0].answer, 'A closure ');
  assert.equal(h.rendered[0].streaming, true);
  h.callbacks.onChunk('retains access to its lexical scope.');
  assert.equal(h.selected.length, 1);
  h.callbacks.onDone();
  assert.equal(h.rendered.at(-1).streaming, undefined);
  assert.equal(h.turn.answer.text, 'A closure retains access to its lexical scope.');
  assert.equal(h.pending.has('pending'), false);
  assert.equal(h.context.cancelInterviewAnswer, null);
});

test('superseded answer chunks cannot replace the current floating answer', () => {
  const h = streamingAnswerHarness();
  h.context.activeInterviewAnswerTurnId = 'replacement';
  h.callbacks.onChunk('Outdated answer'); h.callbacks.onDone();
  assert.equal(h.selected.length, 0);
  assert.equal(h.rendered.length, 0);
  assert.equal(h.turn.answer, undefined);
});

test('floating live ticker accepts only system-audio captions and retains a bounded latest line', () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const update = source.match(/function updateSystemTranscript\(event\) \{[\s\S]*?\n\}/)[0];
  const merge = source.match(/function mergeCaptionText\(previous, incoming\) \{[\s\S]*?\n\}/)[0];
  let scrolled = 0;
  const text = {};
  const context = { systemTranscriptText: text, systemTranscriptTicker: { setText(value) { text.textContent = value; } }, scrollSystemTranscript: () => { scrolled += 1; } };
  vm.createContext(context);
  vm.runInContext(`let liveSystemText = '';\n${merge}\n${update}`, context);
  vm.runInContext("updateSystemTranscript({type:'transcript',speaker:'user',text:'Microphone should stay private here'});", context);
  assert.equal(text.textContent, undefined);
  vm.runInContext("updateSystemTranscript({type:'transcript',speaker:'computer',text:'Tell me about your'});updateSystemTranscript({type:'transcript',speaker:'computer',text:'about your experience'});", context);
  assert.equal(text.textContent, 'Tell me about your experience'); assert.equal(scrolled, 2);
  vm.runInContext("updateSystemTranscript({type:'transcript',speaker:'computer',text:'a'.repeat(1500)});", context);
  assert.equal(text.textContent.length, 300);
});

test('startup keeps login hidden until session resolves and dismisses the loader on success or failure', async () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const finish = source.match(/function finishStartup\(\) \{[\s\S]*?\n\}/)[0];
  const authFlow = source.slice(source.indexOf('window.overlay.getAuthStatus().then'), source.indexOf('window.overlay.loadNotes().then'));
  for (const outcome of ['authenticated', 'signed-out', 'error']) {
    const classes = new Set(['starting']);
    const splashClasses = new Set();
    const panel = { inert: true };
    let removed = false, resolve, reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    const gate = { hidden: true };
    const status = { classList: { add() {} }, textContent: '' };
    const context = {
      document: {
        body: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } },
        querySelector: () => panel,
        getElementById: () => ({ classList: { add: value => splashClasses.add(value) }, remove() { removed = true; } })
      },
      window: { overlay: { getAuthStatus: () => pending, getUsageStatus: async () => ({}) }, matchMedia: () => ({ matches: true }) },
      loginGate: gate, loginStatus: status,
      applyAuthState(result) { gate.hidden = result.authenticated; },
      updateUsageState() {}, setTimeout(callback) { callback(); }
    };
    vm.createContext(context);
    const completion = vm.runInContext(`${finish}\n${authFlow}`, context);
    assert.equal(gate.hidden, true);
    assert.equal(panel.inert, true);
    assert.equal(classes.has('starting'), true);
    if (outcome === 'error') reject(new Error('offline'));
    else resolve({ authenticated: outcome === 'authenticated' });
    await completion;
    assert.equal(gate.hidden, outcome === 'authenticated');
    assert.equal(panel.inert, false);
    assert.equal(classes.has('starting'), false);
    assert.equal(removed, true);
    if (outcome === 'error') assert.match(status.textContent, /Cannot reach/);
  }
});

test('Google sign-in requires legal agreement and allows retry after a failed attempt', async () => {
  const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
  const handlers = {};
  const highlighted = new Set();
  const row = { classList: { add: value => highlighted.add(value), remove: value => highlighted.delete(value) }, offsetWidth: 100 };
  let focused = false;
  const agreement = { checked: false, disabled: false, closest: () => row, setAttribute() {}, removeAttribute() {}, focus() { focused = true; }, addEventListener(_, callback) { handlers.change = callback; } };
  const button = { disabled: false, addEventListener(_, callback) { handlers.click = callback; } };
  let calls = 0, rejectLogin;
  const context = {
    loginAgreement: agreement, googleLogin: button,
    loginStatus: { classList: { add() {}, remove() {} }, textContent: '' },
    window: { overlay: { loginWithGoogle() { calls++; return new Promise((_, reject) => { rejectLogin = reject; }); } } },
    applyAuthState() {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("loginAgreement.addEventListener('change'"), source.indexOf("logout.addEventListener('click'")), context);
  await handlers.click(); assert.equal(calls, 0);
  assert.equal(button.disabled, false); assert.equal(focused, true); assert.equal(highlighted.has('needs-agreement'), true);
  agreement.checked = true; handlers.change(); assert.equal(button.disabled, false);
  assert.equal(highlighted.has('needs-agreement'), false);
  const attempt = handlers.click();
  assert.equal(calls, 1); assert.equal(button.disabled, true); assert.equal(agreement.disabled, true);
  await handlers.click(); assert.equal(calls, 1);
  rejectLogin(new Error('offline')); await attempt;
  assert.equal(button.disabled, false); assert.equal(agreement.disabled, false);
  agreement.checked = false; handlers.change();
  assert.equal(button.disabled, false);
  await handlers.click(); assert.equal(calls, 1);
  assert.equal(highlighted.has('needs-agreement'), true);
});
