const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCloudAI } = require('./cloud-ai');
const { createCloudSettings } = require('./cloud-settings');
const { createCloudTranscription, wavFromBytes } = require('./cloud-transcription');
const tick = () => new Promise(resolve => setImmediate(resolve));
const speech = seconds => Buffer.from(new Float32Array(16000 * seconds).fill(0.1).buffer);

test('Gemini streams split UTF-8 SSE frames and ignores metadata', async () => {
  let payload;
  const encoder = new TextEncoder();
  const bytes = encoder.encode('data: {"choices":[{"delta":{"content":"नमस्ते"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n');
  const ai = createCloudAI({ getSettings: () => ({ geminiKey: 'test-key' }), fetchImpl: async (_url, request) => {
    payload = JSON.parse(request.body);
    return { ok: true, body: (async function* () { for (let i = 0; i < bytes.length; i += 3) yield bytes.slice(i, i + 3); })() };
  }});
  let answer = '';
  await new Promise((resolve, reject) => ai.chat({ messages: [{ role: 'user', content: 'Hi', images: ['secret-image'] }], onChunk: text => answer += text, onDone: resolve, onError: reject }));
  assert.equal(answer, 'नमस्ते'); assert.equal(payload.stream, true);
  assert.equal(payload.model, 'gemini-3.5-flash-lite');
  assert.equal(payload.reasoning_effort, 'low');
  assert.equal(payload.messages[0].images, undefined);
});

test('missing Gemini key sends no network request and 429 gives an actionable error', async () => {
  let calls = 0;
  const ai = createCloudAI({ getSettings: () => ({}), fetchImpl: () => { calls++; } });
  await assert.rejects(ai.complete({ messages: [] }), /API key/); assert.equal(calls, 0);
  const limited = createCloudAI({ getSettings: () => ({geminiKey:'key'}), fetchImpl: async () => ({ok:false,status:429}) });
  await assert.rejects(limited.complete({messages:[]}), /limit reached/);
});

test('cancellation suppresses late Gemini answers', async () => {
  let release, callbacks = 0;
  const ai = createCloudAI({ getSettings: () => ({geminiKey:'key'}), fetchImpl: () => new Promise(resolve => release = resolve) });
  const cancel = ai.chat({messages:[],onChunk:()=>callbacks++,onDone:()=>callbacks++,onError:()=>callbacks++});
  cancel(); release({ok:true,body:(async function*(){yield Buffer.from('data: {"choices":[{"delta":{"content":"late"},"finish_reason":"stop"}]}\n');})()});
  await tick(); assert.equal(callbacks, 0);
});

test('settings encrypt keys, redact responses, preserve blank UI updates and remove keys', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-settings-test-'));
  const safeStorage = {isEncryptionAvailable:()=>true, encryptString:text=>Buffer.from(text.split('').reverse().join('')), decryptString:bytes=>bytes.toString().split('').reverse().join('')};
  try {
    const store = createCloudSettings({userDataPath:dir,safeStorage}); await store.load();
    const response = await store.save({groqKey:'private-groq',geminiKey:'private-gemini',transcription:'groq'});
    assert.equal(response.groqKey, undefined); assert.equal(response.hasGroqKey, true);
    assert.ok(!(await fs.readFile(path.join(dir,'cloud-settings.json'),'utf8')).includes('private-groq'));
    const restored = createCloudSettings({userDataPath:dir,safeStorage}); await restored.load();
    assert.equal(restored.get().groqKey, 'private-groq');
    await restored.save({language:'hi'}); assert.equal(restored.get().geminiKey,'private-gemini');
    await assert.rejects(restored.save({groqModel:'unknown'}), /Invalid/);
    await restored.save({groqKey:'',geminiKey:'',transcription:'local'}); assert.equal(restored.publicSettings().hasGeminiKey,false);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('unavailable secure storage refuses to save provider secrets', async () => {
  const store = createCloudSettings({userDataPath:'/unused',safeStorage:{isEncryptionAvailable:()=>false}});
  await assert.rejects(store.save({geminiKey:'secret'}), /Secure key storage/);
});

test('Groq keeps speakers, removes capture overlap, skips silence and leaves mixed language automatic', async () => {
  const requests = [], events = [];
  const backend = createCloudTranscription(event=>events.push(event), {
    getSettings:()=>({groqKey:'test',groqModel:'whisper-large-v3-turbo',language:'auto',segmentSeconds:4}),
    fetchImpl:async (_url, request) => {requests.push(request); return {ok:true,json:async()=>({text:'Redis क्यों चुना?'})};}
  });
  try {
    backend.start(); backend.audio('user',Buffer.alloc(16000*4*2));
    backend.audio('computer',speech(2)); backend.audio('computer',speech(2)); backend.audio('computer',speech(2));
    await tick(); await tick();
    assert.equal(requests.length,1); assert.equal(requests[0].body.get('language'),null);
    assert.equal(requests[0].body.get('file').size,44 + 16000*2*4);
    assert.equal(events.find(event=>event.type==='transcript').speaker,'computer');
  } finally {backend.stop();}
});

test('stop aborts Groq and suppresses stale transcripts', async () => {
  const events=[]; let release, signal;
  const backend=createCloudTranscription(event=>events.push(event),{getSettings:()=>({groqKey:'key',groqModel:'whisper-large-v3',language:'hi',segmentSeconds:4}),fetchImpl:(_url,req)=>{signal=req.signal;return new Promise(resolve=>release=resolve);}});
  backend.start();backend.audio('user',speech(4));backend.stop();
  assert.equal(signal.aborted,true);release({ok:true,json:async()=>({text:'stale'})});await tick();
  assert.equal(events.some(event=>event.type==='transcript'),false);
});

test('WAV encodes clipped signed PCM samples and the expected sample rate', () => {
  const wav=wavFromBytes(Buffer.from(new Float32Array([-2,0,2]).buffer));
  assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readInt16LE(44),-32768);assert.equal(wav.readInt16LE(48),32767);
});

 test('Gemini 404 identifies unavailable model access', async () => {
  const ai = createCloudAI({ getSettings: () => ({geminiKey:'key'}), fetchImpl: async () => ({ok:false,status:404}) });
  await assert.rejects(ai.complete({messages:[]}), /model is unavailable/);
});

test('cloud-only models preserve chat, suggestions and classification', async () => {
  const { createCloudModels } = require('./cloud-models');
  const requests = [];
  const models = createCloudModels({ cloudAI: {
    chat: request => { requests.push(request); return () => {}; },
    complete: async request => request.messages[0].content.includes('autocomplete') ? JSON.stringify({ suggestions: ['What next?', 'Not a question'] }) : JSON.stringify({ isQuestion: true, type: 'technical' })
  } });
  assert.ok((await models.listModels()).every(model => model.cloud));
  assert.deepEqual(await models.suggest({ draft: 'How', context: { text: '', files: [] } }), ['What next?']);
  assert.equal((await models.classifyInterviewTurn({ turn: { text: 'What is React?' } })).isQuestion, true);
  const cancel = models.chat({ messages: [{ role: 'user', content: 'Hello' }] });
  assert.equal(typeof cancel, 'function');
  assert.equal(requests.length, 1);
});
