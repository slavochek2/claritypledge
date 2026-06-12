---
status: qa
type: bug
rank: 1000933.0
severity: high
workstream: agreements
date_reported: '2026-06-12'
created_date: '2026-06-12'
tags: [agreements, partner-invite, picker, p878, invitation-acceptance]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/p933-picker-invited-accept.spec.ts
  root_cause: >
    getIncomingInvitations filters partner_profile_id IS NULL — the pre-picker
    invariant. P878 picker pre-sets partner_profile_id at creation time, so the
    row never matches. The agreement falls into getAgreementsForProfile (matches
    via partner_profile_id.eq.<viewerId>) and renders in the recipient's "Pending
    invitation" section with Resend/Revoke because pendingAgreements has no
    creator-only guard.
  confidence: high
  surfaces_in_scope: [agreements-service-real.ts:getIncomingInvitations, profile-connections-page.tsx:pendingAgreements]
  surfaces_deferred: []
  reproduced_at: '2026-06-12'
---

# P933: Partner invited via name-picker cannot accept — invitation lands in the wrong section

## Summary

When a partner is invited by selecting their name in the email field (the P878 / "AD-6" registered-user picker), the recipient never sees the invitation in their **"Invited to sign"** section and has no Accept button. Instead it surfaces in the owner-style **"Pending invitation"** section showing the *creator's* name plus Resend/Revoke — so the recipient cannot accept from the app at all.

## Root Cause

The picker pre-sets `partner_profile_id` to the recipient at **creation** time via the `create_agreement_with_profile` RPC (`agreements-service-real.ts:139–168`; RPC body `supabase/migrations/20260605150000_p878_search_profiles_rpc.sql:320–327`).

But the recipient's incoming-invitation query filters on `partner_profile_id IS NULL` (`agreements-service-real.ts:610`) — the pre-picker invariant was "`partner_profile_id` stays NULL until the partner accepts." Because the picker now sets it eagerly:

1. `getIncomingInvitations(email)` no longer matches the row → it drops out of the recipient's "Invited to sign" list.
2. `getAgreementsForProfile` still matches it via `partner_profile_id.eq.<viewer>` (`agreements-service-real.ts:315`), status `pending` → the row renders in the "Pending invitation" section of `profile-connections-page.tsx:225–243`, with `resendable`/`cancelable = isOwner = true`.
3. The recipient (viewing their own Partners page, so `isOwner` is true) therefore sees **Resend / Revoke** and the **creator's** name (`AgreementRow` shows the counterparty), not Accept.
4. Resend/Revoke are no-ops for the recipient anyway — `resendInvitation` (`:462`) and `cancelInvitation` (`:516`) reject any caller who is not the creator.

**Invariant changed by P878:** "recipient profile_id is NULL until accept/claim" no longer holds for picker-addressed invitations. Only the consumer that *assumed* that invariant (agreements incoming-invitations) broke.

## Bounded scope (the same pattern elsewhere)

The AD-6 picker has exactly two consumers in the codebase:

- **Agreements** — broken (this bug).
- **Letters** — **SAFE.** The letter inbox queries `receiver_profile_id = me` (`letters-service.ts:752`), i.e. it expects the field to be *set*; a picker-pre-set id makes the letter appear immediately, which is the intended behavior. Letters were designed around "set = mine"; agreements around "null = pending-for-me." No fix needed for letters.

No other flow pre-sets a recipient profile_id from a picker (verified by grep for `p_*_profile_id` setters and recipient `IS NULL` filters across `src/app/data/`).

## Root Cause (Confirmed 2026-06-12)

`getIncomingInvitations` (`agreements-service-real.ts:610`) filters `.is('partner_profile_id', null)` — the pre-P878 invariant that "recipient profile_id is NULL until accept." P878 picker breaks this invariant by setting `partner_profile_id` at creation time. The row no longer matches `getIncomingInvitations`, so the recipient never sees the invitation in "Invited to sign."

Meanwhile `getAgreementsForProfile` (`:315`) matches the row via `partner_profile_id.eq.<viewerId>` + `status = 'pending'`, so it surfaces in `pendingAgreements` on the recipient's page. `pendingAgreements` has no creator-only guard — `resendable/cancelable = isOwner` uses the page-owner check (User B viewing their own page → `isOwner = true`), not the agreement-creator check. Recipient sees Resend/Revoke instead of Accept.

Canary: `e2e/p933-picker-invited-accept.spec.ts` — 2 tests FAIL before fix (right reason), 2 regression guards PASS.

## Reproduction Steps

1. Sign in as User A (creator). Go to `/agreements/new/create`.
2. In the partner email field, **select a registered user by name** (picker path), rather than typing a raw email. Send the invitation.
3. Sign in as User B (the invited registered user). Navigate to your own Partners page (`/p/:slug/partners`).
4. Observe: the invitation appears under **"Pending invitation"** with the creator's name and **Resend / Revoke** buttons — no Accept. There is no entry under "Invited to sign."

**Reproduction rate:** 100% (for any invitation created through the name picker).

## Expected Behavior

A partner invited via the picker sees the invitation under **"Invited to sign"** with a Review/Accept affordance, and can accept it from the app — identical to an email-addressed invitation.

## Actual Behavior

The invitation renders in the recipient's owner-style "Pending invitation" section with the creator's name and Resend/Revoke. No Accept path exists in-app. Resend/Revoke silently fail (creator-only guard).

## Affected Files

- `src/app/data/agreements-service-real.ts:603–630` — `getIncomingInvitations` filters `partner_profile_id IS NULL`; must also match `partner_profile_id = <viewer's own id>`.
- `src/app/pages/profile-connections-page.tsx:225–243` — "Pending invitation" owner section includes agreements where the viewer is the *partner*; should include only agreements where the viewer is the **creator**.
- `src/app/data/agreements-service-real.ts:139–168` — picker creation path (context; sets `partner_profile_id` eagerly — correct, no change).

## Severity

**High** — partner onboarding (a core flow) is broken for everyone invited through the name picker; the only workaround is the email link (which itself had friction, see Open Question) or manual DB intervention.

## Fix Approach

Two changes, agreements flow only:

1. **`getIncomingInvitations`** — broaden the match so a registered, picker-invited partner sees their invitation. Match rows where `status = 'pending'` AND `partner_email ilike :email` AND (`partner_profile_id IS NULL` OR `partner_profile_id = :viewerId`). Pass the viewer's profile id through (the page already has `currentUser.id`). Keep the expiry filter.
2. **`profile-connections-page` "Pending invitation" section** — filter `pendingAgreements` to only those where `agreement.creatorProfileId === profile.id` (viewer is creator). Agreements where the viewer is the partner must not appear in the owner Resend/Revoke section.

Add a one-line note to `docs/decisions.md`: the AD-6 picker changed the "recipient profile_id is NULL until accept" invariant; any new picker integration must audit every query that reads the recipient id.

## Open Question (investigate during /fix or defer)

A real-world report: even when authenticated and reaching the accept page, "failed to accept" was reported while a prod agreement (id below) was still `pending` with a **valid, unexpired** token. The `accept_agreement` WHERE clause (`id` + `token` + `status = 'pending'` + `creator != partner`, `supabase/migrations/20260403120100_security_fix_rpc_auth.sql:28–40`) should have matched, so the `false` return is unexplained. Possibly the user never actually reached the authenticated `partner` state and clicked the real Accept (vs. an earlier unauthenticated-flow failure). Confirm or reproduce before adding an AC for it; do not assume.

## Resolution Note (manual unblock already applied)

Prod agreement `f66f0669-acf3-4cfa-b8bd-4cce9e3925d1` was manually accepted on 2026-06-12 via the `accept_agreement` RPC (service role) to unblock the invited partner (a real registered user — identity intentionally omitted from this public spec). This is a one-off and does not fix the bug; the row is now `status: active`, `partner_signed_at` set. The "accepted" confirmation email did not fire (UI path bypassed).

## Acceptance Criteria

- [x] A registered user invited via the name picker sees the invitation under **"Invited to sign"** on their Partners page, with a Review/Accept affordance.
- [x] That recipient can accept the invitation from the app and the agreement becomes `active`.
- [x] The picker-invited invitation no longer appears in the recipient's **"Pending invitation"** (owner) section, and the recipient never sees Resend/Revoke for it.
- [x] The creator still sees the same invitation under their own "Pending invitation" section with working Resend/Revoke.
- [x] An email-addressed (non-picker) invitation still behaves exactly as before (regression).
- [x] Regression test passes: `e2e/p933-*.spec.ts` (picker-invited partner sees and accepts from app).
- [x] No console errors during the invite → view → accept flow.
