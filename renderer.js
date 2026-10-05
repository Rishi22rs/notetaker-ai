const modelSelect = document.getElementById('model');
const status = document.getElementById('status');
const messagesElement = document.getElementById('messages');
const form = document.getElementById('composer');
const prompt = document.getElementById('prompt');
const send = document.getElementById('send');
const newChat = document.getElementById('new-chat');
const sessionToggle = document.getElementById('session-toggle');
const sessionClock = document.getElementById('session-clock');
const sessionBlocker = document.getElementById('session-blocker');
const sessionBlockerMessage = document.getElementById('session-blocker-message');
const showChat = document.getElementById('show-chat');
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
const showTranscript = document.getElementById('show-transcript');
const transcriptView = document.getElementById('transcript-view');
const transcriptFeed = document.getElementById('transcript-feed');
const transcriptStatus = document.getElementById('transcript-status');
const toggleTranscription = document.getElementById('toggle-transcription');
const clearTranscript = document.getElementById('clear-transcript');
const toggleMicrophone = document.getElementById('toggle-microphone');
const toggleSystemAudio = document.getElementById('toggle-system-audio');
const permissionGate = document.getElementById('permission-gate');
const grantPermissions = document.getElementById('grant-permissions');
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
const rechargeForm = document.getElementById('recharge-form');
const rechargePlan = document.getElementById('recharge-plan');
const rechargeSubmit = document.getElementById('recharge-submit');
const paymentStatus = document.getElementById('payment-status');
const openSettings = document.getElementById('open-settings');
const openOffers = document.getElementById('open-offers');
const settingsView = document.getElementById('settings-view');
const offersView = document.getElementById('offers-view');
const settingsAppearanceTab = document.getElementById('settings-tab-appearance');
const settingsAiTab = document.getElementById('settings-tab-ai');
const settingsAppearancePanel = document.getElementById('settings-appearance');
const settingsAiPanel = document.getElementById('settings-ai');
const appOpacity = document.getElementById('app-opacity');
const appOpacityValue = document.getElementById('app-opacity-value');
const textOpacity = document.getElementById('text-opacity');
const textOpacityValue = document.getElementById('text-opacity-value');
const panel = document.querySelector('.panel');
const STORAGE_KEY = 'local-ai-conversation-v1';
const TRANSCRIPT_CONTEXT_KEY = 'local-ai-transcript-context-v1';
const APPEARANCE_KEY = 'local-ai-appearance-v1';
let messages = loadMessages();
let transcriptContext = loadTranscriptContext();
let cancelGeneration = null;
let noteSaveTimer = null;
let contextSaveTimer = null;
let contextState = { text: '', files: [] };
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
let availableUsageSeconds = 0;
let usageClockStartedAt = 0;
let usageClockTimer = null;
let transcriptionCaptures = [];
let transcriptionSources = { microphone: false, system: true };
let permissionStreams = { computer: null, user: null };
let cancelInterviewAnswer = null;
let interviewPipelineRevision = 0;
let activeInterviewAnswerTurnId = null;
let lastInterviewQuestion = null;
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
      app: Math.max(20, Math.min(100, Number(stored?.app) || 94)),
      text: Math.max(20, Math.min(100, Number(stored?.text) || 100))
    };
  } catch { return { app: 94, text: 100 }; }
}

function applyAppearance(values = loadAppearance()) {
  appOpacity.value = String(values.app);
  textOpacity.value = String(values.text);
  appOpacityValue.textContent = `${values.app}%`;
  textOpacityValue.textContent = `${values.text}%`;
  document.documentElement.style.setProperty('--app-opacity', String(values.app / 100));
  document.documentElement.style.setProperty('--text-opacity', String(values.text / 100));
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(values));
}

applyAppearance();

function loadMessages() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string') : [];
  } catch { return []; }
}

function loadTranscriptContext() {
  try {
    const value = JSON.parse(localStorage.getItem(TRANSCRIPT_CONTEXT_KEY));
    return Array.isArray(value) ? value.filter((item) => item && ['user', 'computer'].includes(item.speaker) && typeof item.text === 'string').slice(-40) : [];
  } catch { return []; }
}

function saveTranscriptContext() {
  transcriptContext = transcriptContext.slice(-40);
  localStorage.setItem(TRANSCRIPT_CONTEXT_KEY, JSON.stringify(transcriptContext));
}

function saveMessages() { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-80))); }
function setStatus(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
function scrollToBottom() { messagesElement.scrollTop = messagesElement.scrollHeight; }

function contextLabel() {
  const names = contextState.files.map((file) => file.name).filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length > 1) return `${names[0]} and ${names.length - 1} other file${names.length > 2 ? 's' : ''}`;
  const words = (contextState.text || '').match(/[A-Za-z][A-Za-z0-9_-]{3,}/g) || [];
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
  const recentTranscript = transcriptContext.map((item) => `${item.speaker === 'user' ? 'User' : 'Computer'}: ${item.text}`).join('\n').slice(-20_000);
  if (!draft || !modelSelect.value) { promptSuggestions.replaceChildren(); return; }
  suggestionTimer = setTimeout(async () => {
    try {
      const suggestions = await window.overlay.getSuggestions({ model: modelSelect.value, draft, context: contextState, transcript: recentTranscript });
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
      context: contextState,
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

function answerCardFor(turnId, question, request, label) {
  let card = [...transcriptFeed.querySelectorAll('.interview-answer')].find((item) => item.dataset.turnId === turnId);
  if (card) {
    card.querySelector('.interview-answer-question').textContent = question;
    return card;
  }
  transcriptFeed.querySelector('.transcript-empty')?.remove();
  card = document.createElement('section');
  card.className = 'interview-answer';
  card.dataset.turnId = turnId;
  const header = document.createElement('div');
  header.className = 'interview-answer-header';
  const title = document.createElement('span');
  title.textContent = 'Suggested answer';
  const questionText = document.createElement('span');
  questionText.className = 'interview-answer-question';
  questionText.textContent = question;
  const expand = document.createElement('button');
  expand.className = 'expand-interview-answer';
  expand.type = 'button';
  expand.textContent = 'Expand answer';
  expand.hidden = true;
  expand.addEventListener('click', () => generateInterviewAnswer({ ...request, model: modelSelect.value }, label, turnId, 'detailed'));
  const text = document.createElement('pre');
  text.className = 'interview-answer-text';
  header.append(title, questionText, expand);
  card.append(header, text);
  transcriptFeed.append(card);
  return card;
}

function generateInterviewAnswer(request, label, turnId, verbosity = 'concise') {
  cancelInterviewAnswer?.();
  activeInterviewAnswerTurnId = turnId;
  const card = answerCardFor(turnId, request.question, request, label);
  const text = card.querySelector('.interview-answer-text');
  const expand = card.querySelector('.expand-interview-answer');
  text.textContent = '';
  text.classList.add('pending');
  expand.hidden = true;
  // Bring the answer into view once, then leave scrolling under user control
  // while the response continues streaming.
  requestAnimationFrame(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  let rawAnswer = '';
  const cleanAnswer = () => rawAnswer
    .replace(/<\/?[a-z_][^>]*>/gi, '')
    .replace(/<[a-z_][^>]*$/i, '')
    .replace(/^\s*(question type|answer length|candidate profile|relevant references|recent dialogue|current interviewer question)\s*:\s*.*$/gim, '')
    .trimStart();
  transcriptStatus.textContent = verbosity === 'detailed' ? `Expanding answer · ${label}` : `Answering · ${label}`;
  cancelInterviewAnswer = window.overlay.generateInterviewAnswer({ ...request, verbosity }, {
    onChunk(chunk) {
      if (activeInterviewAnswerTurnId !== turnId) return;
      rawAnswer += chunk;
      text.textContent = cleanAnswer();
    },
    onDone() {
      if (activeInterviewAnswerTurnId !== turnId) return;
      cancelInterviewAnswer = null;
      text.classList.remove('pending');
      expand.hidden = verbosity === 'detailed';
      const turn = transcriptContext.find((item) => item.id === turnId);
      if (turn) {
        turn.answer = { text: text.textContent, verbosity, label };
        saveTranscriptContext();
      }
      transcriptStatus.textContent = `${verbosity === 'detailed' ? 'Expanded answer' : 'Answer'} ready · ${label}`;
    },
    onError(error) {
      if (activeInterviewAnswerTurnId !== turnId) return;
      cancelInterviewAnswer = null;
      text.classList.remove('pending');
      text.textContent = `Could not generate an answer: ${error}`;
      transcriptStatus.textContent = 'Answer generation failed';
    }
  });
}

async function answerTranscriptTurnManually(bubble, textElement, button) {
  const question = textElement.textContent.trim();
  if (!question || button.disabled) return;
  const selectedModel = modelSelect.selectedOptions[0];
  if (!modelSelect.value || selectedModel?.dataset.installed !== 'true') {
    transcriptStatus.textContent = 'Download and select a local model before requesting an answer.';
    return;
  }
  button.disabled = true;
  button.textContent = '…';
  button.title = 'Preparing answer…';
  const pipelineRevision = ++interviewPipelineRevision;
  let turn = transcriptContext.find((item) => item.id === bubble.dataset.turnId);
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
        turn: { ...turn, text: question },
        recentTurns: transcriptContext.slice(-6)
      }).catch(() => ({ type: 'general' }));
      turn.detection = detection;
    }
    const type = detection?.type || 'general';
    const retrievedContext = await window.overlay.retrieveInterviewContext({
      question,
      context: contextState,
      recentTurns: transcriptContext.slice(-8)
    });
    if (pipelineRevision !== interviewPipelineRevision) return;
    turn.text = question;
    turn.retrievedContext = retrievedContext;
    saveTranscriptContext();
    generateInterviewAnswer({ model: modelSelect.value, question, type, retrievedContext }, type.replace('_', ' '), turn.id);
    button.textContent = 'Answer anyway';
    button.title = 'Generate this answer again';
  } catch (error) {
    transcriptStatus.textContent = `Could not prepare answer: ${error.message}`;
    button.textContent = 'Answer anyway';
    button.title = 'Answer this message anyway';
  } finally {
    button.disabled = false;
  }
}

function addManualAnswerButton(bubble, textElement, turnId = '') {
  if (!bubble.classList.contains('computer')) return;
  if (turnId) bubble.dataset.turnId = turnId;
  let button = bubble.querySelector('.caption-answer-button');
  if (button) return button;
  button = document.createElement('button');
  button.className = 'caption-answer-button';
  button.type = 'button';
  button.textContent = 'Answer anyway';
  button.title = 'Answer this message anyway';
  button.setAttribute('aria-label', 'Answer this interviewer message anyway');
  button.addEventListener('click', () => answerTranscriptTurnManually(bubble, textElement, button));
  bubble.append(button);
  return button;
}

function appendStoredTurn(turn) {
  const bubble = document.createElement('div');
  bubble.className = `caption ${turn.speaker === 'user' ? 'user' : 'computer'}`;
  const label = document.createElement('span');
  label.className = 'caption-label';
  label.textContent = turn.speaker === 'user' ? 'You' : 'Computer';
  const text = document.createElement('span');
  text.textContent = turn.text;
  bubble.append(label, text);
  addManualAnswerButton(bubble, text, turn.id);
  transcriptFeed.append(bubble);
  if (turn.answer?.text) {
    const request = { model: modelSelect.value, question: turn.text, type: turn.detection?.type || 'general', retrievedContext: turn.retrievedContext || {} };
    const card = answerCardFor(turn.id, turn.text, request, turn.answer.label || 'general');
    card.querySelector('.interview-answer-text').textContent = turn.answer.text;
    card.querySelector('.expand-interview-answer').hidden = turn.answer.verbosity === 'detailed';
  }
  if (Array.isArray(turn.suggestedQuestions) && turn.suggestedQuestions.length) {
    questionSuggestionGroup(turn, turn.suggestedQuestions, false);
  }
}

function renderStoredTranscript() {
  if (!transcriptContext.length) return;
  transcriptFeed.replaceChildren();
  for (const turn of transcriptContext) appendStoredTurn(turn);
}

function render() {
  messagesElement.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const title = document.createElement('strong');
    title.textContent = 'Private, local chat';
    const subtitle = document.createElement('span');
    subtitle.textContent = 'Messages stay on this computer.';
    empty.append(title, subtitle);
    messagesElement.append(empty);
  } else {
    for (const message of messages) {
      const element = document.createElement('div');
      element.className = `message ${message.role}${message.pending ? ' pending' : ''}`;
      element.textContent = message.content;
      messagesElement.append(element);
    }
  }
  scrollToBottom();
}

async function refreshModels() {
  try {
    const models = await window.overlay.listModels();
    installedModels = new Map(models.map((item) => [item.name, item]));
    modelSelect.replaceChildren();
    const installedGroup = document.createElement('optgroup');
    installedGroup.label = 'Installed';
    for (const item of models) {
      const option = document.createElement('option');
      option.value = item.name;
      option.textContent = `${item.displayName || item.name} · ${formatBytes(item.size)}`;
      option.dataset.installed = 'true';
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
    const previous = localStorage.getItem('local-ai-model');
    if (previous && models.some((item) => item.name === previous)) modelSelect.value = previous;
    if (!models.length) setStatus('Download the local model to get started');
    else setStatus('Local AI ready · offline');
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
  const info = recommendedModels.find((item) => item.name === modelSelect.value);
  modelDownload.hidden = !settingsOpen;
  downloadTitle.textContent = info?.label || modelSelect.value;
  downloadDetail.textContent = `${info?.description ? `${info.description} · ` : ''}${formatBytes(info?.size)}${info?.vision ? ' · Supports images' : ' · Text only'}`;
  downloadProgress.style.width = '0%';
  downloadModel.disabled = Boolean(downloadingModel);
  downloadModel.textContent = downloadingModel ? 'Downloading…' : 'Download';
}

function finishGeneration(error) {
  const last = messages.at(-1);
  if (last?.role === 'assistant') delete last.pending;
  cancelGeneration = null;
  send.textContent = 'Send';
  saveMessages();
  render();
  setStatus(error || 'Local AI ready · offline', Boolean(error));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (cancelGeneration) { cancelGeneration(); finishGeneration('Generation stopped'); return; }
  const content = prompt.value.trim();
  const model = modelSelect.value;
  if (!content || !model || send.disabled) return;
  messages.push({ role: 'user', content }, { role: 'assistant', content: '', pending: true });
  prompt.value = '';
  prompt.style.height = '42px';
  promptSuggestions.replaceChildren();
  send.textContent = 'Stop';
  setStatus(`Thinking with ${model}…`);
  render();
  const requestMessages = messages.slice(0, -1).map(({ role, content: text }) => ({ role, content: text }));
  cancelGeneration = window.overlay.chat({ model, messages: requestMessages, context: contextState }, {
    onChunk(chunk) {
      messages.at(-1).content += chunk;
      const lastElement = messagesElement.lastElementChild;
      if (lastElement) lastElement.textContent = messages.at(-1).content;
      scrollToBottom();
    },
    onDone() { finishGeneration(); },
    onError(error) { finishGeneration(error); }
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
newChat.addEventListener('click', async () => {
  cancelGeneration?.();
  cancelGeneration = null;
  messages = [];
  saveMessages();
  send.textContent = 'Send';
  render();
  resetTranscriptHistory();
  contextState = { text: '', files: [] };
  contextUploadErrors = [];
  contextInput.value = '';
  renderContextFiles();
  contextSaveStatus.textContent = 'Clearing…';
  try {
    await window.overlay.saveContext(contextState);
    contextSaveStatus.textContent = 'Saved locally';
  } catch {
    contextSaveStatus.textContent = 'Could not clear context';
  }
  prompt.value = '';
  promptSuggestions.replaceChildren();
  setView('transcript');
  transcriptStatus.textContent = transcriptionRunning ? 'Listening · new session' : 'New session ready';
});

function setView(view) {
  const notesOpen = view === 'notes';
  const contextOpen = view === 'context';
  const transcriptOpen = view === 'transcript';
  const settingsOpen = view === 'settings';
  const offersOpen = view === 'offers';
  messagesElement.hidden = notesOpen || contextOpen || transcriptOpen || settingsOpen || offersOpen || !sessionActive;
  notesView.hidden = !notesOpen;
  contextView.hidden = !contextOpen;
  transcriptView.hidden = !transcriptOpen;
  settingsView.hidden = !settingsOpen;
  offersView.hidden = !offersOpen;
  form.hidden = notesOpen || contextOpen || transcriptOpen || settingsOpen || offersOpen || !sessionActive;
  promptSuggestions.hidden = notesOpen || contextOpen || transcriptOpen || settingsOpen || offersOpen;
  modelSelect.hidden = !settingsOpen;
  newChat.hidden = settingsOpen || offersOpen;
  sessionToggle.hidden = settingsOpen || offersOpen;
  sessionClock.hidden = settingsOpen || offersOpen;
  const blockedScreen = !sessionActive && (transcriptOpen || (!notesOpen && !contextOpen && !settingsOpen && !offersOpen));
  sessionBlocker.hidden = !blockedScreen;
  sessionBlockerMessage.textContent = transcriptOpen
    ? 'Start your session to use live transcription.'
    : 'Start your session to use Local AI.';
  updateModelSelection();
  showChat.classList.toggle('active', !notesOpen && !contextOpen && !transcriptOpen);
  showNotes.classList.toggle('active', notesOpen);
  showContext.classList.toggle('active', contextOpen);
  showTranscript.classList.toggle('active', transcriptOpen);
  showAccount.classList.toggle('active', settingsOpen || offersOpen);
  panel.classList.toggle('settings-mode', settingsOpen || offersOpen);
  panel.classList.toggle('offers-mode', offersOpen);
  interviewQuestions.hidden = settingsOpen || offersOpen;
  viewTitle.textContent = settingsOpen ? 'Settings' : offersOpen ? 'Recharge & Offers' : notesOpen ? 'Notepad' : contextOpen ? 'Context' : transcriptOpen ? 'Live transcription' : 'Local AI';
  status.textContent = settingsOpen ? 'Appearance is saved locally' : offersOpen ? 'Manage your local account usage' : notesOpen || contextOpen ? 'Stored only on this computer' : transcriptOpen ? 'On-device speech recognition' : 'Local AI ready · offline';
  if (notesOpen) notepad.focus();
  if (contextOpen) contextInput.focus();
  else if (!notesOpen) renderPromptSuggestions();
}

function setSettingsTab(tab) {
  const aiOpen = tab === 'ai';
  settingsAppearanceTab.setAttribute('aria-selected', String(!aiOpen));
  settingsAiTab.setAttribute('aria-selected', String(aiOpen));
  settingsAppearancePanel.hidden = aiOpen;
  settingsAiPanel.hidden = !aiOpen;
  updateModelSelection();
}

function updateUsageState(value = {}) {
  sessionActive = Boolean(value.active);
  if (Number.isFinite(Number(value.balanceSeconds))) availableUsageSeconds = Math.max(0, Math.floor(Number(value.balanceSeconds)));
  usageClockStartedAt = sessionActive ? Date.now() : 0;
  clearInterval(usageClockTimer);
  usageClockTimer = null;
  const renderUsageClock = () => {
    const elapsed = sessionActive ? Math.floor((Date.now() - usageClockStartedAt) / 1000) : 0;
    sessionClock.textContent = formatUsage(Math.max(0, availableUsageSeconds - elapsed));
  };
  renderUsageClock();
  if (sessionActive) usageClockTimer = setInterval(renderUsageClock, 1000);
  sessionToggle.textContent = sessionActive ? 'Pause' : 'Start';
  sessionToggle.classList.toggle('running', sessionActive);
  sessionToggle.classList.toggle('paused', !sessionActive);
  sessionToggle.title = sessionActive ? 'Pause your timed session' : 'Start your timed session';
  walletBalance.textContent = formatUsage(availableUsageSeconds);
  updateModelSelection();
  const view = !offersView.hidden ? 'offers' : !settingsView.hidden ? 'settings' : !notesView.hidden ? 'notes' : !contextView.hidden ? 'context' : !transcriptView.hidden ? 'transcript' : 'chat';
  setView(view);
}

async function openRechargeOffers() {
  setView('offers');
  paymentStatus.className = '';
  paymentStatus.textContent = 'Recharge to continue your session.';
  await Promise.allSettled([loadPaymentPlans(), refreshWallet()]);
}

sessionToggle.addEventListener('click', async () => {
  sessionToggle.disabled = true;
  try {
    if (sessionActive) {
      if (transcriptionRunning) await stopLiveTranscription();
      const wallet = await window.overlay.stopUsage();
      updateUsageState({ active: false, ...wallet });
    } else {
      const session = await window.overlay.startUsage();
      updateUsageState({ active: true, ...session });
    }
  } catch (error) {
    updateUsageState({ active: false });
    setStatus(error.message || 'Recharge to continue.', true);
    await openRechargeOffers();
  } finally { sessionToggle.disabled = false; }
});

document.querySelectorAll('.open-recharge').forEach((button) => button.addEventListener('click', openRechargeOffers));

showChat.addEventListener('click', () => setView('chat'));
showNotes.addEventListener('click', () => setView('notes'));
showContext.addEventListener('click', () => setView('context'));
showTranscript.addEventListener('click', () => setView('transcript'));
showAccount.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = accountMenu.hidden;
  accountMenu.hidden = !open;
  showAccount.setAttribute('aria-expanded', String(open));
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
    return wallet;
  } catch { walletBalance.textContent = 'Unavailable'; }
}

async function loadPaymentPlans() {
  try {
    const result = await window.overlay.getPaymentPlans();
    rechargePlan.replaceChildren(...result.plans.map((plan) => {
      const option = document.createElement('option');
      option.value = plan.id;
      option.textContent = `${formatUsage(plan.durationSeconds)} · ₹${(plan.amountPaise / 100).toFixed(0)}`;
      return option;
    }));
    rechargeSubmit.disabled = !result.configured;
    if (!result.configured) paymentStatus.textContent = 'Payment setup pending';
  } catch (error) {
    rechargeSubmit.disabled = true;
    paymentStatus.className = 'error';
    paymentStatus.textContent = error?.message === 'fetch failed'
      ? 'Payment server is unavailable. Start it, then reopen this screen.'
      : `Could not load plans: ${error?.message || 'Unknown error'}`;
  }
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

rechargeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  rechargeSubmit.disabled = true;
  paymentStatus.className = '';
  paymentStatus.textContent = 'Opening secure checkout…';
  try {
    const payment = await window.overlay.startRecharge(rechargePlan.value);
    paymentStatus.textContent = 'Complete payment in your browser…';
    await watchPayment(payment.paymentId);
    await refreshWallet();
    paymentStatus.className = 'success';
    paymentStatus.textContent = `${formatUsage(payment.durationSeconds)} added.`;
  } catch (error) {
    paymentStatus.className = 'error';
    paymentStatus.textContent = error.message || 'Could not complete payment.';
  } finally { rechargeSubmit.disabled = false; }
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
    refreshWallet();
  }
  return authenticated;
}

async function clearLocalUserWorkspace() {
  cancelGeneration?.();
  cancelGeneration = null;
  cancelInterviewAnswer?.();
  cancelInterviewAnswer = null;
  clearTimeout(noteSaveTimer);
  clearTimeout(contextSaveTimer);
  clearTimeout(suggestionTimer);
  suggestionRevision += 1;
  if (transcriptionRunning) await stopLiveTranscription();

  messages = [];
  localStorage.removeItem(STORAGE_KEY);
  resetTranscriptHistory();
  contextState = { text: '', files: [] };
  contextUploadErrors = [];
  contextInput.value = '';
  notepad.value = '';
  prompt.value = '';
  promptSuggestions.replaceChildren();
  send.textContent = 'Send';
  render();
  renderContextFiles();

  // Let an in-flight context save finish before replacing it with the empty state.
  await contextSaveQueue.catch(() => {});
  await Promise.allSettled([
    window.overlay.saveNotes(''),
    window.overlay.saveContext(contextState)
  ]);
  notesStatus.textContent = 'Saved locally';
  contextSaveStatus.textContent = 'Saved locally';
  setView('transcript');
  transcriptStatus.textContent = 'New session ready';
}

googleLogin.addEventListener('click', async () => {
  googleLogin.disabled = true;
  loginStatus.classList.remove('error');
  loginStatus.textContent = 'Complete sign-in in your browser…';
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
settingsAiTab.addEventListener('click', () => setSettingsTab('ai'));
document.addEventListener('click', () => {
  accountMenu.hidden = true;
  showAccount.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    accountMenu.hidden = true;
    showAccount.setAttribute('aria-expanded', 'false');
  }
});
appOpacity.addEventListener('input', () => applyAppearance({ app: Number(appOpacity.value), text: Number(textOpacity.value) }));
textOpacity.addEventListener('input', () => applyAppearance({ app: Number(appOpacity.value), text: Number(textOpacity.value) }));

function updateAudioSourceButtons() {
  toggleMicrophone.setAttribute('aria-pressed', String(transcriptionSources.microphone));
  toggleSystemAudio.setAttribute('aria-pressed', String(transcriptionSources.system));
  toggleMicrophone.disabled = transcriptionRunning;
  toggleSystemAudio.disabled = transcriptionRunning;
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
    // Three-second windows with overlap preserve words that straddle
    // chunk boundaries; the backend's VAD removes non-speech inside them.
    if (sampleCount < context.sampleRate * 3) return;
    const merged = new Float32Array(sampleCount);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    chunks.length = 0;
    const overlap = merged.slice(Math.max(0, merged.length - Math.round(context.sampleRate * 0.75)));
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

grantPermissions.addEventListener('click', async () => {
  grantPermissions.disabled = true;
  permissionStatus.classList.remove('error');
  try {
    permissionStatus.textContent = 'Allow system audio access…';
    if (window.overlay.platform === 'darwin') {
      await window.overlay.requestSystemAudio();
    } else {
    permissionStreams.computer = await navigator.mediaDevices.getDisplayMedia({
      video: true, audio: true, systemAudio: 'include'
    });
    if (!streamIsLive(permissionStreams.computer)) {
      permissionStreams.computer.getTracks().forEach((track) => track.stop());
      permissionStreams.computer = null;
      throw new Error('System audio was not selected in the native picker.');
    }
    }
    permissionStatus.textContent = 'Allow microphone access…';
    permissionStreams.user = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false
    });
    permissionStatus.textContent = 'Permissions allowed';
    permissionGate.hidden = true;
    window.overlay.completePermissionGate();
  } catch (error) {
    permissionStatus.classList.add('error');
    permissionStatus.textContent = error?.name === 'NotAllowedError'
      ? 'Permission was denied. Enable My App in Privacy & Security, then try again.'
      : (error?.message || 'Could not request audio permissions.');
  } finally {
    grantPermissions.disabled = false;
  }
});

async function startLiveTranscription() {
  if (!transcriptionSources.microphone && !transcriptionSources.system) {
    transcriptStatus.textContent = 'Turn on Microphone or System audio.';
    return;
  }
  transcriptStatus.textContent = 'Requesting audio access…';
  const requested = [];
  if (transcriptionSources.system && window.overlay.platform !== 'darwin') {
    if (!streamIsLive(permissionStreams.computer)) {
      permissionGate.hidden = false;
      permissionStatus.textContent = 'System audio permission needs to be renewed.';
      return;
    }
    requested.push(['computer', Promise.resolve(permissionStreams.computer.clone())]);
  }
  if (transcriptionSources.microphone) {
    if (!streamIsLive(permissionStreams.user)) {
      permissionGate.hidden = false;
      permissionStatus.textContent = 'Microphone permission needs to be renewed.';
      return;
    }
    requested.push(['user', Promise.resolve(permissionStreams.user.clone())]);
  }
  const results = await Promise.allSettled(requested.map(([, capture]) => capture));
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
  window.overlay.startTranscription(transcriptionSources);
  toggleTranscription.textContent = 'Stop listening';
  transcriptStatus.textContent = errors.length ? `Partial capture · ${errors.join(' · ')}` : 'Loading local model…';
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
  interviewPipelineRevision += 1;
  cancelInterviewAnswer?.();
  cancelInterviewAnswer = null;
  activeInterviewAnswerTurnId = null;
  lastInterviewQuestion = null;
  interviewQuestionsList.replaceChildren();
  const questionsEmpty = document.createElement('div');
  questionsEmpty.className = 'interview-questions-empty';
  questionsEmpty.textContent = 'Suggestions appear after an interviewer question is detected.';
  interviewQuestionsList.append(questionsEmpty);
  window.overlay.clearTranscription();
  transcriptFeed.replaceChildren();
  lastCaption = null;
  transcriptContext = [];
  localStorage.removeItem(TRANSCRIPT_CONTEXT_KEY);
  renderPromptSuggestions();
  const empty = document.createElement('div');
  empty.className = 'transcript-empty';
  empty.textContent = transcriptionRunning ? 'Listening…' : 'Start listening for live local captions.';
  transcriptFeed.append(empty);
}

clearTranscript.addEventListener('click', resetTranscriptHistory);

const CAPTION_PAUSE_MS = 4000;
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

window.overlay.onTranscription((event) => {
  if (event.type === 'status' || event.type === 'ready' || event.type === 'warning' || event.type === 'error') {
    transcriptStatus.textContent = event.text;
  }
  if (event.type === 'interview-turn') {
    transcriptContext.push(event.turn);
    if (lastCaption?.speaker === event.turn.speaker && lastCaption.bubble.isConnected) {
      addManualAnswerButton(lastCaption.bubble, lastCaption.text, event.turn.id);
    }
    saveTranscriptContext();
    renderPromptSuggestions();
    if (event.turn.speaker === 'computer') {
      const turn = event.turn;
      const pipelineRevision = ++interviewPipelineRevision;
      transcriptStatus.textContent = 'Understanding interviewer…';
      window.overlay.detectInterviewQuestion({
        model: modelSelect.value,
        turn,
        recentTurns: transcriptContext.slice(-6)
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
          lastInterviewQuestion = { turnId: answerTurnId, text: answerQuestion, at: now };
          cancelInterviewAnswer?.();
          cancelInterviewAnswer = null;
          activeInterviewAnswerTurnId = answerTurnId;
          const suggestionTurn = transcriptContext.find((item) => item.id === answerTurnId) || turn;
          suggestionTurn.text = answerQuestion;
          renderInterviewQuestionSuggestions(suggestionTurn, pipelineRevision);
          transcriptStatus.textContent = `Question detected · finding ${label} context…`;
          const retrievedContext = await window.overlay.retrieveInterviewContext({
            question: answerQuestion,
            context: contextState,
            recentTurns: transcriptContext.slice(-8)
          });
          if (pipelineRevision !== interviewPipelineRevision) return;
          const currentTurn = transcriptContext.find((item) => item.id === answerTurnId);
          if (!currentTurn) return;
          currentTurn.text = answerQuestion;
          currentTurn.retrievedContext = retrievedContext;
          saveTranscriptContext();
          generateInterviewAnswer({
            model: modelSelect.value,
            question: answerQuestion,
            type: detection.type,
            retrievedContext
          }, label, answerTurnId);
        } else {
          transcriptStatus.textContent = 'Listening · no question detected';
        }
      }).catch(() => { transcriptStatus.textContent = 'Listening · question detection unavailable'; });
    } else {
      // Candidate speech closes the current compound interviewer question.
      lastInterviewQuestion = null;
    }
    return;
  }
  if (event.type !== 'transcript') return;
  const capturedAt = Number(event.capturedAt) || Date.now();
  transcriptFeed.querySelector('.transcript-empty')?.remove();
  if (lastCaption && lastCaption.speaker === event.speaker &&
      capturedAt - lastCaption.capturedAt <= CAPTION_PAUSE_MS &&
      lastCaption.bubble.isConnected) {
    lastCaption.text.textContent = mergeCaptionText(lastCaption.text.textContent, event.text);
    lastCaption.capturedAt = capturedAt;
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
    return;
  }
  const bubble = document.createElement('div');
  bubble.className = `caption ${event.speaker === 'user' ? 'user' : 'computer'}`;
  const label = document.createElement('span');
  label.className = 'caption-label';
  label.textContent = event.speaker === 'user' ? 'You' : 'Computer';
  const text = document.createElement('span');
  text.textContent = event.text;
  bubble.append(label, text);
  addManualAnswerButton(bubble, text);
  transcriptFeed.append(bubble);
  lastCaption = { speaker: event.speaker, capturedAt, bubble, text };
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
});
window.overlay.onUsageUpdate((update) => {
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
    remove.textContent = '×';
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

render();
renderStoredTranscript();
refreshModels();
loadPaymentPlans();
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
  .finally(() => { contextLoaded = true; uploadContext.disabled = false; });
