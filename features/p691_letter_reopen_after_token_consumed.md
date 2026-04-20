---
status: all-done
completed_at: '2026-04-20'
type: bug
severity: high
date_reported: 2026-04-11T00:00:00.000Z
date_resolved: 2026-04-11T00:00:00.000Z
pipeline_ran:
  - fix
root_cause: >-
  letter-reading-page.tsx load effect always took the token branch when ?token=
  was present; invitation_expires_at=now() on first open burned the token,
  leaving no fallback for authenticated re-visits
resolution: >-
  Restructured load effect to authed-first — if currentUser exists,
  getLetterForReading (RLS-based) runs before the token RPC; token branch
  preserved for anon users; replay defense intact
tags: []
rank: 1000685
created_date: 2026-04-11T00:00:00.000Z
locked_at: '2026-04-20T09:56:14.342Z'
---

# P691: Letter Re-open Blocked After Token Consumed

## Bug Description

**Reported:** 2026-04-11
**Severity:** High (returning receivers see "Letter not found" on every re-visit)

**Symptoms:**
- First open works (TOS consent, session established, letter renders)
- Navigate away, revisit same URL → "Letter not found — This link may be invalid or the letter may no longer be available"

**Reproduction steps:**
1. Open a letter URL with `?token=...` as an authed receiver
2. Letter renders successfully (token path)
3. Navigate away (e.g. back to `/letters`)
4. Paste the same URL again
5. Expected: letter renders (receiver has a valid session)
6. Actual: "Letter not found" error

**Reproducer URL (test DB):** `http://localhost:5200/letter/b160f582-d12e-4597-8b9b-cc06f19932da?token=<burned-token>`

## Root Cause

`letter-reading-page.tsx:93-179` load effect always takes the token branch when `?token=` is present — the authed-session path (`getLetterForReading`) only runs when the URL has no token.

Commit `c77be9bd` sets `invitation_expires_at = now()` on first open in `create-and-open-letter/index.ts`. Token expires → `get_letter_by_token` RPC rejects it → `readData === null` → `setPageState('invalid')`.

No fallback to authed-session read exists for re-visits carrying the same URL.

## Resolution

Flip the load-effect to authed-first: if `currentUser` exists, call `getLetterForReading` first. Only fall through to the token RPC if the authed path returns null or user is anonymous. Preserves token-replay defense for anonymous users.

**Files changed:**
- `src/app/pages/letter-reading-page.tsx:93-179`

**Regression test:** `e2e/integration/p691-letter-reopen-after-token.spec.ts`

**Context:** See `~/.claude/plans/elegant-wondering-sifakis.md` for full restructure pseudocode and RLS pre-flight verification steps.

## Acceptance Criteria

- [ ] Re-open same URL as authed receiver: letter renders
- [ ] First open (anon, fresh token): TOS consent + session + letter — unchanged
- [ ] Anon token replay defense: expired token still rejected for unauthenticated user
- [ ] Wrong-user guard fires when different authed user visits
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Pre-commit checks pass
