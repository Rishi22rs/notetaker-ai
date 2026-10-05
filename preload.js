const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  platform: process.platform,
  getUserName: () => ipcRenderer.invoke('profile:name'),
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  loginWithGoogle: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  redeemCoupon: (code) => ipcRenderer.invoke('coupon:redeem', code),
  getPaymentPlans: () => ipcRenderer.invoke('payments:plans'),
  startRecharge: (planId) => ipcRenderer.invoke('payments:start', planId),
  getPaymentStatus: (id) => ipcRenderer.invoke('payments:status', id),
  getWallet: () => ipcRenderer.invoke('wallet:get'),
  startUsage: () => ipcRenderer.invoke('usage:start'),
  stopUsage: () => ipcRenderer.invoke('usage:stop'),
  getUsageStatus: () => ipcRenderer.invoke('usage:status'),
  completePermissionGate: () => ipcRenderer.send('permissions:complete'),
  requestSystemAudio: () => ipcRenderer.invoke('audio:permission'),
  startTranscription: (sources) => ipcRenderer.send('transcription:start', sources),
  stopTranscription: () => ipcRenderer.send('transcription:stop'),
  clearTranscription: () => ipcRenderer.send('transcription:clear'),
  sendTranscriptionAudio: (speaker, audio) => ipcRenderer.send('transcription:audio', { speaker, audio }),
  onTranscription(callback) { ipcRenderer.on('transcription:event', (_event, value) => callback(value)); },
  onUsageUpdate(callback) { ipcRenderer.on('usage:update', (_event, value) => callback(value)); },
  loadNotes: () => ipcRenderer.invoke('notes:load'),
  saveNotes: (content) => ipcRenderer.invoke('notes:save', content),
  loadContext: () => ipcRenderer.invoke('context:load'),
  saveContext: (value) => ipcRenderer.invoke('context:save', value),
  pickContextFiles: () => ipcRenderer.invoke('context:pick-files'),
  onInteraction(callback) {
    ipcRenderer.on('overlay:interactive', (_event, enabled) => callback(enabled));
  },
  listModels: () => ipcRenderer.invoke('local-ai:models'),
  getSuggestions: (request) => ipcRenderer.invoke('local-ai:suggestions', request),
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
      ipcRenderer.removeListener('local-ai:download-progress', onProgress);
      ipcRenderer.removeListener('local-ai:download-done', onDone);
      ipcRenderer.removeListener('local-ai:download-error', onError);
    };
    const onProgress = (_event, data) => { if (data.id === id) callbacks.onProgress(data); };
    const onDone = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onDone(); } };
    const onError = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onError(data.message); } };
    ipcRenderer.on('local-ai:download-progress', onProgress);
    ipcRenderer.on('local-ai:download-done', onDone);
    ipcRenderer.on('local-ai:download-error', onError);
    ipcRenderer.send('local-ai:download', { id, model });
  },
  chat(request, callbacks) {
    const id = crypto.randomUUID();
    const cleanup = () => {
      ipcRenderer.removeListener('local-ai:chunk', onChunk);
      ipcRenderer.removeListener('local-ai:done', onDone);
      ipcRenderer.removeListener('local-ai:error', onError);
    };
    const onChunk = (_event, data) => { if (data.id === id) callbacks.onChunk(data.content); };
    const onDone = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onDone(); } };
    const onError = (_event, data) => { if (data.id === id) { cleanup(); callbacks.onError(data.message); } };
    ipcRenderer.on('local-ai:chunk', onChunk);
    ipcRenderer.on('local-ai:done', onDone);
    ipcRenderer.on('local-ai:error', onError);
    ipcRenderer.send('local-ai:chat', { ...request, id });
    return () => { cleanup(); ipcRenderer.send('local-ai:cancel', id); };
  }
});
