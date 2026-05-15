---
status: in-progress
type: change-request
rank: 1000767.0
changes: p700
tags:
  - redesign
  - p700
  - letters
  - overview
created_date: '2026-05-15'
delivery_stage: dev
pipeline_ran: [change-request, dev]
---

# P836: Letter Overview — structural redesign (page header, entity links, drop redundant top aggregate)

> **Redesign of:** [P700: Letter Overview — per-letter author view](p700_letter_results_aggregate_overview.md)
> **What was wrong:** As implemented on `feature/p700-letter-overview`, the page (a) doesn't communicate "you are on the overview" — header shows only the letter title (or `Untitled DocN` fallback); (b) renders a duplicated back-arrow `← ← Sent`; (c) shows a top aggregate table that duplicates the per-story breakdown below (story names truncated as columns, ratings as cells — illegible); (d) story sections render as hashtag tags (`#asymmetry`) instead of story titles; (e) story names, point names, and respondent names are not links to their entity pages — Person column shows raw usernames.

## Operating Mode

> This spec is an **incremental correction** to P700, not a greenfield design.
> P700 remains the source of truth for the two-selector model, three views, RPC shape, density intent, and acceptance criteria. **Settled decisions from P700 are not up for re-examination.**
> Note: P700 is unshipped — work continues on `feature/p700-letter-overview` (worktree `.claude/worktrees/w2`). Implementation of this CR lands on the same branch.

## Problem Statement

The implemented overview page fails to orient the author and obscures the per-respondent data with redundant chrome. Specifically:
- The author cannot tell from the page header that they're on the overview page (vs. a single-letter results page or a draft).
- Duplicated back-arrow glyph reads as a typo and erodes trust.
- A top aggregate table duplicates information already shown in per-story breakdowns below, with worse legibility (truncated column labels).
- Story headings shown as `#asymmetry` (the tag) make it impossible to tell which story you're looking at.
- Names that should be navigable entry points (story → story page, point → point page, respondent → user profile) are flat text, breaking the author's exploration loop.

P700's problem statement (middle-layer aggregate need, drill-in requirement, no-viz constraint) remains valid. This CR corrects the surface, not the model.

## Jobs To Be Done

**Preserved from P700:**
- See where everyone stands on this letter's stories and points (cohort comparison)
- Pick who to verify next via /live
- See one person's full picture across all stories
- Drill from aggregate to a specific recipient's specific story

**Corrected:**
- Know at a glance which page you're on (overview, not a single-respondent page)
- Identify which story a section belongs to (by title, not hashtag)

**New:**
- Navigate from the overview to entity pages — story page, point page, user profile — without going through the per-delivery results page first

## Current State

On `feature/p700-letter-overview` (worktree w2), the overview page renders:

```
← ← Sent                                    ← duplicated arrow

Untitled Doc2                               ← only letter title; no overview indicator;
                                              fallback when title missing reads as garbage

Person   You→Them   Most people   Understandi…   Understandi…   When someo…
Slava 09Bus0919   6→4    Agree    Unsure         Unsure         Unsure
Vyacheslav Lad…   6      Unsure   Unsure         Unsure         —
Vyacheslav Lad…   6      Unsure   Unsure         —              Agree
                                                                              ← top aggregate table:
                                                                                story names truncated as
                                                                                columns; "Person" column
                                                                                shows raw usernames

#asymmetry                                  ← story heading is the tag, not the title
Person       You→Them   The speaker…   If you feel y…
Slava ...    7→—                                       [open results →]
Vyacheslav   7→4        Agree    Unsure                Waiting

(more story sections below, same pattern)
```

## Root Cause

- **Page header:** the page renders `<h1>{letterTitle}</h1>` with no preceding context label. When `letterTitle` is the auto-fallback (`Untitled DocN`), the result is meaningless.
- **Back-arrow duplication:** the back link string contains `← Sent` AND a separate `←` glyph is prepended by an icon component, producing `← ← Sent`.
- **Top aggregate table:** added during implementation but not in P700's UX spec. P700 specified only the three selector-driven views (cohort-on-story, person-across-stories, zoom). The top aggregate restates per-story data with worse layout.
- **Story headings as tags:** sections render the story's tag slug (`#asymmetry`) instead of `story.title`. Likely a field-mapping bug introduced in implementation, but the structural fix (show title + link) belongs here, not in `/fix`, because the CR also adds linking semantics.
- **No entity links:** P700's UI Contract does not specify whether story / point / respondent names are links. The implementation rendered them as flat text. CR makes them links.

Files implicated (verify during `/ux` or `/dev`): `src/app/pages/letter-overview-page.tsx` and any sub-components co-located there.

## Redesign

### Page header

Replace bare letter title with a clear two-line header:

```
← Back                                      ← single arrow, single word
─────────────────────────────────────────
Letter Overview
{Letter Title}                              ← falls back to "Untitled letter" (sentence case)
                                              when title missing — never "Untitled Doc2"
```

- Eyebrow: `Letter Overview` (small uppercase muted text — orients the author)
- Title: letter title with sentence-case fallback when blank
- Back link: `← Back` (one arrow, label "Back" — destination remains Sent tab; `aria-label="Back to Sent tab"` per P700 accessibility spec preserved)

### Drop the top aggregate table

Remove the top aggregate table entirely. The per-story breakdowns below already cover the same information at higher fidelity (one row per respondent per story, with CLAIM + ANTI columns). The selector-driven Views 1/2/3 from P700 remain unchanged.

If a cross-story summary is wanted later, it gets its own spec — not a repeat of per-story data with worse columns.

### Story section headings

Each per-story section renders the story title (not the tag) as a heading, linked to the story's public page:

```
[Story 1 title — clickable, navigates to story page]
(per-respondent rows below, unchanged from P700 View 1)
```

Asymmetry-tag pattern (`#asymmetry`) is removed from the heading. If the tag is useful as metadata, it can render as a small muted chip after the title — but this is not required by this CR.

### Entity links

In all views (1, 2, 3) and per-story sections:

- **Story title** → links to the story's public page (existing route — `/story/:storyId` or whatever the canonical route is; `/ux` or `/dev` confirms by reading the router)
- **Point name** (CLAIM and ANTI labels in View 2 and View 3) → links to the point's public page (existing route)
- **Respondent name** ("Person" column in View 1; meta line in View 2 and View 3) → links to the respondent's user profile page

Where an entity has no public page (e.g., anonymous respondent), the name renders as plain text — link only when a target exists.

### "Person" column — display name, not username

Replace raw usernames (`Slava 09Bus0919`, `Vyacheslav Ladischenski`) with the display name resolved per P700's existing fallback chain (`receiver_name || receiver_email || 'Anonymous'`), wrapped in a link to the user profile page when a profile exists.

If the existing data shape returns only username/handle, `/architect` or `/dev` confirms the field path. The RPC already returns `display_name` (P700 AD2) — use that.

## Predecessor Sections Superseded

| Section | P700 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| UX Notes — Back nav | "**Back nav:** `[← Sent]` link top-left returns to the sent tab with the originating letter card scrolled into view but not auto-expanded." | Partially superseded | Back link now reads `← Back` (single arrow, label "Back"). Destination unchanged. |
| Visual Specification — Page title | "Page title (letter name): `text-xl font-semibold text-foreground` — matches `letter-results-page.tsx` pattern" | Partially superseded | Title gets a `Letter Overview` eyebrow above it; fallback for missing title is "Untitled letter" (sentence case). Class unchanged. |
| ASCII Flow — Letter Overview View 1 (and other views) | (Showed `← Sent` + `Understanding AI Risks` + selector + per-story data) | Partially superseded | Header gains the eyebrow. View 1/2/3 selector logic and row layout unchanged. |
| Component Map — `[← Sent] back link` | "`Link` from `react-router-dom` — styled as `text-sm text-muted-foreground hover:text-foreground flex items-center gap-1` with a `←` glyph or `ChevronLeft` icon." | Partially superseded | Use `← Back` text. Choose ONE arrow source — the icon OR the literal glyph in the label, not both. |
| UI Contract — Back link | "`[← Sent]` Top-left on overview page" | Superseded | `[← Back]` Top-left on overview page. |
| (Implementation only — not in spec) Top aggregate overview table | n/a — never specified | Removed | Not part of P700 spec; remove from implementation. |
| (Implementation only — not in spec) Story heading rendered as `#tag` | n/a — never specified | Removed | Render `story.title` as heading, linked to story page. |
| Component Map — Story title in CohortRow | "story subtitle `[text-sm text-muted-foreground italic]`" (in View 1) | Extended | Story title is now also a link in per-story breakdowns. View 1 selector-driven subtitle unchanged. |
| Component Map — Recipient row name | "name `[text-sm font-medium text-foreground]`" | Extended | Name is now wrapped in a link to user profile when a profile exists. |
| Component Map — Position display (CLAIM/ANTI labels) | "`PositionBadge` extension OR inline" | Extended | Where CLAIM/ANTI labels include the point name (View 2/3), the point name is a link to the point page. View 1 short label format unchanged. |

## Requirements

1. Page header includes a `Letter Overview` eyebrow above the letter title.
2. When letter title is missing/blank, header shows `Untitled letter` (sentence case), not `Untitled Doc{N}`.
3. Back link renders as `← Back` — one arrow, one word. No duplication.
4. The top aggregate overview table is removed.
5. Per-story section heading is the story title (not the tag), and the title is a link to the story's public page.
6. In Views 1, 2, 3 and per-story sections: respondent names link to the user profile page when one exists; otherwise render as plain text.
7. Point names (CLAIM/ANTI labels in View 2 and View 3) link to the point page.
8. Story titles (selector subtitle in View 1, headings in per-story sections, story sections in View 2) link to the story page.
9. Person column header text remains "Person"; the cells show display name (per P700 fallback), not raw username/handle.

## What Stays the Same

- The two-selector model (Story + Person) and three views (cohort-on-story, person-across-stories, zoom) — unchanged
- RPC shape (`get_letter_overview`) — unchanged
- Position formats (`+2 agree`, `◌ no position`, movement `−2 → −1`) — unchanged
- Density intent (dense-efficient, table-like, no per-row cards) — unchanged
- No grids, charts, means, or averages — unchanged
- Sent-tab `[Open overview]` CTA and collapsed-by-default behavior — unchanged
- Auth gating, RLS, RPC author-scoping — unchanged
- Drill-in URL patterns (`/letter/:id/results?delivery=…&story=…`) — unchanged
- Page wrapper (`ClarityLandingLayout`) — unchanged
- Loading / error / empty states — unchanged

## Surfaces in Scope

**In scope:**
- `src/app/pages/letter-overview-page.tsx` (header zone, back link, view rendering, link wiring for story/point/respondent names)
- Possibly co-located helper components in the same file (e.g., `CohortRow`, `OverviewPersonJourney`, `OverviewZoomCard`, story section header) — modify to add links

**Out of scope:**
- `supabase/migrations/*_p700_get_letter_overview.sql` — RPC unchanged
- `src/app/data/letters-service.ts` — service shape unchanged
- `src/app/types/index.ts` — types unchanged (display name already returned by RPC)
- `src/app/components/letters/sent-tab.tsx` — sent-tab behavior unchanged
- `src/App.tsx` — route unchanged
- All P700 visual styling (spacing, density, typography) — owned by separate `/critique-ux` → `/polish` pass after this CR ships

## Acceptance Criteria

- [x] Page header shows `Letter Overview` eyebrow above the letter title
- [x] When letter title is blank, header shows `Untitled letter` (sentence case), not `Untitled Doc{N}`
- [x] Back link renders as `← Back` (one arrow, one word) and navigates to Sent tab
- [x] No top aggregate overview table is rendered above the per-story breakdowns
- [x] Per-story section heading shows the story title (not the tag) and is a link to the story's public page
- [x] Respondent names in Views 1/2/3 are links to the user profile page when one exists; render as plain text otherwise
- [x] Point names (CLAIM/ANTI labels) in Views 2 and 3 are links to the point page
- [x] Story titles (View 1 subtitle, per-story headings, View 2 story sections) are links to the story page
- [x] Person column cells show display name (per P700 fallback chain), not raw username/handle
- [x] All P700 acceptance criteria still pass (Views 1/2/3 layout, position formats, drill-in patterns, mobile width, no grids/means)
- [x] Existing E2E tests (`e2e/p700-letter-overview.spec.ts`, `e2e/a11y/p700-letter-overview-accessibility.spec.ts`) still pass; new tests added for entity links and header
- [x] Surfaces NOT in scope (RPC, service, types, sent-tab, route) are unchanged in the diff

## Next Steps

- Has layout / visual hierarchy changes (header restructure, link wiring across rows) → run `/ux features/p836_letter_overview_structural_redesign.md`
- After this CR ships, run `/critique-ux p836` → `/polish p836` for visual polish on the remaining "whole page looks shitty" items
