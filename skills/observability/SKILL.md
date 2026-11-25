---
name: observability
description: Logging, metrics, tracing, and alerting patterns for services and applications. Use when adding a new service, endpoint, background job, or integration, when instrumenting code, when debugging production issues, or when setting up dashboards and alerts. Covers structured logging, OpenTelemetry tracing, RED/USE metrics, health checks, SLOs, alerting, and keeping secrets and PII out of telemetry.
---

# Observability

Code that runs in production must be able to answer three questions without a redeploy: **Is it working?** (metrics and alerts) **What happened?** (logs) **Where did the time go?** (traces). Instrument as you build, not after the first outage.

**Defer to the project first:** use the logging library, metrics client, tracing setup, and naming conventions already in place. Don't add a second telemetry stack.

## 1. Structured Logging

- **Structured, not prose:** log events as key-value fields (JSON in production), not interpolated sentences.
  - Rust: `tracing` with `tracing-subscriber` (JSON layer). Node: `pino`. Python: `structlog` or `logging` with a JSON formatter.
- **Every log line carries context:** service, environment, version, request or trace ID, and (when known) user or tenant ID as an opaque ID, never an email address.
- **Log levels mean something:**
  - `error`: something failed and needs attention (would page or ticket)
  - `warn`: unexpected but handled (retry succeeded, fallback used)
  - `info`: significant business or lifecycle events (started, job completed, order placed)
  - `debug`: diagnostic detail, off in production by default
- **Log once, where the error is handled**, not at every layer it passes through. Include the error chain or cause.
- **Don't log in hot loops.** Sample or aggregate into metrics instead.

```rust
// Rust (tracing)
#[tracing::instrument(skip(db, payload), fields(order_id = %order_id, tenant_id = %tenant_id))]
async fn place_order(db: &Db, order_id: OrderId, tenant_id: TenantId, payload: OrderInput) -> Result<()> {
    tracing::info!(items = payload.items.len(), "order placed");
    Ok(())
}
```
```typescript
// Node (pino)
logger.info({ orderId, tenantId, items: payload.items.length }, 'order placed')
```

## 2. Never Log Secrets or Sensitive Data

- No passwords, tokens, API keys, session cookies, authorization headers, full card numbers, or private keys. Ever.
- No full request or response bodies by default. Allow-list the fields you log rather than block-listing.
- PII (emails, names, addresses, phone numbers, IPs where regulated) only when necessary, masked or hashed, with retention limits.
- LLM prompts and completions are sensitive user content. Log metadata (model, tokens, latency, stop reason), not content, by default (see `llm-integration`).
- Configure redaction in the logger (pino `redact`, structlog processors, `tracing` field `skip`) so it can't be forgotten per call site, and make sure types holding secrets don't print through debug formatting.

## 3. Tracing (OpenTelemetry)

- Use **OpenTelemetry** SDKs and auto-instrumentation for HTTP servers and clients, databases, and queues. Export via OTLP to whatever backend the project uses.
- **Propagate context** across every boundary: incoming HTTP headers (`traceparent`), outgoing calls, message queue metadata, background jobs started by a request.
- Add manual spans around meaningful units of work (external calls, expensive computations, LLM calls), with attributes that help debugging (IDs, sizes, cache hit or miss), never secrets.
- Put the trace ID in every log line and in error responses (as a request ID), so a user report links to the trace.
- Sample deliberately: head sampling for high-volume traffic, but always keep errors and slow requests (tail sampling, if available).

## 4. Metrics

**RED for every request-driven service or endpoint:**
- **Rate:** requests per second
- **Errors:** failed requests per second (by error class)
- **Duration:** latency histogram (p50/p95/p99), not averages

**USE for resources** (pools, queues, workers, caches): **Utilization, Saturation** (queue depth, pool waiters), **Errors**.

**Business metrics** for what the system is for: orders placed, jobs completed, signups, LLM spend per tenant.

Rules:
- Use **histograms** for latency and sizes, counters for events, and gauges for current levels.
- **Label cardinality must stay bounded:** route templates (`/orders/{id}`), not raw paths; status classes; tenant tier, not tenant ID (unless the backend handles high cardinality). Never use user IDs, emails, or free text as labels.
- Name metrics consistently, following the project's convention or OpenTelemetry semantic conventions (`http.server.request.duration`).

## 5. Health Checks

- **Liveness** (`/healthz`): the process is running and not deadlocked. Cheap, with no dependency checks, so a slow database doesn't trigger restart loops.
- **Readiness** (`/readyz`): able to serve traffic. Checks critical dependencies (database connection, required config) with short timeouts.
- **Startup** probe for slow-starting services, if the orchestrator supports it.
- Health endpoints don't leak versions of dependencies or internal details publicly.

## 6. SLOs and Alerting

- Define SLOs for user-facing behavior: "99.9% of `POST /orders` succeed", "95% of searches under 300 ms", measured over a rolling window.
- **Alert on symptoms users feel** (SLO burn rate, error rate, latency), not on every cause (CPU at 80%). Cause metrics belong on dashboards.
- Every alert is **actionable**, links to a runbook (what it means, how to diagnose, how to mitigate), and has an owner. If nobody would act on it, delete it.
- Use multi-window burn-rate alerts to avoid both flapping and slow detection. Page for fast burns; ticket for slow ones.
- Alert on the absence of signals too (a job that stopped running, a heartbeat that stopped).

## 7. Errors and Background Work

- Capture unhandled errors with context: an error tracker (Sentry or equivalent) or error-level logs with the trace ID.
- Background jobs and cron tasks emit: started, succeeded or failed, duration, items processed, and a heartbeat or "last success" timestamp metric so silence is detectable.
- Queues: depth, age of oldest message, processing rate, and a dead-letter count.

## 8. Dashboards

One dashboard per service, top to bottom: SLO status → RED metrics per endpoint → dependencies (DB, cache, external APIs, LLM providers) → resources (USE) → recent deploys as annotations. Keep it short enough to read during an incident.

## Checklist for a New Service, Endpoint, or Job

- [ ] Structured logs with service/version/environment/trace ID; levels used correctly
- [ ] Redaction configured; no secrets, tokens, bodies, or unmasked PII in logs, spans, or metric labels
- [ ] Tracing context propagated in and out; spans on external calls
- [ ] RED metrics with bounded labels; business metric for the feature's purpose
- [ ] Liveness and readiness endpoints (services); heartbeat or last-success metric (jobs)
- [ ] SLO defined for user-facing paths; symptom-based alert with a runbook link
- [ ] Error tracking captures unhandled exceptions with context
