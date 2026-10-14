const test = require('node:test');
const assert = require('node:assert/strict');
const { createSpeechChunker } = require('./speech-chunker');
function audio(seconds, amplitude = 0) {
 const samples = new Float32Array(Math.round(seconds * 16000));
 for (let i=0;i<samples.length;i++) samples[i]=Math.sin(i*.17)*amplitude;
 return Buffer.from(samples.buffer);
}
test('silence produces no requests and quiet speech retains its beginning', () => {
 const sent=[];const chunker=createSpeechChunker({emit:bytes=>sent.push(bytes)});
 chunker.audio(audio(3));chunker.idle();assert.equal(sent.length,0);
 const quiet=audio(.5,.004);chunker.audio(quiet);chunker.audio(audio(1));
 assert.equal(sent.length,1);
 assert.ok(sent[0].includes(quiet));
 assert.ok(sent[0].length <= 16000*4*1.02);
});
test('continuous speech is bounded and carries boundary audio into the next chunk', () => {
 const sent=[];const chunker=createSpeechChunker({segmentSeconds:4,emit:bytes=>sent.push(bytes)});
 chunker.audio(audio(8,.03));chunker.idle();
 assert.ok(sent.length>=2);
 assert.ok(sent.every(bytes=>bytes.length<=16000*4*4));
 const tail=sent[0].subarray(-16000*4*.2);
 assert.ok(sent[1].subarray(0,tail.length).equals(tail));
});
test('a short click is rejected and state clears on stop', () => {
 const sent=[];const chunker=createSpeechChunker({emit:bytes=>sent.push(bytes)});
 chunker.audio(audio(.02,.5));chunker.audio(audio(1));assert.equal(sent.length,0);
 chunker.audio(audio(.5,.03));chunker.clear();chunker.idle();assert.equal(sent.length,0);
});
test('arbitrary audio frame boundaries preserve speech bytes', () => {
 const sent=[];const chunker=createSpeechChunker({emit:bytes=>sent.push(bytes)});const bytes=audio(.5,.03);
 for(let offset=0;offset<bytes.length;offset+=100) chunker.audio(bytes.subarray(offset,offset+100));
 chunker.idle();assert.equal(sent.length,1);assert.ok(sent[0].equals(bytes));
});
