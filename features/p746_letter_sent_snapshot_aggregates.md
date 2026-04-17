---
status: week
type: story
rank: 1000746.0
workstream: C2
created_date: '2026-04-17'
tags: [letters, sent, aggregate, inbox]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P746: Letter sent — aggregate view per snapshot

## Problem

**Situation:** The inbox RPC (`get_inbox_items`, P699) already returns both received letters and per-delivery rows for letters the sender sent. For one-to-many (public) letters, each anonymous fill produces a `link_respondent` / `link_respondent_in_progress` row. Authored one-to-one letters produce `recipient_in_progress` / `recipient_responded` rows per named recipient.

**Complication:** When a sender broadcasts a public letter or a workshop sender shares one letter with 10 participants, the inbox shows a flat list of per-delivery rows. There is no single view that answers *"across everyone who filled this letter, how did they respond?"* — which is the author's primary question when reviewing cohort output.

**Question:** How does the sender see aggregate responses for one letter across all of its recipients, and drill into an individual when they want to act?

## Appetite

Low blast radius (new view in the sent tab; no schema changes; no new RPCs beyond an aggregation helper over existing tables). Fully reversible (remove the view; data untouched). Low decision density — re-grouping of data already in `letter_deliveries` + `letter_point_responses` + `story_verifications`.

## Solution

Add a *Snapshot* view in the sent tab that groups deliveries by `letter_id` (one row per sent letter). Each row shows:

- Letter title and snapshot metadata (story count, point count)
- Counts per status (sent / opened / in-progress / completed)
- Aggregate stats across completed fills: mean point position per point, mean story self-rating per story, response distribution
- A *View recipients* drill-in that lists individual deliveries (registered recipient name, or guest label with nickname once P747 lands)
- Drill into an individual → existing per-delivery results page

The aggregation query is computed server-side over `letter_point_responses` and `story_verifications` filtered to completed deliveries of the letter.

## Risks / Non-Goals

### Risks
- **Aggregate query performance** for letters with hundreds of recipients. **Mitigation:** query is limited to `delivery.status IN ('completed', 'in_progress')`; add an index hint if needed; the N for the MVP audience is small (workshops ≤ 20, public letters ≤ few dozen).
- **Mixed registered + anonymous recipients** look odd side-by-side. **Mitigation:** F3/P747 provides nicknames; until then, anonymous recipients show as *Guest — {short hash}*.

### Non-Goals
- **Do NOT** introduce a cohort / group / tag concept — grouping is by letter snapshot only
- **Do NOT** add workshop-pacing controls (release letter 2 after X% finish letter 1) — separate future work
- **Do NOT** change existing per-delivery rows in inbox — this is an additive view, not a replacement
- **Do NOT** add export / CSV — future consideration
- **Do NOT** modify `get_inbox_items` contract — add a sibling RPC for the aggregate view

## Done-When

- [ ] Sent tab has a *Snapshot* toggle / sub-view showing one row per sent letter
- [ ] Each row displays status counts across deliveries
- [ ] Each row shows mean point position per point and mean story rating per story across completed fills
- [ ] Clicking a row opens a list of individual deliveries; clicking a delivery opens its existing per-delivery results page
- [ ] Anonymous fills are displayed with a stable placeholder label (nickname support lands later via P747)
- [ ] Regression: the existing flat-list inbox view remains intact and unchanged

## UX Notes

**Entry point:** existing sent tab gains a view toggle: *By recipient* (current flat list) / *By letter* (new snapshot aggregate).

**Snapshot row:**
- Primary line: letter title
- Secondary line: `{N} sent · {M} completed · {P} in progress`
- Expandable panel: per-point mean bar + per-story rating pill

**Drill-in:**
- Row click → slide-in or sub-page listing individual deliveries
- Delivery click → existing per-delivery results page (unchanged surface)

**Empty/edge states:**
- Zero completed fills: show counts only, no aggregates
- One completed fill: show the single value, not a distribution

## Acceptance Criteria

- [ ] User with a sent one-to-many letter sees an aggregate row for that letter
- [ ] User with multiple sent letters sees one row per letter
- [ ] Aggregate values match a spot-check against the underlying per-delivery data
- [ ] Drilling into a row surfaces individual recipients
- [ ] Guest recipients are labelled consistently
- [ ] View-toggle state persists within the tab for the session

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| View toggle labels | `By recipient` / `By letter` | Sent tab |
| Status line | `{N} sent · {M} completed · {P} in progress` | Snapshot row secondary |
| Aggregate label | `Mean across completed fills` | Expanded snapshot panel |
| Guest placeholder | `Guest — {shortHash}` | Recipient list until P747 |
| Empty aggregate copy | `Waiting for first completion` | Row with zero completed fills |
