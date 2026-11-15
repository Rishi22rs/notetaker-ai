const CLOUDFLARE_MODEL = '@cf/openai/whisper-large-v3-turbo';

function transcriptionProvider(config) {
  const provider = String(config.transcriptionProvider || 'groq').trim().toLowerCase();
  if (!['groq', 'cloudflare'].includes(provider)) throw new Error('TRANSCRIPTION_PROVIDER must be groq or cloudflare.');
  return provider;
}

function transcriptionConfigured(config) {
  return transcriptionProvider(config) === 'cloudflare'
    ? Boolean(config.cloudflareApiToken && /^[a-f0-9]{32}$/i.test(config.cloudflareAccountId || ''))
    : Boolean(config.groqApiKey);
}

function cloudflareRequest(config, body) {
  if (!transcriptionConfigured(config)) throw Object.assign(new Error('Set CLOUDFLARE_ACCOUNT_ID (32 hexadecimal characters) and CLOUDFLARE_API_TOKEN in the backend environment.'), { status: 503 });
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/${CLOUDFLARE_MODEL}`,
    headers: { Authorization: `Bearer ${config.cloudflareApiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ audio: body.audio, task: 'transcribe', condition_on_previous_text: false,
      ...(body.language && body.language !== 'auto' ? { language: body.language } : {}) })
  };
}

module.exports = { CLOUDFLARE_MODEL, transcriptionProvider, transcriptionConfigured, cloudflareRequest };
