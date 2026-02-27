---
id: p451
title: "Guard: creator cannot accept their own agreement"
type: bug
status: backlog
priority: high
flow: fix
source: sim
changes: p422
persona: invited-party
created: 2026-02-27
---

## Problem

Found during `/sim` of p422 (Clarity Partner Agreement). On the accept-agreement page (`/agreements/:id/accept?token=...`), the gate that controls whether the current user is the intended partner does not exclude the agreement creator.

Relevant code in `src/app/pages/accept-agreement-page.tsx` (lines 80–85):

```ts
if (ag.status !== 'pending' || (ag.partnerProfileId && ag.partnerProfileId !== currentUser.id)) {
  setPageState('wrong-user');
  return;
}
setPageState('partner');
```

When `partnerProfileId` is `null` (the invited party has not yet created an account), the second sub-expression `ag.partnerProfileId && ag.partnerProfileId !== currentUser.id` evaluates to `false` regardless of who is logged in. This means the creator of the agreement, opening their own invitation link while authenticated, passes the gate and lands on the `'partner'` state — seeing the "I Accept & Co-Sign" button.

This is a security issue: a creator could self-sign their own agreement, bypassing the two-party intent of the feature.

## Expected Behavior

When the authenticated user is the creator of the agreement, the page must route them to the `'wrong-user'` state and display a message such as:

> "You created this agreement — share the link with your partner."

The creator should never see the "I Accept & Co-Sign" CTA on their own invitation.

## Root Cause

The frontend condition is missing a creator-exclusion check. The `ClarityAgreement` object returned by the service (see `src/app/data/agreements-service.interface.ts`) exposes `creatorProfileId: string` as a top-level field. This is the correct field to use for the comparison — it is always populated, unlike the joined `creator` object which may be `null` if profile fetch fails.

The fix is:

```ts
if (
  ag.status !== 'pending' ||
  ag.creatorProfileId === currentUser.id ||             // ← add this
  (ag.partnerProfileId && ag.partnerProfileId !== currentUser.id)
) {
  setPageState('wrong-user');
  return;
}
```

The backend `accept_agreement` RPC also lacks this guard — the frontend check alone is not sufficient for security since it can be bypassed by a direct API call.

## Acceptance Criteria

### Frontend — `src/app/pages/accept-agreement-page.tsx`

- [ ] The wrong-user condition includes `ag.creatorProfileId === currentUser.id`.
  - Use `ag.creatorProfileId` (top-level string field on `ClarityAgreement`), not `ag.creator?.profileId` (the joined party object, which can be null).
- [ ] When the creator opens their own invitation link while authenticated, `pageState` is set to `'wrong-user'`.
- [ ] The wrong-user UI renders (existing copy is acceptable — do not change the copy text in this ticket; see Out of Scope).

### Backend — `accept_agreement` RPC

- [ ] The RPC rejects the call with an appropriate error when `p_partner_id` equals the `creator_profile_id` stored on the agreement row.
- [ ] The rejection is observable as an error return from `supabase.rpc('accept_agreement', ...)` — the frontend must already handle a failed RPC as an error state.

### Regression

- [ ] A legitimate partner (different user, correct token) can still accept successfully — the new condition does not break the happy path.
- [ ] An unauthenticated user visiting the link is unaffected by this change.

## Out of Scope

- Changing or improving the wrong-user copy or UX (keep that for a separate UX pass).
- Handling the case where the creator is also the email address on the invite (that guard already exists in `createAgreement` in `agreements-service-real.ts` line 119).
