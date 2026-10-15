const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { app, BrowserWindow, globalShortcut, screen, dialog, ipcMain, desktopCapturer, shell, systemPreferences, safeStorage } = require('electron');
const { createAuthClient } = require('./auth-client');
const { createCloudModels } = require('./cloud-models');
const { createCloudAI } = require('./cloud-ai');
const { createCloudSettings } = require('./cloud-settings');
const { createCloudTranscription } = require('./cloud-transcription');
let cloudSettings;
let cloudTranscription;
let transcriptionActive = false;
const { buildContextMessages } = require('./context-prompt');
const { usableSpeech } = require('./transcription-audio');
const { createInterviewSession } = require('./interview-session');
const { detectQuestion } = require('./question-detector');
const { retrieveInterviewContext } = require('./context-retriever');
const { buildInterviewAnswerMessages } = require('./interview-answer-prompt');
const { createAudioEchoFilter } = require('./audio-echo-filter');

let win;
let dragTimer;
let floatingMode = false;
let floatingClickThrough = false;
let floatingWindowController;
const { createFloatingWindowController } = require('./floating-window');
const { snapFloatingBounds } = require('./floating-window-bounds');
let transcription;
let interviewSession;
let modelAI;
let audioEchoFilter;
let authClient;
let usageSession;
let recordedSessionId = null;
let usageHeartbeatTimer;
const nativeAudio = process.platform === 'darwin' ? require('./native-system-audio')((bytes) => transcription?.audio('computer', bytes)) : null;
let browseMode = false;
const activeChats = new Map();
const activeInterviewAnswers = new Map();
const quitShortcut = 'CommandOrControl+Shift+Q';
const visibilityShortcut = 'CommandOrControl+Shift+H';
const interactionShortcut = 'CommandOrControl+Shift+I';
const MAX_CONTEXT_FILE_BYTES = 25 * 1024 * 1024;
const textExtensions = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.xml', '.yaml', '.yml',
  '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.h', '.cpp', '.hpp',
  '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.kts', '.sql', '.sh', '.zsh', '.ps1',
  '.toml', '.ini', '.cfg', '.conf', '.log'
]);

function setInteractive(window, enabled) {
  if (!window || window.isDestroyed()) return;
  window.setFocusable(enabled);
  window.setIgnoreMouseEvents(!enabled, { forward: true });
  if (enabled) window.focus();
  window.webContents.send('overlay:interactive', enabled);
}

function toggleWindowVisibility() {
  if (!floatingMode) return;
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    win.hide();
    return;
  }
  win.setAlwaysOnTop(true, 'screen-saver');
  if (floatingMode ? !floatingClickThrough : browseMode) {
    win.show();
    setInteractive(win, true);
  } else {
    win.showInactive();
    setInteractive(win, false);
  }
}

function enableHoldToDrag(window) {
  const user32 = require('koffi').load('user32.dll');
  const keyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)');
  const isDown = (key) => (keyState(key) & 0x8000) !== 0;
  let interactive = null;
  let mouseWasDown = isDown(0x01);
  let drag = null;

  // Poll only the drag modifiers and physical left button; no keyboard hook.
  dragTimer = setInterval(() => {
    if (window.isDestroyed()) return;
    const held = isDown(0x11) && isDown(0x10); // Ctrl + Shift
    const enabled = held || (floatingMode ? !floatingClickThrough : browseMode);
    const mouseDown = isDown(0x01);
    if (enabled !== interactive) {
      interactive = enabled;
      setInteractive(window, enabled);
    }

    if (!enabled || !mouseDown || floatingMode) {
      drag = null;
    } else {
      const cursor = screen.getCursorScreenPoint();
      if (!mouseWasDown) {
        const bounds = window.getBounds();
        if (cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width &&
            cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height) {
          const x = cursor.x - bounds.x;
          const y = cursor.y - bounds.y;
          if (x >= bounds.width - 32 && y >= bounds.height - 32) {
            drag = { mode: 'resize', x: cursor.x, y: cursor.y, bounds };
          } else if (y < 80) {
            drag = { mode: 'move', x, y };
          }
        }
      }
      if (drag?.mode === 'move') window.setPosition(cursor.x - drag.x, cursor.y - drag.y);
      if (drag?.mode === 'resize') {
        window.setBounds({
          x: drag.bounds.x,
          y: drag.bounds.y,
          width: Math.max(620, drag.bounds.width + cursor.x - drag.x),
          height: Math.max(220, drag.bounds.height + cursor.y - drag.y)
        });
      }
    }
    mouseWasDown = mouseDown;
  }, 16);
}

function toggleFloatingInteraction() {
  if (!floatingMode || !win || win.isDestroyed()) return;
  floatingClickThrough = !floatingClickThrough;
  setInteractive(win, !floatingClickThrough);
}

function toggleFloatingPlayback() {
  if (!floatingMode || !win || win.isDestroyed()) return;
  win.webContents.send('overlay:toggle-session');
}
function snapFloatingWindow(direction) {
  if (!floatingMode || !win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  win.setBounds(snapFloatingBounds(bounds, area, direction));
}
const floatingHotkeys = [
  [interactionShortcut, toggleFloatingInteraction],
  [visibilityShortcut, toggleWindowVisibility],
  ['CommandOrControl+Shift+P', toggleFloatingPlayback],
  ...['Left', 'Right', 'Up', 'Down'].map(direction => [`CommandOrControl+Shift+${direction}`, () => snapFloatingWindow(direction)])
];
function unregisterFloatingHotkeys() {
  for (const [key] of floatingHotkeys) globalShortcut.unregister(key);
}
function registerFloatingHotkeys() {
  const registered = [];
  for (const [key, handler] of floatingHotkeys) {
    if (!globalShortcut.register(key, handler)) {
      for (const previous of registered) globalShortcut.unregister(previous);
      throw new Error(`Could not register ${key}. Free that shortcut and retry.`);
    }
    registered.push(key);
  }
}

ipcMain.handle('overlay:window-mode', (event, mode, answerHeight) => {
  if (!win || event.sender !== win.webContents) throw new Error('Invalid overlay window');
  if (!['dashboard', 'floating', 'answer'].includes(mode)) throw new Error('Invalid window mode');
  const enteringFloating = mode !== 'dashboard' && !floatingMode;
  if (enteringFloating) registerFloatingHotkeys();
  let bounds;
  try { bounds = floatingWindowController.setMode(mode, answerHeight); }
  catch (error) {
    if (enteringFloating) unregisterFloatingHotkeys();
    throw error;
  }
  floatingMode = mode !== 'dashboard';
  if (!floatingMode || enteringFloating) floatingClickThrough = false;
  if (!floatingMode) {
    unregisterFloatingHotkeys();
    browseMode = true;
    if (win.isVisible?.() === false) win.show();
  }
  setInteractive(win, floatingMode ? !floatingClickThrough : true);
  return bounds;
});

async function createWindow() {
  if (!['win32', 'darwin'].includes(process.platform)) {
    throw new Error('This overlay currently supports Windows and macOS.');
  }

  // A click-through window needs a working exit route before it is shown.
  if (!globalShortcut.register(quitShortcut, () => app.quit())) {
    throw new Error('Could not register Ctrl+Shift+Q. Close the app using that shortcut and retry.');
  }
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(area.width, Math.max(620, Math.round(area.width * 0.65)));
  const height = Math.min(area.height, Math.max(400, Math.round(area.height * 0.65)));
  win = new BrowserWindow({
    width,
    height,
    x: area.x + Math.max(0, area.width - width - 24),
    y: area.y + Math.min(24, Math.max(0, area.height - height)),
    title: 'Privacy Overlay Demo',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    resizable: process.platform === 'darwin',
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.setMinimumSize(Math.min(620, area.width), Math.min(400, area.height));

  floatingWindowController = createFloatingWindowController(win, screen);
  win.setMenu(null);
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  // Capture exclusion is best effort OS protection, not a complete DLP boundary.
  win.setContentProtection(true);
  win.setIgnoreMouseEvents(false);
  const mediaSession = win.webContents.session;
  mediaSession.setPermissionRequestHandler((requester, permission, callback, details) => {
    // Chromium may issue display-capture from the native picker without the
    // original WebContents identity. This session belongs only to our locked
    // local window, so allow that permission at the session boundary.
    if (permission === 'display-capture') return callback(true);
    // getDisplayMedia performs media checks for both its video carrier and
    // loopback audio. The session contains only our non-navigable local page.
    callback(requester === win.webContents && permission === 'media');
  });
  mediaSession.setPermissionCheckHandler((requester, permission) => {
    if (permission === 'display-capture') return true;
    if (requester !== win.webContents) return false;
    return permission === 'media';
  });
  mediaSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const [source] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      callback(source ? { video: source, audio: 'loopback' } : null);
    } catch { callback(null); }
  }, { useSystemPicker: process.platform === 'darwin' });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('closed', () => {
    endRecordedSession().catch(error => console.warn('Could not finalize session history:', error.message));
    for (const cancel of activeChats.values()) cancel();
    activeChats.clear();
    clearInterval(dragTimer);
    win = null;
  });

  await win.loadFile(path.join(__dirname, 'index.html'));
  const publishTranscriptionEvent = (event) => {
    // Shutdown can emit a final transcription status after the BrowserWindow's
    // closed handler has already set `win` to null.
    if (event.type === 'transcript') interviewSession?.ingest(event);
    if (win && !win.isDestroyed()) win.webContents.send('transcription:event', event);
  };
  audioEchoFilter = createAudioEchoFilter({ onEvent: publishTranscriptionEvent });
  const publish = (event) => audioEchoFilter.push(event);
  cloudTranscription = createCloudTranscription(publish, { getSettings: () => ({ ...cloudSettings.get(), geminiKey: 'backend-managed', groqKey: 'backend-managed' }), fetchImpl: (url, options) => authClient.providerFetch(url, { ...options, usageToken: usageSession?.token }) });
  transcription = {
    start() {
      const backend = cloudTranscription;
      transcription.current = backend;
      return backend.start();
    },
    audio(speaker, bytes) {
      if (speaker === 'computer' && transcription.current) {
        const buffer = Buffer.from(bytes);
        if (buffer.length && buffer.length % 4 === 0 && usableSpeech(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4))) {
          interviewSession?.noteComputerSpeech();
          if (win && !win.isDestroyed()) win.webContents.send('transcription:event', { type: 'computer-speech-activity' });
        }
      }
      transcription.current?.audio(speaker, bytes);
    },
    stop() { transcription.current?.stop(); transcription.current = null; transcriptionActive = false; },
    dispose() { cloudTranscription.dispose(); }
  };
  interviewSession = createInterviewSession({
    onTurn: (turn) => {
      if (win && !win.isDestroyed()) win.webContents.send('transcription:event', { type: 'interview-turn', turn });
    }
  });
  browseMode = true;
  if (process.platform === 'win32') enableHoldToDrag(win);
  else setInteractive(win, true);
  win.show();
}

ipcMain.handle('cloud:settings', async () => ({ ...cloudSettings.publicSettings(), ...(await authClient.aiStatus()) }));
ipcMain.handle('cloud:save-settings', async (_event, input) => {
  if (transcriptionActive || activeChats.size || activeInterviewAnswers.size) throw new Error('Stop listening and wait for answers before changing cloud settings.');
  return cloudSettings.save(input);
});
ipcMain.handle('local-ai:models', () => modelAI.listModels());
ipcMain.handle('profile:name', () => {
  try { return os.userInfo().username || 'Local User'; }
  catch { return 'Local User'; }
});
ipcMain.handle('auth:status', () => authClient.status());
ipcMain.handle('auth:login', (event) => authClient.login(() => {
  if (!event.sender.isDestroyed()) event.sender.send('auth:browser-opened');
}));
ipcMain.handle('auth:logout', async () => {
  await endRecordedSession();
  return authClient.logout();
});
ipcMain.handle('coupon:redeem', (_event, code) => authClient.redeemCoupon(String(code || '').slice(0, 32)));
ipcMain.handle('payments:plans', () => authClient.paymentPlans());
ipcMain.handle('payments:start', (_event, planId, minutes, expected) => authClient.startRecharge(String(planId || '').slice(0, 40), minutes, expected));
ipcMain.handle('payments:status', (_event, id) => authClient.paymentStatus(String(id || '').slice(0, 40)));
ipcMain.handle('wallet:get', () => authClient.wallet());

async function stopUsageMeter() {
  if (usageHeartbeatTimer) clearInterval(usageHeartbeatTimer);
  usageHeartbeatTimer = null;
  const session = usageSession;
  usageSession = null;
  for (const cancel of activeChats.values()) cancel();
  activeChats.clear();
  for (const cancel of activeInterviewAnswers.values()) cancel();
  activeInterviewAnswers.clear();
  if (!session) return null;
  try { return await authClient.stopUsage(session.token); }
  catch (error) { console.warn('Could not stop usage meter:', error.message); return null; }
}

async function startUsageMeter() {
  if (usageSession) return usageSession;
  const session = await authClient.startUsage(recordedSessionId || '');
  usageSession = session;
  usageHeartbeatTimer = setInterval(async () => {
    if (!usageSession) return;
    try {
      const update = await authClient.usageHeartbeat(usageSession.token);
      if (win && !win.isDestroyed()) win.webContents.send('usage:update', update);
      if (!update.active) {
        clearInterval(usageHeartbeatTimer);
        usageHeartbeatTimer = null;
        usageSession = null;
        recordedSessionId = null;
        transcription?.stop();
        nativeAudio?.stop();
        if (win && !win.isDestroyed()) win.webContents.send('transcription:event', { type: 'error', text: 'Your usage time has ended. Redeem a coupon or recharge to continue.' });
      }
    } catch (error) { console.warn('Could not sync usage meter:', error.message); }
  }, 10_000);
  usageHeartbeatTimer.unref?.();
  return session;
}

function requireActiveUsage() {
  if (usageSession) return;
  const error = new Error('Session paused. Start your session to use Local AI and transcription.');
  error.status = 402;
  throw error;
}

async function endRecordedSession() {
  await stopUsageMeter();
  if (!recordedSessionId) return { ok: true };
  const result = await authClient.endRecordedSession(recordedSessionId);
  recordedSessionId = null;
  return result;
}
ipcMain.handle('history:create', async (_event, details) => {
  if (recordedSessionId) await endRecordedSession();
  if (details?.resume && !details.resume.originalBase64) throw new Error('Original resume bytes were not included. Restart the app and upload the resume again.');
  const record = await authClient.createRecordedSession(details);
  if (details?.resume && !record.resumeStored) throw new Error('The backend did not save the original resume. Restart the backend before creating another session.');
  recordedSessionId = record.id;
  return record;
});
ipcMain.handle('history:end', endRecordedSession);
ipcMain.handle('feedback:submit', (_event, body) => authClient.submitFeedback({ rating: body?.rating, suggestion: body?.suggestion }));
ipcMain.handle('history:list', (_event, page) => authClient.listSessionHistory(Math.max(0, Math.floor(Number(page) || 0))));
ipcMain.handle('history:detail', (_event, id) => authClient.sessionHistoryDetail(String(id || '')));
ipcMain.handle('history:download-resume', async (_event, id) => {
  const file = await authClient.downloadSessionResume(String(id || ''));
  const name = file.name.split(/[\\/]/).pop().replace(/[<>:"|?*\x00-\x1f]/g, '_') || 'resume';
  const picked = await dialog.showSaveDialog(win, { title: 'Download resume', defaultPath: name });
  if (picked.canceled || !picked.filePath) return { canceled: true };
  await fs.writeFile(picked.filePath, file.bytes);
  return { saved: true };
});


ipcMain.handle('usage:start', () => startUsageMeter());
ipcMain.handle('usage:stop', () => stopUsageMeter());
ipcMain.handle('usage:status', async () => ({ active: Boolean(usageSession), ...(await authClient.wallet()) }));
ipcMain.on('permissions:complete', () => {
  browseMode = true;
  setInteractive(win, floatingMode ? !floatingClickThrough : true);
});
ipcMain.handle('audio:permission', () => nativeAudio?.start(true));
ipcMain.handle('audio:microphone-status', () => process.platform === 'darwin'
  ? systemPreferences.getMediaAccessStatus('microphone')
  : 'unknown');
ipcMain.handle('audio:open-settings', (_event, source) => {
  if (process.platform !== 'darwin') return false;
  const pane = source === 'microphone' ? 'Privacy_Microphone' : 'Privacy_AudioCapture';
  return shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
});
ipcMain.handle('transcription:start', async (_event, sources) => {
  // Listening is a deliberate use action, so it can safely resume/start a
  // metered session after the renderer has obtained its audio streams.
  const session = await startUsageMeter();
  try {
    await transcription?.start();
    transcriptionActive = true;
    if (nativeAudio && sources?.system) await nativeAudio.start(false, 0.5);
  } catch (error) {
    nativeAudio?.stop(); transcription?.stop(); await stopUsageMeter(); throw error;
  }
  return { active: true, balanceSeconds: session.balanceSeconds };
});
ipcMain.on('transcription:stop', () => {
  interviewSession?.flush('stopped');
  nativeAudio?.stop();
  transcription?.stop();
  stopUsageMeter();
});
ipcMain.on('transcription:clear', () => interviewSession?.clear());
ipcMain.on('transcription:audio', (_event, { speaker, audio }) => {
  if (['user', 'computer'].includes(speaker) && audio instanceof Uint8Array) transcription?.audio(speaker, audio);
});
ipcMain.handle('local-ai:suggestions', async (_event, request) => {
  requireActiveUsage();
  const model = String(request?.model || '').slice(0, 200);
  const draft = String(request?.draft || '').trim().slice(0, 500);
  const transcript = String(request?.transcript || '').trim().slice(-20_000);
  const context = {
    text: String(request?.context?.text || '').slice(0, 100_000),
    files: Array.isArray(request?.context?.files) ? request.context.files.slice(0, 21).map((file) => ({
      name: String(file?.name || 'Reference file').slice(0, 240),
      kind: file?.kind === 'image' ? 'image' : 'text',
      content: String(file?.content || '').slice(0, file?.kind === 'image' ? 35_000_000 : 100_000)
    })) : []
  };
  if (!model || (!draft && !transcript)) return [];
  return modelAI.suggest({ model, draft, context, transcript });
});
ipcMain.handle('interview:detect-question', async (_event, request) => {
  requireActiveUsage();
  const model = String(request?.model || '').slice(0, 200);
  const turn = {
    id: String(request?.turn?.id || '').slice(0, 100),
    speaker: request?.turn?.speaker === 'computer' ? 'computer' : 'user',
    text: String(request?.turn?.text || '').slice(0, 5000)
  };
  const recentTurns = Array.isArray(request?.recentTurns) ? request.recentTurns.slice(-6).map((item) => ({
    speaker: item?.speaker === 'computer' ? 'computer' : 'user',
    text: String(item?.text || '').slice(0, 2000)
  })) : [];
  return detectQuestion({
    turn,
    recentTurns,
    classify: model && !request?.rulesOnly ? (input) => modelAI.classifyInterviewTurn({ model, ...input }) : undefined
  });
});
ipcMain.handle('interview:retrieve-context', (_event, request) => {
  requireActiveUsage();
  const context = {
    text: String(request?.context?.text || '').slice(0, 500_000),
    files: Array.isArray(request?.context?.files) ? request.context.files.slice(0, 21).map((file) => ({
      name: String(file?.name || 'Reference file').slice(0, 240),
      kind: file?.kind === 'text' ? 'text' : 'image',
      content: file?.kind === 'text' ? String(file?.content || '').slice(0, 500_000) : ''
    })) : []
  };
  const recentTurns = Array.isArray(request?.recentTurns) ? request.recentTurns.slice(-8).map((turn) => ({
    speaker: turn?.speaker === 'computer' ? 'computer' : 'user',
    source: turn?.source === 'typed' ? 'typed' : 'audio',
    text: String(turn?.text || '').slice(0, 5000)
  })) : [];
  return retrieveInterviewContext({
    question: String(request?.question || '').slice(0, 5000),
    context,
    recentTurns
  });
});
ipcMain.on('interview:answer', (event, request) => {
  const id = String(request?.id || '');
  const model = String(request?.model || '').slice(0, 200);
  if (!id || !model) return;
  try { requireActiveUsage(); }
  catch (error) {
    if (!event.sender.isDestroyed()) event.sender.send('interview:answer-error', { id, message: error.message });
    return;
  }
  const retrievedContext = {
    profile: String(request?.retrievedContext?.profile || '').slice(0, 4000),
    contextLanguages: Array.isArray(request?.retrievedContext?.contextLanguages)
      ? request.retrievedContext.contextLanguages.slice(0, 5).map((language) => String(language).slice(0, 40))
      : [],
    chunks: Array.isArray(request?.retrievedContext?.chunks) ? request.retrievedContext.chunks.slice(0, 6).map((chunk) => ({
      source: String(chunk?.source || 'Reference').slice(0, 240),
      text: String(chunk?.text || '').slice(0, 5000)
    })) : [],
    recentTurns: Array.isArray(request?.retrievedContext?.recentTurns) ? request.retrievedContext.recentTurns.slice(-8).map((turn) => ({
      speaker: turn?.speaker === 'computer' ? 'computer' : 'user',
      source: turn?.source === 'typed' ? 'typed' : 'audio',
      text: String(turn?.text || '').slice(0, 2000)
    })) : []
  };
  const messages = buildInterviewAnswerMessages({
    question: String(request?.question || '').slice(0, 5000),
    type: String(request?.type || 'general'),
    retrievedContext,
    codeLanguage: String(request?.codeLanguage || '').slice(0, 40),
    verbosity: request?.verbosity === 'detailed' ? 'detailed' : 'concise'
  });

  const send = (channel, value = {}) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, { id, ...value });
  };
  activeInterviewAnswers.get(id)?.();
  let settled = false;
  const finish = (channel, value) => {
    if (settled) return;
    settled = true;
    activeInterviewAnswers.delete(id);
    send(channel, value);
  };
  const cancel = modelAI.chat({
    model,
    messages,
    onChunk: (content) => send('interview:answer-chunk', { content }),
    onDone: () => finish('interview:answer-done'),
    onError: (error) => finish('interview:answer-error', { message: error.message })
  });
  activeInterviewAnswers.set(id, cancel);
});
ipcMain.on('interview:cancel-answer', (_event, id) => {
  activeInterviewAnswers.get(id)?.();
  activeInterviewAnswers.delete(id);
});
ipcMain.handle('notes:load', async () => {
  try { return await fs.readFile(path.join(app.getPath('userData'), 'notes.md'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
});
ipcMain.handle('notes:save', async (_event, content) => {
  const text = String(content || '').slice(0, 2_000_000);
  await fs.writeFile(path.join(app.getPath('userData'), 'notes.md'), text, 'utf8');
  return true;
});
ipcMain.handle('context:load', async () => {
  try { return JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'context.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return { text: '', files: [] }; throw error; }
});
ipcMain.handle('context:save', async (_event, value) => {
  const safe = {
    text: String(value?.text || '').slice(0, 500_000),
    files: Array.isArray(value?.files) ? value.files.slice(0, 20).map((file) => ({
      name: String(file.name || 'file').slice(0, 240),
      kind: file.kind === 'image' ? 'image' : 'text',
      mime: String(file.mime || '').slice(0, 100),
      size: Number.isFinite(file.size) ? Math.max(0, file.size) : 0,
      icon: String(file.icon || '').startsWith('data:image/') ? String(file.icon).slice(0, 500_000) : '',
      content: String(file.content || '').slice(0, 35_000_000)
    })) : []
  };
  await fs.writeFile(path.join(app.getPath('userData'), 'context.json'), JSON.stringify(safe), 'utf8');
  return true;
});
ipcMain.handle('context:pick-files', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
  if (result.canceled) return [];
  const extracted = [];
  for (const filePath of result.filePaths.slice(0, 20)) {
    const stat = await fs.stat(filePath);
    const name = path.basename(filePath);
    const icon = (await app.getFileIcon(filePath, { size: 'normal' })).toDataURL();
    if (stat.size > MAX_CONTEXT_FILE_BYTES) {
      extracted.push({ name, size: stat.size, icon, error: 'File is larger than 25 MB.' });
      continue;
    }
    const extension = path.extname(filePath).toLowerCase();
    const buffer = await fs.readFile(filePath);
    try {
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) {
        const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : `image/${extension.slice(1)}`;
        extracted.push({ name, kind: 'image', mime, size: stat.size, content: buffer.toString('base64') });
      } else if (extension === '.pdf') {
        const content = await require('./pdf-text').extractPdfText(buffer);
        extracted.push({ name, kind: 'text', mime: 'application/pdf', size: stat.size, icon, content });
      } else if (extension === '.docx') {
        const parsed = await require('mammoth').extractRawText({ buffer });
        extracted.push({ name, kind: 'text', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: stat.size, icon, content: parsed.value.slice(0, 500_000) });
      } else if (textExtensions.has(extension) || !buffer.includes(0)) {
        extracted.push({ name, kind: 'text', mime: 'text/plain', size: stat.size, icon, content: buffer.toString('utf8').slice(0, 500_000) });
      } else {
        extracted.push({ name, size: stat.size, icon, error: 'This binary format cannot be converted to model context.' });
      }
      if (options.resume === true && extracted.at(-1)?.kind === 'text') extracted.at(-1).originalBase64 = buffer.toString('base64');
    } catch (error) {
      extracted.push({ name, size: stat.size, icon, error: `Could not read file: ${error.message}` });
    }
  }
  return extracted;
});
ipcMain.on('local-ai:chat', (event, request) => {
  const { id, model, messages, context } = request || {};
  if (typeof id !== 'string' || typeof model !== 'string' || !Array.isArray(messages)) return;
  try { requireActiveUsage(); }
  catch (error) {
    if (!event.sender.isDestroyed()) event.sender.send('local-ai:error', { id, message: error.message });
    return;
  }
  const safeMessages = messages.slice(-80).map(({ role, content, images }) => ({
    role: ['system', 'user', 'assistant'].includes(role) ? role : 'user',
    content: String(content || '').slice(0, 500_000),
    ...(Array.isArray(images) ? { images: images.slice(0, 10).map((image) => String(image).slice(0, 35_000_000)) } : {})
  }));
  const safeContext = {
    text: String(context?.text || '').slice(0, 500_000),
    files: Array.isArray(context?.files) ? context.files.slice(0, 21).map((file) => ({
      name: String(file?.name || 'Reference file').slice(0, 240),
      kind: file?.kind === 'image' ? 'image' : 'text',
      content: String(file?.content || '').slice(0, 35_000_000)
    })) : []
  };
  let contextualMessages;
  if (model.startsWith('cloud:')) {
    const question = safeMessages.findLast(message => message.role === 'user')?.content || '';
    const relevant = retrieveInterviewContext({ question, context: safeContext });
    contextualMessages = buildContextMessages(safeMessages.slice(-12).map(message => ({ ...message, content: message.content.slice(0, 6000) })), {
      text: relevant.profile,
      files: relevant.chunks.map(chunk => ({ name: chunk.source, kind: 'text', content: chunk.text }))
    });
  } else contextualMessages = buildContextMessages(safeMessages, safeContext);
  contextualMessages.unshift({ role: 'system', content: 'Always answer in English, regardless of the language of the question or conversation. Keep code, proper names, and technical identifiers unchanged.' });
  activeChats.get(id)?.();
  const send = (channel, value = {}) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, { id, ...value });
  };
  let settled = false;
  const finish = (channel, value) => {
    if (settled) return;
    settled = true;
    activeChats.delete(id);
    send(channel, value);
  };
  const cancel = modelAI.chat({
    model, messages: contextualMessages,
    onChunk: (content) => send('local-ai:chunk', { content }),
    onDone: () => finish('local-ai:done'),
    onError: (error) => finish('local-ai:error', { message: error.message })
  });
  activeChats.set(id, cancel);
});
ipcMain.on('local-ai:cancel', (_event, id) => {
  activeChats.get(id)?.();
  activeChats.delete(id);
});

app.whenReady().then(async () => {
  authClient = createAuthClient({
    serverUrl: process.env.AUTH_SERVER_URL || 'http://127.0.0.1:8787',
    userDataPath: app.getPath('userData'),
    openExternal: (url) => shell.openExternal(url)
  });
  cloudSettings = createCloudSettings({ userDataPath: app.getPath('userData'), safeStorage });
  await cloudSettings.load();
  const cloudAI = createCloudAI({ getSettings: () => ({ ...cloudSettings.get(), geminiKey: 'backend-managed', groqKey: 'backend-managed' }), fetchImpl: (url, options) => authClient.providerFetch(url, { ...options, usageToken: usageSession?.token }) });
  modelAI = createCloudModels({ cloudAI });
  return createWindow();
}).catch((error) => {
  dialog.showErrorBox('Privacy Overlay Demo', error.message);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  stopUsageMeter();
  nativeAudio?.stop();
  transcription?.dispose();
  interviewSession?.dispose();
  audioEchoFilter?.dispose();
  for (const cancel of activeChats.values()) cancel();
  for (const cancel of activeInterviewAnswers.values()) cancel();
  clearInterval(dragTimer);
  globalShortcut.unregisterAll();
});
