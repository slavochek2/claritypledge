---
status: backlog
type: story
rank: 1000700.0
tags: [letters, results, one-to-many, grid, visualization, workshop, dispatch]
created_date: '2026-04-12'
delivery_stage: challenge-prd
pipeline_plan: [create-spec, challenge-prd, ux, architect, ui, generate-tests, spec-review, decompose, dev, verify]
pipeline_ran: [create-spec, challenge-prd]
pipeline_skipped: []
---

# P700: Facilitator Dispatch Board — Letter Results Grid & Verification Entry

> **Depends on:** [P699](p699_letter_results_story_walk.md) (individual story walk — shares RPC pattern)
> **Related:** [P624](p624_understanding_agreement_grid.md) (rejected — grid visualization folded into this spec), [P663](p663_letter_live_interleave.md) (rejected — pre-loaded /live concept folded into P702)
> **Followed by:** [P703](p703_verify_live_from_letter_results.md) (pre-loaded /live + inbox invite — absorbed P702)

## Problem

**Situation:** A facilitator sends a letter with stories and points to multiple workshop participants. Participants respond asynchronously — rating stories, setting positions on points. After responses arrive, the facilitator needs to see where everyone stands and choose who to verify with on which point via /live.

**Complication:** P699 builds individual story walks — one receiver's results at a time. But the facilitator's job is comparative: "who has the biggest gap?", "where is the group polarized?", "which point should I verify next?" There's no surface that shows all participants' positions on a point, visualizes movement after verification, or lets the facilitator jump into /live from the right context.

**Question:** How do we give the facilitator a read-only dispatch board that shows per-point participant positions with verification movement, and connects to /live (via P663) for the action step?

## Appetite

Medium blast radius (new page — no existing flows change). Fully reversible (new route, new components, remove to undo). High decision density — grid visualization design, data mapping, interaction patterns all need resolving. Supersedes P624 (understanding × agreement grid), which is rejected and folded into this spec.

## Solution

### The dispatch board

A facilitator-facing page for a one-to-many letter showing per-point participant data with an understanding × agreement grid visualization. The board is **read-only** — the verify action routes through P663's pre-loaded /live mechanism.

### Grid visualization (supersedes P624)

Each grid shows **one point**. Axes:

- **X-axis: Understanding** (0–10) — how well the listener understood the point's parent story, as verified by the speaker
- **Y-axis: Agreement** (–3 to +3, mapped from `position_type` enum) — the listener's position on this specific point
- **X-axis (Y=0) runs through the center** — disagreement below, agreement above. "Unsure" sits on the center line.

Position type mapping to Y-axis:

| `position_type` | Y value |
|-----------------|---------|
| `strongly_agree` | +3 |
| `agree` | +2 |
| `somewhat_agree` | +1 |
| `unsure` | 0 |
| `somewhat_disagree` | -1 |
| `disagree` | -2 |
| `strongly_disagree` | -3 |

### Dots and vectors on the grid

For a given point, each listener's journey has up to three checkpoints:

| Checkpoint | X (understanding) | Y (position) | Source |
|------------|-------------------|--------------|--------|
| ① Initial | Listener's self-rated understanding of story | Listener's position on point | Letter response |
| ② After paraphrase | Speaker's rating of listener (`clarity_live_turns.other_rating`) | Listener's position at that moment | /live turn data |
| ③ Final | Speaker's final rating (`story_verifications.speaker_rating`) | Listener's final position | /live completion |

- **Solid dot (●):** Position is known (listener set a position on this point)
- **Hollow dot (◌) at Y=0:** Position unknown (listener responded to story but didn't set position on this point). Visually distinct from "unsure" (solid dot at Y=0). This is a core case, not an edge case — the author's letter prediction has no position data for the listener.
- **Vector arrows** connect checkpoints ①→②→③ showing movement
- Common case (understanding improves, position unchanged): **horizontal vector** — easy to read
- Interesting case (position shifts during /live): **diagonal vector** — visually striking
- Rare case (position flips): dramatic diagonal across the center line

### Author's prediction

The author predicted the listener's understanding when creating the letter, but did NOT predict the listener's position. This prediction is shown as a **dashed vertical reference line** at the predicted X-value — communicating "this is what the author expected" without placing it on the listener's journey vector.

### Selection: point and person

Two selectors, both always visible (no forced sequence — layout deferred to /ux and /ui):

- **Point selector:** Choose which point's grid is displayed. Selecting a point auto-selects its parent story (1:1 relationship per author). All points across all stories in the letter are available.
- **Person selector:** Filter whose dots appear on the grid.
  - **Default: all listeners** — one journey per listener on the grid. With the flipped axes, listeners at different agreement levels stack vertically and are naturally separated.
  - **Select a specific listener:** Only their dots + vectors shown. Facilitator sees one person's full journey.
  - **Average toggle:** Single averaged journey line (mean understanding × mean agreement across all listeners). Useful for projector display — "here's where the group center sits."

### Below the grid: participant table

For the currently selected point:

| Name | Understanding | Position | Gap | Status |
|------|---------------|----------|-----|--------|
| Alice | 8 | Agree (+2) | +2 | Verified |
| Bob | 4 | Disagree (-2) | — | Letter only |
| Carol | — | — | — | Waiting |

- **Gap:** Difference between author's prediction and listener's self-rated understanding (letter data)
- **Status:** `Waiting` (no response), `Letter only` (responded, not yet verified), `Verified` (post-/live)
- Tapping a row selects that person in the grid and in the person selector
- Verify action per row deferred to P702 (pre-loaded /live + inbox invite)

### Entry point

Sender's Sent tab → letter card → "Overview" button (distinct from individual "Results" buttons per receiver). Routes to `/letter/:id/overview`.

### Data access

Extends P699's `get_letter_results` RPC pattern. For the dispatch board, needs:
- All receivers' letter responses (ratings, positions) for the given letter
- All `story_verifications` linked to this letter's stories (post-/live data)
- All `clarity_live_turns` for per-turn ratings (after-paraphrase checkpoint)
- Author's predictions per story

Single RPC call returning all data. Grid rendering is client-side from this payload.

## Risks / Non-Goals

### Risks

1. **Grid readability with 5+ listeners.** Even with flipped axes, 5 listeners × 3 checkpoints × vectors = 15+ elements per grid. Mitigation: person selector filters to one listener. Default all-dots view works for ≤5 listeners; beyond that, default to average + select individuals.
2. **Data availability.** Checkpoints ② and ③ only exist after /live verification (via P663). Most listeners will initially have only checkpoint ① (letter response). The grid must be useful with only checkpoint ① dots — the "before" picture is the primary view until /live sessions happen.
3. **Understanding is per-story, not per-point.** All points within the same story share the same X-coordinate (understanding). Two points from the same story will have dots at the same X but different Y positions. This is correct behavior but could confuse users who expect X to vary between points in the same story.
4. **RLS complexity.** The facilitator (letter author) needs access to all receivers' positions and verification data. Similar to P699's SECURITY DEFINER RPC pattern — validates author ownership before returning data.

### Non-Goals

- Do NOT build the verify action, /live pre-loading, or inbox invites — that's P702
- Do NOT add real-time updates (WebSocket/polling) — facilitator refreshes the page after each /live session
- Do NOT show the grid on individual receiver result pages (P699) — the grid is a facilitator-only, multi-receiver view
- Do NOT add group /live (verifying with multiple listeners simultaneously) — /live stays 1:1
- Do NOT build cross-letter aggregation — each dispatch board shows one letter's results

## Done-When

- [ ] Facilitator can open dispatch board for a one-to-many letter from Sent tab
- [ ] Point selector shows all points across all stories in the letter
- [ ] Selecting a point displays the understanding × agreement grid for that point
- [ ] Grid shows listener dots with correct mapping (understanding on X, position on Y, center line at Y=0)
- [ ] Hollow dots shown for listeners without position data (at Y=0, visually distinct from "unsure")
- [ ] Author's prediction shown as dashed vertical reference line
- [ ] Person selector filters grid to show one listener, all listeners, or average
- [ ] Vector arrows shown connecting checkpoints when /live verification data exists
- [ ] Participant table below grid shows name, understanding, position, gap, and verification status
- [ ] Page works with letter data only (no /live data yet) — checkpoint ① dots are the baseline view
- [ ] Grid updates on page reload after /live sessions complete

## Acceptance Criteria

- [ ] Facilitator sees all participants' positions on a selected point in one grid view
- [ ] Grid correctly maps understanding (X, 0–10) and agreement (Y, –3 to +3) with center line
- [ ] Switching between points updates the grid with correct data for each point
- [ ] Person filter works: all listeners (default), specific listener, average
- [ ] Vectors correctly show movement from letter checkpoint to post-/live checkpoint
- [ ] Hollow vs solid dots correctly distinguish "position unknown" from "position set"
- [ ] Participant table accurately reflects each listener's current state
- [ ] Board is projector-friendly (readable at distance, clean layout)

## UX Notes

**Primary use case:** Facilitator projects this board during a workshop. The room sees where everyone stands on a point. Facilitator selects a person, the room sees that person's journey. After /live verification, facilitator refreshes — the room watches the dot move.

**States:**
- **Pre-response:** Listener row shows "Waiting" in table, no dot on grid
- **Letter responded, no /live:** Single dot (checkpoint ①) on grid. Most common initial state.
- **Post-/live verified:** Up to 3 dots with vectors. The movement is the payoff — this is the CK-about-CK moment.

**The CK-about-CK moment:** When the room watches a dot move from low understanding to high understanding (horizontal vector) or sees a position flip (diagonal vector crossing the center line), participants witness calibration in real time. They can't unsee it. This is the product's core demonstration — understanding IS measurable, and verification DOES change it.

**Grid with no position data:** When no listeners have set positions (all hollow dots at Y=0), the grid degrades to a 1D view — dots spread only along X (understanding). Still useful: facilitator sees spread of understanding levels. The Y-axis becomes informative once positions are set.

**Projector considerations:**
- Large dot sizes, high contrast
- Person names as labels near dots (not just legend)
- Grid should be readable from 3+ meters away
- [FOUNDER DECISION: Specific color scheme for dots? Current design system blue for positions, but may need distinguishable colors per person when showing all listeners.]
