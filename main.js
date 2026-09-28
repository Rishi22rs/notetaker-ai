const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, globalShortcut, screen, dialog, ipcMain, desktopCapturer } = require('electron');
const ollama = require('./ollama');
const { buildContextMessages } = require('./context-prompt');

// CoreAudio Tap can silently return a dead track in unsigned/local macOS builds.
// Use Chromium's Screen & System Audio Recording capture path instead.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-features', 'MacCatapLoopbackAudioForScreenShare');
}

let win;
let dragTimer;
let transcription;
let browseMode = false;
const activeChats = new Map();
const activePulls = new Map();
const quitShortcut = 'CommandOrControl+Shift+Q';
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
    const enabled = held || browseMode;
    const mouseDown = isDown(0x01);
    if (enabled !== interactive) {
      interactive = enabled;
      setInteractive(window, enabled);
    }

    if (!enabled || !mouseDown) {
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
          width: Math.max(300, drag.bounds.width + cursor.x - drag.x),
          height: Math.max(220, drag.bounds.height + cursor.y - drag.y)
        });
      }
    }
    mouseWasDown = mouseDown;
  }, 16);
}

async function createWindow() {
  if (!['win32', 'darwin'].includes(process.platform)) {
    throw new Error('This overlay currently supports Windows and macOS.');
  }

  // A click-through window needs a working exit route before it is shown.
  if (!globalShortcut.register(quitShortcut, () => app.quit())) {
    throw new Error('Could not register Ctrl+Shift+Q. Close the app using that shortcut and retry.');
  }
  if (!globalShortcut.register('CommandOrControl+Shift+I', () => {
    browseMode = !browseMode;
    setInteractive(win, browseMode);
  })) {
    throw new Error('Could not register the interaction shortcut. Free Command/Ctrl+Shift+I and retry.');
  }
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(640, area.width);
  const height = Math.min(640, area.height);
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
    callback(requester === win.webContents && permission === 'media' && details.mediaTypes?.includes('audio'));
  });
  mediaSession.setPermissionCheckHandler((requester, permission) => {
    return requester === win.webContents && permission === 'media';
  });
  mediaSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const [source] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      callback(source ? { video: source, audio: 'loopback' } : null);
    } catch { callback(null); }
  }, { useSystemPicker: false });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('closed', () => {
    for (const cancel of activeChats.values()) cancel();
    activeChats.clear();
    clearInterval(dragTimer);
    win = null;
  });

  await win.loadFile(path.join(__dirname, 'index.html'));
  const transcriptionBackend = process.platform === 'darwin' ? './transcription-metal' : './transcription';
  transcription = require(transcriptionBackend)((event) => {
    if (!win?.isDestroyed()) win.webContents.send('transcription:event', event);
  });
  if (process.platform === 'win32') enableHoldToDrag(win);
  else setInteractive(win, false);
  win.show();
}

ipcMain.handle('ollama:models', () => ollama.listModels());
ipcMain.on('transcription:start', () => transcription?.start());
ipcMain.on('transcription:stop', () => transcription?.stop());
ipcMain.on('transcription:audio', (_event, { speaker, audio }) => {
  if (['user', 'computer'].includes(speaker) && audio instanceof Uint8Array) transcription?.audio(speaker, audio);
});
ipcMain.handle('ollama:suggestions', async (_event, request) => {
  const model = String(request?.model || '').slice(0, 200);
  const draft = String(request?.draft || '').trim().slice(0, 500);
  const context = {
    text: String(request?.context?.text || '').slice(0, 100_000),
    files: Array.isArray(request?.context?.files) ? request.context.files.slice(0, 20).map((file) => ({
      name: String(file?.name || 'Reference file').slice(0, 240),
      kind: file?.kind === 'image' ? 'image' : 'text',
      content: String(file?.content || '').slice(0, file?.kind === 'image' ? 35_000_000 : 100_000)
    })) : []
  };
  if (!model || !draft || (!context.text.trim() && !context.files.length)) return [];
  return ollama.suggest({ model, draft, context });
});
ipcMain.on('ollama:pull', (event, request) => {
  const id = String(request?.id || '');
  const model = String(request?.model || '');
  if (!id || !/^[a-zA-Z0-9._/-]+(?::[a-zA-Z0-9._-]+)?$/.test(model)) return;
  activePulls.get(id)?.();
  const send = (channel, value = {}) => { if (!event.sender.isDestroyed()) event.sender.send(channel, { id, ...value }); };
  const cancel = ollama.pullModel({
    model,
    onProgress: (progress) => send('ollama:pull-progress', progress),
    onDone: () => { activePulls.delete(id); send('ollama:pull-done'); },
    onError: (error) => { activePulls.delete(id); send('ollama:pull-error', { message: error.message }); }
  });
  activePulls.set(id, cancel);
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
ipcMain.handle('context:pick-files', async () => {
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
        const parsed = await require('pdf-parse')(buffer);
        extracted.push({ name, kind: 'text', mime: 'application/pdf', size: stat.size, icon, content: parsed.text.slice(0, 500_000) });
      } else if (extension === '.docx') {
        const parsed = await require('mammoth').extractRawText({ buffer });
        extracted.push({ name, kind: 'text', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: stat.size, icon, content: parsed.value.slice(0, 500_000) });
      } else if (textExtensions.has(extension) || !buffer.includes(0)) {
        extracted.push({ name, kind: 'text', mime: 'text/plain', size: stat.size, icon, content: buffer.toString('utf8').slice(0, 500_000) });
      } else {
        extracted.push({ name, size: stat.size, icon, error: 'This binary format cannot be converted to model context.' });
      }
    } catch (error) {
      extracted.push({ name, size: stat.size, icon, error: `Could not read file: ${error.message}` });
    }
  }
  return extracted;
});
ipcMain.on('ollama:chat', (event, request) => {
  const { id, model, messages, context } = request || {};
  if (typeof id !== 'string' || typeof model !== 'string' || !Array.isArray(messages)) return;
  const safeMessages = messages.slice(-80).map(({ role, content, images }) => ({
    role: ['system', 'user', 'assistant'].includes(role) ? role : 'user',
    content: String(content || '').slice(0, 500_000),
    ...(Array.isArray(images) ? { images: images.slice(0, 10).map((image) => String(image).slice(0, 35_000_000)) } : {})
  }));
  const safeContext = {
    text: String(context?.text || '').slice(0, 500_000),
    files: Array.isArray(context?.files) ? context.files.slice(0, 20).map((file) => ({
      name: String(file?.name || 'Reference file').slice(0, 240),
      kind: file?.kind === 'image' ? 'image' : 'text',
      content: String(file?.content || '').slice(0, 35_000_000)
    })) : []
  };
  const contextualMessages = buildContextMessages(safeMessages, safeContext);
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
  const cancel = ollama.chat({
    model, messages: contextualMessages,
    onChunk: (content) => send('ollama:chunk', { content }),
    onDone: () => finish('ollama:done'),
    onError: (error) => finish('ollama:error', { message: error.message })
  });
  activeChats.set(id, cancel);
});
ipcMain.on('ollama:cancel', (_event, id) => {
  activeChats.get(id)?.();
  activeChats.delete(id);
});

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox('Privacy Overlay Demo', error.message);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  transcription?.dispose();
  for (const cancel of activeChats.values()) cancel();
  for (const cancel of activePulls.values()) cancel();
  clearInterval(dragTimer);
  globalShortcut.unregisterAll();
});
