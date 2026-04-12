---
status: qa
type: task
rank: 1000688.0
created_date: '2026-04-11'
tags: [letters, refactor, recipients, unification]
delivery_stage: verify
pipeline_ran: [create-spec, ux, dev, verify]
---

# P688: Unify Recipient Input via RecipientRow

## Problem

**Situation:** P682 (just shipped) introduced a `RecipientRow` internal component inside `letter-receiver-modal.tsx` that handles recipient entry for the private-letter compose flow: email + full name, debounced user lookup, name-locking when an account is found, self-send and duplicate checks, inline validation hints. It's the correct UX for "identify a recipient."

**Complication:** Two other places in the app still enter letter recipients on separate, older code paths:

1. **`LetterReceiverModal` `mode="add-recipient"`** (used by Sent tab → "Add recipient(s)"): still uses the old flat component state (`emailsInput`, `receiverName`, `isReceiverNameLocked`, `lookupResult`, lines 303-310) and the old single-recipient form (lines 601-660). Single recipient only. Lookup logic is duplicated from `RecipientRow` with subtle differences.
2. **`LetterSealConfirmation`** (public-doc "+ Also invite someone by email" flow): has its own inline HTML `<input type="email">` (lines 111-137). No full name field at all, no user lookup. The invitation goes out addressed to nobody.

This produces user-visible consistency bugs (sometimes you enter a name, sometimes you don't) and agent-level maintenance bugs (fixing a lookup issue in one path doesn't fix the others).

**Question:** How do we make `RecipientRow` the single source of truth for recipient entry across all letter flows without touching backend or regressing the P682 compose flow?

## Appetite

- **Blast radius:** Medium — touches two components in the private-letters flow. The P682 compose path must remain identical (regression risk). Sent tab's "Add recipient(s)" UX changes (gains multi-row capability). Public-doc seal confirmation UX changes (gains name field + lookup + proper dialog).
- **Reversibility:** Fully reversible — UI-only refactor, no schema or RPC changes. `git revert` restores previous behavior.
- **Decision density:** Zero — the component to use and the call sites to update are both pinned. No founder decisions needed. Visual-hierarchy fix on seal confirmation is a small polish ride-along with one obvious direction.

## Solution

### 1. `RecipientRow` becomes the canonical recipient input

Lift `RecipientRow` + its supporting `RecipientState` type and `createEmptyRecipient()` helper out of the compose-only path so both modes of `LetterReceiverModal` use it. No new file needed — stay internal to `letter-receiver-modal.tsx` unless natural extraction emerges during `/dev`.

### 2. Refactor `mode="add-recipient"` to use `RecipientRow`

- Delete old flat state (`emailsInput`, `receiverName`, `isReceiverNameLocked`, `lookupResult`, `isLookingUp`, `emailError`, the single-recipient `handleEmailChange`, `parsedEmails`).
- Delete the old single-recipient form JSX (lines 601-660).
- Drive add-recipient mode from the same `recipients: RecipientState[]` state used by compose. Skip the mode selector (already the case).
- Submit handler loops `addRecipientToSealed(letterId, row.email, row.name)` per filled row. Soft cap at 20 rows (matches P682 convention).
- Success toast summarizes: "Invitation sent to N people" (or "Invitation sent to {email}" if N=1).
- Error handling: if one row fails, continue with the rest and report which ones failed; don't abort the whole batch.

### 3. Replace inline input in `LetterSealConfirmation`

- Delete the inline `<input>` + "Send" / "Cancel" block (lines 111-137) and the `inviteEmail`, `inviting`, `showInvite` state.
- Keep the entry affordance: "+ Also invite someone by email" button. Clicking it opens `LetterReceiverModal` in `mode="add-recipient"` with the existing `letterId`.
- On successful submit, the modal closes itself (existing behavior); the seal confirmation screen stays visible.

### 4. Visual hierarchy fix on `LetterSealConfirmation` (public docs)

Ride-along polish justified by the screenshots: the shareable link is the primary action on this screen, but is currently a small muted gray box while "Back to Doc" is the most visually present button. Reorder hierarchy:

- **Shareable link:** larger, more prominent (full-width card, readable font, clear copy button).
- **Primary CTA:** "Back to Doc" becomes the primary blue button (it's the user's next step after sharing).
- **Secondary:** "+ Also invite someone by email" stays as a text link — it's a tertiary "and also" action.

Exact strings and spacing decided in `/ux`.

### Non-impact on P682 compose flow

The compose flow already uses `RecipientRow`. Its behavior must be byte-identical after this refactor. P682's E2E tests (`e2e/p682-letter-multi-recipient.spec.ts`, `e2e/p682-smoke.spec.ts`) are the regression guard and must continue to pass unchanged.

## Risks / Non-Goals

### Risks

- **P682 regression.** The compose flow shares code with add-recipient after this refactor. Mitigation: P682's existing E2E suite runs as a regression gate; any refactor that breaks it fails the /dev step. Keep the `useMultiRecipient`/submission branching in `handleSubmit` conceptually separate — compose batches into `sealLetter`, add-recipient loops `addRecipientToSealed`.
- **Partial-failure UX in add-recipient batch.** Looping N `addRecipientToSealed()` calls can have some succeed and some fail. Mitigation: surface per-row errors in the toast ("Sent to 2 people, failed: [email]") rather than all-or-nothing.
- **Seal confirmation modal-over-screen stacking.** Opening `LetterReceiverModal` on top of `LetterSealConfirmation` must not regress focus management or escape-to-close. Mitigation: the modal is already a `Dialog` primitive with proper focus trap and escape handling; no new behavior.
- **Old single-recipient tests.** Any existing test that asserts the old `emailsInput`/`receiverName` DOM structure will break. Mitigation: update tests to assert the `RecipientRow` structure (same selectors P682 uses).

### Non-Goals

- Do NOT change `addRecipientToSealed()` or add a batch RPC. Loop per row client-side (N≤20 is cheap).
- Do NOT change any database schema, migration, or RLS policy.
- Do NOT modify the P682 compose flow behavior. It must remain byte-identical.
- Do NOT simplify the public-doc mode selector ("Specific people" / "Anyone with a link"). Separate concern.
- Do NOT add rate limiting to `send-letter-emails`. Pre-existing gap, out of scope.
- Do NOT extract `RecipientRow` to a shared `ui/` or `shared/` directory unless natural extraction emerges during `/dev`. It's still feature-specific.
- Do NOT change `LetterSealConfirmation` behavior for private docs (only public docs show the shareable-link block and the invite affordance).
- Do NOT add any new analytics events (reuse existing `letter_created` / `letter_email_lookup`).

### Alternatives Considered

- **Add a backend batch RPC `add_recipients_to_sealed_letter(letterId, recipients[])`.** Rejected: one round-trip per recipient is negligible for N≤20, and introducing a new RPC creates a second code path to keep in sync with `add_recipient_to_sealed_letter`. Looping client-side is simpler and fully reversible.
- **Keep the inline input in `LetterSealConfirmation` but add a name field.** Rejected: duplicates `RecipientRow` logic yet again; contradicts the unification goal. If we're touching this file we should land on the canonical component.
- **Extract `RecipientRow` to `src/app/components/shared/`.** Rejected for now: it's used in exactly one feature (letters). Premature generalization. Revisit if a third consumer appears.
- **Make `RecipientRow` a fully-presentational component with state lifted to the parent.** Rejected: the parent would then own the per-row debounce timer, lookup lifecycle, and name-lock state for N rows — that's exactly what `RecipientRow` was extracted to encapsulate in P682.

## Done-When

- [x] Sent tab → "Add recipient(s)" opens a dialog that uses `RecipientRow` (email + name fields, debounced lookup, name-lock on match).
- [x] Sent tab can add multiple recipients at once via "+ Add another person".
- [x] Each row in add-recipient mode fires `addRecipientToSealed()` on submit; success toast summarizes the batch.
- [x] `LetterSealConfirmation` no longer contains an inline `<input>` for email invite — it opens `LetterReceiverModal` instead.
- [x] `LetterSealConfirmation` visual hierarchy: shareable link is the most prominent element, "Back to Doc" is the primary button, "+ Also invite" is a text-link secondary action.
- [x] `letter-receiver-modal.tsx` has exactly one recipient-entry code path (the `RecipientRow`-based one). Old flat state and old single-recipient JSX are deleted.
- [x] P682 E2E suite (`e2e/p682-letter-multi-recipient.spec.ts`, `e2e/p682-smoke.spec.ts`) passes unchanged.
- [x] New or updated E2E coverage asserts: (a) Sent tab multi-recipient add flow end-to-end, (b) seal confirmation invite via modal end-to-end, (c) partial-failure batch error reporting.
- [x] Manual verification on private doc compose flow: behavior unchanged from P682.

## Acceptance Criteria

- [x] One canonical recipient input component (`RecipientRow`) used across compose, add-recipient, and seal-confirmation invite flows.
- [x] Users can enter both email AND full name (with lookup) in every place where they invite a letter recipient — no exceptions.
- [x] Sent tab "Add recipient(s)" supports adding multiple recipients in one dialog submission.
- [x] Seal confirmation shareable link is visually primary; "Back to Doc" is the primary button.
- [x] No regression in private-doc compose flow (P682).
- [x] Code diff shows net deletion of duplicated recipient-entry logic.

## UX Design

This spec changes two user-facing surfaces. A third (the private-doc compose flow) is explicitly unchanged and must remain byte-identical to P682. The UX below focuses on the two changed surfaces and how they inherit from P682's `RecipientRow` pattern.

### User Flows

**Flow A — Sent tab "Add recipient(s)" (multi-recipient post-seal):**

1. **Entry.** User is on the Letters page, Sent tab. A sealed letter card shows recipients. User opens the card's dropdown menu and selects "Add recipient(s)".
2. **Modal opens.** `LetterReceiverModal` opens in add-recipient mode. Title: "Add recipient(s)". The body shows one empty recipient row (email + full name fields) identical to the compose flow.
3. **Enter recipients.** User types an email → 400ms debounce → lookup fires. If an account is found, the name auto-fills and locks; otherwise the user types the name manually. Hint text appears below the email field ("Using their registered name" or "No account — they'll be invited to join").
4. **Add more (optional).** User clicks "+ Add another person" to append a new empty row. Repeat steps 3–4 up to 20 rows.
5. **Submit.** User clicks the primary button. Button label reflects count: "Send Invitation" (1 row) or "Send N Invitations" (2+ rows).
6. **Batch send.** Each filled row fires `addRecipientToSealed(letterId, email, name)` in sequence. Rows are processed independently — one failure does not abort the others.
7. **Exit.**
   - **All succeeded:** Toast "Invitation sent to Alex Rivera" (1 row) or "Invitations sent to 3 people" (2+). Modal closes. Sent tab delivery list refreshes; new recipients appear in the expanded card view.
   - **Partial success:** Modal stays open. Rows that succeeded are removed from the form; rows that failed remain with a red error hint below the email field showing the failure reason. Toast: "Sent 2 of 3 invitations. Fix the rows marked in red and try again." User can retry failed rows or cancel.
   - **All failed:** Modal stays open. Every row shows a red error hint. Toast: "No invitations sent. Check errors and try again."
8. **Cancel.** User presses Escape or clicks the dialog close button. Modal closes, no invitations sent.

**Flow B — Seal confirmation "invite someone by email" (public doc only):**

1. **Entry.** User has just sealed a public-doc letter. They land on `LetterSealConfirmation`.
2. **See the shareable link prominently.** The shareable link is the hero element of this screen — it is the primary thing the user came here for. The URL is displayed in a full-width card with a visible copy affordance.
3. **Copy link.** User clicks the copy button next to the link. Inline confirmation (checkmark icon replaces copy icon for 2 seconds) + toast "Link copied to clipboard".
4. **Primary exit: Back to Doc.** Below the link, the user sees "Back to Doc" rendered as the primary CTA (blue primary button). Most users take this path — they copy the link, then return to the doc to share it elsewhere.
5. **Secondary exit: invite by email.** Below the primary button, a text link "+ Also invite someone by email" is available as a tertiary action for users who want an email-delivered invitation in addition to the link.
6. **Open invite modal.** Clicking the text link opens `LetterReceiverModal` in add-recipient mode over the seal confirmation screen. The `letterId` of the just-sealed letter is passed through.
7. **Enter recipient(s).** User follows Flow A steps 3–6 inside the modal. They can add one or multiple recipients.
8. **Success exit.** Modal closes. The user remains on the seal confirmation screen (not redirected anywhere). A toast confirms the invitations. The user can then click "Back to Doc" when they're done.
9. **Cancel.** Modal closes without sending. User remains on seal confirmation.

**Flow C — Private-doc compose (unchanged, regression guard only):**

1. User clicks "Send letter" on a private doc → `LetterReceiverModal` opens in compose mode.
2. Modal opens directly to the recipient form (no mode selector, per P682).
3. User follows the multi-recipient entry flow from P682 (identical).
4. Continue → prediction walk → seal.
5. **Constraint:** This flow must be byte-identical to P682 after this refactor. The P682 E2E suite is the regression guard.

### Screen Designs

**Screen 1 — Sent tab add-recipient dialog (changed):**

```
┌─────────────────────────────────────────────┐
│  Add recipient(s)                         X │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  [Email address   ] [Full name    ] │    │
│  │  hint text if applicable            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  + Add another person                       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │        Send Invitation              │    │  ← single row
│  └─────────────────────────────────────┘    │
│                                             │
│  Each person receives their own personal    │
│  invitation.                                │
└─────────────────────────────────────────────┘

With 3 recipients:

┌─────────────────────────────────────────────┐
│  Add recipient(s)                         X │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  [alice@example.com] [Alice Chen ]  │    │
│  │  Using their registered name        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──────────────────────────────── X ──┐    │
│  │  [bob@example.com  ] [Bob Ray    ]  │    │
│  │  No account — they'll be invited    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──────────────────────────────── X ──┐    │
│  │  [carol@exampl... ] [Carol West  ]  │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  + Add another person                       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │      Send 3 Invitations             │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Each person receives their own personal    │
│  invitation.                                │
└─────────────────────────────────────────────┘
```

**Layout rules (identical to P682 compose):**
- Dialog: centered, `sm:max-w-md`, `max-h-[85vh]`, `overflow-y-auto` for long lists.
- Each recipient row is a visually grouped card with email and name fields. Desktop: side-by-side. Mobile: stacked.
- "X" remove button: top-right of each card, hidden on the sole remaining row.
- "+ Add another person" text link: below the last card, disappears at 20 rows.
- Primary button: full-width, below "+ Add another person".
- Footer hint: below the primary button, muted.

**Content rules (new for add-recipient mode):**
- Dialog title: "Add recipient(s)".
- Primary button label: "Send Invitation" (1 filled row) or "Send N Invitations" (2+ filled rows). Label updates live as the user fills or removes rows. Empty trailing rows don't count toward N.
- Footer hint: "Each person receives their own personal invitation."

**Screen 2 — Seal confirmation (public doc, visual hierarchy fix):**

```
┌─────────────────────────────────────────────┐
│                                             │
│                   ✨                        │
│                                             │
│              Letter Sealed                  │
│              Ready to share                 │
│                3 stories                    │
│                                             │
│   ┌──────────────────────────────────┐      │
│   │                                  │      │  ← hero link card
│   │  localhost:5200/letter/abc123... │      │    full-width,
│   │                                  │  📋  │    large, readable,
│   │                                  │      │    visible copy button
│   └──────────────────────────────────┘      │
│                                             │
│   ┌──────────────────────────────────┐      │
│   │          Back to Doc             │      │  ← primary button
│   └──────────────────────────────────┘      │    (blue, full-width)
│                                             │
│      + Also invite someone by email         │  ← tertiary text link
│                                             │
└─────────────────────────────────────────────┘
```

**Layout rules (public doc variant):**

1. **Sparkle icon + "Letter Sealed" + subtitle + story count** — ceremonial top block, unchanged from current design.
2. **Shareable link card** — the hero element. Full-width within the content column, larger padding than a chip, readable URL (not tiny monospace), visible copy button to the right. Card has subtle border and rounded corners. This card is the first thing the eye lands on after the ceremonial title.
3. **"Back to Doc" primary button** — full-width (within the content column), blue primary styling. Placed directly below the link card with comfortable spacing. This is the user's main exit path.
4. **"+ Also invite someone by email" text link** — small, tertiary, centered below the primary button. Muted color (not attention-grabbing). Opens the modal described in Flow B.

**Removed from current design:**
- The inline `<input>` + "Send" / "Cancel" block that appeared when "+ Also invite" was clicked. Replaced entirely by opening `LetterReceiverModal`.
- The current small-muted-box link treatment. Replaced by the hero card.

**Screen 3 — Seal confirmation (private doc, unchanged):**

Still shows the ceremonial icon, "Letter Sealed", "Sent to [name]", story count, a "you'll see responses" line, and a "Back to Doc" button. No shareable link, no invite affordance. Zero changes in this variant.

### Visual Context

- **Density intent:** Spacious. The Sent tab add-recipient dialog is a deliberate "who am I inviting" moment — the user is making decisions about people, not scanning data. Cards with generous padding make each recipient feel like a distinct person, not a row in a table. The seal confirmation screen is a post-action ceremony; breathing room reinforces that the user has completed something meaningful. Neither surface should feel dense or utilitarian.
- **Visual reference:**
  - **Sent tab add-recipient dialog:** Should feel identical to the P682 compose recipient form — same cards, same spacing, same fields, same hints. The only difference a user should perceive is the dialog title and button label. Visual parity is the point.
  - **Seal confirmation (public doc):** Should feel like the current "Letter Sealed" screen, but with the shareable link promoted to hero status — take visual inspiration from how the `/session` post-session "Share your agreement" screen treats its primary share action (large, central, unambiguous) rather than the current tucked-away chip treatment.

### Edge Cases & UI States

Per-screen specification, since both screens have interaction patterns that go beyond standard CRUD.

**Sent tab add-recipient dialog — states:**

| State | Visual | User's next action | Recovery path |
|-------|--------|-------------------|---------------|
| Empty (initial) | One empty card, primary button reads "Send Invitation", disabled | Type an email into the first field | n/a |
| Filling row | Spinner appears to the right of the email field during lookup | Continue typing or wait for lookup result | n/a |
| Lookup success | Name field auto-fills and shows read-only styling; hint text "Using their registered name" below email | Proceed (submit or add another) | User can clear the email to unlock the name field |
| Lookup miss | Hint text "No account — they'll be invited to join" below email; name field remains editable | Type a full name | n/a |
| Self-send | Red border on email field; red hint "You can't send a letter to yourself" | Clear or change email | Correcting the email clears the error |
| Duplicate email | Red border on the later occurrence's email field; red hint "Already added" | Change or remove the duplicate row | Removing the duplicate clears the error |
| Validation on submit (empty name) | Red border on name field; red hint "Name is required" | Fill the name | Filling clears the error |
| All succeeded | Toast "Invitations sent to 3 people" or "Invitation sent to Alex Rivera" (N=1); modal closes; Sent tab refreshes | n/a (flow complete) | n/a |
| Partial failure | Successful rows removed silently; failed rows remain with red hint showing the failure reason below the email field; toast "Sent 2 of 3 invitations. Fix the rows marked in red and try again."; modal stays open | Fix and retry the failed rows, or cancel | Retry after correcting, or cancel to keep the partial success |
| Total failure (network down) | All rows remain; red hint "Couldn't send — check your connection and try again"; toast "No invitations sent"; modal stays open | Retry | Retry after connectivity is restored |
| 20 rows reached | "+ Add another person" link disappears silently | Edit or remove existing rows | Removing a row restores the link |
| Sending (in-flight) | Primary button shows "Sending…" and is disabled; all inputs disabled | Wait | n/a |

**Validation timing:** Email format and duplicate checks run live (on input, debounced 400ms). Name-empty validation runs only on submit (empty name without a lookup result is common during typing — premature red borders would feel hostile). Self-send check runs live the moment a valid email format is typed.

**Seal confirmation — states:**

| State | Visual | User's next action |
|-------|--------|-------------------|
| Default (public doc) | Hero link card + primary "Back to Doc" + tertiary "+ Also invite" link | Copy link, navigate back, or open invite modal |
| Default (private doc) | "Sent to [name]" copy + "Back to Doc" button. No link, no invite affordance | Navigate back |
| Link copy success | Copy icon swaps to checkmark for 2 seconds; toast "Link copied to clipboard" | Share the copied link elsewhere |
| Link copy failure | Toast "Failed to copy link" | Retry or select text manually |
| Invite modal open | Dialog floats above the confirmation screen with no backdrop (non-modal pattern, shared with compose/rating drawers per aa3ecbe6). Confirmation screen remains visible and interactive behind the dialog | Fill the modal (Flow B) |
| Invite modal success | Modal closes; confirmation screen regains focus; toast confirms the invitations sent | Continue (copy link, back to doc, or send more) |
| Invite modal cancelled | Modal closes; confirmation screen regains focus; no toast | Continue |

### Accessibility

- **Keyboard navigation (add-recipient dialog):** Tab order is Email → Name → X (if shown) → next row's Email → … → "+ Add another person" link → primary submit button → dialog close button. Enter in the name field of the last row focuses the submit button (does NOT add a new row — explicit action only). Escape closes the dialog.
- **Keyboard navigation (seal confirmation public):** Tab order is Copy link button → Back to Doc → "+ Also invite" link. Enter activates. Escape on the screen does nothing (no modal to dismiss at rest).
- **Screen reader (add-recipient dialog):** Dialog announces its title on open ("Add recipient(s)"). Each recipient card has `role="group"` with `aria-label="Recipient N of M"` so the reader announces context. The remove X button is labeled "Remove recipient N". Hint text below email uses `aria-live="polite"` for lookup results and `role="alert"` for error states. The primary button label changes live ("Send Invitation" ↔ "Send 3 Invitations") and is announced via its own label change.
- **Screen reader (seal confirmation):** "Letter sealed" is announced as a level-2 heading. The shareable link card has `role="region"` with `aria-label="Shareable letter link"`. The copy button has `aria-label="Copy link to clipboard"` and announces "Link copied" via an `aria-live="polite"` region when clicked.
- **Focus management:** Opening the invite modal from seal confirmation moves initial focus into the dialog's first email input (Radix Dialog behavior, preserved even under `modal={false}`). Focus trap is **soft** — tabbing can escape the dialog into the confirmation screen behind (matches the app's non-modal drawer pattern). Escape still closes the dialog. Closing (success or cancel) returns focus to the "+ Also invite" link that opened it. Removing a row moves focus to the email field of the previous row (or first row if the first was removed).
- **Color contrast:** Red error text on white ≥4.5:1 (WCAG AA). Muted hint text ≥4.5:1. The hero link card's URL text is readable without squinting on both light backgrounds (≥4.5:1 for body text).
- **Touch targets:** All interactive elements ≥44px hit area on mobile (X remove button, copy button, primary CTA, text links).

### Responsive Design

**Mobile (<640px):**
- **Add-recipient dialog:** Email and name fields stack vertically within each card (full-width each). Dialog takes near-full-screen width with small margins. Cards and CTA remain reachable; dialog content scrolls internally when rows exceed viewport height. "+ Add another person" is full-width tap target. X remove button: top-right of card, 44px hit area.
- **Seal confirmation:** Single-column layout. Shareable link card is full-width within the content column (small horizontal padding around the card). URL text wraps or truncates with ellipsis if too long for one line; full URL is still copyable. Primary button is full-width within the content column. "+ Also invite" text link is centered below, comfortable tap target.

**Tablet (640–1023px):**
- **Add-recipient dialog:** Fields side-by-side within each card (50/50). Dialog centered, `sm:max-w-md`. No other changes from mobile.
- **Seal confirmation:** Content column widens but remains centered with a max width — not edge-to-edge. Hero link card and primary button both constrained to the content column width.

**Desktop (1024px+):**
- **Add-recipient dialog:** Same as tablet. Dialog is small and centered; no wider layout is appropriate for this form.
- **Seal confirmation:** Same content-column layout as tablet, just with more surrounding whitespace. Content stays centered and comfortable, not stretched across the viewport.

**Breakpoint behavior:**
- The only breakpoint that matters for this spec is `sm:` (640px), inherited from P682's RecipientRow. No new breakpoints introduced.
- Everything wider than `sm:` looks the same — the content is small enough that expanding it further would feel wrong.

## Files Expected to Change

- `src/app/components/letters/letter-receiver-modal.tsx` — unify both modes through `RecipientRow`; delete old single-recipient state and JSX; adjust `handleSubmit` to branch on mode for the submission action (batch seal vs loop add).
- `src/app/components/letters/letter-seal-confirmation.tsx` — delete inline invite form and its state; add `LetterReceiverModal` in add-recipient mode triggered by the "+ Also invite" link; rework visual hierarchy for link/primary-button prominence.
- `e2e/*.spec.ts` — new or updated E2E tests for the two new call sites; P682 suite unchanged.

## Next Steps

Run `/generate-tests` to lock the refactor behavior before implementation. The P682 E2E suite must remain the regression guard; new tests cover Sent tab multi-recipient add, seal-confirmation invite-via-modal, and partial-failure toast behavior.
