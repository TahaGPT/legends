#!/usr/bin/env node
/**
 * Continuous Learning - session evaluator.
 *
 * Decides whether a session was long enough to be worth mining for reusable
 * patterns (see skills/continuous-learning). session-end.js calls this and
 * records "Learning review: suggested" in the session record; SessionStart then
 * tells Claude, which can run /learn.
 *
 * It can also be run directly for a quick check:
 *   echo '{"transcript_path":"/path/to/transcript.jsonl"}' | node evaluate-session.js
 *
 * Config: skills/continuous-learning/config.json (min_session_length,
 * learned_skills_path).
 */

const os = require('os');
const path = require('path');
const { getLearnedSkillsDir, readFile, readStdinJsonSync, log } = require('../lib/utils');
const { userPrompts } = require('../lib/session-store');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'skills', 'continuous-learning', 'config.json');

function loadConfig(configFile = CONFIG_FILE) {
  const config = { minSessionLength: 10, learnedSkillsPath: getLearnedSkillsDir() };
  const content = readFile(configFile);
  if (!content) return config;
  try {
    const parsed = JSON.parse(content);
    if (Number.isInteger(parsed.min_session_length) && parsed.min_session_length > 0) {
      config.minSessionLength = parsed.min_session_length;
    }
    if (parsed.learned_skills_path) {
      config.learnedSkillsPath = parsed.learned_skills_path.replace(/^~/, os.homedir());
    }
  } catch { /* invalid config: defaults */ }
  return config;
}

/**
 * @returns {{ prompts: number, worthReviewing: boolean, learnedSkillsPath: string }}
 */
function evaluate(transcriptPath, config = loadConfig()) {
  const prompts = transcriptPath ? userPrompts(transcriptPath).length : 0;
  return { prompts, worthReviewing: prompts >= config.minSessionLength, learnedSkillsPath: config.learnedSkillsPath };
}

function main() {
  const input = readStdinJsonSync();
  const transcriptPath = input.transcript_path || process.env.CLAUDE_TRANSCRIPT_PATH;
  const config = loadConfig();
  const result = evaluate(transcriptPath, config);
  if (!transcriptPath) {
    log('[ContinuousLearning] No transcript_path on stdin, nothing to evaluate');
  } else if (result.worthReviewing) {
    log(`[ContinuousLearning] Session has ${result.prompts} user messages: worth reviewing with /learn`);
    log(`[ContinuousLearning] Save learned skills to: ${result.learnedSkillsPath}`);
  } else {
    log(`[ContinuousLearning] Session too short (${result.prompts} user messages, minimum ${config.minSessionLength}), skipping`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    log(`[ContinuousLearning] Error: ${err.message}`);
  }
  process.exit(0);
}

module.exports = { loadConfig, evaluate };
