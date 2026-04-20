---
status: all-done
type: bug
rank: 1000053
severity: medium
date_reported: 2026-04-04T00:00:00.000Z
created_date: 2026-04-04T00:00:00.000Z
tags:
  - letters
  - tests
  - p642
flow: fix
locked_at: '2026-04-20T09:55:55.810Z'
---

# BUG: P642 Auth Rating E2E Test Fails — Test Data Isolation

## Problem

The P642 E2E test `authenticated user sees rating buttons and can rate` fails because it reuses the same letter delivery as earlier anonymous tests. By the time the auth test runs, position data already exists on that delivery, so the gap-reveal/rating UI doesn't appear.

**Also:** The `supabase-admin` import path was stale after the P644 refactor moved it to `e2e/helpers/` — this is a rebase artifact, already fixed locally on w2.

## Symptoms

- Test 5/5 in `e2e/p642-letter-reading-flow.spec.ts` fails with timeout waiting for `text=/prediction|gap|continue/i`
- Screenshot shows the letter page stuck at story reading, not advancing to rating
- 4/5 other tests pass

## Root Cause

Test data isolation: all 5 tests share a single `beforeAll` fixture that creates one letter + one delivery. Anonymous position tests mutate that delivery's state, leaving it in a post-position state by the time the auth rating test runs.

Secondary: import path `../src/lib/supabase-admin` broken after P644 moved it to `e2e/helpers/supabase-admin`.

## Resolution

_To be filled in after fix._

## Verification

- `npx playwright test e2e/p642-letter-reading-flow.spec.ts` — all 5 tests pass
- Visual QA via `/verify` on the letter reading page
