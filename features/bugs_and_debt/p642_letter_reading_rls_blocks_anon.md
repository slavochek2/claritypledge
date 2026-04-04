---
status: qa
date_resolved: 2026-04-04
root_cause: getLetterForReading() used direct table queries subject to RLS; all SELECT policies require auth.uid() != NULL, blocking anon recipients
resolution: Added SECURITY DEFINER RPC get_letter_for_reading(p_token) that validates token and returns all data in one call, bypassing RLS
type: bug
rank: 1
tags:
  - letters
  - rls
  - p581
created_date: 2026-04-04T00:00:00.000Z
flow: fix
---

# P642: Letter Reading Page — RLS Blocks Anonymous Recipients

**Related:** P581 (clarity letters)
**Branch:** feature/p581-clarity-letters (w2)

---

## Problem Statement

When an anonymous recipient opens a letter delivery link (`/letter/:deliveryId?token=...`), the page shows "Letter not found" instead of the letter content.

**Reproduction:**
1. Seal a letter with a recipient email (e.g., slava@inguro.com)
2. Open the delivery link (from email or browser URL)
3. Page shows "Letter not found"

**Screenshots:** `Screenshot at Apr 04 09-05-32.png`

---

## Root Cause (confirmed via 5-Why analysis)

**Two-step fetch with privilege mismatch:**

1. `getLetterByToken(token)` calls `get_letter_by_token` RPC — **SECURITY DEFINER**, granted to `anon`. This succeeds.
2. `getLetterForReading(letterId, deliveryId)` uses **direct Supabase table queries** on `clarity_letters`, `letter_story_snapshots`, `letter_deliveries` — all subject to RLS.

All three tables' SELECT policies require `auth.uid() != NULL`. Anonymous recipients have `auth.uid() = NULL` → all queries return zero rows → "Letter not found".

**Code path:**
- `src/app/pages/letter-reading-page.tsx` — orchestrates the two-step fetch
- `src/app/data/letters-service.ts:123,134,147` — direct table queries in `getLetterForReading()`
- `supabase/migrations/20260403224331_p581_clarity_letters.sql` — RLS policies (lines 155-225)

---

## Fix Approach

Create a new **SECURITY DEFINER RPC** `get_letter_for_reading(p_token UUID)` that:
1. Validates the invitation token (reuses `get_letter_by_token` validation logic)
2. Checks token expiry and letter status
3. Returns letter + story snapshots + delivery data in a single call
4. Granted to `anon`

Update `letters-service.ts` to call the new RPC when a token is present (replacing the direct table queries).

**Files:**
- New migration: `supabase/migrations/YYYYMMDDHHMMSS_p642_letter_reading_rpc.sql`
- Modify: `src/app/data/letters-service.ts`
- Possibly: `src/app/pages/letter-reading-page.tsx` (simplify two-step → one-step)

---

## Acceptance Criteria

- [ ] Anonymous user can open a letter delivery link and see letter content
- [ ] Token expiry is still enforced (expired token → appropriate error)
- [ ] Sealed letter status is validated (only sealed letters readable)
- [ ] Authenticated recipients also work (existing flow unbroken)
- [ ] No prediction data leaked before recipient completes reading (sealed-bid integrity)

---

## Resolution

**Fixed:** 2026-04-04
**Commit:** `e927768b` on `feature/p581-clarity-letters`

**Files changed:**
- `supabase/migrations/20260404091744_p642_letter_reading_rpc.sql` (new — SECURITY DEFINER RPC)
- `src/app/data/letters-service.ts` (added `getLetterForReadingByToken()`)
- `src/app/pages/letter-reading-page.tsx` (replaced two-step fetch with single RPC call)
- `supabase/migrations/20260403224331_p581_clarity_letters.sql` (fixed `is_current` → `version_number`)

**Also fixed in this session:**
- P581 `seal_and_send_letter` RPC referenced non-existent `story_versions.is_current` column (→ `version_number`)
- Deployed `send-letter-emails` edge function (was missing from test project)

**E2E test:** `e2e/p642-letter-reading-flow.spec.ts` — 4/5 pass, 1 failing (auth rating — test data isolation, not code bug)

**Remaining work for next session:**
- [ ] Fix auth rating E2E test (needs separate deliveryId or cleanup between tests)
- [ ] Integration test for migrations: `e2e/integration/p642-db-schema.spec.ts` (P270 rule)
- [ ] Sender name shows UUID instead of display name (pre-existing, separate issue)
- [ ] Backfill existing sealed letters on prod (one-time SQL — content denormalization)
- [ ] Verify email delivery works (Mailgun env vars on test project)
