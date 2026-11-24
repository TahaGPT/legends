# Testing

## Test-First by Default

For new behavior and bug fixes:
1. Write a test that captures the requirement or reproduces the bug (RED). Run it and see it fail for the right reason.
2. Write the minimal code to pass (GREEN).
3. Refactor with the tests green (IMPROVE).

Spikes and throwaway prototypes can skip this. Their code is rewritten test-first before it ships.

## What to Test

- **Unit:** pure logic, edge cases, error paths.
- **Integration:** code against real dependencies where practical (database, HTTP handlers, queues), using test containers or in-memory fakes when not.
- **End-to-end:** a few critical user flows, not every permutation.

Aim for about 80% line coverage on changed code as a guide, but prioritize meaningful assertions on behavior over the number. Use whatever runner the project already uses.

## When Tests Fail

1. Read the failure. Reproduce it in isolation.
2. Check test isolation (shared state, ordering, time, randomness, network).
3. Fix the implementation, not the test, unless the test is wrong. If you change a test's expectation, say why.
4. Never delete, skip, or loosen a test just to get green.

## Agent Support

- **tdd-guide**: drives the red, green, refactor cycle for new features and bug fixes.
- **e2e-runner**: end-to-end tests for critical flows.
- **implementer**: executes an approved plan test-first (used by `/ship`).
