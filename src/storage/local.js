// Local storage for testing on your own computer. Knowledge base files are read from a folder,
// learners from a CSV file, and activity is written to a CSV file in the data folder.
const fs = require('fs');
const path = require('path');
const { settings } = require('../config');

const TEXT_EXTENSIONS = new Set(['.md', '.txt']);

function resolve(p) {
  return path.resolve(settings.root, p);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function loadKnowledge(client) {
  const dir = resolve(client.local.knowledgePath);
  const names = fs.readdirSync(dir)
    .filter((n) => TEXT_EXTENSIONS.has(path.extname(n).toLowerCase()))
    .sort();
  return names.map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

async function loadLearners(client) {
  const file = resolve(client.local.learnersCsv);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map((line) => {
    const [phone, name, programme, status] = parseCsvLine(line);
    return { phone, name, programme, status };
  });
}

const ACTIVITY_HEADER = ['Timestamp', 'Phone', 'Name', 'Activity', 'Detail', 'Score'];

async function appendActivity(client, row) {
  const file = resolve(client.local.activityCsv);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, ACTIVITY_HEADER.join(',') + '\n');
  fs.appendFileSync(file, row.map(csvCell).join(',') + '\n');
}

async function getActivity(client) {
  const file = resolve(client.local.activityCsv);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map(parseCsvLine);
}

module.exports = { loadKnowledge, loadLearners, appendActivity, getActivity, parseCsvLine };
