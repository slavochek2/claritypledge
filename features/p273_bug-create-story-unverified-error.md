---
status: done
delivery_stage: implementation
type: task
rank: 2.0
workstream: C1
tags:
  - unverified
  - error-handling
  - verification-gate
created_date: 2026-02-18
uat_file: features/uat/p273.md
test_files:
  - src/tests/useVerificationGate.test.ts
  - e2e/p273-verification-gate.spec.ts
  - e2e/p273-smoke.spec.ts
  - e2e/a11y/p273-accessibility.spec.ts
completed_at: '2026-02-19'
---

# P273: Verification gate — consistent blocked-action UX for unverified users

## Problem

When an unverified guest tries to do something that requires a verified account, the experience is inconsistent and often broken:

- **Create story:** hits RLS → generic "Save failed. Please check your connection." (confusing)
- **Set position on point:** `story-detail-page.tsx:568` has an explicit check → clear toast (correct, but one-off)
- **Take pledge:** page is fully accessible, unclear what happens after submit for an already-unverified user
- **Any future gated action:** whoever implements it has to remember to add the check and invent their own message

There is no shared pattern. Each developer either copies the one correct example, invents something new, or forgets entirely and lets RLS produce a generic error.

## Solution: shared `useVerificationGate` hook

A single hook that any action handler calls before proceeding. It:
1. Checks `user.isVerified`
2. If not verified: shows a consistent toast with a CTA ("Verify your email — check your inbox or resend below") and returns `false`
3. If verified: returns `true` and lets the action proceed

```typescript
// Usage in any action handler:
const { checkVerified } = useVerificationGate();

async function handleCreateStory() {
  if (!checkVerified('create a story')) return;
  // ... proceed
}
```

The `action` label is used in the message: "Verify your email to [action]." One place to change the tone, wording, or behaviour (e.g. upgrade to a modal later).

## Gated actions to wire up in this ticket

- Create story (`create-story-page.tsx`)
- Set position on point (`story-detail-page.tsx` — already has a check, migrate to use the hook)
- Any other explicit `isVerified` checks found during implementation — replace with hook

**Not in scope:** take the pledge flow, start /live session — these need UX decisions first (see notes below). Add a `// TODO: useVerificationGate` comment where relevant so they're easy to find.

## Toast / message spec

- Message: `"Verify your email to [action] — check your inbox or resend below."`
- The "resend below" part is aspirational for now; for MVP the toast alone is sufficient
- Do NOT show a modal for MVP — toast is enough, modal can come later if conversion data warrants it

## Acceptance criteria

- [x] `useVerificationGate` hook exists in `src/app/hooks/` (or equivalent shared location)
- [x] Create story page uses it — unverified user sees clear message, not "Save failed"
- [x] Set position on point uses the hook (replaces one-off check in `story-detail-page.tsx:568`)
- [x] Any other `isVerified` checks found in the codebase are migrated to use the hook
- [x] Adding a gate to a new action in future requires one line: `if (!checkVerified('action label')) return;`
- [x] Verified users: no change in behaviour

## Notes on actions not in scope

**Take the pledge:** the `/sign-pledge` page is intentionally public — it's the conversion funnel. An unverified guest taking the pledge is the desired outcome. What needs thought is: what message do they see after submitting if they already have an unverified profile? That's a separate UX question.

**Start /live session:** hosts must be verified (decision from 2026-01-17). The gate is already enforced at the route level. Worth auditing that it's actually working, but not part of this ticket.

---

## Test Coverage Strategy

**What's Tested:**
- ✅ Hook logic — `checkVerified()` returns correct boolean and fires toast with right message (unit)
- ✅ Create story gate — unverified user sees hook toast, not "Save failed" (E2E)
- ✅ Create story happy path — verified user creates story without interruption (E2E)
- ✅ Set position gate — unverified user sees consistent hook toast, not old one-off message (E2E)
- ✅ Set position happy path — verified user can set position normally (E2E)
- ✅ Pages load without JS errors (smoke)
- ✅ Gate toast is present and in accessible DOM region (a11y)

**What's NOT Tested (rationale):**
- ❌ Take-pledge gate — out of scope per spec (UX decision pending)
- ❌ /live route gate — already enforced at route level, separate concern
- ❌ Internal hook state/re-renders — hook is stateless, nothing to track
- ❌ Toast dismiss/interaction — Sonner's internal behaviour, not our code

**Test Pyramid:**
```
       /\
      /  \   4 E2E tests (2 create-story + 2 set-position)
     /----\
    /  2   \  2 smoke tests
   /--------\
  /  7 unit  \  7 unit tests (hook contract)
 /____________\
  + 2 a11y tests
```

**Files generated:**
- `src/tests/useVerificationGate.test.ts` — 7 unit tests
- `e2e/p273-verification-gate.spec.ts` — 4 E2E tests
- `e2e/p273-smoke.spec.ts` — 2 smoke tests
- `e2e/a11y/p273-accessibility.spec.ts` — 2 accessibility tests
- `features/uat/p273.md` — 11 UAT scenarios

**Total:** 15 automated tests + 11 UAT scenarios
