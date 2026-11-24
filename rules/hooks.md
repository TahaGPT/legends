# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When session ends (final verification)

## LEGENDS Hooks

**Always on:**
- **Session memory**: SessionStart loads recent context; PreCompact and SessionEnd save state
- **Continuous learning**: SessionEnd evaluates the session for reusable patterns
- **Strategic compact**: suggests `/compact` at logical intervals during long edit sessions
- **PR hint**: after `gh pr create`, prints the PR URL and a review command

**Opt-in** via the `LEGENDS_HOOKS` environment variable (comma-separated, or `all`), e.g. `"env": { "LEGENDS_HOOKS": "tmux,console-log" }` in `~/.claude/settings.json`:

| Flag | Event | Behavior |
|------|-------|----------|
| `tmux` | PreToolUse (Bash) | Blocks dev servers outside tmux; reminds to use tmux for long commands |
| `push-reminder` | PreToolUse (Bash) | Reminder to review the diff before `git push` |
| `block-md` | PreToolUse (Write) | Blocks new `.md`/`.txt` files other than README/CLAUDE/AGENTS/CONTRIBUTING |
| `prettier` | PostToolUse (Edit/Write) | Formats edited JS/TS files with the project's Prettier |
| `typecheck` | PostToolUse (Edit/Write) | Runs `tsc --noEmit` and shows errors for the edited file |
| `console-log` | PostToolUse + Stop | Warns about `console.log` in edited and modified files |

Implementation: `scripts/hooks/optional-hooks.js`. Hook matchers are tool-name patterns (`Bash`, `Edit|Write|MultiEdit`); blocking hooks exit with code 2.

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use dangerously-skip-permissions flag
- Configure `allowedTools` in `~/.claude.json` instead

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements
