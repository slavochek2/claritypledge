---
status: rejected
type: story
rank: 1000682
created_date: '2026-04-10'
tags:
  - letters
  - ux
  - recipients
  - private
delivery_stage: generate-tests
pipeline_plan:
  - create-spec
  - challenge-prd
  - ux
  - ui
  - generate-tests
  - dev
  - verify
pipeline_ran:
  - create-spec
  - challenge-prd
  - ux
  - ui
  - generate-tests
pipeline_skipped:
  - >-
    architect -- no schema changes; DB already supports multi-recipient via
    letter_deliveries table and seal_and_send_letter RPC
  - decompose -- under 5 files
uat_file: features/uat/p682.md
test_files:
  - e2e/p682-letter-multi-recipient.spec.ts
  - src/tests/p682-recipient-validation.test.ts
locked_at: '2026-04-20T09:50:02.611Z'
---

# P682: Private Letter — Multi-Recipient & Simplified Flow

## Problem

**Situation:** The letter receiver modal (`letter-receiver-modal.tsx`) presents two options: "Specific people" and "Anyone with a link." For private docs, the link option is structurally impossible — it's greyed out with a tooltip explaining why.

**Complication:** Two UX failures compound:
1. **Dead UI for private letters.** The "Anyone with a link" card is shown disabled with explanatory text. This is the anti-pattern of displaying something just to explain why you can't use it — cognitive load, visual noise, false choice where there is none.
2. **Single recipient only.** The modal collects one email + name pair. But the underlying system already supports multiple recipients: `letter_deliveries` is one-row-per-recipient, `seal_and_send_letter` RPC loops over a deliveries array, and `send-letter-emails` edge function sends one email per delivery row. The UI is the bottleneck.

**Question:** How do we simplify the private letter recipient flow (remove dead options) and unlock multi-recipient support that the backend already provides?

## Appetite

- **Blast radius:** Medium — changes the receiver modal for private letter compose flow. Public doc compose flow also affected (mode selector still shown but could be simplified). The add-recipient mode (P664) is a separate code path in the same component.
- **Reversibility:** Fully reversible — UI-only changes, no schema or RPC modifications. `git revert` restores previous behavior.
- **Decision density:** Low — UX direction established in conversation (ASCII flows approved). One open question: whether to also simplify the public doc flow in the same pass.

## Solution

### 1. Skip mode selection for private docs

When `isPrivateDoc === true` in compose mode, skip the "Specific people" vs "Anyone with a link" selector entirely. Go straight to the recipient form. The modal title stays "Who is your letter for?" — the context is clear without the mode cards.

### 2. Multi-recipient form with "Add another person"

Replace the single email+name input with a dynamic list of recipient rows:

- Each row is a visually grouped card with two separate input fields: Email and Full name
- Desktop: email and name side-by-side within each card
- Mobile: email and name stacked within each card
- "+ Add another person" link below the last row — appends a new empty card, auto-focuses email field
- Each filled row (except the last/only one) has a ghost `X` button (lucide `X`, `h-4 w-4`, `text-muted-foreground`) to remove that person — consistent with the app's existing removal pattern (DocBlockControls, dialog close)
- First row has no `X` when it's the only row (minimum one recipient required)
- Continue validates all rows: each must have valid email + non-empty name. Self-send check per row.

### 3. Wire multi-recipient through compose flow

`ReceiverSetupResult.emails` is already `string[]`. The compose page (`letter-compose-page.tsx`) already builds a `deliveriesArray` from this. Changes needed:
- Modal returns multiple `{email, name}` pairs instead of a single `receiverName` string
- `ReceiverSetupResult` interface updated: replace `receiverName: string` with `recipients: Array<{email: string, name: string}>`
- `handleSeal()` in compose page builds `deliveriesArray` from the new structure
- Email lookup (debounced) runs per-row, auto-filling name when account found
- Remove existing comma-separated email parsing (`emailsInput.split(',')`) — rows replace it

### Prediction walk with multiple recipients

The prediction walk already handles this (line 51-53 of `letter-prediction-walk.tsx`):
- Single recipient: "How well do you believe **Alex Rivera** understands your story?"
- Multiple recipients (or no name): "How well do you believe **readers** will understand your story?"

Pass `receiverName` as empty string when 2+ recipients → existing fallback activates. No prediction walk changes needed.

### 4. Soft recipient limit of 20

"+ Add another person" link disappears after 20 rows. No error message, the link simply stops appearing. 20 is generous for the target use case (friends entering a workshop, co-founder + advisors). The modal scrolls naturally via standard `overflow-y: auto`.

## UX Design

### User Flow

**Entry:** User clicks "Send letter" from a private doc's compose view → receiver modal opens.

**Private doc flow (changed):**
1. Modal opens with title "Who is your letter for?" — no mode selector, recipient form shown directly
2. One empty recipient card visible (email + full name fields)
3. User types email → 400ms debounce → lookup fires
4. If account found → name auto-fills, name field becomes read-only
5. If not found → user types name manually
6. User clicks "+ Add another person" → new empty card appends, email field auto-focused
7. Repeat steps 3-6 for additional recipients (up to 20)
8. User clicks "Continue" → all rows validated → proceeds to prediction walk
9. Prediction walk: single recipient → personalized prompt with their name; 2+ recipients → "readers" generic prompt (existing fallback)

**Public doc flow (unchanged):**
1. Modal opens → mode selector shown ("Specific people" / "Anyone with a link")
2. User picks mode → proceeds as before
3. No multi-recipient support for public docs in this pass

**Add-recipient mode (P664, unchanged):**
- Post-seal flow, separate code path — not affected by these changes

### Screen Designs

**Recipient form (private doc compose):**

```
┌─────────────────────────────────────────────┐
│  Who is your letter for?                 X  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  [Email address    ] [Full name   ] │    │
│  │  hint text if applicable            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌────────────────────────────────── X ─┐   │
│  │  [Email address    ] [Full name   ]  │   │
│  │  hint text if applicable             │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  + Add another person                       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │           Continue                  │    │
│  └─────────────────────────────────────┘    │
│  Each person receives their own personal    │
│  invitation.                                │
└─────────────────────────────────────────────┘
```

**Layout rules:**
- Each recipient is a visually grouped card (light border, rounded)
- Desktop (`sm:` breakpoint and above): email + name fields side-by-side within card
- Mobile (below `sm:`): email + name fields stacked within card
- X removal button: top-right corner of each card, except the sole remaining row
- "+ Add another person" link: below the last card, disappears at 20 rows
- "Continue" button: full-width, primary style (blue CTA)
- Footer hint: below Continue button, muted text

### Edge Cases & UI States

**Per-recipient-row states:**

| State | Email field | Name field | Hint text | X button |
|-------|------------|------------|-----------|----------|
| Empty (only row) | Placeholder "Email address" | Placeholder "Full name" | None | Hidden |
| Empty (2+ rows) | Placeholder "Email address" | Placeholder "Full name" | None | Visible |
| Typing email | User input, no border change | Editable | None | Visible (if 2+ rows) |
| Looking up | User input + spinner indicator | Editable | None | Visible (if 2+ rows) |
| Account found | User input | Auto-filled, read-only | "Using their registered name" (muted) | Visible (if 2+ rows) |
| Not found | User input | Editable | "No account — they'll be invited to join" (muted) | Visible (if 2+ rows) |
| Self-send error | Red border | Unchanged | "You can't send a letter to yourself" (red) | Visible (if 2+ rows) |
| Duplicate email | Red border | Unchanged | "Already added" (red) | Visible (if 2+ rows) |
| Validation error (on Continue) | Red border if invalid/empty | Red border if empty | Field-specific message | Visible (if 2+ rows) |

**Form-level states:**

- **Continue clicked with errors:** Red borders appear on all invalid fields. Scroll to first error row if offscreen. No toast — inline errors only.
- **All rows removed except one:** Last row loses X button. No confirmation needed for removal (low-cost, easily re-added).
- **20 rows reached:** "+ Add another person" link disappears. No error message. User can still edit/remove existing rows.
- **Modal taller than viewport:** Dialog content scrolls via `overflow-y: auto` with max-height constraint. Header and Continue button remain accessible.
- **Rapid row addition:** Each new row appends below existing rows. Email field auto-focused. No animation required.

**Validation rules (on Continue):**
- Every row must have: valid email format + non-empty name
- Self-send check: per row, against current user's email
- Duplicate check: across all rows, "Already added" on the later duplicate
- Empty rows at bottom: if user added a row but left it blank, remove silently on Continue (don't block)

### Accessibility

- **Tab order:** Email → Name → X (if visible) → next row's Email → ... → "+ Add another person" → Continue
- **Screen reader:** Each card announced as "Recipient [N] of [total]". X button labeled "Remove recipient [N]". "+ Add another person" is a button with clear label. Footer hint is `aria-live="polite"` for dynamic changes.
- **Keyboard:** Enter in last name field → focus moves to Continue (not adding a new row). Tab from last field in last row → "+ Add another person" link. Escape closes modal (existing behavior).
- **Focus management:** When row removed, focus moves to the email field of the previous row (or first row if removed row was first). When row added, focus moves to new row's email field.
- **Error announcement:** Validation errors announced via `aria-live="assertive"` on the error hint text. Screen reader announces "Error: [message]" per invalid row.
- **Color contrast:** Red error text on white background meets WCAG AA (4.5:1). Muted hint text meets 4.5:1.

### Responsive Design

**Mobile (below `sm:` / 640px):**
- Email and name fields stacked within each card (full width)
- X button: top-right of card, 44px touch target
- "+ Add another person" link: full width, 44px touch target
- Continue button: full width
- Modal: near-full-screen on mobile (existing behavior)
- With 5+ rows: scrollable within dialog, Continue remains reachable at bottom

**Desktop (`sm:` breakpoint / 640px+):**
- Email and name fields side-by-side within each card (equal width)
- X button: right edge of card row
- Dialog: centered, max-width `max-w-lg` (existing)
- With 5+ rows: dialog scrolls internally, doesn't overflow viewport

### Visual Context

- **Density intent:** Spacious — this is a pre-send moment where the user is deciding who receives their personal letter. Each recipient deserves clear visual separation (cards, not a dense list). The user is not scanning data; they're assembling a small group with care.
- **Visual reference:** Should feel like the existing single-recipient form in the same modal, expanded to multiple cards. The card grouping pattern matches the mode selector cards (light border, rounded) but used for recipient entries instead of mode choices.

## Acceptance Criteria

- [ ] Private doc compose: modal opens directly to recipient form (no mode selector)
- [ ] Public doc compose: mode selector still shown (no change to public flow)
- [ ] User can add multiple recipients via "+ Add another person"
- [ ] Each recipient row has separate Email and Full name fields
- [ ] Desktop: fields side-by-side within each card. Mobile: stacked
- [ ] X button removes a recipient row (not shown on last remaining row)
- [ ] Email lookup runs per-row with existing debounce pattern
- [ ] Duplicate email validation across rows
- [ ] Self-send validation per row
- [ ] Continue validates all rows before proceeding
- [ ] Each recipient receives their own invitation email (existing backend behavior)
- [ ] Add-recipient mode (P664) is unaffected

## Risks / Non-Goals

### Risks
- **Public doc mode selector regression.** Changing the modal affects both private and public paths. Mitigation: keep mode selector rendering unchanged for `isPrivateDoc === false`; add E2E test for public compose flow.
- **Email lookup performance with many rows.** Each row triggers an independent lookup. Mitigation: existing 400ms debounce is sufficient; lookups are lightweight single-row queries. No change needed unless >10 rows common (it won't be).
- **Mobile scroll UX with many rows.** Modal could grow tall. Mitigation: DialogContent already uses max-height with overflow. Test with 5 rows on mobile viewport.

### Non-Goals
- Do NOT change the public doc compose flow (mode selector stays for public docs)
- Do NOT modify the add-recipient mode (P664) — it's a separate post-seal flow
- Do NOT add rate limiting to email sending — pre-existing gap, separate infrastructure concern
- Do NOT change database schema or RPCs — backend already supports multi-recipient
- Do NOT add batch/CSV import — "+ Add another person" is sufficient for the 1-5 person use case
- Do NOT simplify public doc flow in this spec (separate concern if desired later)

## Done-When

- [ ] Private doc: receiver modal skips mode selector, shows recipient form directly
- [ ] User can add 3+ recipients and all receive invitation emails after sealing
- [ ] Removing a recipient row works without page errors
- [ ] Desktop layout: email + name side-by-side per row
- [ ] Mobile layout: email + name stacked per row
- [ ] Existing E2E tests for letter composition still pass
- [ ] Public doc compose flow unchanged (mode selector present)
- [ ] Add-recipient mode (P664) unchanged

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Add link text | "+ Add another person" | Below last recipient row |
| Remove icon | `X` from lucide, ghost button, `h-4 w-4 text-muted-foreground` | Top-right of each card (except last) |
| Card style | Light border, rounded, groups email+name as one person | Each recipient row |
| Footer text | "Each person receives their own personal invitation." | Below Continue button |
| Desktop layout | Email + Full name inputs side-by-side within card | `sm:` breakpoint |
| Mobile layout | Email + Full name inputs stacked within card | Below `sm:` |
| Duplicate error | "Already added" | On duplicate email row |
| Min rows | 1 (no X on sole row) | Always |
| Max rows | 20 (add link disappears) | Soft cap |

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Prediction walk prompt breaks with multi-recipient — whose name? | Use existing "readers" fallback (line 51-53 of `letter-prediction-walk.tsx`). Single recipient stays personalized. | Code already handles this — `receiverName` empty triggers generic prompt. No design gap. |
| 2 | /challenge-prd | [WARN] No demand evidence for 3+ recipients | Confirmed: workshop entry point (send to friends), co-founder + advisor (3-person case) | Founder-stated use case. Low marginal cost since backend exists. |
| 3 | /challenge-prd | [WARN] Existing comma-separated email parsing applies one name to all | Remove comma parsing — rows replace it cleanly. Each person gets own name field. | Comma hack was partial implementation; row UI is the proper solution. |
| 4 | /challenge-prd | [WARN] No recipient limit | Soft cap at 20 — "+ Add another person" disappears. No error message. | Pragmatic first layer. Proper email rate limiting is a separate infra spec. |
| 5 | /challenge-prd | [WARN] Cleanup bundled with feature expansion | Keep bundled — same component, same code path. Splitting creates more overhead. | Prediction walk resolved; no remaining design gaps justify splitting. |
| 6 | /challenge-prd | [NOTE] send-letter-emails has zero rate limiting (bot risk) | Out of scope — pre-existing gap. Noted as known risk in Non-Goals. | Applies regardless of P682. |

## Files Modified

**Source (2-3 files):**
- `src/app/components/letters/letter-receiver-modal.tsx` — main changes (multi-row form, skip mode selector for private)
- `src/app/pages/letter-compose-page.tsx` — update `ReceiverSetupResult` handling to pass multiple recipients
- `src/app/types/index.ts` — update `ReceiverSetupResult` type if moved here (currently in modal file)

## Implementation Notes

- `ReceiverSetupResult` is currently defined in `letter-receiver-modal.tsx`. The `receiverName: string` → `recipients: Array<{email: string, name: string}>` change is the key interface update.
- The `handleSeal()` function in `letter-compose-page.tsx` already builds `deliveriesArray` from `receiverEmails` state — just needs to iterate the new recipients array.
- Email lookup logic (`handleEmailChange`) needs to be per-row. Consider extracting a `RecipientRow` component with its own lookup state.
- Reuse existing `Input` from `@/components/ui/input` and `Button` from `@/components/ui/button` — no new UI primitives needed.

## Component Strategy

### Component Inventory (relevant subset)

**Design system primitives (`src/components/ui/`):**
- `dialog.tsx` — Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter. DialogContent accepts className for overrides. Has `hideCloseButton` prop. Close button: lucide `X`, `h-4 w-4`, absolute positioned.
- `button.tsx` — Button with CVA variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (h-9 w-9).
- `input.tsx` — Input component. `h-9`, `rounded-md`, `border-input`, focus ring via `focus-visible:ring-1 ring-ring`.
- `label.tsx` — Label (Radix-based).

**Feature components (`src/app/components/`):**
- `letters/letter-receiver-modal.tsx` — the component being modified. Currently handles compose + add-recipient modes.
- `letters/letter-prediction-walk.tsx` — downstream consumer of `receiverName`. Already has "readers" fallback.
- `docs/doc-block-controls.tsx` — reference for ghost X removal pattern: `Button variant="ghost" size="icon"` with `min-w-[44px] min-h-[44px]`, lucide `X` `h-4 w-4 text-muted-foreground`.

### Component Map

| Element | Classification | File / Notes |
|---------|---------------|--------------|
| Modal shell | **Reuse** | `dialog.tsx` — Dialog + DialogContent + DialogHeader + DialogTitle. Add `max-h-[85vh] overflow-y-auto` to DialogContent className for scroll support |
| Email input | **Reuse** | `input.tsx` — `type="email"`, same as current. Red border via conditional `border-red-500` class |
| Name input | **Reuse** | `input.tsx` — `type="text"`, same as current. Read-only state via `readOnly` prop + `bg-muted text-muted-foreground` |
| Continue button | **Reuse** | `button.tsx` — `className="bg-blue-500 hover:bg-blue-600 text-white w-full"` (match existing, add `w-full`) |
| Remove (X) button | **Reuse** | `button.tsx` — `variant="ghost" size="icon"` with `min-w-[44px] min-h-[44px]`, lucide `X` `h-4 w-4 text-muted-foreground`. Matches `doc-block-controls.tsx` pattern exactly |
| Spinner indicator | **Reuse** | lucide `Loader2` with `animate-spin` — already used in current modal (line 265) |
| Recipient card | **New** | `RecipientRow` — extracted as internal component within `letter-receiver-modal.tsx`. Not shared — feature-specific. See justification below |
| "+ Add another person" link | **Reuse** | `button.tsx` — `variant="link"` with `text-sm`. No new component needed |
| Hint/error text | **Reuse** | Plain `<p>` with `text-sm text-muted-foreground` (hints) or `text-sm text-red-500` (errors). Existing pattern in current modal |
| Mode selector cards | **Reuse** (unchanged) | Existing `<button>` cards in modal — only rendered when `!isPrivateDoc`. No changes needed |

**Why `RecipientRow` is New:** Each row encapsulates its own email lookup state (debounce timer, lookup result, loading flag, name-lock state). The current modal manages this as flat component state for a single recipient. With N recipients, each row needs independent state — extracting a `RecipientRow` component is the cleanest way to isolate per-row lookup lifecycle. It lives inside `letter-receiver-modal.tsx` as a non-exported component (not in `shared/` or `ui/`) because it's tightly coupled to this modal's data flow and not reused elsewhere.

### Composition Tree

```tsx
<LetterReceiverModal mode="compose" isPrivateDoc={true} ...>
  <Dialog>
    <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>"Who is your letter for?"</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Mode selector — HIDDEN when isPrivateDoc */}

        {/* Recipient rows */}
        {recipients.map((r, i) => (
          <RecipientRow                          // ← New internal component
            key={r.id}
            index={i}
            email={r.email}
            name={r.name}
            isOnly={recipients.length === 1}
            currentUserEmail={user.email}
            allEmails={allEmails}               // for duplicate check
            onUpdate={(field, value) => ...}
            onRemove={() => ...}
          />
        ))}

        {/* Add another person — hidden at 20 */}
        {recipients.length < 20 && (
          <Button variant="link" className="text-sm p-0 h-auto"
                  onClick={addRecipient}>
            + Add another person
          </Button>
        )}

        {/* Submit area */}
        <Button className="bg-blue-500 hover:bg-blue-600 text-white w-full"
                onClick={handleSubmit} disabled={!canProceed}>
          Continue
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Each person receives their own personal invitation.
        </p>
      </div>
    </DialogContent>
  </Dialog>
</LetterReceiverModal>
```

**`RecipientRow` internal structure:**
```tsx
function RecipientRow({ index, email, name, isOnly, currentUserEmail, allEmails, onUpdate, onRemove }) {
  // Per-row state: isLookingUp, lookupResult, isNameLocked, emailError
  // 400ms debounced email lookup (same logic as current handleEmailChange)

  return (
    <div className="relative rounded-lg border border-border p-3 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:items-start">
      {/* Remove button — top-right, hidden if isOnly */}
      {!isOnly && (
        <Button variant="ghost" size="icon"
                className="absolute -top-2 -right-2 min-w-[44px] min-h-[44px]"
                aria-label={`Remove recipient ${index + 1}`}
                onClick={onRemove}>
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}

      {/* Email field */}
      <div className="space-y-1">
        <Input type="email" placeholder="Email address" value={email}
               onChange={...} className={emailError ? 'border-red-500' : ''} />
        {/* Hint/error below email */}
      </div>

      {/* Name field */}
      <div className="space-y-1">
        <Input type="text" placeholder="Full name" value={name}
               readOnly={isNameLocked}
               className={isNameLocked ? 'bg-muted text-muted-foreground' : ''} />
        {/* Hint below name */}
      </div>
    </div>
  );
}
```

### Visual Specification

**Visual hierarchy:**
1. Primary: Dialog title "Who is your letter for?" → `text-lg font-semibold leading-none tracking-tight` (from DialogTitle)
2. Secondary: Input fields with placeholder text → `text-base md:text-sm text-foreground` (from Input), placeholders `text-muted-foreground`
3. Tertiary: Hint text below fields → `text-xs text-muted-foreground` (registered name hint), `text-sm text-red-500` (errors)
4. Action: Continue button → `bg-blue-500 text-white` (existing pattern), footer hint → `text-xs text-muted-foreground`

**Emotional register:** Calm — this is a reflective pre-send moment. Spacing is generous (`space-y-4` between cards, `p-3` inside cards). No urgency indicators. No animations on row add/remove (instant DOM update — immediate feedback over flair).

**Negative constraints:**
- NOT a form wizard → no step indicators, no progress bar, no "Step 1 of 3"
- NOT a contact picker/address book → no search-with-dropdown, no avatar display, no contact cards
- NOT a dense data entry form → no label-less inputs, no compact grid. Each person gets a visually separated card

**Spacing per zone:**
- Dialog padding: `p-6` (from DialogContent)
- Between header and form: `pt-2` (existing pattern)
- Between recipient cards: `space-y-4`
- Inside each card: `p-3`, fields use `space-y-2` (stacked mobile) or `gap-3` (side-by-side desktop)
- Between last card and "+ Add" link: inherits from `space-y-4`
- Between "+ Add" and Continue button: inherits from `space-y-4`
- Below Continue to footer text: `mt-2`

**Animation/transition:** No animation — row additions and removals are instant. The dialog's own open/close animation (`animate-in`/`animate-out` from DialogContent) is sufficient. Adding per-row animation would suggest weight where there is none (adding a person is a lightweight action).

**Implementation refinements:**
- Card border: `border border-border rounded-lg` — uses semantic `border` token, matches design system `--radius` via `rounded-lg`
- Input focus: existing `focus-visible:ring-1 ring-ring` from Input component
- Error border: `border-red-500` on Input className (overrides `border-input`)
- Read-only name: `bg-muted text-muted-foreground` — semantic tokens, not hardcoded gray
- X button hover: `hover:bg-accent` from ghost variant — consistent with dialog close button

### Extraction Plan

No extraction needed. The only new component (`RecipientRow`) is feature-specific and non-exported. The existing modal has no duplicated patterns that warrant extraction — the email lookup logic is currently used once and will be moved into `RecipientRow` as a refactor, not a duplication.

### Challenge Notes

> **`/ui` observes on `/ux` — DialogContent max-height**
> The UX section specifies "Modal taller than viewport: Dialog content scrolls via `overflow-y-auto` with max-height constraint." The current `DialogContent` in `dialog.tsx` has NO `max-height` — it relies on fixed centering (`top-[50%] translate-y-[-50%]`) which can push content off-screen.
>
> **Resolution:** Apply `max-h-[85vh] overflow-y-auto` as a className override on the `DialogContent` in `letter-receiver-modal.tsx` only — NOT modifying the shared `dialog.tsx` primitive. This is a per-usage override, not a design system change. 85vh (not 90vh) leaves room for the dialog's shadow and mobile safe areas.
>
> **Blocking:** No — the override is straightforward and scoped to this modal.

## Test Coverage Strategy

**Test pyramid:**
- 30 unit tests — validation logic (email format, duplicate, self-send, row management, array building)
- 13 E2E tests — user flows (mode selector skip, multi-row CRUD, validation errors, successful flow)
- 2 smoke tests — compose page boots for private + public docs
- 19 UAT scenarios — manual verification (layout, lookup, scroll, prediction walk, email delivery)

**Files:**
- `src/tests/p682-recipient-validation.test.ts` — 30 unit tests (all passing)
- `e2e/p682-letter-multi-recipient.spec.ts` — 13 E2E tests
- `e2e/p682-smoke.spec.ts` — 2 smoke tests
- `features/uat/p682.md` — 19 UAT scenarios

**What's tested:**
- Private doc: modal skips mode selector (E2E + UAT-1)
- Public doc: mode selector unchanged — regression guard (E2E + UAT-2)
- UI Contract strings tested verbatim: title, footer, placeholders, error messages (E2E)
- Multi-row CRUD: add, remove, X button visibility rules (E2E + unit)
- Validation: duplicate "Already added", self-send, empty name, 20-row cap (E2E + unit)
- Recipient array building with normalization (unit)
- Compose page boot without errors (smoke)

**What's NOT tested (and why):**
- Accessibility automation — no axe-playwright setup; covered by UAT
- Email lookup debounce — needs fixture user; covered by UAT-10/11
- CSS responsive layout — breakpoint assertion fragile; covered by UAT-12/13
- Auto-focus on new row — Playwright focus state unreliable; covered by UAT-4
- Modal scroll with 5+ rows — visual verification needed; covered by UAT-19
- P664 add-recipient mode — existing P664 tests cover it; UAT-16 is manual
- Backend email delivery — pre-existing gap, out of scope; UAT-15 manual DB check
