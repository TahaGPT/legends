#!/usr/bin/env node
/**
 * Strategic Compact Suggester (PreToolUse on Edit|Write|MultiEdit).
 *
 * Counts edit tool calls per session and, at COMPACT_THRESHOLD (default 50)
 * and every 25 calls after, suggests a manual /compact at a logical boundary.
 * The suggestion goes to both Claude (additionalContext) and the user
 * (systemMessage); plain stderr would be invisible to Claude.
 *
 * Why manual over auto-compact:
 * - Auto-compact happens at arbitrary points, often mid-task
 * - Strategic compacting preserves context through logical phases
 * - Compact after exploration, before execution; after a milestone, before the next
 *
 * Cross-platform (Windows, macOS, Linux). Never blocks: errors exit 0.
 */

const path = require('path');
const { getTempDir, readFile, writeFile, readStdinJsonSync, emitHookOutput, log } = require('../lib/utils');

function counterFileFor(sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'default';
  return path.join(getTempDir(), `claude-tool-count-${safe}`);
}

function main() {
  const input = readStdinJsonSync();
  // session_id arrives on stdin; the env var is only a fallback for manual runs and tests.
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || 'default';
  const counterFile = counterFileFor(sessionId);
  const threshold = parseInt(process.env.COMPACT_THRESHOLD || '50', 10) || 50;

  const previous = parseInt((readFile(counterFile) || '').trim(), 10);
  const count = Number.isFinite(previous) ? previous + 1 : 1;
  writeFile(counterFile, String(count));

  if (count === threshold) {
    emitHookOutput('PreToolUse', `[StrategicCompact] ${threshold} edit tool calls reached - consider /compact if transitioning phases`);
  } else if (count > threshold && count % 25 === 0) {
    emitHookOutput('PreToolUse', `[StrategicCompact] ${count} edit tool calls - good checkpoint for /compact if context is stale`);
  }
}

try {
  main();
} catch (err) {
  log(`[StrategicCompact] Error: ${err.message}`);
}
process.exit(0);
