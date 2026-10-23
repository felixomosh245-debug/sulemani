// Everything specific to the WhatsApp Cloud API: checking that requests come from Meta,
// reading incoming messages, and sending replies.
const crypto = require('crypto');
const { settings } = require('./config');

// Meta signs every webhook with your app secret. Reject anything that doesn't match.
function isValidSignature(rawBody, signatureHeader, appSecret = settings.whatsapp.appSecret) {
  if (!appSecret || !signatureHeader || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Turns Meta's webhook body into a simple list of messages.
function extractMessages(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages || []) {
        const msg = { id: m.id, from: m.from, name: names[m.from] || '', kind: m.type, text: '', buttonId: null };
        if (m.type === 'text') msg.text = m.text?.body || '';
        else if (m.type === 'interactive') {
          const reply = m.interactive?.button_reply || m.interactive?.list_reply;
          msg.buttonId = reply?.id || null;
          msg.text = reply?.title || '';
        } else if (m.type === 'button') {
          msg.text = m.button?.text || ''; // reply to a template message button
          msg.kind = 'text';
        }
        out.push(msg);
      }
    }
  }
  return out;
}

async function callGraph(payload) {
  const { token, phoneNumberId, graphVersion } = settings.whatsapp;
  const res = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${detail}`);
  }
  return res.json();
}

function splitText(text, max = 4000) {
  const parts = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Converts our simple reply format into WhatsApp API calls.
function toPayloads(to, reply) {
  if (reply.type === 'buttons' && reply.buttons?.length) {
    return [{
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: reply.body.slice(0, 1024) },
        action: {
          buttons: reply.buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    }];
  }
  return splitText(reply.body).map((part) => ({ to, type: 'text', text: { body: part, preview_url: false } }));
}

async function sendReplies(to, replies) {
  for (const reply of replies) {
    for (const payload of toPayloads(to, reply)) await callGraph(payload);
  }
}

// Shows blue ticks and a "typing" indicator while Sulemani prepares the reply.
async function markReadAndTyping(messageId) {
  try {
    await callGraph({ status: 'read', message_id: messageId, typing_indicator: { type: 'text' } });
  } catch (err) {
    console.warn(`Could not mark message as read: ${err.message}`);
  }
}

module.exports = { isValidSignature, extractMessages, sendReplies, markReadAndTyping, toPayloads, splitText };
