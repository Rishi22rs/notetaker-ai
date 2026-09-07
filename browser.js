const path = require('node:path');
const { WebContentsView } = require('electron');

module.exports = function attachBrowser(window) {
  const view = new WebContentsView({ webPreferences: {
    preload: path.join(__dirname, 'browser-preload.js'),
    partition: 'persist:chatgpt',
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true
  } });
  const contents = view.webContents;
  let interactive = false;
  let disposed = false;
  let pageStatus = 'Loading chatgpt.com...';
  let audioStatus = 'Connecting system audio...';
  const publish = (text) => {
    pageStatus = text;
    if (!window.isDestroyed()) window.webContents.send('browser:status', `${pageStatus} | ${audioStatus}`);
  };
  const layout = () => {
    const [width, height] = window.getContentSize();
    view.setBounds({ x: 26, y: 88, width: Math.max(1, width - 52), height: Math.max(1, height - 120) });
  };
  window.contentView.addChildView(view);
  layout();
  window.on('resize', layout);
  const audio = require('./system-audio')((text, ready) => {
    audioStatus = text;
    if (!contents.isDestroyed()) contents.setAudioMuted(ready);
    publish(pageStatus);
  });
  require('./media-permissions')(contents.session, contents, () => audio.isReady());
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://')) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) contents.loadURL(url).catch(() => {});
    return { action: 'deny' };
  });
  contents.on('dom-ready', () => {
    contents.send('overlay:interactive', interactive);
    if (interactive && window.isFocused()) contents.focus();
  });
  contents.on('did-finish-load', () => publish(new URL(contents.getURL()).hostname));
  contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) publish(`Page failed to load: ${description}`);
  });
  contents.loadURL('https://chatgpt.com/').catch((error) => publish(`Page failed to load: ${error.message}`));

  return {
    setInteractive(enabled) {
      interactive = enabled;
      if (!contents.isDestroyed()) {
        contents.send('overlay:interactive', enabled);
        if (enabled) contents.focus();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      audio.dispose();
      window.removeListener('resize', layout);
      if (!contents.isDestroyed()) contents.close();
    }
  };
};
