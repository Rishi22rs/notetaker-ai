const modelSelect = document.getElementById('model');
const status = document.getElementById('status');
const messagesElement = document.getElementById('messages');
const form = document.getElementById('composer');
const prompt = document.getElementById('prompt');
const send = document.getElementById('send');
const newChat = document.getElementById('new-chat');
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
const interviewAnswer = document.getElementById('interview-answer');
const interviewAnswerQuestion = document.getElementById('interview-answer-question');
const interviewAnswerText = document.getElementById('interview-answer-text');
const expandInterviewAnswer = document.getElementById('expand-interview-answer');
const interviewQuestions = document.getElementById('interview-questions');
const interviewQuestionsList = document.getElementById('interview-questions-list');
const STORAGE_KEY = 'local-ai-conversation-v1';
const TRANSCRIPT_CONTEXT_KEY = 'local-ai-transcript-context-v1';
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
let transcriptionCaptures = [];
let transcriptionSources = { microphone: true, system: true };
let permissionStreams = { computer: null, user: null };
let cancelInterviewAnswer = null;
let interviewPipelineRevision = 0;
let activeInterviewAnswerTurnId = null;
let lastInterviewAnswerRequest = null;
const recommendedModels = [
  { name: 'gemma3:270m', size: 292_000_000, vision: false },
  { name: 'gemma3:1b', size: 815_000_000, vision: false },
  { name: 'gemma3:4b', size: 3_300_000_000, vision: true },
  { name: 'gemma3:12b', size: 8_100_000_000, vision: true },
  { name: 'llama3.2-vision:11b', size: 7_800_000_000, vision: true }
];
document.body.classList.add(`platform-${window.overlay.platform}`);

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

async function renderInterviewQuestionSuggestions(turn, pipelineRevision) {
  interviewQuestions.hidden = false;
  interviewQuestionsList.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'interview-questions-empty';
  loading.textContent = 'Thinking of useful follow-ups…';
  interviewQuestionsList.append(loading);
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
    interviewQuestionsList.replaceChildren();
    if (!suggestions.length) {
      loading.textContent = 'No follow-up suggestions yet.';
      interviewQuestionsList.append(loading);
      return;
    }
    for (const suggestion of suggestions) {
      const item = document.createElement('div');
      item.className = 'interview-question-suggestion';
      item.textContent = suggestion;
      interviewQuestionsList.append(item);
    }
  } catch {
    if (pipelineRevision !== interviewPipelineRevision) return;
    loading.textContent = 'Follow-up suggestions unavailable.';
  }
}

function generateInterviewAnswer(request, label, turnId, verbosity = 'concise') {
  cancelInterviewAnswer?.();
  activeInterviewAnswerTurnId = turnId;
  lastInterviewAnswerRequest = { request, label, turnId };
  interviewAnswer.hidden = false;
  interviewAnswerQuestion.textContent = request.question;
  interviewAnswerText.textContent = '';
  interviewAnswerText.classList.add('pending');
  expandInterviewAnswer.hidden = true;
  transcriptStatus.textContent = verbosity === 'detailed' ? `Expanding answer · ${label}` : `Answering · ${label}`;
  cancelInterviewAnswer = window.overlay.generateInterviewAnswer({ ...request, verbosity }, {
    onChunk(chunk) {
      if (activeInterviewAnswerTurnId !== turnId) return;
      interviewAnswerText.textContent += chunk;
    },
    onDone() {
      if (activeInterviewAnswerTurnId !== turnId) return;
      cancelInterviewAnswer = null;
      interviewAnswerText.classList.remove('pending');
      expandInterviewAnswer.hidden = verbosity === 'detailed';
      transcriptStatus.textContent = `${verbosity === 'detailed' ? 'Expanded answer' : 'Answer'} ready · ${label}`;
    },
    onError(error) {
      if (activeInterviewAnswerTurnId !== turnId) return;
      cancelInterviewAnswer = null;
      interviewAnswerText.classList.remove('pending');
      interviewAnswerText.textContent = `Could not generate an answer: ${error}`;
      transcriptStatus.textContent = 'Answer generation failed';
    }
  });
}

expandInterviewAnswer.addEventListener('click', () => {
  if (!lastInterviewAnswerRequest) return;
  const { request, label, turnId } = lastInterviewAnswerRequest;
  generateInterviewAnswer(request, label, turnId, 'detailed');
});

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
      option.textContent = `${item.name} · ${formatBytes(item.size)}`;
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
        option.textContent = `${item.name} · ${formatBytes(item.size)} · Download`;
        option.dataset.installed = 'false';
        availableGroup.append(option);
      }
      modelSelect.append(availableGroup);
    }
    const previous = localStorage.getItem('local-ai-model');
    if (previous && models.some((item) => item.name === previous)) modelSelect.value = previous;
    if (!models.length) setStatus('No models installed — run: ollama pull llama3.2', true);
    else setStatus('Ollama connected · local only');
    updateModelSelection();
  } catch {
    modelSelect.replaceChildren();
    const option = document.createElement('option');
    option.textContent = 'Ollama unavailable';
    modelSelect.append(option);
    send.disabled = true;
    setStatus('Start Ollama, then reopen this app', true);
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
  send.disabled = !installed || Boolean(downloadingModel);
  if (installed) {
    modelDownload.hidden = true;
    localStorage.setItem('local-ai-model', modelSelect.value);
    return;
  }
  const info = recommendedModels.find((item) => item.name === modelSelect.value);
  modelDownload.hidden = false;
  downloadTitle.textContent = modelSelect.value;
  downloadDetail.textContent = `${formatBytes(info?.size)}${info?.vision ? ' · Supports images' : ' · Text only'}`;
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
  setStatus(error || 'Ollama connected · local only', Boolean(error));
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
newChat.addEventListener('click', () => {
  cancelGeneration?.();
  cancelGeneration = null;
  messages = [];
  saveMessages();
  send.textContent = 'Send';
  render();
});

function setView(view) {
  const notesOpen = view === 'notes';
  const contextOpen = view === 'context';
  const transcriptOpen = view === 'transcript';
  messagesElement.hidden = notesOpen || contextOpen || transcriptOpen;
  notesView.hidden = !notesOpen;
  contextView.hidden = !contextOpen;
  transcriptView.hidden = !transcriptOpen;
  form.hidden = notesOpen || contextOpen || transcriptOpen;
  promptSuggestions.hidden = notesOpen || contextOpen || transcriptOpen;
  modelSelect.hidden = notesOpen || contextOpen || transcriptOpen;
  newChat.hidden = notesOpen || contextOpen || transcriptOpen;
  if (notesOpen || contextOpen || transcriptOpen) modelDownload.hidden = true;
  else updateModelSelection();
  showChat.classList.toggle('active', !notesOpen && !contextOpen && !transcriptOpen);
  showNotes.classList.toggle('active', notesOpen);
  showContext.classList.toggle('active', contextOpen);
  showTranscript.classList.toggle('active', transcriptOpen);
  viewTitle.textContent = notesOpen ? 'Notepad' : contextOpen ? 'Context' : transcriptOpen ? 'Live transcription' : 'Local AI';
  status.textContent = notesOpen || contextOpen ? 'Stored only on this computer' : transcriptOpen ? 'On-device speech recognition' : 'Ollama connected · local only';
  if (notesOpen) notepad.focus();
  if (contextOpen) contextInput.focus();
  else if (!notesOpen) renderPromptSuggestions();
}

showChat.addEventListener('click', () => setView('chat'));
showNotes.addEventListener('click', () => setView('notes'));
showContext.addEventListener('click', () => setView('context'));
showTranscript.addEventListener('click', () => setView('transcript'));

function updateAudioSourceButtons() {
  toggleMicrophone.setAttribute('aria-pressed', String(transcriptionSources.microphone));
  toggleSystemAudio.setAttribute('aria-pressed', String(transcriptionSources.system));
  toggleMicrophone.disabled = transcriptionRunning;
  toggleSystemAudio.disabled = transcriptionRunning;
}

toggleMicrophone.addEventListener('click', () => {
  transcriptionSources.microphone = !transcriptionSources.microphone;
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
      audio: { echoCancellation: true, noiseSuppression: true }, video: false
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

clearTranscript.addEventListener('click', () => {
  interviewPipelineRevision += 1;
  cancelInterviewAnswer?.();
  cancelInterviewAnswer = null;
  activeInterviewAnswerTurnId = null;
  lastInterviewAnswerRequest = null;
  interviewAnswer.hidden = true;
  interviewAnswerQuestion.textContent = '';
  interviewAnswerText.textContent = '';
  expandInterviewAnswer.hidden = true;
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
});

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

window.overlay.onTranscription((event) => {
  if (event.type === 'status' || event.type === 'ready' || event.type === 'warning' || event.type === 'error') {
    transcriptStatus.textContent = event.text;
  }
  if (event.type === 'interview-turn') {
    transcriptContext.push(event.turn);
    saveTranscriptContext();
    renderPromptSuggestions();
    if (event.turn.speaker === 'computer') {
      const turn = event.turn;
      const pipelineRevision = ++interviewPipelineRevision;
      interviewQuestionsList.replaceChildren();
      const detecting = document.createElement('div');
      detecting.className = 'interview-questions-empty';
      detecting.textContent = 'Checking for a question…';
      interviewQuestionsList.append(detecting);
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
          cancelInterviewAnswer?.();
          cancelInterviewAnswer = null;
          activeInterviewAnswerTurnId = turn.id;
          renderInterviewQuestionSuggestions(turn, pipelineRevision);
          transcriptStatus.textContent = `Question detected · finding ${label} context…`;
          const retrievedContext = await window.overlay.retrieveInterviewContext({
            question: turn.text,
            context: contextState,
            recentTurns: transcriptContext.slice(-8)
          });
          if (pipelineRevision !== interviewPipelineRevision) return;
          const currentTurn = transcriptContext.find((item) => item.id === turn.id);
          if (!currentTurn) return;
          currentTurn.retrievedContext = retrievedContext;
          saveTranscriptContext();
          generateInterviewAnswer({
            model: modelSelect.value,
            question: turn.text,
            type: detection.type,
            retrievedContext
          }, label, turn.id);
        } else {
          transcriptStatus.textContent = 'Listening · no question detected';
        }
      }).catch(() => { transcriptStatus.textContent = 'Listening · question detection unavailable'; });
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
  transcriptFeed.append(bubble);
  lastCaption = { speaker: event.speaker, capturedAt, bubble, text };
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
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
refreshModels();
window.overlay.loadNotes().then((content) => { notepad.value = content; }).catch(() => { notesStatus.textContent = 'Could not load notes'; });
window.overlay.loadContext().then((value) => {
  if (!contextDirty) contextState = value && Array.isArray(value.files) ? value : { text: '', files: [] };
  contextInput.value = contextState.text || '';
  renderContextFiles();
  renderPromptSuggestions();
}).catch(() => { contextSaveStatus.textContent = 'Could not load context'; })
  .finally(() => { contextLoaded = true; uploadContext.disabled = false; });
