#!/usr/bin/env node
// Weekly Reddit question harvest.
// Scans top posts from Jess-relevant subreddits, uses Claude to curate
// the 5 best new questions, and appends them to src/content/reddit-queue.md.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const QUEUE_PATH = join(REPO_ROOT, 'src', 'content', 'reddit-queue.md');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('FATAL: ANTHROPIC_API_KEY env var is not set.');
  process.exit(1);
}

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

const SUBREDDITS = [
  'UKPersonalFinance',
  'MoneyDiariesACTIVE',
  'povertyfinance',
  'personalfinance',
  'ADHD',
];

const USER_AGENT = 'thewayofwealth-queue-topup/1.0 (by /u/thewayofwealth)';

// ───────────────────────────────────────────────────────────────
// Reddit fetch

async function fetchSubredditTop(subreddit, time = 'week', limit = 30) {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?t=${time}&limit=${limit}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    console.warn(`r/${subreddit}: ${res.status} ${res.statusText} — skipping`);
    return [];
  }
  const data = await res.json();
  return (data?.data?.children ?? []).map((c) => c.data);
}

function looksLikeJessQuestion(post) {
  const title = (post.title ?? '').trim();
  if (title.length < 10 || title.length > 160) return false;
  const t = title.toLowerCase();
  if (post.over_18) return false;
  // Must read like a question or an appeal
  const questionish =
    t.endsWith('?') ||
    /^(why|how|what|should i|is it|am i|does anyone|can i|when does|when do)\b/.test(t) ||
    /(advice|help|feel|feeling|struggle|anxious|anxiety|shame|stuck|overwhelmed|avoid)/.test(t);
  if (!questionish) return false;
  // Jess-adjacent content (avoid hard-tactical threads like "best ISA 2026")
  const tacticalHints = /(\bisa\b|\bvanguard\b|\bETF\b|\bLISA\b|\bSIPP\b|\bpension contribution\b|invest\s+£\d)/i.test(title);
  if (tacticalHints) return false;
  return true;
}

// ───────────────────────────────────────────────────────────────
// Queue parsing

function parseQueue(markdown) {
  const lines = markdown.split('\n');
  const headerIdx = lines.findIndex((l) => l.startsWith('| # |'));
  if (headerIdx < 0) throw new Error('Queue table header not found');
  const rows = [];
  let lastRowIdx = headerIdx + 1;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) break;
    lastRowIdx = i;
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 6) {
      rows.push({
        num: Number(cells[0]),
        status: cells[1],
        question: cells[2],
      });
    }
  }
  return { lines, rows, lastRowIdx };
}

function buildQueueRow(num, question, concept, category, icp) {
  return `| ${num} | 🔵 | ${question} | ${concept} | ${category} | ${icp} |`;
}

function maxQueueNum(rows) {
  return rows.reduce((max, r) => (Number.isFinite(r.num) && r.num > max ? r.num : max), 0);
}

// ───────────────────────────────────────────────────────────────
// Claude curation

const CURATION_SYSTEM = `You are curating Reddit posts for Joel's Way of Wealth blog. The blog targets Jess — 28-35, anxious avoider, has tried budgets, shame spiral, searches in her own emotional language.

You will receive a batch of Reddit post titles from personal-finance-adjacent subreddits. Your job: pick the 10 best ones that:

1. Read as a question Jess herself might type into Google (emotional, functional, first-person)
2. Map cleanly to a SINGLE behavioral economics concept (ostrich effect, mental accounting, present bias, loss aversion, money scripts/Klontz, planning fallacy, sunk cost, hedonic treadmill, hyperbolic discounting, etc.) — never blend three
3. Are NOT already covered by existing queue entries or published posts
4. Have emotional weight (shame, confusion, fear, frustration, stuck-ness)
5. Avoid pure tactical/calculation topics (best ISA, mortgage specifics) — crowded + regulated

CATEGORIES (pick one per question): "Spending & shame", "Anxiety & avoidance", "ADHD & money", "Self-employed", "Budgeting that sticks", "Behavioral basics"

ICP SEGMENTS (pick one or a combination): "Anxious Avoider", "ADHD/Neurodivergent", "Self-Employed Stresser", "All segments"

If you can't find 10 good ones, return fewer — quality over quota. The blog publishes 7 per week, so 10 keeps the queue growing.

OUTPUT — RESPOND WITH JSON ONLY, no preamble:
{
  "picks": [
    {
      "question": "<rephrased as Jess would Google it, max 160 chars, ends in '?' where natural>",
      "concept": "<1-3 behavioral concepts, comma-separated>",
      "category": "<one of the category enums above>",
      "icp": "<one or combo of ICP enums>",
      "redditUrl": "<permalink from source>",
      "rationale": "<one sentence why this is a Jess question>"
    }
  ]
}`;

async function callClaude(posts, existingQuestions) {
  const sourceLines = posts
    .map((p, i) => `${i + 1}. [r/${p.subreddit}] "${p.title}" — ${p.num_comments} comments — ${p.permalink}`)
    .join('\n');
  const existingLines = existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const userPrompt = `CANDIDATE REDDIT POSTS (top this week from Jess-adjacent subs):
${sourceLines}

ALREADY COVERED (do not duplicate, paraphrase, or near-overlap these):
${existingLines}

Pick the 5 best. JSON only.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: CURATION_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${text}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty Claude response');

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

// ───────────────────────────────────────────────────────────────
// Main

async function main() {
  console.log(`[${new Date().toISOString()}] Starting weekly queue topup. Model: ${MODEL}`);

  console.log('Fetching Reddit posts...');
  const allPosts = [];
  for (const sub of SUBREDDITS) {
    const posts = await fetchSubredditTop(sub, 'week', 25);
    console.log(`  r/${sub}: ${posts.length} posts`);
    allPosts.push(...posts.map((p) => ({
      subreddit: sub,
      title: p.title,
      num_comments: p.num_comments,
      permalink: `https://reddit.com${p.permalink}`,
    })));
  }
  console.log(`Total posts fetched: ${allPosts.length}`);

  const jessPosts = allPosts
    .filter(looksLikeJessQuestion)
    .sort((a, b) => b.num_comments - a.num_comments)
    .slice(0, 60); // Cap before sending to Claude — wider net so we can pick 10 strong ones
  console.log(`Filtered to Jess-shaped questions: ${jessPosts.length}`);

  if (jessPosts.length === 0) {
    console.log('No candidates passed the Jess filter. Exiting without changes.');
    return;
  }

  const queueRaw = await readFile(QUEUE_PATH, 'utf8');
  const { lines, rows, lastRowIdx } = parseQueue(queueRaw);
  const existingQuestions = rows.map((r) => r.question);
  const nextNum = maxQueueNum(rows) + 1;

  console.log('Asking Claude to curate...');
  const { picks } = await callClaude(jessPosts, existingQuestions);
  if (!Array.isArray(picks) || picks.length === 0) {
    console.log('Claude returned no picks. Exiting.');
    return;
  }
  console.log(`Claude picked ${picks.length} questions.`);

  const newRows = picks.map((pick, i) =>
    buildQueueRow(nextNum + i, pick.question, pick.concept, pick.category, pick.icp),
  );

  // Splice new rows in after the last existing row.
  const before = lines.slice(0, lastRowIdx + 1);
  const after = lines.slice(lastRowIdx + 1);
  const updated = [...before, ...newRows, ...after].join('\n');
  await writeFile(QUEUE_PATH, updated, 'utf8');
  console.log(`Appended ${newRows.length} new questions to queue (now starting at #${nextNum}).`);

  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_OUTPUT, `count=${newRows.length}\nnext_num=${nextNum}\n`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
