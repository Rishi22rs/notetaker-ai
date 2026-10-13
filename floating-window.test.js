const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFloatingWindowController } = require('./floating-window');

function fixture() {
  let bounds = { x: 300, y: 100, width: 900, height: 700 };
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  const window = {
    getBounds: () => ({ ...bounds }), setBounds: next => { bounds = { ...next }; },
    setMinimumSize() {}, setAlwaysOnTop() {}
  };
  return { window, area, controller: createFloatingWindowController(window, { getDisplayMatching: () => ({ workArea: area }) }) };
}
test('floating session expands below the question and restores dashboard bounds', () => {
  const { window, controller } = fixture();
  const dashboard = window.getBounds();
  const floating = controller.setMode('floating');
  assert.equal(floating.width, 620);
  assert.equal(floating.height, 168);
  window.setBounds({ ...floating, x: 100, y: 50 });
  const answer = controller.setMode('answer');
  assert.equal(answer.x, 100);
  assert.equal(answer.y, 50);
  assert.equal(answer.height, 520);
  assert.deepEqual(controller.setMode('dashboard'), dashboard);
  assert.equal(controller.setMode('floating').x, 100);
});
test('floating overlay fits a small display and remains on screen when expanded', () => {
  const { window, controller, area } = fixture();
  area.width = 500; area.height = 400;
  controller.setMode('floating');
  window.setBounds({ x: 490, y: 390, width: 500, height: 124 });
  const answer = controller.setMode('answer');
  assert.deepEqual(answer, { x: 0, y: 0, width: 500, height: 400 });
  assert.throws(() => controller.setMode('unknown'), /Invalid window mode/);
});

test('short answers fit their content and long answers stay within the height limit', () => {
  const { controller } = fixture();
  controller.setMode('floating');
  assert.equal(controller.setMode('answer', 280).height, 280);
  assert.equal(controller.setMode('answer', 900).height, 520);
  assert.equal(controller.setMode('answer', 100).height, 240);
});
