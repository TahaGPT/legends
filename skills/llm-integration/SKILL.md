---
name: llm-integration
description: Patterns for building features that call large language models (LLM APIs) in production. Use when adding or changing code that sends prompts to a model, parses model output, gives a model tools, builds an agent loop, streams responses, or handles prompts, completions, or embeddings. Covers model selection, structured output, tool use, streaming, retries and timeouts, prompt caching, cost and token budgets, prompt-injection defense, PII, testing, evals, and observability.
---

# LLM Integration

How to build features on top of LLM APIs so they are reliable, affordable, testable, and safe. The principles are provider-neutral. Provider specifics change often, so this skill tells you **what to do** and points to where the **exact current API shape** lives instead of hard-coding it.

**Before writing provider-specific code:**
- Use the provider's **official SDK**. Don't hand-roll HTTP or use compatibility shims when an SDK exists.
- **Never guess SDK method names, parameters, or model IDs.** Check the provider's current docs. For Anthropic/Claude, load Claude Code's built-in `claude-api` reference (exact model IDs, parameter names, and recent API changes).
- Follow what the project already does (client wrapper, config, prompt storage, test fixtures) before introducing anything new.

## 1. Decide the Shape First

Use the simplest design that works:

| Need | Design |
|------|--------|
| Classify, extract, summarize, answer | **One call** with structured output |
| Fixed multi-step process | **Workflow**: your code calls the model at each step and controls the flow |
| Open-ended task where the model must choose its own steps | **Agent**: a model + tools loop (or a hosted agent platform) |
| Large offline volumes | **Batch API** (typically about half the price, asynchronous) |

Build an agent only if the task is genuinely open-ended, the value justifies the extra cost and latency, and mistakes can be caught (tests, review, rollback). Otherwise use a single call or a workflow.

## 2. Models and Configuration

- **Model IDs live in configuration**, not scattered through code: one setting per use (e.g. `LLM_MODEL_DEFAULT`, `LLM_MODEL_CHEAP`). Use exact IDs from the provider's model list; never invent or "complete" an ID from memory.
- **Default to the most capable current model** and tune down only when an eval shows a cheaper model or a lower reasoning-effort setting holds quality for that route. Compare cost per *completed task*, not per request: a cheaper call that needs retries or extra turns isn't cheaper.
- **Tune per route.** Classification and chat routes often work at low effort or with a small model. Coding and long agentic work usually benefit from higher effort.
- **Pin and track:** log the model ID and settings with every request, so behavior changes can be traced to model changes.
- **Plan migrations:** model generations change request parameters (thinking or reasoning settings, sampling parameters, forced tool choice, prefill). Migrate deliberately, behind evals, and read the provider's migration guide.

## 3. Prompts

- **Keep prompts in version-controlled files or constants**, not built ad hoc in business logic. Review prompt changes like code changes, with an eval run (see §11).
- **Structure:** stable instructions in the system prompt; task data in the user message. Delimit untrusted content clearly (e.g. inside tagged sections) and tell the model it is data, not instructions.
- **Put the full task up front:** goal, constraints, output format, and examples of tricky cases. Current models follow precise instructions closely; contradictory or outdated rules ("NEVER do X" left over from an old model) degrade output.
- **No prompt string concatenation with user input in the system prompt.** User content goes in the user turn.
- **Templates:** use a real template function with explicit variables, and fail loudly on missing variables. Don't silently render empty values.

## 4. Structured Output

Never regex-parse free text when you need data.

1. Use the provider's **native structured-output** feature (a JSON schema enforced by the API) or **strict tool schemas**. For Claude: `output_config.format` and the SDK's `messages.parse()` helper, or `strict: true` on tools. Assistant-message prefill is rejected by current Claude models, so don't use it to force JSON.
2. **Define the schema once** in code (Pydantic, Zod, serde, JSON Schema) and derive the API schema from it.
3. **Validate every response anyway.** Check `stop_reason` / `finish_reason` first: a response cut off by the token limit, or a refusal, is not valid output even if part of it parses.
4. On validation failure, retry once with the validation error included. After that, fail with a typed error; don't pass partial data downstream.

## 5. Tool Use and Agent Loops

- **Tool definitions are an API:** clear names, descriptions that say *when* to use the tool, strict input schemas (`additionalProperties: false`, required fields).
- **Validate tool inputs before executing**, even with strict schemas. Parse JSON with a real parser; never string-match the serialized input.
- **Return errors as tool results** (e.g. `is_error: true`) rather than dropping them, so the model can recover.
- **Parallel calls:** when the model issues several tool calls in one turn, run them concurrently and return **all** results in a single message.
- **Least privilege:** a tool can do only what the *end user* is allowed to do. Scope credentials per user or tenant; never hand the model admin access because it's convenient.
- **Human approval** for irreversible or external actions (payments, emails, deletions, deploys), enforced in code, not by asking the model nicely.
- **Bound the loop:** maximum iterations, a total token or cost budget, and wall-clock timeouts. Stop with a clear status when a bound is hit.
- **Prefer SDK helpers** (tool runners, typed tool decorators) over hand-written loops when they fit.
- **Forced tool choice** (`any` / a named tool) is rejected by some current models (including recent Claude models). Use `auto` plus clear instructions, strict schemas, or structured output instead.

## 6. Streaming, Timeouts, and Token Limits

- **Stream** any request with long input, long output, or a high output-token limit. It avoids HTTP timeouts and improves perceived latency. Use the SDK's "final message" helper when you don't need incremental events.
- **Set `max_tokens` generously** for the task. Hitting the cap truncates mid-answer and forces a retry. Use small caps only for genuinely short outputs (classification).
- **Timeouts:** set an explicit client timeout per route. Remember that retries multiply wall-clock time (timeout × (retries + 1)).
- **Cancellation:** propagate user cancellation (closed connection, aborted request) to the model stream so you stop paying for unused tokens.
- **Count tokens with the provider's token-counting endpoint**, not a third-party tokenizer from another model family (for Claude, `messages.count_tokens`). Check large inputs before sending, and never silently truncate user content: chunk, summarize, or tell the user.

## 7. Errors and Retries

- **Retry only retryable failures:** rate limits (429), overload and server errors (5xx), timeouts, and connection errors, with exponential backoff and jitter, honoring `retry-after` headers. Most official SDKs already retry these a few times, so configure them rather than wrapping another retry loop around them (stacked retries multiply load).
- **Don't retry** 400-class validation or auth errors. Surface them.
- **Catch the SDK's typed errors from most to least specific** (not-found → rate-limit → other status errors → connection errors). Don't string-match error messages or use one catch-all.
- **Refusals and safety stops are not exceptions:** check the stop reason before reading the content. Handle a refusal as a normal outcome (user-facing message, or a provider-supported fallback).
- **Degrade gracefully:** decide per feature what happens when the model is unavailable (queue and retry later, cached answer, non-AI fallback, clear error).
- **Idempotency:** if a model call triggers side effects, make the side effects idempotent, so a retried request doesn't act twice.

## 8. Cost and Performance

In order of payoff:
1. **Prompt caching.** Keep the prompt prefix byte-stable: tools, then system prompt, then stable context, then the volatile parts (timestamps, IDs, the user's question) last. Any change in the prefix invalidates the cache after it. Verify with the provider's cache-hit fields (Claude: `usage.cache_read_input_tokens`). If they stay zero, something in the prefix changes every request: a timestamp, unsorted JSON, or a varying tool list.
2. **Trim input:** send only the context the task needs. Retrieve instead of stuffing whole documents.
3. **Batch** anything not latency-sensitive.
4. **Right-size effort and model per route**, verified by evals (§2).
5. **Cap output** with sensible `max_tokens`, and ask for concise formats.

Track spend from the `usage` fields on every response: input, output, and cache tokens, per route, user, or tenant. Enforce per-user and per-tenant quotas and alert on anomalies. An unbounded loop or a prompt-injected "repeat forever" is a billing incident.

## 9. Security

**Prompt injection is the central risk.** Any text the model reads (user messages, uploaded files, retrieved documents, web pages, emails, tool results, other model outputs) can contain instructions.
- Treat all of it as untrusted data. Keep it out of the system prompt, delimit it, and say it is data.
- **Never let model output drive dangerous sinks unvalidated:** no shell commands, SQL, file paths, URLs to fetch, HTML rendered as markup, or `eval` built from model output without validation, allow-lists, or parameterization.
- Limit what a compromised model can do (least-privilege tools, human approval for irreversible actions, §5). Assume injection will sometimes succeed, and contain the blast radius.
- Never put secrets in prompts. The model can repeat anything it sees.

**Data protection:**
- Send PII or confidential data to a provider only when the feature requires it and your data agreements allow it. Redact what isn't needed.
- **Don't log full prompts or completions by default.** Log metadata (route, model, token counts, latency, stop reason, request ID), and gate content logging behind an explicit debug flag with redaction and short retention.
- Define retention for stored conversations, and support deletion requests.
- Check provider data-retention settings (e.g. zero data retention requirements) against the features you use. Some features are unavailable under some retention modes.

Run the `security-reviewer` agent on any change that adds model calls, tools, or retrieval.

## 10. Testing

- **Unit tests never call the live API.** Put the model behind a small interface (a client wrapper or trait) and use fakes or recorded fixtures. Test parsing, validation, retries, tool dispatch, and error handling deterministically.
- **Fixture tests for parsing:** feed real recorded responses, including truncated ones, refusals, malformed tool inputs, and unusual escaping, through your parsing code.
- **Contract tests (optional, gated):** a small suite that hits the real API, run manually or nightly with a budget, to catch provider changes.
- **Snapshot your prompts** (e.g. `insta`, Jest snapshots) so prompt changes show up in review.

## 11. Evals

Unit tests check your code; evals check the model's behavior on your task. Any change to the prompt, model, effort, or tools needs an eval run.
- Build a set of real or realistic inputs with expected properties: exact answers, schema validity, rubric scores, or "must not" checks (no PII leaked, no tool call without approval).
- Grade with code where possible, a model grader with a written rubric where not, and humans for calibration.
- Track pass rates over runs (pass@k for stochastic behavior), and compare before and after every change.
- Use the `eval-harness` skill for the workflow.

## 12. Observability

Per request, record: route, model ID, settings (effort, max tokens), latency (time to first token and total), input/output/cache tokens, cost, stop reason, retries, tool calls made, provider request ID, and outcome (valid, invalid, refused, error). Use OpenTelemetry spans if the project traces, and build dashboards for error rate, refusal rate, latency percentiles, cost per route, and cache hit rate.

## 13. Claude Notes (as of late 2026; verify in the `claude-api` reference before relying on them)

- Model tiers: Opus (default, most capable everyday), Sonnet (fast and capable), Haiku (cheapest, high volume), plus higher-end tiers. Use exact IDs from the model list, with no date suffixes.
- Current models use **adaptive thinking** with an **effort** setting (`output_config.effort`). The old fixed `budget_tokens` thinking budget is rejected by current models. Defaults differ by model, so set effort explicitly.
- **Prefill and forced tool choice are rejected** on current models. Use structured outputs or `auto` tool choice.
- **Sampling parameters** (`temperature`, `top_p`, `top_k`) are rejected on newer API versions.
- Structured outputs: `output_config.format` / `messages.parse()`. Strict tools: `strict: true` on the tool definition.
- Check `stop_reason` for `refusal`. Server-side fallbacks are available for some models.
- Prompt caching: up to 4 breakpoints, and a minimum cacheable prefix size depending on the model.
- Batches: `messages.batches`. Results arrive in any order, so key them by `custom_id`.

## Review Checklist

- [ ] Official SDK; model IDs from config; no guessed parameters
- [ ] Structured output with schema validation; stop reason checked before parsing
- [ ] Untrusted content delimited and kept out of system prompts; model output never reaches a dangerous sink unvalidated
- [ ] Tools least-privilege, inputs validated, irreversible actions behind human approval
- [ ] Loop bounds: max iterations, token or cost budget, timeouts
- [ ] Retries only for retryable errors, without stacking on top of SDK retries; typed error handling
- [ ] Streaming for long requests; generous `max_tokens`; no silent truncation of input
- [ ] Cache-friendly prompt ordering verified with cache-hit metrics
- [ ] Usage and cost tracked per route/tenant, with quotas
- [ ] No full prompts/completions/PII in logs by default
- [ ] Unit tests with fakes or fixtures (no live calls); eval run for prompt or model changes
