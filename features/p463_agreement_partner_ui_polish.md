---
status: qa
type: feature
rank: 15685.375
workstream: E1
created_date: 2026-02-28T00:00:00.000Z
flow: dev
delivery_stage: uat
tags:
  - agreements
  - partners
  - ux-polish
locked_at: '2026-03-02T09:04:30.953Z'
---

# P463: Agreement & Partner UI Polish

## Problem

Several rough edges in the agreement certificate and partners page:
certificate shows an internal ID (A-0173) that adds noise, the "bilateral" wording is
less accurate than "mutual", the pending state exposes resend/copy-link UI with a
known double-rotation bug and no rate limiting, and the Partners page buries the
primary CTA as a text link below the list.

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
7. Rename CTA: `"New Agreement"` → `"Add a Partner?"`

## Deferred / Out of scope
- Resend functionality: remove from UI only; backend code stays (no rate limiting, double-rotation bug)
- Copy Link: removed with the amber block; revisit after resend bug is fixed
- OUR TERMS copy: keep as-is for now

## ASCII — Partners Page

```
BEFORE                           AFTER
──────────────────────────────   ──────────────────────────────
My Partners                      My Partners        [Add a Partner?]
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

- [x] Certificate subtitle reads "A mutual commitment to clarity"
- [x] No A-XXXX ID visible in certificate header
- [x] Pending view: amber block absent; schedule link absent
- [x] Partners page: no "✦ Partner Agreements" heading
- [x] Partners page: "Add a Partner?" blue button in heading row

## Testing

Visual: `/verify` after implementation.

---

## UX Design

### 1. User Flow

This feature touches four independent surfaces. Each flow is described separately.

---

#### Flow A — Partners Page (profile-connections-page)

**Entry:** User navigates to their own Partners page via profile menu or direct link.

**Default path (owner, has agreements):**
1. Page loads — skeleton pulses for agreement rows
2. Page renders: heading row shows "My Partners" on the left, "Add a Partner?" primary blue button on the right
3. Agreements list renders immediately below the heading row (no section heading)
4. User scans list, clicks a row to open an agreement — exits to Agreement Page

**CTA path (owner wants to invite):**
1. User sees "Add a Partner?" button in the heading row
2. User clicks/taps — navigates to Create Agreement form
3. (No intermediate step added — friction check: the button is now at top, zero scrolling required vs. previous text link buried below list)

**Empty state path (owner, no agreements):**
1. Heading row renders with button at top-right
2. Below heading: "No agreements to show." message + "Add a Partner?" button (centered, inside empty state)
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

#### Flow C — Agreement Page, Pending View (agreement-page — PendingView)

**Entry:** Creator lands after submitting form, or revisits the pending agreement URL.

**Creator path (after this change):**
1. Certificate renders with:
   - Title: "Clarity Partner Agreement"
   - Subtitle: "A mutual commitment to clarity" (was "A bilateral commitment...")
   - No A-XXXX ID in header
   - PARTNER signature slot shows "Invited party" (partner name collection is P466)
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
│  My Partners          [Add a Partner?]    │
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

Heading row layout: `flex items-center justify-between`. h1 on left, button on right. Button label "Add a Partner?". Minimum touch target 44px height.

Empty state (owner):
```
┌─────────────────────────────────────────────────────┐
│  My Partners          [Add a Partner?]    │
│                                                     │
│         No agreements to show.                      │
│         [Add a Partner?]  ← centered      │
└─────────────────────────────────────────────────────┘
```

Note: the empty-state button uses the same label. Two identical buttons exist simultaneously when the list is empty — this is intentional (prominent action when nothing exists), but the heading-row instance gives owner a persistent anchor even when scrolled.

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
                                 ↑ partner slot: "Invited party"
┌──────────────────────┐           (name collection: P466)
│ ⏱ Invitation sent to │
│   email@... Waiting  │         (nothing else)
│   [Resend] [Copy]    │
└──────────────────────┘
Schedule a /live session →
```

Visual states of the pending certificate (unchanged from P422):
- Pending seal: dashed-border circle with muted logo
- Partner signature slot: dashed line with "..." ellipsis, label "Partner"
- Slot name: "Invited party" — P466 will change this once `partner_display_name` is added

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

#### "Add a Partner?" Button
- Owner with 0 agreements: button appears in heading row AND in empty state. Both are valid; no duplication risk because clicking either navigates to the same form.
- Visitor: button is not rendered. No access control logic change required — it was already owner-only.

#### Loading States
- Partners page: existing `PageSkeleton` (3 animated muted rows) covers the fetch delay. Heading row with button should render as part of the skeleton or immediately after — not deferred until data loads, to avoid layout shift.
- Create agreement form: form is synchronous after auth resolves. No additional loading state needed for the new field.
- Agreement page: existing `LoadingSkeleton` covers load. Certificate renders after data resolves.

#### Empty States
- Partners page, no agreements: existing EmptyState component. Button label updated to "Add a Partner?" to match heading row. No new empty state needed.
- Certificate, partner name: "Invited party" fallback remains in place; name collection redesign is P466.

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
- The "Add a Partner?" button must be a semantic `<button>` or `<a>` rendered via the existing `Button` component (which uses a `<button>` element internally, or `<a>` via `asChild` + `Link`). Using `Link` with `asChild` is the correct pattern to get router navigation + button ARIA role.
- `aria-label`: the button label "Add a Partner?" is descriptive enough — no additional aria-label required.
- Keyboard: Tab order is heading (not focusable) → button → first agreement row. This is the correct visual reading order.
- Focus indicator: existing `focus-visible:ring-2` from the `Button` component applies.

#### Agreement Page — Amber Block Removal
- The amber `<div>` with `Clock` icon had no explicit ARIA role. Removing it does not break any accessibility tree.
- The `CopyLinkButton` had `aria-label="Copy invitation link"` — removed with the block, no orphaned ARIA references remain.
- PendingView for the partner still shows "Review & Sign" `<Button asChild>` which retains focus-visible ring and keyboard activation.

#### Color Contrast (WCAG AA)
- "Add a Partner?" button: primary blue (`#0044CC` background, white text). Ratio ~7:1 — passes AA and AAA.
- Certificate subtitle "A mutual commitment to clarity": `text-[#1A1A1A]/60` on `#FDFBF7` background. Computed: approximately 5.5:1 — passes AA for normal text.
- Empty state muted text `text-muted-foreground`: defined by design system; within existing acceptable range.

#### Screen Reader Reading Order
- Partners page: h1 → button → list of agreement rows. Logical.
- Certificate: h2 → subtitle p → opening tagline → Your Right section → Our Promise section → The Exception section → [optional] terms → signature slots.

---

### 5. Responsive Design

#### Partners Page — Heading Row

**Mobile (320px–767px):**
- Heading row: `flex items-center justify-between`. On narrow screens the h1 ("My Partners") is short enough that the button does not wrap. If the locale produces a longer translation of "My Partners", the row may need `flex-wrap gap-2` as a fallback.
- Button: `min-h-[44px]` ensures tap target. Label "Add a Partner?" is short — fits on one line at 320px without truncation concern.
- Agreement rows: full width, no change.

**Tablet (768px–1023px):**
- Same flex layout as mobile. More horizontal space — no wrapping concern.

**Desktop (1024px+):**
- `max-w-lg` container is already constrained; heading row behaves identically to tablet.

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
| PendingView amber block | `agreement-page.tsx` | Extend | Delete block (lines 178–213 in current file) |
| PendingView schedule link | `agreement-page.tsx` | Extend | Delete link (lines 215–226 in current file) |
| LoadingSkeleton | `agreement-page.tsx` | Reuse | No change |
| TerminateDialog | `agreement-page.tsx` | Reuse | No change |
| AgreementRow (displayId shown in list) | `agreement-row.tsx` | Reuse | displayId stays visible in row — intentional, out of scope |
| PageSkeleton | `profile-connections-page.tsx` | Extend | Skeleton should represent new heading layout (h1 + button row) to prevent layout shift |
| EmptyState button | `profile-connections-page.tsx` | Extend | Label change: "New Agreement" → "Add a Partner?" |
| Page heading `<h1>` + CTA | `profile-connections-page.tsx` | Extend | Add `flex justify-between items-center` wrapper; add Button (primary) in heading row |
| Section heading `✦ Partner Agreements` | `profile-connections-page.tsx` | Extend | Remove entire `<div className="flex items-center gap-2 mb-3">` block |
| Inline CTA text link `+ New Agreement` | `profile-connections-page.tsx` | Extend | Remove; replaced by heading-row button |
| `Button` (shared UI) | `src/components/ui/button` | Reuse | Used for new heading-row CTA with default primary variant |

**Summary:** 0 New, 9 Extend (targeted modifications to existing elements), 4 Reuse (untouched).

---

#### Founder Decisions Needed

No open decisions — all scope is well-defined.

---

#### Lean Friction Audit

Changes audited against "scan for friction before value":

- Removing amber block: reduces friction (one fewer block to parse while waiting).
- Removing schedule link: reduces friction (one fewer external navigation option).
- Moving CTA to top: reduces friction (was below list, now immediately visible).

No friction additions in this feature — all changes reduce noise or move CTAs closer to the user's attention.
