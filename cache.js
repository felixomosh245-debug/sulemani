// Short-lived in-memory cache for knowledge bases and learner lists, so we don't re-read
// the client's Drive on every message. Nothing is written to disk.
const { settings } = require('./config');
const { storageFor } = require('./storage');

const kbCache = new Map();       // clientId -> { at, text, files, truncated }
const learnerCache = new Map();  // clientId -> { at, learners }

function fresh(entry) {
  return entry && Date.now() - entry.at < settings.cacheMs;
}

async function getKnowledge(client) {
  const hit = kbCache.get(client.id);
  if (fresh(hit)) return hit;
  const docs = await storageFor(client).loadKnowledge(client);
  let text = docs.map((d) => `<document name="${d.name}">\n${d.text.trim()}\n</document>`).join('\n\n');
  let truncated = false;
  if (text.length > settings.kbMaxChars) {
    text = text.slice(0, settings.kbMaxChars);
    truncated = true;
    console.warn(`[${client.id}] Knowledge base is larger than KB_MAX_CHARS and was cut short.`);
  }
  const entry = { at: Date.now(), text, files: docs.map((d) => d.name), truncated };
  kbCache.set(client.id, entry);
  return entry;
}

async function getLearners(client, { force = false } = {}) {
  const hit = learnerCache.get(client.id);
  if (!force && fresh(hit)) return hit.learners;
  const learners = await storageFor(client).loadLearners(client);
  learnerCache.set(client.id, { at: Date.now(), learners });
  return learners;
}

function clearCaches() {
  kbCache.clear();
  learnerCache.clear();
}

module.exports = { getKnowledge, getLearners, clearCaches };
