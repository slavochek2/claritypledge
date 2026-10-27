---
status: qa
type: change-request
disclosure: public
drafted_by: opus
exec_model: opus
exec_effort: high
rank: 1000108.0
changes: p1545
tags:
  - redesign
  - p1545
created_date: 2026-10-27
delivery_stage: dev
pipeline_ran: [change-request, dev]
---

# P1582: Artifacts rows read as one list, full action labels on phones, the sender's own "seen" mark

> **Redesign of:** [P1545: Feed home again, Chats and Artifacts in the menu, one Inbox rule, Chiang Mai card on Events](done/2026-06-10/p1545_menu_and_artifacts.md)
> **What was wrong:** the founder tested P1545 on a phone after it went live. Each row was rounded and also carried the list's top divider, so every divider bent down at both ends and the rows read as broken half-cards. Below 400px the row's one action shrank to "+ Add" and "Prepare", which do not say what they do. And a sender never saw a recipient's later progress as new, because the old shared read mark is written once, when the recipient first opens the letter.

## Operating Mode

> This spec is an **incremental correction** to P1545, not a greenfield design.
> The predecessor spec is **read-only shipped history**: do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1545 are not up for re-examination.

## Problem Statement

> Founder framing, verbatim: *"this line is not clear is it like the cards I think cards are like they need to have like a border on the left not the border at the top because if it's just border at the top I don't understand that it's a card"*

> Founder framing, verbatim: *"Phone buttons. Thank you. slightly weird on the phone"*

> Founder framing, verbatim: *"yes to all - lets implement see by sender too its safe? where it will be ? how we make sure its consistnet iwth design and doenst clutter and is at right palce at tirght itme"*

The sender's "new" mark had a gap that P1545's own work named. Here is an example: Tom opens a letter, the sender looks, and a week later Tom finishes it. The sender's row does not light up again, so they never learn that Tom finished.

## Jobs To Be Done

- **Preserved from P1545:** scan my letters and canvases quickly; see at a glance which sent letter has something new; act on a row with one visible action.
- **Corrected:** read the list as one list, not as stacked broken cards; understand the row's action from its label alone; learn about a recipient's progress after I last looked.

## Current State

- `artifact-row.tsx`: each `<li>` has `rounded-lg`, and the list is `divide-y`, so each row's top border curves.
- `artifact-row-actions.tsx`: below 400px, "Prepare letter" shows as "Prepare" and "+ Add recipient" as "+ Add".
- `letters-sender-seen.ts` (shipped in P1545) already calls `mark_delivery_seen_by_sender` and falls back to the shared read mark when the function is missing. `hasNewSenderProgress` already compares `last_progress_at` with `sender_seen_at` when the reader returns them. On prod the function and the column do not exist, so the old rule applies: a delivery is new only while `read_at` is null.

## Root Cause

1. **Dividers:** `rounded-lg` on the row element and `divide-y` on the list put a border-top on a rounded box. The border follows the radius at both corners.
2. **Labels:** a deliberate P1545 responsive choice (`min-[400px]` swap). The short words lost their object.
3. **Seen:** `letter_deliveries.read_at` is shared by both parties and written once, at the recipient's first open. Later progress can never make it "unread" for the sender.

## Redesign

```
Before                                    After
 ● testiu              + Add   …           ● testiu         + Add recipient  …
 🔒 To Tom · 1 new · on Jun 26              🔒 To Tom · 1 new · on Jun 26
╭──────────────────────────────╮         ────────────────────────────────────
 ● sdfsd f             + Add   …           ● sdfsd f        + Add recipient  …
```

- **Rows:** a plain list with flat full-width dividers and no rounded corners (Gemini 4 Argon recommended a plain list over cards or a left accent; Notion-style calm density). The hover and pressed background stays.
- **Labels:** full labels at every width (founder chose this over the short labels).
- **Seen ("where will it be"):** nowhere new. The existing blue dot and "N new" text on Sent rows, and the per-recipient "New" in the letter overview, use the sender's own mark. It is set when the sender opens the letter. A delivery is new for the sender when it has progress later than that mark. The recipient's read mark is unchanged.

## Predecessor Sections Superseded

| Section | P1545 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| One-line rows (third pass) | rows with `py-2.5` inside a divided list | Extended | Flat dividers, no row rounding |
| Row actions (phone) | "+ Add" / "Prepare" below 400px | Superseded | Full labels at every width |

## Invariants

- One visible action per row; "…" starts with Open (P1545, carried forward).
- The recipient's read mark (`read_at`, `mark_inbox_item_read`, `get_inbox_items`) is unchanged.
- Switching on the sender mark must not light up any letter the sender already counted as seen.

## What Stays the Same

Row content, the meta line, the menu items, the received side, chats, and the canvas pages.

## Surfaces in Scope

**In scope:** `src/app/pages/artifacts/artifact-row.tsx`, `artifact-row-actions.tsx`, migrations `20261027150000_p1545_sender_seen.sql` and `20261027150100_p1545_sender_seen_backfill_fix.sql`, and their tests.
**Out of scope:** the client newness logic (already shipped in P1545), the letter overview page, and the recipient flows.

## Acceptance Criteria

- [x] Dividers are flat full-width lines with no curved ends. *Evidence: screenshot at 375px on the branch (founder's TEST account, Sent list).*
- [x] Row actions read "Prepare letter" and "+ Add recipient" at every width. *Evidence: `artifacts-page.test.tsx` asserts the button text is "+Add recipient"; 169/169 artifact tests green.*
- [x] Only the sender can set their seen mark, and a recipient's progress after it makes the delivery new again. *Evidence: integration test "the sender has their own seen mark" on TEST: the recipient and a stranger both get 42501; the sender sets it; new → not new → new after completion. 30/30.*
- [x] Switching on lights up no previously-seen letter. *Evidence: on TEST after both migrations, 63 deliveries with `read_at` set and 0 with completion later than the new mark. `p1545-sender-seen-migration.test.ts` pins the back-fill, 6/6.*
- [x] Surfaces not in scope are visually unchanged, and the P1545 tests still pass (artifact unit suite and full pre-commit suite green on each commit).
- [x] Reviewed: Gemini 4 Argon, 2 rounds. Round 1 found the back-fill would light up letters with progress after the first open; fixed by a second migration. Round 2 found a narrow window case; fixed by widening the condition. Its other two points did not apply: there is only one place that uses the changed helper, and the "missing functions" point came from a truncated prompt.

## Next Steps

Ship (`/ship p1582`). `/push` applies both migrations to prod before the client moves.
