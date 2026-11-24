# Git Workflow

## Commits

Conventional Commits:

```
<type>: <description>

<optional body: why, not what>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

- Small, focused commits that each leave the build green.
- Never commit secrets, generated artifacts, or local config (`.env`, `settings.local.json`).
- Follow the project's own commit and attribution conventions if it has them.

## Branches and Pull Requests

- Work on a branch. Don't commit directly to the default branch.
- Before opening a PR, review the whole change: `git log <base>..HEAD` and `git diff <base>...HEAD`, not just the last commit.
- PR description: what changed and why, how it was tested, and a test plan for the reviewer.
- Push a new branch with `git push -u origin <branch>`.
- Only push, open PRs, or force-push when the user asks.

## Feature Workflow

For a feature from idea to PR, use `/ship`, which runs the stages below with approval gates. Done by hand:

1. **Understand:** use the **explorer** agent on the relevant code.
2. **Plan:** use the **planner** agent (plus **architect**, **database-architect**, or **api-designer** as needed). Get the plan approved.
3. **Implement test-first:** use the **implementer** or **tdd-guide** agent.
4. **Review:** use **code-reviewer**, plus **security-reviewer** for authentication, input handling, secrets, or payments. Fix CRITICAL and HIGH findings.
5. **Verify:** run `/verify` for build, types, lint, tests, and a diff review.
6. **Commit and open a PR.** Use `/release` when it is time to cut a version.
