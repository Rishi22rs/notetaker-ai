function isChatGPT(url) {
  try { return new URL(url).origin === 'https://chatgpt.com'; } catch { return false; }
}

module.exports = function configureMedia(session, contents, isReady) {
  session.setPermissionRequestHandler((requester, permission, callback, details) => {
    callback(requester === contents && isReady() && permission === 'media'
      && isChatGPT(contents.getURL()) && isChatGPT(details.requestingUrl || details.securityOrigin)
      && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio');
  });
  session.setPermissionCheckHandler((requester, permission, origin, details) => {
    return requester === contents && isReady() && permission === 'media'
      && isChatGPT(contents.getURL()) && isChatGPT(origin) && details.mediaType === 'audio';
  });
};
