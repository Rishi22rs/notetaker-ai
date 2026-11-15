const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./renderer'), 'utf8');
const functions = ['growFloatingChat', 'renderFloatingChat'].map(name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0]).join('\n');

test('streaming grows to the cap, retains height and preserves manual scroll position', async () => {
  let frame;
  const sizes = [];
  const messages = { scrollTop: 37, clientHeight: 200, scrollHeight: 280, replaceChildren() { this.scrollTop = 0; }, append() {} };
  const context = vm.createContext({
    floatingView: true, floatingChatOpen: true, floatingChatResizeFrame: null,
    floatingChatHeight: 400, floatingChatMessages: messages,
    floatingChatTurns: [{ role: 'assistant', content: 'Streaming', pending: true }],
    windowModeQueue: Promise.resolve(),
    window: { innerHeight: 400, overlay: { setWindowMode: (mode, height) => sizes.push(height) } },
    requestAnimationFrame: callback => { frame = callback; return 1; },
    document: { createElement: () => ({}) }, renderAnswerContent() {}, regenerateFloatingChatAnswer() {}
  });
  vm.runInContext(functions, context);
  context.renderFloatingChat();
  assert.equal(messages.scrollTop, 37);
  frame(); await context.windowModeQueue;
  assert.equal(sizes.at(-1), 480);
  messages.scrollHeight = 1000;
  context.renderFloatingChat(); frame(); await context.windowModeQueue;
  assert.equal(sizes.at(-1), 520);
  messages.scrollTop = 130;
  context.floatingChatTurns[0].pending = false;
  messages.scrollHeight = 100;
  context.renderFloatingChat(); frame(); await context.windowModeQueue;
  assert.equal(context.floatingChatHeight, 520);
  assert.equal(messages.scrollTop, 130);
  assert.equal(sizes.length, 2);
});

test('queued growth does not reopen a chat closed during streaming', async () => {
  let frame;
  const context = vm.createContext({ floatingView: true, floatingChatOpen: true,
    floatingChatResizeFrame: null, requestAnimationFrame: callback => { frame = callback; return 1; }
  });
  vm.runInContext(functions, context);
  context.growFloatingChat();
  context.floatingChatOpen = false;
  assert.doesNotThrow(() => frame());
  assert.equal(context.floatingChatResizeFrame, null);
});
