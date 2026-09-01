---
status: backlog
type: task
rank: 54
created_date: '2026-04-17'
tags: [docs, auth, cleanup]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P742: Update stale `docs/technical/authentication.md` (post-P396)

## Problem

`docs/technical/authentication.md:128-176` documents a three-state auth model (`Anonymous` / `Unverified guest` / `Verified`) where unverified guests join `/live` via `getOrCreateGuestUser()` and create `profiles` rows with `is_verified=false, slug=null`.

[P396](done/5_feb_26/p396_eliminate-unverified-user-state.md) (shipped 2026-02-19) eliminated this middle state entirely. `getOrCreateGuestUser()` is deleted from `src/` (grep returns zero hits). `/live` guests now use anonymous Supabase auth with **no `profiles` row**. The "Three user types" table, the "Guest join flow" section, and the "Verification path for guests" section all describe code that no longer exists.

**Why it matters:** The doc is load-bearing context for any agent reasoning about auth/profiles. During P736 spec work, relying on this doc produced an incorrect conclusion that enforcement would break the guest flow — caught only by a second-pass review. The next agent may not be as lucky.

## Appetite

Small — one doc file, ~50 lines rewritten against current code. Read-only verification against `src/app/data/api.ts` and `src/auth/AuthCallbackPage.tsx` to confirm current reality.

## Solution

1. Rewrite "Guest / Unverified Users" section (lines 128–176) to describe the post-P396 model: `/live` → anonymous Supabase auth → no profile row; verification path → magic link → `AuthCallbackPage` creates the profile at verification time with slug.
2. Update "Three user types" table to remove the Unverified guest row or rename it to "Anonymous guest (no profile)".
3. Audit the rest of `authentication.md` for other P396-era staleness in the same pass (search for "unverified profile", "getOrCreateGuestUser", "is_verified: false").
4. Add a dated note at the top: `Last verified against code: 2026-04-17`.

## Risks / Non-Goals

### Risks
- **Under-reach:** other technical docs may have similar P396 staleness. Non-goal here — scope is `authentication.md` only. If found during audit, file follow-up.

### Non-Goals
- No behavior change, code change, or schema change.
- No rewrite of sections unrelated to the guest model.

## Done-When

- [x] `docs/technical/authentication.md:128-176` matches current code (verified by grep against `src/`)
- [x] "Three user types" table reflects post-P396 reality
- [x] Other P396-era staleness in the same file audited
- [x] Dated verification note added at top

## Evidence (2026-09-01, overnight docs-hygiene lane)

Full rewrite verified against current code; per-paragraph proof in the session's `p742-diff-notes` (23 corrected, 14 kept, 3 marked unverifiable: Brevo DNS/SMTP, dashboard redirect URLs, WebView storage). `grep -rn getOrCreateGuestUser src` → 0. Follow-ups found (out of scope): dead `source=live` migration branch, stale `is_verified` comments in the live page, unreachable `/me` verify branch, `useVerificationGate` remnant, `handle_new_user` fact duplicated in database.md.
