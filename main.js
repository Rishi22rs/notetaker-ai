const path = require('node:path');
const { app, BrowserWindow, globalShortcut, screen, dialog } = require('electron');

let win;
let dragTimer;
let browser;
let browseMode = true;
const quitShortcut = 'CommandOrControl+Shift+Q';

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
      window.setFocusable(enabled);
      window.setIgnoreMouseEvents(!enabled, { forward: true });
      if (enabled) window.focus();
      window.webContents.send('overlay:interactive', enabled);
      browser?.setInteractive(enabled);
    }

    if (!held || !mouseDown) {
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
  if (process.platform !== 'win32') {
    throw new Error('This demonstration requires Windows.');
  }

  // A click-through window needs a working exit route before it is shown.
  if (!globalShortcut.register(quitShortcut, () => app.quit())) {
    throw new Error('Could not register Ctrl+Shift+Q. Close the app using that shortcut and retry.');
  }
  if (!globalShortcut.register('CommandOrControl+Shift+I', () => { browseMode = !browseMode; })) {
    throw new Error('Could not register Ctrl+Shift+I for browser interaction. Free that shortcut and retry.');
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
    resizable: false,
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
  // Windows capture exclusion is best effort, not a complete DLP boundary.
  win.setContentProtection(true);
  win.setIgnoreMouseEvents(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('closed', () => {
    browser?.dispose();
    clearInterval(dragTimer);
    win = null;
  });

  await win.loadFile(path.join(__dirname, 'index.html'));
  browser = require('./browser')(win);
  enableHoldToDrag(win);
  win.show();
}

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox('Privacy Overlay Demo', error.message);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  browser?.dispose();
  clearInterval(dragTimer);
  globalShortcut.unregisterAll();
});
