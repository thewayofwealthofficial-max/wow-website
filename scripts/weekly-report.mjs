#!/usr/bin/env node
// Weekly Monday report — runs Monday 07:30 UTC (30 min after daily brief).
// Deeper analysis: week-over-week trends, biggest drop-off point, what to
// iterate next, wins and worries. Sent via Telegram to Joel.

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

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { console.error('FATAL: Telegram env vars missing'); process.exit(1); }

const FUNNEL_STEPS = [
  'intro_load', 'quiz_start',
  'q1_shown', 'q1', 'q2_shown', 'q2', 'q3_shown', 'q3',
  'q4_shown', 'q4', 'q5_shown', 'q5', 'q6_shown', 'q6', 'q7_shown', 'q7',
  'email_shown', 'completed',
];

async function pullAllQuiz() {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_QUIZ_TABLE_ID) return { records: [] };
  const records = [];
  let offset = '';
  for (let i = 0; i < 20; i++) {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_QUIZ_TABLE_ID}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!res.ok) break;
    const data = await res.json();
    records.push(...(data.records ?? []));
    if (!data.offset) break;
    offset = data.offset;
  }
  return { records };
}

function analyseFunnel(records, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const sessions = new Map();
  for (const r of records) {
    const f = r.fields;
    const sid = f['Session ID']; const step = f['Step'];
    const ts = new Date(f['Timestamp'] || r.createdTime).getTime();
    if (!sid || !step || ts < cutoff) continue;
    const rank = FUNNEL_STEPS.indexOf(step);
    const cur = sessions.get(sid) ?? { max: -1, step: null, source: f['Source'], device: f['Device'] };
    if (rank > cur.max) sessions.set(sid, { max: rank, step, source: cur.source, device: cur.device });
  }

  const total = sessions.size;
  const completed = [...sessions.values()].filter((v) => v.step === 'completed').length;
  const reached = {};
  for (const step of FUNNEL_STEPS) {
    reached[step] = [...sessions.values()].filter((v) => v.max >= FUNNEL_STEPS.indexOf(step)).length;
  }

  // Biggest step-to-step drop
  let biggestDrop = { from: null, to: null, pct: 0, lost: 0 };
  for (let i = 0; i < FUNNEL_STEPS.length - 1; i++) {
    const from = FUNNEL_STEPS[i]; const to = FUNNEL_STEPS[i + 1];
    if (reached[from] === 0) continue;
    const pct = 1 - reached[to] / reached[from];
    if (pct > biggestDrop.pct && reached[from] >= 3) {
      biggestDrop = { from, to, pct: Math.round(pct * 100), lost: reached[from] - reached[to] };
    }
  }

  const sources = {};
  for (const s of sessions.values()) {
    const key = s.source || '(direct)';
    sources[key] = (sources[key] ?? 0) + 1;
  }

  return { total, completed, completionRate: total > 0 ? Math.round((completed / total) * 100) : null, reached, biggestDrop, sources };
}

async function pullMailerLite() {
  if (!MAILERLITE_API_KEY) return { total: null };
  const res = await fetch('https://connect.mailerlite.com/api/subscribers?limit=1', {
    headers: { Authorization: `Bearer ${MAILERLITE_API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) return { total: null };
  const data = await res.json();
  return { total: data.meta?.total ?? null };
}

async function pullPosts() {
  const BLOG_DIR = join(REPO_ROOT, 'src', 'content', 'blog');
  try {
    const files = (await readdir(BLOG_DIR)).filter((f) => f.endsWith('.md'));
    const entries = await Promise.all(files.map(async (f) => {
      const content = await readFile(join(BLOG_DIR, f), 'utf8');
      const title = content.match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ?? f;
      const pubDate = content.match(/^pubDate:\s*(\S+)/m)?.[1] ?? '';
      return { title, pubDate };
    }));
    entries.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
    return entries;
  } catch { return []; }
}

async function pullQueueStatus() {
  const QUEUE_PATH = join(REPO_ROOT, 'src', 'content', 'reddit-queue.md');
  try {
    const content = await readFile(QUEUE_PATH, 'utf8');
    return { queued: (content.match(/🔵/g) || []).length, published: (content.match(/✅/g) || []).length };
  } catch { return { queued: null, published: null }; }
}

function esc(s) { return String(s ?? '').replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, (c) => '\\' + c); }

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

async function main() {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const { records } = await pullAllQuiz();
  const thisWeek = analyseFunnel(records, WEEK);
  const lastWeek = analyseFunnel(records, 2 * WEEK); // includes last 2 weeks; we compare manually below
  const lastOnly = { ...lastWeek, total: lastWeek.total - thisWeek.total, completed: lastWeek.completed - thisWeek.completed };
  const lastRate = lastOnly.total > 0 ? Math.round((lastOnly.completed / lastOnly.total) * 100) : null;

  const [ml, posts, queue] = await Promise.all([pullMailerLite(), pullPosts(), pullQueueStatus()]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  let msg = `📆 *Weekly Report — ${esc(dateStr)}*\n\n`;

  // Quiz
  msg += `*Quiz funnel — this week*\n`;
  msg += `• ${thisWeek.total} sessions, ${thisWeek.completed} completions \\(${thisWeek.completionRate ?? '—'}%\\)\n`;
  if (lastRate !== null) msg += `• Last week: ${lastOnly.total} sessions, ${lastRate}% completion \\(${thisWeek.completionRate > lastRate ? '📈' : thisWeek.completionRate < lastRate ? '📉' : '→'}\\)\n`;
  if (thisWeek.biggestDrop.from) {
    msg += `• Biggest drop: ${esc(thisWeek.biggestDrop.from)} → ${esc(thisWeek.biggestDrop.to)} \\(lost ${thisWeek.biggestDrop.lost}, ${thisWeek.biggestDrop.pct}%\\)\n`;
  }
  const topSources = Object.entries(thisWeek.sources).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (topSources.length > 0) msg += `• Sources: ${topSources.map(([k, v]) => `${esc(k)} ${v}`).join(', ')}\n`;
  msg += '\n';

  // Content
  msg += `*Content shipped*\n`;
  const sevenDaysAgo = Date.now() - WEEK;
  const thisWeekPosts = posts.filter((p) => new Date(p.pubDate).getTime() >= sevenDaysAgo);
  msg += `• Blog posts this week: ${thisWeekPosts.length}\n`;
  if (queue.queued !== null) msg += `• Reddit queue: ${queue.queued} queued, ${queue.published} published total\n`;
  msg += '\n';

  // MailerLite
  if (ml.total !== null) msg += `*MailerLite*\n• Subscribers: ${ml.total}\n\n`;

  // Recommendations
  msg += `*What I recommend this week*\n`;
  if (thisWeek.completionRate !== null && thisWeek.completionRate < 20 && thisWeek.total >= 5) {
    msg += `• Completion below 20% — propose deeper quiz rewrite \\(shorter, different Q1 angle\\)\n`;
  }
  if (thisWeek.total < 10) msg += `• Quiz traffic low — prioritise driving IG/FB traffic to the quiz URL\n`;
  if (queue.queued !== null && queue.queued < 10) msg += `• Reddit queue running low — topup fires Sunday, but may need top\\-up\n`;
  msg += `• Newsletter launch in _check calendar_ \\(Finance Friday first send: 2026\\-05\\-01\\)\n\n`;

  msg += `_Open Claude Code to dig into any of these. Reply here with priorities if anything jumps out._\n— Fred`;

  console.log(msg);
  await sendTelegram(msg);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
