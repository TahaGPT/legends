# Example Project CLAUDE.md

A template for a project-level `CLAUDE.md` in your repository root. Replace the bracketed parts and delete what doesn't apply. Keep it short: Claude reads it every session, so every line should be something Claude would otherwise get wrong.

## Project Overview

[One paragraph: what the project does, who uses it, and the main tech stack.]

## Commands

```bash
[install]      # e.g. pnpm install / uv sync / cargo build
[dev]          # e.g. pnpm dev
[test]         # e.g. pnpm test / pytest / cargo test
[lint/format]  # e.g. pnpm lint / ruff check . && ruff format / cargo clippy
[typecheck]    # e.g. pnpm tsc --noEmit / mypy .
```

## Layout

```
[src/]          # [what lives here]
[tests/]        # [test layout and naming]
[migrations/]   # [how migrations are created and applied]
```

## Conventions

These examples come from the plugin's `rules/`; keep the ones you agree with and add your own.

- Small, focused files organized by feature; follow the existing structure.
- Validate untrusted input at the boundary with [zod / pydantic / serde].
- Errors: [your error-handling convention, e.g. typed result objects, or exceptions mapped to HTTP codes in one place].
- Tests: test-first for new behavior and bug fixes; [unit / integration / e2e expectations].
- No secrets in code; configuration comes from environment variables (see below).
- [Anything Claude keeps getting wrong in this codebase.]

## Environment Variables

```bash
# Required
DATABASE_URL=
[API_KEY]=

# Optional
LOG_LEVEL=info
```

## Workflow

- Features: `/ship <description>` (spec, plan, implement test-first, review, verify, PR), or `/plan` and then `/tdd` for smaller changes.
- Before a PR: `/verify`, then `/code-review`.
- Releases: `/release`.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`); work on branches, never directly on main.
