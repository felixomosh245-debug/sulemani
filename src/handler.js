// The conversation logic. It does not know about WhatsApp: it takes an incoming message
// and returns the replies to send, so the same logic can later serve a web widget.
//
// Reply formats:
//   { type: 'text', body }
//   { type: 'buttons', body, buttons: [{ id, title }] }   (up to 3 buttons)
const tutor = require('./tutor');
const { getKnowledge } = require('./cache');
const { findLearner } = require('./router');
const { storageFor } = require('./storage');
const { getSession, addTurn, rememberQuestion } = require('./sessions');

const COMMANDS = {
  menu: ['menu', 'hi', 'hello', 'hey', 'start', 'help', 'habari', 'mambo', 'sasa'],
  quiz: ['quiz', 'test', 'test me', 'take a quiz', 'next', 'next question', 'another'],
  progress: ['progress', 'my progress', 'score', 'scores', 'results'],
  cancel: ['cancel', 'stop', 'skip'],
};

const MAIN_BUTTONS = [
  { id: 'quiz', title: 'Take a quiz' },
  { id: 'progress', title: 'My progress' },
];

function detectCommand(text, buttonId) {
  if (buttonId && COMMANDS[buttonId]) return buttonId;
  const t = (text || '').trim().toLowerCase().replace(/[.!?]+$/, '');
  for (const [cmd, words] of Object.entries(COMMANDS)) if (words.includes(t)) return cmd;
  return null;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

async function log(client, learner, activity, detail, score = '') {
  try {
    await storageFor(client).appendActivity(client, [
      new Date().toISOString(), learner.phone, learner.name, activity, detail, score,
    ]);
  } catch (err) {
    console.error(`[${client.id}] Could not write activity: ${err.message}`);
  }
}

function menu(client, learner) {
  return {
    type: 'buttons',
    body: `Hello ${firstName(learner.name)}! I'm *${client.tutorName}*, ${client.name}'s AI training coach for ${client.programmeDescription || 'your training'}.\n\nAsk me anything from your training material, or choose an option below.`,
    buttons: MAIN_BUTTONS,
  };
}

async function progress(client, learner) {
  const rows = (await storageFor(client).getActivity(client))
    .filter((r) => r[1] === learner.phone && r[3] === 'Quiz graded');
  if (!rows.length) {
    return { type: 'buttons', body: 'You haven\'t completed any quiz questions yet. Ready to start?', buttons: [MAIN_BUTTONS[0]] };
  }
  const scores = rows.map((r) => Number(r[5]) || 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passed = scores.filter((s) => s >= client.passMark).length;
  const lastFive = scores.slice(-5).join(', ');
  return {
    type: 'buttons',
    body: `*Your progress*\n\nQuestions answered: ${scores.length}\nPassed (${client.passMark}% or more): ${passed}\nAverage score: ${avg}%\nLast scores: ${lastFive}`,
    buttons: [{ id: 'quiz', title: 'Next question' }],
  };
}

async function handleIncoming({ from, text, buttonId, kind = 'text' }) {
  const found = await findLearner(from);
  if (!found) {
    return [{ type: 'text', body: 'Hello! This number is not enrolled in a training programme yet. Please ask your HR or sales manager to add you.' }];
  }
  const { client, learner } = found;

  if (learner.status && !['active', ''].includes(String(learner.status).trim().toLowerCase())) {
    return [{ type: 'text', body: 'Your training access is currently paused. Please speak to your manager.' }];
  }

  if (kind !== 'text' && !buttonId) {
    return [{ type: 'text', body: 'For now I can only read typed messages. Please type your question or answer.' }];
  }

  const session = getSession(client.id, learner.phone);
  const command = detectCommand(text, buttonId);

  if (command === 'menu') return [menu(client, learner)];
  if (command === 'progress') return [await progress(client, learner)];

  if (command === 'cancel') {
    const had = Boolean(session.pendingQuiz);
    session.pendingQuiz = null;
    return [{ type: 'buttons', body: had ? 'No problem, that question is skipped.' : 'Nothing to cancel.', buttons: MAIN_BUTTONS }];
  }

  const kb = await getKnowledge(client);

  if (command === 'quiz') {
    const q = await tutor.makeQuizQuestion(client, kb, session.recentQuestions);
    session.pendingQuiz = q;
    rememberQuestion(session, q.question);
    await log(client, learner, 'Quiz question', q.topic);
    return [{ type: 'text', body: `*Quiz: ${q.topic}*\n\n${q.question}\n\nType your answer in your own words, or type *skip*.` }];
  }

  if (session.pendingQuiz) {
    const quiz = session.pendingQuiz;
    session.pendingQuiz = null;
    const grade = await tutor.gradeAnswer(client, kb, quiz, text);
    const passed = grade.score >= client.passMark;
    await log(client, learner, 'Quiz graded', quiz.topic, grade.score);
    return [{
      type: 'buttons',
      body: `*Score: ${grade.score}%* ${passed ? '(passed)' : `(pass mark is ${client.passMark}%)`}\n\n${grade.feedback}`,
      buttons: [{ id: 'quiz', title: 'Next question' }, { id: 'menu', title: 'Menu' }],
    }];
  }

  const reply = await tutor.answerQuestion(client, kb, session.history, text);
  addTurn(session, text, reply);
  await log(client, learner, 'Question', client.logQuestionText ? text : '');
  return [{ type: 'text', body: reply }];
}

module.exports = { handleIncoming, detectCommand };
