const { randomUUID } = require('node:crypto');

function normalizeWord(word) {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '');
}

function mergeTranscriptText(previous, incoming) {
  const left = String(previous || '').replace(/\s+/g, ' ').trim();
  const right = String(incoming || '').replace(/\s+/g, ' ').trim();
  if (!left) return right;
  if (!right || left.toLowerCase().endsWith(right.toLowerCase())) return left;

  const leftWords = left.split(' ');
  const rightWords = right.split(' ');
  const maximum = Math.min(16, leftWords.length, rightWords.length);
  let overlap = 0;
  for (let count = maximum; count > 0; count -= 1) {
    const tail = leftWords.slice(-count).map(normalizeWord).join(' ');
    const head = rightWords.slice(0, count).map(normalizeWord).join(' ');
    if (tail && tail === head) {
      overlap = count;
      break;
    }
  }
  return `${left} ${rightWords.slice(overlap).join(' ')}`.trim();
}

function createInterviewSession({
  onTurn,
  pauseMs = 2800,
  // Interviewers commonly pause after the first clause of a question, then
  // add an example or constraint. Questions therefore need a longer quiet
  // window than ordinary captions before they become answerable turns.
  questionPauseMs = 5600,
  maxTurnMs = 20_000,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout
} = {}) {
  if (typeof onTurn !== 'function') throw new TypeError('onTurn is required.');

  let active = null;
  let timer = null;

  function cancelTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function finalize(reason = 'pause') {
    cancelTimer();
    if (!active) return null;
    const turn = { ...active, final: true, reason };
    active = null;
    onTurn(turn);
    return turn;
  }

  function armTimer() {
    cancelTimer();
    if (!active) return;
    const looksLikeQuestion = /[?]\s*$|^(?:what|why|how|when|where|who|which|can|could|would|should|do|does|did|is|are|have|has)\b/i.test(active.text);
    const delay = looksLikeQuestion ? questionPauseMs : pauseMs;
    timer = schedule(() => finalize('pause'), delay);
  }

  function ingest(event) {
    const speaker = event?.speaker;
    const text = String(event?.text || '').replace(/\s+/g, ' ').trim();
    if (!['user', 'computer'].includes(speaker) || !text) return null;

    const receivedAt = now();
    const capturedAt = Number.isFinite(Number(event.capturedAt))
      ? Number(event.capturedAt)
      : receivedAt;

    if (active && active.speaker !== speaker) finalize('speaker-change');
    if (active && capturedAt - active.startedAt >= maxTurnMs) finalize('maximum-duration');

    if (!active) {
      active = {
        id: randomUUID(),
        speaker,
        text,
        startedAt: capturedAt,
        endedAt: capturedAt,
        receivedAt
      };
    } else {
      active.text = mergeTranscriptText(active.text, text);
      active.endedAt = Math.max(active.endedAt, capturedAt);
      active.receivedAt = receivedAt;
    }
    armTimer();
    return { ...active, final: false };
  }

  function clear() {
    cancelTimer();
    active = null;
  }

  return { ingest, flush: finalize, clear, dispose: clear };
}

module.exports = { createInterviewSession, mergeTranscriptText };
