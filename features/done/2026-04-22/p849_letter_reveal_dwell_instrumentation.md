---
status: all-done
type: task
rank: 1000766.0
workstream: letter
created_date: '2026-05-19'
completed_at: '2026-05-22'
tags:
  - letter
  - instrumentation
  - mixpanel
  - p842
pipeline_ran: [create-spec, dev, ship]
---

# P849: Letter reveal dwell instrumentation

## Problem

**Situation:** The letter flow (`/letter/*`) has a repeated UX primitive — reader submits an estimate (their confidence on an anti-point, their predicted understanding of a story, their position on a point), and a reveal panel then shows the author's actual value alongside the reader's estimate. This calibration moment is the entire reason the letter exists.

**Complication:** We have no telemetry on whether this moment is being seen. P842 founder review flagged "reveal invisibility" as a HIGH-severity UX failure — readers may be tapping through "Next" without actually viewing the reveal. P842 Phase B will redesign the surface to make the reveal unmissable, but with no baseline we cannot tell whether the redesign actually changed reader behavior. P842 ships blind without this.

**Question:** What's the minimum instrumentation that gives us a baseline of current reveal-engagement behavior before P842 redesign work begins?

## Appetite

**Blast radius:** Low — adds one Mixpanel event firing in an existing component. No data model changes, no API changes, no schema migrations.

**Reversibility:** Trivial — single revert reverts the instrumentation; Mixpanel events are append-only and ignoring future events costs nothing.

**Decision density:** Low — event name, property shape, and visibility-detection mechanism are the only judgment calls. No founder business decisions needed.

## Solution

Add a single Mixpanel event `letter_reveal_viewed` fired whenever the calibration reveal panel becomes visible to the reader within the letter flow.

**Event properties:**

| Property | Type | Purpose |
|---|---|---|
| `letter_id` | uuid | Which letter — enables per-letter analysis |
| `stage_type` | enum: `anti-point` \| `story` \| `point` | Which kind of stage triggered this reveal |
| `stage_index` | int | Position of the stage in the letter flow (1-based) |
| `time_to_next_click_ms` | int | Dwell duration between reveal becoming visible and reader advancing |
| `gap` | number | Numeric delta between reader estimate and author actual (signed) |

**Firing mechanism:** A `useEffect` inside `LetterFlowContent` keyed on the reveal stage. The effect starts a timer on entry to a reveal phase and fires `analytics.track('letter_reveal_viewed', ...)` in its cleanup function. Cleanup runs on phase exit (advance click triggers state transition → effect re-runs → cleanup fires). Same path also covers component unmount (route change).

**Timing semantics:** `time_to_next_click_ms` = `Date.now() - start` measured at cleanup. Closing the tab does NOT fire the event — accepted noise for a baseline metric.

**Verification surface:** Mixpanel project 3968494 (EU region). After deploy, confirm events arriving with correct properties; add to Activation dashboard (10989933) under a new "Letter reveal" section.

## Risks / Non-Goals

### Risks
- **Off-screen mount counts as viewed** — if the reveal panel renders below the fold and the reader never scrolls to it but advances anyway, the event fires. Letter flow is single-screen so the surface is small; accepted as baseline noise.
- **Tab-hidden time inflates dwell** — readers who open the letter, switch tabs, then return and click "Next" will produce inflated `time_to_next_click_ms`. Accepted as baseline noise. The redesign will be measured against the same noisy baseline, so the comparison is fair.
- **Closed-tab abandonment produces no event** — readers who close the browser mid-reveal don't generate data. Accepted: completion-rate signal lives in `letter_completed`, not here.
- **Property explosion in Mixpanel** — `gap` as a continuous numeric may not aggregate well. Mitigation: keep raw value; bucket in dashboard, not at instrumentation.

**Why no IntersectionObserver / visibilitychange / pagehide:** Earlier the spec listed these as mitigations. An attempt to implement them produced 158 lines of hook + 239 lines of tests for what is fundamentally a 15-line useEffect. The noise they fix is acceptable for a baseline metric. Documented here so future-me doesn't re-add the complexity without re-justifying it.

### Non-Goals
- Do NOT add backend/edge-function instrumentation — Mixpanel is browser-only here.
- Do NOT add a database table for dwell data — Mixpanel is the storage layer.
- Do NOT instrument any reveal moment outside `/letter/*` (e.g., /live has its own reveal; that's separate scope).
- Do NOT redesign the reveal panel — that's P842 Phase B's territory.
- Do NOT block on perfect timing semantics — a noisy baseline beats no baseline.

## Done-When

- [ ] Event `letter_reveal_viewed` fires from `LetterFlowContent` on phase exit (advance click)
- [ ] Properties populated correctly: `letter_id`, `stage_type`, `stage_index`, `time_to_next_click_ms`, `gap`
- [ ] Event arrives in Mixpanel after prod deploy (confirmed via Mixpanel Live View)
- [ ] At least 3 days of baseline data captured before P842 Phase B starts
- [ ] No regressions to existing letter flow (Submit/Next still work, reveal still renders correctly)

## Pre-deploy Checklist

### Deploy commands
- [ ] Trigger Vercel redeploy after merge (no new env vars; existing `VITE_MIXPANEL_TOKEN` covers it)

### Post-deploy verification
- [ ] Open a real letter in prod, complete one stage, confirm `letter_reveal_viewed` appears in Mixpanel Live View with correct properties
- [ ] Check Sentry for new errors related to letter rendering in first 10 minutes
- [ ] Confirm `time_to_next_click_ms` distribution is plausible (not all 0, not all >60000)

## Related

- **P842** — letter full-flow UX redesign. This metric is the success measure for P842 Phase B. P842 Phase B should not start until ≥3 days of baseline data exists.
- **P846** — letter chrome cleanup (shipped). Footer removed + sticky progress; cleared two of the original p842 critiques.

## Next Steps

After this spec is created:
1. `/dev p849` to implement instrumentation on a feature branch
2. Ship to prod; collect 3+ days of baseline data
3. Then proceed to P842 Phase A (SuperDesign exploration) in parallel — does not need metric live to start
