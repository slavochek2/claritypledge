---
title: 'P483: Existing User Invite Path Streamlining'
status: in-progress
type: story
rank: 8.0
workstream: C1
tags: [agreements, auth, ux, existing-users]
prepped_date: '2026-03-06'
delivery_stage: 3-arch-review
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-06
superseded_by: p488
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

**Next steps:** `/architect` then `/generate-tests` then `/dev` then `/verify`.

---

## UX Design

### Lean Friction Check

Before designing, each proposed change was tested against the question: "Does this step add friction before value?"

| Change | Friction removed | Friction added | Verdict |
|---|---|---|---|
| Auto-override partner name on lookup | Creator must re-type if they intentionally wanted a different name | None — profile name is authoritative for formal documents | Ship it |
| Read-only name on accept page (existing user) | Removes editable field that implies name might be wrong | None — profile name is already correct | Ship it |
| Skip email interstitial (existing user, not logged in) | Eliminates a second email round-trip | None — the user already proved email ownership by clicking the invite link | Ship it |
| Direct-to-certificate after signing | Eliminates "check your email" dead-end | None | Ship it |

No step adds friction before value. All four changes pass.

---

### 1. User Flows

#### Flow A: Creator invites an existing user (create page)

1. Creator is logged in, navigates to `/agreements/new`.
2. Creator types (or pastes) partner email in the email field.
3. On debounce (400ms), lookup fires. Spinner appears in the email field.
4. Lookup returns an existing user:
   - "Account found" badge appears (green text + avatar — existing pattern).
   - Partner name field updates to the profile name — even if the creator already typed a different name.
   - Partner name field becomes **read-only** (no cursor, no border-bottom animation, slightly muted background to signal locked state).
   - An inline notification appears below the avatar badge: **"Using their registered name"** (small muted text, `role="status"`).
5. Creator can still edit email to change the partner. If email changes, name field resets to editable + empty (or whatever the creator had typed before the lookup overrode it — but simpler: just clear it).
6. Creator fills terms, selects visibility, clicks "Seal & Send".
7. Flow continues as today.

**If creator clears or changes the email:** The name field reverts to editable, the read-only lock is removed, and any lookup state resets. The creator can type a new name freely.

#### Flow B: Existing user accepts — logged in

1. Existing user clicks invite link from email. They are already logged in.
2. Accept page loads. `pageState` resolves to `'partner'`.
3. The certificate renders with:
   - Creator name (from agreement data).
   - **Partner name from their own profile** — displayed as read-only text in the "We, X and Y, agree to:" line. No input field, no editable affordance.
4. Footer shows: "I Accept & Co-Sign" button + "Decline" link (existing layout, no change).
5. User clicks "I Accept & Co-Sign".
6. `handleAccept` fires. The `partnerDisplayName` sent to the RPC is the user's **profile name** (not the creator-typed name from the agreement record).
7. On success: toast "Agreement Sealed" + navigate to `/agreements/{id}` (the certificate/detail page). This is the existing behavior — no change needed here.

#### Flow C: Existing user accepts — NOT logged in

1. Existing user clicks invite link from email. They are not logged in.
2. Accept page loads. `pageState` resolves to `'unauthenticated'`.
3. **Branching point:** The page must determine whether this email belongs to an existing user before showing the interstitial. Two sub-paths:
   - **C1 (transparent auth):** The accept page detects the partner email is an existing user (via lookup or agreement metadata). Instead of showing the "Seal & Sign" button that triggers OTP + email interstitial, the page triggers OTP silently and navigates directly to a "check your email" state — but with messaging that this is a **sign-in** link, not an account creation. On return from the magic link, the user lands on the accept page authenticated, and Flow B takes over.
   - **C2 (optimized — preferred if architect confirms feasibility):** The invite email link itself includes a magic-link-style token that authenticates the existing user on click. No OTP step at all. The user clicks the link, arrives authenticated, and Flow B takes over immediately.

**Decision needed from architect:** Whether C2 is feasible without changing the invite link format (constraint from spec). If not, C1 is the fallback — it still eliminates the interstitial page but requires one email round-trip (the OTP), which is automatically triggered rather than user-initiated.

**Minimum viable UX (C1 path):**
1. User clicks invite link, arrives unauthenticated.
2. Page recognizes the partner email belongs to an existing user.
3. Page shows the certificate (read-only, partner name from profile) with a single CTA: **"Sign In to Co-Sign"** (instead of "Seal & Sign" which implies account creation).
4. User clicks the button. OTP magic link is sent to their email. Page navigates to the email confirmation interstitial — but with **different copy**: "Sign in to complete signing" instead of "Almost Done! We've sent a sign-in link." The interstitial still shows for existing users **only if C2 is not feasible**.
5. User clicks magic link in email, returns authenticated. Auto-accept fires (existing localStorage mechanism). Certificate page shown.

**Ideal UX (C2 path):**
1. User clicks invite link, arrives authenticated (token in URL handles it).
2. Flow B takes over. One click to sign.

#### Flow D: New user accepts (unchanged)

1. New user clicks invite link. Not logged in.
2. Accept page shows editable name field + "Seal & Sign" button.
3. User types name, clicks "Seal & Sign".
4. OTP sent, navigate to email confirmation interstitial (existing page, existing copy).
5. User clicks magic link, returns authenticated. Auto-accept fires. Certificate page shown.

No changes to this flow.

---

### 2. Screen Designs

#### Create Agreement Page (`/agreements/new`)

**Change 1: Name field auto-override + read-only lock**

When lookup finds an existing user:
- The inline partner name input in the certificate body switches to read-only. Visually:
  - Remove the bottom border animation (the blue focus border).
  - Set `readOnly` attribute on the input.
  - Add a subtle background tint (`bg-[#F5F1E8]/50`) to indicate locked state — consistent with the terms textarea's `bg-[#F5F1E8]` pattern already used in the certificate.
  - Cursor changes to `cursor-default` (not `cursor-not-allowed` — this is informational, not an error).
- The value updates to `party.name` from the lookup result.

**Change 2: Notification text below lookup result**

Below the existing "Account found" + avatar badge, add a single line:
```
Using their registered name
```
- Style: `text-xs text-[#1A1A1A]/50` (muted, subordinate to the "Account found" line).
- ARIA: Part of the existing `role="status"` container — screen readers will announce it with the lookup result.

**Change 3: Reset on email change**

When the email field value changes (user edits or clears it):
- `lookupResult` resets to `null` (existing behavior).
- `partnerName` clears to `''`.
- `userTypedNameRef` resets to `false`.
- Name field reverts to editable.

**Visual hierarchy (unchanged):**
1. Certificate body (partner name inline — now potentially read-only)
2. Email field with lookup feedback
3. Visibility selector
4. Submit button

#### Accept Agreement Page (`/agreements/:id/accept`)

**Change 1: Existing user, logged in (`pageState === 'partner'`)**

- The `onPartnerNameChange` callback is **not passed** to `AgreementCertificate` when the current user has a profile name. This causes the certificate to render the read-only "We, X and Y, agree to:" text path (already exists — it is the `else` branch when `onPartnerNameChange` is undefined).
- The `partnerName` prop receives the current user's profile name (from `currentUser.name`), not `ag.partnerDisplayName`.
- The editable name field in the footer (unauthenticated path) does not appear — it is already gated by `pageState === 'unauthenticated'`.
- Footer CTA: "I Accept & Co-Sign" button (unchanged) + "Decline" (unchanged).

**Change 2: Existing user, NOT logged in (`pageState === 'unauthenticated'`)**

- If the partner email matches an existing user (detectable via agreement metadata or an additional lookup), the footer changes:
  - **Remove** the editable "Your name on this agreement" input field.
  - **Change** the CTA button label from "Seal & Sign" to **"Sign In to Co-Sign"**.
  - The button still triggers OTP, but the messaging acknowledges the user has an account.
  - The "Already have an account? Log in" link below the certificate becomes redundant and is hidden for this state.
- If C2 (magic-link auth via invite URL) is feasible, this entire state is skipped — the user arrives authenticated.

**Change 3: Post-signing navigation**

After `handleAccept` succeeds, `navigate(`/agreements/${agreementId}`)` already happens (line 159 of accept-agreement-page.tsx). This is the certificate detail page. No change needed — the existing navigation is correct for existing users. The email confirmation interstitial is only reached via `handleInlineSignup` (line 260), which is the new-user path.

#### Email Confirmation Page (`/agreements/confirm-email`)

- **No changes for new users.** This page remains as-is.
- **Existing users should never reach this page** (Flows B and C ensure they do not). If C1 is the chosen path, the architect may decide to show this page with adjusted copy — but the UX preference is to avoid it entirely.

#### Certificate/Agreement Detail Page (`/agreements/:id`)

- **No changes.** This is the destination page after signing. It already renders the certificate in `active` variant with the gold seal.

---

### 3. Edge Cases

| Edge Case | Handling |
|---|---|
| **Existing user has empty profile name** | Fall back to creator-typed name. On create page: name field stays editable, no read-only lock, no "Using their registered name" text. On accept page: show editable name field (same as new-user path). Detection: `party.name` is `'Unknown'` or empty string after lookup. |
| **Lookup fails (network error)** | Name field stays editable. No lock applied. Creator can type freely. Existing behavior — no change. |
| **Partner changed their name since invite was created** | The accept page always uses the partner's **current** profile name (fetched at page load), not the `partnerDisplayName` stored on the agreement. The certificate displays the current name. The agreement record's `partner_display_name` is updated via the `accept_agreement` RPC with the current profile name. |
| **Creator types name, then types email of existing user** | Name field overrides to profile name and locks. If creator clears email, name field clears and unlocks. Previous typed value is not preserved — this is intentional (profile name is authoritative). |
| **Race condition: lookup returns while creator is mid-keystroke in name field** | The lookup runs on email change with debounce. Name override happens in the lookup callback. Since React state updates are batched, the override will apply cleanly. The `userTypedNameRef` guard is removed for this case (override always wins), so no race. |
| **Existing user clicks invite link, but another user is logged in** | `pageState` resolves to `'wrong-user'` (existing handling, line 107-114). No change. |
| **Existing user's session expires between page load and signing** | The `handleAccept` call will fail (Supabase returns 401). Existing error toast handles this. No change. |
| **Email interstitial reached by existing user (unexpected)** | If an existing user somehow reaches `/agreements/confirm-email` (e.g., direct URL navigation), the page works as today. No crash. This is a non-goal to optimize — the happy path avoids it. |

---

### 4. Accessibility

**Create page — read-only name field:**
- `readOnly` attribute on the input (not `disabled` — `disabled` removes it from tab order and grays it out, which is too aggressive for an informational lock).
- `aria-readonly="true"` explicitly set (some screen readers do not infer from `readOnly`).
- The input retains its `aria-label="Partner's full name"`.
- "Using their registered name" text is inside the `role="status"` container, so it is announced when the lookup result appears.

**Accept page — read-only partner name (existing user, logged in):**
- The partner name renders as a `<span>` inside the "We, X and Y, agree to:" paragraph (existing read-only path in the certificate component). No ARIA changes needed — it is plain text.
- The "I Accept & Co-Sign" button is the primary focusable element. No tab-trap from a removed input field.

**Accept page — existing user, NOT logged in:**
- The "Sign In to Co-Sign" button has the same styling and ARIA as the current "Seal & Sign" button.
- If the editable name field is removed, keyboard tab order shortens: email display (non-interactive) then CTA button then Decline. Clean sequence.

**Focus management after lookup override (create page):**
- After name auto-fills and locks, focus stays on the email field (where the user just typed). No jarring focus jump.

**Screen reader announcement sequence on lookup:**
1. "Account found" (from `role="status"` container).
2. Avatar badge with name (visually present, `aria-hidden="true"` on the avatar icon — name text is readable).
3. "Using their registered name" (same `role="status"` container — announced together).

---

### 5. Responsive Design

**Create page notification:**
- "Using their registered name" text uses `text-xs` — readable on mobile without wrapping issues.
- The avatar badge is already responsive (flex layout with gap, truncation handled by `min-w-0` parent pattern used elsewhere).

**Read-only name in certificate:**
- The inline input (now read-only) retains its dynamic width calculation (`Math.max(200, partnerNameValue.length * 12)px`). On mobile, `maxWidth: '100%'` already prevents overflow.
- The `bg-[#F5F1E8]/50` tint is subtle enough to work on both light and parchment backgrounds.

**Accept page — existing user, NOT logged in:**
- Removing the name input field reduces vertical scroll on mobile — a net improvement.
- The "Sign In to Co-Sign" button uses the same full-width `w-full` layout as "Seal & Sign".

**Accept page — existing user, logged in:**
- No name input field means the footer is shorter. The "I Accept & Co-Sign" button + "Decline" link already use responsive flex layout (`flex-col sm:flex-row`). No change needed.

**Touch targets:**
- All buttons already meet 44px minimum height (enforced by `min-h-[44px]` or `py-4 md:py-6` sizing). No new interactive elements are introduced.

---

### 6. Component Analysis

| Element | Classification | File | Notes |
|---|---|---|---|
| `AgreementCertificate` | **Extend** | `src/app/components/agreements/agreement-certificate.tsx` | Add `partnerNameReadOnly?: boolean` prop. When true + `onPartnerNameChange` provided, render the input with `readOnly`, `aria-readonly="true"`, and locked styling. Alternatively, the parent can simply not pass `onPartnerNameChange` to get the existing read-only text path. |
| Partner name inline input (in certificate) | **Extend** | `src/app/components/agreements/agreement-certificate.tsx` (lines 165-186) | Add conditional `readOnly` attribute and locked-state CSS class. |
| `AvatarBadge` (create page) | **Reuse** | `src/app/pages/create-agreement-page.tsx` (lines 40-63) | No changes. Already displays lookup result with avatar + name. |
| "Account found" status block | **Extend** | `src/app/pages/create-agreement-page.tsx` (lines 321-326) | Append "Using their registered name" text line inside the existing `role="status"` container. |
| `CertificatePageShell` | **Reuse** | `src/app/components/layout/certificate-page-shell.tsx` | No changes. |
| `Button` (shadcn) | **Reuse** | `src/components/ui/button.tsx` | No changes. CTA labels change via props only. |
| `Input` (shadcn) | **Reuse** | `src/components/ui/input.tsx` | No changes. The partner name input in the certificate is a raw `<input>`, not the `Input` component. |
| `Dialog` (decline confirm) | **Reuse** | `src/components/ui/dialog.tsx` | No changes. |
| Email confirmation page | **Reuse** | `src/app/pages/agreement-email-confirmation-page.tsx` | No changes. Existing users should not reach this page. If C1 path needs adjusted copy, this would be an Extend. |
| `AcceptAgreementPage` | **Extend** | `src/app/pages/accept-agreement-page.tsx` | Major logic changes: (1) detect existing user, (2) use profile name instead of `partnerDisplayName`, (3) conditionally hide name input, (4) change CTA label for unauthenticated existing users. |
| `CreateAgreementPage` | **Extend** | `src/app/pages/create-agreement-page.tsx` | Changes: (1) override name on lookup regardless of `userTypedNameRef`, (2) set read-only state on name field, (3) add notification text, (4) reset on email change. |
| `AgreementPage` (detail/certificate) | **Reuse** | `src/app/pages/agreement-page.tsx` | No changes. This is already the post-signing destination. |
| `toast` (sonner) | **Reuse** | Used across codebase | Existing `toast.success()` pattern for signing confirmation. No change. |
| `sign-pledge-form.tsx` `readOnly` pattern | **Reference** | `src/app/components/pledge/sign-pledge-form.tsx` (line 171) | Existing precedent for `readOnly={condition}` on name inputs. Follow same approach. |

**New components: None.** All changes are extensions of existing components or prop/logic changes in existing pages.

---

### 7. Decisions Needing Founder Input

**Decision 1: Auth mechanism for unauthenticated existing users (C1 vs C2)**
- C2 (invite link doubles as magic link) is the ideal UX — zero extra steps. But it may conflict with the constraint "invite link format unchanged."
- C1 (silent OTP trigger + interstitial with adjusted copy) is the safe fallback.
- **Recommendation:** Defer to `/architect` to assess C2 feasibility. If feasible without changing the link format, use C2. If not, use C1.

**Decision 2: What counts as "empty profile name"?**
- The lookup returns `'Unknown'` when `profiles.name` is null (see `mapDbRowToAgreementParty`, line 52 of agreements-service-real.ts).
- **Recommendation:** Treat both `'Unknown'` and `''` as "no profile name" — fall back to creator-typed name and editable field. No founder input needed unless there is a preference to force existing users to set their name before signing.
