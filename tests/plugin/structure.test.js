/**
 * Structural validation for the plugin's agents, skills, commands, manifests, and hooks.
 *
 * Catches the class of bugs that are otherwise silent at runtime:
 * skills or commands without frontmatter (never discovered or undocumented),
 * agents referenced by commands that don't exist, invalid model or tool names,
 * reviewer agents that gained write access, broken hook script paths, and
 * manifest drift.
 *
 * Run with: node tests/plugin/structure.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const SKILLS_DIR = path.join(ROOT, 'skills');
const COMMANDS_DIR = path.join(ROOT, 'commands');

const KNOWN_TOOLS = new Set([
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebFetch', 'WebSearch',
  'NotebookEdit', 'Task', 'Agent', 'TodoWrite'
]);
const MODEL_ALIASES = new Set(['opus', 'sonnet', 'haiku', 'inherit']);
// Agents whose job is to judge or investigate, never to change code.
const READ_ONLY_AGENTS = ['code-reviewer', 'security-reviewer', 'explorer', 'planner', 'architect'];
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit'];
// Handoff targets that are roles, not agents.
const NON_AGENT_HANDOFF_TARGETS = new Set(['orchestrator', 'user', 'next-agent', 'previous-agent']);

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

/** Minimal YAML frontmatter parser for flat `key: value` pairs. */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[kv[1]] = value;
  }
  return data;
}

function listMarkdown(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------------------
// Load everything once
// ---------------------------------------------------------------------------

const agents = listMarkdown(AGENTS_DIR).map(file => {
  const content = read(path.join(AGENTS_DIR, file));
  return { file, id: file.replace(/\.md$/, ''), content, fm: parseFrontmatter(content) };
});
const agentIds = new Set(agents.map(a => a.id));

const skillDirs = fs.readdirSync(SKILLS_DIR)
  .filter(d => fs.statSync(path.join(SKILLS_DIR, d)).isDirectory())
  .sort();
const skills = skillDirs.map(dir => {
  const file = path.join(SKILLS_DIR, dir, 'SKILL.md');
  const exists = fs.existsSync(file);
  const content = exists ? read(file) : '';
  return { dir, file, exists, content, fm: exists ? parseFrontmatter(content) : null };
});
const skillIds = new Set(skills.map(s => s.dir));

const commands = listMarkdown(COMMANDS_DIR).map(file => {
  const content = read(path.join(COMMANDS_DIR, file));
  return { file, id: file.replace(/\.md$/, ''), content, fm: parseFrontmatter(content) };
});

const markdownSources = [
  ...agents.map(a => ({ where: `agents/${a.file}`, content: a.content })),
  ...commands.map(c => ({ where: `commands/${c.file}`, content: c.content })),
  ...skills.filter(s => s.exists).map(s => ({ where: `skills/${s.dir}/SKILL.md`, content: s.content }))
];

function assertNoProblems(problems) {
  assert.strictEqual(problems.length, 0, '\n      ' + problems.join('\n      '));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function runTests() {
  console.log('\n=== Testing plugin structure ===\n');
  let passed = 0;
  let failed = 0;
  const run = (name, fn) => { if (test(name, fn)) passed++; else failed++; };

  console.log('Agents:');

  run(`all ${agents.length} agents have frontmatter with name matching the filename`, () => {
    const problems = [];
    for (const a of agents) {
      if (!a.fm) { problems.push(`${a.file}: missing frontmatter`); continue; }
      if (a.fm.name !== a.id) problems.push(`${a.file}: name "${a.fm.name}" != "${a.id}"`);
    }
    assertNoProblems(problems);
  });

  run('every agent has a substantive description', () => {
    const problems = agents
      .filter(a => a.fm && (!a.fm.description || a.fm.description.length < 40))
      .map(a => `${a.file}: description missing or shorter than 40 characters`);
    assertNoProblems(problems);
  });

  run('every agent lists only known tools', () => {
    const problems = [];
    for (const a of agents) {
      if (!a.fm) continue;
      if (!a.fm.tools) { problems.push(`${a.file}: no tools field`); continue; }
      for (const tool of a.fm.tools.split(',').map(t => t.trim()).filter(Boolean)) {
        if (!KNOWN_TOOLS.has(tool)) problems.push(`${a.file}: unknown tool "${tool}"`);
      }
    }
    assertNoProblems(problems);
  });

  run('every agent model is a valid alias or a full claude- model ID', () => {
    const problems = agents
      .filter(a => a.fm && a.fm.model && !MODEL_ALIASES.has(a.fm.model) && !/^claude-[a-z0-9-]+$/.test(a.fm.model))
      .map(a => `${a.file}: invalid model "${a.fm.model}"`);
    assertNoProblems(problems);
  });

  run(`read-only agents (${READ_ONLY_AGENTS.join(', ')}) have no write tools`, () => {
    const problems = [];
    for (const id of READ_ONLY_AGENTS) {
      const a = agents.find(x => x.id === id);
      if (!a) { problems.push(`${id}: agent not found`); continue; }
      const tools = (a.fm && a.fm.tools ? a.fm.tools : '').split(',').map(t => t.trim());
      for (const w of WRITE_TOOLS) if (tools.includes(w)) problems.push(`${id}: has write tool "${w}"`);
    }
    assertNoProblems(problems);
  });

  console.log('\nSkills:');

  run(`all ${skills.length} skill directories contain SKILL.md`, () => {
    assertNoProblems(skills.filter(s => !s.exists).map(s => `skills/${s.dir}: missing SKILL.md`));
  });

  run('every skill has frontmatter with name matching its directory and a description', () => {
    const problems = [];
    for (const s of skills.filter(x => x.exists)) {
      if (!s.fm) { problems.push(`skills/${s.dir}: missing frontmatter (skill can never be triggered)`); continue; }
      if (s.fm.name !== s.dir) problems.push(`skills/${s.dir}: name "${s.fm.name}" != "${s.dir}"`);
      if (!s.fm.description || s.fm.description.length < 40) {
        problems.push(`skills/${s.dir}: description missing or shorter than 40 characters`);
      }
    }
    assertNoProblems(problems);
  });

  console.log('\nCommands:');

  run(`all ${commands.length} commands have frontmatter with a description`, () => {
    const problems = commands
      .filter(c => !c.fm || !c.fm.description || c.fm.description.length < 20)
      .map(c => `commands/${c.file}: missing frontmatter description`);
    assertNoProblems(problems);
  });

  console.log('\nCross-references:');

  run('every "`name` agent" reference points to an existing agent', () => {
    const problems = [];
    for (const src of markdownSources) {
      for (const m of src.content.matchAll(/`([a-z][a-z0-9-]*)` agents?\b/g)) {
        if (!agentIds.has(m[1])) problems.push(`${src.where}: unknown agent "${m[1]}"`);
      }
    }
    assertNoProblems(problems);
  });

  run('every "`name` skill" reference points to an existing skill', () => {
    const problems = [];
    for (const src of markdownSources) {
      for (const m of src.content.matchAll(/`([a-z][a-z0-9-]*)` skills?\b/g)) {
        if (!skillIds.has(m[1])) problems.push(`${src.where}: unknown skill "${m[1]}"`);
      }
    }
    assertNoProblems(problems);
  });

  run('every agent in an "a -> b -> c" workflow chain exists', () => {
    const problems = [];
    for (const src of markdownSources) {
      for (const line of src.content.split('\n')) {
        const trimmed = line.trim();
        if (!/^[a-z][a-z0-9-]*( -> [a-z][a-z0-9-]*)+$/.test(trimmed)) continue;
        for (const id of trimmed.split(' -> ')) {
          if (!agentIds.has(id)) problems.push(`${src.where}: chain "${trimmed}" references unknown agent "${id}"`);
        }
      }
    }
    assertNoProblems(problems);
  });

  run('every HANDOFF source and target is an existing agent or a known role', () => {
    const problems = [];
    for (const src of markdownSources) {
      for (const m of src.content.matchAll(/HANDOFF: ([^\n`]+)/g)) {
        const names = m[1].split(/->|,|\|/).map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          if (/[\[\]<>]/.test(name)) continue; // template placeholder like [next-agent]
          if (NON_AGENT_HANDOFF_TARGETS.has(name)) continue;
          if (!agentIds.has(name)) problems.push(`${src.where}: HANDOFF references unknown agent "${name}"`);
        }
      }
    }
    assertNoProblems(problems);
  });

  console.log('\nManifests:');

  const pluginPath = path.join(ROOT, '.claude-plugin', 'plugin.json');
  const marketplacePath = path.join(ROOT, '.claude-plugin', 'marketplace.json');

  run('plugin.json is valid JSON with a kebab-case name', () => {
    const plugin = JSON.parse(read(pluginPath));
    assert.ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name), `invalid plugin name "${plugin.name}"`);
    assert.ok(plugin.description, 'missing description');
  });

  run('plugin.json component paths exist', () => {
    const plugin = JSON.parse(read(pluginPath));
    const problems = [];
    for (const key of ['commands', 'skills', 'agents', 'hooks']) {
      if (typeof plugin[key] === 'string' && !fs.existsSync(path.join(ROOT, plugin[key]))) {
        problems.push(`${key}: "${plugin[key]}" does not exist`);
      }
    }
    assertNoProblems(problems);
  });

  run('marketplace.json lists this plugin with a matching name and local source', () => {
    const plugin = JSON.parse(read(pluginPath));
    const market = JSON.parse(read(marketplacePath));
    const entry = (market.plugins || []).find(p => p.name === plugin.name);
    assert.ok(entry, `marketplace has no plugin named "${plugin.name}"`);
    assert.strictEqual(entry.source, './', 'plugin source should be "./"');
    assert.ok(market.name && market.owner && market.owner.name, 'marketplace name/owner missing');
  });

  console.log('\nHooks:');

  run('hooks.json is valid and every ${CLAUDE_PLUGIN_ROOT} script exists', () => {
    const hooksFile = path.join(ROOT, 'hooks', 'hooks.json');
    const raw = read(hooksFile);
    JSON.parse(raw);
    const problems = [];
    for (const m of raw.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\\\s]+)/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) problems.push(`hooks.json references missing file "${m[1]}"`);
    }
    assertNoProblems(problems);
  });

  run('hook matchers are tool-name patterns, not expressions', () => {
    const hooks = JSON.parse(read(path.join(ROOT, 'hooks', 'hooks.json'))).hooks;
    const problems = [];
    for (const [event, entries] of Object.entries(hooks)) {
      for (const entry of entries) {
        const m = entry.matcher;
        if (m === undefined || m === '*' || m === '') continue;
        if (/==|&&|\|\||\bmatches\b|tool_input/.test(m)) problems.push(`${event}: expression matcher "${m}" never matches a tool name`);
      }
    }
    assertNoProblems(problems);
  });

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
