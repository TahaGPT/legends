# Example User-Level CLAUDE.md

A template for `~/.claude/CLAUDE.md`, which applies to every project. Use it for personal preferences that hold everywhere. Project-specific rules belong in the project's own `CLAUDE.md` (see `examples/CLAUDE.md`). Everything below is an example; keep what matches how you work.

---

## How I Work

1. **Plan before large changes:** for anything touching several files, propose a plan and wait for my OK.
2. **Delegate:** use the specialized agents (planner, explorer, code-reviewer, security-reviewer, and others) for the work they cover, and run independent agents in parallel.
3. **Test-first** for new behavior and bug fixes.
4. **Security is not optional:** no secrets in code, validate input, and flag anything risky.
5. **Ask when it's genuinely my call;** otherwise make a sensible choice and tell me what you chose.

## Rules

If you copied the plugin's rules to `~/.claude/rules/` (manual install):

| File | Contents |
|------|----------|
| coding-style.md | Immutability, file size, error handling, validation |
| testing.md | Test-first workflow, what to test, coverage guide |
| security.md | Pre-commit security checklist, secrets, incident steps |
| git-workflow.md | Commits, PRs, feature workflow |
| agents.md | Which agent to use when |
| patterns.md | API responses, data-access layer, configuration |
| performance.md | Model tiers, context management |
| hooks.md | What the hooks do and how to opt in |

## Preferences

### Code
- [e.g. Prefer immutability; small focused files; descriptive names over comments]
- [e.g. No emojis in code or commit messages]

### Git
- [e.g. Conventional commits; small focused commits; never push without asking]

### Communication
- [e.g. Lead with the answer; keep summaries short; show file:line references]

### Tools
- [e.g. Package manager: pnpm. Python: uv. Editor: your editor of choice]

---

## Done Means

- Tests pass and new behavior is covered
- No new security issues
- The change does what I asked, nothing more
