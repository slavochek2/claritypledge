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

> All decisions resolved 2026-03-01.

**FD-A: SignatureSlot — extend in-place with `editable` prop.** ✅ Decided.

**FD-B: `<input type="text">` (styled borderless) for the name slot.** ✅ Decided. No `contenteditable`.

**FD-C: Pass `onPartnerNameChange`/`onTermsChange` callbacks into `AgreementCertificate`.** ✅ Decided. No CSS overlay hacks.

**FD-1: Auto-populate partner name slot from email lookup?** ✅ Yes — auto-fill when slot is empty; editable at all times.

**FD-2: Partner name — required or optional?** ✅ Required. Empty slot blocks submit.

**FD-3: Partner name slot styling inside the certificate?**
- Use a borderless `<input>` with Playfair Display (or the certificate's signature font), centered or left-aligned to match the creator's name. On focus: subtle underline or `ring-0 border-b border-current` so the input is identifiable without looking like a standard form element. On blur: no indicator — reads as document text.

## Next Steps

- Has net-new layout pattern (certificate-as-form, inline editable slot) → run `/ux features/p466_agreement_creation_hellosign_redesign.md` first
- After UX → `/architect` (DB migration + new component pattern)
- After architect → `/generate-tests`
- After tests → `/dev`
- After dev → `/verify` (net-new visual surface)

---

## UX Design

### 1. User Flow

#### 1.1 Creation Flow — Happy Path

**Entry point:** User navigates to `/agreements/new`. They arrive authenticated (auth redirect is already in place). Creator name must exist in their profile; if not, an error banner blocks creation (preserved from P422).

```
[/profile-connections or nav CTA]
         │
         ▼
[/agreements/new — page loads]
         │
         ├─ Certificate frame renders immediately (full document frame, no data yet)
         ├─ Creator name + today's date auto-populated in creator slot
         ├─ Terms textarea pre-filled with default template text
         └─ Partner name slot shows placeholder: "Partner's name"
         │
         ▼
[User clicks into PARTNER NAME SLOT inside certificate]
         │
         ├─ Slot enters focus state: subtle bottom border appears
         ├─ Cursor positioned inside slot
         └─ Placeholder text disappears
         │
         ▼
[User types partner name]
         │
         ├─ Certificate updates live: typed name appears in certificate font
         └─ No validation fires while typing (only on blur or submit)
         │
         ▼
[User tabs to TERMS TEXTAREA (Tab key)]
         │
         ├─ Partner name slot loses focus: returns to document-text appearance
         ├─ Terms textarea receives focus (standard styled textarea)
         └─ User edits terms if desired
         │
         ▼
[User tabs to PARTNER EMAIL field (below certificate)]
         │
         ├─ User types partner email
         ├─ After 400ms debounce: email lookup fires
         │     ├─ FOUND: AvatarBadge renders below email field
         │     │         IF partner name slot is still empty: auto-fills with lookupResult.name
         │     │         IF partner name slot already has text: name is NOT overwritten
         │     └─ NOT FOUND: "No account found — they'll be invited to create one"
         │
         ▼
[User selects VISIBILITY toggle (Private / Public)]
         │
         └─ Toggle selection updates state; no other changes
         │
         ▼
[User clicks "Seal & Send Invitation ✦"]
         │
         ├─ Validation runs:
         │     ├─ Partner name empty → inline error in slot + focus returned to slot
         │     ├─ Partner email empty or invalid → error below email field
         │     └─ Terms empty → error in terms section
         │
         ├─ All valid: submit state begins
         │     ├─ Button shows spinner + "Sending..."
         │     ├─ Certificate and fields become non-interactive (pointer-events: none)
         │     └─ Duplicate check runs server-side
         │
         ├─ Success → navigate to /agreements/:id (pending view)
         └─ Error → submit error message below certificate; form re-enabled
```

#### 1.2 Acceptance Flow — Partner View

**Entry point:** Partner receives invitation email and clicks the link → `/agreements/:id/accept?token=[token]`.

```
[Partner opens invitation link]
         │
         ▼
[Page loads — loading state: spinner centered]
         │
         ▼
[Agreement resolved from token]
         │
         ├─ INVALID token → "This invitation has expired or is invalid" (existing behavior)
         └─ VALID token → certificate renders
         │
         ▼
[Certificate renders — PARTNER slot pre-filled with partner_display_name]
         │
         ├─ Partner name slot: editable, pre-filled with creator's entered name
         ├─ Partner can edit/correct their name before signing
         └─ Creator slot: read-only (creator name, date)
         │
         ▼
[UNAUTHENTICATED partner]
         │
         ├─ Partner can edit name in the slot
         └─ CTA panel below certificate: "Create Account & Sign" / "Log In & Sign" / "Decline"
                  │
                  └─ After auth completes → redirect back → authenticated partner flow
         │
[AUTHENTICATED partner]
         │
         ├─ "Signing as: [Name]" confirmation shown
         ├─ Partner can still edit the name slot if desired
         └─ "I Accept & Co-Sign ✦" button
                  │
                  ▼
         [Accept fires → celebration dialog]
                  │
                  └─ "View Agreement" → /agreements/:id (active view)
```

#### 1.3 Decision Points and Branches

| Condition | Branch |
|-----------|--------|
| Creator has no profile name | Error banner blocks form; link to Settings |
| Email lookup finds account | AvatarBadge shown; name auto-fills slot if slot is empty |
| Email lookup finds no account | "will be invited to create one" message |
| User enters their own email | Inline error "You can't invite yourself" |
| Active/pending agreement already exists with this email | Error after submit attempt |
| Partner name empty on submit | Inline error in slot; focus returns to slot |
| API call fails on submit | Submit error below certificate; form re-enabled |
| Token invalid/expired | Full-page error state |
| Authenticated wrong user opens accept link | "Not addressed to you" state |

---

### 2. Screen Designs

#### 2.1 Create Agreement Page — Certificate as Form

The page header ("New Clarity Partner Agreement" + subtitle) is preserved. The certificate frame renders as the primary element, filling most of the visible viewport on load.

**Layout — desktop (1024px+):**

```
┌─ page chrome ─────────────────────────────────────────────┐
│  ← Back                                                    │
│                                                            │
│  New Clarity Partner Agreement                             │
│  Invite someone to practice calibrated communication.      │
│                                                            │
│  ╔══════════════════════════════════════════════════════╗  │
│  ║                                                      ║  │
│  ║        Clarity Partner Agreement                     ║  │
│  ║      A MUTUAL COMMITMENT TO CLARITY                  ║  │
│  ║  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   ║  │
│  ║                                                      ║  │
│  ║  We all crave being understood…                      ║  │
│  ║                                                      ║  │
│  ║  YOUR RIGHT                                          ║  │
│  ║  When we speak…                                      ║  │
│  ║                                                      ║  │
│  ║  OUR PROMISE                                         ║  │
│  ║  We will explain back…                               ║  │
│  ║                                                      ║  │
│  ║  THE EXCEPTION                                       ║  │
│  ║  If either of us can't…                              ║  │
│  ║                                                      ║  │
│  ║  OUR TERMS:                                          ║  │
│  ║  ┌──────────────────────────────────────────────┐   ║  │
│  ║  │ [editable terms — certificate font, no box]  │   ║  │
│  ║  │ Scope: Professional partnership…             │   ║  │
│  ║  └──────────────────────────────────────────────┘   ║  │
│  ║                                                      ║  │
│  ║  ══════════════════════════════════════════════════  ║  │
│  ║                                                      ║  │
│  ║  CREATOR               [seal]      PARTNER           ║  │
│  ║  Slava Ladischenski    ○ ○ ○       _______________   ║  │
│  ║  March 1, 2026         (pending)   Partner's name    ║  │
│  ║                                   will sign upon     ║  │
│  ║                                   acceptance         ║  │
│  ║                                                      ║  │
│  ╚══════════════════════════════════════════════════════╝  │
│                                                            │
│  Partner's email *              Visibility                 │
│  [________________________]     [Private]  [Public]        │
│    ↳ lookup result / badge                                 │
│                                                            │
│  [Seal & Send Invitation ✦]                                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Visual hierarchy:**
1. Certificate frame (dominant — full document weight, double border)
2. Partner name slot (highest-interactivity element inside certificate)
3. Terms textarea (secondary interaction, inside certificate)
4. Email + visibility controls (below certificate, operational)
5. Submit button (below controls)

#### 2.2 Partner Name Slot — All States

The slot lives in the PARTNER signature area of the certificate, replacing the static `SignatureSlot` `<p>` element for the partner position in creation mode.

**State: Empty / Placeholder (default on page load)**
```
  ──────────────────     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Slava Ladischenski     Partner's name
  March 1, 2026          will sign upon acceptance
```
- "Partner's name" is placeholder text, muted (same color as existing `text-[#1A1A1A]/50` tone)
- Font: Playfair Display, same weight as the creator name
- No border visible. No underline. No box.
- The slot is visually indistinguishable from the static creator name except for the placeholder color

**State: Focused (user clicked or tabbed into slot)**
```
  ──────────────────     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Slava Ladischenski     |Partner's name
  March 1, 2026          will sign upon acceptance
```
- A single bottom border appears: `border-b border-[#002B5C]/40` (1px, navy, 40% opacity)
- Cursor blinks in the slot
- No box shadow, no background color change — stays inside the document aesthetic
- Focus ring (for keyboard nav) uses a thin `outline: 2px solid #002B5C` offset 2px — not the standard browser outline
- Placeholder text remains until user begins typing

**State: Typing / Partially filled**
```
  ──────────────────     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Slava Ladischenski     Alex|
  March 1, 2026          will sign upon acceptance
```
- Typed text appears in Playfair Display, full `text-[#1A1A1A]` (same weight as creator name)
- Bottom border remains visible while focused
- Certificate updates live: the name is part of the document in real time

**State: Filled / Blurred**
```
  ──────────────────     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Slava Ladischenski     Alex Chen
  March 1, 2026          will sign upon acceptance
```
- Bottom border disappears on blur
- Name reads as document text — visually equivalent to creator name
- No visual indicator that this is an editable field when unfocused (intentional — it IS the document)

**State: Error (submit attempted with empty slot)**
```
  ──────────────────     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Slava Ladischenski     Partner's name         ← red placeholder
  March 1, 2026          Partner name is required  ← error text below slot
```
- Placeholder color shifts to `text-red-400` (visible but not alarming inside the formal document)
- Error message appears directly below the slot, outside the certificate frame's inner box but within the cert: `text-xs text-red-500 mt-1`
- Bottom border in error state: `border-b border-red-400`
- Focus is automatically returned to the slot

**State: Auto-filled from email lookup**
```
  ──────────────────     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Slava Ladischenski     Alex Chen
  March 1, 2026          will sign upon acceptance
```
- Name populates as if the user had typed it (same "filled / blurred" appearance)
- A very brief fade-in animation (150ms opacity 0→1) signals the auto-fill — subtle, not distracting
- The slot remains fully editable; user can clear and retype

#### 2.3 Terms Textarea — Creation Mode

The terms field stays inside the certificate frame, as it is today. The visual treatment is adjusted to match the certificate aesthetic:

- Font: Playfair Display, `text-sm` (`text-[#1A1A1A]/80`)
- Border: none (or `border-0 ring-0`) — the textarea blends into the certificate body
- Background: transparent (matches the parchment `#FDFBF7`)
- On focus: faint bottom border (`border-b border-[#002B5C]/20`) to indicate editability
- Character counter: `{count}/1000` rendered below the textarea, inside the certificate, `text-xs text-[#1A1A1A]/40`
- Resize handle: removed (`resize-none`) on mobile; `resize-y` allowed on desktop

#### 2.4 Below-Certificate Controls

```
  Partner's email *                        Visibility
  [________________________]  [spinner]    [ 🔒 Private ]  [ 🌐 Public ]
  ↳ "Account found ✓"
     [avatar] Alex Chen

  [error message if applicable]

  [Seal & Send Invitation ✦]
```

- Email field: standard `Input` component with spinner overlay (preserved from P422)
- Visibility toggle: preserved from P422 (radio-style buttons)
- On mobile: email and visibility stack vertically (email full-width, then visibility row)
- Submit button: full-width on mobile, inline on desktop

#### 2.5 Acceptance Page — Partner View

The acceptance page gains a single change: the PARTNER slot becomes editable.

```
┌─ page ────────────────────────────────────────────────────┐
│                                                            │
│         Clarity Partner Agreement                          │
│  Slava Ladischenski has invited you to co-sign.           │
│                                                            │
│  ╔══════════════════════════════════════════════════════╗  │
│  ║  [full certificate — same layout as pending view]    ║  │
│  ║                                                      ║  │
│  ║  CREATOR               [seal]      PARTNER           ║  │
│  ║  Slava Ladischenski    ○ ○ ○       Alex Chen         ║  │
│  ║  March 1, 2026         (pending)   ─────────────     ║  │
│  ║                                   (editable slot)    ║  │
│  ╚══════════════════════════════════════════════════════╝  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [Authenticated partner state]                        │  │
│  │  Signing as: Alex Chen                                │  │
│  │                                                       │  │
│  │  [ I Accept & Co-Sign ✦ ]                             │  │
│  │                          Decline                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

- The PARTNER slot shows `partner_display_name` as a pre-filled editable input
- Partner can clear and retype their preferred display name before accepting
- On accept: the name typed in the slot (if changed) is submitted alongside the acceptance — the implementation must capture the slot value at accept-time
- After acceptance, the profile name takes precedence in rendering (per requirement 6)

---

### 3. Edge Cases

#### 3.1 API and Network Errors

| Scenario | What user sees |
|----------|---------------|
| Submit API fails (network error) | Red text below submit button: "Failed to create agreement. Check your connection and try again." Form re-enables. Spinner clears. |
| Email lookup fails silently | No badge, no error — field just shows no result. User can proceed without lookup result. |
| Duplicate agreement check fails server-side | Inline error below email field: "You already have an active agreement with this person." Scroll to email field. |
| Accept RPC fails | Toast: "Something went wrong. Please try again or use the link from your invitation email." (existing behavior preserved) |
| Token invalid or expired | Full-page error: "This invitation has expired or is invalid." Link to claritypledge.com. |

#### 3.2 Loading States

| State | What user sees |
|-------|---------------|
| Page initial load (auth check) | Centered spinner — full page (`Loader2Icon animate-spin`) |
| Email lookup in progress | Small spinner inside email field (right edge, existing behavior) |
| Submit in progress | Button: spinner + "Sending..." text. Certificate and all fields: `pointer-events: none` and `opacity-70`. |
| Acceptance page loading | Centered spinner (existing behavior) |
| Accept button in progress | Spinner + "Accepting..." inside button. Both action buttons disabled. |

#### 3.3 Validation Feedback

| Field | Trigger | Message |
|-------|---------|---------|
| Partner name (certificate slot) | Submit attempt | Inline below slot: "Partner name is required" |
| Partner name (certificate slot) | Submit, name > 100 chars | Inline: "Name must be 100 characters or fewer" |
| Partner email | Submit attempt, empty | Below email field: "Partner email is required" |
| Partner email | Valid email format, is own email | Inline: "You can't invite yourself" (existing) |
| Terms | Submit attempt, empty | Below terms area: "Terms cannot be empty" |
| Terms | Over character limit | Input blocked (existing: `val.length <= TERMS_MAX` guard) |

Validation runs on submit only for the name slot (not on blur, to avoid showing errors while the user is still filling out other fields). Error state is cleared as soon as the slot receives a non-empty value.

#### 3.4 Empty / Edge State Inputs

| Scenario | Behavior |
|----------|----------|
| Creator has no profile name | Red banner above certificate: "Please add your name in Settings before creating an agreement." Submit button disabled. Certificate renders with empty creator slot (or "-"). |
| User backspaces partner name to empty after typing | Slot returns to placeholder state on blur. No error until submit is attempted. |
| Partner name is only whitespace | Treated as empty on submit (trimmed before validation). |
| Email lookup returns a name with special characters | Auto-fill passes the raw name; user can edit. |
| Terms textarea at exactly 1000 chars | Input is blocked (existing guard). Counter reads "1000/1000" in amber to signal limit reached. |

#### 3.5 Acceptance Page Edge Cases

| Scenario | Behavior |
|----------|----------|
| `partner_display_name` is null (legacy agreement, no name stored) | Partner slot on accept page shows empty editable slot with placeholder "Your name". |
| Partner edits their name to empty before accepting | Accept button is disabled until name is non-empty. Error: "Please enter your name before signing." |
| Partner edits name but then acceptance fails | Re-enable the form; the edited name is preserved in the slot. |

---

### 4. Accessibility

#### 4.1 Screen Reader Support

- The certificate outer element: `role="region" aria-label="Agreement certificate"` so screen readers surface it as a named landmark.
- The partner name slot (inline input inside certificate): `aria-label="Partner's full name"` and `aria-required="true"`.
- When the slot is empty and error state: `aria-invalid="true"` + `aria-describedby="partner-name-error"` linking to the error message element.
- Error message element: `id="partner-name-error" role="alert"` so it is announced immediately when it appears.
- The terms textarea inside the certificate: `aria-label="Agreement terms"` + `aria-describedby="terms-char-count"`.
- Character count element: `id="terms-char-count" aria-live="polite"` — updates announced non-disruptively as user types.
- The submit button: `aria-disabled="true"` (not `disabled`) when creator name is missing, so screen readers can still read it and understand why it is unavailable. Include a tooltip or `aria-describedby` pointing to the error banner.
- AvatarBadge: `aria-hidden="true"` on the avatar image; the name text beside it is the meaningful content.
- Lookup result messages ("Account found" / "No account found"): `role="status" aria-live="polite"` so they are announced without interrupting the user's current field.
- Visibility radiogroup: `fieldset` with `legend` ("Visibility") is already in place — preserved.

#### 4.2 Keyboard Navigation

Tab order through the creation form (logical document order):

```
1. Back button
2. [skip over static certificate content]
3. Partner name slot (inside certificate — first interactive element)
4. Terms textarea (inside certificate)
5. Partner email field
6. Private visibility button
7. Public visibility button
8. Seal & Send Invitation button
```

The certificate's static text sections (pledge text, section headers) are not focusable (`aria-hidden` or `tabIndex=-1` unless they contain interactive elements).

Keyboard behaviors:
- **Tab** into partner name slot: bottom border appears, cursor positioned
- **Enter** inside partner name slot: does NOT submit the form (the slot is an `<input>` inside a `<form>`, so `type="text"` is safe — Enter only submits from a single-field form or explicit submit button)
- **Escape** inside partner name slot: blurs the slot (default browser behavior)
- **Tab** from partner name slot → terms textarea (natural tab flow)
- **Shift+Tab** reverses tab order
- Visibility toggle: Space or Enter selects the focused option (existing radio button behavior)
- Submit button: Enter or Space when focused submits the form

#### 4.3 Focus Indicators

- Partner name slot on focus: `outline: 2px solid #002B5C; outline-offset: 2px` — visible on the parchment background, matches the certificate's navy color system. The standard Tailwind `focus-visible:ring-1 focus-visible:ring-ring` from the base `Input` component is overridden for this slot to preserve the document aesthetic.
- All other focusable elements: preserve existing focus ring patterns (email input, buttons — already have `focus-visible:ring-1 focus-visible:ring-ring`).
- The focus indicator must remain visible against the `#FDFBF7` parchment background — navy `#002B5C` at 2px satisfies WCAG 2.1 Success Criterion 2.4.7.

#### 4.4 Color Contrast

- Error text `text-red-500` (`#EF4444`) on `#FDFBF7` parchment: contrast ratio ~4.8:1, passes WCAG AA for normal text.
- Placeholder text `text-[#1A1A1A]/50` on parchment: contrast ratio ~5.2:1, borderline AA. The placeholder is supplemented by the slot's position context (it is inside the document's signature area), reducing reliance on color alone.
- Error placeholder `text-red-400` on parchment: contrast ratio ~3.9:1 — supplemented by the `border-b border-red-400` visual indicator, so color is not the sole means of error communication.

---

### 5. Responsive Design

#### 5.1 Mobile (320px–767px)

The certificate frame is the primary challenge on narrow viewports. The double-border uses `border: 8px solid #002B5C` + `outline: 2px solid #002B5C` + `-12px offset`. On a 320px viewport with 16px horizontal padding, the certificate content area is ~272px wide.

**Certificate layout adjustments at mobile breakpoint:**
- Outer padding: `p-4` (down from `p-6 md:p-10`) — reduces horizontal margin consumption
- Font sizes: `text-xl` for the title (down from `text-2xl`), `text-sm md:text-base` for pledge body (existing responsive classes cover this)
- Signature row (creator / seal / partner): stacks to a column layout on very narrow screens (below 400px)
  - Column order: Creator block → Seal → Partner block
  - Each block takes full width; seal centers between them

**Partner name slot on mobile:**
- The slot spans the full partner signature column width — approximately 120px on 320px screens in the side-by-side layout
- On screens below 400px where signatures stack: the slot expands to full available width
- Minimum touch target: the slot has `min-height: 44px` even though it renders as a single text line — padding is applied vertically to ensure the touch target is large enough without visually expanding the certificate
- Font size: `text-base` (16px) on mobile to prevent iOS auto-zoom on focus (iOS zooms in when `font-size < 16px` on form inputs)

**Below-certificate controls on mobile:**
```
  Partner's email *
  [________________________________]
    ↳ lookup result

  Visibility
  [ 🔒 Private ]  [ 🌐 Public ]

  [Seal & Send Invitation ✦]   ← full width button
```
- Email and visibility stack vertically (no side-by-side layout)
- Submit button is `w-full` on mobile

#### 5.2 Tablet (768px–1023px)

- Certificate uses `p-6` padding (the existing `md:p-10` could be adjusted to `md:p-8` for this range, TBD)
- Signature row remains horizontal (side-by-side creator / seal / partner)
- Below-certificate controls: email and visibility appear in the same row (`flex flex-wrap gap-4`) with email taking `flex-1` and visibility inline beside it
- Submit button: inline, not full-width

#### 5.3 Desktop (1024px+)

- Full `p-10` certificate padding
- Certificate constrained to `max-w-2xl` container (same as current page `max-w-2xl`)
- All controls below certificate fit in a single row at comfortable sizes
- The certificate is the visual centerpiece — white space above and below it lets it breathe

#### 5.4 Breakpoint Behavior Summary

| Element | Mobile (<400px) | Mobile (400–767px) | Tablet (768–1023px) | Desktop (1024px+) |
|---------|----------------|-------------------|--------------------|--------------------|
| Certificate padding | `p-4` | `p-4` | `p-6` | `p-10` |
| Signature row | Stacked vertically | Side-by-side | Side-by-side | Side-by-side |
| Partner name slot | Full width, 44px min-height | ~120px, 44px min-height | ~130px | ~150px |
| Font size (slot) | 16px (prevents iOS zoom) | 16px | 16px | 16px |
| Controls layout | Stacked | Stacked | Row (email flex-1) | Row |
| Submit button | Full width | Full width | Inline | Inline |

---

### 6. Component Analysis

Scanned `src/app/components/` and `src/app/pages/` for existing components relevant to this feature.

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Certificate outer frame (double border, parchment bg) | Reuse | `src/app/components/agreements/agreement-certificate.tsx` | No — frame structure is unchanged |
| `SignatureSlot` (static partner name `<p>`) | Extend | `agreement-certificate.tsx` — `SignatureSlot` is a local function; needs a new branch that renders an `<input>` instead of `<p>` when `variant === 'creation'` or when a new `editable` prop is true | **Yes — FD-A: single SignatureSlot with `editable` prop vs separate `EditableSignatureSlot` component?** Recommendation: add `editable?: boolean` + `onNameChange?: (v: string) => void` to `SignatureSlot`. Simpler, keeps the component co-located. |
| Partner name input styling (document-text aesthetic) | New | No existing "borderless certificate-font input" pattern exists. Proposed: `CertificateNameInput` — a styled `<input>` variant with Playfair Display font, `border-0 bg-transparent`, focus bottom-border, no ring. Renders inside `SignatureSlot`. | **Yes — FD-B: styled `<input>` vs `contenteditable` div?** Recommendation: `<input type="text">` — better accessibility, better form semantics, easier to control value and validation than contenteditable. |
| Terms textarea (inside certificate) | Extend | `agreement-certificate.tsx` — currently renders `termsText` as a read-only `<p>`. In creation mode, needs to render a `<Textarea>` instead. Pass `onTermsChange` prop; certificate applies certificate-font styling override to the textarea. | No decision needed — `Textarea` from `src/components/ui/textarea.tsx` is the base; add className overrides |
| Email input with spinner | Reuse | `src/app/pages/create-agreement-page.tsx` (inline `Input` + `Loader2Icon`) — structure is preserved, moves below the certificate in the new layout | No |
| AvatarBadge (found account display) | Reuse | `create-agreement-page.tsx` (inline component) — no changes needed | No |
| Visibility toggle (radio-style buttons) | Reuse | `create-agreement-page.tsx` (inline, uses `MobileTooltip`) — no changes needed | No |
| Submit button | Reuse | `src/components/ui/button.tsx` — label changes to "Seal & Send Invitation ✦"; loading state preserved | No |
| Mobile tooltip (visibility button tooltips) | Reuse | `src/app/components/shared/mobile-tooltip.tsx` — no changes | No |
| Error banner (nameless creator) | Reuse | Inline in `create-agreement-page.tsx` — moves to above the certificate in new layout | No |
| Inline error messages (field-level) | Reuse | Pattern from `create-agreement-page.tsx` (`role="alert"`, red text) — apply same pattern to partner name slot error | No |
| `AgreementCertificate` component (variant prop) | Extend | `agreement-certificate.tsx` — `CertificateVariant` already includes `'creation'`. The `creation` variant needs to activate the editable slot + editable terms. New props: `partnerNameValue`, `onPartnerNameChange`, `onTermsChange`, `partnerNameError`. | **Yes — FD-C: Should `AgreementCertificate` accept callbacks and become partially controlled, or should `create-agreement-page.tsx` render the partner slot outside the certificate and position it via absolute/CSS?** Recommendation: pass callbacks into the certificate — keeps the document structure intact and avoids layout hacks. |
| Acceptance page certificate (partner slot editable) | Extend | `src/app/pages/accept-agreement-page.tsx` — passes `partnerName` to `AgreementCertificate`; needs to also pass `onPartnerNameChange` when showing to the `partner` page state | No major decision — follows same pattern as creation |
| `CelebrationDialog` | Reuse | `src/app/components/agreements/celebration-dialog.tsx` — no changes needed | No |
| Decline confirmation dialog | Reuse | Inline `Dialog` in `accept-agreement-page.tsx` — no changes | No |
| Character counter for terms | Reuse | Pattern from `create-agreement-page.tsx` — moves inside the certificate in the new layout | No |

**Founder decisions requiring input (summary):**

- **FD-A:** Should `SignatureSlot` get an `editable` boolean prop (extend in-place) or should a separate `EditableSignatureSlot` component be created? Recommendation: extend in-place. Keeps the existing rendering logic co-located and avoids a second component for what is a minor variant.

- **FD-B:** Inline editable partner name — `<input type="text">` (styled, borderless) or `contenteditable` div? Recommendation: `<input>` — far better accessibility (works with screen readers, form submission, keyboard shortcuts), avoids the well-documented pitfalls of `contenteditable` (cursor management, paste handling, composition events). The document-text appearance is achievable with `border-0 bg-transparent` plus Playfair Display font.

- **FD-C:** Should `AgreementCertificate` accept `onPartnerNameChange` and `onTermsChange` callbacks directly (making it a partially controlled component in creation mode), or should creation-mode fields be rendered outside the certificate and overlaid via CSS? Recommendation: pass callbacks into the certificate — preserves the semantic integrity of "the document is the form" and avoids fragile absolute-position overlay hacks.

- **FD-1 (from spec):** Auto-populate partner name slot from email lookup when slot is empty — UX design assumes YES (auto-fill, editable). If the founder decides NO, the lookup result panel below the email field still shows the name via AvatarBadge, but the certificate slot must be manually filled.

- **FD-2 (from spec):** Partner name required — UX design assumes YES (required, blocks submit). If the founder decides optional, the validation section changes: error on submit is removed; slot shows placeholder but never blocks.
