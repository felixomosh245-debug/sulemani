// The web server Meta sends WhatsApp messages to.
//   GET  /webhook  - Meta checks the webhook when you first connect it
//   POST /webhook  - incoming WhatsApp messages
//   GET  /health   - simple check that the service is running
const express = require('express');
const { settings, getClients } = require('./config');
const { isValidSignature, extractMessages, sendReplies, markReadAndTyping } = require('./whatsapp');
const { handleIncoming } = require('./handler');

const app = express();

// Keep the raw body: the signature check needs the exact bytes Meta sent.
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get('/health', (_req, res) => res.json({ ok: true, clients: getClients().map((c) => c.id) }));

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && settings.whatsapp.verifyToken && token === settings.whatsapp.verifyToken) {
    console.log('Webhook verified by Meta.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta can deliver the same message more than once; remember recent message IDs.
const seen = new Map();
function alreadySeen(id) {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 60 * 60 * 1000) seen.delete(k);
  if (seen.has(id)) return true;
  seen.set(id, now);
  return false;
}

// Process each learner's messages one at a time, in order.
const queues = new Map();
function enqueue(phone, task) {
  const prev = queues.get(phone) || Promise.resolve();
  const next = prev.then(task).catch((err) => console.error(err));
  queues.set(phone, next);
  next.finally(() => { if (queues.get(phone) === next) queues.delete(phone); });
}

async function processMessage(msg) {
  await markReadAndTyping(msg.id);
  let replies;
  try {
    replies = await handleIncoming(msg);
  } catch (err) {
    console.error(`Error handling message from ${msg.from}:`, err);
    replies = [{ type: 'text', body: 'Sorry, something went wrong on my side. Please try again in a moment.' }];
  }
  await sendReplies(msg.from, replies);
}

app.post('/webhook', (req, res) => {
  if (!isValidSignature(req.rawBody, req.get('x-hub-signature-256'))) {
    console.warn('Rejected a webhook call with a missing or invalid signature.');
    return res.sendStatus(401);
  }
  // Reply to Meta straight away; otherwise it retries and learners get duplicate answers.
  res.sendStatus(200);
  for (const msg of extractMessages(req.body)) {
    if (alreadySeen(msg.id)) continue;
    enqueue(msg.from, () => processMessage(msg));
  }
});

if (require.main === module) {
  if (!settings.whatsapp.appSecret) console.warn('WARNING: WHATSAPP_APP_SECRET is not set, so all webhook calls will be rejected.');
  app.listen(settings.port, () => {
    console.log(`Sulemani is listening on port ${settings.port} for clients: ${getClients().map((c) => c.id).join(', ')}`);
  });
}

module.exports = { app };
