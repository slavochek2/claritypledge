---
status: week
type: change-request
rank: 1000004.0
changes: p422
tags:
  - redesign
  - p422
  - agreements
  - partners
created_date: 2026-03-01
delivery_stage: 2-ux-review
---

# P466: Agreement Creation — HelloSign Redesign

> **Redesign of:** [P422: Clarity Partner Agreement](../done/21_feb_26/p422_clarity_partner_agreement.md)
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
│  Slava Ladischenski   [ Partner full name     ]          │
│  [today's date]       will sign upon acceptance          │
│                                                          │
└──────────────────────────────────────────────────────────┘

  Partner's email *                    Visibility
  [_________________________]          [Private]  [Public]

  [Seal & Send Invitation ✦]
```

Key design decisions:
- **Certificate IS the form.** The outer double-border certificate frame is present from page load.
- **Partner name is an inline editable field** in the PARTNER signature slot — visually integrated into the certificate, not a separate form field above.
- **Partner email and visibility are below the certificate** — operational details, not part of the document itself. The certificate is the commitment; the email is delivery logistics.
- **Terms remain inline** in the certificate body, editable (as they are today).
- **Creator's name and date** auto-populate from profile + today (same as current).
- **Partner name placeholder** when empty: "Partner's name" (greyed, matches existing placeholder styling). Updates live as the user types.
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
2. The PARTNER signature slot contains an editable text input (styled as certificate text, not a form input).
3. Partner name (entered in the certificate slot or the field) is stored as `partner_display_name` (nullable text) on `clarity_agreements`.
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
- [ ] PARTNER signature slot contains an editable text input within the certificate
- [ ] Creator can type a partner name; the certificate updates in real time
- [ ] Partner name is required before submission (inline validation in the slot or below it)
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

## Next Steps

- Has net-new layout pattern (certificate-as-form, inline editable slot) → run `/ux features/p466_agreement_creation_hellosign_redesign.md` first
- After UX → `/architect` (DB migration + new component pattern)
- After architect → `/generate-tests`
- After tests → `/dev`
- After dev → `/verify` (net-new visual surface)
