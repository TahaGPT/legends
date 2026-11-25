#!/usr/bin/env node
/**
 * SessionEnd hook - record where this session left off.
 *
 * Writes <claude dir>/sessions/<date>-<id8>.tmp with the project path, branch,
 * number of user messages, the last request, uncommitted files, and a
 * "Learning review: suggested" line for long sessions. The next SessionStart in
 * the same project surfaces it to Claude. A "Notes for Next Session" section is
 * preserved when the record is updated, so you can add notes by hand.
 *
 * Learning evaluation used to be a separate SessionEnd hook, but hooks for the
 * same event run in parallel and both wrote the same file, so it runs here.
 *
 * Cross-platform (Windows, macOS, Linux). Never blocks: errors exit 0.
 */

const { readStdinJsonSync, log } = require('../lib/utils');
const { writeSessionRecord } = require('../lib/session-store');
const { loadConfig } = require('./evaluate-session');

function main() {
  const input = readStdinJsonSync();
  const { minSessionLength } = loadConfig();
  const { file, prompts, learningSuggested } = writeSessionRecord(input, { minSessionLength });
  // SessionEnd output is never shown to Claude; stderr is for the user's logs only.
  log(`[SessionEnd] Saved session record (${prompts} messages${learningSuggested ? ', learning review suggested' : ''}): ${file}`);
}

try {
  main();
} catch (err) {
  log(`[SessionEnd] Error: ${err.message}`);
}
process.exit(0);
