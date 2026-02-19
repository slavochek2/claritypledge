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
- Full guide: [e2e-testing.md](docs/technical/e2e-testing.md)

## Unit Tests (Vitest)

- Location: `src/tests/` or colocated with components
- Run: `npm test`
