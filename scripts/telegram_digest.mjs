/**
 * Build a short analytics digest from the BullDozer datasets and post it to
 * Telegram. Mirrors the Madeira Ativa digest bot, generalised to any dataset.
 *
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy node scripts/telegram_digest.mjs
 *
 * Secrets are read from the environment — nothing is hard-coded.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIRS = ['surveys', 'macro'].map((d) => join(__dirname, '..', 'src', 'data', d));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function lastTwoPeriods(data) {
  const p = [...new Set(data.map((d) => d.period))].sort();
  return [p[p.length - 2], p[p.length - 1]];
}

// Percentage / rate units change in points; everything else multiplicatively.
const changeMode = (unit) => (String(unit).includes('%') ? 'pp' : 'pct');
const changeValue = (cv, pv, mode) => (mode === 'pp' ? cv - pv : pv ? ((cv - pv) / pv) * 100 : 0);

function topMovers(data, mode, n = 3) {
  const [prev, curr] = lastTwoPeriods(data);
  const sum = (period) => {
    const m = new Map();
    for (const d of data) if (d.period === period) m.set(d.entity, (m.get(d.entity) ?? 0) + d.value);
    return m;
  };
  const c = sum(curr);
  const p = sum(prev);
  const changes = [];
  for (const e of new Set([...c.keys(), ...p.keys()])) {
    const cv = c.get(e) ?? 0;
    const pv = p.get(e) ?? 0;
    if (mode === 'pct' && !pv) continue;
    changes.push({ entity: e, val: changeValue(cv, pv, mode) });
  }
  changes.sort((a, b) => b.val - a.val);
  return {
    period: curr,
    mode,
    up: changes.filter((x) => x.val > 0).slice(0, n),
    down: changes.filter((x) => x.val < 0).slice(-n).reverse(),
  };
}

async function loadDatasets() {
  const out = [];
  for (const dir of DATA_DIRS) {
    let files = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      const json = JSON.parse(await readFile(join(dir, f), 'utf8'));
      out.push({ meta: json.meta, data: json.data });
    }
  }
  return out;
}

function fmtChange(v, mode) {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}${mode === 'pp' ? 'pp' : '%'}`;
}

function buildMessage(datasets) {
  const lines = ['*BullDozer — analytics digest*', ''];
  for (const ds of datasets) {
    const mode = changeMode(ds.meta.unit);
    const m = topMovers(ds.data, mode);
    lines.push(`*${ds.meta.title}* _(${m.period})_`);
    if (m.up[0]) lines.push(`  ↑ ${m.up.map((x) => `${x.entity} ${fmtChange(x.val, mode)}`).join(', ')}`);
    if (m.down[0]) lines.push(`  ↓ ${m.down.map((x) => `${x.entity} ${fmtChange(x.val, mode)}`).join(', ')}`);
    lines.push('');
  }
  lines.push('https://bulldozer.azenha.ai/');
  return lines.join('\n');
}

// The weekly AI review is built once, by the morning-brief pipeline in
// AzenhaAI/azenha, and read here, by the Ask AI page and by the owner's mail,
// so the three never disagree. An issue older than eight days is a pipeline
// that stopped, and is skipped rather than reposted.
const AI_WEEKLY = 'https://azenha.ai/ai-weekly/latest.json';
const AI_SECTIONS = [['news', 'AI this week'], ['theory', 'Theory & papers']];

// Legacy Markdown: these four open an entity unless escaped.
const md = (s) => String(s).replace(/([_*`[])/g, '\\$1');
// Inside a link's text nothing can be escaped, so those characters go.
const linkText = (s) => String(s).replace(/[_*`[\]]/g, ' ').replace(/ +/g, ' ').trim();

async function buildAiMessage() {
  let issue;
  try {
    const res = await fetch(AI_WEEKLY);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    issue = await res.json();
  } catch (err) {
    console.warn('AI weekly unavailable:', err.message);
    return null;
  }
  const age = Date.now() - Date.parse(issue.id);
  if (!(age < 8 * 86400e3)) return null;
  const lines = [`*🤖 BullDozer — AI weekly, ${md(issue.id)}*`, ''];
  for (const [key, title] of AI_SECTIONS) {
    const items = (issue.sections?.[key] || []).slice(0, 3);
    if (!items.length) continue;
    lines.push(`*${title}*`);
    for (const it of items) lines.push(`• [${linkText(it.en || it.title)}](${it.url}) — ${md(it.outlet)}`);
    lines.push('');
  }
  if (lines.length === 2) return null;
  lines.push('https://azenha.ai/bulldozer/ask/');
  return lines.join('\n');
}

async function main() {
  const datasets = await loadDatasets();
  // A message of its own, sent whether or not the analytics digest goes through.
  const messages = [buildMessage(datasets), await buildAiMessage()].filter(Boolean);

  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('No TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID set — dry run. Messages:\n');
    console.log(messages.join('\n\n────────\n\n'));
    return;
  }

  const failed = [];
  for (const text of messages) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    const body = await res.json();
    if (!body.ok) failed.push(body.description);
  }
  if (failed.length) throw new Error(`Telegram API: ${failed.join('; ')}`);
  console.log(`✓ ${messages.length} message(s) sent to Telegram chat`, CHAT_ID);
}

main().catch((err) => {
  console.error('✗ Digest failed:', err.message);
  process.exit(1);
});
