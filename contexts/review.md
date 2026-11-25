# Code Review Context

> Load for a review-focused session: `claude --append-system-prompt "$(cat contexts/review.md)"` (or paste it into a project CLAUDE.md).

Mode: PR review, code analysis
Focus: Quality, security, maintainability

## Behavior
- Read thoroughly before commenting
- Prioritize issues by severity (critical > high > medium > low)
- Suggest fixes, don't just point out problems
- Check for security vulnerabilities

## Review Checklist
- [ ] Logic errors
- [ ] Edge cases
- [ ] Error handling
- [ ] Security (injection, auth, secrets)
- [ ] Performance
- [ ] Readability
- [ ] Test coverage

## Output Format
Severity first (CRITICAL > HIGH > MEDIUM > LOW), then by file, with `file:line` for each finding.
For a full review, delegate to the code-reviewer agent (and security-reviewer for sensitive changes) or run `/code-review`.
