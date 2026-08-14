---
status: backlog
type: task
rank: 14
tags: [e2e, testing, multi-user, fixtures]
flow: dev
depends_on: p496
created_date: 2026-03-12
---

# P497: E2E Multi-User Test Fixtures

## Problem

~12 cases over 2 weeks where agents couldn't test two-user flows because they operate as a single identity. Many ClarityPledge features require host + guest interaction (/live sessions, agreement invitations). Without multi-user fixtures, these flows are untestable in E2E.

## Scope

1. **Seed script** — creates 2 test users (host + guest) in Supabase using service role key
2. **Playwright fixture** — provides two authenticated browser contexts simultaneously via `test.use({ users: 'host+guest' })`
3. **Test helpers** — common two-user scenarios: join live session, accept agreement invitation
4. **Cleanup script** — removes test data after each test run (no pollution)

## Depends On

- **P496** (programmatic auth bypass) — multi-user fixtures need programmatic auth to create authenticated contexts without UI login flow

## Acceptance Criteria

- [ ] `test.use({ users: 'host+guest' })` Playwright fixture provides two authenticated browser contexts
- [ ] A sample E2E test demonstrates host starting a /live session and guest joining
- [ ] Test data is cleaned up after each test run (no pollution)
- [ ] Works with existing RLS policies (uses service role for setup, user JWTs for test execution)

## Notes

- Service role key is for test setup/teardown only — test execution uses real user JWTs so RLS is exercised
- Fixture should be composable: single-user tests keep working unchanged
- Consider `globalSetup` for seed + `globalTeardown` for cleanup to avoid per-test overhead
