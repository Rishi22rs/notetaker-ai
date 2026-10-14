const { Transform } = require('node:stream');
const { StringDecoder } = require('node:string_decoder');
function createMetricsTap({ streaming, metrics, firstToken }) {
  const decoder = new StringDecoder('utf8'); let buffered = ''; let first = false;
  function inspect(value) {
    try {
      const event = JSON.parse(value);
      if (event.usage) metrics.tokens = {
        input: event.usage.prompt_tokens ?? null, output: event.usage.completion_tokens ?? null,
        total: event.usage.total_tokens ?? null, thinking: event.usage.completion_tokens_details?.reasoning_tokens ?? null
      };
      const text = event.choices?.[0]?.delta?.content ?? event.choices?.[0]?.message?.content ?? event.text;
      if (typeof text === 'string' && text) {
        metrics.outputCharacters += text.length;
        if (!first) { first = true; firstToken(); }
      }
      const finish = event.choices?.[0]?.finish_reason;
      if (finish) metrics.finishReason = ['stop','length','content_filter','tool_calls'].includes(finish) ? finish : 'other';
    } catch { /* Incomplete/unrecognized provider metadata must not disrupt delivery. */ }
  }
  function consume() {
    if (!streaming) return;
    let end;
    while ((end = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, end).trim(); buffered = buffered.slice(end + 1);
      if (line.startsWith('data:') && line.slice(5).trim() !== '[DONE]') inspect(line.slice(5).trim());
    }
  }
  return new Transform({
    transform(chunk, _encoding, callback) {
      metrics.responseBytes += chunk.length;
      buffered += decoder.write(chunk); consume();
      // Only collect bounded metadata; never log provider text or audio.
      if (buffered.length > 1000000) buffered = '';
      callback(null, chunk);
    },
    flush(callback) {
      buffered += decoder.end();
      if (streaming) { buffered += '\n'; consume(); } else inspect(buffered);
      buffered = ''; callback();
    }
  });
}
module.exports = { createMetricsTap };
