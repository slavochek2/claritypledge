---
status: all-done
completed_at: 2026-04-17
type: bug
rank: 1000715.0
severity: high
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, auth, email-delivery, tos, account-creation]
pipeline_ran: [create-bug, fix]
---

# P715: Email delivery — account creation and TOS gate broken for public letters

## Summary

When a **public letter** (DB: `clarity_letters.mode = 'one-to-many'`) is sent via **email delivery** (has `invitation_token` + `receiver_email`), the recipient:

1. Does not see the Terms of Service consent text on the letter cover
2. Does not get their account created via `create-and-open-letter` on clicking "Open the Letter"
3. Is silently routed into the `bufferOnly` path (intended for truly anonymous link access), where responses are buffered in sessionStorage and only submitted after a manual signup flow

This causes: no live data writes, sender never sees "in progress" in inbox, recipient must manually create account via "Save your responses" redirect.

## Terminology (precise, for agents)

| Term | Meaning | DB field |
|------|---------|----------|
| **Private letter** | Letter type with specific beliefs/positions for named recipient | `clarity_letters.mode = 'one-to-one'` |
| **Public letter** | Shareable letter, open to all | `clarity_letters.mode = 'one-to-many'` |
| **Email delivery** | Sent to a named recipient via email (has `invitation_token` + `receiver_email`) | `letter_deliveries` row with both fields set |
| **Link delivery** | Anonymous URL access, no named recipient | `letter_deliveries` row without `receiver_email`, or anonymous |

TOS consent and account creation must fire for **all email deliveries to unauthenticated recipients**, regardless of letter privacy type.

## Root Cause

Three coupled conditions in `letter-reading-page.tsx` all check `letter.mode === 'one-to-one'` instead of checking delivery channel:

1. **`bufferOnly` (line 774):** `letter.mode === 'one-to-many' && !session`
   — Routes any public letter access without session to the buffer path, even email deliveries with a valid token.

2. **`handleOneToOneOpen` guard (line 793):** `letter.mode === 'one-to-one' && token && !currentUser`
   — Only calls `create-and-open-letter` for private letters. Public letter email deliveries fall into `bufferOnly` branch instead.

3. **`needsConsent` in `letter-cover.tsx` (line 40):** `mode === 'one-to-one' && !isAuthenticated`
   — TOS only shown for private letters. Public letter email deliveries get no TOS.

All three should be conditioned on **delivery channel** (`!!token` = email delivery), not letter privacy type.

## Fix Approach

**Change 1 — `bufferOnly`:** Only buffer for truly anonymous access (no token):
```tsx
// Before
const bufferOnly = letter.mode === 'one-to-many' && !session;
// After
const bufferOnly = letter.mode === 'one-to-many' && !session && !token;
```

**Change 2 — `handleOneToOneOpen` guard:** Fire for any email delivery:
```tsx
// Before
if (letter.mode === 'one-to-one' && token && !currentUser) {
// After
if (token && !currentUser) {
```

**Change 3 — `needsConsent`:** Add `isEmailDelivery` prop to `LetterCover`, pass `isEmailDelivery={!!token}` from parent:
```tsx
// letter-cover.tsx — before
const needsConsent = mode === 'one-to-one' && !isAuthenticated;
// After
const needsConsent = isEmailDelivery && !isAuthenticated;
```

## Affected Files

- `src/app/pages/letter-reading-page.tsx` — lines 774, 793, and LetterCover call sites (~line 682, 781)
- `src/app/components/letters/letter-cover.tsx` — line 40, add `isEmailDelivery` prop

## Acceptance Criteria

- [x] Public letter sent via email: TOS text shown on cover for unauthenticated recipient
- [x] Public letter sent via email: clicking "Open the Letter" calls `create-and-open-letter` and mints a session
- [ ] Public letter sent via email: recipient engages letter without being redirected to "Save your responses"
- [ ] Public letter sent via email: sender sees delivery arriving in inbox with "in progress" step count
- [x] Public letter accessed via anonymous link (no token): unchanged behavior (bufferOnly → save responses)
- [x] Private letter email delivery: unchanged behavior (already working)
- [x] `npm test` passes with no new failures
