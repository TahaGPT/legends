#!/usr/bin/env node
/**
 * SessionStart hook - tell Claude where the last session in this project left off.
 *
 * Plain stdout from a SessionStart hook is added to Claude's context, so this
 * prints a short summary of the newest session record for the same project
 * (written by session-end.js): date, branch, last request, uncommitted files,
 * your notes, and whether a learning review was suggested. It stays silent when
 * there is nothing useful to say, and skips the summary after /compact (the
 * compaction summary already carries that context).
 *
 * In JS/TS projects with no package-manager preference it adds a one-line hint
 * about /setup-pm.
 *
 * Cross-platform (Windows, macOS, Linux). Never blocks: errors exit 0.
 */

const fs = require('fs');
const path = require('path');
const { getLearnedSkillsDir, findFiles, readStdinJsonSync, log } = require('../lib/utils');
const { latestRecordForProject } = require('../lib/session-store');
const { getPackageManager } = require('../lib/package-manager');

function previousSessionLines(cwd, sessionId) {
  const rec = latestRecordForProject(cwd, { excludeSessionId: sessionId });
  if (!rec) return [];
  const lines = [`[LEGENDS] Previous session in this project: ${rec.date}${rec.branch ? ` on branch ${rec.branch}` : ''} (${rec.messages || 0} user messages).`];
  if (rec.lastRequest) lines.push(`  Last request: ${rec.lastRequest}`);
  if (rec.changed.length) {
    const shown = rec.changed.slice(0, 5).join(', ');
    lines.push(`  Uncommitted files then: ${shown}${rec.changed.length > 5 ? ` (+${rec.changed.length - 5} more)` : ''}`);
  }
  if (rec.notes) lines.push(`  Notes: ${rec.notes.split('\n').slice(0, 5).join(' | ')}`);
  if (rec.learning) lines.push('  That session was long and not yet reviewed: consider /learn to extract reusable patterns.');
  lines.push(`  Full record: ${rec.file}`);
  return lines;
}

function main() {
  const input = readStdinJsonSync();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const lines = [];

  if (input.source !== 'compact') lines.push(...previousSessionLines(cwd, input.session_id));

  const learned = findFiles(getLearnedSkillsDir(), '*.md');
  if (learned.length && input.source !== 'compact') {
    lines.push(`[LEGENDS] ${learned.length} learned skill(s) in ${getLearnedSkillsDir()}`);
  }

  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    const pm = getPackageManager({ projectDir: cwd });
    if (pm.source === 'fallback' || pm.source === 'default') {
      lines.push(`[LEGENDS] No package manager preference set; using ${pm.name}. Run /setup-pm to choose one.`);
    }
  }

  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
}

try {
  main();
} catch (err) {
  log(`[SessionStart] Error: ${err.message}`);
}
process.exit(0);
