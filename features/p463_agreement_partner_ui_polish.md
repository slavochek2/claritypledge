---
status: today
type: feature
rank: 1000002
workstream: E1
created_date: 2026-02-28
flow: dev
delivery_stage: 2-ux-review
tags: [agreements, partners, ux-polish]
# For complete frontmatter specification, see docs/technical/feature-specs.md
---

# P463: Agreement & Partner UI Polish

## Problem

Several rough edges in the agreement certificate and partners page:
certificate shows an internal ID (A-0173) that adds noise, the "bilateral" wording is
less accurate than "mutual", the pending state exposes resend/copy-link UI with a
known double-rotation bug and no rate limiting, and the Partners page buries the
primary CTA as a text link below the list. Partner name is also unavailable on the
certificate until the partner signs, because the invite form never collected it.

## Changes

### agreement-certificate.tsx
1. `"bilateral"` → `"mutual"` in subtitle ("A mutual commitment to clarity")
2. Remove `displayId` (A-0173) from certificate header

### agreement-page.tsx — PendingView
3. Remove amber invitation-status block (Resend Invitation + Copy Link + email disclosure)
4. Remove "Schedule a /live session while you wait →" link

### profile-connections-page.tsx
5. Remove `✦ Partner Agreements` section heading (redundant with page title "My Partners")
6. Move CTA to top-right of the heading row, rendered as primary blue button
7. Rename CTA: `"New Agreement"` → `"Invite a Clarity Partner"`

### create-agreement-page.tsx + DB
8. Add "Partner's full name" field to invite form
   - Stored as `partner_display_name` (nullable text) on `clarity_agreements`
   - Certificate uses it as PARTNER slot label while pending
   - Fallback chain: `partner.name` → `partnerDisplayName` → `"Invited party"`
   - DB migration required: `ALTER TABLE clarity_agreements ADD COLUMN partner_display_name text`

## Deferred / Out of scope
- Resend functionality: remove from UI only; backend code stays (no rate limiting, double-rotation bug)
- Copy Link: removed with the amber block; revisit after resend bug is fixed
- OUR TERMS copy: keep as-is for now

## ASCII — Partners Page

```
BEFORE                           AFTER
──────────────────────────────   ──────────────────────────────
My Partners                      My Partners   [Invite a Clarity Partner]
                                               ↑ primary blue button

✦ PARTNER AGREEMENTS             (section heading removed)
┌──────────────────────────┐     ┌──────────────────────────┐
│ Partner row              │     │ Partner row              │
└──────────────────────────┘     └──────────────────────────┘
+ New Agreement  ← text link     (button at top, not here)
```

## ASCII — Certificate Header

```
BEFORE                           AFTER
──────────────────────────────   ──────────────────────────────
A-0173                           Clarity Partner Agreement
Clarity Partner Agreement        A MUTUAL COMMITMENT TO CLARITY
A BILATERAL COMMITMENT...
```

## ASCII — Pending State (Agreement Page)

```
BEFORE                           AFTER
──────────────────────────────   ──────────────────────────────
[certificate]                    [certificate]

┌─────────────────────────┐      (nothing below certificate)
│ ⏱ Invitation sent to   │
│   email. Waiting...     │
│   [Resend] [Copy link]  │
└─────────────────────────┘
Schedule a /live session →
```

## Acceptance Criteria

- [ ] Certificate subtitle reads "A mutual commitment to clarity"
- [ ] No A-XXXX ID visible in certificate header
- [ ] Pending view: amber block absent; schedule link absent
- [ ] Partners page: no "✦ Partner Agreements" heading
- [ ] Partners page: "Invite a Clarity Partner" blue button in heading row
- [ ] Create-agreement form has "Partner's full name" field (required)
- [ ] Certificate PARTNER slot shows entered name while pending
- [ ] Once partner signs, their profile name takes over

## Testing

Visual: `/verify` after implementation.
Unit: fallback chain for partnerName in certificate (partner.name → partnerDisplayName → "Invited party").

---

## UX Design

### 1. User Flow

This feature touches four independent surfaces. Each flow is described separately.

---

#### Flow A — Partners Page (profile-connections-page)

**Entry:** User navigates to their own Partners page via profile menu or direct link.

**Default path (owner, has agreements):**
1. Page loads — skeleton pulses for agreement rows
2. Page renders: heading row shows "My Partners" on the left, "Invite a Clarity Partner" primary blue button on the right
3. Agreements list renders immediately below the heading row (no section heading)
4. User scans list, clicks a row to open an agreement — exits to Agreement Page

**CTA path (owner wants to invite):**
1. User sees "Invite a Clarity Partner" button in the heading row
2. User clicks/taps — navigates to Create Agreement form
3. (No intermediate step added — friction check: the button is now at top, zero scrolling required vs. previous text link buried below list)

**Empty state path (owner, no agreements):**
1. Heading row renders with button at top-right
2. Below heading: "No agreements to show." message + "Invite a Clarity Partner" button (centered, inside empty state)
3. Two entry points to the form — heading row button and empty state button — both reach the same destination

**Visitor path (viewing someone else's page):**
1. Heading shows "[First name]'s Partners"
2. No CTA button in heading row (visitor cannot invite on behalf of another user)
3. Only public/permitted agreements are shown

**Error path:**
1. Profile not found or network failure — back navigation renders with error message below
2. No heading row rendered; no CTA shown

**Exit:** Back button (ArrowLeft) → previous page in history.

---

#### Flow B — Create Agreement Form (create-agreement-page)

**Entry:** User arrives from "Invite a Clarity Partner" button or direct link.

**Default path:**
1. Form loads with existing fields: Partner email (required), Visibility toggle, Our terms textarea
2. NEW: "Partner's full name" field renders between Partner email and Visibility (see Screen Design)
3. User fills Partner email → debounced lookup fires after 400ms
   - Account found: green "Account found ✓" + avatar badge renders; partner name field may be pre-filled if profile name available (founder decision — see Section 6)
   - Not found: "No account found — they'll be invited to create one." message; partner name field remains editable
4. User fills "Partner's full name" — required, validated on submit
5. User adjusts Visibility if desired
6. User edits or accepts default terms
7. User submits → "Create & Send Invitation ✦" button

**Validation error path:**
- Partner email empty: inline error below field on submit
- Partner's full name empty: inline error below field on submit
- Self-invite: inline error below email field (shown immediately via debounce)
- Duplicate active agreement: inline error below email field (shown on submit after async check)
- Terms empty: inline error below textarea on submit
- All errors shown simultaneously; focus moves to the first invalid field

**Nameless creator path:**
- Red alert banner above form: "Please add your name in Settings before creating an agreement."
- Submit button disabled until name is set

**Submission loading:**
- Submit button shows spinner + "Sending..." label; button disabled
- Form fields remain readable (not disabled) to reduce perceived friction

**Success:** Navigate to /agreements/:id (the new agreement's pending view)

---

#### Flow C — Agreement Page, Pending View (agreement-page — PendingView)

**Entry:** Creator lands after submitting form, or revisits the pending agreement URL.

**Creator path (after this change):**
1. Certificate renders with:
   - Title: "Clarity Partner Agreement"
   - Subtitle: "A mutual commitment to clarity" (was "A bilateral commitment...")
   - No A-XXXX ID in header
   - PARTNER signature slot shows the name entered at invite time (partner_display_name), or "Invited party" if none stored
2. Nothing below the certificate — the amber invitation-status block is absent; the schedule link is absent
3. User reads the certificate; the page communicates "waiting" through the certificate's pending visual state (dashed seal, "..." in partner slot) alone

**Partner path (unchanged):**
1. Same certificate renders
2. "Review & Sign" primary button centered below certificate remains

**Lean challenge flag:** Removing the amber block removes the only explicit confirmation that the invitation email was sent. A first-time creator may feel uncertain. The certificate's pending seal (dashed, greyed logo) carries the "waiting" signal, but it is implicit. If user research reveals confusion here, a one-line status sentence ("Invitation sent.") above or below the certificate — without the Resend/Copy actions — could restore confidence without re-introducing the buggy controls. This is not a blocker; flag for observation after ship.

---

#### Flow D — Certificate Header (agreement-certificate — all contexts)

This is a purely cosmetic change with no interactive path. The header is present in: PendingView, ActiveView, MutedCertificate (Declined/Expired/Terminated), accept-agreement-page, and celebration-dialog.

All certificate instances are affected identically:
- A-XXXX line: removed
- Subtitle: "A bilateral commitment to clarity" → "A mutual commitment to clarity"

No user decision points. No new paths introduced.

---

### 2. Screen Designs

#### Partners Page — Heading Row

```
┌─────────────────────────────────────────────────────┐
│  ← Back                                             │
│                                                     │
│  My Partners          [Invite a Clarity Partner]    │
│  ↑ h1, text-xl font-bold    ↑ primary blue button   │
│                               min-h-[44px]          │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ Partner row                    Active        │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │ Partner row                    Pending       │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

Heading row layout: `flex items-center justify-between`. h1 on left, button on right. Button label "Invite a Clarity Partner". Minimum touch target 44px height.

Empty state (owner):
```
┌─────────────────────────────────────────────────────┐
│  My Partners          [Invite a Clarity Partner]    │
│                                                     │
│         No agreements to show.                      │
│         [Invite a Clarity Partner]  ← centered      │
└─────────────────────────────────────────────────────┘
```

Note: the empty-state button uses the same label. Two identical buttons exist simultaneously when the list is empty — this is intentional (prominent action when nothing exists), but the heading-row instance gives owner a persistent anchor even when scrolled.

---

#### Create Agreement Form — Field Order

```
New Clarity Partner Agreement
Invite someone to practice calibrated communication with you.

Partner email *
[________________________]
  ↳ lookup result / error

Partner's full name *
[________________________]
  ↳ validation error

Visibility
[Private]  [Public]

Our terms:
[________________________]
[________________________]  (8 rows, resizable)
  ↳ 0/1000 characters

[Create & Send Invitation ✦]
```

"Partner's full name" field:
- Label: "Partner's full name" with asterisk indicating required
- Input type: text
- Placeholder: e.g. "Alex Kim"
- Positioned between Partner email and Visibility so the two "partner" fields are grouped together
- Validation: required on submit; inline error below field
- When account is found via email lookup: field remains editable — user may want to use a nickname or different form of the name

States for the new field:
- Default: empty, placeholder visible
- Focused: ring highlight (matches other fields)
- Filled: name visible
- Error (submit with empty): red border + "Partner's full name is required" message below
- Disabled: not applicable (no case where this field alone should be disabled)

---

#### Certificate Header — Before and After

```
BEFORE                           AFTER
─────────────────────────        ─────────────────────────
A-0173                           Clarity Partner Agreement
Clarity Partner Agreement        A MUTUAL COMMITMENT TO CLARITY
A BILATERAL COMMITMENT
  TO CLARITY
```

The header block is vertically tighter after the change: removing the ID line saves one line of vertical space inside the certificate frame. The remaining two lines center naturally under the existing border-bottom rule.

---

#### Agreement Page — Pending View (Creator)

```
BEFORE                           AFTER
─────────────────────────        ─────────────────────────
[Certificate]                    [Certificate]
                                 ↑ partner slot shows
┌──────────────────────┐           partnerDisplayName
│ ⏱ Invitation sent to │           or "Invited party"
│   email@... Waiting  │
│   [Resend] [Copy]    │         (nothing else)
└──────────────────────┘
Schedule a /live session →
```

Visual states of the pending certificate (unchanged from P422):
- Pending seal: dashed-border circle with muted logo
- Partner signature slot: dashed line with "..." ellipsis, label "Partner"
- Slot name: now shows partnerDisplayName (or fallback) instead of "Invited party"

---

### 3. Edge Cases

#### Certificate Subtitle Change
- No edge case. The text is static. Applies uniformly across all certificate variants (pending, active, celebration, muted).

#### Display ID Removal
- The `displayId` prop still exists in the component interface (it is passed in from callers); the certificate simply stops rendering it. Existing data is unaffected.
- The `displayId` continues to appear in AgreementRow (the list item on Partners page) — this is intentional and out of scope for this feature.

#### Amber Block Removal
- Creator who is offline or has slow network: previously could see resend/copy as a fallback. After removal, if the invitation email failed silently, the creator has no in-app recovery path. This is an acceptable known gap given the backend bug; flagged in Deferred section.
- Partner who clicks an expired link: lands on accept-agreement-page, not PendingView. No change to that flow.

#### Schedule Link Removal
- No edge case. It was a Google Calendar deeplink with no state dependency.

#### "Invite a Clarity Partner" Button
- Owner with 0 agreements: button appears in heading row AND in empty state. Both are valid; no duplication risk because clicking either navigates to the same form.
- Visitor: button is not rendered. No access control logic change required — it was already owner-only.

#### Partner's Full Name Field
- Email lookup finds account: partner profile name is available in `lookupResult.name`. Decision needed: should the field auto-populate with `lookupResult.name`? (See Founder Decisions, Section 6.)
- Partner has no ClarityPledge account yet: name entered by creator is the only signal for the certificate. Critical that this field be saved correctly.
- Creator submits without filling the name: inline validation error. Submit blocked.
- Creator enters a name then clears the email field: name persists in field (not auto-cleared). This is correct — user might be correcting a typo, not starting over.
- Very long name: no character limit specified. Recommend capping at 100 characters (fits certificate slot without overflow). Founder decision — see Section 6.
- Fallback chain on certificate:
  - `partner.name` (from joined profile) → shown when partner has a ClarityPledge account
  - `partnerDisplayName` (from DB column) → shown when partner has no account yet, or before partner signs
  - `"Invited party"` → shown if both above are null/empty (e.g., old agreements created before this field existed)

#### Loading States
- Partners page: existing `PageSkeleton` (3 animated muted rows) covers the fetch delay. Heading row with button should render as part of the skeleton or immediately after — not deferred until data loads, to avoid layout shift.
- Create agreement form: form is synchronous after auth resolves. No additional loading state needed for the new field.
- Agreement page: existing `LoadingSkeleton` covers load. Certificate renders after data resolves.

#### Empty States
- Partners page, no agreements: existing EmptyState component. Button label updated to "Invite a Clarity Partner" to match heading row. No new empty state needed.
- Certificate, partner name null/empty: fallback chain handles this — "Invited party" is the terminal fallback, already present in code.

#### Network/Error States
- Partners page load failure: existing error rendering (ArrowLeft back + muted error message). No change.
- Agreement page load failure: existing not-found and private states unchanged.
- Create agreement submission failure: existing `submitError` message renders below form. The new name field does not affect error handling.

---

### 4. Accessibility

#### Certificate Header Change
- The `<h2>` "Clarity Partner Agreement" has no change. The subtitle `<p>` text changes from "bilateral" to "mutual" — screen readers read the updated text automatically, no ARIA changes needed.
- Removing the `displayId` `<p>` reduces DOM noise; no ARIA annotations were applied to it.

#### Partners Page Heading Row
- The `<h1>` "My Partners" retains its semantic role.
- The "Invite a Clarity Partner" button must be a semantic `<button>` or `<a>` rendered via the existing `Button` component (which uses a `<button>` element internally, or `<a>` via `asChild` + `Link`). Using `Link` with `asChild` is the correct pattern to get router navigation + button ARIA role.
- `aria-label`: the button label "Invite a Clarity Partner" is descriptive enough — no additional aria-label required.
- Keyboard: Tab order is heading (not focusable) → button → first agreement row. This is the correct visual reading order.
- Focus indicator: existing `focus-visible:ring-2` from the `Button` component applies.

#### Create Agreement — New Name Field
- `<label htmlFor="partner-name">` explicitly associated with the `<input id="partner-name">`.
- `aria-required="true"` on the input (matches the required asterisk in the label).
- `aria-describedby="partner-name-error"` when validation error is present.
- `aria-invalid="true"` on the input when error is active.
- Error message rendered with `role="alert"` so screen readers announce it on submit without focus movement.
- Focus management on submit error: focus programmatically moves to the first invalid field (partner email if empty, then partner name if email is valid but name is empty). This matches existing pattern in the form.

#### Agreement Page — Amber Block Removal
- The amber `<div>` with `Clock` icon had no explicit ARIA role. Removing it does not break any accessibility tree.
- The `CopyLinkButton` had `aria-label="Copy invitation link"` — removed with the block, no orphaned ARIA references remain.
- PendingView for the partner still shows "Review & Sign" `<Button asChild>` which retains focus-visible ring and keyboard activation.

#### Color Contrast (WCAG AA)
- "Invite a Clarity Partner" button: primary blue (`#0044CC` background, white text). Ratio ~7:1 — passes AA and AAA.
- Certificate subtitle "A mutual commitment to clarity": `text-[#1A1A1A]/60` on `#FDFBF7` background. Computed: approximately 5.5:1 — passes AA for normal text.
- Partner name field error state: `text-red-500` on white. Standard Tailwind red-500 (#EF4444) on white is ~3.9:1 — passes AA for large text but marginally fails for small text. This matches the existing error styling pattern throughout the form; no change in risk profile.
- Empty state muted text `text-muted-foreground`: defined by design system; within existing acceptable range.

#### Screen Reader Reading Order
- Partners page: h1 → button → list of agreement rows. Logical.
- Create form: label → input → lookup result → [new] partner name label → input → visibility fieldset → terms label → textarea → submit.
- Certificate: h2 → subtitle p → opening tagline → Your Right section → Our Promise section → The Exception section → [optional] terms → signature slots.

---

### 5. Responsive Design

#### Partners Page — Heading Row

**Mobile (320px–767px):**
- Heading row: `flex items-center justify-between`. On narrow screens the h1 ("My Partners") is short enough that the button does not wrap. If the locale produces a longer translation of "My Partners", the row may need `flex-wrap gap-2` as a fallback.
- Button: `min-h-[44px]` ensures tap target. Label "Invite a Clarity Partner" is 24 characters — fits on one line at 320px width at the standard button font size (14px), but is close to the edge. If truncation occurs, label can shorten to "Invite Partner" on mobile only (founder decision — see Section 6).
- Agreement rows: full width, no change.

**Tablet (768px–1023px):**
- Same flex layout as mobile. More horizontal space — no wrapping concern.

**Desktop (1024px+):**
- `max-w-lg` container is already constrained; heading row behaves identically to tablet.

---

#### Create Agreement Form — New Name Field

**Mobile:**
- Full-width input below the email lookup result. Label, input, and error message stack vertically. No layout change needed — matches existing field pattern.
- Touch target: `min-h-[44px]` on the input (or equivalent padding) to meet tap size requirements.

**Tablet / Desktop:**
- No two-column layout used in this form; fields are full-width at all breakpoints. The new field integrates without any responsive special-casing.

---

#### Certificate Header

- The header `<div>` is `text-center` at all breakpoints. Removing one line of text reduces height uniformly; no responsive breakpoints are affected.
- On very small screens (320px), the h2 "Clarity Partner Agreement" can already wrap to two lines — unchanged by this feature.

---

#### Agreement Page — Pending View

- Removing the amber block and schedule link reduces page height on all breakpoints. No layout reflow issues expected — the certificate is already the primary visual element and centers cleanly without the block below it.
- On mobile: the page is shorter, which is an improvement — less scrolling to see the full certificate.

---

### 6. Component Analysis

Scan of `src/app/components/agreements/` and `src/app/pages/`:

| Element | File | Classification | Notes |
|---|---|---|---|
| Certificate title (`<h2>`) | `agreement-certificate.tsx` | Reuse | Static string, no change to element |
| Certificate subtitle (`<p>`) | `agreement-certificate.tsx` | Extend | Text change: "bilateral" → "mutual" |
| Certificate displayId block (`<p>`) | `agreement-certificate.tsx` | Extend | Remove conditional render block; `displayId` prop retained but not rendered |
| SignatureSlot — partner name display | `agreement-certificate.tsx` | Extend | Now receives `partnerDisplayName` from caller; no internal changes to SignatureSlot itself |
| PendingView amber block | `agreement-page.tsx` | Extend | Delete block (lines 178–213 in current file) |
| PendingView schedule link | `agreement-page.tsx` | Extend | Delete link (lines 215–226 in current file) |
| MutedCertificate | `agreement-page.tsx` | Extend | Must pass `partnerDisplayName` fallback instead of hardcoded "Invited party" |
| LoadingSkeleton | `agreement-page.tsx` | Reuse | No change |
| TerminateDialog | `agreement-page.tsx` | Reuse | No change |
| AgreementRow (displayId shown in list) | `agreement-row.tsx` | Reuse | displayId stays visible in row — intentional, out of scope |
| PageSkeleton | `profile-connections-page.tsx` | Extend | Skeleton should represent new heading layout (h1 + button row) to prevent layout shift |
| EmptyState button | `profile-connections-page.tsx` | Extend | Label change: "New Agreement" → "Invite a Clarity Partner" |
| Page heading `<h1>` + CTA | `profile-connections-page.tsx` | Extend | Add `flex justify-between items-center` wrapper; add Button (primary) in heading row |
| Section heading `✦ Partner Agreements` | `profile-connections-page.tsx` | Extend | Remove entire `<div className="flex items-center gap-2 mb-3">` block |
| Inline CTA text link `+ New Agreement` | `profile-connections-page.tsx` | Extend | Remove; replaced by heading-row button |
| Partner email `<Input>` | `create-agreement-page.tsx` | Reuse | No change |
| Partner name `<Input>` | `create-agreement-page.tsx` | New | New field; same `Input` component, new state variables, new label, new validation |
| AvatarBadge | `create-agreement-page.tsx` | Reuse | No change |
| Visibility fieldset | `create-agreement-page.tsx` | Reuse | No change |
| Terms `<Textarea>` | `create-agreement-page.tsx` | Reuse | No change |
| Submit `<Button>` | `create-agreement-page.tsx` | Extend | Disabled logic must include new name field validity |
| `Button` (shared UI) | `src/components/ui/button` | Reuse | Used for new heading-row CTA with default primary variant |
| `Input` (shared UI) | `src/components/ui/input` | Reuse | Used for new partner name field |

**Summary:** 4 New elements (partner name field + associated state/validation), 12 Extend (targeted modifications to existing elements), 7 Reuse (untouched).

---

#### Founder Decisions Needed

**FD-1: Auto-populate partner name from email lookup result?**
When the creator enters an email and a ClarityPledge account is found, `lookupResult.name` is available. Should the "Partner's full name" field auto-fill with that name?
- Pro: reduces typing for the common case (partner already has an account).
- Con: user may want to use a different name (nickname, how they actually address the person); auto-fill could feel presumptuous or require correction.
- Recommendation: do not auto-fill. Keep the field empty; show the found name in the AvatarBadge below the email field. User sees the name and can choose to type it themselves. The fields serve different purposes: lookup confirms identity, name captures preferred display label.

**FD-2: Character limit on partner's full name field?**
The spec does not specify a limit. The certificate signature slot is fixed-width and long names may overflow or truncate visually.
- Recommendation: cap at 100 characters with a counter below the field (matching the terms counter pattern). Alternatively, cap at 60 characters to ensure it fits the certificate slot cleanly. Either is fine; 100 is more permissive.

**FD-3: "Invite a Clarity Partner" button label on narrow mobile screens (320px)?**
The full label is 24 characters. At 320px viewport with the h1 on the left, the button may be too wide to fit on one line.
- Options: (A) Keep full label and allow flex-wrap on the heading row, (B) Shorten to "Invite Partner" on mobile via responsive class, (C) Use icon-only button with aria-label on mobile (less discoverable).
- Recommendation: (A) allow wrap — the heading row drops to two lines on the narrowest screens, which is acceptable given "My Partners" is a short h1. Verify visually via `/verify`.

**FD-4: "Invite a Clarity Partner" vs "Invite Partner" consistency with empty state?**
The empty state currently shows "+ New Agreement". After this change, both the heading button and empty state button use "Invite a Clarity Partner". This is consistent but results in two identical prominent buttons on the same screen. No action required if this is the desired behavior; flagging for awareness.

---

#### Lean Friction Audit

Changes audited against "scan for friction before value":

- Removing amber block: reduces friction (one fewer block to parse while waiting).
- Removing schedule link: reduces friction (one fewer external navigation option).
- Moving CTA to top: reduces friction (was below list, now immediately visible).
- Adding partner name field: **adds one required field before the core action** (creating the agreement). This is the only friction addition in this feature. Justified because the value exchange is direct — the name appears on the certificate immediately, benefiting the creator's experience of the pending state. The field is short (text input, one line) and the task context (filling a form) already expects effort. Acceptable.

No changes in this feature gate access to a core action behind a new step. The create-agreement form is already a multi-field form; one additional required field is within the expected cognitive load for that context.
