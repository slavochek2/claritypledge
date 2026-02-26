---
paths:
  - "e2e/**/*.ts"
  - "src/tests/**/*.ts"
  - "src/tests/**/*.tsx"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
---

# Test Rules

Tests are executable specifications. Modifying a test to make it pass = changing the spec.

- If tests fail, fix the code (not the test)
- Never use `.only()` — breaks CI, other tests stop running
- Never delete failing tests to make the suite green
- Never change assertions to match buggy output
- Never enable skipped tests without understanding why they were skipped
- If you believe a test is genuinely wrong, explain why and ask before changing it

## E2E Tests (Playwright)

- Location: `e2e/*.spec.ts`
- Run: `npm run test:e2e`
- Full guide: [e2e-testing-guide.md](docs/technical/e2e-testing-guide.md)

## Unit Tests (Vitest)

- Location: `src/tests/` or colocated with components
- Run: `npm test`

## Subagent Scope Constraint

When a subagent is spawned to write tests, it MUST NOT modify source files.

**Permitted writes:**
- `e2e/**/*.ts`
- `src/tests/**/*.ts`, `src/tests/**/*.tsx`
- `src/**/*.test.ts`, `src/**/*.test.tsx`
- `tools/*/server/__tests__/**/*`, `tools/*/**/*.test.ts` (tool-local test suites)

**Prohibited — even "while you're in there":**
- `src/app/**/*` — application source
- `src/components/**/*` — UI components
- `tools/*/src/lib/types.ts` — type definitions
- Any `*.tsx` / `*.ts` file not matching the permitted patterns above

**Why:** A test-writing subagent rewrote `tools/kanban/src/lib/types.ts` and modified `App.tsx` and `CardDialog.tsx` unprompted. The changes were silent scope creep, caught only by checking `git diff` before committing, and had to be reverted.

**Prompt template for test subagents:**
```
Your task: [specific test task].
Write only to [test file paths]. Do NOT modify src/, lib/types.ts, or any non-test file.
If you believe a source change is required, report it and stop — do not make it.
```
