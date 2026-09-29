const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  platform: process.platform,
  completePermissionGate: () => ipcRenderer.send('permissions:complete'),
  requestSystemAudio: () => ipcRenderer.invoke('audio:permission'),
  startTranscription: (sources) => ipcRenderer.send('transcription:start', sources),
  stopTranscription: () => ipcRenderer.send('transcription:stop'),
  clearTranscription: () => ipcRenderer.send('transcription:clear'),
  sendTranscriptionAudio: (speaker, audio) => ipcRenderer.send('transcription:audio', { speaker, audio }),
  onTranscription(callback) { ipcRenderer.on('transcription:event', (_event, value) => callback(value)); },
  loadNotes: () => ipcRenderer.invoke('notes:load'),
  saveNotes: (content) => ipcRenderer.invoke('notes:save', content),
  loadContext: () => ipcRenderer.invoke('context:load'),
  saveContext: (value) => ipcRenderer.invoke('context:save', value),
  pickContextFiles: () => ipcRenderer.invoke('context:pick-files'),
  onInteraction(callback) {
    ipcRenderer.on('overlay:interactive', (_event, enabled) => callback(enabled));
  },
  listModels: () => ipcRenderer.invoke('ollama:models'),
  getSuggestions: (request) => ipcRenderer.invoke('ollama:suggestions', request),
  detectInterviewQuestion: (request) => ipcRenderer.invoke('interview:detect-question', request),
  retrieveInterviewContext: (request) => ipcRenderer.invoke('interview:retrieve-context', request),
  generateInterviewAnswer(request, callbacks) {
    const id = crypto.randomUUID();
    const cleanup = () => {
      ipcRenderer.removeListener('interview:answer-chunk', onChunk);
      ipcRenderer.removeListener('interview:answer-done', onDone);
      ipcRenderer.removeListener('interview:answer-error', onError);
    };
    const onChunk = (_event, data) => { if (data.id === id) callbacks.onChunk(data.content); };
    const onDone = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onDone(); } };
    const onError = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onError(data.message); } };
    ipcRenderer.on('interview:answer-chunk', onChunk);
    ipcRenderer.on('interview:answer-done', onDone);
    ipcRenderer.on('interview:answer-error', onError);
    ipcRenderer.send('interview:answer', { ...request, id });
    return () => { cleanup(); ipcRenderer.send('interview:cancel-answer', id); };
  },
  pullModel(model, callbacks) {
    const id = crypto.randomUUID();
    const cleanup = () => {
      ipcRenderer.removeListener('ollama:pull-progress', onProgress);
      ipcRenderer.removeListener('ollama:pull-done', onDone);
      ipcRenderer.removeListener('ollama:pull-error', onError);
    };
    const onProgress = (_event, data) => { if (data.id === id) callbacks.onProgress(data); };
    const onDone = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onDone(); } };
    const onError = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onError(data.message); } };
    ipcRenderer.on('ollama:pull-progress', onProgress);
    ipcRenderer.on('ollama:pull-done', onDone);
    ipcRenderer.on('ollama:pull-error', onError);
    ipcRenderer.send('ollama:pull', { id, model });
  },
  chat(request, callbacks) {
    const id = crypto.randomUUID();
    const cleanup = () => {
      ipcRenderer.removeListener('ollama:chunk', onChunk);
      ipcRenderer.removeListener('ollama:done', onDone);
      ipcRenderer.removeListener('ollama:error', onError);
    };
    const onChunk = (_event, data) => { if (data.id === id) callbacks.onChunk(data.content); };
    const onDone = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onDone(); } };
    const onError = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onError(data.message); } };
    ipcRenderer.on('ollama:chunk', onChunk);
    ipcRenderer.on('ollama:done', onDone);
    ipcRenderer.on('ollama:error', onError);
    ipcRenderer.send('ollama:chat', { ...request, id });
    return () => { cleanup(); ipcRenderer.send('ollama:cancel', id); };
  }
});
