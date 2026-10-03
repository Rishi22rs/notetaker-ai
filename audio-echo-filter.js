function words(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
}

const SHORT_REPLY_WORDS = new Set(['a', 'an', 'the', 'i', 'it', 'is', 'to', 'of', 'and', 'or', 'yes', 'no', 'okay', 'ok']);

function orderedSubset(needle, haystack) {
  let index = 0;
  for (const word of haystack) {
    if (word === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function audioEnvelope(samples, bucketSize = 320) {
  const output = new Float32Array(Math.floor(samples.length / bucketSize));
  for (let bucket = 0; bucket < output.length; bucket += 1) {
    let sum = 0;
    const start = bucket * bucketSize;
    for (let index = 0; index < bucketSize; index += 1) sum += Math.abs(samples[start + index]);
    output[bucket] = sum / bucketSize;
  }
  return output;
}

function correlation(left, leftStart, right, rightStart, length) {
  let leftMean = 0;
  let rightMean = 0;
  for (let index = 0; index < length; index += 1) {
    leftMean += left[leftStart + index];
    rightMean += right[rightStart + index];
  }
  leftMean /= length;
  rightMean /= length;
  let numerator = 0;
  let leftPower = 0;
  let rightPower = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[leftStart + index] - leftMean;
    const b = right[rightStart + index] - rightMean;
    numerator += a * b;
    leftPower += a * a;
    rightPower += b * b;
  }
  if (leftPower < 1e-8 || rightPower < 1e-8) return 0;
  return numerator / Math.sqrt(leftPower * rightPower);
}

function isLikelyAcousticEcho(microphoneSamples, computerSamples, threshold = 0.72) {
  const microphone = audioEnvelope(microphoneSamples);
  const computer = audioEnvelope(computerSamples);
  const minimumOverlap = Math.min(40, microphone.length, computer.length);
  if (minimumOverlap < 15) return false;
  const maximumShift = Math.min(125, Math.max(microphone.length, computer.length) - minimumOverlap);
  for (let shift = -maximumShift; shift <= maximumShift; shift += 1) {
    const microphoneStart = Math.max(0, shift);
    const computerStart = Math.max(0, -shift);
    const length = Math.min(microphone.length - microphoneStart, computer.length - computerStart);
    if (length >= minimumOverlap && correlation(microphone, microphoneStart, computer, computerStart, length) >= threshold) return true;
  }
  return false;
}

function isLikelyEcho(microphoneText, computerText) {
  const microphone = words(microphoneText);
  const computer = words(computerText);
  if (!microphone.length || !computer.length) return false;
  if (microphone.length <= 3) {
    const meaningful = microphone.filter((word) => word.length >= 4 && !SHORT_REPLY_WORDS.has(word));
    return meaningful.length > 0 && orderedSubset(microphone, computer);
  }
  if (computer.length < 2) return false;
  const left = microphone.join(' ');
  const right = computer.join(' ');
  if (right.includes(left)) return true;
  if (left.includes(right)) return right.length >= left.length * 0.65;
  const leftCounts = new Map();
  const rightCounts = new Map();
  for (const word of microphone) leftCounts.set(word, (leftCounts.get(word) || 0) + 1);
  for (const word of computer) rightCounts.set(word, (rightCounts.get(word) || 0) + 1);
  let overlap = 0;
  for (const [word, count] of leftCounts) overlap += Math.min(count, rightCounts.get(word) || 0);
  return (2 * overlap) / (microphone.length + computer.length) >= 0.82;
}

function createAudioEchoFilter({ onEvent, delayMs = 900, historyMs = 8_000, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  if (typeof onEvent !== 'function') throw new TypeError('onEvent is required.');
  const computerHistory = [];
  const pending = new Set();

  function trim() {
    const cutoff = now() - historyMs;
    while (computerHistory[0]?.at < cutoff) computerHistory.shift();
  }

  function push(event) {
    if (event?.type !== 'transcript') { onEvent(event); return; }
    if (event.speaker === 'computer') {
      computerHistory.push({ text: event.text, at: now() });
      trim();
      onEvent(event);
      return;
    }
    if (event.speaker !== 'user') { onEvent(event); return; }
    const timer = schedule(() => {
      pending.delete(timer);
      trim();
      const recentComputerText = computerHistory.map((item) => item.text).join(' ');
      if (!isLikelyEcho(event.text, recentComputerText)) onEvent(event);
    }, delayMs);
    pending.add(timer);
  }

  function dispose() {
    for (const timer of pending) cancel(timer);
    pending.clear();
    computerHistory.length = 0;
  }

  return { push, dispose };
}

module.exports = { createAudioEchoFilter, isLikelyEcho, isLikelyAcousticEcho };
