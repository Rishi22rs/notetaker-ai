const { CLOUD_MODEL } = require('./cloud-ai');
function createCloudModels({ cloudAI }) {
  const complete = request => cloudAI.complete(request);
  async function suggest({ model, draft, context, transcript = '' }) {
    const textFiles = (context.files || []).filter((file) => file.kind === 'text' && file.content);
    const contextText = [String(context.text || '').trim(), ...textFiles.map((file) => `--- ${file.name} ---\n${file.content}`)].filter(Boolean).join('\n\n').slice(0, 60_000);
    const content = ['Generate exactly 3 likely autocomplete QUESTIONS in English the user may want to ask next.', 'Return questions only. Never answer the question, provide facts, explanations, recommendations, or declarative statements.', 'Each suggestion must be a complete, natural question ending with a question mark.', 'Return only JSON in this form: {"suggestions":["...","...","..."]}.', '', '<saved_context>', contextText, '</saved_context>', '', '<recent_transcript>', String(transcript).slice(-20_000), '</recent_transcript>', '', '<draft>', draft, '</draft>'].join('\n');
    const parsed = JSON.parse(await complete({ model, messages: [{ role: 'user', content }], temperature: 0.35 }) || '{}');
    return Array.isArray(parsed.suggestions) ? parsed.suggestions.map((value) => String(value).replace(/\s+/g, ' ').trim()).filter((value) => value.endsWith('?') && value.length <= 100).slice(0, 3) : [];
  }

  async function classifyInterviewTurn({ model, turn, recentTurns = [] }) {
    const dialogue = recentTurns.slice(-6).map((item) => `${item.speaker === 'user' ? 'Candidate' : 'Interviewer'}: ${String(item.text || '').slice(0, 2000)}`).join('\n');
    const content = ['Classify whether the final interviewer utterance asks the candidate to respond.', 'Choose one type: behavioral, coding, system_design, technical, resume, follow_up, general.', 'Return only JSON: {"isQuestion":true,"confidence":0.0,"type":"general","reason":"short reason"}.', '', '<recent_dialogue>', dialogue, '</recent_dialogue>', '', '<interviewer_utterance>', String(turn?.text || '').slice(0, 5000), '</interviewer_utterance>'].join('\n');
    return JSON.parse(await complete({ model, messages: [{ role: 'user', content }], temperature: 0 }) || '{}');
  }

  return { listModels: async () => [{ name: CLOUD_MODEL, displayName: 'Gemini 3.5 Flash-Lite', description: 'Cloud · Requires Gemini API key', cloud: true }], suggest, classifyInterviewTurn, chat: request => cloudAI.chat(request) };
}
module.exports = { createCloudModels };
