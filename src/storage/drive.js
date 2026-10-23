// Google Drive storage. Everything stays in the client's own Google account:
//   - the knowledge base folder (shared with the Fanisi service account as Viewer)
//   - the records spreadsheet with "Learners" and "Activity" tabs (shared as Editor)
// Nothing is copied to Fanisi's systems; documents are only held in memory for a few minutes.
const { drive: driveApi } = require('@googleapis/drive');
const { sheets: sheetsApi } = require('@googleapis/sheets');
const { GoogleAuth } = require('google-auth-library');
const { settings } = require('../config');

let auth = null;
let drive = null;
let sheets = null;

function clients() {
  if (!drive) {
    if (!settings.googleServiceAccountJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set, so Drive storage cannot be used.');
    }
    auth = new GoogleAuth({
      credentials: JSON.parse(settings.googleServiceAccountJson),
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
    drive = driveApi({ version: 'v3', auth });
    sheets = sheetsApi({ version: 'v4', auth });
  }
  return { drive, sheets };
}

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const PLAIN_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

async function listFolder(folderId) {
  const { drive } = clients();
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function loadKnowledge(client) {
  const { drive } = clients();
  const files = (await listFolder(client.drive.knowledgeFolderId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const docs = [];
  for (const f of files) {
    let text = null;
    if (f.mimeType === GOOGLE_DOC) {
      const res = await drive.files.export({ fileId: f.id, mimeType: 'text/plain' }, { responseType: 'text' });
      text = res.data;
    } else if (PLAIN_TYPES.has(f.mimeType) || /\.(md|txt)$/i.test(f.name)) {
      const res = await drive.files.get({ fileId: f.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
      text = res.data;
    } else {
      console.warn(`[${client.id}] Skipping "${f.name}" (${f.mimeType}). Save it as a Google Doc to include it.`);
      continue;
    }
    docs.push({ name: f.name, text: String(text) });
  }
  return docs;
}

async function loadLearners(client) {
  const { sheets } = clients();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: client.drive.recordsSheetId,
    range: 'Learners!A2:D',
  });
  return (res.data.values || []).map(([phone, name, programme, status]) => ({ phone, name, programme, status }));
}

async function appendActivity(client, row) {
  const { sheets } = clients();
  await sheets.spreadsheets.values.append({
    spreadsheetId: client.drive.recordsSheetId,
    range: 'Activity!A:F',
    valueInputOption: 'RAW', // RAW stops learner text from being treated as a formula
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row.map((v) => String(v ?? ''))] },
  });
}

async function getActivity(client) {
  const { sheets } = clients();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: client.drive.recordsSheetId,
    range: 'Activity!A2:F',
  });
  return res.data.values || [];
}

module.exports = { loadKnowledge, loadLearners, appendActivity, getActivity };
