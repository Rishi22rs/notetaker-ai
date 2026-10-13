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
  assert.match(htmlSource, /<section class="settings-view"[\s\S]*id="model"[\s\S]*id="model-download"/);
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
  assert.match(generation, /if \(!floatingView\) renderInterviewContent\(card, cleanAnswer\(\), true\)/);
  assert.match(generation, /setTimeout\(revealAnswer, 2000\)/);
});
