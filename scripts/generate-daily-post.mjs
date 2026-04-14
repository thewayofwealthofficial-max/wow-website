#!/usr/bin/env node
// Daily blog post generator.
// Reads the next 🔵 queued question from src/content/reddit-queue.md,
// calls Claude to write it in Joel's voice, writes a markdown file
// to src/content/blog/, and updates the queue.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const QUEUE_PATH = join(REPO_ROOT, 'src', 'content', 'reddit-queue.md');
const BLOG_DIR = join(REPO_ROOT, 'src', 'content', 'blog');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('FATAL: ANTHROPIC_API_KEY env var is not set.');
  process.exit(1);
}

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5';

// ───────────────────────────────────────────────────────────────
// Queue parsing

function parseQueue(markdown) {
  const lines = markdown.split('\n');
  const tableStart = lines.findIndex((l) => l.startsWith('| # |'));
  if (tableStart < 0) throw new Error('Queue table not found in reddit-queue.md');

  const rows = [];
  for (let i = tableStart + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    const [num, status, question, concept, category, icp] = cells;
    rows.push({
      lineIdx: i,
      num: Number(num),
      status,
      question,
      concept,
      category,
      icp,
    });
  }
  return { lines, rows };
}

function pickNextQueued(rows) {
  const queued = rows.filter((r) => r.status.includes('🔵')).sort((a, b) => a.num - b.num);
  if (queued.length === 0) throw new Error('No queued questions remain. Replenish src/content/reddit-queue.md.');
  return queued[0];
}

function markRowPublished(lines, row) {
  const updated = [...lines];
  updated[row.lineIdx] = updated[row.lineIdx].replace('🔵', '✅');
  return updated.join('\n');
}

// ───────────────────────────────────────────────────────────────
// Slug + word count

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

function estimateReadingTime(body) {
  const words = body.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(3, Math.round(words / 230));
  return `${minutes} min read`;
}

function escapeYamlString(s) {
  // Wrap in double quotes and escape internal double quotes + backslashes.
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ───────────────────────────────────────────────────────────────
// Claude prompt

const SYSTEM_PROMPT = `You are Joel — MSc Behavioral Economics, Qualified Financial Planner (UK), founder of Way of Wealth. You write blog posts that answer the questions Jess (your ICP) actually types into Google.

JESS PROFILE: 28-35, anxious avoider, has tried budgets before, shame spiral, searches functional language ("budget planner" not "financial anxiety workbook").

VOICE — HARD RULES:
- Never use: hustle, grind, manifestation, abundance mindset, attract wealth, money magnet, passive income, side hustle, boss babe, toxic positivity, growth hack, viral, "you got this", "level up"
- Always lead with: safety before opportunity, empathy before advice, science before opinion
- Tone: authentic, supportive, clinical-but-warm, witty. Never preachy. Never lecturing. Never patronising.
- Selling-to-women rules (NHB): risk before opportunity, details matter, familiarity = safety
- Credential signals: include naturally (behavioral economist / MSc Behavioral Economics) — authority handover, not bragging

STRUCTURE:
- 1200-1500 words
- Open by validating the feeling, never by lecturing
- Name the behavioral concept by its proper academic name + cite the researcher(s) where it adds credibility (Klontz, Galai, Sade, Thaler, Kahneman etc.)
- Walk Jess through what's happening in her brain, why it's normal, why standard advice misses
- Give one specific small action ("lower the cost of looking", not "create a budget")
- End with a soft pointer toward the Money Beliefs Quiz — never claim "no upsell" (the quiz funnel does upsell, this is a hard rule)
- Sign off "— *Joel*"

FORMATTING (markdown):
- Use ## for section headers (not h1, the layout adds h1 from frontmatter title)
- Use *italics* sparingly for emphasis on the meaningful word
- Use > blockquotes for the one core insight per post
- Short paragraphs (2-4 sentences). Whitespace breathes.
- One small bulleted list if it earns its place; never two.

OUTPUT FORMAT — RESPOND WITH JSON ONLY, no preamble or commentary:
{
  "description": "<one sentence, max 165 characters, must hook Jess's emotion>",
  "tags": ["3-5 lowercase tags, behavioral concept names primary"],
  "body": "<markdown body, 1200-1500 words, no frontmatter, no h1 — start with a paragraph that validates the feeling>"
}`;

function buildUserPrompt(row) {
  return `Today's blog post.

JESS QUESTION (use as the title): ${row.question}
BEHAVIORAL CONCEPT TO FEATURE: ${row.concept}
CATEGORY: ${row.category}
PRIMARY ICP SEGMENT: ${row.icp}

Write the post now. JSON only.`;
}

// ───────────────────────────────────────────────────────────────
// Anthropic API call

async function callClaude(systemPrompt, userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${text}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error(`Empty response from Claude: ${JSON.stringify(data).slice(0, 500)}`);
  return text;
}

function parseClaudeJson(text) {
  // Claude is reliable about JSON-only when system prompts say so, but tolerate code fences.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Claude returned non-JSON. Raw response:\n', text);
    throw err;
  }
}

// ───────────────────────────────────────────────────────────────
// Markdown assembly

function buildMarkdown({ row, description, tags, body }) {
  const today = new Date().toISOString().slice(0, 10);
  const readingTime = estimateReadingTime(body);
  const tagList = (tags ?? []).map((t) => `"${t}"`).join(', ');
  const desc = description.length > 165 ? description.slice(0, 162).trim() + '...' : description;

  return `---
title: ${escapeYamlString(row.question)}
description: ${escapeYamlString(desc)}
pubDate: ${today}
category: ${escapeYamlString(row.category)}
tags: [${tagList}]
redditQuestion: ${escapeYamlString(row.question)}
readingTime: ${escapeYamlString(readingTime)}
---

${body.trim()}
`;
}

// ───────────────────────────────────────────────────────────────
// Main

async function main() {
  console.log(`[${new Date().toISOString()}] Starting daily blog post generator. Model: ${MODEL}`);

  const queueRaw = await readFile(QUEUE_PATH, 'utf8');
  const { lines, rows } = parseQueue(queueRaw);
  const next = pickNextQueued(rows);
  console.log(`Picked queue row #${next.num}: "${next.question}"`);

  const slug = slugify(next.question);
  const targetPath = join(BLOG_DIR, `${slug}.md`);

  if (existsSync(targetPath)) {
    console.error(`Target file already exists: ${targetPath}. Aborting to avoid overwrite.`);
    process.exit(2);
  }

  console.log('Calling Claude...');
  const responseText = await callClaude(SYSTEM_PROMPT, buildUserPrompt(next));
  const { description, tags, body } = parseClaudeJson(responseText);

  if (!description || !body) throw new Error('Claude response missing description or body.');

  const markdown = buildMarkdown({ row: next, description, tags, body });

  await mkdir(BLOG_DIR, { recursive: true });
  await writeFile(targetPath, markdown, 'utf8');
  console.log(`Wrote ${targetPath}`);

  const updatedQueue = markRowPublished(lines, next);
  await writeFile(QUEUE_PATH, updatedQueue, 'utf8');
  console.log(`Marked queue row #${next.num} as published.`);

  // Emit slug for downstream commit message
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_OUTPUT, `slug=${slug}\nquestion=${next.question}\n`);
  }

  console.log(`Done. New post slug: ${slug}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
