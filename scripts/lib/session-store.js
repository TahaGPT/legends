/**
 * Session records for the LEGENDS session hooks.
 *
 * SessionEnd writes one small Markdown record per session to
 * <claude dir>/sessions/<YYYY-MM-DD>-<id8>.tmp. SessionStart reads the newest
 * record for the same project and tells Claude where the last session left off.
 *
 * Everything is derived from data Claude Code passes on stdin (session_id,
 * transcript_path, cwd) plus git; nothing is sent anywhere.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getSessionsDir, getDateString, getTimeString, ensureDir } = require('./utils');

const NOTES_HEADING = '### Notes for Next Session';
const NOTES_PLACEHOLDER = '- (add notes here; they are kept when this record is updated)';

function shortId(sessionId) {
  const id = String(sessionId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 8);
  return id || 'session';
}

function recordPath(sessionId, date = getDateString()) {
  return path.join(getSessionsDir(), `${date}-${shortId(sessionId)}.tmp`);
}

/** Find an existing record for this session id from any date. */
function findRecordForSession(sessionId) {
  const dir = getSessionsDir();
  if (!sessionId || !fs.existsSync(dir)) return null;
  const suffix = `-${shortId(sessionId)}.tmp`;
  const match = fs.readdirSync(dir).filter(f => f.endsWith(suffix)).sort().pop();
  return match ? path.join(dir, match) : null;
}

/**
 * Real user prompts in a transcript (JSONL): skips tool results, meta entries,
 * and harness-injected text such as <command-name> or <system-reminder> blocks.
 */
function userPrompts(transcriptPath) {
  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return [];
  }
  const prompts = [];
  for (const line of raw.split('\n')) {
    if (!line.includes('"user"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'user' || entry.isMeta) continue;
    const content = entry.message ? entry.message.content : entry.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      if (content.some(c => c && c.type === 'tool_result')) continue;
      text = content.filter(c => c && c.type === 'text').map(c => c.text).join(' ');
    }
    text = text.trim();
    if (text && !text.startsWith('<')) prompts.push(text);
  }
  return prompts;
}

// Output is only right-trimmed: `git status --porcelain` lines start with a
// significant space (" M file"), so trimming the start would eat a character.
function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trimEnd();
  } catch {
    return '';
  }
}

function gitState(cwd) {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch) return { branch: '', changed: [] };
  const changed = git(cwd, ['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3).replace(/^"|"$/g, ''))
    .map(l => (l.includes(' -> ') ? l.split(' -> ')[1] : l));
  return { branch, changed };
}

function oneLine(text, max = 200) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** Notes section of an existing record (kept across updates). */
function existingNotes(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const i = content.indexOf(NOTES_HEADING);
    if (i !== -1) return content.slice(i + NOTES_HEADING.length).replace(/^\n+/, '').trimEnd();
  } catch { /* new record */ }
  return NOTES_PLACEHOLDER;
}

/**
 * Write or update the record for a session.
 * @param {object} input - hook stdin: { session_id, transcript_path, cwd, reason }
 * @param {object} options - { minSessionLength } for the learning-review hint
 * @returns {{ file: string, prompts: number, learningSuggested: boolean }}
 */
function writeSessionRecord(input, { minSessionLength = 10 } = {}) {
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const sessionId = input.session_id || '';
  ensureDir(getSessionsDir());

  const file = findRecordForSession(sessionId) || recordPath(sessionId);
  const prompts = input.transcript_path ? userPrompts(input.transcript_path) : [];
  const { branch, changed } = gitState(cwd);
  const learningSuggested = prompts.length >= minSessionLength;

  const lines = [
    `# Session: ${path.basename(file, '.tmp')}`,
    `**Project:** ${cwd}`,
    `**Session ID:** ${sessionId || 'unknown'}`,
    `**Date:** ${getDateString()}`,
    `**Last Updated:** ${getTimeString()}`
  ];
  if (branch) lines.push(`**Branch:** ${branch}`);
  lines.push(`**User messages:** ${prompts.length}`);
  if (prompts.length) lines.push(`**Last request:** ${oneLine(prompts[prompts.length - 1])}`);
  if (input.reason) lines.push(`**End reason:** ${input.reason}`);
  if (learningSuggested) lines.push('**Learning review:** suggested (long session; run /learn to extract reusable patterns)');
  lines.push('');
  if (changed.length) {
    lines.push('### Uncommitted changes at end of session');
    for (const f of changed.slice(0, 20)) lines.push(`- ${f}`);
    if (changed.length > 20) lines.push(`- ... and ${changed.length - 20} more`);
    lines.push('');
  }
  lines.push(NOTES_HEADING, existingNotes(file), '');

  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return { file, prompts: prompts.length, learningSuggested };
}

function field(content, name) {
  const m = content.match(new RegExp(`^\\*\\*${name}:\\*\\* (.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

/**
 * Newest record for a project (within maxAgeDays), excluding the current session.
 * @returns {null | { file, date, branch, messages, lastRequest, learning, changed: string[], notes: string }}
 */
function latestRecordForProject(cwd, { excludeSessionId = '', maxAgeDays = 7 } = {}) {
  const dir = getSessionsDir();
  if (!fs.existsSync(dir)) return null;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const candidates = fs.readdirSync(dir)
    .filter(f => f.endsWith('.tmp'))
    .map(f => path.join(dir, f))
    .map(f => ({ f, mtime: fs.statSync(f).mtimeMs }))
    .filter(x => x.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);

  for (const { f } of candidates) {
    let content;
    try {
      content = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (field(content, 'Project') !== cwd) continue;
    if (excludeSessionId && field(content, 'Session ID') === excludeSessionId) continue;

    const changedSection = content.split('### Uncommitted changes at end of session')[1] || '';
    const changed = changedSection.split('###')[0].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2));
    const notes = existingNotes(f);
    return {
      file: f,
      date: field(content, 'Date'),
      branch: field(content, 'Branch'),
      messages: field(content, 'User messages'),
      lastRequest: field(content, 'Last request'),
      learning: field(content, 'Learning review'),
      changed,
      notes: notes === NOTES_PLACEHOLDER ? '' : notes
    };
  }
  return null;
}

module.exports = {
  shortId,
  recordPath,
  findRecordForSession,
  userPrompts,
  writeSessionRecord,
  latestRecordForProject,
  NOTES_HEADING
};
