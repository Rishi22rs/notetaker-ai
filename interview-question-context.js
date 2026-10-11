(() => {
function cleanQuestionText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function looksLikeInterviewerQuestion(value) {
  const text = cleanQuestionText(value);
  if (!text || /^(?:hi|hello|okay|ok|sure|thanks|thank you)[.!]?$/i.test(text)) return false;
  return /\?|\b(?:what|why|how|when|where|who|which|can you|could you|would you|should we|do you|did you|tell me|explain|describe|compare|design|implement|write|show me|walk me through)\b/i.test(text);
}

function summarizeQuestionParts(value) {
  const text = cleanQuestionText(value);
  if (!text) return [];
  let parts = text.split(/\s+(?=\d+[.)]\s+)/).map((part) => part.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
  if (parts.length < 2) {
    const matches = [...text.matchAll(/[^?]+\?/g)];
    parts = matches.map((match) => match[0].trim());
    const tail = matches.length ? text.slice(matches.at(-1).index + matches.at(-1)[0].length).trim() : '';
    if (tail && parts.length) parts.push(tail);
  }
  if (parts.length < 2) parts = text.split(/\s+and\s+(?=(?:what|why|how|when|where|who|which|can|could|would|should)\b)/i).map((part) => part.trim());
  return (parts.length ? parts : [text]).filter(Boolean).slice(0, 5);
}

function selectLatestInterviewerQuestion(turns, liveText = '', liveCapturedAt = 0) {
  const computerTurns = (Array.isArray(turns) ? turns : []).filter((turn) => turn?.speaker === 'computer');
  const confirmed = [...computerTurns].reverse().find((turn) => turn.detection?.isQuestion);
  const latest = computerTurns.at(-1);
  const live = cleanQuestionText(liveText);
  const confirmedIndex = confirmed ? computerTurns.indexOf(confirmed) : -1;
  if (latest && computerTurns.length - 1 > confirmedIndex && looksLikeInterviewerQuestion(latest.text))
    return { turn: latest, text: cleanQuestionText(latest.text) };
  if (looksLikeInterviewerQuestion(live) && Number(liveCapturedAt) > (Number(latest?.endedAt) || Number(latest?.startedAt) || 0) + 500 &&
    cleanQuestionText(latest?.text).toLowerCase() !== live.toLowerCase())
    return { turn: null, text: live };
  if (confirmed) return { turn: confirmed, text: cleanQuestionText(confirmed.text) };
  if (looksLikeInterviewerQuestion(live)) return { turn: null, text: live };
  return null;
}

const api = { looksLikeInterviewerQuestion, selectLatestInterviewerQuestion, summarizeQuestionParts };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.interviewQuestionContext = api;
})();
