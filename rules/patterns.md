# Common Patterns

Defaults to reach for when the project has no established convention. If it has one, follow it. Code-level examples live in the `backend-patterns`, `frontend-patterns`, `python-patterns`, and `rust-patterns` skills, and API design in the **api-designer** agent.

## Consistent API Responses

Pick one response shape for the whole API and stick to it, for example:

```json
{ "data": { }, "error": null, "meta": { "total": 120, "page": 1, "limit": 20 } }
{ "data": null, "error": { "code": "not_found", "message": "Product not found" } }
```

- Machine-readable error `code` and human-readable `message`.
- Correct HTTP status codes; never 200 with an error body.
- Pagination metadata on list endpoints.

## Repository / Data-Access Layer

Keep storage behind a small interface (`find_all(filters)`, `find_by_id`, `create`, `update`, `delete`) so business logic doesn't depend on the database client, and tests can use an in-memory implementation.

## Thin Handlers, Testable Core

Handlers, controllers, and CLI entry points parse input, call a service function, and format output. Business rules live in plain functions or services that can be tested without a server.

## Configuration

Read configuration once at startup from the environment, validate it, and pass it down. Don't scatter environment lookups through the code.

## Start From Proven Foundations

For new projects or major components:
1. Look for well-maintained templates, starters, or libraries before writing from scratch.
2. Evaluate the candidates for security, maintenance activity, license, and fit. Parallel agents work well for this.
3. Start from the best match and adapt it, rather than reinventing the scaffolding.
