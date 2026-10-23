// Works out which client (company) a WhatsApp number belongs to, using each client's
// Learners list. One WhatsApp number can therefore serve several clients.
const { getClients } = require('./config');
const { getLearners } = require('./cache');
const { normalisePhone } = require('./phone');

const lastForcedRefresh = new Map(); // phone -> time, so unknown numbers can't trigger constant re-reads
const FORCE_REFRESH_GAP_MS = 60 * 1000;

async function search(phone, force) {
  for (const client of getClients()) {
    let learners;
    try {
      learners = await getLearners(client, { force });
    } catch (err) {
      console.error(`[${client.id}] Could not load learners: ${err.message}`);
      continue;
    }
    const learner = learners.find((l) => normalisePhone(l.phone) === phone);
    if (learner) return { client, learner: { ...learner, phone } };
  }
  return null;
}

async function findLearner(rawPhone) {
  const phone = normalisePhone(rawPhone);
  if (!phone) return null;
  const found = await search(phone, false);
  if (found) return found;

  // Not found: HR may have just added them, so re-read the lists once a minute at most.
  const last = lastForcedRefresh.get(phone) || 0;
  if (Date.now() - last < FORCE_REFRESH_GAP_MS) return null;
  lastForcedRefresh.set(phone, Date.now());
  return search(phone, true);
}

module.exports = { findLearner };
