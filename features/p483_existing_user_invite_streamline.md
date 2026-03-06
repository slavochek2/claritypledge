---
title: 'P483: Existing User Invite Path Streamlining'
status: in-progress
type: story
rank: 8.0
workstream: C1
tags: [agreements, auth, ux, existing-users]
prepped_date: '2026-03-06'
delivery_stage: 1-prd-review
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
---

# P483: Existing User Invite Path Streamlining

## Problem Statement

### Current State

The Clarity Partner Agreement invitation flow has a single path for all invited partners — existing users and new users alike. This creates unnecessary friction for existing users in three areas:

1. **Redundant email round-trip.** When an existing user clicks the invite link from their email and is not logged in, the accept page triggers an OTP magic link, redirects to a "check your email" interstitial (`/agreements/confirm-email`), and requires the user to open a second email, click a second link, then return to the accept page. They arrived FROM their email — the round-trip adds no security value and doubles the effort.

2. **Partner name misspelling risk.** On the create page, the inviting party manually types their partner's name. If that partner is an existing user with a profile name on record, the typed name may differ from — or misspell — the name the partner actually uses. Today the lookup auto-fills the name only if the creator hasn't started typing yet (`userTypedNameRef`). If the creator typed first and then entered the email, the lookup result is silently ignored.

3. **Unnecessary name editing for existing users.** On the accept page, the invited partner sees an editable name field pre-filled from `partner_display_name` (whatever the creator typed). For an existing user whose profile already has their correct name, this field adds confusion — it implies their name might be wrong, and any edit they make diverges from their profile.

### Who Is Affected

- **Existing users receiving invitations.** They face a 4-step auth flow (click invite link, click "Seal & Sign", open second email, click magic link) when a 1-step flow is possible.
- **Creators inviting existing users.** They risk submitting a misspelled partner name when the correct name is already in the system.
- **The signed agreement itself.** Name discrepancies between the agreement and the partner's profile undermine the document's credibility.

## Intention

### Why This Matters

The partner agreement is a trust artifact between co-founders. Name accuracy and signing friction directly affect perceived legitimacy. Every unnecessary step between "I want to sign" and "it's signed" is a dropout risk — especially for a product whose core promise is reducing friction in professional communication.

### Why Now

The agreement flow shipped in P422/P466 and has been through multiple polish rounds (P472, P476, P478). The basic flow works. This is the right time to differentiate the existing-user path before the product scales beyond early adopters, where every conversion matters.

### Impact If Not Solved

- Existing users continue to experience a flow designed for strangers — eroding trust in a product about trust.
- Name mismatches on signed agreements go unnoticed until a user sees them and questions the document.
- Conversion drop-off at the "check your email" interstitial is invisible but real — users who already proved identity via the first email click are asked to do it again.

## Business Requirements

### Must-Haves

**BR-1: Profile name is authoritative for existing users.**
When email lookup on the create page finds an existing user, their profile name overrides the partner name field — regardless of whether the creator has already typed something. The creator sees a clear notification that the partner's registered name is being used.

**BR-2: Skip email confirmation interstitial for existing users.**
When an existing user clicks the invite link from email and is not logged in, the system must authenticate them without requiring a second email round-trip. The "check your email" interstitial (`/agreements/confirm-email`) must not appear for existing users.

**BR-3: Direct-to-certificate after signing (existing user).**
After an existing user signs the agreement, they proceed directly to the signed certificate page. No "go back to email" step.

**BR-4: No name editing for existing users on the accept page.**
When the accepting partner is an existing user (authenticated, profile name on record), the name on the certificate comes from their profile. No editable name field is shown.

**BR-5: New user path unchanged.**
The existing flow for new users (OTP, email confirmation interstitial, name editing, auto-accept on return) remains exactly as-is.

### Success Conditions

- An existing user can go from clicking the invite link in email to a signed certificate in a single page load (after auth resolution).
- The partner name on every agreement involving an existing user matches that user's profile name at time of signing.
- No regression in the new-user invitation path.

### Constraints

- Must not introduce new auth providers or change the OTP-based auth model.
- Must not change the agreement data model (no new DB columns for this feature).
- The invite link in email must continue to work for both existing and new users — the differentiation happens at runtime, not at link generation time.

## User Stories

**US-1: Creator invites an existing user — name auto-corrects.**
As a creator, when I type my partner's email and they are an existing user, I want the partner name to update to their profile name automatically — even if I already typed a different name — so the agreement always has the correct name.

**US-2: Creator sees confirmation of auto-corrected name.**
As a creator, when the partner name auto-corrects from a lookup, I want to see a clear notification (e.g., "Partner found — using their registered name") so I understand why the name changed.

**US-3: Existing user clicks invite link — no second email.**
As an existing user who received an agreement invitation email, when I click the invite link and I'm not logged in, I want to be authenticated without opening a second email, so I can sign immediately.

**US-4: Existing user signs — lands on certificate.**
As an existing user, after I sign the agreement, I want to see the signed certificate page directly, not a "check your email" screen.

**US-5: Existing user sees their profile name — no editing.**
As an existing user on the accept page, I want to see my profile name on the certificate without an editable field, so I know the agreement will use my correct name.

**US-6: New user path is unaffected.**
As a new user who does not have an account, I want the current flow (OTP, email confirmation, name editing, auto-accept) to work exactly as before.

## Jobs to Be Done

**JTBD-1:** When I receive an agreement invitation from my co-founder, I want to sign it quickly and confidently, so I can get back to work without worrying about administrative friction.

**JTBD-2:** When I create an agreement for someone I know is already on the platform, I want the system to use their real name, so I don't have to worry about typos undermining a formal document.

## Outcomes

| Metric | Current | Target | How to Measure |
|---|---|---|---|
| Steps to sign (existing user, not logged in) | 4 (click invite, click Seal & Sign, open 2nd email, click magic link) | 1-2 (click invite, sign) | Manual flow walkthrough; count page transitions |
| Name mismatch rate (existing user agreements) | Unknown — no tracking | 0% | Compare `partner_display_name` to partner's `profiles.name` for agreements where partner had an account at creation time |
| Email confirmation page views (existing users) | >0 per existing-user invite | 0 | Track `/agreements/confirm-email` page views segmented by user type |

## Acceptance Criteria

- **AC-1:** On the create page, when email lookup finds an existing user, the partner name field updates to the profile name and the creator sees a notification — regardless of prior typing.
- **AC-2:** On the create page, when email lookup finds an existing user, the partner name field is not editable (profile name is locked in).
- **AC-3:** An existing user clicking the invite link from email who is not logged in is authenticated without visiting the email confirmation interstitial page.
- **AC-4:** After an existing user signs, the app navigates directly to the certificate/agreement detail page.
- **AC-5:** On the accept page, an authenticated existing user does not see an editable name field — their profile name appears as read-only on the certificate.
- **AC-6:** A new user (no account) clicking the invite link sees the current flow unchanged: OTP trigger, email confirmation interstitial, name editing, auto-accept on return.
- **AC-7:** The invite email link format is unchanged — both existing and new users receive the same link structure.

## Open Questions / Uncertainties

1. **Auth mechanism for skipping email confirmation (BR-2).** The exact technical approach (silent OTP with auto-redirect, invite-link-as-magic-link, or session token in the invite URL) is deferred to `/architect`. The business requirement is: no second email for existing users.

2. **What if the existing user's profile name is empty?** Edge case: user exists but never set a name. Should we fall back to the creator-typed name, or require the user to set their name before signing? Recommend: fall back to creator-typed name with the existing editable field (treat as "new-user-like" for name purposes).

3. **Creator override desire.** If a creator specifically wants to use a different name than the partner's profile (e.g., nickname), this feature removes that ability. Acceptable for now — profile name is the source of truth for a formal agreement.

---

**Next steps:** `/ux` (design the streamlined flows) then `/architect` then `/generate-tests` then `/dev` then `/verify`.
