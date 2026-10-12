const { usableSpeech, createTranscriptionQueue } = require('./transcription-audio');
const { providerError } = require('./cloud-ai');
function wavFromBytes(bytes) {
  const raw = Buffer.from(bytes);
  const wav = Buffer.alloc(44 + raw.length / 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < raw.length / 4; i++) {
    const sample = Math.max(-1, Math.min(1, raw.readFloatLE(i * 4) || 0));
    wav.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), 44 + i * 2);
  }
  return wav;
}
function createCloudTranscription(publish, { getSettings, fetchImpl = fetch }) {
  let running = false, generation = 0, controller, timer, settings;
  const buffers = new Map();
  const previous = new Map();
  const overlapBytes = 16000 * 4 / 2;
  const queue = createTranscriptionQueue({
    maxQueuedSeconds: 20,
    onError: error => { if (running) publish({ type: 'warning', text: error.message }); },
    onLag: () => publish({ type: 'warning', text: 'Cloud transcription is behind; older audio was skipped.' }),
    async processAudio(speaker, bytes, capturedAt) {
      if (!running) return;
      const id = generation;
      const form = new FormData();
      form.append('file', new Blob([wavFromBytes(bytes)], { type: 'audio/wav' }), `${speaker}.wav`);
      form.append('model', settings.groqModel); form.append('response_format', 'json');
      if (settings.language !== 'auto') form.append('language', settings.language);
      form.append('prompt', 'Interview conversation in Hindi and English. Preserve spoken language and technical terms: JavaScript, TypeScript, PostgreSQL, Kubernetes, Redis.');
      const response = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${settings.groqKey}` }, body: form,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)])
      });
      if (!response.ok) throw providerError('Groq', response.status);
      const result = await response.json();
      const text = String(result.text || '').trim();
      if (running && id === generation && text) publish({ type: 'transcript', speaker, text, capturedAt });
    }
  });
  function flush(speaker) {
    const item = buffers.get(speaker);
    buffers.delete(speaker);
    if (item) queue.enqueue(speaker, item.bytes, item.capturedAt);
  }
  function start() {
    if (running) return;
    settings = getSettings();
    if (!settings.groqKey) throw new Error('Add a Groq API key in AI & Models settings.');
    generation++; running = true; controller = new AbortController();
    timer = setInterval(() => {
      for (const [speaker, item] of buffers) if (Date.now() - item.startedAt >= settings.segmentSeconds * 1000) flush(speaker);
    }, 500);
    publish({ type: 'ready', text: `Listening · Groq ${settings.groqModel} · ${settings.language === 'auto' ? 'automatic language' : settings.language}` });
  }
  function audio(speaker, bytes) {
    if (!running || !['user', 'computer'].includes(speaker)) return;
    const raw = Buffer.from(bytes);
    if (!raw.length || raw.length % 4) return;
    const last = previous.get(speaker);
    previous.set(speaker, Buffer.from(raw));
    const overlaps = last && last.length >= overlapBytes && raw.length >= overlapBytes && last.subarray(-overlapBytes).equals(raw.subarray(0, overlapBytes));
    const newBytes = raw.subarray(overlaps ? overlapBytes : 0);
    const samples = new Float32Array(newBytes.length / 4);
    for (let i = 0; i < samples.length; i++) samples[i] = newBytes.readFloatLE(i * 4);
    const now = Date.now();
    const pending = buffers.get(speaker);
    if (!pending && !usableSpeech(samples)) return;
    const combined = pending ? Buffer.concat([pending.bytes, newBytes]) : Buffer.from(newBytes);
    buffers.set(speaker, { bytes: combined, capturedAt: now, startedAt: pending?.startedAt ?? now });
    if (combined.length >= settings.segmentSeconds * 16000 * 4) flush(speaker);
  }
  function stop() {
    running = false; generation++; clearInterval(timer); controller?.abort();
    queue.clear(); buffers.clear(); previous.clear();
    publish({ type: 'status', text: 'Stopped' });
  }
  return { start, stop, audio, dispose: stop };
}
module.exports = { createCloudTranscription, wavFromBytes };
