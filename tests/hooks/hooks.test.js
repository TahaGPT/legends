/**
 * Tests for hook scripts
 *
 * Run with: node tests/hooks/hooks.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');

// Test helper
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

// Async test helper
async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

// Run a script and capture output
function runScript(scriptPath, input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

// Create a temporary test directory
function createTestDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
}

// Clean up test directory
function cleanupTestDir(testDir) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// Test suite
async function runTests() {
  console.log('\n=== Testing Hook Scripts ===\n');

  let passed = 0;
  let failed = 0;

  const scriptsDir = path.join(__dirname, '..', '..', 'scripts', 'hooks');

  // All session hooks run against a temporary CLAUDE_CONFIG_DIR so the suite
  // never touches the real ~/.claude.
  const configDir = createTestDir();
  const projectDir = createTestDir();
  const env = { CLAUDE_CONFIG_DIR: configDir };
  const sessionsDir = path.join(configDir, 'sessions');
  const transcriptOf = (prompts) => {
    const file = path.join(projectDir, `transcript-${Date.now()}-${Math.random()}.jsonl`);
    const lines = [];
    prompts.forEach((p, i) => {
      lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: p } }));
      lines.push(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `ok ${i}` }] } }));
      lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'out' }] } }));
    });
    lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: '<command-name>/model</command-name>' } }));
    lines.push(JSON.stringify({ type: 'user', isMeta: true, message: { role: 'user', content: 'meta' } }));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return file;
  };
  const endSession = (sessionId, prompts, extra = {}) => runScript(
    path.join(scriptsDir, 'session-end.js'),
    JSON.stringify({ session_id: sessionId, transcript_path: transcriptOf(prompts), cwd: projectDir, hook_event_name: 'SessionEnd', reason: 'prompt_input_exit', ...extra }),
    env
  );
  const startSession = (sessionId, extra = {}) => runScript(
    path.join(scriptsDir, 'session-start.js'),
    JSON.stringify({ session_id: sessionId, cwd: projectDir, hook_event_name: 'SessionStart', source: 'startup', ...extra }),
    env
  );

  // session-end.js tests
  console.log('session-end.js:');

  if (await asyncTest('runs without error on empty stdin', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-end.js'), '', env);
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
    assert.strictEqual(result.stdout, '', 'SessionEnd output is never shown to Claude, so stdout stays empty');
  })) passed++; else failed++;

  if (await asyncTest('writes a record with project, real prompt count and last request', async () => {
    const result = await endSession('aaaa1111-test', ['first task', 'second task', 'fix the login bug']);
    assert.strictEqual(result.code, 0);
    const file = fs.readdirSync(sessionsDir).find(f => f.endsWith('-aaaa1111.tmp'));
    assert.ok(file, 'record named <date>-<id8>.tmp should exist');
    const content = fs.readFileSync(path.join(sessionsDir, file), 'utf8');
    assert.ok(content.includes(`**Project:** ${projectDir}`), 'records the project path');
    assert.ok(content.includes('**User messages:** 3'), 'counts only real prompts (no tool results, commands or meta)');
    assert.ok(content.includes('**Last request:** fix the login bug'));
    assert.ok(!content.includes('Learning review'), 'short session gets no learning hint');
  })) passed++; else failed++;

  if (await asyncTest('keeps hand-written notes when the record is updated', async () => {
    const file = path.join(sessionsDir, fs.readdirSync(sessionsDir).find(f => f.endsWith('-aaaa1111.tmp')));
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/- \(add notes here[^\n]*/, '- remember to rotate the API key'));
    await endSession('aaaa1111-test', ['one more']);
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes('remember to rotate the API key'), 'notes preserved');
    assert.ok(content.includes('**User messages:** 1'), 'auto fields refreshed');
  })) passed++; else failed++;

  if (await asyncTest('long sessions get a learning-review suggestion', async () => {
    await endSession('bbbb2222-test', Array.from({ length: 12 }, (_, i) => `task ${i}`));
    const file = fs.readdirSync(sessionsDir).find(f => f.endsWith('-bbbb2222.tmp'));
    const content = fs.readFileSync(path.join(sessionsDir, file), 'utf8');
    assert.ok(content.includes('**Learning review:** suggested'));
  })) passed++; else failed++;

  if (await asyncTest('lists uncommitted files with their full names', async () => {
    const repo = createTestDir();
    const { execFileSync } = require('child_process');
    const g = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
    g('init', '-q'); g('config', 'user.email', 't@example.com'); g('config', 'user.name', 't');
    fs.writeFileSync(path.join(repo, 'README.md'), 'a'); g('add', '.'); g('commit', '-qm', 'init');
    fs.writeFileSync(path.join(repo, 'README.md'), 'b'); fs.writeFileSync(path.join(repo, 'new.txt'), 'n');
    await runScript(path.join(scriptsDir, 'session-end.js'), JSON.stringify({ session_id: 'gggg7777', cwd: repo }), env);
    const content = fs.readFileSync(path.join(sessionsDir, fs.readdirSync(sessionsDir).find(f => f.endsWith('-gggg7777.tmp'))), 'utf8');
    assert.ok(content.includes('- README.md'), content);
    assert.ok(content.includes('- new.txt'), content);
    cleanupTestDir(repo);
  })) passed++; else failed++;

  // session-start.js tests
  console.log('\nsession-start.js:');

  if (await asyncTest('prints the previous session for this project to stdout (Claude context)', async () => {
    const result = await startSession('cccc3333-test');
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes('[LEGENDS] Previous session in this project'), result.stdout);
    assert.ok(result.stdout.includes('consider /learn'), 'surfaces the learning suggestion from bbbb2222');
  })) passed++; else failed++;

  if (await asyncTest('does not show the current session as "previous" (resume)', async () => {
    // Make aaaa1111 the newest record, then start as that same session.
    const file = path.join(sessionsDir, fs.readdirSync(sessionsDir).find(f => f.endsWith('-aaaa1111.tmp')));
    const now = new Date();
    fs.utimesSync(file, now, new Date(now.getTime() + 60000));
    const result = await startSession('aaaa1111-test', { source: 'resume' });
    assert.ok(!result.stdout.includes('rotate the API key'), 'own record excluded');
    assert.ok(result.stdout.includes('Previous session'), 'falls back to the other record');
  })) passed++; else failed++;

  if (await asyncTest('shows notes from the previous record', async () => {
    const result = await startSession('dddd4444-test');
    assert.ok(result.stdout.includes('Notes: - remember to rotate the API key'), result.stdout);
  })) passed++; else failed++;

  if (await asyncTest('ignores records from other projects', async () => {
    const other = createTestDir();
    const result = await runScript(path.join(scriptsDir, 'session-start.js'), JSON.stringify({ session_id: 'x', cwd: other, source: 'startup' }), env);
    assert.strictEqual(result.code, 0);
    assert.ok(!result.stdout.includes('Previous session'), 'no cross-project leakage');
    cleanupTestDir(other);
  })) passed++; else failed++;

  if (await asyncTest('stays quiet after /compact', async () => {
    const result = await startSession('cccc3333-test', { source: 'compact' });
    assert.ok(!result.stdout.includes('Previous session'));
  })) passed++; else failed++;

  if (await asyncTest('no package-manager prompt outside JS projects', async () => {
    const result = await startSession('eeee5555-test');
    assert.ok(!/package manager/i.test(result.stdout), 'projects without package.json get no PM hint');
  })) passed++; else failed++;

  // pre-compact.js tests
  console.log('\npre-compact.js:');

  if (await asyncTest('logs the compaction and prints nothing to stdout', async () => {
    const result = await runScript(path.join(scriptsDir, 'pre-compact.js'), JSON.stringify({ session_id: 'ffff6666-test', cwd: projectDir, trigger: 'auto' }), env);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, '', 'PreCompact stdout would become compaction instructions');
    const logText = fs.readFileSync(path.join(sessionsDir, 'compaction-log.txt'), 'utf8');
    assert.ok(logText.includes('auto compaction | session ffff6666'), logText);
  })) passed++; else failed++;

  // suggest-compact.js tests
  console.log('\nsuggest-compact.js:');

  const counterFor = (id) => path.join(os.tmpdir(), `claude-tool-count-${id}`);

  if (await asyncTest('counts per session_id from stdin', async () => {
    const sessionId = 'test-counter-' + Date.now();
    for (let i = 0; i < 3; i++) {
      const r = await runScript(path.join(scriptsDir, 'suggest-compact.js'), JSON.stringify({ session_id: sessionId, tool_name: 'Edit' }));
      assert.strictEqual(r.code, 0);
    }
    const count = parseInt(fs.readFileSync(counterFor(sessionId), 'utf8').trim(), 10);
    assert.strictEqual(count, 3, `Counter should be 3, got ${count}`);
    fs.unlinkSync(counterFor(sessionId));
  })) passed++; else failed++;

  if (await asyncTest('suggests compact at threshold to Claude and the user', async () => {
    const sessionId = 'test-threshold-' + Date.now();
    fs.writeFileSync(counterFor(sessionId), '49');
    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), JSON.stringify({ session_id: sessionId }), { COMPACT_THRESHOLD: '50' });
    const out = JSON.parse(result.stdout);
    assert.ok(out.hookSpecificOutput.additionalContext.includes('50 edit tool calls reached'));
    assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.ok(out.systemMessage.includes('/compact'));
    fs.unlinkSync(counterFor(sessionId));
  })) passed++; else failed++;

  if (await asyncTest('silent below threshold', async () => {
    const sessionId = 'test-quiet-' + Date.now();
    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), JSON.stringify({ session_id: sessionId }));
    assert.strictEqual(result.stdout, '');
    fs.unlinkSync(counterFor(sessionId));
  })) passed++; else failed++;

  // evaluate-session.js tests
  console.log('\nevaluate-session.js:');

  if (await asyncTest('runs without error when no transcript', async () => {
    const result = await runScript(path.join(scriptsDir, 'evaluate-session.js'));
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('reads transcript_path from stdin and skips short sessions', async () => {
    const result = await runScript(path.join(scriptsDir, 'evaluate-session.js'), JSON.stringify({ transcript_path: transcriptOf(['a', 'b']) }));
    assert.ok(result.stderr.includes('Session too short (2 user messages'), result.stderr);
  })) passed++; else failed++;

  if (await asyncTest('flags long sessions for /learn', async () => {
    const result = await runScript(path.join(scriptsDir, 'evaluate-session.js'), JSON.stringify({ transcript_path: transcriptOf(Array(15).fill('task')) }));
    assert.ok(result.stderr.includes('15 user messages'), result.stderr);
  })) passed++; else failed++;

  if (test('suite did not write to the real ~/.claude/sessions', () => {
    assert.ok(fs.existsSync(path.join(sessionsDir, 'compaction-log.txt')), 'writes went to the temp config dir');
  })) passed++; else failed++;

  cleanupTestDir(configDir);
  cleanupTestDir(projectDir);

  // hooks.json validation
  console.log('\nhooks.json Validation:');

  if (test('hooks.json is valid JSON', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const content = fs.readFileSync(hooksPath, 'utf8');
    JSON.parse(content); // Will throw if invalid
  })) passed++; else failed++;

  if (test('hooks.json has required event types', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    assert.ok(hooks.hooks.PreToolUse, 'Should have PreToolUse hooks');
    assert.ok(hooks.hooks.PostToolUse, 'Should have PostToolUse hooks');
    assert.ok(hooks.hooks.SessionStart, 'Should have SessionStart hooks');
    assert.ok(hooks.hooks.Stop, 'Should have Stop hooks');
    assert.ok(hooks.hooks.PreCompact, 'Should have PreCompact hooks');
  })) passed++; else failed++;

  if (test('all hook commands use node', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    const checkHooks = (hookArray) => {
      for (const entry of hookArray) {
        for (const hook of entry.hooks) {
          if (hook.type === 'command') {
            assert.ok(
              hook.command.startsWith('node'),
              `Hook command should start with 'node': ${hook.command.substring(0, 50)}...`
            );
          }
        }
      }
    };

    for (const [eventType, hookArray] of Object.entries(hooks.hooks)) {
      checkHooks(hookArray);
    }
  })) passed++; else failed++;

  if (test('script references use CLAUDE_PLUGIN_ROOT variable', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    const checkHooks = (hookArray) => {
      for (const entry of hookArray) {
        for (const hook of entry.hooks) {
          if (hook.type === 'command' && hook.command.includes('scripts/hooks/')) {
            // Check for the literal string "${CLAUDE_PLUGIN_ROOT}" in the command
            const hasPluginRoot = hook.command.includes('${CLAUDE_PLUGIN_ROOT}');
            assert.ok(
              hasPluginRoot,
              `Script paths should use CLAUDE_PLUGIN_ROOT: ${hook.command.substring(0, 80)}...`
            );
          }
        }
      }
    };

    for (const [eventType, hookArray] of Object.entries(hooks.hooks)) {
      checkHooks(hookArray);
    }
  })) passed++; else failed++;

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
