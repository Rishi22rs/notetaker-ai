const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 4;

function usableSpeech(samples) {
  let sum = 0;
  let peak = 0;
  for (const value of samples) {
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return samples.length >= SAMPLE_RATE / 4 &&
    Math.sqrt(sum / samples.length) >= 0.003 && peak >= 0.012;
}

// One inference at a time. Merge waiting windows by speaker, removing their
// shared half-second overlap, rather than accumulating promises/stdin writes.
function createTranscriptionQueue({ processAudio, onError = () => {}, onLag = () => {}, maxQueuedSeconds = 8 }) {
  const overlapBytes = SAMPLE_RATE * BYTES_PER_SAMPLE / 2;
  const maximumBytes = SAMPLE_RATE * BYTES_PER_SAMPLE * maxQueuedSeconds;
  let pending = [];
  let busy = false;
  let generation = 0;
  let warned = false;

  async function drain() {
    if (busy || !pending.length) return;
    busy = true;
    const id = generation;
    const item = pending.shift();
    try {
      await processAudio(item.speaker, item.bytes, item.capturedAt);
    } catch (error) {
      if (id === generation) onError(error);
    } finally {
      if (id === generation) {
        busy = false;
        if (!pending.length) warned = false;
        void drain();
      }
    }
  }

  function enqueue(speaker, bytes, capturedAt = Date.now()) {
    const raw = Buffer.from(bytes);
    if (!raw.length || raw.length % BYTES_PER_SAMPLE) return;
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / BYTES_PER_SAMPLE);
    if (!usableSpeech(samples)) return;
    const index = pending.findIndex(item => item.speaker === speaker);
    let combined = raw;
    if (index >= 0) {
      const previous = pending.splice(index, 1)[0].bytes;
      const overlap = previous.length >= overlapBytes && raw.length >= overlapBytes &&
        previous.subarray(-overlapBytes).equals(raw.subarray(0, overlapBytes));
      combined = Buffer.concat([previous, raw.subarray(overlap ? overlapBytes : 0)]);
    }
    if (combined.length > maximumBytes) {
      combined = Buffer.from(combined.subarray(-maximumBytes));
      if (!warned) {
        warned = true;
        onLag();
      }
    }
    pending.push({ speaker, bytes: combined, capturedAt });
    void drain();
  }

  function clear() {
    generation += 1;
    pending = [];
    busy = false;
    warned = false;
  }

  return { enqueue, clear };
}

module.exports = { usableSpeech, createTranscriptionQueue };
