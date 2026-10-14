const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const { createAIProxy, createLimiter, geminiPayload, transcriptionPayload } = require('./ai-proxy');
test('AI limiter enforces user concurrency, global concurrency and request count', () => {
 const take = createLimiter({ maxConcurrent: 2, perUserConcurrent: 1, perMinute: 2 });
 const a = take('a'); assert.throws(() => take('a'), e => e.status === 429);
 const b = take('b'); assert.throws(() => take('c'), e => e.status === 429); a(); a(); b();
 const next = take('a'); next(); assert.throws(() => take('a'), e => e.status === 429);
});
test('backend fixes model and output limits and rejects unsupported content', () => {
 const value = geminiPayload({ model: 'expensive', max_tokens: 100000, messages: [{ role: 'user', content: 'Hello' }], stream: true });
 assert.equal(value.model, 'gemini-3.5-flash-lite'); assert.equal(value.max_tokens, 4096);
 assert.equal(geminiPayload({ messages: [{role:'user',content:'Hi'}], response_format:{} }).max_tokens,512);
 assert.throws(() => geminiPayload({messages:[{role:'admin',content:'Hi'}]}));
 assert.throws(() => transcriptionPayload({audio:'abc',model:'other'}));
});
function response() {
 const chunks=[]; const out=new Writable({write(chunk,_encoding,done){chunks.push(chunk.toString());done();}});
 out.writeHead=(status,headers)=>{out.status=status;out.headers=headers;};out.chunks=chunks;return out;
}
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
