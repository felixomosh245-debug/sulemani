// Loads settings from environment variables and the client list from config/clients.json.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const ROOT = path.resolve(__dirname, '..');

const settings = {
  root: ROOT,
  port: Number(process.env.PORT || 3000),
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  chatModel: process.env.CHAT_MODEL || 'claude-haiku-4-5-20251001',
  gradingModel: process.env.GRADING_MODEL || 'claude-sonnet-5-5',
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    graphVersion: process.env.GRAPH_API_VERSION || 'v23.0',
  },
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '254',
  cacheMs: Number(process.env.CACHE_MINUTES || 5) * 60 * 1000,
  kbMaxChars: Number(process.env.KB_MAX_CHARS || 150000),
  clientsFile: path.resolve(ROOT, process.env.CLIENTS_FILE || 'config/clients.json'),
};

let clients = null;

function loadClients() {
  const raw = JSON.parse(fs.readFileSync(settings.clientsFile, 'utf8'));
  const list = raw.filter((c) => c.enabled !== false);
  const ids = new Set();
  for (const c of list) {
    if (!c.id || !c.name || !c.storage) {
      throw new Error(`Client entry is missing id, name or storage: ${JSON.stringify(c)}`);
    }
    if (ids.has(c.id)) throw new Error(`Duplicate client id: ${c.id}`);
    ids.add(c.id);
    c.tutorName = c.tutorName || 'Coach Sulemani';
    c.passMark = Number(c.passMark ?? 70);
  }
  return list;
}

function getClients() {
  if (!clients) clients = loadClients();
  return clients;
}

// Used by tests to point at a different client list.
function setClients(list) {
  clients = list;
}

module.exports = { settings, getClients, setClients };
