---
name: python-patterns
description: Python idioms and project conventions for writing, testing, reviewing, and securing Python code. Use whenever the project has a pyproject.toml, setup.py, requirements file, or .py sources and you are planning, implementing, reviewing, testing, or fixing Python: tooling (uv, ruff, mypy/pyright, pytest), project layout, typing, error handling, async, data validation, testing, packaging, performance, and security.
---

# Python Patterns

Conventions for Python work in this toolkit. They override the TypeScript-oriented rules in `coding-standards`, `tdd-workflow`, and `rules/` when the code is Python (for example, console.log checks become `print()`/`breakpoint()` checks).

**Always defer to the project first:** `pyproject.toml` (`requires-python`, `[tool.ruff]`, `[tool.mypy]`, `[tool.pytest.ini_options]`), lockfiles, `CLAUDE.md`, CI workflows, and existing code patterns win over anything here.

## Tooling and Commands (the Python verification loop)

Detect the toolchain before running anything:

| Signal | Tool | Run commands with |
|--------|------|-------------------|
| `uv.lock` | uv | `uv run <cmd>`; `uv sync` to install |
| `poetry.lock` | Poetry | `poetry run <cmd>` |
| `pdm.lock` | PDM | `pdm run <cmd>` |
| `requirements*.txt` only | pip + venv | activate `.venv`, then run directly |

For new projects, prefer **uv** (fast, lockfile, manages Python versions).

```bash
ruff format --check .                 # formatting
ruff check .                          # lint (replaces flake8/isort/pyupgrade/many plugins)
mypy .            # or: pyright       # type check, whichever the project configures
pytest -q                             # tests
pytest --cov --cov-report=term-missing   # coverage (pytest-cov)
pip-audit                             # known vulnerabilities in dependencies
bandit -q -r src                      # security lint (if configured)
```

`verification-loop`, `/verify`, and `/build-fix` use these instead of npm commands when Python project files are present. Debris to flag instead of `console.log`: `print()` used as debug output, `breakpoint()`, `pdb`, `# type: ignore` without an error code, and bare `except:`.

## Project Layout

```
pyproject.toml          # metadata, dependencies, and tool config in one place
src/
  package_name/
    __init__.py
    domain/             # pure logic and types, no I/O
    adapters/           # DB, HTTP, queues, LLM clients
    api/ or cli/        # entry points: FastAPI/Django/Flask app, Typer/Click CLI
tests/
  unit/
  integration/
  conftest.py
```

- **src layout**: prevents tests from importing the working tree by accident and catches packaging mistakes.
- Dependencies point inward toward `domain`. Keep I/O at the edges so the core is easy to test.
- One configuration object (e.g. `pydantic-settings`), loaded once at startup and validated, failing fast on missing variables. No `os.environ[...]` scattered through the code.

## Typing

- Type every public function signature, plus internals wherever it helps. Run the type checker in CI (`mypy --strict` or `pyright` strict for new code; match the existing config).
- Modern syntax for the project's minimum Python: `list[str]`, `X | None`, `type` aliases, `Self`, `TypedDict`, `Protocol` for structural interfaces, and `@override`.
- `Any` only at true boundaries (untyped third-party data), converted into typed objects immediately.
- `# type: ignore[code]` must include the specific error code and a reason.
- `dataclass(frozen=True, slots=True)` for internal value objects; **Pydantic** models at trust boundaries (API input, config, external data, LLM output) where you need validation.
- `Enum` / `StrEnum` or `Literal` for fixed sets, not magic strings.

## Error Handling

- Raise specific exceptions. Define a small hierarchy per package (`class AppError(Exception)`, `class NotFoundError(AppError)`).
- **Never use bare `except:` or `except Exception: pass`.** Catch what you can handle; let the rest propagate.
- Chain with `raise NewError(...) from err` to preserve the cause, and add context in the message (which ID, which file), never secrets.
- Use `try/finally` or context managers (`with`) for every resource: files, connections, locks, temp dirs. Write `@contextmanager` helpers for custom resources.
- Validate at boundaries and trust typed data inside. Don't sprinkle defensive `isinstance` checks through core logic.
- Use `ExceptionGroup` / `except*` when handling failures from `TaskGroup`.

## Idioms

- Comprehensions and generators over manual append loops. Generators for large or streaming data.
- `pathlib.Path` over `os.path` string handling.
- f-strings for formatting, but **never for SQL, shell commands, or log messages with untrusted data** (use parameters, argument lists, and logger args).
- `enumerate`, `zip(strict=True)`, `itertools`, `functools.cache` / `lru_cache` for pure functions.
- **No mutable default arguments** (`def f(x=[])`). Use `None` and create the value inside.
- `logging` with module-level `logger = logging.getLogger(__name__)`, not `print`. Use structured logging (e.g. `structlog`) if the project does.
- Timezone-aware datetimes only: `datetime.now(tz=UTC)`, never naive `datetime.utcnow()`.
- `decimal.Decimal` (or integer minor units) for money, never `float`.

## Async

- Use async only when the workload is I/O-bound and the stack is async end to end (FastAPI, aiohttp/httpx async, asyncpg). Don't mix in sync blocking calls.
- **Never block the event loop:** no `time.sleep`, `requests`, sync DB drivers, or heavy CPU inside `async def`. Use `await asyncio.sleep`, async clients, and `asyncio.to_thread` or a process pool for CPU work.
- **Structured concurrency:** `asyncio.TaskGroup` (3.11+) instead of loose `create_task` calls whose exceptions get lost. Keep references to background tasks.
- Bound concurrency with `asyncio.Semaphore`. Put timeouts on every external call (`asyncio.timeout()` or client timeouts).
- Handle cancellation: don't swallow `CancelledError`, and clean up in `finally`.

## Testing (TDD in Python)

The `tdd-workflow` cycle applies unchanged. The tools differ:

| Need | Tool |
|------|------|
| Test runner | `pytest` (plain `assert`, fixtures, markers) |
| Shared setup | Fixtures in `conftest.py`, scoped deliberately (`function` by default) |
| Many cases | `@pytest.mark.parametrize` |
| Property tests | `hypothesis`: parsers, serializers, invariants |
| Mocking | `pytest-mock` (`mocker`) or `unittest.mock`; patch where the name is *looked up*, not where it's defined |
| HTTP mocking | `respx` (httpx) or `responses` (requests) |
| Async tests | `pytest-asyncio` or `anyio` |
| Time | `freezegun` or `time-machine` |
| DB tests | Transaction-per-test rollback, or testcontainers for a real database |
| Snapshot tests | `syrupy` or `inline-snapshot` |
| Coverage | `pytest-cov` (toolkit default target 80%, focused on domain logic) |

```python
import pytest
from package_name.domain.email import Email, InvalidEmail

@pytest.mark.parametrize("raw", ["", "no-at-sign", "a@", "@b.com"])
def test_rejects_invalid_email(raw: str) -> None:
    with pytest.raises(InvalidEmail):
        Email.parse(raw)

def test_normalizes_case() -> None:
    assert Email.parse("A@B.COM").value == "a@b.com"
```

- Tests must not depend on order, network, or real time. Mark slow or integration tests (`@pytest.mark.integration`) so the fast suite stays fast.
- Mock at boundaries you own (your client wrapper), not deep inside libraries.

## Packaging and Dependencies

- Dependencies declared in `pyproject.toml` (`[project.dependencies]`, plus optional or dev groups), with a committed lockfile for applications.
- Libraries: compatible ranges (`>=2.1,<3`). Applications: locked exact versions.
- `requires-python` set and tested in CI, with a matrix only for the versions you support.
- Don't add a dependency for something the standard library does well.

## Performance

- Measure first: `cProfile` / `pyinstrument` for CPU, `tracemalloc` / `memray` for memory, `pytest-benchmark` for regressions.
- Use the right data structure (`set`/`dict` lookups over list scans, `collections.deque`, `heapq`), and vectorize numeric work (NumPy/pandas/polars) instead of Python loops.
- Use generators and streaming for large files or result sets instead of loading everything into memory.
- In ORMs, watch for N+1 queries (`select_related` / `prefetch_related` in Django, `selectinload` in SQLAlchemy).

## Security

- **Subprocess:** argument lists, never `shell=True` with any interpolated input. `subprocess.run([...], check=True, timeout=...)`.
- **SQL:** parameterized queries or ORM query builders only. Never use f-strings or `%` formatting in SQL.
- **Deserialization:** never `pickle`, `marshal`, or `shelve` on untrusted data. Use `yaml.safe_load`, never `yaml.load`. For XML, use `defusedxml`.
- **No `eval` / `exec`** on anything derived from input (including LLM output).
- **Paths:** resolve and check containment (`path.resolve().is_relative_to(base)`) before using user-supplied paths. Use `tarfile` extraction filters (`filter="data"`) and check zip member paths.
- **Secrets:** from the environment or a secret manager via the settings object. Use `pydantic.SecretStr` so they don't print in reprs or logs. Never log request bodies containing credentials or PII.
- **Randomness:** `secrets` for tokens, never `random`.
- **HTTP clients:** always set timeouts (`httpx` has defaults; `requests` has none). Keep TLS verification on.
- **Web frameworks:** CSRF on for cookie auth (Django default), `DEBUG=False` in production, explicit allowed hosts, and validated request bodies (Pydantic/DRF serializers).
- Run `pip-audit` (and `bandit` if configured) in CI.

## Code Review Checklist (Python)

For use by `code-reviewer` and `security-reviewer`:

- [ ] Type checker and `ruff` clean; no unexplained `# type: ignore` or `noqa`
- [ ] No bare `except` or silently swallowed exceptions; errors chained with `from`
- [ ] Resources managed with context managers; no blocking calls in async code
- [ ] No mutable default arguments; timezone-aware datetimes; `Decimal` for money
- [ ] Untrusted input validated at the boundary (Pydantic or equivalent)
- [ ] No `shell=True`, SQL string formatting, `pickle`/`yaml.load`, or `eval` on untrusted data
- [ ] Secrets not logged or printed; HTTP calls have timeouts
- [ ] Tests cover new logic; no network or real time in unit tests
- [ ] No leftover `print()` debugging, `breakpoint()`, or commented-out code

## Related

- `tdd-workflow` skill: the TDD process (use the Python tooling above)
- `security-review` skill: general OWASP checklist
- `llm-integration` skill: when the Python code calls LLM APIs
