---
description: Review the current changes (uncommitted work, the branch vs. the default branch, or a PR number) with the code-reviewer agent, plus the security-reviewer when the change touches sensitive areas. Read-only; reports verified, ranked findings and a verdict.
argument-hint: "[<pr-number> | <base-ref> | --security | --no-security]"
---

# Code Review

Invokes the **code-reviewer** agent, and the **security-reviewer** agent when needed, on the current change.

## Scope

Determine what to review from `$ARGUMENTS`:
- **No argument:** uncommitted changes if there are any (`git diff HEAD`); otherwise the current branch against the default branch (`git diff <default>...HEAD`)
- **A PR number:** `gh pr diff <n>` and `gh pr view <n>` (the PR description is the intent)
- **A ref:** `git diff <ref>...HEAD`

If the scope is empty, say so and stop.

## Run

1. Launch `code-reviewer` with the scope and any intent you know (PR description, plan, or spec from this session).
2. Also launch `security-reviewer` **in the same message**, so both run in parallel, when:
   - `--security` was given, or
   - the diff touches authentication or authorization, input parsing, API endpoints, database queries, secrets or config, payments, file or network access, deserialization, LLM calls, CI workflows, or Dockerfiles

   Skip it if `--no-security` was given.
3. If `code-reviewer` reports "security-reviewer: needed" and it didn't run, run it now.

## Report

Merge both outputs into one report:
- De-duplicate overlapping findings (keep the more severe label and both sets of evidence)
- Order by severity (CRITICAL > HIGH > MEDIUM > LOW/NIT), then CONFIRMED before PLAUSIBLE
- Final verdict = the stricter of the two: `BLOCK` > `CHANGES REQUESTED` > `APPROVE WITH NITS` > `APPROVE`

```
CODE REVIEW: <scope>
Verdict: CHANGES REQUESTED   (code: CHANGES REQUESTED, security: APPROVE)

[HIGH | CONFIRMED] Retry loop never gives up on 4xx responses       src/client.ts:88
[MEDIUM | PLAUSIBLE] Cache key ignores locale                        src/cache.ts:21
...
```

This command never edits code. To apply fixes, ask for them explicitly or use `/ship`, whose fix loop sends findings to the `implementer`.
