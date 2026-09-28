function mergeContextFiles(currentFiles, currentErrors, picked, limit = 20) {
  const valid = picked.filter((file) => !file.error);
  const errors = picked.filter((file) => file.error);
  return {
    files: [...currentFiles, ...valid].slice(0, limit),
    errors: [...currentErrors, ...errors]
  };
}

module.exports = { mergeContextFiles };
