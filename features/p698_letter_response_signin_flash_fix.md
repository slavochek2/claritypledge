---
status: in-progress
type: bug
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---

# P698: Letter Response "Sign in required" Flash Fix

## Bug Description

**Reported:** 2026-04-12
**Severity:** High (blocks letter responders from completing their response)

**Symptoms:**
- After an unauthenticated reader completes a one-to-many letter and clicks the magic link from email, the confirm page (`/letter/:id/confirm`) flashes "Sign in required" before the session arrives
- Users see this and navigate away, thinking the link is broken

**Root cause:** The edge function's `redirectTo` sends the user directly to the confirm page, bypassing `/auth/callback`. Every other magic-link flow (partner agreement invite, pledge invite) routes through `/auth/callback` first, which waits for the session to settle before redirecting. The letter response flow skipped this step, creating a timing race between `getSession()` and `detectSessionFromUrl`.

**Reproduction steps:**
1. Open a sealed one-to-many letter URL as signed-out user
2. Complete the letter (set positions, rate stories)
3. On "Save your responses" page: enter name + real email + accept terms
4. Click "Save my responses"
5. Open email → click magic link
6. Expected: No auth flash, lands on confirm page with session present
7. Actual: Confirm page briefly shows "Sign in required" before session settles

---

## Fix

**File:** `supabase/functions/request-letter-response-signin/index.ts` line 446

**Change `redirectTo` from:**
```typescript
const redirectTo = `${appUrl}/letter/${letterId}/confirm`;
```
**To:**
```typescript
const redirectTo = `${appUrl}/auth/callback?redirect=/letter/${letterId}/confirm`;
```

**Why this works:** Routes through `/auth/callback` which waits for `sessionChecked && !isLoading` before proceeding, ensuring session is in localStorage before confirm page loads. `/letter` is already in `ALLOWED_REDIRECT_PREFIXES`.

---

## Acceptance Criteria

- [x] Magic link routes through `/auth/callback` before landing on confirm page
- [x] No flash of "Sign in required" at any point in the flow
- [x] Confirm page loads with session already present
- [x] Edge case: magic link opened on different device/browser still works

---

## Resolution

**Fixed:** 2026-04-12
**Root cause:** `redirectTo` in `request-letter-response-signin` pointed directly at confirm page, bypassing `/auth/callback` session-settling logic
**Resolution:** Changed `redirectTo` to route through `/auth/callback?redirect=/letter/${letterId}/confirm`
**Files changed:** `supabase/functions/request-letter-response-signin/index.ts` (line 446)
