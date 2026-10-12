const fs = require('node:fs/promises');
const path = require('node:path');
const DEFAULTS = { transcription: 'local', groqModel: 'whisper-large-v3-turbo', language: 'auto', answerLanguage: 'English', segmentSeconds: 4, groqKey: '', geminiKey: '' };
function createCloudSettings({ userDataPath, safeStorage }) {
  const filename = path.join(userDataPath, 'cloud-settings.json');
  let value = { ...DEFAULTS };
  function publicSettings() {
    const { groqKey, geminiKey, ...settings } = value;
    return { ...settings, hasGroqKey: Boolean(groqKey), hasGeminiKey: Boolean(geminiKey) };
  }
  async function load() {
    let saved;
    try { saved = JSON.parse(await fs.readFile(filename, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return; throw new Error('Cloud settings could not be read.'); }
    const keys = {};
    for (const key of ['groqKey', 'geminiKey']) {
      if (saved[key]) keys[key] = safeStorage.decryptString(Buffer.from(saved[key], 'base64'));
    }
    value = validate({ ...DEFAULTS, ...saved, ...keys });
  }
  function validate(input) {
    if (!['local', 'groq'].includes(input.transcription) || !['whisper-large-v3', 'whisper-large-v3-turbo'].includes(input.groqModel) ||
      !['auto', 'en', 'hi'].includes(input.language) || !['auto', 'English', 'Hindi', 'Roman Hinglish'].includes(input.answerLanguage) || ![4, 10].includes(Number(input.segmentSeconds))) throw new Error('Invalid cloud settings.');
    const result = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, input[key]]));
    result.segmentSeconds = Number(result.segmentSeconds);
    result.answerLanguage = 'English';
    for (const key of ['groqKey', 'geminiKey']) result[key] = String(result[key] || '').trim().slice(0, 512);
    if (result.transcription === 'groq' && !result.groqKey) throw new Error('Add a Groq API key before enabling cloud transcription.');
    return result;
  }
  async function save(input) {
    const next = validate({ ...value, ...input });
    if ((next.groqKey || next.geminiKey) && (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text')) throw new Error('Secure key storage is unavailable on this computer.');
    const saved = { ...next };
    for (const key of ['groqKey', 'geminiKey']) saved[key] = next[key] ? safeStorage.encryptString(next[key]).toString('base64') : '';
    await fs.mkdir(userDataPath, { recursive: true });
    await fs.writeFile(`${filename}.tmp`, JSON.stringify(saved), { mode: 0o600 });
    await fs.rename(`${filename}.tmp`, filename);
    value = next;
    return publicSettings();
  }
  return { load, save, publicSettings, get: () => ({ ...value }) };
}
module.exports = { createCloudSettings };
