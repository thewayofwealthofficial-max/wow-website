#!/usr/bin/env node
// Telegram notifier — sends messages to Joel via the Fred bot.
// Used by GitHub Actions and local scripts to report status, flag approvals, send briefs.
//
// ENV VARS REQUIRED:
//   TELEGRAM_BOT_TOKEN  — Fred's token (BotFather)
//   TELEGRAM_CHAT_ID    — Joel's chat with the bot
//
// USAGE:
//   node scripts/telegram-notify.mjs "Your message here"
//   echo "Piped message" | node scripts/telegram-notify.mjs
//   node scripts/telegram-notify.mjs --title "Morning brief" --body "..." --emoji "☕"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN) {
  console.error('FATAL: TELEGRAM_BOT_TOKEN not set.');
  process.exit(1);
}
if (!CHAT_ID) {
  console.error('FATAL: TELEGRAM_CHAT_ID not set.');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { title: null, body: null, emoji: null, silent: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--title') args.title = argv[++i];
    else if (argv[i] === '--body') args.body = argv[++i];
    else if (argv[i] === '--emoji') args.emoji = argv[++i];
    else if (argv[i] === '--silent') args.silent = true;
    else if (!args.body) args.body = argv[i];
  }
  return args;
}

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function escapeMarkdownV2(text) {
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, (c) => '\\' + c);
}

async function sendMessage({ title, body, emoji, silent }) {
  let text = '';
  if (emoji) text += emoji + ' ';
  if (title) text += '*' + escapeMarkdownV2(title) + '*\n\n';
  if (body) text += escapeMarkdownV2(body);

  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'MarkdownV2',
      disable_notification: silent,
    }),
  });

  const json = await res.json();
  if (!json.ok) {
    console.error('Telegram error:', json.description);
    process.exit(1);
  }
  console.log(`✓ Sent to Telegram (message_id: ${json.result.message_id})`);
}

async function main() {
  const args = parseArgs(process.argv);
  const piped = await readStdin();
  if (piped && !args.body) args.body = piped;

  if (!args.title && !args.body) {
    console.error('No message provided. Use: node telegram-notify.mjs "message" or pipe stdin.');
    process.exit(1);
  }

  await sendMessage(args);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
