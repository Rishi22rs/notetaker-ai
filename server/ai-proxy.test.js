const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const { createAIProxy, createLimiter, geminiPayload, transcriptionPayload } = require('./ai-proxy');

test('provider 429 distinguishes Cloudflare capacity, daily allocation and ordinary throttling', async () => {
 const { providerFailure, retryAfterSeconds } = require('./ai-proxy');
 for (const [code, reason, message] of [[3040, 'provider_capacity', /out of capacity/], [3036, 'provider_quota', /daily free allocation/], [9999, 'provider_rate_limit', /limiting requests/]]) {
   const upstream = Response.json({ errors: [{ code, message: 'private upstream message' }] }, { status: 429, headers: { 'retry-after': '12' } });
   const error = await providerFailure(upstream, 'cloudflare');
   assert.equal(error.status, 429); assert.equal(error.source, 'provider');
   assert.equal(error.reason, reason); assert.equal(error.providerCode, String(code));
   assert.equal(error.retryAfterSeconds, 12); assert.match(error.message, message);
   assert.doesNotMatch(error.message, /private upstream/);
 }
 const groq = await providerFailure(Response.json({ error: { code: 'rate_limit_exceeded' } }, { status: 429 }), 'groq');
 assert.equal(groq.providerCode, 'rate_limit_exceeded'); assert.equal(groq.reason, 'provider_rate_limit');
 assert.equal(retryAfterSeconds('Thu, 01 Jan 1970 00:00:12 GMT', 0), 12);
 assert.equal(retryAfterSeconds('garbage'), null);
});

test('backend 429 distinguishes active concurrency from the per-minute request cap', () => {
 const acquire = createLimiter({ perUserConcurrent: 1, perMinute: 2 });
 const release = acquire('u');
 assert.throws(() => acquire('u'), error => error.reason === 'backend_concurrency' && error.source === 'backend');
 release(); acquire('u')();
 assert.throws(() => acquire('u'), error => error.reason === 'backend_request_rate' && error.retryAfterSeconds > 0);
});
test('AI limiter enforces user concurrency, global concurrency and request count', () => {
 const take = createLimiter({ maxConcurrent: 2, perUserConcurrent: 1, perMinute: 2 });
 const a = take('a'); assert.throws(() => take('a'), e => e.status === 429);
 const b = take('b'); assert.throws(() => take('c'), e => e.status === 429); a(); a(); b();
 const next = take('a'); next(); assert.throws(() => take('a'), e => e.status === 429);
});
test('backend fixes model and output limits and rejects unsupported content', () => {
 const value = geminiPayload({ model: 'expensive', max_tokens: 100000, messages: [{ role: 'user', content: 'Hello' }], stream: true });
 assert.equal(value.model, 'gemini-3.5-flash-lite'); assert.equal(value.max_tokens, 4096);
 assert.equal(value.reasoning_effort, 'minimal');
 assert.equal(geminiPayload({ messages: [{role:'user',content:'Hi'}], response_format:{} }).reasoning_effort, 'minimal');
 assert.equal(geminiPayload({ messages: [{role:'user',content:'Hi'}], response_format:{} }).max_tokens,512);
 assert.throws(() => geminiPayload({messages:[{role:'admin',content:'Hi'}]}));
 assert.throws(() => transcriptionPayload({audio:'abc',model:'other'}));
});
function response() {
 const chunks=[]; const out=new Writable({write(chunk,_encoding,done){chunks.push(chunk.toString());done();}});
 out.writeHead=(status,headers)=>{out.status=status;out.headers=headers;};out.chunks=chunks;return out;
}
function audioBody(language = 'auto') {
 const { wavFromBytes } = require('../cloud-transcription');
 return { audio: wavFromBytes(Buffer.from(new Float32Array(16000).fill(0.1).buffer)).toString('base64'), model: 'whisper-large-v3-turbo', language };
}
test('Cloudflare provider sends validated base64 WAV and normalizes the API envelope', async () => {
 const events = []; let called = 0;
 const config = { transcriptionProvider: 'cloudflare', cloudflareAccountId: 'a'.repeat(32), cloudflareApiToken: 'private-cf-token' };
 const proxy = createAIProxy({ config, authorize: async (_user, token) => assert.equal(token, 'lease'), logger() {}, observer: event => events.push(event),
   fetchImpl: async (url, options) => {
     called++;
     assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/@cf/openai/whisper-large-v3-turbo`);
     assert.equal(options.headers.Authorization, 'Bearer private-cf-token');
     const body = JSON.parse(options.body);
     assert.equal(Buffer.from(body.audio, 'base64').toString('ascii', 0, 4), 'RIFF');
     assert.equal(body.task, 'transcribe'); assert.equal(body.condition_on_previous_text, false);
     assert.equal(body.initial_prompt, undefined); assert.equal(body.language, undefined);
     return Response.json({ success: true, result: { text: 'Hello from Cloudflare' } });
   }
 });
 const out = response();
 await proxy.handle({ request: { headers: { 'x-usage-token': 'lease' } }, response: out, user: { _id: 'u' }, kind: 'transcribe', readJson: async () => audioBody() });
 assert.equal(called, 1); assert.deepEqual(JSON.parse(out.chunks.join('')), { text: 'Hello from Cloudflare' });
 assert.ok(events.every(event => event.provider === 'cloudflare'));
 assert.equal(events.find(event => event.event === 'audio_chunk').audioSecondsEstimate, 1);
 assert.doesNotMatch(JSON.stringify(events), /private-cf-token|Hello from Cloudflare/);
});

test('provider selection retains Groq multipart requests and explicit language', async () => {
 let calls = 0;
 const proxy = createAIProxy({ config: { transcriptionProvider: 'groq', groqApiKey: 'groq-key' }, logger() {}, authorize: async () => {},
   fetchImpl: async (url, options) => {
     calls++; assert.match(url, /^https:\/\/api.groq.com\//);
     assert.equal(options.headers.Authorization, 'Bearer groq-key');
     assert.equal(options.body.get('language'), 'hi');
     return Response.json({ text: 'Hello' });
   }
 });
 await proxy.handle({ request: { headers: {} }, response: response(), user: { _id: 'u' }, kind: 'transcribe', readJson: async () => audioBody('hi') });
 assert.equal(calls, 1);
});

test('Cloudflare rejects missing credentials, malformed envelopes, quota errors and unpaid usage without fallback', async () => {
 const config = { transcriptionProvider: 'cloudflare', cloudflareAccountId: 'a'.repeat(32), cloudflareApiToken: 'key', groqApiKey: 'unused' };
 for (const [settings, upstream, expected, permitted] of [
   [{ ...config, cloudflareApiToken: '' }, null, 503, true],
   [{ ...config, cloudflareAccountId: 'invalid/id' }, null, 503, true],
   [config, { success: false, errors: [{ message: 'private error' }] }, 502, true],
   [config, { success: true, result: {} }, 502, true],
   [config, 429, 429, true],
   [config, 401, 502, true],
   [config, null, 402, false]
 ]) {
   let calls = 0;
   const proxy = createAIProxy({ config: settings, logger() {}, authorize: async () => { if (!permitted) throw Object.assign(new Error('Unpaid'), { status: 402 }); },
     fetchImpl: async url => { calls++; assert.match(url, /^https:\/\/api.cloudflare.com\//); return typeof upstream === 'number' ? new Response('', { status: upstream }) : Response.json(upstream); }
   });
   const out = response();
   await assert.rejects(proxy.handle({ request: { headers: {} }, response: out, user: { _id: 'u' }, kind: 'transcribe', readJson: async () => audioBody() }), error => error.status === expected);
   assert.equal(calls, expected === 503 || expected === 402 ? 0 : 1);
   assert.equal(out.status, undefined);
 }
 assert.throws(() => createAIProxy({ config: { transcriptionProvider: 'typo' } }), /TRANSCRIPTION_PROVIDER/);
});

test('Cloudflare language hints are passed only when selected and Gemini still uses its own provider', async () => {
 const { cloudflareRequest } = require('./transcription-provider');
 const config = { transcriptionProvider: 'cloudflare', cloudflareAccountId: 'b'.repeat(32), cloudflareApiToken: 'key', geminiApiKey: 'gemini-key' };
 assert.equal(JSON.parse(cloudflareRequest(config, audioBody('hi')).body).language, 'hi');
 const proxy = createAIProxy({ config, logger() {}, authorize: async () => {}, fetchImpl: async (url, options) => {
   assert.match(url, /generativelanguage.googleapis.com/); assert.equal(options.headers.Authorization, 'Bearer gemini-key');
   return Response.json({ choices: [{ message: { content: 'answer' } }] });
 } });
 await proxy.handle({ request: { headers: {} }, response: response(), user: { _id: 'u' }, kind: 'chat', readJson: async () => ({ messages: [{ role: 'user', content: 'Hi' }] }) });
});
test('unpaid session is rejected before reading audio or contacting provider', async () => {
 let called=false;
 const proxy=createAIProxy({config:{geminiApiKey:'secret'},authorize:async()=>{throw Object.assign(new Error('Exhausted'),{status:402});},fetchImpl:async()=>{called=true;}});
 await assert.rejects(proxy.handle({request:{headers:{'x-usage-token':'lease'}},response:response(),user:{_id:'u'},kind:'chat',readJson:async()=>({messages:[{role:'user',content:'Hello'}]})}), e=>e.status===402);
 assert.equal(called,false);
});
test('authenticated paid request forwards SSE with backend key and fixed payload', async () => {
 let checks=0;const out=response();
 const proxy=createAIProxy({config:{geminiApiKey:'backend-secret'},authorize:async(user,token)=>{assert.equal(token,'lease');checks++;},fetchImpl:async(url,options)=>{
 assert.match(url,/generativelanguage.googleapis.com/);assert.equal(options.headers.Authorization,'Bearer backend-secret');
 assert.equal(JSON.parse(options.body).model,'gemini-3.5-flash-lite');return new Response('data: hello\n\ndata: [DONE]\n\n');
 }});
 await proxy.handle({request:{headers:{'x-usage-token':'lease'}},response:out,user:{_id:'u'},kind:'chat',readJson:async()=>({stream:true,messages:[{role:'user',content:'Hello'}]})});
 assert.equal(checks,1);assert.equal(out.status,200);assert.match(out.chunks.join(''),/\[DONE\]/);
});

test('metrics parse split SSE usage without altering streamed bytes', async () => {
 const { createMetricsTap } = require('./ai-metrics');
 const { Readable } = require('node:stream');const { pipeline } = require('node:stream/promises');
 const input='data: {"choices":[{"delta":{"content":"private answer"}}]}\n\ndata: {"usage":{"prompt_tokens":123,"completion_tokens":45,"total_tokens":168}}\n\ndata: [DONE]\n\n';
 const metrics={responseBytes:0,outputCharacters:0,tokens:null};let first=0;const out=response();
 await pipeline(Readable.from([Buffer.from(input.slice(0,17)),Buffer.from(input.slice(17))]), createMetricsTap({streaming:true,metrics,firstToken:()=>first++}),out);
 assert.equal(out.chunks.join(''),input);assert.equal(first,1);assert.equal(metrics.outputCharacters,14);assert.deepEqual(metrics.tokens,{input:123,output:45,total:168,thinking:null});
});
test('transcription metrics record text length but never invent token counts', async () => {
 const { createMetricsTap } = require('./ai-metrics');const { Readable }=require('node:stream');const {pipeline}=require('node:stream/promises');
 const metrics={responseBytes:0,outputCharacters:0,tokens:null};
 await pipeline(Readable.from([Buffer.from('{"text":"hello"}')]),createMetricsTap({streaming:false,metrics,firstToken:()=>{}}),response());
 assert.equal(metrics.outputCharacters,5);assert.equal(metrics.tokens,null);
});

test('feedback permits 1–5 stars and optional suggestions, rejects invalid input', () => {
 const { feedbackFields }=require('./auth-server');
 for(let rating=1;rating<=5;rating++) assert.deepEqual(feedbackFields({rating}),{rating,suggestion:''});
 assert.deepEqual(feedbackFields({rating:4,suggestion:'  Nice  '}),{rating:4,suggestion:'Nice'});
 for(const rating of [0,6,2.5,'5',null]) assert.throws(()=>feedbackFields({rating}),e=>e.status===400);
 assert.throws(()=>feedbackFields({rating:5,suggestion:'x'.repeat(2001)}));
 assert.throws(()=>feedbackFields({rating:5,suggestion:{}}));
});

 test('transcription does not supply a prompt that can be echoed during silence', () => {
 const { wavFromBytes } = require('../cloud-transcription');
 const audio = wavFromBytes(Buffer.from(new Float32Array(16000).fill(0.1).buffer)).toString('base64');
 const form = transcriptionPayload({ audio, model: 'whisper-large-v3-turbo', language: 'auto' });
 assert.equal(form.get('prompt'), null);
 assert.equal(form.get('language'), null);
 assert.equal(form.get('model'), 'whisper-large-v3-turbo');
 });
