---
name: strategic-compact
description: Suggests manual context compaction at logical intervals to preserve context through task phases rather than arbitrary auto-compaction.
---

# Strategic Compact Skill

Suggests manual `/compact` at strategic points in your workflow rather than relying on arbitrary auto-compaction.

## Why Strategic Compaction?

Auto-compaction triggers at arbitrary points:
- Often mid-task, losing important context
- No awareness of logical task boundaries
- Can interrupt complex multi-step operations

Strategic compaction at logical boundaries:
- **After exploration, before execution** - Compact research context, keep implementation plan
- **After completing a milestone** - Fresh start for next phase
- **Before major context shifts** - Clear exploration context before different task

## How It Works

The plugin wires `scripts/hooks/suggest-compact.js` to PreToolUse on `Edit|Write|MultiEdit` (see `hooks/hooks.json`). It:

1. **Counts edit tool calls** per session (keyed by the `session_id` Claude Code passes on stdin)
2. **Suggests at a threshold** (default: 50 calls)
3. **Reminds every 25 calls** after the threshold

The suggestion reaches both Claude (as `additionalContext`) and you (as a system message). When you see it, decide whether you are at a logical boundary; if so, run `/compact`, optionally with focus instructions such as `/compact keep the implementation plan and open TODOs`.

## Manual Setup (without the plugin)

Add to `~/.claude/settings.json`, adjusting the path to where you cloned the repo:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/legends/scripts/hooks/suggest-compact.js"
      }]
    }]
  }
}
```

## Configuration

Environment variables:
- `COMPACT_THRESHOLD` - Tool calls before first suggestion (default: 50)

## Best Practices

1. **Compact after planning** - Once plan is finalized, compact to start fresh
2. **Compact after debugging** - Clear error-resolution context before continuing
3. **Don't compact mid-implementation** - Preserve context for related changes
4. **Read the suggestion** - The hook tells you *when*, you decide *if*

## Related

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) - Token optimization section
- Session hooks (`session-start.js` / `session-end.js`) - carry where you left off into the next session
