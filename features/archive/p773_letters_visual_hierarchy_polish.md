---
status: rejected
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
delivery_stage: change-request
flow: dev
pipeline_plan:
  - change-request
  - dev
  - verify
pipeline_ran:
  - change-request
pipeline_skipped:
  - challenge-prd -- decisions made live in conversation
  - ux -- swapping existing patterns not new components
  - architect -- 1 file no schema no security
  - generate-tests -- visual-only existing E2E covers regressions
  - decompose -- 1 file 3 independent edits
locked_at: '2026-04-20T09:43:29.670Z'
---

# P773: Letters Visual Hierarchy Polish — Sent Tab & Preview

> **Redesign of:** [P660: Letters Navigation Architecture](../done/22_mar_26/p660_letters_navigation_architecture.md)
> **What was wrong:** During UAT of P660/P661 on w2, two visual hierarchy issues surfaced in the Sent tab: (1) colored status badges compete with the Results action button for attention, (2) Private/Public indicator uses a corner pill badge inconsistent with Drafts tab's inline lock/globe icon. Preview page issues (exit UX, counter bug) are now handled by P665.

## Operating Mode

> This spec is an **incremental correction** to P660/P661, not a greenfield design.
> The predecessor specs are **read-only shipped history** — do not recommend edits to them.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P660/P661 are not up for re-examination.

## Problem Statement

P660 and P661 implemented the letters navigation architecture and composition redesign correctly at a structural level. During UAT verification, two visual hierarchy issues create friction in the Sent tab:

1. **Status badges steal focus from actions.** `LetterStatusBadge` renders colored pills (green for "Completed", blue for "Opened") that compete with the blue [Results] button. The action (Results) should be the highest-priority visual element, but colored badges at the same level create equal visual weight. Status is informational context, not an action.

2. **Mode indicator inconsistency.** Drafts tab uses `InlineVisibilityIcon` (lock/globe icon inline with title). Sent tab uses a corner pill badge ("Private" / "Public" text in a colored pill). Same information, different patterns across sibling tabs.

~~Preview page issues (exit UX, counter bug) originally tracked here are now addressed by [P665](../done/22_mar_26/p665_letter_immersive_preview_reuse.md), which rewrites the preview page entirely.~~

## Jobs To Be Done

- **Preserved from P660:** All JTBD — find letters, track responses, see all incoming
- **Corrected:** "Quickly see who completed and view their results" — the action path (Results button) was visually competing with status badges instead of being the clear primary action
- **Corrected:** "Understand letter privacy at a glance across tabs" — inconsistent visual pattern between Drafts (icon) and Sent (pill) broke scanning consistency

## Current State

**Sent tab recipient row (current — `sent-tab.tsx` DeliveryRow):**
```
┌─────────────────────────────────────────────────┐
│ ✉ Alex R.          [Completed]  [Results]       │
│                     ^^^green     ^^^outline      │
│                     pill badge   button          │
└─────────────────────────────────────────────────┘
```
- `LetterStatusBadge` renders colored pill: green-50/green-700 for completed, blue-50/blue-600 for opened
- Results button is `variant="outline"` — secondary visual weight
- Status badge and button sit side by side with equal visual prominence

**Sent tab card header (current — `sent-tab.tsx` LetterCard):**
```
┌─────────────────────────────────────────────────┐
│ Borbosobich Karim                    [Private]  │
│ Sealed 2d ago · 1 recipient          ^^^gray    │
│                                      pill badge │
└─────────────────────────────────────────────────┘
```
- Mode shown as `bg-gray-100 text-gray-600` (private) or `bg-blue-50 text-blue-600` (public) pill

**Preview page bottom nav (current — `letter-preview-page.tsx:117-135`):**
```
┌─────────────────────────────────────────────────┐
│ Back to composition         End of preview      │
│ ^^^blue text link           ^^^<p> tag, not     │
│                             clickable           │
└─────────────────────────────────────────────────┘
```

## Root Cause

1. **Status badges:** `DeliveryRow` renders `LetterStatusBadge` (colored pill component from P581) alongside the Results button. P660 spec says "status shown as inline text, not badges" — but implementation reused the existing badge component instead of switching to inline text.

2. **Mode indicator:** `LetterCard` builds its own pill badge inline (`bg-gray-100 text-gray-600`) instead of reusing `InlineVisibilityIcon` from Drafts tab. Two implementations of the same concept.

3. **Preview exit:** `letter-preview-page.tsx:132-133` renders "End of preview" as a `<p className="text-sm text-muted-foreground">` — static text, not a button. "Back to composition" link at line 118-122 navigates to compose route but the preview opens in a new tab, making "back" semantically wrong.

4. **Counter bug:** `currentIndex` can exceed `stories.length - 1`. Root cause needs investigation during implementation — likely a state issue when stories change after initial load or a missing bounds guard.

## Redesign

**After (Sent tab recipient row):**
```
┌─────────────────────────────────────────────────┐
│ ✉ Alex R. · Completed               [Results]  │
│            ^^^muted gray             ^^^blue     │
│            inline text               primary btn │
└─────────────────────────────────────────────────┘

│ ✉ Pat M. · Opened                              │
│            ^^^muted gray, no button             │
```
- Status becomes inline muted text (`text-muted-foreground`) after name, separated by ` · `
- No colored badge component
- [Results] becomes blue primary button (`variant="default"`) — only action, highest visual weight
- Non-completed rows: status text is the only info, no button

**After (Sent tab card header):**
```
┌─────────────────────────────────────────────────┐
│ 🔒 Borbosobich Karim                           │
│ Sealed 2d ago · 1 recipient                    │
└─────────────────────────────────────────────────┘

│ 🌐 Workshop prep                               │
│ Sealed 3d ago · 2 recipients                   │
```
- Replace pill badge with `InlineVisibilityIcon` before the title (same component as Drafts tab)
- Remove the pill span entirely

**After (Preview page bottom nav):**
```
┌─────────────────────────────────────────────────┐
│              [Close Preview]                    │
│              ^^^blue primary                    │
│              full-width or centered             │
│              variant="default"                  │
└─────────────────────────────────────────────────┘
```
- Remove "Back to composition" link entirely (preview opens in new tab; closing tab = back)
- Replace "End of preview" static text with a blue primary button "Close Preview"
- Button calls `window.close()` (closes the preview tab). If `window.close()` fails (browser restriction), navigate to `/letters?tab=sent` as fallback.
- Show "Close Preview" button only on the last story after rating (same condition as current "End of preview")
- "Next Story" button continues working for non-last stories

## Predecessor Sections Superseded

| Section | P660 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Sent tab recipient row | "Each person row: icon, name/email, status pipeline, and [Results] button" | Partially superseded | Status becomes inline text after name, not a separate badge element. Results becomes blue primary button. |
| Sent tab card header | "Card header shows: draft title, sealed date, story count, private/public label" | Partially superseded | Private/public label becomes `InlineVisibilityIcon` inline with title, not a corner pill |

| Section | P661 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Preview link behavior | "← Back to composition link returns to review screen" | ~~Moved to P665~~ | Preview page entirely owned by P665 |

## Requirements

1. **Sent tab recipient rows:** Replace `LetterStatusBadge` with inline muted text after recipient name. Format: `{icon} {name} · {status}`. Status text uses `text-muted-foreground`, no colored background.
2. **Sent tab [Results] button:** Change from `variant="outline"` to `variant="default"` (blue primary). Only visible for completed deliveries.
3. **Sent tab card header:** Replace pill badge with `InlineVisibilityIcon` positioned before the title. Remove the pill span and its conditional color classes.

> ~~Requirements 4-5 (preview exit UX, counter bug) moved to P665 — that spec rewrites `letter-preview-page.tsx` entirely.~~

## What Stays the Same

- **All P660 architecture:** Three tabs (Drafts/Sent/Inbox), nav item, routing, data queries, badge count
- **Sent tab card structure:** Grouped by source draft, expandable recipients/respondents, add-recipient, public link row
- **Inbox tab:** Entirely unchanged
- **Drafts tab:** Entirely unchanged (already correct)
- **All P661 composition flow:** Receiver modal, prediction walk, review screen, seal
- **Preview page:** Entirely owned by P665
- **Database schema:** No changes
- **All reading/completion flows:** Unchanged

## Surfaces in Scope

**In scope:**
- `src/app/components/letters/sent-tab.tsx` — `DeliveryRow` (status → inline text, Results → primary), `LetterCard` header (pill → `InlineVisibilityIcon`)

**Out of scope:**
- `src/app/pages/letter-preview-page.tsx` — owned by P665
- `src/app/components/letters/drafts-tab.tsx` — already correct
- `src/app/components/letters/inbox-tab.tsx` — unchanged
- `src/app/pages/letters-page.tsx` — tab shell unchanged
- `src/app/components/letters/letter-status-badge.tsx` — may become unused after this CR; do not delete (other surfaces may use it)
- All reading flow, composition flow, results pages
- Database, edge functions, auth

## Acceptance Criteria

- [ ] Sent tab recipient rows show status as inline muted text after name (no colored badges)
- [ ] [Results] button is blue primary (`variant="default"`), not outline
- [ ] Sent tab card header uses `InlineVisibilityIcon` before title (matching Drafts tab)
- [ ] No pill badge in Sent tab card headers
- [ ] Drafts tab and Inbox tab are visually unchanged
- [ ] All existing P660 and P661 tests still pass

## Next Steps

Scope is clear, changes are targeted (1 file: `sent-tab.tsx`, visual-only) → run `/dev` after P665 ships.
