# Performance and Model Use

## Model Selection

Pick the cheapest tier that does the job well. Agents in this plugin set `model:` in their frontmatter with these tier aliases, which always resolve to the current model of that tier:

| Tier | Use for | Agents here |
|------|---------|-------------|
| `haiku` | High-volume, well-defined subtasks: classification, extraction, simple edits | (none by default) |
| `sonnet` | Most implementation and mechanical work: docs, cleanup, CI and config, E2E, releases | explorer, doc-updater, refactor-cleaner, e2e-runner, build-error-resolver, devops, release-manager, dependency-auditor, ui-designer |
| `opus` | Judgment-heavy work: architecture, planning, reviews, security, hard debugging | architect, planner, tdd-guide, code-reviewer, security-reviewer, implementer, database-architect, api-designer, performance-profiler, rust-build-resolver |

To change a tier, edit the agent's `model:` field (`opus`, `sonnet`, `haiku`, `inherit`, or a full model ID).

## Context Window

- Start large multi-file work (features, refactors, tricky debugging) with plenty of context left. Compact or start fresh at a logical boundary first.
- Single-file edits, docs, and small fixes are fine late in a session.
- Delegate wide searches to the **explorer** agent so file dumps stay out of the main context.
- Compact at phase boundaries (after planning, after a milestone), not mid-implementation. The strategic-compact hook reminds you.

## Hard Problems

1. Use Plan Mode, or `/plan`, to agree on an approach before editing.
2. Ask for deeper reasoning on the hard part, and critique the plan before executing.
3. Use parallel subagents with different roles (security, performance, correctness) for independent perspectives.

## Code Performance

Measure before optimizing. Use the **performance-profiler** agent to profile, find the actual bottleneck, and prove the fix with before and after numbers.

## Build Failures

Use **build-error-resolver** (or **rust-build-resolver** for cargo) and fix one error class at a time, re-running the build after each fix.
