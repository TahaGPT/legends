# Security

## Before Any Commit

- [ ] No hardcoded secrets (API keys, passwords, tokens, private keys); check the diff, not just the files you meant to change
- [ ] Untrusted input validated at the boundary
- [ ] Parameterized queries only; no string-built SQL, shell commands, or file paths from user input
- [ ] Output encoded for its context (HTML, SQL, shell, logs) to prevent injection and XSS
- [ ] Authentication and authorization checked on every protected operation, server side
- [ ] CSRF protection for cookie-authenticated state-changing requests
- [ ] Rate limiting on public and authentication endpoints
- [ ] Errors and logs don't leak secrets, tokens, or personal data

## Secrets

Read secrets from the environment or a secret manager, and fail fast when one is missing:

```text
NEVER:  api_key = "sk-live-..."                      (committed to git forever)
ALWAYS: api_key = env("PAYMENT_API_KEY") or fail("PAYMENT_API_KEY not configured")
```

Keep `.env` files out of git and commit a `.env.example` with placeholder values.

## If You Find a Security Issue

1. Stop feature work on the affected code.
2. Use the **security-reviewer** agent to assess scope and severity.
3. Fix CRITICAL issues before continuing.
4. Rotate any secret that was exposed. Removing it from the code is not enough once it has been committed or pushed.
5. Look for the same pattern elsewhere in the codebase.

See the `security-review` skill for the full checklist.
