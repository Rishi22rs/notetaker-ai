function buildContextMessages(messages, context = {}) {
  const files = Array.isArray(context.files) ? context.files : [];
  const textFiles = files.filter((file) => file.kind === 'text' && file.content);
  const images = files.filter((file) => file.kind === 'image' && file.content).map((file) => file.content).slice(0, 10);
  const parts = [
    String(context.text || '').trim(),
    ...textFiles.map((file) => `--- ${String(file.name || 'Reference file')} ---\n${String(file.content).slice(0, 500_000)}`)
  ].filter(Boolean);
  const result = messages.map((message) => ({ ...message }));
  if (!result.length) return result;
  const lastUserIndex = result.findLastIndex((message) => message.role === 'user');
  if (lastUserIndex < 0) return result;

  const hasContext = parts.length > 0 || images.length > 0;
  if (hasContext) {
    result.unshift({
      role: 'system',
      content: [
        'Use the user-provided context as relevant background that helps you understand the question and tailor the answer.',
        'The context is not an exclusive knowledge source and does not limit what you may answer.',
        'When the context does not contain the answer, answer normally using your general knowledge and reasoning.',
        'When context is relevant, incorporate it accurately. Do not invent context details or contradict explicit user-provided facts.'
      ].join(' ')
    });
  }
  if (parts.length) {
    const contextText = parts.join('\n\n').slice(0, 1_000_000);
    result[lastUserIndex + 1].content = [
      '<user_context>', contextText, '</user_context>', '',
      '<user_question>', result[lastUserIndex + 1].content, '</user_question>'
    ].join('\n');
  }
  if (images.length) result[lastUserIndex + 1].images = images;
  return result;
}

module.exports = { buildContextMessages };
