const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chunkText, inferContextLanguages, retrieveInterviewContext } = require('./context-retriever');

test('chunks long documents with overlap', () => {
  const text = Array.from({ length: 1000 }, (_, index) => `word${index}`).join(' ');
  const chunks = chunkText(text, { targetWords: 100, overlapWords: 20 });
  assert.equal(chunks.length, 13);
  assert.match(chunks[1], /^word80 /);
});

test('retrieves the document relevant to the interview question', () => {
  const result = retrieveInterviewContext({
    question: 'How did you improve Redis cache performance?',
    context: {
      text: 'Candidate prefers concise answers.',
      files: [
        { name: 'resume.txt', kind: 'text', content: 'Built a Redis caching layer and reduced API latency by forty percent.' },
        { name: 'hobbies.txt', kind: 'text', content: 'Enjoys landscape photography and playing acoustic guitar.' }
      ]
    }
  });
  assert.equal(result.chunks[0].source, 'resume.txt');
  assert.match(result.chunks[0].text, /Redis caching/);
  assert.equal(result.profile, 'Candidate prefers concise answers.');
  assert.equal(result.chunks.some((chunk) => chunk.source === 'hobbies.txt'), false);
});

test('enforces context and dialogue budgets', () => {
  const result = retrieveInterviewContext({
    question: 'Explain database scaling',
    context: { files: [{ name: 'large.txt', kind: 'text', content: 'database scaling '.repeat(2000) }] },
    recentTurns: Array.from({ length: 20 }, (_, index) => ({ speaker: index % 2 ? 'user' : 'computer', text: `turn ${index}` })),
    maxChunks: 3,
    maxChars: 1000
  });
  assert.ok(result.chunks.length <= 3);
  assert.ok(result.stats.selectedChars <= 1000);
  assert.equal(result.recentTurns.length, 8);
  assert.equal(result.recentTurns[0].text, 'turn 12');
});

test('returns no arbitrary document chunks when nothing matches', () => {
  const result = retrieveInterviewContext({
    question: 'Explain Kubernetes orchestration',
    context: { files: [{ name: 'cooking.txt', kind: 'text', content: 'Sourdough flour hydration recipe.' }] }
  });
  assert.deepEqual(result.chunks, []);
});

test('detects programming languages from saved context filenames', () => {
  const context = { files: [
    { name: 'service.ts', kind: 'text', content: 'export function serve() {}' },
    { name: 'worker.py', kind: 'text', content: 'def work(): pass' },
    { name: 'notes.txt', kind: 'text', content: 'General notes' }
  ] };
  assert.deepEqual(inferContextLanguages(context), ['TypeScript', 'Python']);
  assert.deepEqual(retrieveInterviewContext({ question: 'Implement the service', context }).contextLanguages, ['TypeScript', 'Python']);
});
