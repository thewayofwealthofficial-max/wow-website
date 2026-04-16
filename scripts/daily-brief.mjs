#!/usr/bin/env node
// Daily morning brief — runs 07:00 UTC every day via GitHub Actions.
// Pulls quiz funnel data from Airtable, subscriber count from MailerLite,
// latest blog post from the repo, and composes a Telegram message for Joel.
//
// ENV VARS REQUIRED (GitHub Actions secrets):
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//   AIRTABLE_TOKEN
//   AIRTABLE_BASE_ID
//   AIRTABLE_QUIZ_TABLE_ID
//   MAILERLITE_API_KEY

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID,
  AIRTABLE_QUIZ_TABLE_ID,
  MAILERLITE_API_KEY,
} = process.env;

const required = { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID };
for (const [k, v] of Object.entries(required)) {
  if (!v) { console.error(`FATAL: ${k} not set`); process.exit(1); }
}

const FUNNEL_STEPS = [
  'intro_load', 'quiz_start',
  'q1_shown', 'q1', 'q2_shown', 'q2', 'q3_shown', 'q3',
  'q4_shown', 'q4', 'q5_shown', 'q5', 'q6_shown', 'q6', 'q7_shown', 'q7',
  'email_shown', 'completed',
];

// ───────────────────────────────────────────────────────────────
// Airtable — pull last 24h of quiz events

async function pullQuizData() {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_QUIZ_TABLE_ID) {
    return { sessions24h: 0, sessions7d: 0, completionRate24h: null, completionRate7d: null, furthestDist: {} };
  }

  const records = [];
  let offset = '';
  for (let i = 0; i < 10; i++) {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_QUIZ_TABLE_ID}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!res.ok) { console.error('Airtable fetch failed:', res.status); break; }
    const data = await res.json();
    records.push(...(data.records ?? []));
    if (!data.offset) break;
    offset = data.offset;
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const t24h = now - DAY;
  const t7d = now - 7 * DAY;

  const sessions24h = new Map();
  const sessions7d = new Map();

  for (const r of records) {
    const f = r.fields;
    const sid = f['Session ID'];
    const step = f['Step'];
    const ts = new Date(f['Timestamp'] || r.createdTime).getTime();
    if (!sid || !step) continue;
    const rank = FUNNEL_STEPS.indexOf(step);
    if (ts >= t7d) {
      const cur = sessions7d.get(sid) ?? { max: -1, step: null };
      if (rank > cur.max) sessions7d.set(sid, { max: rank, step });
    }
    if (ts >= t24h) {
      const cur = sessions24h.get(sid) ?? { max: -1, step: null };
      if (rank > cur.max) sessions24h.set(sid, { max: rank, step });
    }
  }

  function completionRate(map) {
    if (map.size === 0) return null;
    const completed = [...map.values()].filter((v) => v.step === 'completed').length;
    return Math.round((completed / map.size) * 100);
  }

  function furthestDistribution(map) {
    const buckets = { intro: 0, started: 0, answered_first_q: 0, past_midway: 0, reached_email: 0, completed: 0 };
    for (const { max, step } of map.values()) {
      if (step === 'completed') buckets.completed++;
      else if (step === 'email_shown') buckets.reached_email++;
      else if (step && (step.startsWith('q4') || step.startsWith('q5') || step.startsWith('q6') || step.startsWith('q7'))) buckets.past_midway++;
      else if (step === 'q1' || (step && step.startsWith('q'))) buckets.answered_first_q++;
      else if (step === 'quiz_start') buckets.started++;
      else buckets.intro++;
    }
    return buckets;
  }

  return {
    sessions24h: sessions24h.size,
    sessions7d: sessions7d.size,
    completionRate24h: completionRate(sessions24h),
    completionRate7d: completionRate(sessions7d),
    furthestDist: furthestDistribution(sessions24h),
  };
}

// ───────────────────────────────────────────────────────────────
// MailerLite — subscriber count

async function pullMailerLite() {
  if (!MAILERLITE_API_KEY) return { total: null };
  const res = await fetch('https://connect.mailerlite.com/api/subscribers?limit=1', {
    headers: { Authorization: `Bearer ${MAILERLITE_API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) return { total: null };
  const data = await res.json();
  return { total: data.meta?.total ?? (data.data?.length ?? null) };
}

// ───────────────────────────────────────────────────────────────
// Latest blog post

async function pullLatestPost() {
  const BLOG_DIR = join(REPO_ROOT, 'src', 'content', 'blog');
  try {
    const files = (await readdir(BLOG_DIR)).filter((f) => f.endsWith('.md'));
    if (files.length === 0) return null;
    const entries = await Promise.all(files.map(async (f) => {
      const content = await readFile(join(BLOG_DIR, f), 'utf8');
      const title = content.match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ?? f;
      const pubDate = content.match(/^pubDate:\s*(\S+)/m)?.[1] ?? '';
      return { file: f, title, pubDate };
    }));
    entries.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
    return entries[0];
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────
// Reddit queue

async function pullQueueStatus() {
  const QUEUE_PATH = join(REPO_ROOT, 'src', 'content', 'reddit-queue.md');
  try {
    const content = await readFile(QUEUE_PATH, 'utf8');
    const queued = (content.match(/🔵/g) || []).length;
    const published = (content.match(/✅/g) || []).length;
    return { queued, published };
  } catch {
    return { queued: null, published: null };
  }
}

// ───────────────────────────────────────────────────────────────
// Telegram send

function esc(s) {
  return String(s ?? '').replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, (c) => '\\' + c);
}

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'MarkdownV2' }),
  });
  const json = await res.json();
  if (!json.ok) { console.error('Telegram error:', json.description); process.exit(1); }
  console.log(`✓ Sent (message_id: ${json.result.message_id})`);
}

// ───────────────────────────────────────────────────────────────
// Compose + send

async function main() {
  console.log('Pulling data...');
  const [quiz, ml, post, queue] = await Promise.all([pullQuizData(), pullMailerLite(), pullLatestPost(), pullQueueStatus()]);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  let msg = `☕ *Morning brief — ${esc(dateStr)}*\n\n`;

  // What shipped yesterday / overnight
  msg += `🚀 *Shipped overnight*\n`;
  if (post) msg += `• Latest post: ${esc(post.title)}\n`;
  if (queue.queued !== null) msg += `• Reddit queue: ${queue.queued} queued, ${queue.published} published\n`;
  msg += '\n';

  // Quiz funnel
  msg += `📊 *Quiz funnel \\(last 24h\\)*\n`;
  if (quiz.sessions24h === 0) {
    msg += `• 0 sessions yesterday — no new data to learn from\n`;
  } else {
    msg += `• Sessions: ${quiz.sessions24h}\n`;
    if (quiz.completionRate24h !== null) msg += `• Completion rate: ${quiz.completionRate24h}%\n`;
    const d = quiz.furthestDist;
    msg += `• Drop map: intro ${d.intro} → started ${d.started} → answered Q1 ${d.answered_first_q} → past midway ${d.past_midway} → email ${d.reached_email} → completed ${d.completed}\n`;
  }
  msg += `• 7\\-day sessions: ${quiz.sessions7d}, completion: ${quiz.completionRate7d ?? '—'}%\n\n`;

  // MailerLite
  if (ml.total !== null) msg += `📧 *MailerLite*\n• Subscribers: ${ml.total}\n\n`;

  // Next up
  msg += `🤖 *What I'm on today*\n`;
  msg += `• Monitoring quiz after the 7\\-question cut \\+ copy simplification\n`;
  msg += `• Daily blog auto\\-publishes at 05:00 UTC \\(Sonnet 4\\.6\\)\n`;
  msg += `• Competitor scan \\(Gmail MCP\\) when you open Claude Code\n\n`;

  msg += `_Reply here with 'status', 'flags', 'ideas', or a specific question — I check these when you open Claude Code next\\._\n— Fred`;

  console.log(msg);
  await sendTelegram(msg);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
