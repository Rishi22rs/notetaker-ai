function pcm16(bytes) {
  const output = Buffer.alloc(bytes.length / 2);
  for (let i = 0; i < output.length / 2; i++) {
    const value = Math.max(-1, Math.min(1, bytes.readFloatLE(i * 4) || 0));
    output.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), i * 2);
  }
  return output;
}

function createStreamingTranscription(publish, { openStream, getSettings }) {
  let running = false, controller, generation = 0;
  const channels = new Map();
  function stop() {
    running = false; generation++; controller?.abort();
    for (const value of channels.values()) value.stream?.close();
    channels.clear();
    publish({ type: 'partial-transcript', speaker: 'computer', text: '' });
  }
  function flush(channel) {
    while (channel.stream && channel.pending.length >= 8000) {
      channel.stream.send(channel.pending.subarray(0, 8000));
      channel.pending = channel.pending.subarray(8000);
    }
  }
  async function start(sources = { system: true, microphone: true }) {
    if (running) return;
    const language = getSettings().language || 'auto';
    if (!['en', 'auto'].includes(language)) throw new Error('AssemblyAI Universal-Streaming supports English. Select English or automatic language.');
    running = true; const id = ++generation; controller = new AbortController();
    const speakers = [sources.system && 'computer', sources.microphone && 'user'].filter(Boolean);
    if (!speakers.length) { stop(); throw new Error('Select an audio source.'); }
    for (const speaker of speakers) channels.set(speaker, { pending: Buffer.alloc(0), stream: null });
    try {
      for (const speaker of speakers) {
        const channel = channels.get(speaker);
        try {
          const stream = await openStream({ speaker, language, signal: controller.signal,
            onEvent: event => { if (running && generation === id) publish(event); },
            onClose: message => {
              if (!running || generation !== id) return;
              publish({ type: speaker === 'computer' ? 'error' : 'warning', streaming: true, text: `${speaker === 'computer' ? 'System audio' : 'Microphone'}: ${message}` });
              channel.stream?.close(); channels.delete(speaker);
              if (speaker === 'computer' || !channels.size) stop();
            }
          });
          if (!running || id !== generation) { stream.close(); return; }
          channel.stream = stream; flush(channel);
        } catch (error) {
          channels.delete(speaker);
          if (speaker === 'computer' || !sources.system || !running || generation !== id) throw error;
          publish({ type: 'warning', text: `Microphone context unavailable: ${error.message}. System transcription is still active.` });
        }
      }
      if (running && generation === id) publish({ type: 'ready', text: 'Listening · AssemblyAI live streaming · English' });
    } catch (error) { if (id === generation) stop(); throw error; }
  }
  function audio(speaker, bytes) {
    const channel = channels.get(speaker);
    if (!running || !channel) return;
    const raw = Buffer.from(bytes);
    if (!raw.length || raw.length % 4 || raw.length > 64000) return;
    try {
      channel.pending = Buffer.concat([channel.pending, pcm16(raw)]);
      // Keep only the latest half-second during connection setup, avoiding a
      // multi-second upload burst and stale captions when the handshake finishes.
      if (!channel.stream && channel.pending.length > 16000) channel.pending = channel.pending.subarray(-16000);
      flush(channel);
    } catch (error) { publish({ type: 'error', streaming: true, text: error.message }); stop(); }
  }
  return { start, audio, stop, dispose: stop };
}

module.exports = { createStreamingTranscription, pcm16 };
