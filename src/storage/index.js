// Picks the right storage for each client ("local" for testing, "drive" for real clients).
const local = require('./local');
const drive = require('./drive');

const backends = { local, drive };

function storageFor(client) {
  const backend = backends[client.storage];
  if (!backend) throw new Error(`Unknown storage "${client.storage}" for client ${client.id}`);
  return backend;
}

module.exports = { storageFor };
