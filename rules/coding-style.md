# Coding Style

Language-neutral defaults. The project's own conventions (its CLAUDE.md, linter, and formatter config, and the existing code) win over these. For language specifics see the `coding-standards` skill (TypeScript/JavaScript), the `python-patterns` skill, and the `rust-patterns` skill.

## Prefer Immutability

Return new values instead of mutating inputs, especially for shared state, function arguments, and anything crossing a module boundary. Mutation is fine when it is local and contained (a builder inside one function, a hot loop measured to need it).

```text
WRONG:   update(user, name)  ->  sets user.name, returns user     (caller's object changed)
CORRECT: update(user, name)  ->  returns a copy with the new name (input untouched)
```

How this looks per language: spread or copies in JS/TS, `dataclasses.replace` or frozen dataclasses in Python, ownership and `&` versus `&mut` in Rust.

## File and Function Size

- Many small, cohesive files over a few large ones. Organize by feature or domain, not by type.
- Rough guide: functions under about 50 lines, files under about 400. Over about 800 lines is a strong signal to split.
- Nesting deeper than 4 levels: extract a function or return early.

These are heuristics, not hard limits. Generated code, tables, and tests can be longer.

## Error Handling

- Handle errors where you can do something useful. Otherwise let them propagate with context added.
- Never swallow errors silently. Never show stack traces or internals to end users.
- Log with enough context to debug (operation, identifiers), without secrets or personal data.

## Validate at the Boundaries

Validate and parse untrusted input where it enters the system: request handlers, CLI args, file and env parsing, message consumers. Use a schema library (zod, pydantic, serde plus validator, etc.), then trust the typed value internally.

## Before Marking Work Complete

- [ ] Names say what things are; no dead or commented-out code
- [ ] Errors handled or propagated with context
- [ ] No debug output left behind (console.log, print, dbg!, and similar)
- [ ] No hardcoded secrets, environment-specific URLs, or magic numbers without a named constant
- [ ] Matches the surrounding code's style; formatter and linter pass
