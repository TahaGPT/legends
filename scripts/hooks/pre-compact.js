#!/usr/bin/env node
/**
 * PreCompact hook - log compaction events.
 *
 * Appends one line per compaction (time, manual/auto, session, project) to
 * <claude dir>/sessions/compaction-log.txt, which helps when tuning
 * COMPACT_THRESHOLD for suggest-compact.js.
 *
 * It deliberately prints nothing to stdout: PreCompact stdout becomes
 * instructions for the compaction summary.
 *
 * Cross-platform (Windows, macOS, Linux). Never blocks: errors exit 0.
 */

const path = require('path');
const { getSessionsDir, getDateTimeString, ensureDir, appendFile, readStdinJsonSync, log } = require('../lib/utils');
const { shortId } = require('../lib/session-store');

function main() {
  const input = readStdinJsonSync();
  const sessionsDir = getSessionsDir();
  ensureDir(sessionsDir);
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const trigger = input.trigger || 'unknown';
  appendFile(
    path.join(sessionsDir, 'compaction-log.txt'),
    `[${getDateTimeString()}] ${trigger} compaction | session ${shortId(input.session_id)} | ${cwd}\n`
  );
  log(`[PreCompact] Logged ${trigger} compaction`);
}

try {
  main();
} catch (err) {
  log(`[PreCompact] Error: ${err.message}`);
}
process.exit(0);
