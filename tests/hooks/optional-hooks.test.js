/**
 * Tests for scripts/hooks/optional-hooks.js
 *
 * Spawns the script the way Claude Code does (JSON on stdin, event name as argv)
 * and checks exit codes (0 = continue, 2 = block) and stderr messages, both with
 * the opinionated hooks disabled (default) and enabled via LEGENDS_HOOKS.
 *
 * Run with: node tests/hooks/optional-hooks.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'hooks', 'optional-hooks.js');
const { enabledFlags, ALL_FLAGS } = require(SCRIPT);

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function run(event, input, env = {}) {
  const baseEnv = { ...process.env };
  delete baseEnv.LEGENDS_HOOKS;
  delete baseEnv.TMUX;
  const res = spawnSync('node', [SCRIPT, event], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...baseEnv, ...env },
    encoding: 'utf8'
  });
  return { code: res.status, stderr: res.stderr, stdout: res.stdout };
}

// Non-blocking messages arrive as JSON on stdout. Returns { toClaude, toUser } ('' if none).
function messages(r) {
  if (!r.stdout.trim()) return { toClaude: '', toUser: '' };
  const out = JSON.parse(r.stdout);
  return {
    toClaude: (out.hookSpecificOutput && out.hookSpecificOutput.additionalContext) || '',
    toUser: out.systemMessage || ''
  };
}

function runTests() {
  console.log('\n=== Testing optional-hooks.js ===\n');
  let passed = 0;
  let failed = 0;
  const t = (name, fn) => { if (test(name, fn)) passed++; else failed++; };

  const devServer = { tool_name: 'Bash', tool_input: { command: 'npm run dev' } };
  const strayDoc = { tool_name: 'Write', tool_input: { file_path: '/repo/docs/NOTES.md', content: 'x' } };

  console.log('Flag parsing:');
  t('no LEGENDS_HOOKS means no flags', () => assert.strictEqual(enabledFlags({}).size, 0));
  t('LEGENDS_HOOKS=all enables every flag', () => assert.deepStrictEqual([...enabledFlags({ LEGENDS_HOOKS: 'all' })].sort(), [...ALL_FLAGS].sort()));
  t('comma list is parsed and trimmed', () => {
    const f = enabledFlags({ LEGENDS_HOOKS: ' tmux , Prettier ' });
    assert.ok(f.has('tmux') && f.has('prettier') && f.size === 2);
  });

  console.log('\nDefaults (opinionated hooks off):');
  t('dev server is NOT blocked by default', () => {
    const r = run('pre-bash', devServer);
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.stderr, '');
    assert.strictEqual(r.stdout, '');
  });
  t('stray .md file is NOT blocked by default', () => assert.strictEqual(run('pre-write', strayDoc).code, 0));

  console.log('\ntmux flag:');
  t('dev server outside tmux is blocked with exit code 2', () => {
    const r = run('pre-bash', devServer, { LEGENDS_HOOKS: 'tmux' });
    assert.strictEqual(r.code, 2);
    assert.match(r.stderr, /BLOCKED/);
  });
  t('dev server inside tmux is allowed', () => assert.strictEqual(run('pre-bash', devServer, { LEGENDS_HOOKS: 'tmux', TMUX: '/tmp/tmux-1/default,1,0' }).code, 0));
  t('long-running command gets a non-blocking reminder', () => {
    const r = run('pre-bash', { tool_input: { command: 'pytest -q' } }, { LEGENDS_HOOKS: 'tmux' });
    assert.strictEqual(r.code, 0);
    const m = messages(r);
    assert.match(m.toClaude, /tmux/);
    assert.match(m.toUser, /tmux/);
    assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.hookEventName, 'PreToolUse');
  });

  console.log('\npush-reminder flag:');
  t('git push prints a reminder without blocking', () => {
    const r = run('pre-bash', { tool_input: { command: 'git push origin main' } }, { LEGENDS_HOOKS: 'push-reminder' });
    assert.strictEqual(r.code, 0);
    assert.match(messages(r).toClaude, /review/i);
  });

  console.log('\nblock-md flag:');
  t('stray .md file is blocked with exit code 2', () => {
    const r = run('pre-write', strayDoc, { LEGENDS_HOOKS: 'block-md' });
    assert.strictEqual(r.code, 2);
    assert.match(r.stderr, /NOTES\.md/);
  });
  t('README.md / CLAUDE.md / CONTRIBUTING.md are allowed', () => {
    for (const f of ['/repo/README.md', '/repo/CLAUDE.md', '/repo/pkg/CONTRIBUTING.md']) {
      assert.strictEqual(run('pre-write', { tool_input: { file_path: f } }, { LEGENDS_HOOKS: 'block-md' }).code, 0, f);
    }
  });
  t('source files are never blocked', () => assert.strictEqual(run('pre-write', { tool_input: { file_path: '/repo/src/a.ts' } }, { LEGENDS_HOOKS: 'all' }).code, 0));

  console.log('\nconsole-log flag:');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legends-hooks-'));
  const jsFile = path.join(dir, 'a.ts');
  fs.writeFileSync(jsFile, 'const x = 1\nconsole.log(x)\n// console.log(commented)\n');
  t('edited file with console.log warns when enabled', () => {
    const r = run('post-edit', { tool_input: { file_path: jsFile } }, { LEGENDS_HOOKS: 'console-log' });
    assert.strictEqual(r.code, 0);
    const m = messages(r);
    assert.match(m.toClaude, /2: console\.log\(x\)/);
    assert.doesNotMatch(m.toClaude, /commented/);
    assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.hookEventName, 'PostToolUse');
  });
  t('edited file with console.log is silent when disabled', () => {
    const r = run('post-edit', { tool_input: { file_path: jsFile } });
    assert.strictEqual(r.stdout + r.stderr, '');
  });
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('\nPR hint (always on):');
  t('gh pr create output prints the PR URL and review command', () => {
    const r = run('post-bash', {
      tool_input: { command: 'gh pr create --title x' },
      tool_response: { stdout: 'https://github.com/acme/widgets/pull/42\n' }
    });
    assert.strictEqual(r.code, 0);
    assert.match(messages(r).toClaude, /gh pr review 42 --repo acme\/widgets/);
  });
  t('other bash commands print nothing', () => {
    const r = run('post-bash', { tool_input: { command: 'ls' }, tool_response: { stdout: '' } });
    assert.strictEqual(r.stdout + r.stderr, '');
  });
  t('blocking messages go to stderr, not stdout JSON', () => {
    const r = run('pre-bash', devServer, { LEGENDS_HOOKS: 'tmux' });
    assert.strictEqual(r.stdout, '');
    assert.match(r.stderr, /BLOCKED/);
  });

  console.log('\nRobustness:');
  t('malformed stdin never blocks', () => assert.strictEqual(run('pre-bash', '{not json', { LEGENDS_HOOKS: 'all' }).code, 0));
  t('unknown event exits 0', () => assert.strictEqual(run('nope', {}).code, 0));
  t('missing edited file is ignored', () => assert.strictEqual(run('post-edit', { tool_input: { file_path: '/does/not/exist.ts' } }, { LEGENDS_HOOKS: 'all' }).code, 0));

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
