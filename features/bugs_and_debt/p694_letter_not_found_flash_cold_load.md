---
id: p694
title: '"Letter not found" flash on cold-load of letter reading page'
type: bug
status: qa
severity: high
delivery_stage: fix
pipeline_ran: [fix]
date_reported: 2026-04-11
tags: []
rank: 1000694.0
---

# P694: "Letter not found" flash on cold-load of letter reading page

## Bug Description

**Severity:** High — every recipient sees a "broken link" error flash on first visit
**Reported:** 2026-04-11

**Symptoms:**
- Recipient opens `/letter/:id?token=...` (cold load — clicked from email)
- For ~500ms, the page shows "Letter not found" error heading
- Then the correct letter cover renders normally
- The letter loads successfully — the error state is transient

**Reproduction steps:**
1. Obtain a fresh letter URL with valid invitation token
2. Hard-reload (Cmd+Shift+R) the page as an authenticated or anonymous user
3. Observe: "Letter not found" heading appears briefly before the cover

---

## Root Cause

Race condition between the load `useEffect` in `letter-reading-page.tsx` and the two-stage auth hydration in `AuthContext.tsx`:

1. `sessionChecked` flips `true` immediately after `getSession()` resolves (Effect 1)
2. The page's load effect fires with `currentUser = null` (Effect 2 hasn't fetched profile yet)
3. The authed-first branch falls through to token branch — all fine
4. ~150-300ms later, Effect 2 completes profile fetch → `currentUser?.id` changes → **load effect re-fires**
5. Second run calls `setPageState('loading')`, then can hit `setPageState('invalid')` via:
   - The catch block at line 187 on a transient PostgREST error during the concurrent run, OR
   - The authed branch returning null before the token branch succeeds

Three defects enable this:
- **No cancellation**: stale runs mutate state after a newer run has started
- **No "already ready" guard**: load re-runs on `currentUser?.id` change even if data is fully loaded
- **Auth not fully settled**: page treats `sessionChecked=true && user=null` as "definitely anon" but this state is transient during cold-load with an existing session (`isLoading` covers it)

---

## Resolution

**Fixed:** 2026-04-11
**Root cause:** Load effect re-runs on auth state change with no cancellation and no "already loaded" guard
**Resolution:** Three layered changes to `letter-reading-page.tsx` load effect:
1. `authLoading` gate: `if (!sessionChecked || authLoading || !deliveryId) return` — waits for auth to fully settle
2. `pageStateRef` guard: `if (pageStateRef.current === 'ready') return` — skips re-load when already loaded
3. Cancellation flag (`let cancelled = false`) wrapping all `setPageState` calls — stale runs cannot mutate state

**Files changed:**
- `src/app/pages/letter-reading-page.tsx` (load effect ~lines 96–192)

**Regression test:** `e2e/p694-letter-not-found-flash.spec.ts`

---

## Acceptance Criteria

- [x] "Letter not found" heading never appears transiently during cold-load with a valid token
- [x] Cover renders directly from the page loader (no intermediate error state)
- [x] Authenticated receiver on cold-load: no flash
- [x] Anonymous receiver on cold-load: no flash
- [x] Post-verifyOtp flow (P693): no regression — existing flash-signin-cta fix unaffected
- [x] Regression test verifies symptom at DOM level (MutationObserver pattern)
