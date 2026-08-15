---
status: rejected
type: story
rank: 1000746.0
workstream: C2
created_date: '2026-04-17'
tags: [letters, sent, aggregate, inbox, rejected]
superseded_by: p700
delivery_stage: challenge-prd
flow: dev
pipeline_plan: [create-spec, challenge-prd, ascii-flows, ux, architect, ui, view, generate-tests, dev, verify]
pipeline_ran: [create-spec, challenge-prd, ascii-flows]
pipeline_skipped: [spec-review -- fresh spec not CR, spec-compact -- under 100 lines, decompose -- reconsider after architect names file count]
---

> **REJECTED 2026-04-18** — superseded by [P700](../done/2026-04-22/p700_letter_results_aggregate_overview.md). P746 and P700 targeted the same route (`/letter/:id/overview`), same entry point (Sent-tab `[Open overview]` CTA), and same audience (letter author reviewing cohort responses). During `/ascii-flows` on P746, the founder re-surfaced the P624→P700 grid concept, then iterated past both — landing on a list-everywhere model now documented in P700. The P746-specific decisions (default-collapsed sent cards, `[Open overview]` drafts-tab CTA pattern, deep-link drill-in, list-only rendering for small N) are preserved in P700.

# P746: Letter sent — per-letter overview (text list) + deep-link to recipient story

## Problem

**Situation:** The sent tab (P664) already groups by letter. Each `LetterCard` lists registered recipients and respondent fills as children, with a click-through to the per-delivery results page. `get_inbox_items` returns received letters only — the sent tab is the author's own view of outbound work.

**Complication:** Three gaps remain:
1. **No per-letter aggregate view.** The author sees each recipient's results in isolation. There is no view that answers *"across everyone who filled this letter, how did the ratings and positions distribute?"* — the author's primary question when reviewing cohort output.
2. **Cards default expanded on load.** With several sent letters, the initial render is visually noisy; every recipient list is open before the author has picked a letter to review.
3. **No deep-link to a specific story for a specific recipient.** To inspect "what did recipient Y say about story X," the author must open Y's full results page and scroll.

**Question:** Where does aggregate data live (sent tab is wrong — too dense for a card), and how does the author jump from the aggregate straight to a specific story of a specific recipient?

## Appetite

Small: enhance `LetterCard` (default-collapse + inline CTA matching drafts-tab pattern), add one new page + route (Letter Overview rendered as a plain text list), reuse `get_letter_results` where possible. No schema changes, no visualization library, no new interaction patterns. Fully reversible — remove the route and the CTA; sent tab reverts to P664 shape.

## Solution

Three changes, all KISS:

**Sent tab (navigation surface):**
1. **Default-collapsed cards** on first load and reload. Expansion state is session-ephemeral.
2. **`Open overview` inline CTA** on each card, matching the drafts-tab `Prepare Letter` pattern:
   - Desktop: solid blue button, right-aligned in the card header, placed **before** the `[···]` menu
   - Mobile: moved into the `[···]` dropdown as a menu item
   - Navigates to `/letter/{letterId}/overview`; shown on every card regardless of completion count
3. Existing recipient list and per-delivery drill-in unchanged.

**New Letter Overview page** (`/letter/{letterId}/overview`) — **plain text list, no charts, no axes, no colors**:
4. **Stories section** — one sub-heading per story; under each, one line per completed fill: `{recipient name} — {rating 0..10}`.
5. **Points section** — one sub-heading per point; under each, one line per completed fill: `{recipient name} — {±N} {label}` where label is `agree` / `antipoint` / `neutral` (mapping: +1..+3 = `agree`, 0 = `neutral`, -1..-3 = `antipoint`).
6. **Deep-link** — each recipient name on the overview is a link to `/letter/{letterId}/results?delivery={deliveryId}&story={storyId}` (story row) or `&point={pointId}` (point row).

Aggregation is a server-side read over `letter_point_responses` and `story_verifications` filtered to completed deliveries. Reuse `get_letter_results` if feasible; thin aggregation helper if not — decided at `/architect`.

## Risks / Non-Goals

### Risks
- **Deep-link anchor fragility.** Results page must support scroll-to-story / scroll-to-point via URL param. **Mitigation:** `/architect` confirms or adds the anchor.
- **Overview page is a new surface** — needs its own empty/loading/error states. **Mitigation:** mirror existing results-page patterns; no novel interaction model.
- **Long lists at scale.** 30+ recipients per element on one page means a long scroll. **Mitigation:** MVP audience is small; revisit when counts grow.

### Non-Goals
- **Do NOT** render charts, axes, dot plots, histograms, or any visualization on the overview — plain text list only.
- **Do NOT** color-code or badge recipients — names as-is, no legend.
- **Do NOT** compute means, medians, or any aggregate summary — list raw per-recipient values only.
- **Do NOT** render aggregate data inline in sent-tab cards — sent tab stays a lean navigation surface.
- **Do NOT** reintroduce a "By recipient / By letter" toggle — the flat list was deliberately removed in P664.
- **Do NOT** introduce a new guest label. Keep the current `receiver_name || receiver_email || 'Anonymous'` fallback. P747 owns identity.
- **Do NOT** modify `get_inbox_items` contract.
- **Do NOT** persist card-collapse state across sessions or in URL.
- **Do NOT** add export / CSV — future consideration.
- **Do NOT** add workshop-pacing controls — separate future work.

## Done-When

**Sent tab:**
- [ ] Cards default to **collapsed** on first load and on reload
- [ ] Each card (collapsed) shows `{N} sent · {M} completed · {P} in progress`
- [ ] Desktop: solid blue `Open overview` button sits inline in the card header, right-aligned, before the `[···]` dropdown (same visual placement as `Prepare Letter` in drafts-tab)
- [ ] Mobile: `Open overview` moves into the `[···]` dropdown menu
- [ ] Button navigates to `/letter/{letterId}/overview`
- [ ] Shown on every card regardless of completion count
- [ ] Expanding a card still reveals the existing P664 recipient list (unchanged)
- [ ] Clicking an existing recipient row still opens the per-delivery results page (unchanged)

**Letter Overview page (new):**
- [ ] Route `/letter/{letterId}/overview` renders for the letter's author
- [ ] Header shows letter title + status line `{N} sent · {M} completed · {P} in progress` + back link to sent tab
- [ ] Page has two sections: `Stories` and `Points`
- [ ] Each story in the letter has a sub-heading; under it, one line per completed fill: `{recipient name} — {rating 0..10}`
- [ ] Each point in the letter has a sub-heading; under it, one line per completed fill: `{recipient name} — {signed value} {label}` where label ∈ {agree, antipoint, neutral}
- [ ] Recipient name on each line is a link to `/letter/{letterId}/results?delivery={deliveryId}&story={storyId}` (story) or `&point={pointId}` (point)
- [ ] Zero completed: stories/points sub-headings render, each with `Waiting for first completion` placeholder; no recipient lines
- [ ] Non-author access to overview is blocked (RLS / route guard — decided at `/architect`)

## UX Notes

**Sent tab default state:** all cards collapsed on mount. Collapsed card shows title + status line + `[Open overview]` CTA (desktop) or `[···]` menu holding `Open overview` (mobile). No recipient list until expanded.

**Sent tab CTA placement (desktop):** inline in the header row, right-aligned. Order from left to right: chevron + title + status-line block · flexible gap · `[Open overview]` solid blue button · `[···]` ghost dropdown. Mirrors drafts-tab `Prepare Letter` / `[···]` layout.

**Sent tab CTA placement (mobile):** dropdown menu item inside `[···]`, label `Open overview`. Matches drafts-tab mobile pattern.

**Letter Overview page layout — plain text list:**

```
← Sent
Honest Feedback Before Q3
3 sent · 2 completed · 1 in progress

Stories
  Calibrated expectations
    Anna Müller — 7
    Tom Reiner — 6
    (Anonymous) — 3

  Under pressure
    Anna Müller — 4

Points
  I act before thinking
    Anna Müller — +1 agree
    Tom Reiner — −2 antipoint
    (Anonymous) — 0 neutral

  I avoid giving negative feedback
    Anna Müller — −3 antipoint
```

- No charts, axes, colors, or legends
- Recipient names are inline links (blue, underline on hover) — click opens the per-delivery results anchored to that story/point
- Point labels: `+1..+3 agree`, `0 neutral`, `−1..−3 antipoint`

**Empty / edge states:**
- Zero completed fills on a story: show the story sub-heading with `Waiting for first completion` in muted text, no recipient lines
- Zero completed fills overall: every sub-heading shows the `Waiting for first completion` placeholder
- One completed fill: single line under the sub-heading; no different from many fills except count

## Acceptance Criteria

- [ ] Sent tab cards are all collapsed on first mount and after reload
- [ ] Desktop `[Open overview]` button is solid blue, matches `Prepare Letter` chrome, sits before `[···]`
- [ ] Mobile: `Open overview` appears in the `[···]` dropdown
- [ ] Clicking `Open overview` navigates to `/letter/{letterId}/overview`
- [ ] Overview page renders the letter title, status counts, and back-link
- [ ] Stories section lists each story with completed fills as `name — rating` lines
- [ ] Points section lists each point with completed fills as `name — signed value label` lines
- [ ] Clicking a recipient name under a story lands on that recipient's results anchored to that story
- [ ] Clicking a recipient name under a point lands on that recipient's results anchored to that point
- [ ] Zero completed fills overall: every sub-heading shows `Waiting for first completion`
- [ ] Values spot-check against the underlying per-delivery data
- [ ] Anonymous respondents show as `(Anonymous)` (no new label scheme)
- [ ] Non-author visiting the overview route is redirected or blocked
- [ ] Existing drill-in from a recipient row in sent-tab still works

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Status line | `{N} sent · {M} completed · {P} in progress` | Card header (sent tab) + overview header |
| Default collapsed state | all cards collapsed | On sent-tab mount / reload |
| Sent-tab desktop CTA | `Open overview` · solid blue Button · before `[···]` | Card header, right-aligned |
| Sent-tab mobile CTA | `Open overview` menu item in `[···]` dropdown | Card header |
| Overview route | `/letter/{letterId}/overview` | New page |
| Overview section headers | `Stories`, `Points` | Top-level on overview |
| Story sub-heading | story title (existing) | One per story |
| Point sub-heading | point title (existing) | One per point |
| Story line format | `{recipient name} — {rating}` | Rating is integer 0..10 |
| Point line format | `{recipient name} — {signed value} {label}` | `+N agree` \| `0 neutral` \| `−N antipoint` |
| Empty per sub-heading | `Waiting for first completion` (muted) | Rendered when no completed fills for that element |
| Anonymous line label | `(Anonymous)` | Respondents without a stored name |
| Deep-link URL | `/letter/{letterId}/results?delivery={deliveryId}&story={storyId}` | Recipient name click under a story |
| Deep-link URL | `/letter/{letterId}/results?delivery={deliveryId}&point={pointId}` | Recipient name click under a point |

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Problem described state that doesn't exist — `get_inbox_items` dropped sender rows 2026-04-12; sent tab is already letter-grouped via P664 | Rewrote Problem against current state | Original spec was based on a stale mental model; new scope is additive to P664 |
| 2 | /challenge-prd | [BLOCK] "By recipient / By letter" toggle solves a non-problem | Removed the toggle from scope; added explicit non-goal | The flat list was deliberately removed; no user has asked for it back |
| 3 | /challenge-prd | [BLOCK] Done-when #1 ("one row per sent letter") was already current behavior | Replaced with default-collapsed + aggregate panel + deep-link criteria | Matches the author's actual gap |
| 4 | /challenge-prd | [WARN] Mean point position destroys polarization signal in bimodal distributions | Show distributions (per-recipient markers on axis), never means | Workshop insight depends on seeing disagreement, not averaging it away |
| 5 | /challenge-prd | [WARN] Story self-rating aggregation contradicts "screening, not verification" | Show distribution of individual ratings; no averaged "verification score" | Rating stays a per-person screening signal, surfaced together for pattern-spotting |
| 6 | /challenge-prd | [WARN] Guest labelling introduces three-way migration debt pending P747 | Keep existing `receiver_name \|\| receiver_email \|\| 'Anonymous'` fallback | P747 owns identity; no interim scheme |
| 7 | /challenge-prd | [WARN] Aggregation RPC under-specified | Deferred to `/architect` — reuse `get_letter_results` if feasible; thin helper if not | Architect is the right layer for RPC signature + security model |
| 8 | founder directive | Default-expanded cards are visually noisy on load | Default-collapsed on load and reload; session-ephemeral expansion state | Author picks which letter to review rather than scanning all at once |
| 9 | founder directive | Author needs to jump from aggregate directly to a specific story of a specific recipient | Added deep-link URL with `delivery` + `story`/`point` params | Removes the "open recipient → scroll to story" friction |
| 10 | founder directive (KISS) | Distributions are too dense to render inside sent-tab cards | Aggregate lives on a new Letter Overview page at `/letter/{letterId}/overview`; sent tab gets a "Open overview" CTA | Sent tab = navigation; overview = data. Mirrors the existing pattern (per-delivery results is already its own page) |
| 11 | /ascii-flows | 30 variants scored; F30 hybrid (4.85) wins | Dot plot on fixed axis + color-per-recipient + direct deep-link (hover shows destination, click navigates) + stacked-dot collision with popover | Polarization legible at a glance; no mean destroys signal; no two-step popover adds friction; color replaces "pin a recipient" interaction |
| 12 | founder directive (KISS, post-ASCII) | F30 hybrid is still too complex for MVP | Overridden. Overview renders as a plain text list — per story, per point, one line per recipient with name+value. Recipient name is the deep-link. No axes, no dots, no colors, no hover tooltips, no collision handling. | User's words: "too complicated — I just need to see a list and numbers/positions (e.g. 'antipoint agree; story 7; point disagree')." Simpler ships; we can add viz later if the text list proves insufficient |
| 13 | founder directive | Sent-tab CTA placement | Desktop: solid blue `[Open overview]` Button inline in card header, right-aligned, **before** `[···]` — matches drafts-tab `Prepare Letter` pattern. Mobile: top item in `[···]` dropdown. | Authors already know this placement from drafts-tab; zero new affordance to learn |

## ASCII Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ ▶ 🔒 Honest Feedback Before Q3         [Open overview]  [···]  │
│    3 sent · 2 completed · 1 in progress                         │
└─────────────────────────────────────────────────────────────────┘
```

Overview page layout → see UX Notes.
