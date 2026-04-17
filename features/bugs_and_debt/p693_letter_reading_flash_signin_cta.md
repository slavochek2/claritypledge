---
id: p693
title: Flash of "Sign in to continue" CTA during one-to-one letter open
type: bug
status: qa
severity: medium
delivery_stage: fix
pipeline_ran: [fix]
date_reported: 2026-04-11
tags: []
rank: 1000693.0
created_date: 2026-04-11
---

# P693: Flash of "Sign in to continue" CTA during one-to-one letter open

## Bug Description

**Severity:** Medium — jarring UX, misleads recipient into thinking sign-in is required
**Reported:** 2026-04-11

**Symptoms:**
- A recipient opens a one-to-one letter URL (`/letter/:id?token=...`)
- After clicking "Open the Letter" and the edge function runs, the page briefly renders a "Sign in to continue" CTA (~1 frame, a few hundred ms)
- Then the correct rating UI appears ("How well do you believe you understand this story?")
- Recipients do NOT need to sign in — the token already authed them

**Reproduction steps:**
1. Open a one-to-one letter URL with a valid invitation token (as unauthenticated user)
2. Click "Open the Letter" (triggers TOS consent + edge function)
3. Watch the transition to reading view — observe flash of "Sign in to continue" button
4. The flash resolves to the rating Drawer within ~200–500ms

**Affected users:** All unauthenticated recipients of one-to-one letters

---

## Root Cause

`letter-reading-page.tsx:269` calls `setViewState('reading')` the instant `supabase.auth.verifyOtp()` resolves. `LetterReadingFlow` renders with `isAuthenticated={!!currentUser}`, but `currentUser` is still `null` because `AuthContext.tsx` uses a two-effect pattern:

1. **Effect 1** (`AuthContext.tsx:78`) — updates `session` via `onAuthStateChange`
2. **Effect 2** (`AuthContext.tsx:128`) — fetches profile via network call, only then calls `setUser`

Effect 2 requires one more async hop after `verifyOtp` resolves. During that gap, `session` is set but `currentUser` is `null`, so `isAuthenticated` is `false`, hitting the signed-out branch at `letter-reading-page.tsx:688`.

---

## Resolution

**Fixed:** 2026-04-11
**Root cause:** `isAuthenticated` used `!!currentUser` (requires profile fetch) instead of `!!session` (set synchronously by Effect 1)
**Resolution:** Changed `isAuthenticated={!!currentUser}` to `isAuthenticated={!!session}` at all three call sites in `letter-reading-page.tsx` (lines 432, 474, 491). Destructured `session` from `useAuth()` at line 71.

**Why `!!session` is correct:** After `verifyOtp`, `session` lands in `AuthContext` Effect 1 synchronously in the same React batch as `setViewState`. The rating submission path uses `token` + `delivery.id`, not `currentUser.id`. The signed-out branch at `:688` is still correct for tokenless recipients.

**Files changed:**
- `src/app/pages/letter-reading-page.tsx` (lines 71, 432, 474, 491)

**Regression test:** `e2e/integration/p693-letter-reading-no-flash-signin.spec.ts`

---

## Acceptance Criteria

- [x] "Sign in to continue" never appears during the one-to-one letter open flow when a valid token is present
- [x] Rating UI ("How well do you believe...") appears immediately on `viewState === 'reading'`
- [x] Signed-out branch at `:688` still works for tokenless recipients
- [x] Regression test verifies symptom at the DOM level (MutationObserver)

## Out of Scope

- P642 (anon RLS block on letter reading) — separate bug
- `AuthContext.tsx` two-effect design — deliberate, do not touch
