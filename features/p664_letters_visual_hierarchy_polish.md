---
status: in-progress
type: change-request
rank: 1
changes: p660
chain_root: p581
tags:
  - redesign
  - p660
  - letters
  - visual-hierarchy
  - ux-polish
created_date: 2026-04-06T00:00:00.000Z
delivery_stage: dev
flow: dev
pipeline_plan:
  - change-request
  - dev
  - verify
pipeline_ran:
  - change-request
  - dev
pipeline_skipped:
  - challenge-prd -- decisions made live in conversation
  - ux -- swapping existing patterns not new components
  - architect -- 1 file no schema no security
  - generate-tests -- visual-only existing E2E covers regressions
  - decompose -- 1 file 3 independent edits
locked_at: '2026-04-07T11:40:40.650Z'
---

# P664: Sent Tab Redesign — Drafts-Consistent Card Pattern

> **Redesign of:** [P660: Letters Navigation Architecture](p660_letters_navigation_architecture.md)
> **What was wrong:** Sent tab has a completely different visual pattern from Drafts tab — everything expanded, no card affordances, information overload. Also: colored status badges compete with Results button, mode indicator inconsistent with Drafts, "Add recipient" is a bare email input with no name field or user lookup. Preview page issues (exit UX, counter bug) handled by P665.

## Operating Mode

> This spec is an **incremental correction** to P660/P661, not a greenfield design.
> The predecessor specs are **read-only shipped history** — do not recommend edits to them.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P660/P661 are not up for re-examination.

## Problem Statement

P660 implemented the Sent tab with all information expanded by default — recipient lists, public link rows, add-recipient inline input — while the Drafts tab uses compact clickable cards with actions behind a `⋯` dropdown. The sibling tabs look unrelated. Five specific issues:

1. **No collapse/expand.** Every card dumps all recipients, respondents, public link, and add-recipient on screen. Drafts tab shows a compact row per item.

2. **Status badges steal focus from actions.** `LetterStatusBadge` colored pills compete with the [Results] button. Status is context, not an action.

3. **Mode indicator inconsistency.** Drafts uses `InlineVisibilityIcon` (lock/globe inline with title). Sent uses a corner pill badge.

4. **Add recipient is broken.** `AddRecipientButton` is a bare email input — no name field, no user lookup, no self-send guard. The sender's name defaults to NULL for new recipients. Meanwhile `LetterReceiverModal` (used in "Prepare Letter") already handles all of this: debounced email lookup, auto-fill name for existing users, name field for new users, self-send prevention.

5. **Preview link not accessible after sealing.** The preview route (`/letter/:docId/preview`) works but isn't surfaced in the Sent tab. Useful for senders to test what the recipient will see.

## Redesign

### Card layout — collapsed (default)

Notion-style expand triangle on the left. Primary action (Results) rightmost. Secondary actions behind `⋯`. Left border color matches Drafts tab pattern: `border-l-4 border-l-gray-400` (private) / `border-l-blue-500` (public).

```
┌──────────────────────────────────────────────────────┐
│ ▶ 🔒 Borbosobich Karim                              │
│   Sealed 2d ago · 1 of 2 completed    [⋯] [Results] │
└──────────────────────────────────────────────────────┘
```

- **▶** = collapsed, **▼** = expanded. Click triangle or card header area to toggle.
- Summary line: `Sealed {timeAgo} · {completed} of {total} completed`
- For public letters with respondents: `Sealed {timeAgo} · 1 of 2 completed · 3 responses`
- **[Results]** — blue primary (`variant="default"`), rightmost. Only shown when >= 1 recipient completed.
- **[⋯]** — secondary actions dropdown (DropdownMenu, matching Drafts tab pattern), left of Results.
- [Results] and [⋯] stop propagation (don't toggle expand).
- **▶/▼ toggle** must be a `<button>` with `aria-expanded`, keyboard accessible (Enter/Space).

When no recipients have completed:
```
┌──────────────────────────────────────────────────────┐
│ ▶ 🔒 New letter to Pat                              │
│   Sealed 1h ago · 0 of 1 completed            [⋯]   │
└──────────────────────────────────────────────────────┘
```

### Card layout — expanded (tap ▶ → ▼)

```
┌──────────────────────────────────────────────────────┐
│ ▼ 🔒 Borbosobich Karim                              │
│   Sealed 2d ago · 1 of 2 completed    [⋯] [Results] │
│   ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │
│   ✉ Alex R. · Completed                             │
│   ✉ Pat M.  · Opened                                │
└──────────────────────────────────────────────────────┘
```

- Recipient rows: `{icon} {name} · {status}` — status as inline muted text (`text-muted-foreground`), no colored badges.
- For public letters, respondents section appears below recipients (same as current, but only when expanded).

### ⋯ dropdown menu

| Item | Condition | Action |
|------|-----------|--------|
| Preview letter | Always | Opens `/letter/:docId/preview` in new tab |
| Add recipient(s) | Always | Opens `LetterReceiverModal` in add mode |
| Copy public link | Public letters only | Copies `/letter/:letterId` to clipboard |

### Card header — visibility icon

Replace corner pill badge with `InlineVisibilityIcon` before the title (same component as Drafts tab). **Type mapping:** `letter.mode === 'one-to-many'` → `visibility="public"`, otherwise `visibility="private"`.

### Add recipient(s) — reuse LetterReceiverModal

Replace `AddRecipientButton` (bare email input, no name, no lookup) with `LetterReceiverModal` opened in add mode:

- **Title:** "Add recipient(s)" (not "Who is your letter for?")
- **Mode selector:** Hidden (letter is already sealed, mode is fixed)
- **Email field:** Same — debounced lookup via `agreementsService.lookupUserByEmail()`
- **Name field:** Same — auto-fills and locks for existing users, editable for new users
- **Self-send guard:** Same — blocks sending to own email
- **Submit button:** "Send Invitation" (not "Continue")
- **On submit:** Calls `addRecipientToSealed(letterId, email, receiverName)` — requires migration to add `p_receiver_name` parameter to the RPC.

Implementation: Add a `mode` prop to `LetterReceiverModal` — `mode="compose"` (default, current behavior) vs `mode="add-recipient"` (strips mode selector, changes title/button label, accepts `letterId` prop, calls add-recipient API on submit).

### Migration: add receiver_name to add_recipient_to_sealed_letter RPC

Current RPC signature: `add_recipient_to_sealed_letter(p_letter_id UUID, p_email TEXT)`
New RPC signature: `add_recipient_to_sealed_letter(p_letter_id UUID, p_email TEXT, p_receiver_name TEXT DEFAULT NULL)`

The RPC inserts a `letter_deliveries` row. Add `receiver_name = p_receiver_name` to the INSERT. Default NULL preserves backward compatibility with existing callers.

## Predecessor Sections Superseded

| Section | P660 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Sent tab card layout | "Card shows recipients, respondents, add-recipient, public link row" | Superseded | Collapsed by default with expand/collapse. Recipients visible only when expanded. Actions in ⋯ menu. |
| Sent tab recipient row | "Each person row: icon, name/email, status pipeline, and [Results] button" | Superseded | Status as inline muted text. Results promoted to card-level primary action. |
| Sent tab card header | "Card header shows: draft title, sealed date, story count, private/public label" | Superseded | Private/public uses `InlineVisibilityIcon`. Summary shows "X of Y completed" instead of raw count. |
| Add recipient | "Inline email input with Send button" | Superseded | Opens `LetterReceiverModal` in add mode (with name field + user lookup). |

## Requirements

1. **Collapse/expand:** Cards collapsed by default. Notion-style ▶/▼ triangle on the left toggles recipient list visibility. Click target = triangle + header area (not Results/⋯). `<button>` with `aria-expanded`.
2. **Card header:** `InlineVisibilityIcon` before title (map `one-to-many` → `public`, `one-to-one` → `private`). Left border: `border-l-4 border-l-gray-400` (private) / `border-l-blue-500` (public), matching Drafts tab.
3. **Summary line:** `Sealed {timeAgo} · {completed} of {total} completed`. Public letters with respondents: append `· {count} responses`.
4. **[Results] button:** Blue primary (`variant="default"`), rightmost position on card. Only visible when >= 1 completed. Stops propagation.
5. **[⋯] dropdown:** Left of Results. Contains: Preview letter, Add recipient(s), Copy public link (public only). Stops propagation. Uses `DropdownMenu` (same component as Drafts tab).
6. **Recipient rows (expanded):** `{icon} {name} · {status}` with status as `text-muted-foreground` inline text. No `LetterStatusBadge`. Respondents section for public letters shown below recipients.
7. **Add recipient(s):** Opens `LetterReceiverModal` with `mode="add-recipient"` — no mode selector, title "Add recipient(s)", button "Send Invitation", calls `addRecipientToSealed` with email + name.
8. **Migration:** Add `p_receiver_name TEXT DEFAULT NULL` to `add_recipient_to_sealed_letter` RPC. Update `letters-service.ts` to pass name.
9. **Preview letter:** Opens `/letter/:docId/preview` in new tab from ⋯ menu.
10. **Mobile:** ⋯ menu handles all actions on small screens (same pattern as Drafts tab `sm:hidden` / `sm:inline-flex` for Results button).

## What Stays the Same

- **All P660 architecture:** Three tabs (Drafts/Sent/Inbox), nav item, routing, data queries, badge count
- **Inbox tab:** Entirely unchanged
- **Drafts tab:** Entirely unchanged (already correct — Sent tab now matches its pattern)
- **All P661 composition flow:** Receiver modal default behavior (`mode="compose"`), prediction walk, review screen, seal
- **Preview page:** Entirely owned by P665
- **All reading/completion flows:** Unchanged

## Surfaces in Scope

**In scope:**
- `src/app/components/letters/sent-tab.tsx` — full redesign: collapse/expand, card header, ⋯ menu, recipient rows, remove `AddRecipientButton` and `PublicLinkRow` (functionality moves to ⋯ menu)
- `src/app/components/letters/letter-receiver-modal.tsx` — add `mode` prop for add-recipient variant
- `src/app/data/letters-service.ts` — update `addRecipientToSealed` to pass `receiverName`
- `supabase/migrations/` — new migration for RPC parameter

**Out of scope:**
- `src/app/pages/letter-preview-page.tsx` — owned by P665
- `src/app/components/letters/drafts-tab.tsx` — already correct
- `src/app/components/letters/inbox-tab.tsx` — unchanged
- `src/app/pages/letters-page.tsx` — tab shell unchanged
- `src/app/components/letters/letter-status-badge.tsx` — may become unused; do not delete (other surfaces may use it)
- All reading flow, composition flow, results pages

## Acceptance Criteria

- [x] Sent cards collapsed by default with ▶/▼ toggle (keyboard accessible, `aria-expanded`)
- [x] Expanded cards show recipient rows with inline muted status text (no colored badges)
- [x] Respondents section visible in expanded public letter cards
- [x] [Results] button is blue primary, rightmost, only when >= 1 completed
- [x] [⋯] dropdown contains Preview letter, Add recipient(s), and Copy public link (public only)
- [x] Card header uses `InlineVisibilityIcon` before title (matching Drafts tab)
- [x] Card has `border-l-4` color matching Drafts tab (gray private, blue public)
- [x] Summary line shows "X of Y completed" format (+ "N responses" for public)
- [x] "Add recipient(s)" opens `LetterReceiverModal` with name field + user lookup (not bare email input)
- [x] `addRecipientToSealed` RPC accepts and stores `receiver_name`
- [x] "Preview letter" opens `/letter/:docId/preview` in new tab
- [x] Drafts tab and Inbox tab are visually unchanged
- [x] All existing P660 and P661 tests still pass
