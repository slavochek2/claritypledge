---
status: done
type: change-request
rank: 500001
changes: p422
tags:
  - redesign
  - p422
  - agreements
  - partners
created_date: 2026-03-01T00:00:00.000Z
completed_at: "2026-03-04"
superseded_by: p476
uat_file: features/done/22_mar_26/uat/p466.md
test_files:
  - e2e/integration/p466-partner-display-name-migration.spec.ts
  - e2e/p466-agreement-creation.spec.ts
  - e2e/a11y/p466-accessibility.spec.ts
  - src/tests/p466-partner-display-name.test.ts
locked_at: '2026-03-02T08:37:06.225Z'
---

# P466: Agreement Creation — HelloSign Redesign

> **Redesign of:** [P422: Clarity Partner Agreement](../21_feb_26/p422_clarity_partner_agreement.md)
> **What was wrong:** The P422 create-agreement form treats the certificate as an output — a separate page rendered after the form is submitted. The creation step is a standard HTML form (email field, terms textarea, visibility toggle) with no visual connection to the certificate the user is actually creating. This creates a gap: the user fills in fields but doesn't see or feel the document taking shape, and cannot specify partner name (only email), so the certificate's PARTNER signature slot reads "Invited party" until the partner accepts. The form and the document are two separate experiences when they should be one.

## Problem Statement

P422 built a two-step experience: (1) fill a form, (2) see the resulting certificate. The form is purely functional — email, terms, visibility — and the certificate is shown only after submission. This design was correct for shipping the feature quickly, but it misses the insight that makes DocuSign and HelloSign compelling: **the document IS the form**. Filling in the fields and watching the certificate take shape in real time is itself meaningful — it communicates commitment, ceremony, and weight that a generic form cannot.

Additionally, because the form only collected partner email (not name), the certificate's PARTNER signature slot was forced to show "Invited party" during the pending state — a degraded experience for the creator reviewing the certificate they just created.

## Jobs To Be Done

- **Preserved from P422:** User wants to create a bilateral commitment with a specific partner; user wants to configure terms and visibility; user wants the agreement to activate only after both parties have signed.
- **Corrected:** User wants the creation process to feel like signing a real document, not filling a web form. User wants to see their partner's name on the certificate they're creating, even before the partner has joined.
- **New:** User sees the agreement document taking shape as they fill in details — the certificate frame is the creation interface.

## Current State

P422 built a standard form at `/agreements/new`:

```
New Clarity Partner Agreement
Invite someone to practice calibrated communication with you.

Partner email *
[________________________]
  ↳ account lookup result

Visibility
[Private]  [Public]

Our terms:
[________________________]  (8-row textarea)

[Create & Send Invitation ✦]
```

After submission, the user lands on the pending agreement page, which shows the certificate with PARTNER slot reading "Invited party" (partner name was never collected).

**Before (current) — creation form:**
```
┌────────────────────────────────────────────────────────┐
│  New Clarity Partner Agreement                         │
│  Invite someone to practice calibrated communication.  │
│                                                        │
│  Partner email *  [_________________________________]  │
│    ↳ "No account found – invited to create one"        │
│                                                        │
│  Visibility   [Private]  [Public]                      │
│                                                        │
│  Our terms:                                            │
│  [_________________________________________________]   │
│  [_________________________________________________]   │
│  [_________________________________________________]   │
│                                                        │
│  [Create & Send Invitation ✦]                          │
└────────────────────────────────────────────────────────┘
```

**Before (current) — pending certificate:**
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  Clarity Partner Agreement                              │
│  A MUTUAL COMMITMENT TO CLARITY                        │
│                                                        │
│  We all crave being understood...                      │
│  [full pledge text]                                    │
│  [editable terms]                                      │
│                                                        │
│  ──────────────────  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─          │
│  Slava Ladischenski      Invited party                 │
│  [date]                  [awaiting signature]          │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

## Root Cause

The original P422 design started from a database form pattern (collect required fields, submit, display result) rather than from the user's mental model of signing a document. The certificate component was built as a read-only display — the creation form feeds it, but there is no visual continuity between the two steps.

The partner name gap is a direct consequence: the form collected only the email (the minimal field needed to identify and invite the partner), not a display name. The certificate was designed to fall back to "Invited party" because the partner's profile name wouldn't be available until they accepted.

Code reference: `src/app/pages/create-agreement-page.tsx` (form), `src/app/components/agreements/agreement-certificate.tsx` (certificate, read-only).

## Redesign

The create-agreement page becomes the document itself. The certificate frame is shown from the moment the user arrives. Editable fields are inline within the certificate layout. As the user types, the certificate updates in real time.

**Layout — creation mode certificate:**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│           Clarity Partner Agreement                      │
│         A MUTUAL COMMITMENT TO CLARITY                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │                                                  │    │
│  │  We, Slava Ladischenski and [______________],    │    │
│  │  agree to:                                       │    │
│  │                                                  │    │
│  │  We all crave being understood...                │    │
│  │  [full pledge text — static]                     │    │
│  │                                                  │    │
│  │  Our terms:                                      │    │
│  │  ┌───────────────────────────────────────────┐   │    │
│  │  │ [editable terms textarea — styled to      │   │    │
│  │  │  match certificate font, no box border]   │   │    │
│  │  └───────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────┘    │
│                                                          │
│  ────────────────     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│  Slava Ladischenski   [partner name — mirrors above]     │
│  [today's date]       will sign upon acceptance          │
│                                                          │
└──────────────────────────────────────────────────────────┘

  Partner's email *                    Visibility
  [_________________________]          [Private]  [Public]

  [Seal & Send Invitation ✦]
```

Key design decisions:
- **Certificate IS the form.** The outer double-border certificate frame is present from page load.
- **"We, [creator] and [partner], agree to:"** is the first line of the certificate body — inline sentence where the partner name blank is the primary editable input. Creator name is read-only (from profile). This is where the user types the partner name.
- **Signature slot partner name mirrors the inline input** — same state, not a second input. The slot shows what was typed above; it is not independently editable. This avoids two competing entry points for the same value.
- **Partner email and visibility are below the certificate** — operational details, not part of the document itself. The certificate is the commitment; the email is delivery logistics.
- **Terms remain inline** in the certificate body, editable (as they are today).
- **Creator's name and date** auto-populate from profile + today (same as current).
- **Partner name placeholder** when empty: "their name" (greyed, inline with the sentence). Updates live as the user types.
- **On email lookup match**: email lookup still runs; AvatarBadge shows below email field as today. Name field can be pre-filled from `lookupResult.name` if user hasn't typed yet (founder decision — see FD-1 below).

**Pending state (after submit) — unchanged from P463:**
```
[certificate — same layout, partner slot shows name entered at creation]
(nothing below — amber block removed in P463)
```

**Acceptance page — partner view:**
The partner sees the same certificate layout. Their name field is pre-filled with what the creator entered (from `partner_display_name` DB column). They can edit it before signing. On accept, their profile name becomes authoritative (if they have an account); the `partner_display_name` is kept as a display fallback for non-registered partners.

## Predecessor Sections Superseded

| Section | P422 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| AC: Agreement Creation — first bullet | "Authenticated user can create an agreement by specifying: partner (user reference) and agreement terms via a flexible template text field" | Extended | P466 adds partner display name to required creation inputs; email-only identification preserved but a name field is added |
| UX Design §1.1 Creation Flow | "Fill: partner email (+ live user lookup), Fill: terms textarea, Set: visibility toggle" | Superseded | Certificate-as-form layout; name field added; email and visibility move below certificate |
| UX Design §2.1 Create Agreement Page | Full form layout with email → terms → visibility stacked vertically | Superseded | See Redesign section above |
| Decision Log #16: Post-signing /live CTA | "Non-blocking text link on pending page" | Superseded by P463 | P463 removes this link from pending view |
| UX Design: Certificate subtitle | "A BILATERAL COMMITMENT TO CLARITY" | Superseded by P463 | P463 changes to "A MUTUAL COMMITMENT TO CLARITY" |
| UX Design: A-XXXX display ID | Shown in certificate header | Superseded by P463 | P463 removes display ID from certificate |

## Requirements

1. `create-agreement-page.tsx` renders the certificate frame as the primary UI; standard form fields (email, visibility) appear below it.
2. The certificate body opens with "We, [creator name] and [partner name blank], agree to:" — the partner name blank is an inline editable input, the primary and only entry point for the partner name.
3. The PARTNER signature slot at the bottom mirrors the partner name typed in the inline sentence — it is read-only in creation mode (not a second input).
4. Partner name is stored as `partner_display_name` (nullable text) on `clarity_agreements`.
4. DB migration: `ALTER TABLE clarity_agreements ADD COLUMN partner_display_name text` (nullable, no default).
5. `partner_display_name` is pre-filled on the acceptance page (partner can edit before signing).
6. After partner accepts with a ClarityPledge account, `partner.name` from their profile is the display name; `partner_display_name` is kept as a DB record but the profile name takes precedence in rendering.
7. The certificate's PARTNER slot fallback chain: `partner.name` (profile) → `partner_display_name` (DB) → `"Invited party"` (legacy/null).
8. Email lookup, visibility toggle, terms textarea: all preserve existing behavior.
9. Submit button remains below the certificate, labeled "Seal & Send Invitation ✦".

## What Stays the Same

- Agreement data model: `clarity_agreements` table structure except the new `partner_display_name` column.
- Invitation token system, email delivery, and acceptance flow mechanics.
- Visibility model (Private / Public).
- Terms textarea content (template text, max 1000 chars, editable).
- AvatarBadge and email lookup debounce behavior.
- Acceptance page mechanics (partner signs, agreement activates).
- All certificate states: pending, active, celebration, muted (declined/terminated).
- RLS policies, notifications, and all P429/P430 future extension points.

## Surfaces in Scope

**In scope:**
- `src/app/pages/create-agreement-page.tsx` — layout restructure
- `src/app/components/agreements/agreement-certificate.tsx` — add `creation` variant with inline editable name slot
- `supabase/migrations/` — add `partner_display_name` column
- `src/app/pages/accept-agreement-page.tsx` — pre-fill partner name from `partner_display_name`
- Edge function `send-agreement-emails` — pass `partner_display_name` in invitation email payload (for display in email body if desired)

**Out of scope:**
- Session request filing (P429), observer role (P430), compliance tracking.
- Profile connections page CTA changes (P463).
- Certificate subtitle and display ID changes (P463).
- Amber block removal (P463).

## Acceptance Criteria

- [ ] Create-agreement page renders the certificate frame as the primary layout; email and visibility are below the certificate
- [ ] Certificate body opens with "We, [creator name] and [partner name input], agree to:" as the first line
- [ ] Creator types partner name inline in that sentence; the certificate updates in real time (signature slot mirrors it)
- [ ] Signature slot partner name is read-only in creation mode — mirrors the inline input, not independently editable
- [ ] Partner name is required before submission (inline validation in the sentence line)
- [ ] Submitted `partner_display_name` is stored on `clarity_agreements`
- [ ] Pending view PARTNER slot shows the stored name (not "Invited party") when `partner_display_name` is set
- [ ] Acceptance page PARTNER slot is pre-filled with `partner_display_name` and editable
- [ ] After acceptance by a registered user, their profile name takes precedence over `partner_display_name` in rendering
- [ ] Fallback chain: `partner.name` → `partner_display_name` → `"Invited party"` — verified via test
- [ ] All existing agreement states (active, declined, terminated, expired) are visually unchanged
- [ ] All existing P422 acceptance criteria not listed in "Superseded" table above still pass

## Founder Decisions

**FD-1: Auto-populate partner name slot from email lookup?**
When the creator enters an email and a ClarityPledge account is found, `lookupResult.name` is available. Should the inline name slot auto-fill?
- Recommendation: yes, auto-fill — the slot is inside the certificate, so seeing the real name appear as a document element is powerful UX (the document "knows" the person). If the creator wants a different display name, they can overwrite it. The slot remains editable at all times.

**FD-2: Partner name — required or optional?**
- Recommendation: required. The whole point of this redesign is that the certificate shows who the agreement is with from the moment of creation. "Invited party" defeats the purpose.

**FD-3: Partner name slot styling inside the certificate?**
- Use a borderless `<input>` with Playfair Display (or the certificate's signature font), centered or left-aligned to match the creator's name. On focus: subtle underline or `ring-0 border-b border-current` so the input is identifiable without looking like a standard form element. On blur: no indicator — reads as document text.

## Technical Architecture

### Decisions

**Decision A: `partner_display_name` column — nullable TEXT with length constraint**

```sql
ALTER TABLE clarity_agreements
  ADD COLUMN partner_display_name TEXT
  CHECK (char_length(partner_display_name) <= 100);
```

- Nullable: existing agreements have no partner name; null means "not set." No migration of existing rows needed.
- 100-char CHECK (not VARCHAR): consistent with existing `terms_text` pattern.
- No default.

**Decision B: Extend `accept_agreement` RPC with optional `p_partner_display_name`**

Add `p_partner_display_name TEXT DEFAULT NULL` as 4th parameter.

Write behavior:
```sql
IF p_partner_display_name IS NOT NULL THEN
  UPDATE clarity_agreements
  SET partner_display_name = p_partner_display_name
  WHERE id = p_agreement_id;
END IF;
```

This preserves the creator-set name when the partner accepts without editing. Null (parameter omitted or slot left blank) is **not** written to the column — the creator's value survives intact.

**Grant required for the new overload (BLOCK-1 fix):**
```sql
GRANT EXECUTE ON FUNCTION accept_agreement(UUID, TEXT, UUID, TEXT) TO authenticated;
```

The existing 3-param overload already has this grant. The new 4-param signature is a separate PostgreSQL function and requires its own explicit grant.

Backward compat: existing callers without the 4th param continue to work (DEFAULT NULL, no-op branch).

**Decision C: Inline name input in certificate body — new element, not SignatureSlot**

The "We, [creator] and [partner], agree to:" sentence is a new inline element in the certificate body — separate from `SignatureSlot`. The partner name blank is a borderless `<input>` styled to read as document text inline with the surrounding sentence.

**Visual reference:** `src/app/components/pledge/sign-pledge-form.tsx` — the take-pledge flow uses the exact same pattern: inline editable name input inside the certificate frame, bottom-border only, transparent background, serif font. The create-agreement form must feel visually identical to that flow. Copy the input class pattern directly:
```
border-0 border-b-2 border-[#1A1A1A] rounded-none bg-transparent
focus-visible:ring-0 focus-visible:border-[#0044CC] font-serif
inline-block w-auto min-w-[120px]
```
On focus: border becomes `#0044CC`. On blur: reads as document text. Placeholder: `"their name"` greyed.

`SignatureSlot` gains `value?: string` prop for display purposes in creation mode — when provided, it renders that value read-only (same text styling, no editable input). Existing callers unchanged.

**Decision D: `AgreementCertificate` gains optional creation-mode props**

```typescript
onPartnerNameChange?: (name: string) => void
partnerNameValue?: string
partnerNameError?: string
partnerNamePlaceholder?: string
onTermsChange?: (text: string) => void
termsError?: string
```

When `onPartnerNameChange` is provided, the PARTNER `SignatureSlot` renders with `editable=true`. Existing callers pass no new props — no behavior change.

**Decision E: `create-agreement-page.tsx` restructure**

- Certificate renders first, fills page width.
- Email field and visibility toggle move below the certificate.
- Submit button stays below certificate, label: "Seal & Send Invitation ✦" (Req 9).
- Partner name state: `partnerName: string`, `partnerNameError: string`.
- Email lookup auto-fills `partnerName` if user hasn't typed anything yet (FD-1: auto-fill).
- Submit validation: `partnerName.trim().length === 0` → set `partnerNameError = 'Partner name is required'`.

**Decision F: PARTNER slot fallback chain — state-dependent terminal (BLOCK-3 fix)**

Priority: `partner?.name` (profile) → `partnerDisplayName` (DB) → **state-dependent terminal**

- **Pending + no name:** `'Invited party'` — preserves the legacy label for agreements created before P466 shipped.
- **All other states + no name:** `'Partner'` — clean fallback for active/muted states where "Invited party" reads oddly.

Implementation:
```typescript
partner?.name ?? partnerDisplayName ?? (isPending ? 'Invited party' : 'Partner')
```

This reconciles Req 7 ("Invited party" legacy terminal) with the general "Partner" fallback by making the terminal state-dependent. Requirement 7 in the Requirements section is amended to read: `partner.name` (profile) → `partner_display_name` (DB) → `"Invited party"` when pending, `"Partner"` otherwise.

### Security Review

No new RLS policies needed. Existing `clarity_agreements` RLS covers:
- INSERT: `auth.uid() = creator_profile_id`
- SELECT: `auth.uid() IN (creator_profile_id, partner_profile_id) OR visibility = 'public'`
- UPDATE: restricted — all status changes go through RPCs

`accept_agreement` RPC: existing `SECURITY DEFINER` + `GRANT TO authenticated` pattern extended to the new 4-param overload.

`partner_display_name` is visible to anyone who can SELECT the agreement — same as all other columns; it contains only a display name chosen by the creator, no sensitive data.

### Files to Change

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDDHHMMSS_add_partner_display_name.sql` | ADD COLUMN + CHECK constraint |
| `supabase/migrations/YYYYMMDDHHMMSS_extend_accept_agreement_rpc.sql` | New RPC overload + GRANT EXECUTE |
| `src/app/data/agreements-service.interface.ts` | Add `partnerDisplayName?: string` to `CreateAgreementInput` and `AcceptAgreementInput` |
| `src/app/data/agreements-service-real.ts` | Pass `partner_display_name` in `createAgreement`; extend `acceptAgreement` call |
| `src/app/components/agreements/agreement-certificate.tsx` | Extend `SignatureSlot` + `AgreementCertificate` props (Decisions C, D) |
| `src/app/pages/create-agreement-page.tsx` | Restructure layout + partner name state (Decision E) |
| `src/app/pages/accept-agreement-page.tsx` | Pre-fill partner name slot; pass name through on acceptance |
| `src/app/pages/agreement-page.tsx` | Pass `partnerDisplayName` to certificate; apply fallback chain (Decision F) |

### Build Sequence

1. Migration 1 — ADD COLUMN `partner_display_name`
2. Migration 2 — Extend `accept_agreement` RPC + GRANT EXECUTE
3. Service interface — add `partnerDisplayName` to `CreateAgreementInput` and `AcceptAgreementInput`
4. Service real — pass `partner_display_name` in `createAgreement` and `acceptAgreement`
5. `agreement-certificate.tsx` — extend `SignatureSlot` + `AgreementCertificate` props
6. `create-agreement-page.tsx` — restructure layout + partner name state
7. `accept-agreement-page.tsx` — pre-fill partner name slot
8. `agreement-page.tsx` — pass `partnerDisplayName` + apply fallback chain

## Test Coverage Strategy

**What's tested:**

- ✅ Column exists + is nullable + stores name + rejects >100 chars (integration, P270 rule)
- ✅ `accept_agreement` RPC accepts new param; writes when provided; preserves when null; backward compat (integration)
- ✅ RLS: creator can read `partner_display_name`; creator can INSERT with name (integration)
- ✅ Create page: partner name input visible; real-time update; auto-fill from lookup; validation; submit stores name (E2E)
- ✅ Pending page: shows stored name, not "Invited party" (E2E + smoke)
- ✅ Accept page: pre-filled name editable; name written on acceptance (E2E + smoke)
- ✅ After acceptance by registered user: profile name takes precedence (smoke)
- ✅ Fallback chain: `partner.name` → `partner_display_name` → `'Invited party'`/`'Partner'` (unit)
- ✅ Accessibility: partner name input keyboard accessible, aria-label correct (a11y)
- ✅ Smoke: create/accept/agreement pages load without JS errors (smoke)

**What's NOT tested:**

- ❌ `send-agreement-emails` edge function payload — out of scope for this PR (no new secrets required; email body change is cosmetic)
- ❌ Active/muted state visual regression — covered by existing P422 E2E suite

**Test pyramid:**

```
         /\
        /  \   17 E2E
       /____\
      / 9 INT \
     /__________\
    /  32 UNIT   \
```

Total: 58 automated tests + UAT scenarios

**Files generated:**

- `e2e/integration/p466-partner-display-name-migration.spec.ts` (9 tests)
- `e2e/p466-agreement-creation.spec.ts` (17 tests)
- `e2e/p466-smoke.spec.ts` (9 tests)
- `e2e/a11y/p466-accessibility.spec.ts` (21 tests)
- `src/tests/p466-partner-display-name.test.ts` (32 tests)
- `features/uat/p466.md`

## Next Steps

- After architect → `/generate-tests` ✅
- After tests → `/spec-review` ✅
- After spec-review → `/dev`
- After dev → `/verify` (net-new visual surface)
