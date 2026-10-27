(function (root) {
  function createLiveTranscriptTicker({ viewport, textElement, isActive, reducedMotion = () => false, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
    let frame = null;
    let position = 0;
    let target = 0;
    let startPosition = 0;
    let startTime = null;
    let value = '';
    const paint = () => { textElement.style.transform = `translateX(${position.toFixed(2)}px)`; };
    function stop() {
      if (frame !== null) cancelFrame(frame);
      frame = null; startTime = null; startPosition = position;
    }
    function tick(time) {
      frame = null;
      if (!value || !isActive() || !viewport.isConnected || viewport.clientWidth === 0) { stop(); return; }
      if (startTime === null) startTime = time;
      const progress = Math.min(1, Math.max(0, time - startTime) / 280);
      position = startPosition + (target - startPosition) * (1 - Math.pow(1 - progress, 3));
      paint();
      if (progress < 1) frame = requestFrame(tick);
      else { position = target; startPosition = position; startTime = null; }
    }
    function refresh() {
      if (!value || !isActive() || !viewport.isConnected || viewport.clientWidth === 0) return;
      viewport.scrollLeft = 0;
      const next = -Math.max(0, textElement.scrollWidth - viewport.clientWidth);
      if (next !== target) { target = next; startPosition = position; startTime = null; }
      if (reducedMotion() || Math.abs(target - position) < 0.1) {
        stop(); position = target; paint(); return;
      }
      if (frame === null) frame = requestFrame(tick);
    }
    function setText(text) {
      value = String(text || '');
      textElement.textContent = value;
      refresh();
    }
    function reset() {
      stop(); value = ''; position = 0; target = 0; startPosition = 0;
      textElement.style.transform = 'none'; viewport.scrollLeft = 0;
    }
    return { setText, refresh, stop, reset };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createLiveTranscriptTicker };
  else root.createLiveTranscriptTicker = createLiveTranscriptTicker;
})(typeof globalThis !== 'undefined' ? globalThis : this);
