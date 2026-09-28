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
const STORAGE_KEY = 'local-ai-conversation-v1';
let messages = loadMessages();
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
  const hasContext = Boolean(contextState.text.trim() || contextState.files.length);
  if (!draft || !hasContext || !modelSelect.value) { promptSuggestions.replaceChildren(); return; }
  suggestionTimer = setTimeout(async () => {
    try {
      const suggestions = await window.overlay.getSuggestions({ model: modelSelect.value, draft, context: contextState });
      if (revision === suggestionRevision && prompt.value.trim()) showSuggestionChips(suggestions);
    } catch {
      if (revision === suggestionRevision) promptSuggestions.replaceChildren();
    }
  }, 550);
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
    // Longer windows give Whisper enough phonetic context and sharply reduce
    // short, silence-driven hallucinations while remaining caption-like.
    if (sampleCount < context.sampleRate * 3) return;
    const merged = new Float32Array(sampleCount);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    chunks.length = 0;
    sampleCount = 0;
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

async function startLiveTranscription() {
  transcriptStatus.textContent = 'Requesting audio access…';
  const [computerResult, micResult] = await Promise.allSettled([
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
  ]);
  transcriptionRunning = true;
  const errors = [];
  for (const [result, speaker] of [[computerResult, 'computer'], [micResult, 'user']]) {
    if (result.status === 'fulfilled') {
      try { transcriptionCaptures.push(beginAudioCapture(result.value, speaker)); }
      catch (error) { errors.push(error.message); }
    } else errors.push(`${speaker === 'user' ? 'Microphone' : 'Computer audio'}: ${result.reason?.message || 'permission denied'}`);
  }
  if (!transcriptionCaptures.length) {
    transcriptionRunning = false;
    transcriptStatus.textContent = errors.join(' · ');
    return;
  }
  window.overlay.startTranscription();
  toggleTranscription.textContent = 'Stop listening';
  transcriptStatus.textContent = errors.length ? `Partial capture · ${errors.join(' · ')}` : 'Loading local model…';
}

async function stopLiveTranscription() {
  transcriptionRunning = false;
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
  transcriptFeed.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'transcript-empty';
  empty.textContent = transcriptionRunning ? 'Listening…' : 'Start listening for live local captions.';
  transcriptFeed.append(empty);
});

window.overlay.onTranscription((event) => {
  if (event.type === 'status' || event.type === 'ready' || event.type === 'warning' || event.type === 'error') {
    transcriptStatus.textContent = event.text;
  }
  if (event.type !== 'transcript') return;
  transcriptFeed.querySelector('.transcript-empty')?.remove();
  const bubble = document.createElement('div');
  bubble.className = `caption ${event.speaker === 'user' ? 'user' : 'computer'}`;
  const label = document.createElement('span');
  label.className = 'caption-label';
  label.textContent = event.speaker === 'user' ? 'You' : 'Computer';
  const text = document.createElement('span');
  text.textContent = event.text;
  bubble.append(label, text);
  transcriptFeed.append(bubble);
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
