---
status: all-done
completed_at: '2026-04-20'
type: story
rank: 1000763.0
workstream: letters
created_date: '2026-04-20'
tags: [letters, ui, delete, tab]
pipeline_ran: [create-spec, fix, ship]
---

# P770: Published Tab Rename + Delete for Zero-Delivery Sealed Letters

## Problem

**Situation:** The Letters page has a "Sent" sub-tab listing sealed letters. The broader nav section is already called "Letters", making "Sent" both redundant and inaccurate — sealed letters with only a public link aren't "sent" to anyone.

**Complication:** Users with sealed letters that have zero deliveries (no email recipients, no respondents via link) have no way to remove them. Drafts already support conditional delete; sealed letters don't, creating an asymmetry.

**Question:** Rename the "Sent" tab to "Published" and add a conditional delete action for zero-delivery sealed letters.

## Appetite

Low blast radius — tab label change and one new menu item, no auth or data model changes. Reversible (UI-only + one new service function, no migration needed). Low decision density — UX follows the existing drafts-tab pattern exactly.

## Solution

Rename the "Sent" tab label to "Published". The URL param `?tab=sent` and internal `VALID_TABS` value stay unchanged for backward compat — display only.

Add "Delete letter" to the three-dot menu on Published letter cards:
- Enabled only when `deliveries.length === 0`
- Shows confirmation dialog (same pattern as drafts-tab)
- Deletes the `clarity_letter` record; the underlying draft (`ClarityDoc`) is preserved
- When deliveries exist: item is disabled with tooltip "Can't delete — letter has been shared."

A server-side guard in `deleteLetter()` re-checks delivery count before deleting, so the UI gate cannot be bypassed by stale data.

## Risks / Non-Goals

### Risks
- Stale delivery count could show the menu item as enabled when deliveries now exist. Mitigation: server-side guard in `deleteLetter()` throws `DELIVERIES_EXIST` before any delete.
- Accidental deletion of a shared letter whose link was never clicked. Mitigation: "Has been shared" check is based on delivery records — if the letter was sealed with recipients, it can't be deleted regardless of clicks.

### Non-Goals
- Do NOT change the URL param (`?tab=sent`) — would break existing bookmarks
- Do NOT delete the underlying draft (`ClarityDoc`) — only the sealed letter record
- Do NOT add bulk delete — single-item action only
- Do NOT add delete for letters with any deliveries, regardless of response count

## Done-When

- [ ] Tab label reads "Published" (URL param `?tab=sent` still works, no redirect)
- [ ] Empty state on the tab reads "No published letters yet."
- [ ] Three-dot menu on a zero-delivery letter includes "Delete letter" (enabled, red)
- [ ] Confirmation dialog appears before delete executes
- [ ] After confirm: letter disappears from list, toast "Letter deleted."
- [ ] Draft still present in Drafts tab after delete
- [ ] Three-dot menu on a letter with ≥1 delivery: "Delete letter" is disabled with tooltip "Can't delete — letter has been shared."
- [ ] Server-side guard returns error if `deleteLetter()` is called on a letter with deliveries

## Acceptance Criteria

- [ ] Tab rename is purely display — no URL or routing changes
- [ ] Delete is gated by delivery count, checked both client- and server-side
- [ ] Delete confirmation dialog matches existing drafts-tab pattern (same wording structure)
- [ ] No regression on existing three-dot menu items (copy link, preview, etc.)
- [ ] Regression test covers: delete success path + disabled state when deliveries exist

## UI Contract

| Element | Value | Notes |
|---------|-------|-------|
| Tab label | "Published" | Was "Sent" |
| Empty state body | "No published letters yet." | Replaces current copy |
| Menu item label | "Delete letter" | Added after separator |
| Menu item style | `text-destructive` | When enabled |
| Menu item state | disabled | When `deliveries.length > 0` |
| Disabled tooltip | "Can't delete — letter has been shared." | Tooltip on hover |
| Dialog title | "Delete letter?" | AlertDialog |
| Dialog body | "This will remove the published letter and its public link permanently." | |
| Dialog cancel | "Cancel" | |
| Dialog confirm | "Delete" | Destructive variant |
| Success toast | "Letter deleted." | After confirmed delete |
| Error toast | "Couldn't delete letter." | On service error |
