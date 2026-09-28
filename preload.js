const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  platform: process.platform,
  startTranscription: () => ipcRenderer.send('transcription:start'),
  stopTranscription: () => ipcRenderer.send('transcription:stop'),
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
