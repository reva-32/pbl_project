const SENSITIVE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+?\d[\s().-]*){10,}/,
  /\b(?:\d{4}[\s-]?){3}\d{4}\b/,
  /\b[A-Z]{5}\d{4}[A-Z]\b/i, // PAN
  /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/i, // GSTIN
  /\b(?:aadhaar|aadhar|otp|one[- ]time password|password|passcode|api[_ -]?key|access[_ -]?token|secret key|private key)\b/i,
  /\b(?:account number|bank account|cvv|card number|routing number)\b/i,
];

const TRIVIAL_MESSAGE = /^(hi|hello|hey|thanks|thank you|ok|okay|great|got it|good morning|good afternoon|good evening|bye|goodbye)[!.\s]*$/i;

function shouldRetainConversationMessage(message) {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (text.length < 18 || text.length > 4000) return false;
  if (TRIVIAL_MESSAGE.test(text)) return false;
  // Fail closed: do not retain a message containing likely credentials or
  // direct contact/financial identifiers. The full message is skipped.
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return true;
}

function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-10)
    .filter((item) =>
      item &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.content === 'string' &&
      item.content.trim().length > 0
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 2000),
    }));
}

function isValidTurnId(value) {
  return typeof value === 'string' &&
    /^[a-f0-9-]{36}$/i.test(value);
}

module.exports = {
  shouldRetainConversationMessage,
  normalizeConversationHistory,
  isValidTurnId,
};
