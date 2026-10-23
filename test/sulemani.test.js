// Tests that run without any API keys. Claude is replaced with a stand-in.
//   npm test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { setClients, getClients } = require('../src/config');
const { normalisePhone } = require('../src/phone');
const { isValidSignature, extractMessages, toPayloads } = require('../src/whatsapp');

// Use a throwaway activity file so tests don't touch real records.
const activityCsv = 'data/test-activity.csv';
const clients = getClients().map((c) => ({ ...c, local: { ...c.local, activityCsv } }));
setClients(clients);
fs.rmSync(path.resolve(__dirname, '..', activityCsv), { force: true });

// Stand-in for Claude.
const tutor = require('../src/tutor');
tutor.answerQuestion = async (_c, kb, _h, q) => `ANSWER to "${q}" using ${kb.files.length} files`;
tutor.makeQuizQuestion = async () => ({ topic: 'PAYG rules', question: 'When does a PAYG system lock?', model_answer: 'After 3 days of missed payment.', key_points: ['3 days'] });
tutor.gradeAnswer = async (_c, _kb, _q, answer) => ({ score: /3/.test(answer) ? 90 : 20, feedback: 'Feedback here.', missed_points: [] });

const { handleIncoming, detectCommand } = require('../src/handler');

test('phone numbers are normalised', () => {
  assert.strictEqual(normalisePhone('0712 345 678'), '254712345678');
  assert.strictEqual(normalisePhone('+254712345678'), '254712345678');
  assert.strictEqual(normalisePhone('00254712345678'), '254712345678');
  assert.strictEqual(normalisePhone(''), '');
});

test('webhook signatures are checked', () => {
  const body = Buffer.from('{"hello":"world"}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.ok(isValidSignature(body, sig, 'secret'));
  assert.ok(!isValidSignature(body, sig, 'wrong'));
  assert.ok(!isValidSignature(body, undefined, 'secret'));
});

test('incoming WhatsApp payloads are read', () => {
  const body = { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '254700000001', profile: { name: 'Achieng' } }],
    messages: [
      { id: 'm1', from: '254700000001', type: 'text', text: { body: 'Hi' } },
      { id: 'm2', from: '254700000001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'quiz', title: 'Take a quiz' } } },
      { id: 'm3', from: '254700000001', type: 'audio', audio: { id: 'a1' } },
    ],
  } }] }] };
  const msgs = extractMessages(body);
  assert.strictEqual(msgs.length, 3);
  assert.strictEqual(msgs[0].text, 'Hi');
  assert.strictEqual(msgs[0].name, 'Achieng');
  assert.strictEqual(msgs[1].buttonId, 'quiz');
  assert.strictEqual(msgs[2].kind, 'audio');
  assert.deepStrictEqual(extractMessages({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
});

test('button replies become WhatsApp interactive messages', () => {
  const [p] = toPayloads('254700000001', { type: 'buttons', body: 'Pick', buttons: [{ id: 'quiz', title: 'A very long button title indeed' }] });
  assert.strictEqual(p.type, 'interactive');
  assert.strictEqual(p.interactive.action.buttons[0].reply.title.length, 20);
});

test('commands are recognised', () => {
  assert.strictEqual(detectCommand('Hi!'), 'menu');
  assert.strictEqual(detectCommand('test me'), 'quiz');
  assert.strictEqual(detectCommand('anything', 'progress'), 'progress');
  assert.strictEqual(detectCommand('What is the Lite 50 price?'), null);
});

test('unknown and paused numbers are turned away', async () => {
  const [unknown] = await handleIncoming({ from: '254799999999', text: 'hi' });
  assert.match(unknown.body, /not enrolled/);
  const [paused] = await handleIncoming({ from: '254700000003', text: 'hi' });
  assert.match(paused.body, /paused/);
});

test('learner in local format "0700 000 002" is matched', async () => {
  const [r] = await handleIncoming({ from: '254700000002', text: 'hello' });
  assert.match(r.body, /Hello Brian/);
});

test('full flow: question, quiz, marking, progress', async () => {
  const from = '254700000001';
  const [menu] = await handleIncoming({ from, text: 'hi' });
  assert.strictEqual(menu.type, 'buttons');

  const [answer] = await handleIncoming({ from, text: 'How much is the Lite 50?' });
  assert.match(answer.body, /using 4 files/);

  const [q] = await handleIncoming({ from, text: 'Take a quiz', buttonId: 'quiz' });
  assert.match(q.body, /When does a PAYG system lock/);

  const [graded] = await handleIncoming({ from, text: 'after 3 days' });
  assert.match(graded.body, /Score: 90%\* \(passed\)/);

  await handleIncoming({ from, text: 'quiz' });
  const [failed] = await handleIncoming({ from, text: 'no idea' });
  assert.match(failed.body, /Score: 20%\* \(pass mark is 70%\)/);

  const [prog] = await handleIncoming({ from, text: 'progress' });
  assert.match(prog.body, /Questions answered: 2/);
  assert.match(prog.body, /Average score: 55%/);

  const [skip] = await handleIncoming({ from, text: 'skip' });
  assert.match(skip.body, /Nothing to cancel/);
});

test('voice notes get a polite text-only reply', async () => {
  const [r] = await handleIncoming({ from: '254700000001', kind: 'audio', text: '' });
  assert.match(r.body, /typed messages/);
});
