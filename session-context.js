(function (root) {
  // Session details live only in memory. Only the global context is persisted.
  function createSessionContext() {
    let session = null;
    return {
      set(value) {
        session = { text: String(value?.text || ''), files: Array.isArray(value?.files) ? value.files.map(({ originalBase64, ...file }) => file) : [] };
      },
      clear() { session = null; },
      hasSession() { return session !== null; },
      combine(global = {}) {
        const globalText = String(global.text || '').trim();
        const sessionText = String(session?.text || '').trim();
        return {
          text: [globalText && `Global context:\n${globalText}`, sessionText && `Session context:\n${sessionText}`].filter(Boolean).join('\n\n'),
          files: [...(Array.isArray(global.files) ? global.files : []), ...(session?.files || [])]
        };
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSessionContext };
  else root.createSessionContext = createSessionContext;
})(typeof globalThis !== 'undefined' ? globalThis : this);
