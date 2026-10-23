// Chat with Sulemani in your terminal as if you were a learner on WhatsApp.
// Needs only ANTHROPIC_API_KEY in .env. No Meta account or Google setup required.
//
//   npm run chat                    (uses the first sample learner)
//   npm run chat -- 0700000002      (chat as a different enrolled number)
const readline = require('readline');
const { handleIncoming } = require('../src/handler');

const phone = process.argv[2] || '254700000001';

function show(replies) {
  for (const r of replies) {
    console.log(`\nSulemani: ${r.body}`);
    if (r.type === 'buttons') {
      console.log('  Buttons: ' + r.buttons.map((b) => `[${b.title}] (type "${b.id}")`).join('  '));
    }
  }
  console.log('');
}

async function main() {
  console.log(`Chatting as ${phone}. Type "menu" to start, or Ctrl+C to quit.\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'You: ' });
  rl.prompt();
  for await (const line of rl) {
    const text = line.trim();
    if (text) {
      try {
        const buttonId = ['quiz', 'progress', 'menu'].includes(text.toLowerCase()) ? text.toLowerCase() : null;
        show(await handleIncoming({ from: phone, text, buttonId }));
      } catch (err) {
        console.error(`\nError: ${err.message}\n`);
      }
    }
    rl.prompt();
  }
}

main();
