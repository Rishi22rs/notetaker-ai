const path = require('node:path');
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', path.join(app.getPath('temp'), `overlay-smoke-${process.pid}`));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 640, height: 640,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true } });
  let browser;
  try {
    await window.loadFile(path.join(__dirname, 'index.html'));
    browser = require('./browser')(window);
    const view = window.contentView.children.find((child) => child.webContents && child.webContents !== window.webContents);
    assert.ok(view, 'Embedded view exists');
    window.setSize(800, 700);
    await new Promise((resolve) => setTimeout(resolve, 12000));
    assert.equal(view.getBounds().width, window.getContentSize()[0] - 52);
    assert.equal(await window.webContents.executeJavaScript('Boolean(document.getElementById("transcript"))'), false);
    console.log(JSON.stringify({ resize: 'passed', captions: 'absent', url: view.webContents.getURL(), title: view.webContents.getTitle() }));
    await view.webContents.loadURL('data:text/html,' + encodeURIComponent(
      '<input id="input" style="position:absolute;left:10px;top:10px;width:200px;height:40px"><button style="position:absolute;left:10px;top:80px;width:200px;height:40px" onclick="this.textContent=\'Clicked\'">Click</button>'));
    window.setFocusable(true);
    window.setIgnoreMouseEvents(false);
    window.show();
    window.focus();
    browser.setInteractive(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    view.webContents.sendInputEvent({ type: 'mouseDown', x: 50, y: 30, button: 'left', clickCount: 1 });
    view.webContents.sendInputEvent({ type: 'mouseUp', x: 50, y: 30, button: 'left', clickCount: 1 });
    await view.webContents.insertText('Typing works');
    assert.equal(await view.webContents.executeJavaScript('document.getElementById("input").value'), 'Typing works');
    view.webContents.sendInputEvent({ type: 'mouseDown', x: 50, y: 100, button: 'left', clickCount: 1 });
    view.webContents.sendInputEvent({ type: 'mouseUp', x: 50, y: 100, button: 'left', clickCount: 1 });
    assert.equal(await view.webContents.executeJavaScript('document.querySelector("button").textContent'), 'Clicked');
    console.log('Embedded browser click and text-input checks passed');
  } finally {
    browser?.dispose();
    window.destroy();
    app.quit();
  }
}).catch((error) => { console.error(error); app.exit(1); });
