# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When Claude finishes a turn (final checks)
- **SessionStart / SessionEnd**: When a session begins or ends
- **PreCompact**: Before context compaction

What reaches Claude: blocking hooks (exit code 2) show stderr to Claude. Non-blocking messages must be JSON on stdout (`hookSpecificOutput.additionalContext` for Claude, `systemMessage` for the user), or plain stdout for SessionStart. Claude never sees stderr from a hook that exits 0. Hooks for the same event run in parallel. Helpers: `emitHookOutput()` and `readStdinJsonSync()` in `scripts/lib/utils.js`.

## LEGENDS Hooks

**Always on:**
- **Session memory**: SessionEnd writes a record per session to `~/.claude/sessions/` (project, branch, last request, uncommitted files, your notes). The next SessionStart in the same project tells Claude where you left off. Records from other projects are never shown.
- **Continuous learning**: long sessions are marked for review, and the next session suggests `/learn`
- **Compaction log**: PreCompact appends to `~/.claude/sessions/compaction-log.txt`
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

Implementation: `scripts/hooks/optional-hooks.js` (opt-in), `session-start.js`, `session-end.js`, `pre-compact.js`, and `suggest-compact.js`. All hooks honor `CLAUDE_CONFIG_DIR`. Hook matchers are tool-name patterns (`Bash`, `Edit|Write|MultiEdit`); blocking hooks exit with code 2.

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
