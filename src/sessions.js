// Keeps each learner's recent conversation in memory so Sulemani can follow the thread.
// Sessions expire after a period of inactivity and are lost if the server restarts,
// which is acceptable for the pilot (scores are always saved to the client's records).
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_TURNS = 10;

const sessions = new Map(); // key -> session

function key(clientId, phone) {
  return `${clientId}:${phone}`;
}

function getSession(clientId, phone) {
  const k = key(clientId, phone);
  let s = sessions.get(k);
  if (!s || Date.now() - s.lastSeen > SESSION_TTL_MS) {
    s = { history: [], pendingQuiz: null, recentQuestions: [], lastSeen: Date.now() };
    sessions.set(k, s);
  }
  s.lastSeen = Date.now();
  return s;
}

function addTurn(session, userText, assistantText) {
  session.history.push({ role: 'user', content: userText }, { role: 'assistant', content: assistantText });
  const excess = session.history.length - MAX_TURNS * 2;
  if (excess > 0) session.history.splice(0, excess);
}

function rememberQuestion(session, question) {
  session.recentQuestions.push(question);
  if (session.recentQuestions.length > 15) session.recentQuestions.shift();
}

// Remove expired sessions every 15 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.lastSeen > SESSION_TTL_MS) sessions.delete(k);
}, 15 * 60 * 1000).unref();

module.exports = { getSession, addTurn, rememberQuestion };
