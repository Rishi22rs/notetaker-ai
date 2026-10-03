const QUESTION_START = /^(what|why|how|when|where|who|which|whose|can|could|would|should|is|are|am|do|does|did|will|may|was|were|has|have|had)\b/i;
const INTERVIEW_COMMAND = /^(please\s+)?(explain|describe|discuss|compare|define|design|implement|code|solve|outline|demonstrate|tell me|talk (?:to me )?about|walk me through|give me (?:an example|a summary|your thoughts|(?:the |a )?(?:code|solution|implementation|function|method|program|algorithm|query))|write (?:the |a )?(?:code|solution|implementation|function|method|program|algorithm|query)|share (?:an example|a time))\b/i;
const CONVERSATIONAL_QUESTION = /\b(can you|could you|would you|will you|tell me|walk me through|help me understand)\b|^(?:(?:okay|right)[, ]+)?(?:so\s+)?(what|why|how|when|where|who|which)\b/i;
const EMBEDDED_QUESTION = /(?:^|[.!]\s+)(?:so\s+)?(?:what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did|will|has|have)\b/i;
const CODING_REQUEST = /\b(?:write|give|show|create|make|generate|provide|implement|code|build|solve)\b[\s\S]{0,100}\b(?:code|function|method|program|algorithm|implementation|solution|script|query)\b|\b(?:code|implement|solve)\s+(?:it|this|that|for|in|using|with)\b/i;
const CODING_FRAGMENT = /\b(?:shortest path|dijkstra|a\*|breadth first search|depth first search|binary search|sorting|linked list|binary tree|graph traversal|dynamic programming)\b[\s\S]{0,100}\b(?:code|function|program|algorithm|javascript|typescript|python|java|c\+\+|c#|golang|rust)\b|\bcode\b[\s\S]{0,60}\b(?:javascript|typescript|python|java|c\+\+|c#|golang|rust)\b/i;
const NON_QUESTION = /^(hello|hi|hey|okay|ok|great|good|right|sure|thanks|thank you|welcome|nice to meet you|let(?:'s| us) (?:begin|start|move on))[.!]?$/i;

function normalizeRuleText(value) {
  return String(value || '')
    .replace(/\bshorted\s+shortest\b/gi, 'Shortest')
    .replace(/\b(path|source|sample|example|function|program)(code)\b/gi, '$1 $2')
    .replace(/\bjava\s+script\b/gi, 'JavaScript')
    .replace(/\btype\s+script\b/gi, 'TypeScript')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCodingIntent(value) {
  const text = normalizeRuleText(value);
  return CODING_REQUEST.test(text) || CODING_FRAGMENT.test(text);
}

function inferType(text) {
  text = normalizeRuleText(text);
  if (/\b(tell me about a time|give me an example|conflict|challenge|failure|strength|weakness|leadership|team|stakeholder)\b/i.test(text)) return 'behavioral';
  if (/\b(system design|design (?:a|an|the)|scale|availability|distributed|database|cache|queue|load balanc|architecture)\b/i.test(text)) return 'system_design';
  if (/\b(code|coding|implement|implementation|algorithm|data structure|complexity|big[- ]?o|array|linked list|tree|graph|dynamic programming|write (?:a |the )?(?:function|method|program|query)|debug|refactor|leetcode|hackerrank)\b/i.test(text)) return 'coding';
  if (/\b(resume|résumé|project|experience|background|previous role|current role)\b/i.test(text)) return 'resume';
  if (/^(why|can you elaborate|could you clarify|what about|and how|and why)\b/i.test(text)) return 'follow_up';
  if (/\b(api|javascript|typescript|python|java|react|node|sql|http|network|thread|process|memory|security|cloud)\b/i.test(text)) return 'technical';
  return 'general';
}

function ruleDecision(value) {
  const text = normalizeRuleText(value);
  if (!text) return { decision: false, confidence: 1, type: 'general', reason: 'empty' };
  if (NON_QUESTION.test(text)) return { decision: false, confidence: 0.99, type: 'general', reason: 'acknowledgement' };
  if (/[?]\s*$/.test(text)) return { decision: true, confidence: 0.99, type: inferType(text), reason: 'question-mark' };
  if (hasCodingIntent(text)) return { decision: true, confidence: 0.99, type: 'coding', reason: 'coding-request' };
  if (QUESTION_START.test(text)) return { decision: true, confidence: 0.96, type: inferType(text), reason: 'question-form' };
  if (INTERVIEW_COMMAND.test(text)) return { decision: true, confidence: 0.96, type: inferType(text), reason: 'interview-command' };
  if (CONVERSATIONAL_QUESTION.test(text)) return { decision: true, confidence: 0.9, type: inferType(text), reason: 'conversational-question' };
  if (EMBEDDED_QUESTION.test(text)) return { decision: true, confidence: 0.94, type: inferType(text), reason: 'embedded-question' };
  if (text.split(' ').length <= 2) return { decision: false, confidence: 0.9, type: 'general', reason: 'short-fragment' };
  return { decision: null, confidence: 0.5, type: inferType(text), reason: 'ambiguous' };
}

async function detectQuestion({ turn, recentTurns = [], classify } = {}) {
  if (!turn || turn.speaker !== 'computer') {
    return { isQuestion: false, confidence: 1, type: 'general', source: 'speaker-filter' };
  }
  const rules = ruleDecision(turn.text);
  if (rules.decision !== null) {
    return {
      isQuestion: rules.decision,
      confidence: rules.confidence,
      type: rules.type,
      source: 'rules',
      reason: rules.reason
    };
  }
  if (typeof classify !== 'function') {
    return { isQuestion: false, confidence: 0.5, type: rules.type, source: 'fallback', reason: 'classifier-unavailable' };
  }
  try {
    const result = await classify({ turn, recentTurns: recentTurns.slice(-6) });
    return {
      isQuestion: result?.isQuestion === true,
      confidence: Math.max(0, Math.min(1, Number(result?.confidence) || 0)),
      type: ['behavioral', 'coding', 'system_design', 'technical', 'resume', 'follow_up', 'general'].includes(result?.type)
        ? result.type
        : rules.type,
      source: 'model',
      reason: String(result?.reason || '').slice(0, 160)
    };
  } catch {
    return { isQuestion: false, confidence: 0, type: rules.type, source: 'fallback', reason: 'classifier-error' };
  }
}

module.exports = { detectQuestion, inferType, ruleDecision, normalizeRuleText, hasCodingIntent };
