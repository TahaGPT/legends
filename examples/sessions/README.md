# Session records

The SessionEnd hook (`scripts/hooks/session-end.js`) writes one record per session to `~/.claude/sessions/<date>-<id8>.tmp` (or `$CLAUDE_CONFIG_DIR/sessions/`). The next session started in the same project gets a short summary of it in Claude's context.

Everything above "Notes for Next Session" is regenerated from the transcript and git each time the session ends. Anything you write under "Notes for Next Session" is kept, so that is where to leave yourself (and Claude) instructions.

`2026-01-20-3f9c2a1b.tmp` is an example record with hand-written notes.
