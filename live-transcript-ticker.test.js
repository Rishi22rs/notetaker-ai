const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveTranscriptTicker } = require('./live-transcript-ticker');
function fixture() {
  let active = true, reduced = false, clock = 0, id = 0;
  const frames = new Map();
  const viewport = { isConnected: true, clientWidth: 320, scrollLeft: 0 };
  const textElement = { style: {}, scrollWidth: 100, textContent: '' };
  const ticker = createLiveTranscriptTicker({ viewport, textElement, isActive: () => active, reducedMotion: () => reduced,
    requestFrame: callback => { const next = ++id; frames.set(next, callback); return next; }, cancelFrame: id => frames.delete(id) });
  return { ticker, viewport, textElement, frames, setActive(value) { active = value; }, setReduced(value) { reduced = value; },
    advance(ms = 100) { clock += ms; const pending = [...frames]; for (const [id, callback] of pending) { frames.delete(id); callback(clock); } },
    position() { return Number(textElement.style.transform.match(/translateX\(([-.\d]+)px\)/)?.[1]); } };
}
test('short transcript starts at the left and does not animate while there is room', () => {
  const f = fixture(); f.ticker.setText('Tell me about yourself');
  assert.equal(f.position(), 0); assert.equal(f.frames.size, 0);
  f.advance(10000); assert.equal(f.position(), 0);
});
test('overflow pushes older text left, then stops without looping', () => {
  const f = fixture(); f.ticker.setText('First words');
  f.textElement.scrollWidth = 500; f.ticker.setText('First words with additional recognized speech');
  assert.equal(f.position(), 0); f.advance(); f.advance();
  assert.ok(f.position() < 0 && f.position() > -180);
  f.advance(300); assert.equal(f.position(), -180); assert.equal(f.frames.size, 0);
  f.advance(10000); assert.equal(f.position(), -180);
  f.textElement.scrollWidth = 560; f.ticker.setText('Additional new words'); f.advance(); f.advance(300);
  assert.equal(f.position(), -240); assert.equal(f.frames.size, 0);
});
test('hidden ticker stops and reset restores the left-aligned start', () => {
  const f = fixture(); f.textElement.scrollWidth = 500; f.ticker.setText('Long transcript'); f.advance();
  f.setActive(false); f.advance(); assert.equal(f.frames.size, 0);
  f.ticker.reset(); assert.equal(f.textElement.style.transform, 'none'); assert.equal(f.viewport.scrollLeft, 0);
  f.setActive(true); f.textElement.scrollWidth = 120; f.ticker.setText('New session'); assert.equal(f.position(), 0);
});
test('reduced motion reveals overflow immediately without animation', () => {
  const f = fixture(); f.setReduced(true); f.textElement.scrollWidth = 500; f.ticker.setText('Accessible transcript');
  assert.equal(f.position(), -180); assert.equal(f.frames.size, 0);
});
