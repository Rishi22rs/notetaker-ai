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

  if (parts.length) {
    const contextText = parts.join('\n\n').slice(0, 1_000_000);
    result.unshift({
      role: 'system',
      content: 'The user-provided context below is authoritative. Use it to answer the user’s question directly. Do not claim that the information is unavailable when it appears in this context.'
    });
    result[lastUserIndex + 1].content = [
      '<user_context>', contextText, '</user_context>', '',
      '<user_question>', result[lastUserIndex + 1].content, '</user_question>'
    ].join('\n');
  }
  if (images.length) result[lastUserIndex + (parts.length ? 1 : 0)].images = images;
  return result;
}

module.exports = { buildContextMessages };
