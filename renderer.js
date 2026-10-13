const modelSelect = document.getElementById('model');
const status = document.getElementById('status');
const form = document.getElementById('composer');
const prompt = document.getElementById('prompt');
const send = document.getElementById('send');
const newChat = document.getElementById('new-chat');
const sessionClock = document.getElementById('session-clock');
const sessionBlocker = document.getElementById('session-blocker');
const sessionBlockerMessage = document.getElementById('session-blocker-message');
const showNotes = document.getElementById('show-notes');
const notesView = document.getElementById('notes-view');
const notepad = document.getElementById('notepad');
const notesStatus = document.getElementById('notes-status');
const viewTitle = document.getElementById('view-title');
const showContext = document.getElementById('show-context');
const contextView = document.getElementById('context-view');
const contextInput = document.getElementById('context-input');
const uploadContext = document.getElementById('upload-context');
const clearContextFiles = document.getElementById('clear-context-files');
const contextFilesElement = document.getElementById('context-files');
const contextSaveStatus = document.getElementById('context-save-status');
const promptSuggestions = document.getElementById('prompt-suggestions');
const modelDownload = document.getElementById('model-download');
const downloadTitle = document.getElementById('download-title');
const downloadDetail = document.getElementById('download-detail');
const downloadModel = document.getElementById('download-model');
const downloadProgress = document.getElementById('download-progress');
const transcriptView = document.getElementById('transcript-view');
const summaryView = document.getElementById('summary-view');
const summaryOverviewText = document.getElementById('summary-overview-text');
const summaryConversation = document.getElementById('summary-conversation');
const transcriptFeed = document.getElementById('transcript-feed');
const transcriptStatus = document.getElementById('transcript-status');
const toggleTranscription = document.getElementById('toggle-transcription');
const clearTranscript = document.getElementById('clear-transcript');
const toggleMicrophone = document.getElementById('toggle-microphone');
const toggleSystemAudio = document.getElementById('toggle-system-audio');
const permissionGate = document.getElementById('permission-gate');
const permissionList = document.getElementById('permission-list');
const settingsPermissionList = document.getElementById('settings-permission-list');
const permissionStatus = document.getElementById('permission-status');
const interviewQuestions = document.getElementById('interview-questions');
const interviewQuestionsList = document.getElementById('interview-questions-list');
const showAccount = document.getElementById('show-account');
const accountMenu = document.getElementById('account-menu');
const accountName = document.getElementById('account-name');
const loginGate = document.getElementById('login-gate');
const googleLogin = document.getElementById('google-login');
const loginStatus = document.getElementById('login-status');
const logout = document.getElementById('logout');
const couponForm = document.getElementById('coupon-form');
const couponCode = document.getElementById('coupon-code');
const couponSubmit = document.getElementById('coupon-submit');
const couponStatus = document.getElementById('coupon-status');
const walletBalance = document.getElementById('wallet-balance');
const headerTimeRemaining = document.getElementById('header-time-remaining');
const rechargeForm = document.getElementById('recharge-form');
const rechargePlan = document.getElementById('recharge-plan');
const rechargeSubmit = document.getElementById('recharge-submit');
const paymentStatus = document.getElementById('payment-status');
const paymentWaitModal = document.getElementById('payment-wait-modal');
const paymentWaitMessage = document.getElementById('payment-wait-message');
const openSettings = document.getElementById('open-settings');
const openOffers = document.getElementById('open-offers');
const settingsView = document.getElementById('settings-view');
const offersView = document.getElementById('offers-view');
const settingsAppearanceTab = document.getElementById('settings-tab-appearance');
const settingsAudioTab = document.getElementById('settings-tab-audio');
const settingsAiTab = document.getElementById('settings-tab-ai');
const settingsAppearancePanel = document.getElementById('settings-appearance');
const settingsAudioPanel = document.getElementById('settings-audio');
const settingsAiPanel = document.getElementById('settings-ai');
const appOpacity = document.getElementById('app-opacity');
const appOpacityValue = document.getElementById('app-opacity-value');
const textOpacity = document.getElementById('text-opacity');
const textOpacityValue = document.getElementById('text-opacity-value');
const panel = document.querySelector('.panel');
const { selectLatestInterviewerQuestion } = window.interviewQuestionContext;
const STORAGE_KEY = 'local-ai-conversation-v1';
const TRANSCRIPT_CONTEXT_KEY = 'local-ai-transcript-context-v1';
const APPEARANCE_KEY = 'local-ai-appearance-v1';
let transcriptContext = loadTranscriptContext();
let cancelGeneration = null;
let activeTypedAnswerId = null;
let noteSaveTimer = null;
let contextSaveTimer = null;
let contextState = { text: '', files: [] };
const sessionContext = createSessionContext();
function effectiveContext() { return sessionContext.combine(contextState); }
let contextUploadErrors = [];
let contextLoaded = false;
let contextDirty = false;
let contextSaveQueue = Promise.resolve();
let suggestionTimer = null;
let suggestionRevision = 0;
let installedModels = new Map();
let downloadingModel = null;
let transcriptionRunning = false;
let sessionActive = false;
let floatingView = false;
let floatingAnswerOpen = false;
const floatingToolbar = document.getElementById('floating-toolbar');
const floatingQuestion = document.getElementById('floating-question');
const floatingQuestionText = document.getElementById('floating-question-text');
const floatingState = document.getElementById('floating-state');
const floatingPause = document.getElementById('floating-pause');
const floatingCollapse = document.getElementById('floating-collapse');
const returnFloating = document.getElementById('return-floating');

let windowModeQueue = Promise.resolve();

async function setFloatingView(enabled, expanded = floatingAnswerOpen) {
  const answerHeight = expanded ? 520 : undefined;
  floatingView = enabled;
  floatingAnswerOpen = expanded;
  document.body.classList.toggle('floating-mode', enabled);
  document.body.classList.toggle('floating-answer-open', enabled && expanded);
  floatingToolbar.hidden = !enabled;
  floatingQuestion.hidden = !enabled;
  floatingCollapse.replaceChildren(createAppIcon(expanded ? 'chevron-up' : 'chevron-down'));
  floatingCollapse.setAttribute('aria-expanded', String(expanded));
  setView(enabled ? 'transcript' : 'home');
  returnFloating.hidden = enabled || !sessionContext.hasSession();
  windowModeQueue = windowModeQueue.catch(() => {}).then(() => window.overlay.setWindowMode(enabled ? (expanded ? 'answer' : 'floating') : 'dashboard', answerHeight));
  await windowModeQueue;
}
function syncFloatingStatus() {
  floatingState.textContent = transcriptStatus.textContent;
  floatingPause.textContent = sessionActive ? 'Pause' : 'Resume';
  floatingPause.dataset.buttonIcon = sessionActive ? 'pause' : 'play';
  document.getElementById('floating-clock').textContent = sessionClock.textContent;
}
new MutationObserver(syncFloatingStatus).observe(transcriptStatus, { childList: true, characterData: true, subtree: true });
new MutationObserver(syncFloatingStatus).observe(sessionClock, { childList: true, characterData: true, subtree: true });
document.getElementById('floating-dashboard').addEventListener('click', () => {
  setFloatingView(false).catch(error => setStatus(error.message, true));
});
returnFloating.addEventListener('click', () => {
  setFloatingView(true).catch(error => setStatus(error.message, true));
});
document.getElementById('floating-end').addEventListener('click', () => document.getElementById('end-session').click());
floatingCollapse.addEventListener('click', () => {
  if (!transcriptFeed.querySelector('.floating-current')) return;
  setFloatingView(true, !floatingAnswerOpen).catch(error => setStatus(error.message, true));
});

let availableUsageSeconds = 0;
let usageClockStartedAt = 0;
let usageClockTimer = null;
let transcriptionCaptures = [];
let transcriptionSources = { microphone: true, system: true };
let permissionStreams = { computer: null, user: null };
let audioPermissionState = { microphone: 'unknown', system: 'unknown' };
let cancelInterviewAnswer = null;
let answerStartTimer = null;
let interviewPipelineRevision = 0;
let activeInterviewAnswerTurnId = null;
let lastInterviewQuestion = null;
let latestComputerTurnEndedAt = 0;
let pendingComputerContinuation = null;
const recommendedModels = [
  { name: 'qwen2.5-1.5b-instruct-q4_k_m', label: 'Qwen 2.5 1.5B Instruct', description: 'Balanced · Recommended', size: 1_117_320_736, vision: false },
  { name: 'qwen2.5-0.5b-instruct-q4_k_m', label: 'Qwen 2.5 0.5B Instruct', description: 'Fastest · Basic answers', size: 491_400_032, vision: false },
  { name: 'qwen2.5-3b-instruct-q4_k_m', label: 'Qwen 2.5 3B Instruct', description: 'Higher quality · 8 GB+ RAM', size: 2_104_932_768, vision: false }
];
document.body.classList.add(`platform-${window.overlay.platform}`);

function loadAppearance() {
  try {
    const stored = JSON.parse(localStorage.getItem(APPEARANCE_KEY));
    return {
      app: Math.max(20, Math.min(100, Number(stored?.app) || 60)),
      text: Math.max(20, Math.min(100, Number(stored?.text) || 100))
    };
  } catch { return { app: 60, text: 100 }; }
}

function applyAppearance(values = loadAppearance()) {
  appOpacity.value = String(values.app);
  textOpacity.value = String(values.text);
  appOpacityValue.textContent = `${values.app}%`;
  textOpacityValue.textContent = `${values.text}%`;
  document.documentElement.style.setProperty('--floating-app-opacity', String(values.app / 100));
  document.documentElement.style.setProperty('--floating-text-opacity', String(values.text / 100));
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(values));
}

applyAppearance();

function loadTranscriptContext() {
  try {
    const value = JSON.parse(localStorage.getItem(TRANSCRIPT_CONTEXT_KEY));
    return Array.isArray(value) ? value.filter((item) => item && ['user', 'computer', 'assistant'].includes(item.speaker) && typeof item.text === 'string')
      .filter((item, index, items) => item.answer || index >= items.length - 40).map((item) => item.speaker === 'assistant' && item.pending
        ? { ...item, text: item.text || 'Answer interrupted.', pending: false }
        : item) : [];
  } catch { return []; }
}

function saveTranscriptContext() {
  transcriptContext = transcriptContext.filter((item, index, items) => item.answer || index >= items.length - 40);
  // Retrieved snippets can contain session-only details; never persist them.
  localStorage.setItem(TRANSCRIPT_CONTEXT_KEY, JSON.stringify(transcriptContext.map(({ retrievedContext, ...turn }) => turn)));
}

function setStatus(text, error = false) { status.textContent = text; status.dataset.error = String(error); }

function contextLabel() {
  const context = effectiveContext();
  const names = context.files.map((file) => file.name).filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length > 1) return `${names[0]} and ${names.length - 1} other file${names.length > 2 ? 's' : ''}`;
  const words = (context.text || '').match(/[A-Za-z][A-Za-z0-9_-]{3,}/g) || [];
  const ignored = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'your', 'about', 'into', 'there', 'their', 'should']);
  const topics = [...new Set(words.filter((word) => !ignored.has(word.toLowerCase())))].slice(0, 3);
  return topics.length ? topics.join(', ') : 'my saved context';
}

function showSuggestionChips(suggestions) {
  promptSuggestions.replaceChildren();
  for (const suggestion of suggestions) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'suggestion';
    chip.textContent = suggestion;
    chip.title = suggestion;
    chip.addEventListener('click', () => {
      prompt.value = suggestion;
      promptSuggestions.replaceChildren();
      prompt.focus();
    });
    promptSuggestions.append(chip);
  }
}

function renderPromptSuggestions() {
  clearTimeout(suggestionTimer);
  const revision = ++suggestionRevision;
  const draft = prompt.value.trim().replace(/\s+/g, ' ').slice(0, 500);
  const recentTranscript = transcriptContext.map((item) => `${item.speaker === 'computer' ? 'Interviewer' : item.speaker === 'assistant' ? 'AI' : 'You'}: ${item.text}`).join('\n').slice(-20_000);
  if (!draft || !modelSelect.value) { promptSuggestions.replaceChildren(); return; }
  suggestionTimer = setTimeout(async () => {
    try {
      const suggestions = await window.overlay.getSuggestions({ model: modelSelect.value, draft, context: effectiveContext(), transcript: recentTranscript });
      if (revision === suggestionRevision && prompt.value.trim()) showSuggestionChips(suggestions);
    } catch {
      if (revision === suggestionRevision) promptSuggestions.replaceChildren();
    }
  }, 550);
}

function questionSuggestionGroup(turn, suggestions = [], fresh = false) {
  interviewQuestionsList.querySelector('.interview-questions-empty')?.remove();
  for (const old of interviewQuestionsList.querySelectorAll('.question-suggestion-group.is-new')) {
    old.classList.remove('is-new');
    old.querySelector('.question-new-badge')?.remove();
  }
  let group = [...interviewQuestionsList.querySelectorAll('.question-suggestion-group')]
    .find((item) => item.dataset.turnId === turn.id);
  if (!group) {
    group = document.createElement('section');
    group.className = 'question-suggestion-group';
    group.dataset.turnId = turn.id;
    const heading = document.createElement('div');
    heading.className = 'question-suggestion-heading';
    const question = document.createElement('span');
    question.textContent = turn.text;
    heading.append(question);
    const items = document.createElement('div');
    items.className = 'question-suggestion-items';
    group.append(heading, items);
    interviewQuestionsList.prepend(group);
  }
  if (fresh) {
    group.classList.add('is-new');
    const badge = document.createElement('span');
    badge.className = 'question-new-badge';
    badge.textContent = 'NEW';
    group.querySelector('.question-suggestion-heading').append(badge);
  }
  const items = group.querySelector('.question-suggestion-items');
  items.replaceChildren();
  for (const suggestion of suggestions) {
    const item = document.createElement('div');
    item.className = 'interview-question-suggestion';
    item.textContent = suggestion;
    items.append(item);
  }
  return { group, items };
}

async function renderInterviewQuestionSuggestions(turn, pipelineRevision) {
  const { items } = questionSuggestionGroup(turn, [], true);
  const loading = document.createElement('div');
  loading.className = 'interview-questions-empty';
  loading.textContent = 'Thinking of useful follow-ups…';
  items.append(loading);
  try {
    const transcript = transcriptContext.slice(-8)
      .map((item) => `${item.speaker === 'user' ? 'Candidate' : 'Interviewer'}: ${item.text}`)
      .join('\n');
    const suggestions = await window.overlay.getSuggestions({
      model: modelSelect.value,
      draft: '',
      context: effectiveContext(),
      transcript: `${transcript}\nCurrent interviewer question: ${turn.text}`
    });
    if (pipelineRevision !== interviewPipelineRevision) return;
    if (!suggestions.length) {
      loading.textContent = 'No follow-up suggestions yet.';
      return;
    }
    questionSuggestionGroup(turn, suggestions, true);
    const savedTurn = transcriptContext.find((item) => item.id === turn.id);
    if (savedTurn) { savedTurn.suggestedQuestions = suggestions; saveTranscriptContext(); }
  } catch {
    if (pipelineRevision !== interviewPipelineRevision) return;
    loading.textContent = 'Follow-up suggestions unavailable.';
  }
}

const codeLanguages = ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C', 'C#', 'Go', 'Rust', 'Swift', 'Kotlin', 'Ruby', 'PHP', 'SQL', 'Bash'];
let preferredCodeLanguage = localStorage.getItem('preferred-code-language-v2') || '';
if (!codeLanguages.includes(preferredCodeLanguage)) preferredCodeLanguage = '';
let selectedAnswerId = null;

function showAnswerLoader(element) {
  const loader = document.createElement('span');
  loader.className = 'answer-loader';
  loader.setAttribute('role', 'status');
  loader.textContent = 'Thinking…';
  element.replaceChildren();
  element.append(loader);
}

function renderAnswerContent(element, source, onLanguageChange, pending = false) {
  element.replaceChildren();
  if (pending && !String(source).trim()) { showAnswerLoader(element); return; }
  const inline = (parent, value) => {
    for (const part of value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
      const node = document.createElement(part.startsWith('**') ? 'strong' : part.startsWith('`') ? 'code' : 'span');
      node.textContent = part.startsWith('**') ? part.slice(2, -2) : part.startsWith('`') ? part.slice(1, -1) : part;
      parent.append(node);
    }
  };
  const blocks = String(source).split(/```/);
  blocks.forEach((block, index) => {
    if (index % 2) {
      const newline = block.indexOf('\n');
      if (pending && newline < 0) { showAnswerLoader(element); return; }
      const language = newline < 0 ? block.trim() : block.slice(0, newline).trim();
      const wrapper = document.createElement('section');
      wrapper.className = 'answer-code';
      const toolbar = document.createElement('div');
      toolbar.className = 'answer-code-toolbar';
      const label = document.createElement('span');
      label.textContent = language || 'Code';
      toolbar.append(label);
      if (onLanguageChange) {
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Code solution language');
        const detected = { js: 'JavaScript', ts: 'TypeScript', py: 'Python', cpp: 'C++', csharp: 'C#', sh: 'Bash' }[language.toLowerCase()] || codeLanguages.find(item => item.toLowerCase() === language.toLowerCase());
        const current = detected || preferredCodeLanguage || '';
        const placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = 'Choose language';
        select.append(placeholder);
        for (const item of codeLanguages) {
          const option = document.createElement('option');
          option.value = item; option.textContent = item; select.append(option);
        }
        select.value = current;
        select.disabled = pending;
        select.addEventListener('change', () => {
          if (!select.value) return;
          preferredCodeLanguage = select.value;
          localStorage.setItem('preferred-code-language-v2', select.value);
          onLanguageChange(select.value);
        });
        toolbar.append(select);
      }
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = newline < 0 ? '' : block.slice(newline + 1).replace(/\n$/, '');
      pre.append(code); wrapper.append(toolbar, pre); element.append(wrapper);
    } else {
      let list = null;
      for (const line of block.split('\n')) {
        const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
        if (bullet) {
          if (!list) { list = document.createElement('ul'); element.append(list); }
          const item = document.createElement('li'); inline(item, bullet[1]); list.append(item);
        } else {
          list = null;
          if (!line.trim()) continue;
          const heading = /^(?:#{1,6}\s+|(?:SHORT ANSWER|APPROACH|CODE|EXPLANATION|COMPLEXITY|EDGE CASES|KEY POINTS|EXAMPLE|NEXT STEP|SITUATION|TASK|ACTION|RESULT):?$)/.test(line);
          const paragraph = document.createElement(heading ? 'h4' : 'p');
          inline(paragraph, line.replace(/^#{1,6}\s+/, '')); element.append(paragraph);
        }
      }
    }
  });
}

function renderInterviewContent(card, value, pending = false) {
  renderAnswerContent(card.querySelector('.interview-answer-text'), value, language => {
    generateInterviewAnswer({ ...card.answerRequest, model: modelSelect.value, codeLanguage: language, type: 'coding' }, card.answerLabel, card.dataset.turnId, card.answerVerbosity || 'concise');
  }, pending);
}

function compactQuestionSnippet(question) {
  const clean = String(question || '').replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:okay|so|well|haan)[,.:]?\s+)+/i, '')
    .replace(/^(?:can you|could you|please)\s+/i, '');
  const sentence = clean.split(/(?<=[?!.])\s/)[0];
  const words = sentence.split(' ');
  return words.slice(0, 12).join(' ') + (words.length > 12 ? '…' : '');
}

function setAnswerSnippet(card, snippet) {
  card.answerSnippet = compactQuestionSnippet(snippet);
  const line = card.querySelector('.interview-answer-focus-question');
  if (line) line.textContent = card.answerSnippet;
  if (selectedAnswerId === card.dataset.turnId) {
    floatingQuestionText.textContent = card.answerSnippet;
    floatingQuestionText.title = card.answerRequest.question;
  }
}

function answerHistoryCards() {
  return [...transcriptFeed.querySelectorAll('.interview-answer')].filter(card => card.dataset.buffered !== 'true');
}

function selectAnswerCard(card) {
  if (!card) {
    selectedAnswerId = null;
    for (const item of answerHistoryCards()) item.classList.remove('floating-current');
    updateAnswerNavigation(); return;
  }
  transcriptFeed.querySelector('.floating-answer-waiting')?.remove();
  selectedAnswerId = card.dataset.turnId;
  for (const item of answerHistoryCards()) item.classList.toggle('floating-current', item === card);
  floatingQuestionText.textContent = card.answerSnippet || compactQuestionSnippet(card.answerRequest.question);
  floatingQuestionText.title = card.answerRequest.question;
  updateAnswerNavigation();
  if (floatingView) setFloatingView(true, true).catch(error => setStatus(error.message, true));

}

function updateAnswerNavigation() {
  const cards = answerHistoryCards();
  const index = cards.findIndex(card => card.dataset.turnId === selectedAnswerId);
  for (const card of [...cards, document.getElementById('floating-answer-navigation')].filter(Boolean)) {
    card.querySelector('.answer-previous').disabled = index <= 0;
    card.querySelector('.answer-next').disabled = index < 0 || index >= cards.length - 1;
    card.querySelector('.answer-position').textContent = `${index + 1} / ${cards.length}`;
  }
}

document.getElementById('floating-answer-navigation').querySelector('.answer-previous').addEventListener('click', () => navigateAnswer(-1));
document.getElementById('floating-answer-navigation').querySelector('.answer-next').addEventListener('click', () => navigateAnswer(1));

function navigateAnswer(offset) {
  const cards = answerHistoryCards();
  const index = cards.findIndex(card => card.dataset.turnId === selectedAnswerId);
  selectAnswerCard(cards[index + offset]);
}

function showPendingQuestion(question) {
  if (floatingView && selectedAnswerId) return;
  selectAnswerCard(null);
  floatingQuestionText.textContent = compactQuestionSnippet(question);
  floatingQuestionText.title = question;
  let waiting = transcriptFeed.querySelector('.floating-answer-waiting');
  if (!waiting) {
    waiting = document.createElement('div');
    waiting.className = 'floating-answer-waiting';
    transcriptFeed.append(waiting);
    waiting.textContent = 'Listening…';
  }
  if (floatingView && !floatingAnswerOpen) setFloatingView(true, true).catch(error => setStatus(error.message, true));
}

function updateLiveQuestionSnippet(value) {
  if (!selectedAnswerId) floatingQuestionText.textContent = compactQuestionSnippet(value);
}

function answerCardFor(turnId, question, request, label) {
  let card = [...transcriptFeed.querySelectorAll('.interview-answer')].find((item) => item.dataset.turnId === turnId);
  if (card) {
    card.title = `Answer to: ${question}`;
    card.answerRequest = request;
    card.answerLabel = label;
    renderAnsweredQuestion(card, question);
    return card;
  }
  transcriptFeed.querySelector('.transcript-empty')?.remove();
  card = document.createElement('section');
  card.className = 'interview-answer';
  card.dataset.turnId = turnId;
  card.title = `Answer to: ${question}`;
  card.answerRequest = request;
  card.answerLabel = label;
  const header = document.createElement('div');
  header.className = 'interview-answer-header';
  const title = document.createElement('span');
  title.textContent = 'AI answer';
  const expand = document.createElement('button');
  expand.className = 'expand-interview-answer';
  expand.type = 'button';
  expand.textContent = 'Expand answer';
  expand.hidden = true;
  expand.addEventListener('click', () => generateInterviewAnswer({ ...card.answerRequest, model: modelSelect.value }, card.answerLabel, turnId, 'detailed'));
  const focus = document.createElement('div');
  focus.className = 'interview-answer-focus';
  const text = document.createElement('div');
  text.className = 'interview-answer-text';
  header.append(title, expand);
  const navigation = document.createElement('nav');
  navigation.className = 'answer-navigation';
  navigation.setAttribute('aria-label', 'Question history');
  const previous = document.createElement('button');
  previous.type = 'button'; previous.className = 'answer-previous'; previous.textContent = 'Previous'; previous.dataset.buttonIcon = 'chevron-left';
  previous.addEventListener('click', () => navigateAnswer(-1));
  const position = document.createElement('span'); position.className = 'answer-position';
  const next = document.createElement('button');
  next.type = 'button'; next.className = 'answer-next'; next.textContent = 'Next'; next.dataset.buttonIcon = 'chevron-right';
  next.addEventListener('click', () => navigateAnswer(1));
  navigation.append(previous, position, next);
  card.append(navigation, header, focus, text);
  renderAnsweredQuestion(card, question);
  transcriptFeed.append(card);
  updateAnswerNavigation();
  return card;
}

function renderAnsweredQuestion(card, question) {
  const focus = card.querySelector('.interview-answer-focus');
  focus.replaceChildren();
  const label = document.createElement('span');
  label.className = 'interview-answer-focus-label';
  label.textContent = 'Answering';
  focus.append(label);
  const line = document.createElement('div');
  line.className = 'interview-answer-focus-question';
  line.textContent = card.answerSnippet || compactQuestionSnippet(question);
  line.title = question;
  focus.append(line);
}

function cancelUnfinishedInterviewAnswer(keepTurnId = null) {
  const unfinishedTurnId = activeInterviewAnswerTurnId;
  const wasGenerating = typeof cancelInterviewAnswer === 'function';
  cancelInterviewAnswer?.();
  cancelInterviewAnswer = null;
  if (wasGenerating && unfinishedTurnId && unfinishedTurnId !== keepTurnId) {
    const card = [...transcriptFeed.querySelectorAll('.interview-answer')]
      .find((item) => item.dataset.turnId === unfinishedTurnId);
    if (card?.querySelector('.interview-answer-text.pending')) {
      card.remove();
      if (selectedAnswerId === unfinishedTurnId) selectAnswerCard(null);
      updateAnswerNavigation();
    }
  }
  activeInterviewAnswerTurnId = null;
}

function generateInterviewAnswer(request, label, turnId, verbosity = floatingView ? 'detailed' : 'concise') {
  request = { ...request, codeLanguage: request.codeLanguage || preferredCodeLanguage };
  automaticAnswerActive = false;
  cancelUnfinishedInterviewAnswer(turnId);
  activeInterviewAnswerTurnId = turnId;
  const previousCard = answerHistoryCards().find(item => item.dataset.turnId === selectedAnswerId);
  const card = answerCardFor(turnId, request.question, request, label);
  if (!floatingView) selectAnswerCard(card);
  else if (card !== previousCard) card.dataset.buffered = 'true';
  updateAnswerNavigation();
  card.answerVerbosity = verbosity;
  const text = card.querySelector('.interview-answer-text');
  const expand = card.querySelector('.expand-interview-answer');
  if (!floatingView) showAnswerLoader(text);
  text.classList.add('pending');
  expand.hidden = true;

  let rawAnswer = '';
  const cleanAnswer = () => {
    let answer = rawAnswer;
    const snippet = answer.match(/^\s*ANSWERING:\s*([^\n]*)\n/i);
    if (snippet) {
      setAnswerSnippet(card, snippet[1]);
      answer = answer.slice(snippet[0].length);
    } else if (/^\s*(?:A|AN|ANS|ANSW|ANSWE|ANSWER|ANSWERI|ANSWERIN|ANSWERING)(?::[^\n]*)?$/i.test(answer)) {
      return '';
    }
    return answer
    .replace(/^\s*(question type|answer length|candidate profile|relevant references|recent dialogue|current interviewer question)\s*:\s*.*$/gim, '')
    .trimStart();
  };
  transcriptStatus.textContent = verbosity === 'detailed' ? `Expanding answer · ${label}` : `Answering · ${label}`;
  cancelInterviewAnswer = window.overlay.generateInterviewAnswer({ ...request, verbosity }, {
    onChunk(chunk) {
      if (activeInterviewAnswerTurnId !== turnId) return;
      rawAnswer += chunk;
      if (!floatingView) renderInterviewContent(card, cleanAnswer(), true);
    },
    onDone() {
      if (activeInterviewAnswerTurnId !== turnId) return;
      automaticAnswerActive = false;
      const answer = cleanAnswer();
      const revealAnswer = () => {
        if (activeInterviewAnswerTurnId !== turnId) return;
        cancelInterviewAnswer = null;
        text.classList.remove('pending');
        renderInterviewContent(card, answer);
        expand.hidden = verbosity === 'detailed';
        const turn = transcriptContext.find((item) => item.id === turnId);
        if (turn) {
          turn.answer = { text: answer, verbosity, label, question: request.question, codeLanguage: request.codeLanguage, snippet: card.answerSnippet || compactQuestionSnippet(request.question) };
          saveTranscriptContext();
        }
        transcriptStatus.textContent = `${verbosity === 'detailed' ? 'Expanded answer' : 'Answer'} ready · ${label}`;
      };
      if (floatingView) {
        delete card.dataset.buffered;
        selectAnswerCard(card);
        showAnswerLoader(text);
        const revealTimer = setTimeout(revealAnswer, 2000);
        cancelInterviewAnswer = () => {
          clearTimeout(revealTimer);
          if (previousCard?.isConnected && selectedAnswerId === turnId) selectAnswerCard(previousCard);
        };
      } else revealAnswer();
    },
    onError(error) {
      if (activeInterviewAnswerTurnId !== turnId) return;
      cancelInterviewAnswer = null;
      automaticAnswerActive = false;
      text.classList.remove('pending');
      if (floatingView && card !== previousCard) { card.remove(); updateAnswerNavigation(); }
      else if (!floatingView) text.textContent = `Could not generate an answer: ${error}`;
      transcriptStatus.textContent = 'Answer generation failed';
    }
  });
}

async function answerTranscriptTurnManually(bubble, textElement, button) {
  if (button.disabled) return;
  const target = selectLatestInterviewerQuestion(transcriptContext, textElement.textContent, lastCaption?.bubble === bubble ? lastCaption.capturedAt : 0);
  if (!target) {
    transcriptStatus.textContent = 'No interviewer question has been detected yet.';
    return;
  }
  const question = target.text;
  const selectedModel = modelSelect.selectedOptions[0];
  if (!modelSelect.value || selectedModel?.dataset.installed !== 'true') {
    transcriptStatus.textContent = modelSelect.value.startsWith('cloud:') ? 'Add a Gemini API key in AI & Models settings before requesting an answer.' : 'Download and select a local model before requesting an answer.';
    return;
  }
  button.disabled = true;
  button.textContent = '…';
  button.title = 'Preparing answer…';
  clearTimeout(answerStartTimer);
  cancelUnfinishedInterviewAnswer();
  const pipelineRevision = ++interviewPipelineRevision;
  let turn = target.turn;
  if (!turn) {
    turn = { id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`, speaker: 'computer', text: question, final: true, reason: 'manual-answer' };
    transcriptContext.push(turn);
    bubble.dataset.turnId = turn.id;
  }
  try {
    transcriptStatus.textContent = 'Finding context for manual answer…';
    let detection = turn.detection;
    if (!detection) {
      detection = await window.overlay.detectInterviewQuestion({
        model: modelSelect.value,
        rulesOnly: true,
        turn: { ...turn, text: question },
        recentTurns: recentDialogueTurns().slice(-6)
      }).catch(() => ({ type: 'general' }));
      turn.detection = detection;
    }
    const type = detection?.type || 'general';
    const retrievedContext = await window.overlay.retrieveInterviewContext({
      question,
      context: effectiveContext(),
      recentTurns: recentDialogueTurns()
    });
    if (pipelineRevision !== interviewPipelineRevision) return;
    turn.text = question;
    turn.retrievedContext = retrievedContext;
    saveTranscriptContext();
    generateInterviewAnswer({ model: modelSelect.value, question, type, retrievedContext }, type.replace('_', ' '), turn.id, 'concise');
    lastInterviewQuestion = { turnId: turn.id, text: question, at: Date.now() };
    button.textContent = 'Answer latest question';
    button.title = 'Answer the latest interviewer question using system audio';
  } catch (error) {
    transcriptStatus.textContent = `Could not prepare answer: ${error.message}`;
    button.textContent = 'Answer it';
    button.title = 'Answer this interviewer message';
  } finally {
    button.disabled = false;
  }
}

function addManualAnswerButton(bubble, textElement, turnId = '') {
  if (!bubble.classList.contains('computer')) return;
  if (turnId) bubble.dataset.turnId = turnId;
  const row = bubble.closest('.caption-turn');
  if (!row) return;
  // Only the newest interviewer caption offers a manual answer action.
  for (const oldButton of transcriptFeed.querySelectorAll('.caption-answer-button')) {
    if (!row.contains(oldButton)) oldButton.remove();
  }
  let button = row.querySelector('.caption-answer-button');
  if (button) return button;
  button = document.createElement('button');
  button.className = 'caption-answer-button';
  button.type = 'button';
  button.textContent = 'Answer it';
  button.title = 'Answer the latest interviewer question';
  button.setAttribute('aria-label', 'Answer the latest interviewer question');
  button.addEventListener('click', () => answerTranscriptTurnManually(bubble, textElement, button));
  row.append(button);
  return button;
}

function scrollCaptionToLatest(bubble) {
  const viewport = bubble.querySelector('.caption-text-viewport');
  if (!viewport) return;
  // New recognized words extend the line on the right. Slide the viewport
  // toward them so earlier words leave on the left like a live ticker.
  requestAnimationFrame(() => {
    if (viewport.isConnected) viewport.scrollTo({ left: viewport.scrollWidth - viewport.clientWidth, behavior: 'smooth' });
  });
}

function appendStoredTurn(turn) {
  if (turn.speaker === 'assistant' || turn.source === 'typed') {
    appendTypedMessage(turn);
    return;
  }
  if (turn.speaker === 'user') return;
  const bubble = document.createElement('div');
  bubble.className = `caption ${turn.speaker === 'user' ? 'user' : 'computer'}`;
  const label = document.createElement('span');
  label.className = 'caption-label';
  label.textContent = turn.speaker === 'user' ? 'You' : 'Computer';
  const text = document.createElement('span');
  text.className = 'caption-text';
  text.textContent = turn.text;
  const viewport = document.createElement('span');
  viewport.className = 'caption-text-viewport';
  viewport.append(text);
  bubble.append(label, viewport);
  const row = document.createElement('div');
  row.className = 'caption-turn';
  row.append(bubble);
  transcriptFeed.append(row);
  addManualAnswerButton(bubble, text, turn.id);
  if (turn.answer?.text) {
    const answeredQuestion = turn.answer.question || turn.text;
    const request = { model: modelSelect.value, question: answeredQuestion, codeLanguage: turn.answer.codeLanguage, type: turn.detection?.type || 'general', retrievedContext: turn.retrievedContext || {} };
    const card = answerCardFor(turn.id, answeredQuestion, request, turn.answer.label || 'general');
    setAnswerSnippet(card, turn.answer.snippet || answeredQuestion);
    card.answerVerbosity = turn.answer.verbosity;
    renderInterviewContent(card, turn.answer.text);
    card.querySelector('.expand-interview-answer').hidden = turn.answer.verbosity === 'detailed';
  }
  // Follow-up question suggestions are paused for now.
}

function appendTypedMessage(turn) {
  transcriptFeed.querySelector('.transcript-empty')?.remove();
  const element = document.createElement('div');
  element.className = `transcript-message ${turn.speaker === 'assistant' ? 'assistant' : 'typed'}${turn.pending ? ' pending' : ''}`;
  element.dataset.turnId = turn.id;
  if (turn.speaker === 'assistant') renderTypedAnswer(element, turn);
  else element.textContent = turn.text;
  transcriptFeed.append(element);

  return element;
}

function renderStoredTranscript() {
  if (!transcriptContext.length) return;
  transcriptFeed.replaceChildren();
  for (const turn of transcriptContext) appendStoredTurn(turn);
  selectAnswerCard(answerHistoryCards().at(-1));
}

function renderSummary() {
  summaryConversation.replaceChildren();
  if (!transcriptContext.length) {
    summaryOverviewText.textContent = 'No conversation has been captured yet.';
    const empty = document.createElement('div');
    empty.className = 'summary-empty';
    empty.textContent = 'Start listening to build your meeting recap.';
    summaryConversation.append(empty);
    return;
  }
  const computerTurns = transcriptContext.filter((turn) => turn.speaker === 'computer');
  const userTurns = transcriptContext.filter((turn) => turn.speaker === 'user');
  const latestComputer = computerTurns.at(-1)?.text;
  const latestQuestion = [...computerTurns].reverse().find((turn) => turn.detection?.isQuestion)?.text;
  summaryOverviewText.textContent = `${transcriptContext.length} conversation turns · ${computerTurns.length} from the computer · ${userTurns.length} from you.` +
    (latestQuestion ? `\nLatest question: ${latestQuestion}` : latestComputer ? `\nLatest computer update: ${latestComputer}` : '');
  for (const turn of transcriptContext) {
    const message = document.createElement('article');
    message.className = `summary-message ${turn.speaker === 'user' ? 'user' : 'computer'}`;
    const speaker = document.createElement('span');
    speaker.className = 'summary-speaker';
    speaker.textContent = turn.speaker === 'assistant' ? 'AI answer' : turn.speaker === 'computer' ? 'Computer' : turn.source === 'typed' ? 'You · typed' : 'You';
    const text = document.createElement('span');
    text.textContent = turn.text;
    message.append(speaker, text);
    summaryConversation.append(message);
  }
}

async function refreshModels() {
  try {
    const models = await window.overlay.listModels();
    const cloud = await window.overlay.getCloudSettings();
    installedModels = new Map(models.map((item) => [item.name, item]));
    modelSelect.replaceChildren();
    const installedGroup = document.createElement('optgroup');
    installedGroup.label = 'Installed';
    for (const item of models) {
      const option = document.createElement('option');
      option.value = item.name;
      option.textContent = `${item.displayName || item.name} · ${item.cloud ? 'Cloud' : formatBytes(item.size)}`;
      option.dataset.installed = item.cloud ? String(cloud.hasGeminiKey) : 'true';
      if (item.cloud && !cloud.hasGeminiKey) option.textContent += ' · Add API key in settings';
      installedGroup.append(option);
    }
    if (models.length) modelSelect.append(installedGroup);
    const available = recommendedModels.filter((item) => !installedModels.has(item.name) && !installedModels.has(`${item.name}:latest`));
    if (available.length) {
      const availableGroup = document.createElement('optgroup');
      availableGroup.label = 'Available to download';
      for (const item of available) {
        const option = document.createElement('option');
        option.value = item.name;
        option.textContent = `${item.label || item.name} · ${item.description} · ${formatBytes(item.size)}`;
        option.dataset.installed = 'false';
        availableGroup.append(option);
      }
      modelSelect.append(availableGroup);
    }
    const savedModel = localStorage.getItem('local-ai-model');
    const previous = savedModel === 'cloud:gemini-2.5-flash-lite' ? 'cloud:gemini-3.5-flash-lite' : savedModel;
    if (previous && models.some((item) => item.name === previous)) modelSelect.value = previous;
    else { const local = models.find(item => !item.cloud); if (local) modelSelect.value = local.name; }
    if (!models.length) setStatus('Download the local model to get started');
    else setStatus(modelSelect.value.startsWith('cloud:') ? 'Cloud AI selected · internet required' : 'Local AI ready · offline');
    updateModelSelection();
  } catch {
    modelSelect.replaceChildren();
    const option = document.createElement('option');
    option.textContent = 'Local AI unavailable';
    modelSelect.append(option);
    send.disabled = true;
    setStatus('The bundled local AI runtime could not be loaded', true);
  }
}

function formatBytes(bytes) {
  if (!bytes) return 'Unknown size';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

function updateModelSelection() {
  const option = modelSelect.selectedOptions[0];
  const installed = option?.dataset.installed === 'true';
  const settingsOpen = !settingsView.hidden;
  send.disabled = !installed || Boolean(downloadingModel) || !sessionActive;
  if (installed) {
    modelDownload.hidden = true;
    localStorage.setItem('local-ai-model', modelSelect.value);
    return;
  }
  if (modelSelect.value.startsWith('cloud:')) { modelDownload.hidden = true; setStatus('Add a Gemini API key in AI & Models settings', true); return; }
  const info = recommendedModels.find((item) => item.name === modelSelect.value);
  modelDownload.hidden = !settingsOpen;
  downloadTitle.textContent = info?.label || modelSelect.value;
  downloadDetail.textContent = `${info?.description ? `${info.description} · ` : ''}${formatBytes(info?.size)}${info?.vision ? ' · Supports images' : ' · Text only'}`;
  downloadProgress.style.width = '0%';
  downloadModel.disabled = Boolean(downloadingModel);
  downloadModel.textContent = downloadingModel ? 'Downloading…' : 'Download';
}

function recentDialogueTurns() {
  return transcriptContext.filter((turn) => turn.speaker === 'computer' || turn.speaker === 'user').slice(-8);
}

function interviewChatMessages() {
  const dialogue = transcriptContext.filter((turn) => !turn.pending && String(turn.text || '').trim()).slice(-18);
  const messages = [{
    role: 'system',
    content: 'You are a private interview copilot helping a candidate in a live interview. System audio is the interviewer; microphone audio is the candidate; typed messages are the candidate speaking to you, not interviewer questions. Answer the latest typed request directly. Use the recent interview conversation as context when relevant. Never invent candidate experience. For interview questions, answer as the interviewee in first person, ready to speak aloud. Do not describe the interviewer or give coaching about what to say. Start with SHORT ANSWER, giving a direct response in one or two sentences. Then use KEY POINTS and an EXAMPLE or NEXT STEP when useful. Use simple words, short paragraphs, and 3–5 bullets when useful. Add relevant examples or next steps without repetition. For coding questions start with SHORT ANSWER, then use sections APPROACH, CODE, EXPLANATION, COMPLEXITY, EDGE CASES, and EXAMPLE when useful. Give a brief approach, complete fenced code with a language tag, explain the important parts and why they work, show usage and expected output when helpful, and cover complexity and meaningful edge cases. Explain every line only if requested.'
  }];
  for (const turn of dialogue) {
    const text = String(turn.text).slice(0, 2000);
    if (turn.speaker === 'assistant') messages.push({ role: 'assistant', content: text });
    else if (turn.source === 'typed') messages.push({ role: 'user', content: text });
    else if (turn.speaker === 'computer') {
      messages.push({ role: 'user', content: `Interviewer: ${text}` });
      if (turn.answer?.text) messages.push({ role: 'assistant', content: `Earlier suggested answer: ${String(turn.answer.text).slice(0, 2000)}` });
    } else messages.push({ role: 'user', content: `Candidate said: ${text}` });
  }
  if (preferredCodeLanguage) messages.push({ role: 'system', content: `For coding answers use ${preferredCodeLanguage}, unless the latest user request explicitly chooses another language. Explain the code as well.` });
  return messages;
}

function renderTypedAnswer(element, turn) {
  renderAnswerContent(element, turn.text, turn.requestMessages ? language => {
    if (cancelGeneration) return;
    turn.text = ''; turn.pending = true;
    activeTypedAnswerId = turn.id;
    element.classList.add('pending');
    showAnswerLoader(element);
    send.textContent = 'Stop';
    transcriptStatus.textContent = 'Generating answer…';
    cancelGeneration = window.overlay.chat({ model: modelSelect.value, context: effectiveContext(), messages: [...turn.requestMessages, { role: 'user', content: `Rewrite the solution to the same question in ${language}. Include complete code and update its explanation, example, complexity, and edge cases for this language.` }] }, {
      onChunk(chunk) {
        if (activeTypedAnswerId !== turn.id) return;
        turn.text += chunk; renderTypedAnswer(element, turn);
      },
      onDone() { finishGeneration(turn); },
      onError(error) { finishGeneration(turn, error); }
    });
  } : null, Boolean(turn.pending));
}

function finishGeneration(turn, error = '') {
  if (activeTypedAnswerId !== turn.id) return;
  if (error && !turn.text) turn.text = error === 'Stopped' ? 'Answer stopped.' : `Could not answer: ${error}`;
  delete turn.pending;
  cancelGeneration = null;
  activeTypedAnswerId = null;
  send.textContent = 'Send';
  const element = [...transcriptFeed.querySelectorAll('.transcript-message.assistant')].find((item) => item.dataset.turnId === turn.id);
  if (element) { renderTypedAnswer(element, turn); element.classList.remove('pending'); }
  saveTranscriptContext();
  renderSummary();
  transcriptStatus.textContent = error || 'Answer ready';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (cancelGeneration) {
    const turn = transcriptContext.find((item) => item.id === activeTypedAnswerId);
    cancelGeneration();
    if (turn) finishGeneration(turn, 'Stopped');
    return;
  }
  const content = prompt.value.trim();
  const model = modelSelect.value;
  if (!content || !model || send.disabled) return;
  const userTurn = { id: `typed-${Date.now()}-${Math.random().toString(16).slice(2)}`, speaker: 'user', source: 'typed', text: content };
  transcriptContext.push(userTurn);
  const requestMessages = interviewChatMessages();
  const assistantTurn = { id: `reply-${Date.now()}-${Math.random().toString(16).slice(2)}`, speaker: 'assistant', text: '', pending: true, requestMessages };
  transcriptContext.push(assistantTurn);
  activeTypedAnswerId = assistantTurn.id;
  saveTranscriptContext();
  renderSummary();
  appendTypedMessage(userTurn);
  const answerElement = appendTypedMessage(assistantTurn);
  prompt.value = '';
  prompt.style.height = '42px';
  promptSuggestions.replaceChildren();
  send.textContent = 'Stop';
  transcriptStatus.textContent = 'Answering your question…';
  cancelGeneration = window.overlay.chat({ model, messages: requestMessages, context: effectiveContext() }, {
    onChunk(chunk) {
      if (activeTypedAnswerId !== assistantTurn.id) return;
      assistantTurn.text += chunk;
      renderTypedAnswer(answerElement, assistantTurn);

    },
    onDone() { finishGeneration(assistantTurn); },
    onError(error) { finishGeneration(assistantTurn, error); }
  });
});

prompt.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
prompt.addEventListener('input', () => {
  prompt.style.height = 'auto';
  prompt.style.height = `${Math.min(prompt.scrollHeight, 130)}px`;
  renderPromptSuggestions();
});
modelSelect.addEventListener('change', updateModelSelection);
downloadModel.addEventListener('click', () => {
  if (downloadingModel) return;
  const model = modelSelect.value;
  downloadingModel = model;
  downloadModel.disabled = true;
  downloadModel.textContent = 'Downloading…';
  send.disabled = true;
  window.overlay.pullModel(model, {
    onProgress(progress) {
      const percent = progress.total ? Math.min(100, (progress.completed / progress.total) * 100) : 0;
      downloadProgress.style.width = `${percent}%`;
      downloadDetail.textContent = progress.total
        ? `${Math.round(percent)}% · ${formatBytes(progress.completed)} of ${formatBytes(progress.total)}`
        : progress.status;
    },
    async onDone() {
      downloadingModel = null;
      await refreshModels();
      const match = [...modelSelect.options].find((option) => option.value === model || option.value === `${model}:latest`);
      if (match) modelSelect.value = match.value;
      updateModelSelection();
      setStatus(`${model} downloaded and ready`);
    },
    onError(error) {
      downloadingModel = null;
      downloadModel.disabled = false;
      downloadModel.textContent = 'Retry';
      downloadDetail.textContent = error;
      setStatus(error, true);
    }
  });
});
const homeView = document.getElementById('home-view');
const setupView = document.getElementById('setup-view');
const showHome = document.getElementById('show-home');
const setupForm = document.getElementById('session-setup-form');
const companyInput = document.getElementById('session-company');
const setupContext = document.getElementById('session-context');
const resumeButton = document.getElementById('session-resume');
const resumeName = document.getElementById('session-resume-name');
const removeResume = document.getElementById('remove-resume');
const setupStatus = document.getElementById('session-setup-status');
const createSession = document.getElementById('session-create');
const endSession = document.getElementById('end-session');
let stagedResume = null;
let creatingSession = false;

function openSessionSetup() {
  setView('setup');
  companyInput.focus();
}
newChat.addEventListener('click', openSessionSetup);
document.getElementById('home-create').addEventListener('click', openSessionSetup);
showHome.addEventListener('click', () => setView('home'));
document.getElementById('setup-back').addEventListener('click', () => setView('home'));
document.getElementById('home-settings').addEventListener('click', () => {
  setView('settings');
  setSettingsTab('audio');
});
function renderStagedResume() {
  resumeName.textContent = stagedResume ? stagedResume.name : 'Upload your resume';
  removeResume.hidden = !stagedResume;
}
removeResume.addEventListener('click', () => { stagedResume = null; renderStagedResume(); });
resumeButton.addEventListener('click', async () => {
  if (!contextLoaded || creatingSession) return;
  resumeButton.disabled = true;
  setupStatus.textContent = 'Reading your resume…';
  try {
    const picked = await window.overlay.pickContextFiles({ resume: true });
    if (!picked.length) { setupStatus.textContent = ''; return; }
    if (picked.length !== 1) throw new Error('Select one resume for this session.');
    const file = picked[0];
    if (file.error) throw new Error(file.error);
    if (file.kind !== 'text' || !file.content?.trim()) throw new Error('Choose a PDF, DOCX, or text document with readable text.');
    stagedResume = file;
    renderStagedResume();
    setupStatus.textContent = '';
  } catch (error) { setupStatus.textContent = error.message || 'Could not read your resume. Please try again.'; }
  finally { resumeButton.disabled = false; }
});
setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (creatingSession) return;
  const company = companyInput.value.trim();
  if (!company) { setupStatus.textContent = 'Enter a company name to continue.'; companyInput.focus(); return; }
  creatingSession = true;
  createSession.disabled = true;
  resumeButton.disabled = true;
  removeResume.disabled = true;
  companyInput.disabled = true;
  setupContext.disabled = true;
  setupStatus.textContent = 'Preparing your session…';
  const nextContext = {
    text: `Company: ${company}\n\n${setupContext.value.trim()}`.trim(),
    files: stagedResume ? [stagedResume] : []
  };
  try {
    if (transcriptionRunning) await stopLiveTranscription();
    if (sessionActive) {
      const wallet = await window.overlay.stopUsage();
      updateUsageState({ active: false, ...wallet });
    }
    await window.overlay.createRecordedSession({ company, extraContext: setupContext.value.trim(), resume: stagedResume });
    clearSessionContext();
    sessionContext.set(nextContext);
    cancelGeneration?.();
    cancelGeneration = null;
    cancelInterviewAnswer?.();
    cancelInterviewAnswer = null;
    clearTimeout(answerStartTimer);
    answerStartTimer = null;
    activeTypedAnswerId = null;
    localStorage.removeItem(STORAGE_KEY);
    resetTranscriptHistory();
    prompt.value = '';
    send.textContent = 'Send';
    promptSuggestions.replaceChildren();
    setupStatus.textContent = '';
    setView('transcript');
    transcriptStatus.textContent = `${company} session ready`;
    floatingQuestionText.textContent = 'Listening for the interviewer’s question…';
    floatingAnswerOpen = false;
    setupForm.reset();
    stagedResume = null;
    renderStagedResume();
    await startLiveTranscription();
  } catch (error) {
    if (sessionContext.hasSession()) {
      setView('transcript');
      transcriptStatus.textContent = error.message || 'Could not start listening. Try Start listening again.';
      if (floatingView) await setFloatingView(false);
    } else setView('setup');
    setupStatus.textContent = error.message || 'Could not create the session. Please try again.';
  } finally {
    creatingSession = false;
    createSession.disabled = false;
    resumeButton.disabled = !contextLoaded;
    removeResume.disabled = false;
    companyInput.disabled = false;
    setupContext.disabled = false;
  }
});

function clearSessionContext() {
  sessionContext.clear();
  returnFloating.hidden = true;
  floatingQuestionText.textContent = 'Listening for the interviewer’s question…';
  floatingAnswerOpen = false;
  if (floatingView) setFloatingView(false, false).catch(error => setStatus(error.message, true));
  cancelGeneration?.();
  cancelGeneration = null;
  cancelInterviewAnswer?.();
  cancelInterviewAnswer = null;
  activeInterviewAnswerTurnId = null;
  clearTimeout(answerStartTimer);
  answerStartTimer = null;
  interviewPipelineRevision += 1;
  clearTimeout(suggestionTimer);
  suggestionRevision += 1;
  promptSuggestions.replaceChildren();
  // Remove cached session snippets from transcript history and rendered cards.
  for (const turn of transcriptContext) delete turn.retrievedContext;
  for (const card of transcriptFeed.querySelectorAll('.interview-answer')) {
    if (card.answerRequest) card.answerRequest = { ...card.answerRequest, retrievedContext: {} };
  }
  saveTranscriptContext();
}

endSession.addEventListener('click', async () => {
  if (creatingSession) return;
  endSession.disabled = true;
  try {
    if (transcriptionRunning) await stopLiveTranscription();
    const wallet = await window.overlay.stopUsage();
    await window.overlay.endRecordedSession();
    clearSessionContext();
    stagedResume = null;
    setupForm.reset();
    renderStagedResume();
    setupStatus.textContent = '';
    updateUsageState({ active: false, ...wallet });
    setView('home');
  } catch (error) { setStatus(error.message || 'Could not end the session. Please try again.', true); }
  finally { endSession.disabled = false; }
});

const historyView = document.getElementById('history-view');
const showHistory = document.getElementById('show-history');
const historyList = document.getElementById('history-list');
const historyStatus = document.getElementById('history-status');
const historyMore = document.getElementById('history-more');
let historyPage = 0;
let historyRevision = 0;
function appendHistorySession(session) {
  const row = document.createElement('tr'); row.className = 'history-item';
  const cell = (value, className = '') => {
    const element = document.createElement('td');
    element.className = className;
    const content = document.createElement('span');
    content.textContent = value;
    content.title = value;
    element.append(content); row.append(element);
    return content;
  };
  cell(session.company, 'history-company');
  cell(new Date(session.createdAt).toLocaleString(), 'history-meta');
  cell(session.extraContext || '—', 'history-context');
  const resumeTitle = cell(session.resume?.name || '—', 'history-resume');
  const resumeFile = document.createElement('div'); resumeFile.className = 'history-resume-file';
  resumeTitle.replaceWith(resumeFile); resumeFile.append(resumeTitle);
  const seconds = Math.max(0, Math.floor(Number(session.consumedSeconds) || 0));
  const usage = cell(`${Math.floor(seconds / 60)}m ${seconds % 60}s`, 'history-usage');
  usage.title = `${Math.floor(seconds / 60)}m ${seconds % 60}s consumed`;
  if (session.resume) {
    const download = document.createElement('button'); download.type = 'button'; download.className = 'history-resume-download'; download.append(createAppIcon('download'));
    download.title = `Download ${session.resume.name}`;
    download.setAttribute('aria-label', `Download resume for ${session.company}`);
    download.addEventListener('click', async () => {
      download.disabled = true; historyStatus.textContent = 'Downloading resume…';
      try {
        const result = await window.overlay.downloadSessionResume(session.id);
        historyStatus.textContent = result.canceled ? '' : 'Resume saved.';
      } catch (error) { historyStatus.textContent = error.message || 'Could not download the resume.'; }
      finally { download.disabled = false; }
    });
    resumeFile.append(download);
  }
  historyList.append(row);
}
async function loadSessionHistory(reset = true) {
  const revision = ++historyRevision;
  if (reset) { historyPage = 0; historyList.replaceChildren(); }
  historyStatus.textContent = 'Loading session history…'; historyMore.disabled = true;
  try {
    const result = await window.overlay.listSessionHistory(historyPage);
    if (revision !== historyRevision) return;
    result.sessions.forEach(appendHistorySession);
    historyMore.hidden = !result.hasMore; historyPage += 1;
    historyStatus.textContent = historyList.children.length ? '' : 'No sessions yet. Create a session from Home to get started.';
  } catch (error) { if (revision === historyRevision) historyStatus.textContent = error.message || 'Could not load session history. Try Refresh.'; }
  finally { historyMore.disabled = false; }
}
showHistory.addEventListener('click', () => { setView('history'); loadSessionHistory(); });
document.getElementById('history-refresh').addEventListener('click', () => loadSessionHistory());
historyMore.addEventListener('click', () => loadSessionHistory(false));

function setView(view) {
  const historyOpen = view === 'history';
  historyView.hidden = !historyOpen;
  showHistory.classList.toggle('active', historyOpen);
  status.dataset.error = 'false';
  const homeOpen = view === 'home';
  const setupOpen = view === 'setup';
  homeView.hidden = !homeOpen;
  setupView.hidden = !setupOpen;
  showHome.classList.toggle('active', homeOpen || setupOpen);
  const notesOpen = view === 'notes';
  const contextOpen = view === 'context';
  const transcriptOpen = view === 'transcript';
  const summaryOpen = view === 'summary';
  const settingsOpen = view === 'settings';
  const offersOpen = view === 'offers';
  notesView.hidden = !notesOpen;
  contextView.hidden = !contextOpen;
  transcriptView.hidden = !transcriptOpen;
  summaryView.hidden = !summaryOpen;
  settingsView.hidden = !settingsOpen;
  offersView.hidden = !offersOpen;
  form.hidden = !transcriptOpen || !sessionActive;
  promptSuggestions.hidden = !transcriptOpen;
  modelSelect.hidden = !settingsOpen;
  newChat.hidden = settingsOpen || offersOpen || setupOpen || homeOpen || historyOpen;
  sessionClock.hidden = settingsOpen || offersOpen || setupOpen || homeOpen || historyOpen;
  endSession.hidden = !sessionContext.hasSession() && !sessionActive;
  returnFloating.hidden = floatingView || !sessionContext.hasSession();
  const blockedScreen = !sessionActive && transcriptOpen;
  sessionBlocker.hidden = !blockedScreen;
  sessionBlockerMessage.textContent = 'Start your session to use live transcription and interview answers.';
  updateModelSelection();
  showNotes.classList.toggle('active', notesOpen);
  showContext.classList.toggle('active', contextOpen);
  showAccount.classList.toggle('active', settingsOpen);
  openOffers.classList.toggle('active', offersOpen);
  panel.classList.toggle('settings-mode', settingsOpen || offersOpen);
  panel.classList.toggle('offers-mode', offersOpen);
  viewTitle.textContent = historyOpen ? 'Session history' : homeOpen ? 'Home' : setupOpen ? 'New session' : settingsOpen ? 'Settings' : offersOpen ? 'Recharge & Offers' : notesOpen ? 'Notepad' : contextOpen ? 'Global context' : summaryOpen ? 'Meeting summary' : 'Live transcription';
  status.textContent = historyOpen ? 'Saved to your account' : homeOpen ? 'Your next conversation starts here' : setupOpen ? 'Tailor your conversation copilot' : settingsOpen ? 'Appearance is saved locally' : offersOpen ? 'Manage your local account usage' : notesOpen || contextOpen ? 'Stored only on this computer' : summaryOpen ? 'Conversation saved locally' : 'On-device speech recognition and interview answers';
  if (notesOpen) notepad.focus();
  if (contextOpen) contextInput.focus();
  else if (!notesOpen) renderPromptSuggestions();
}

function setSettingsTab(tab) {
  const appearanceOpen = tab === 'appearance';
  const audioOpen = tab === 'audio';
  const aiOpen = tab === 'ai';
  settingsAppearanceTab.setAttribute('aria-selected', String(appearanceOpen));
  settingsAudioTab.setAttribute('aria-selected', String(audioOpen));
  settingsAiTab.setAttribute('aria-selected', String(aiOpen));
  settingsAppearancePanel.hidden = !appearanceOpen;
  settingsAudioPanel.hidden = !audioOpen;
  settingsAiPanel.hidden = !aiOpen;
  if (audioOpen) refreshMicrophonePermissionStatus();
  updateModelSelection();
}

function renderUsageClock() {
  const elapsed = sessionActive ? Math.floor((Date.now() - usageClockStartedAt) / 1000) : 0;
  const remaining = Math.max(0, availableUsageSeconds - elapsed);
  sessionClock.textContent = formatUsage(remaining);
  headerTimeRemaining.textContent = `${formatUsage(remaining)} left`;
}

function updateUsageState(value = {}) {
  sessionActive = Boolean(value.active);
  if (Number.isFinite(Number(value.balanceSeconds))) availableUsageSeconds = Math.max(0, Math.floor(Number(value.balanceSeconds)));
  usageClockStartedAt = sessionActive ? Date.now() : 0;
  clearInterval(usageClockTimer);
  usageClockTimer = null;
  renderUsageClock();
  if (sessionActive) usageClockTimer = setInterval(renderUsageClock, 1000);
  syncFloatingStatus();
  walletBalance.textContent = formatUsage(availableUsageSeconds);
  updateModelSelection();
  const view = !historyView.hidden ? 'history' : !homeView.hidden ? 'home' : !setupView.hidden ? 'setup' : !offersView.hidden ? 'offers' : !settingsView.hidden ? 'settings' : !notesView.hidden ? 'notes' : !contextView.hidden ? 'context' : !summaryView.hidden ? 'summary' : 'transcript';
  setView(view);
}

document.getElementById('header-add-time').addEventListener('click', openRechargeOffers);

async function openRechargeOffers() {
  setView('offers');
  paymentStatus.className = '';
  paymentStatus.textContent = 'Recharge to continue your session.';
  await Promise.allSettled([loadPaymentPlans(), refreshWallet()]);
}

async function ensureUsageSession() {
  if (sessionActive) return;
  const session = await window.overlay.startUsage();
  updateUsageState({ active: true, ...session });
}

floatingPause.addEventListener('click', async () => {
  floatingPause.disabled = true;
  try {
    if (sessionActive) {
      if (transcriptionRunning) await stopLiveTranscription();
      const wallet = await window.overlay.stopUsage();
      updateUsageState({ active: false, ...wallet });
    } else {
      if (floatingView) await startLiveTranscription();
      else await ensureUsageSession();
    }
  } catch (error) {
    updateUsageState({ active: false });
    setStatus(error.message || 'Recharge to continue.', true);
    await openRechargeOffers();
  } finally { floatingPause.disabled = false; }
});


showNotes.addEventListener('click', () => setView('notes'));
showContext.addEventListener('click', () => setView('context'));
showAccount.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = accountMenu.hidden;
  accountMenu.hidden = !open;
  showAccount.setAttribute('aria-expanded', String(open));
  if (open) openSettings.focus();
});
accountMenu.addEventListener('click', (event) => event.stopPropagation());
function formatUsage(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes} minutes`;
}

async function refreshWallet() {
  try {
    const wallet = await window.overlay.getWallet();
    availableUsageSeconds = Math.max(0, Math.floor(Number(wallet.balanceSeconds) || 0));
    walletBalance.textContent = formatUsage(availableUsageSeconds);
    usageClockStartedAt = sessionActive ? Date.now() : 0;
    renderUsageClock();
    return wallet;
  } catch { walletBalance.textContent = 'Unavailable'; headerTimeRemaining.textContent = 'Time unavailable'; }
}

let customMinutePricing = null;
let paymentsAvailable = false;
let rechargePacks = [];
const customMinutes = document.getElementById('custom-minutes');
let rechargeInProgress = false;
function updateRechargeQuote() {
  document.getElementById('custom-minutes-fields').hidden = !customMinutePricing?.enabled;
  document.getElementById('jump-to-custom-minutes').hidden = !customMinutePricing?.enabled;
  customMinutes.disabled = !customMinutePricing?.enabled || rechargeInProgress;
  const minutes = (/^\d+$/.test(customMinutes.value) ? Number(customMinutes.value) : NaN);
  const valid = customMinutePricing?.enabled && Number.isSafeInteger(minutes) && minutes >= customMinutePricing.minMinutes && minutes <= customMinutePricing.maxMinutes;
  const isCustom = rechargePlan.value === 'custom_minutes';
  customMinutes.required = isCustom;
  const selectedPack = rechargePacks.find(plan => plan.id === rechargePlan.value);
  const total = isCustom ? (valid ? minutes * customMinutePricing.amountPaisePerMinute : null) : selectedPack?.amountPaise;
  document.getElementById('custom-minutes-total').textContent = valid ? `Total to pay: ${rupees(minutes * customMinutePricing.amountPaisePerMinute)}` : 'Enter a whole number of minutes within the allowed range.';
  document.getElementById('custom-checkout').hidden = total == null;
  document.getElementById('recharge-total').textContent = total == null ? '—' : rupees(total);
  rechargeSubmit.disabled = !paymentsAvailable || total == null || rechargeInProgress;
  document.querySelectorAll('.pack-buy').forEach(button => { button.disabled = !paymentsAvailable || rechargeInProgress; });
}
customMinutes.addEventListener('beforeinput', event => {
  if (event.data !== null && /[^0-9]/.test(event.data)) event.preventDefault();
});
customMinutes.addEventListener('paste', event => {
  const text = event.clipboardData?.getData('text') || '';
  if (!/^[0-9]+$/.test(text)) event.preventDefault();
});
customMinutes.addEventListener('input', () => {
  customMinutes.value = customMinutes.value.replace(/[^0-9]/g, '');
  rechargePlan.value = 'custom_minutes'; updateRechargeQuote();
});
document.getElementById('jump-to-custom-minutes').addEventListener('click', () => {
  if (!customMinutePricing?.enabled) return;
  rechargePlan.value = 'custom_minutes';
  updateRechargeQuote();
  document.getElementById('custom-minutes-fields').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  customMinutes.focus({ preventScroll: true });
});
function rupees(paise) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100); }
function renderRechargePacks() {
  const container = document.getElementById('recharge-packs');
  container.replaceChildren();
  const bestRate = Math.min(...rechargePacks.map(plan => plan.amountPaise / (plan.durationSeconds / 60)));
  for (const plan of rechargePacks) {
    const card = document.createElement('article'); card.className = 'recharge-pack'; card.dataset.planId = plan.id;
    const rate = plan.amountPaise / (plan.durationSeconds / 60);
    const base = customMinutePricing?.enabled ? customMinutePricing.amountPaisePerMinute : 0;
    const savings = base > rate ? Math.floor((1 - rate / base) * 100) : 0;
    for (const [className, text] of [
      ['pack-badge', rate === bestRate && rechargePacks.length > 1 ? 'Best value' : 'Minute pack'],
      ['pack-name', plan.name || 'Minute pack'],
      ['pack-minutes', `${(plan.durationSeconds / 60).toLocaleString('en-IN', { maximumFractionDigits: 2 })} minutes`],
      ['pack-price', rupees(plan.amountPaise)], ['pack-rate', `${rupees(rate)} / minute`],
      ['pack-savings', savings ? `Save ${savings}% vs custom minutes` : 'One-time purchase']
    ]) { const span = document.createElement('span'); span.className = className; span.textContent = text; card.append(span); }
    if (rate === bestRate && rechargePacks.length > 1) card.classList.add('best-value');
    const priceRow = document.createElement('div'); priceRow.className = 'pack-price-row';
    const price = card.querySelector('.pack-price'); card.insertBefore(priceRow, price); priceRow.append(price);
    if (Number.isSafeInteger(plan.originalAmountPaise) && plan.originalAmountPaise > plan.amountPaise) {
      const original = document.createElement('del'); original.className = 'pack-original-price';
      original.textContent = rupees(plan.originalAmountPaise);
      original.setAttribute('aria-label', `Original price ${rupees(plan.originalAmountPaise)}`);
      priceRow.insertBefore(original, price);
    }
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'pack-buy';
    buy.textContent = 'Buy';
    buy.setAttribute('aria-label', `Buy ${plan.durationSeconds / 60} minutes for ${rupees(plan.amountPaise)}`);
    buy.addEventListener('click', () => { rechargePlan.value = plan.id; updateRechargeQuote(); purchaseRecharge(); });
    card.append(buy);
    container.append(card);
  }
  if (!rechargePacks.length) { const empty = document.createElement('p'); empty.textContent = 'No minute packs are available right now.'; container.append(empty); }
}

let paymentPlansLoading = false;
async function loadPaymentPlans() {
  if (paymentPlansLoading || rechargeInProgress) return;
  paymentPlansLoading = true;
  const previousSelection = rechargePlan.value;
  const enteredMinutes = customMinutes.value;
  try {
    const result = await window.overlay.getPaymentPlans();
    rechargePlan.replaceChildren(...result.plans.map((plan) => {
      const option = document.createElement('option');
      option.value = plan.id;
      option.textContent = `${formatUsage(plan.durationSeconds)} · ₹${(plan.amountPaise / 100).toFixed(2)} · ₹${(plan.amountPaise / 100 / (plan.durationSeconds / 60)).toFixed(2)}/min`;
      return option;
    }));
    rechargePacks = result.plans;
    customMinutePricing = result.customPricing;
    paymentsAvailable = result.configured;
    if (customMinutePricing?.enabled) {
      const option = document.createElement('option'); option.value = 'custom_minutes';
      option.textContent = `Custom minutes · ₹${(customMinutePricing.amountPaisePerMinute / 100).toFixed(2)}/min`;
      rechargePlan.append(option);
      customMinutes.min = customMinutePricing.minMinutes; customMinutes.max = customMinutePricing.maxMinutes;
      customMinutes.value = enteredMinutes;
      document.getElementById('custom-minute-rate').textContent = `${rupees(customMinutePricing.amountPaisePerMinute)} per minute · no pack required`;
      document.getElementById('custom-minute-range').textContent = `Buy ${customMinutePricing.minMinutes.toLocaleString('en-IN')}–${customMinutePricing.maxMinutes.toLocaleString('en-IN')} minutes.`;
    }
    rechargePlan.value = previousSelection;
    if (!previousSelection) rechargePlan.selectedIndex = -1;
    renderRechargePacks();
    updateRechargeQuote();
    if (!result.configured) paymentStatus.textContent = 'Payment setup pending';
    else if (paymentStatus.textContent === 'Loading plans…' || paymentStatus.textContent.startsWith('Could not load plans:') || paymentStatus.textContent === 'Payment setup pending') { paymentStatus.textContent = ''; paymentStatus.className = ''; }
  } catch (error) {
    paymentsAvailable = false;
    rechargeSubmit.disabled = true;
    paymentStatus.className = 'error';
    paymentStatus.textContent = error?.message === 'fetch failed'
      ? 'Payment server is unavailable. Start it, then reopen this screen.'
      : `Could not load plans: ${error?.message || 'Unknown error'}`;
  } finally { paymentPlansLoading = false; }
}


function couponErrorMessage(error) {
  const raw = String(error?.message || '').replace(/^Error invoking remote method '[^']+': Error:\s*/i, '').trim();
  if (/already used this coupon/i.test(raw)) return 'This coupon has already been redeemed on your account.';
  if (/invalid or expired/i.test(raw)) return 'This coupon is invalid or has expired.';
  if (/redemption limit/i.test(raw)) return 'This coupon is no longer available.';
  if (/sign in/i.test(raw)) return 'Sign in before redeeming a coupon.';
  return raw || 'Could not redeem this coupon.';
}

async function watchPayment(id) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = await window.overlay.getPaymentStatus(id);
    if (result.status === 'credited') return result;
    if (result.status === 'failed') throw new Error('Payment failed.');
  }
  throw new Error('Payment confirmation is taking longer than expected.');
}

paymentWaitModal.addEventListener('cancel', (event) => event.preventDefault());

async function purchaseRecharge() {
  if (rechargeInProgress || !paymentsAvailable) return;
  rechargeInProgress = true;
  updateRechargeQuote();
  paymentStatus.className = '';
  paymentStatus.textContent = 'Opening secure checkout…';
  paymentWaitMessage.textContent = 'Opening secure checkout…';
  try {
    paymentWaitModal.showModal();
    const payment = await window.overlay.startRecharge(rechargePlan.value, rechargePlan.value === 'custom_minutes' ? (/^\d+$/.test(customMinutes.value) ? Number(customMinutes.value) : NaN) : undefined, rechargePlan.value === 'custom_minutes' ? customMinutePricing : rechargePacks.find(plan => plan.id === rechargePlan.value));
    if (payment.priceUpdated) {
      paymentWaitModal.close();
      document.getElementById('pricing-updated-modal').showModal();
      paymentStatus.textContent = 'Pricing has changed. Refresh before continuing.';
      return;
    }
    paymentStatus.textContent = 'Complete payment in your browser…';
    paymentWaitMessage.textContent = 'Complete your payment in the browser. Waiting for confirmation…';
    await watchPayment(payment.paymentId);
    await refreshWallet();
    paymentStatus.className = 'success';
    paymentStatus.textContent = `${formatUsage(payment.durationSeconds)} added.`;
  } catch (error) {
    paymentStatus.className = 'error';
    paymentStatus.textContent = error.message || 'Could not complete payment.';
  } finally {
    if (paymentWaitModal.open) paymentWaitModal.close();
    rechargeInProgress = false;
    updateRechargeQuote();
  }
}
rechargeForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!rechargeForm.reportValidity() || rechargeSubmit.disabled) return;
  purchaseRecharge();
});

couponForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = couponCode.value.trim().toUpperCase();
  if (!code) return;
  couponSubmit.disabled = true;
  couponStatus.className = '';
  couponStatus.textContent = 'Checking…';
  try {
    const result = await window.overlay.redeemCoupon(code);
    couponCode.value = '';
    couponStatus.className = 'success';
    couponStatus.textContent = result.message;
    await refreshWallet();
  } catch (error) {
    couponStatus.className = 'error';
    couponStatus.textContent = couponErrorMessage(error);
  } finally { couponSubmit.disabled = false; }
});
function applyAuthState(result) {
  const authenticated = Boolean(result?.authenticated);
  loginGate.hidden = authenticated;
  if (authenticated) {
    accountName.textContent = result.user?.name || result.user?.email || 'Signed in';
    document.getElementById('account-email').textContent = result.user?.email || 'Signed in to UNYON';
    document.getElementById('account-avatar').textContent = accountName.textContent.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    refreshWallet();
  }
  return authenticated;
}

async function clearLocalUserWorkspace() {
  historyRevision += 1;
  historyList.replaceChildren();
  clearSessionContext();
  stagedResume = null;
  setupForm.reset();
  renderStagedResume();
  cancelGeneration?.();
  cancelGeneration = null;
  cancelInterviewAnswer?.();
  cancelInterviewAnswer = null;
  clearTimeout(answerStartTimer);
  answerStartTimer = null;
  clearTimeout(noteSaveTimer);
  clearTimeout(contextSaveTimer);
  clearTimeout(suggestionTimer);
  suggestionRevision += 1;
  if (transcriptionRunning) await stopLiveTranscription();

  localStorage.removeItem(STORAGE_KEY);
  activeTypedAnswerId = null;
  resetTranscriptHistory();
  contextState = { text: '', files: [] };
  contextUploadErrors = [];
  contextInput.value = '';
  notepad.value = '';
  prompt.value = '';
  promptSuggestions.replaceChildren();
  send.textContent = 'Send';
  renderContextFiles();

  // Let an in-flight context save finish before replacing it with the empty state.
  await contextSaveQueue.catch(() => {});
  await Promise.allSettled([
    window.overlay.saveNotes(''),
    window.overlay.saveContext(contextState)
  ]);
  notesStatus.textContent = 'Saved locally';
  contextSaveStatus.textContent = 'Saved locally';
  setView('home');
  transcriptStatus.textContent = 'New session ready';
}

window.overlay.onGoogleBrowserOpened(() => { loginStatus.textContent = 'Complete Google sign-in in your browser…'; });
googleLogin.addEventListener('click', async () => {
  googleLogin.disabled = true;
  loginStatus.classList.remove('error');
  loginStatus.textContent = 'Connecting to sign-in server…';
  try {
    const result = await window.overlay.loginWithGoogle();
    applyAuthState(result);
    loginStatus.textContent = '';
  } catch (error) {
    loginStatus.classList.add('error');
    loginStatus.textContent = error.message || 'Could not sign in.';
  } finally { googleLogin.disabled = false; }
});

logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    await clearLocalUserWorkspace();
    applyAuthState(await window.overlay.logout());
    loginStatus.textContent = 'Signed out';
    accountMenu.hidden = true;
  } finally { logout.disabled = false; }
});
openSettings.addEventListener('click', () => {
  accountMenu.hidden = true;
  showAccount.setAttribute('aria-expanded', 'false');
  setView('settings');
  setSettingsTab('appearance');
});
openOffers.addEventListener('click', () => {
  accountMenu.hidden = true;
  showAccount.setAttribute('aria-expanded', 'false');
  setView('offers');
  paymentStatus.className = '';
  paymentStatus.textContent = 'Loading plans…';
  loadPaymentPlans();
  refreshWallet();
});
settingsAppearanceTab.addEventListener('click', () => setSettingsTab('appearance'));
settingsAudioTab.addEventListener('click', () => setSettingsTab('audio'));
settingsAiTab.addEventListener('click', () => setSettingsTab('ai'));
document.addEventListener('click', () => {
  accountMenu.hidden = true;
  showAccount.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!accountMenu.hidden) showAccount.focus();
    accountMenu.hidden = true;
    showAccount.setAttribute('aria-expanded', 'false');
  }
});
appOpacity.addEventListener('input', () => applyAppearance({ app: Number(appOpacity.value), text: Number(textOpacity.value) }));
textOpacity.addEventListener('input', () => applyAppearance({ app: Number(appOpacity.value), text: Number(textOpacity.value) }));

function updateAudioSourceButtons() {
  toggleMicrophone.setAttribute('aria-pressed', String(transcriptionSources.microphone));
  toggleSystemAudio.setAttribute('aria-pressed', String(transcriptionSources.system));
  toggleMicrophone.textContent = transcriptionSources.microphone ? 'On' : 'Off';
  toggleSystemAudio.textContent = transcriptionSources.system ? 'On' : 'Off';
  toggleMicrophone.disabled = transcriptionRunning;
  toggleSystemAudio.disabled = transcriptionRunning;
  renderAudioPermissionLists();
}

toggleMicrophone.addEventListener('click', () => {
  transcriptionSources.microphone = !transcriptionSources.microphone;
  transcriptStatus.textContent = transcriptionSources.microphone
    ? 'Microphone enabled · echo protection active'
    : 'Microphone disabled';
  updateAudioSourceButtons();
});

toggleSystemAudio.addEventListener('click', () => {
  transcriptionSources.system = !transcriptionSources.system;
  updateAudioSourceButtons();
});

updateAudioSourceButtons();

let audioWindowSeconds = 2;

function beginAudioCapture(stream, speaker) {
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) { stream.getTracks().forEach((track) => track.stop()); throw new Error(`${speaker === 'user' ? 'Microphone' : 'Computer'} audio was not shared.`); }
  stream.getVideoTracks().forEach((track) => track.stop());
  const context = new AudioContext({ sampleRate: 16000 });
  const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silent = context.createGain();
  silent.gain.value = 0;
  const chunks = [];
  let sampleCount = 0;
  processor.onaudioprocess = (event) => {
    if (!transcriptionRunning) return;
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input);
    chunks.push(copy);
    sampleCount += copy.length;
    // Local 1.5-second windows with overlap preserve words that straddle
    // chunk boundaries; the backend's VAD removes non-speech inside them.
    if (sampleCount < context.sampleRate * audioWindowSeconds) return;
    const merged = new Float32Array(sampleCount);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    chunks.length = 0;
    const overlap = merged.slice(Math.max(0, merged.length - Math.round(context.sampleRate * 0.5)));
    chunks.push(overlap);
    sampleCount = overlap.length;
    let output = merged;
    if (context.sampleRate !== 16000) {
      const length = Math.max(1, Math.round(merged.length * 16000 / context.sampleRate));
      output = new Float32Array(length);
      for (let index = 0; index < length; index += 1) {
        const position = index * context.sampleRate / 16000;
        const left = Math.floor(position);
        const right = Math.min(merged.length - 1, left + 1);
        const mix = position - left;
        output[index] = merged[left] * (1 - mix) + merged[right] * mix;
      }
    }
    window.overlay.sendTranscriptionAudio(speaker, new Uint8Array(output.buffer));
  };
  source.connect(processor);
  processor.connect(silent);
  silent.connect(context.destination);
  return async () => {
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
  };
}

function streamIsLive(stream) {
  return Boolean(stream?.getAudioTracks().some((track) => track.readyState === 'live'));
}

const microphoneConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  video: false
};

function selectedPermissionsReady() {
  return (!transcriptionSources.microphone || audioPermissionState.microphone === 'ready') &&
    (!transcriptionSources.system || audioPermissionState.system === 'ready');
}

function renderPermissionList(container, selectedOnly) {
  container.replaceChildren();
  for (const source of ['microphone', 'system']) {
    if (selectedOnly && !transcriptionSources[source]) continue;
    const enabled = transcriptionSources[source];
    const state = enabled ? audioPermissionState[source] : 'off';
    const row = document.createElement('div');
    row.className = 'permission-row';
    row.dataset.state = state;
    const mark = document.createElement('span');
    mark.className = 'permission-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.append(createAppIcon(state === 'ready' ? 'check' : 'info'));
    const copy = document.createElement('div');
    copy.className = 'permission-copy';
    const title = document.createElement('strong');
    title.textContent = source === 'microphone' ? 'Microphone' : 'System audio';
    const detail = document.createElement('span');
    detail.textContent = state === 'ready' ? 'Access ready' : state === 'off' ? 'Turn on this source above to use it' :
      state === 'checking' ? 'Checking access…' : state === 'needs' ? 'Permission needed' : 'Not checked yet';
    copy.append(title, detail);
    row.append(mark, copy);
    if (enabled && state !== 'ready') {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'permission-action';
      action.textContent = state === 'checking' ? 'Checking…' : state === 'needs' ? 'Try again' : 'Allow';
      action.disabled = state === 'checking' || transcriptionRunning;
      action.addEventListener('click', () => requestAudioPermission(source));
        }
    container.append(row);
  }
}

function renderAudioPermissionLists() {
  renderPermissionList(settingsPermissionList, false);
  renderPermissionList(permissionList, true);
}

async function refreshMicrophonePermissionStatus() {
  if (streamIsLive(permissionStreams.user)) {
    audioPermissionState.microphone = 'ready';
  } else if (window.overlay.platform === 'darwin') {
    const status = await window.overlay.getMicrophonePermissionStatus().catch(() => 'unknown');
    audioPermissionState.microphone = status === 'granted' ? 'ready' :
      status === 'denied' || status === 'restricted' ? 'needs' : 'unknown';
  } else {
    const status = navigator.permissions?.query
      ? await navigator.permissions.query({ name: 'microphone' }).catch(() => null)
      : null;
    audioPermissionState.microphone = status?.state === 'granted' ? 'ready' : status?.state === 'denied' ? 'needs' : 'unknown';
  }
  renderAudioPermissionLists();
}

async function checkAudioPermissions() {
  if (transcriptionSources.microphone) {
    await refreshMicrophonePermissionStatus();
  }
  if (transcriptionSources.system) {
    if (window.overlay.platform === 'darwin') {
      audioPermissionState.system = 'checking';
      renderAudioPermissionLists();
      try { await window.overlay.requestSystemAudio(); audioPermissionState.system = 'ready'; }
      catch { audioPermissionState.system = 'needs'; }
    } else if (window.overlay.platform !== 'darwin') {
      audioPermissionState.system = streamIsLive(permissionStreams.computer) ? 'ready' : 'needs';
    }
  }
  if (transcriptionSources.microphone && audioPermissionState.microphone === 'ready' &&
    (!transcriptionSources.system || audioPermissionState.system === 'ready') && !streamIsLive(permissionStreams.user)) {
    try { permissionStreams.user = await navigator.mediaDevices.getUserMedia(microphoneConstraints); }
    catch { audioPermissionState.microphone = 'needs'; }
  }
  renderAudioPermissionLists();
  return selectedPermissionsReady();
}

async function requestAudioPermission(source) {
  let resumeListening = false;
  audioPermissionState[source] = 'checking';
  permissionStatus.classList.remove('error');
  permissionStatus.textContent = `Checking ${source === 'microphone' ? 'microphone' : 'system audio'} access…`;
  renderAudioPermissionLists();
  try {
    if (source === 'microphone') {
      const status = window.overlay.platform === 'darwin'
        ? await window.overlay.getMicrophonePermissionStatus() : 'unknown';
      if (status === 'denied' || status === 'restricted') {
        await window.overlay.openAudioPermissionSettings('microphone');
        throw new Error('Enable Microphone for UNYON in macOS Privacy & Security, then click Try again.');
      }
      permissionStreams.user?.getTracks().forEach((track) => track.stop());
      permissionStreams.user = await navigator.mediaDevices.getUserMedia(microphoneConstraints);
      if (!streamIsLive(permissionStreams.user)) throw new Error('Microphone did not provide an audio stream.');
    } else if (window.overlay.platform === 'darwin') {
      await window.overlay.requestSystemAudio();
    } else {
      permissionStreams.computer?.getTracks().forEach((track) => track.stop());
      permissionStreams.computer = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, systemAudio: 'include' });
      if (!streamIsLive(permissionStreams.computer)) throw new Error('Select system audio in the sharing picker.');
    }
    if (source === 'microphone') {
      permissionStreams.user.getTracks().forEach((track) => track.stop());
      permissionStreams.user = null;
    }
    audioPermissionState[source] = 'ready';
    permissionStatus.textContent = `${source === 'microphone' ? 'Microphone' : 'System audio'} ready.`;
    renderAudioPermissionLists();
    if (!permissionGate.hidden && selectedPermissionsReady()) {
      permissionGate.hidden = true;
      window.overlay.completePermissionGate();
      resumeListening = true;
    }
  } catch (error) {
    audioPermissionState[source] = 'needs';
    if (source === 'system' && window.overlay.platform === 'darwin' &&
      /permission|denied|access/i.test(error?.message || '')) {
      window.overlay.openAudioPermissionSettings('system').catch(() => {});
    }
    permissionStatus.classList.add('error');
    permissionStatus.textContent = error?.name === 'NotAllowedError'
      ? `Allow ${source === 'microphone' ? 'Microphone' : 'System audio'} in Privacy & Security, then click Try again.`
      : (error?.message || 'Could not request audio permission.');
    renderAudioPermissionLists();
  }
  if (resumeListening) {
    try { await startLiveTranscription(); }
    catch (error) { transcriptStatus.textContent = error.message || 'Could not start listening.'; }
  }
}

async function startLiveTranscription() {
  if (!transcriptionSources.microphone && !transcriptionSources.system) {
    transcriptStatus.textContent = 'Turn on Microphone or System audio.';
    return;
  }
  transcriptStatus.textContent = 'Checking audio access…';
  if (!await checkAudioPermissions()) {
    permissionStreams.user?.getTracks().forEach((track) => track.stop());
    permissionStreams.user = null;
    permissionStatus.textContent = 'Allow the permissions marked above to start listening.';
    permissionGate.hidden = false;
    return;
  }
  transcriptStatus.textContent = 'Starting session…';
  await ensureUsageSession();
  const requested = [];
  if (transcriptionSources.system && window.overlay.platform !== 'darwin') {
    requested.push(['computer', Promise.resolve(permissionStreams.computer.clone())]);
    permissionStreams.computer.getTracks().forEach((track) => track.stop());
    permissionStreams.computer = null;
  }
  if (transcriptionSources.microphone) {
    requested.push(['user', Promise.resolve(permissionStreams.user.clone())]);
    permissionStreams.user.getTracks().forEach((track) => track.stop());
    permissionStreams.user = null;
  }
  const results = await Promise.allSettled(requested.map(([, capture]) => capture));
  const audioSettings = await window.overlay.getCloudSettings().catch(() => null);
  audioWindowSeconds = audioSettings?.transcription === 'groq' ? 2 : 1.5;
  transcriptionRunning = true;
  updateAudioSourceButtons();
  const errors = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const speaker = requested[index][0];
    if (result.status === 'fulfilled') {
      try { transcriptionCaptures.push(beginAudioCapture(result.value, speaker)); }
      catch (error) { errors.push(error.message); }
    } else {
      const denied = result.reason?.name === 'NotAllowedError' || /permission denied/i.test(result.reason?.message || '');
      const message = speaker === 'computer' && denied
        ? `Computer audio was rejected by macOS (${result.reason?.name || 'NotAllowedError'}). Restart My App, then select a screen and enable audio in Apple's sharing picker.`
        : `${speaker === 'user' ? 'Microphone' : 'Computer audio'}: ${result.reason?.message || 'permission denied'}`;
      errors.push(message);
    }
  }
  if (!transcriptionCaptures.length && !(transcriptionSources.system && window.overlay.platform === 'darwin')) {
    transcriptionRunning = false;
    updateAudioSourceButtons();
    transcriptStatus.textContent = errors.join(' · ');
    return;
  }
  try {
    const usage = await window.overlay.startTranscription(transcriptionSources);
    updateUsageState(usage);
  } catch (error) {
    // Audio capture was already opened above. Tear it down if the server
    // cannot start the timed session (for example, no time remains).
    await stopLiveTranscription();
    throw error;
  }
  toggleTranscription.textContent = 'Stop listening';
  transcriptStatus.textContent = errors.length ? `Partial capture · ${errors.join(' · ')}` : 'Listening for a question…';
  if (sessionContext.hasSession()) await setFloatingView(true);
}

async function stopLiveTranscription() {
  transcriptionRunning = false;
  updateAudioSourceButtons();
  const stops = transcriptionCaptures;
  transcriptionCaptures = [];
  await Promise.allSettled(stops.map((stop) => stop()));
  window.overlay.stopTranscription();
  toggleTranscription.textContent = 'Start listening';
  transcriptStatus.textContent = 'Stopped';
}

toggleTranscription.addEventListener('click', async () => {
  toggleTranscription.disabled = true;
  try {
    if (transcriptionRunning) await stopLiveTranscription();
    else await startLiveTranscription();
  } catch (error) { transcriptStatus.textContent = error.message; }
  finally { toggleTranscription.disabled = false; }
});

function resetTranscriptHistory() {
  cancelGeneration?.();
  cancelGeneration = null;
  activeTypedAnswerId = null;
  send.textContent = 'Send';
  interviewPipelineRevision += 1;
  cancelInterviewAnswer?.();
  cancelInterviewAnswer = null;
  clearTimeout(answerStartTimer);
  answerStartTimer = null;
  activeInterviewAnswerTurnId = null;
  lastInterviewQuestion = null;
  latestComputerTurnEndedAt = 0;
  pendingComputerContinuation = null;
  // Follow-up question suggestions are paused for now.
  window.overlay.clearTranscription();
  transcriptFeed.replaceChildren();
  lastCaption = null;
  transcriptContext = [];
  selectedAnswerId = null;
  latestComputerSpeechAt = 0;
  automaticAnswerActive = false;
  floatingQuestionText.textContent = 'Waiting for a question…';
  localStorage.removeItem(TRANSCRIPT_CONTEXT_KEY);
  renderSummary();
  renderPromptSuggestions();
  const empty = document.createElement('div');
  empty.className = 'transcript-empty';
  empty.textContent = transcriptionRunning ? 'Listening…' : 'Start listening for live local captions.';
  transcriptFeed.append(empty);
}

const floatingAnswerNow = document.getElementById('floating-answer-now');
floatingAnswerNow.addEventListener('click', async () => {
  const live = lastCaption?.speaker === 'computer' && lastCaption.text ? lastCaption : null;
  const target = selectLatestInterviewerQuestion(transcriptContext, live?.text.textContent || '', live?.capturedAt || 0);
  if (!target) { transcriptStatus.textContent = 'Waiting for a spoken question…'; return; }
  const bubble = live?.bubble || { dataset: {} };
  await answerTranscriptTurnManually(bubble, live?.text || { textContent: target.text }, floatingAnswerNow);
  floatingAnswerNow.textContent = 'Answer now';
});

clearTranscript.addEventListener('click', resetTranscriptHistory);

// Keep the visual computer caption open through the same natural pauses used
// by the interview-turn collector. This prevents one spoken prompt becoming
// a stack of separate chat heads while it is still being transcribed.
const CAPTION_PAUSE_MS = 7000;
let lastCaption = null;

function mergeCaptionText(previous, incoming) {
  const left = String(previous || '').trim();
  const right = String(incoming || '').trim();
  if (!left) return right;
  if (!right || left.toLowerCase().endsWith(right.toLowerCase())) return left;
  const leftWords = left.split(/\s+/);
  const rightWords = right.split(/\s+/);
  const normalize = (word) => word.toLowerCase().replace(/[^a-z0-9']/g, '');
  const maximum = Math.min(12, leftWords.length, rightWords.length);
  let overlap = 0;
  for (let count = maximum; count > 0; count -= 1) {
    const tail = leftWords.slice(-count).map(normalize).join(' ');
    const head = rightWords.slice(0, count).map(normalize).join(' ');
    if (tail && tail === head) { overlap = count; break; }
  }
  return `${left} ${rightWords.slice(overlap).join(' ')}`.trim();
}

function isRepeatedQuestion(previous, incoming) {
  const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const left = normalize(previous);
  const right = normalize(incoming);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= longer.length * 0.8 && longer.includes(shorter);
}

let latestComputerSpeechAt = 0;
let automaticAnswerActive = false;
const INTERVIEWER_QUIET_MS = 3500;

window.overlay.onTranscription((event) => {
  if (event.type === 'computer-speech-activity') {
    latestComputerSpeechAt = Date.now();
    if (automaticAnswerActive) {
      pendingComputerContinuation = { text: lastInterviewQuestion?.text || '', at: Date.now() };
      cancelUnfinishedInterviewAnswer();
      automaticAnswerActive = false;
      interviewPipelineRevision += 1;
      transcriptStatus.textContent = 'Listening · interviewer still speaking…';
    }
    return;
  }
  if (event.type === 'status' || event.type === 'ready' || event.type === 'warning' || event.type === 'error') {
    transcriptStatus.textContent = event.text;
  }
  if (event.type === 'interview-turn') {
    if (event.turn.speaker === 'computer') {
      updateLiveQuestionSnippet(event.turn.text);
      if (pendingComputerContinuation && Date.now() - pendingComputerContinuation.at < 25_000) {
        event.turn.text = mergeCaptionText(pendingComputerContinuation.text, event.turn.text);
      }
      pendingComputerContinuation = null;
      latestComputerTurnEndedAt = Number(event.turn.endedAt) || 0;
    }
    transcriptContext.push(event.turn);
    if (lastCaption?.speaker === event.turn.speaker && lastCaption.bubble?.isConnected) {
      addManualAnswerButton(lastCaption.bubble, lastCaption.text, event.turn.id);
    }
    saveTranscriptContext();
    renderSummary();
    renderPromptSuggestions();
    if (event.turn.speaker === 'computer') {
      const turn = event.turn;
      // A newly-finalized computer turn means the interviewer continued or
      // clarified their prompt. Never leave an answer for the older fragment
      // running underneath it.
      clearTimeout(answerStartTimer);
      answerStartTimer = null;
      cancelUnfinishedInterviewAnswer();
      showPendingQuestion(turn.text);
      const pipelineRevision = ++interviewPipelineRevision;
      transcriptStatus.textContent = 'Understanding interviewer…';
      window.overlay.detectInterviewQuestion({
        model: modelSelect.value,
        turn,
        recentTurns: recentDialogueTurns().slice(-6)
      }).then(async (detection) => {
        if (pipelineRevision !== interviewPipelineRevision) return;
        const savedTurn = transcriptContext.find((item) => item.id === turn.id);
        if (!savedTurn) return;
        savedTurn.detection = detection;
        saveTranscriptContext();
        if (detection.isQuestion) {
          const label = detection.type.replace('_', ' ');
          const now = Date.now();
          // Only collapse near-identical Whisper repeats. A distinct follow-up
          // must get its own answer even when microphone speech is unavailable.
          const duplicate = lastInterviewQuestion && now - lastInterviewQuestion.at < 8_000 &&
            isRepeatedQuestion(lastInterviewQuestion.text, turn.text);
          const answerTurnId = duplicate ? lastInterviewQuestion.turnId : turn.id;
          const answerQuestion = duplicate ? mergeCaptionText(lastInterviewQuestion.text, turn.text) : turn.text;
          const priorAnswer = transcriptContext.find(item => item.id === answerTurnId)?.answer;
          if (duplicate && priorAnswer && isRepeatedQuestion(priorAnswer.question, answerQuestion)) {
            const answeredCard = answerHistoryCards().find(card => card.dataset.turnId === answerTurnId);
            if (answeredCard) selectAnswerCard(answeredCard);
            transcriptStatus.textContent = 'Answer ready';
            return;
          }
          updateLiveQuestionSnippet(answerQuestion);
          lastInterviewQuestion = { turnId: answerTurnId, text: answerQuestion, at: now };
          activeInterviewAnswerTurnId = answerTurnId;
          const suggestionTurn = transcriptContext.find((item) => item.id === answerTurnId) || turn;
          suggestionTurn.text = answerQuestion;
          // Follow-up question suggestions are paused for now.
          transcriptStatus.textContent = `Question detected · finding ${label} context…`;
          const retrievedContext = await window.overlay.retrieveInterviewContext({
            question: answerQuestion,
            context: effectiveContext(),
            recentTurns: recentDialogueTurns()
          });
          if (pipelineRevision !== interviewPipelineRevision) return;
          const currentTurn = transcriptContext.find((item) => item.id === answerTurnId);
          if (!currentTurn) return;
          currentTurn.text = answerQuestion;
          currentTurn.retrievedContext = retrievedContext;
          saveTranscriptContext();
          // A short final settle period catches late ASR windows that arrive
          // just after a spoken pause, before the local model starts writing.
          answerStartTimer = setTimeout(() => {
            if (pipelineRevision !== interviewPipelineRevision) return;
            function beginWhenQuiet() {
              if (pipelineRevision !== interviewPipelineRevision) return;
              const remainingQuiet = INTERVIEWER_QUIET_MS - (Date.now() - latestComputerSpeechAt);
              if (remainingQuiet > 0) {
                transcriptStatus.textContent = 'Listening · waiting for the question to finish…';
                answerStartTimer = setTimeout(beginWhenQuiet, remainingQuiet);
                return;
              }
              answerStartTimer = null;
              generateInterviewAnswer({
              model: modelSelect.value,
              question: answerQuestion,
              type: detection.type,
              retrievedContext
            }, label, answerTurnId);
              automaticAnswerActive = true;
            }
            beginWhenQuiet();
          }, 200);
        } else {
          transcriptStatus.textContent = 'Listening · no question detected';
        }
      }).catch(() => { transcriptStatus.textContent = 'Listening · question detection unavailable'; });
    } else {
      // Candidate speech closes the current compound interviewer question.
      lastInterviewQuestion = null;
      pendingComputerContinuation = null;
    }
    return;
  }
  if (event.type !== 'transcript') return;
  const capturedAt = Number(event.capturedAt) || Date.now();
  if (event.speaker === 'computer' && latestComputerTurnEndedAt && capturedAt > latestComputerTurnEndedAt + 250) {
    // A late transcript chunk means the interviewer resumed after the quiet
    // boundary. Stop the older answer immediately and carry its question into
    // the next finalized turn instead of replying mid-sentence.
    const answerPending = answerStartTimer !== null || cancelInterviewAnswer !== null ||
      /^Understanding interviewer|^Question detected/.test(transcriptStatus.textContent);
    if (answerPending) {
      pendingComputerContinuation ||= {
        text: transcriptContext.filter((turn) => turn.speaker === 'computer').at(-1)?.text || '',
        at: Date.now()
      };
      clearTimeout(answerStartTimer);
      answerStartTimer = null;
      cancelUnfinishedInterviewAnswer();
      interviewPipelineRevision += 1;
      transcriptStatus.textContent = 'Interviewer continuing…';
    }
  }
  if (event.speaker === 'computer') {
    if (!latestComputerTurnEndedAt || capturedAt > latestComputerTurnEndedAt + 250) showPendingQuestion(event.text);
    else updateLiveQuestionSnippet(event.text);
  }
  // Your microphone transcript remains in the local meeting record and
  // Summary view, but is intentionally not rendered in Live transcription.
  if (event.speaker === 'user') {
    lastCaption = { speaker: 'user', capturedAt, bubble: null, text: null };
    return;
  }
  transcriptFeed.querySelector('.transcript-empty')?.remove();
  const startsNewQuestion = event.speaker === 'computer' && latestComputerTurnEndedAt &&
    capturedAt > latestComputerTurnEndedAt + 250 && window.interviewQuestionContext.looksLikeInterviewerQuestion(event.text);
  if (!startsNewQuestion && lastCaption && lastCaption.speaker === event.speaker &&
      capturedAt - lastCaption.capturedAt <= CAPTION_PAUSE_MS &&
      lastCaption.bubble.isConnected) {
    lastCaption.text.textContent = mergeCaptionText(lastCaption.text.textContent, event.text);
    updateLiveQuestionSnippet(lastCaption.text.textContent);
    lastCaption.capturedAt = capturedAt;
    scrollCaptionToLatest(lastCaption.bubble);

    return;
  }
  const bubble = document.createElement('div');
  bubble.className = `caption ${event.speaker === 'user' ? 'user' : 'computer'}`;
  const label = document.createElement('span');
  label.className = 'caption-label';
  label.textContent = event.speaker === 'user' ? 'You' : 'Computer';
  const text = document.createElement('span');
  text.className = 'caption-text';
  text.textContent = event.text;
  const viewport = document.createElement('span');
  viewport.className = 'caption-text-viewport';
  viewport.append(text);
  bubble.append(label, viewport);
  const row = document.createElement('div');
  row.className = 'caption-turn';
  row.append(bubble);
  transcriptFeed.append(row);
  addManualAnswerButton(bubble, text);
  lastCaption = { speaker: event.speaker, capturedAt, bubble, text };
  scrollCaptionToLatest(bubble);

});
window.overlay.onUsageUpdate((update) => {
  // An inactive server heartbeat means the metered session has ended.
  if (!update.active) clearSessionContext();
  updateUsageState(update);
  if (!update.active && transcriptionRunning) stopLiveTranscription();
});
notepad.addEventListener('input', () => {
  clearTimeout(noteSaveTimer);
  notesStatus.textContent = 'Saving…';
  noteSaveTimer = setTimeout(async () => {
    try { await window.overlay.saveNotes(notepad.value); notesStatus.textContent = 'Saved locally'; }
    catch { notesStatus.textContent = 'Could not save'; }
  }, 400);
});

function renderContextFiles() {
  contextFilesElement.replaceChildren();
  const rows = [...contextState.files.map((file, index) => ({ file, index })), ...contextUploadErrors.map((file) => ({ file, index: -1 }))];
  for (const { file, index } of rows) {
    const row = document.createElement('div');
    row.className = `context-file${file.error ? ' error' : ''}`;
    const preview = document.createElement('div');
    preview.className = 'file-preview';
    if (file.kind === 'image') {
      const image = document.createElement('img');
      image.src = `data:${file.mime || 'image/png'};base64,${file.content}`;
      image.alt = '';
      preview.append(image);
    } else if (file.icon) {
      const image = document.createElement('img');
      image.className = 'native-icon';
      image.src = file.icon;
      image.alt = '';
      preview.append(image);
    } else {
      const badge = document.createElement('span');
      const isPdf = file.mime === 'application/pdf';
      const isDoc = file.mime?.includes('wordprocessingml');
      badge.className = `file-badge ${isPdf ? 'pdf' : isDoc ? 'doc' : 'text'}`;
      badge.textContent = isPdf ? 'PDF' : isDoc ? 'DOCX' : (file.name.split('.').pop() || 'FILE').slice(0, 5).toUpperCase();
      preview.append(badge);
    }
    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.name;
    const meta = document.createElement('span');
    meta.className = 'file-meta';
    const bytes = Number(file.size) || Math.round((file.content?.length || 0) * (file.kind === 'image' ? .75 : 1));
    const size = bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    meta.textContent = `${file.kind === 'image' ? 'Image' : file.mime === 'application/pdf' ? 'PDF document' : file.mime?.includes('wordprocessingml') ? 'Word document' : 'Text document'} · ${size}`;
    info.append(name, meta);
    if (file.error) {
      const excerpt = document.createElement('span');
      excerpt.className = 'file-excerpt';
      excerpt.textContent = file.error;
      info.append(excerpt);
    } else if (file.kind === 'text' && file.content.trim()) {
      const excerpt = document.createElement('span');
      excerpt.className = 'file-excerpt';
      excerpt.textContent = file.content.replace(/\s+/g, ' ').trim().slice(0, 100);
      info.append(excerpt);
    }
    const remove = document.createElement('button');
    remove.className = 'remove-file';
    remove.type = 'button';
    remove.append(createAppIcon('close'));
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.title = `Remove ${file.name}`;
    remove.addEventListener('click', () => {
      if (index >= 0) { contextState.files.splice(index, 1); saveContextSoon(); }
      else contextUploadErrors = contextUploadErrors.filter((item) => item !== file);
      renderContextFiles();
    });
    row.append(preview, info, remove);
    contextFilesElement.append(row);
  }
  const count = contextState.files.length;
  clearContextFiles.disabled = count === 0 && contextUploadErrors.length === 0;
  uploadContext.textContent = count ? `Add more files (${count}/20)` : 'Add multiple files';
}

function saveContextSoon() {
  contextDirty = true;
  clearTimeout(contextSaveTimer);
  contextSaveStatus.textContent = 'Saving…';
  contextSaveTimer = setTimeout(() => {
    const snapshot = JSON.parse(JSON.stringify(contextState));
    contextSaveQueue = contextSaveQueue.catch(() => {}).then(() => window.overlay.saveContext(snapshot));
    contextSaveQueue.then(() => { contextSaveStatus.textContent = 'Saved locally'; })
      .catch(() => { contextSaveStatus.textContent = 'Could not save'; });
  }, 400);
}

contextInput.addEventListener('input', () => { contextState.text = contextInput.value; saveContextSoon(); renderPromptSuggestions(); });
uploadContext.addEventListener('click', async () => {
  if (!contextLoaded) return;
  uploadContext.disabled = true;
  contextSaveStatus.textContent = 'Reading files…';
  try {
    const picked = await window.overlay.pickContextFiles();
    const failures = picked.filter((file) => file.error);
    contextUploadErrors = [...contextUploadErrors, ...failures];
    const additions = picked.filter((file) => !file.error);
    contextState = { ...contextState, files: [...contextState.files, ...additions].slice(0, 20) };
    renderContextFiles();
    saveContextSoon();
    if (failures.length) contextSaveStatus.textContent = `${failures.length} file${failures.length === 1 ? '' : 's'} could not be added`;
  } catch { contextSaveStatus.textContent = 'Could not add files'; }
  finally { uploadContext.disabled = false; }
});
clearContextFiles.addEventListener('click', () => { contextState.files = []; contextUploadErrors = []; renderContextFiles(); saveContextSoon(); });
window.overlay.onInteraction((enabled) => document.body.classList.toggle('interactive', enabled));
window.addEventListener('beforeunload', () => {
  for (const stream of Object.values(permissionStreams)) stream?.getTracks().forEach((track) => track.stop());
});

setView('home');
renderStoredTranscript();
renderSummary();
refreshModels();

window.overlay.getAuthStatus().then((result) => {
  applyAuthState(result);
  if (result.authenticated) window.overlay.getUsageStatus().then(updateUsageState).catch(() => updateUsageState());
  if (!result.authenticated) loginStatus.textContent = 'Sign in to continue';
}).catch(() => {
  loginGate.hidden = false;
  loginStatus.classList.add('error');
  loginStatus.textContent = 'Cannot reach the authentication server.';
});
window.overlay.loadNotes().then((content) => { notepad.value = content; }).catch(() => { notesStatus.textContent = 'Could not load notes'; });
window.overlay.loadContext().then((value) => {
  if (!contextDirty) contextState = value && Array.isArray(value.files) ? value : { text: '', files: [] };
  contextInput.value = contextState.text || '';
  renderContextFiles();
  renderPromptSuggestions();
}).catch(() => { contextSaveStatus.textContent = 'Could not load context'; })
  .finally(() => { contextLoaded = true; uploadContext.disabled = false; resumeButton.disabled = false; });

// Provider secrets remain in the main process; only readiness flags come back.
const cloudFields = {
  transcription: document.getElementById('cloud-transcription'),
  groqModel: document.getElementById('groq-model'),
  language: document.getElementById('cloud-language'),
  answerLanguage: document.getElementById('answer-language'),
  segmentSeconds: document.getElementById('cloud-segment')
};
const cloudStatus = document.getElementById('cloud-status');
const groqKeyInput = document.getElementById('groq-key');
const geminiKeyInput = document.getElementById('gemini-key');
function showCloudSettings(value) {
  for (const [key, element] of Object.entries(cloudFields)) element.value = String(value[key]);
  groqKeyInput.value = ''; geminiKeyInput.value = '';
  cloudStatus.textContent = `Groq key: ${value.hasGroqKey ? 'saved' : 'missing'} · Gemini key: ${value.hasGeminiKey ? 'saved' : 'missing'}`;
}
window.overlay.getCloudSettings().then(showCloudSettings).catch(() => { cloudStatus.textContent = 'Could not load cloud settings.'; });
document.getElementById('save-cloud').addEventListener('click', async () => {
  const value = Object.fromEntries(Object.entries(cloudFields).map(([key, element]) => [key, element.value]));
  value.segmentSeconds = Number(value.segmentSeconds);
  if (groqKeyInput.value.trim()) value.groqKey = groqKeyInput.value.trim();
  if (geminiKeyInput.value.trim()) value.geminiKey = geminiKeyInput.value.trim();
  try { showCloudSettings(await window.overlay.saveCloudSettings(value)); await refreshModels(); }
  catch (error) { cloudStatus.textContent = error.message; }
});
document.getElementById('clear-cloud-keys').addEventListener('click', async () => {
  try { showCloudSettings(await window.overlay.saveCloudSettings({ groqKey: '', geminiKey: '', transcription: 'local' })); await refreshModels(); }
  catch (error) { cloudStatus.textContent = error.message; }
});

document.getElementById('refresh-updated-pricing').addEventListener('click', async () => {
  const button = document.getElementById('refresh-updated-pricing'); button.disabled = true;
  await loadPaymentPlans();
  button.disabled = false;
  if (paymentStatus.className !== 'error') {
    document.getElementById('pricing-updated-modal').close();
    paymentStatus.textContent = 'Prices refreshed. Review the total before paying.';
  }
});
