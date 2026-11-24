#!/usr/bin/env node
/**
 * Tool-event hooks for the LEGENDS plugin.
 *
 * Usage (from hooks.json):  node optional-hooks.js <event>
 *   events: pre-bash | pre-write | post-bash | post-edit | stop
 *
 * Opinionated behaviors are OFF by default. Enable them with the LEGENDS_HOOKS
 * environment variable (comma-separated), e.g. in ~/.claude/settings.json:
 *
 *   { "env": { "LEGENDS_HOOKS": "tmux,prettier,console-log" } }
 *
 * or LEGENDS_HOOKS=all for every one. Available flags:
 *
 *   tmux           block dev servers outside tmux; remind to use tmux for long commands
 *   push-reminder  reminder to review changes before `git push`
 *   block-md       block creating .md/.txt files other than README/CLAUDE/AGENTS/CONTRIBUTING
 *   prettier       run Prettier on edited JS/TS files
 *   typecheck      run `tsc --noEmit` after editing TS files and show errors for that file
 *   console-log    warn about console.log in edited files and at the end of a turn
 *
 * Always on (no flag): after `gh pr create`, print the PR URL and a review command.
 *
 * Exit codes follow Claude Code hook semantics: 0 = continue, 2 = block the tool
 * call (PreToolUse) and show stderr to Claude. Any internal error exits 0 so a
 * broken hook never blocks work.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ALL_FLAGS = ['tmux', 'push-reminder', 'block-md', 'prettier', 'typecheck', 'console-log'];
const ALLOWED_DOC_FILES = /(^|[\\/])(README|CLAUDE|AGENTS|CONTRIBUTING)\.md$/;
const DEV_SERVER = /\b(npm run dev|pnpm( run)? dev|yarn dev|bun( run)? dev)\b/;
const LONG_RUNNING = /\b(npm (install|test)|pnpm (install|test)|yarn( install| test)?|bun (install|test)|cargo (build|test)|make|docker|pytest|vitest|playwright)\b/;
const JS_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TS_FILE = /\.(ts|tsx)$/;

function enabledFlags(env = process.env) {
  const raw = (env.LEGENDS_HOOKS || '').trim().toLowerCase();
  if (!raw) return new Set();
  if (raw === 'all') return new Set(ALL_FLAGS);
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

function readInput() {
  try {
    const data = fs.readFileSync(0, 'utf8');
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function filePathOf(input) {
  return (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
}

function warn(lines) {
  for (const line of lines) process.stderr.write(`[Hook] ${line}\n`);
}

function block(lines) {
  warn(lines);
  process.exit(2);
}

function consoleLogLines(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /console\.log\(/.test(l) && !/^\s*\/\//.test(l))
      .map(({ l, i }) => `${i + 1}: ${l.trim()}`);
  } catch {
    return [];
  }
}

const handlers = {
  'pre-bash'(input, flags) {
    const cmd = (input.tool_input && input.tool_input.command) || '';
    if (flags.has('tmux') && !process.env.TMUX) {
      if (DEV_SERVER.test(cmd) && !/\btmux\b/.test(cmd)) {
        block([
          'BLOCKED: run dev servers in tmux so their logs stay accessible',
          'Use: tmux new-session -d -s dev "npm run dev"   then: tmux attach -t dev',
          '(Disable with LEGENDS_HOOKS without "tmux")'
        ]);
      }
      if (LONG_RUNNING.test(cmd)) warn(['Consider running long commands in tmux: tmux new -s dev']);
    }
    if (flags.has('push-reminder') && /\bgit push\b/.test(cmd)) {
      warn(['Reminder: review the diff before pushing (git log origin/HEAD..HEAD -p)']);
    }
  },

  'pre-write'(input, flags) {
    if (!flags.has('block-md')) return;
    const file = filePathOf(input);
    if (/\.(md|txt)$/.test(file) && !ALLOWED_DOC_FILES.test(file)) {
      block([
        `BLOCKED: creating documentation file ${file}`,
        'Put documentation in README.md (or CLAUDE.md / AGENTS.md / CONTRIBUTING.md)',
        '(Disable with LEGENDS_HOOKS without "block-md")'
      ]);
    }
  },

  'post-bash'(input) {
    const cmd = (input.tool_input && input.tool_input.command) || '';
    if (!/\bgh pr create\b/.test(cmd)) return;
    const resp = input.tool_response || input.tool_output || {};
    const text = typeof resp === 'string' ? resp : [resp.stdout, resp.output, JSON.stringify(resp)].filter(Boolean).join('\n');
    const m = text.match(/https:\/\/github\.com\/([^/\s"]+\/[^/\s"]+)\/pull\/(\d+)/);
    if (m) warn([`PR created: ${m[0]}`, `To review: gh pr review ${m[2]} --repo ${m[1]}`]);
  },

  'post-edit'(input, flags) {
    const file = filePathOf(input);
    if (!file || !fs.existsSync(file)) return;

    if (flags.has('prettier') && JS_FILE.test(file)) {
      try {
        execFileSync('npx', ['--no-install', 'prettier', '--write', file], { stdio: 'pipe', timeout: 30000 });
      } catch { /* prettier not installed or failed: never block */ }
    }

    if (flags.has('typecheck') && TS_FILE.test(file)) {
      let dir = path.dirname(path.resolve(file));
      while (dir !== path.dirname(dir) && !fs.existsSync(path.join(dir, 'tsconfig.json'))) dir = path.dirname(dir);
      if (fs.existsSync(path.join(dir, 'tsconfig.json'))) {
        let out = '';
        try {
          execFileSync('npx', ['--no-install', 'tsc', '--noEmit', '--pretty', 'false'], { cwd: dir, stdio: 'pipe', timeout: 120000 });
        } catch (e) {
          out = String(e.stdout || '');
        }
        const rel = path.relative(dir, path.resolve(file));
        const errors = out.split('\n').filter(l => l.includes(rel)).slice(0, 10);
        if (errors.length) warn([`Type errors in ${rel}:`, ...errors]);
      }
    }

    if (flags.has('console-log') && JS_FILE.test(file)) {
      const hits = consoleLogLines(file);
      if (hits.length) warn([`console.log found in ${file}:`, ...hits.slice(0, 5)]);
    }
  },

  'stop'(input, flags) {
    if (!flags.has('console-log')) return;
    let files = [];
    try {
      files = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' })
        .split('\n')
        .filter(f => JS_FILE.test(f) && fs.existsSync(f));
    } catch {
      return; // not a git repo
    }
    const withLogs = files.filter(f => consoleLogLines(f).length);
    if (withLogs.length) warn([`console.log in modified files: ${withLogs.join(', ')}`, 'Remove before committing']);
  }
};

function main() {
  const event = process.argv[2];
  const handler = handlers[event];
  if (!handler) {
    warn([`optional-hooks: unknown event "${event}"`]);
    process.exit(0);
  }
  try {
    handler(readInput(), enabledFlags());
  } catch (err) {
    warn([`optional-hooks (${event}) error: ${err.message}`]);
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { enabledFlags, ALL_FLAGS, handlers };
