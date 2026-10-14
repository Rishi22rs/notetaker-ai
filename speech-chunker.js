const RATE = 16000;
const FRAME_BYTES = RATE * 4 * 0.02;
// Energy gating is deliberately conservative: it is not a speech recognizer.
// Keep quiet speech and pre-roll; constant background noise may still pass.
function createSpeechChunker({ segmentSeconds = 4, emit }) {
  const maxBytes = Math.max(1, segmentSeconds) * RATE * 4;
  const preRollBytes = RATE * 4 * 0.2;
  const tailBytes = RATE * 4 * 0.3;
  const pauseBytes = RATE * 4 * 0.7;
  const minimumSpeechBytes = RATE * 4 * 0.08;
  let remainder = Buffer.alloc(0), preRoll = Buffer.alloc(0), frames = [], length = 0, silence = 0, speech = 0, capturedAt;
  function flush() {
    if (speech >= minimumSpeechBytes) {
      const bytes = Buffer.concat(frames);
      emit(bytes, capturedAt);
      preRoll = Buffer.from(bytes.subarray(-preRollBytes));
    }
    frames = []; length = 0; silence = 0; speech = 0;
  }
  function frame(raw, now) {
    let sum = 0, peak = 0;
    for (let i = 0; i < raw.length; i += 4) {
      const sample = raw.readFloatLE(i);
      if (!Number.isFinite(sample)) continue;
      sum += sample * sample; peak = Math.max(peak, Math.abs(sample));
    }
    const voiced = Math.sqrt(sum / (raw.length / 4)) >= 0.0015 && peak >= 0.003;
    if (voiced) {
      if (!frames.length) { frames.push(preRoll); length = preRoll.length; capturedAt = now; }
      frames.push(raw); length += raw.length; speech += raw.length; silence = 0;
    } else if (frames.length) {
      silence += raw.length;
      if (silence <= tailBytes) { frames.push(raw); length += raw.length; }
      if (silence >= pauseBytes) flush();
    }
    preRoll = Buffer.from(Buffer.concat([preRoll, raw]).subarray(-preRollBytes));
    if (length >= maxBytes) flush();
  }
  return {
    audio(bytes, now = Date.now()) {
      const raw = Buffer.concat([remainder, bytes]);
      let offset = 0;
      while (offset + FRAME_BYTES <= raw.length) { frame(Buffer.from(raw.subarray(offset, offset + FRAME_BYTES)), now); offset += FRAME_BYTES; }
      remainder = Buffer.from(raw.subarray(offset));
    },
    idle() { flush(); },
    clear() { remainder = Buffer.alloc(0); preRoll = Buffer.alloc(0); frames = []; length = 0; silence = 0; speech = 0; }
  };
}
module.exports = { createSpeechChunker };
