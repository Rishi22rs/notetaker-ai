const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its',
  'me', 'my', 'of', 'on', 'or', 'our', 'please', 'she', 'should', 'so', 'that', 'the', 'their', 'them',
  'they', 'this', 'to', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
  'will', 'with', 'would', 'you', 'your'
]);

function tokenize(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9][a-z0-9+#._-]{1,}/g)?.filter((word) => !STOP_WORDS.has(word)) || [];
}

function chunkText(text, { targetWords = 420, overlapWords = 60 } = {}) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  const step = Math.max(1, targetWords - overlapWords);
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + targetWords);
    if (!slice.length) break;
    chunks.push(slice.join(' '));
    if (start + targetWords >= words.length) break;
  }
  return chunks;
}

function buildChunks(context = {}) {
  const documents = [];
  const profile = String(context.text || '').trim();
  if (profile) documents.push({ source: 'Profile and instructions', kind: 'profile', content: profile });
  for (const file of Array.isArray(context.files) ? context.files : []) {
    if (file?.kind === 'text' && String(file.content || '').trim()) {
      documents.push({ source: String(file.name || 'Reference file').slice(0, 240), kind: 'file', content: String(file.content) });
    }
  }
  return documents.flatMap((document) => chunkText(document.content).map((text, index) => ({
    id: `${document.kind}:${document.source}:${index}`,
    source: document.source,
    kind: document.kind,
    index,
    text
  })));
}

function rankChunks(question, chunks) {
  const queryTerms = [...new Set(tokenize(question))];
  if (!queryTerms.length || !chunks.length) return [];
  const tokenized = chunks.map((chunk) => tokenize(chunk.text));
  const documentFrequency = new Map();
  for (const words of tokenized) {
    for (const word of new Set(words)) documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
  }
  const averageLength = tokenized.reduce((sum, words) => sum + words.length, 0) / tokenized.length || 1;
  return chunks.map((chunk, index) => {
    const words = tokenized[index];
    const frequencies = new Map();
    for (const word of words) frequencies.set(word, (frequencies.get(word) || 0) + 1);
    let score = 0;
    const matchedTerms = [];
    for (const term of queryTerms) {
      const frequency = frequencies.get(term) || 0;
      if (!frequency) continue;
      const idf = Math.log(1 + (chunks.length - (documentFrequency.get(term) || 0) + 0.5) / ((documentFrequency.get(term) || 0) + 0.5));
      const normalized = frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * words.length / averageLength));
      score += idf * normalized;
      matchedTerms.push(term);
    }
    if (chunk.kind === 'profile' && matchedTerms.length) score *= 1.12;
    return { ...chunk, score, matchedTerms };
  }).filter((chunk) => chunk.score > 0).sort((left, right) => right.score - left.score);
}

function retrieveInterviewContext({ question, context = {}, recentTurns = [], maxChunks = 5, maxChars = 12_000 } = {}) {
  const ranked = rankChunks(question, buildChunks(context));
  const profile = String(context.text || '').replace(/\s+/g, ' ').trim().slice(0, Math.min(4000, maxChars));
  const selected = [];
  let usedChars = profile.length;
  for (const chunk of ranked) {
    if (selected.length >= maxChunks) break;
    const remaining = maxChars - usedChars;
    if (remaining < 100) break;
    const text = chunk.text.slice(0, remaining);
    selected.push({ source: chunk.source, kind: chunk.kind, index: chunk.index, text, score: Number(chunk.score.toFixed(4)) });
    usedChars += text.length;
  }
  const dialogue = recentTurns.slice(-8).map((turn) => ({
    speaker: turn?.speaker === 'computer' ? 'computer' : 'user',
    text: String(turn?.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
  })).filter((turn) => turn.text);
  return {
    question: String(question || '').trim().slice(0, 5000),
    profile,
    chunks: selected,
    recentTurns: dialogue,
    stats: { availableChunks: ranked.length, selectedChunks: selected.length, selectedChars: usedChars }
  };
}

module.exports = { buildChunks, chunkText, rankChunks, retrieveInterviewContext, tokenize };
