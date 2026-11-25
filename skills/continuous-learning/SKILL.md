---
name: continuous-learning
description: Extract reusable patterns (error resolutions, workarounds, user corrections, project conventions) from Claude Code sessions and save them as learned skills. Use with /learn, or when the session-start hook reports a session worth reviewing.
---

# Continuous Learning Skill

Flags long Claude Code sessions for review so reusable patterns (error fixes, workarounds, conventions) get extracted with `/learn` and saved as learned skills.

## How It Works

Claude Code cannot do work after a session has ended, so learning happens in two steps:

1. **At session end**, `scripts/hooks/session-end.js` counts the real user prompts in the transcript (tool results and harness messages are ignored). If the session reached `min_session_length`, the session record gets a `Learning review: suggested` line.
2. **At the next session start** in the same project, `session-start.js` tells Claude about it, and Claude (or you) runs `/learn` to extract patterns and save them as skills under `learned_skills_path` (default `~/.claude/skills/learned/`).

You can also run `/learn` at any point mid-session, which is the best time: the context is still fresh.

## Configuration

Edit `config.json` to customize:

```json
{
  "min_session_length": 10,
  "extraction_threshold": "medium",
  "auto_approve": false,
  "learned_skills_path": "~/.claude/skills/learned/",
  "patterns_to_detect": [
    "error_resolution",
    "user_corrections",
    "workarounds",
    "debugging_techniques",
    "project_specific"
  ],
  "ignore_patterns": [
    "simple_typos",
    "one_time_fixes",
    "external_api_issues"
  ]
}
```

## Pattern Types

| Pattern | Description |
|---------|-------------|
| `error_resolution` | How specific errors were resolved |
| `user_corrections` | Patterns from user corrections |
| `workarounds` | Solutions to framework/library quirks |
| `debugging_techniques` | Effective debugging approaches |
| `project_specific` | Project-specific conventions |

## Hook Setup

Nothing to do when installed as a plugin: `hooks/hooks.json` wires SessionStart and SessionEnd. For a manual install, add both to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /path/to/legends/scripts/hooks/session-start.js" }] }],
    "SessionEnd":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /path/to/legends/scripts/hooks/session-end.js" }] }]
  }
}
```

To check a transcript by hand: `echo '{"transcript_path":"/path/to/transcript.jsonl"}' | node scripts/hooks/evaluate-session.js`

## Related

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) - Section on continuous learning
- `/learn` command - Manual pattern extraction mid-session
