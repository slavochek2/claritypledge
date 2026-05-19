---
status: week
type: task
rank: 1000766.0
workstream: letter
created_date: '2026-05-19'
tags:
  - letter
  - instrumentation
  - mixpanel
  - p842
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

**Firing mechanism:** Component-level — the reveal panel itself emits the event on visibility (mount with intersection-visible OR explicit "show reveal" state transition, whichever matches current implementation). Single code path, fires N times per letter rather than N events instrumented N times.

**Timing semantics:** `time_to_next_click_ms` is captured by starting a timer when the reveal first becomes visible and stopping it when the reader clicks the advance button. If the reader navigates away without clicking advance (closes tab, hits browser back), the event still fires with `time_to_next_click_ms = null` on a `pagehide`/`beforeunload` flush — or omit the property entirely; either is acceptable.

**Verification surface:** Mixpanel project 3968494 (EU region). After deploy, confirm events arriving with correct properties; add to Activation dashboard (10989933) under a new "Letter reveal" section.

## Risks / Non-Goals

### Risks
- **Visibility-detection false positives** — if the reveal panel mounts off-screen and the reader scrolls past, we may count it as "viewed" when it wasn't. Mitigation: use `IntersectionObserver` with a reasonable threshold (e.g., 50% in viewport for ≥200ms) rather than mount-fires-event.
- **Dwell timer noise from tab-switching** — readers who open the letter, switch tabs for an hour, then return and click "Next" will inflate dwell. Mitigation: pause timer on `visibilitychange` to hidden; resume on visible. Acceptable to defer if implementation cost is high — baseline will still show distribution shape.
- **Property explosion in Mixpanel** — `gap` as a continuous numeric may not aggregate well. Mitigation: keep raw value; bucket in dashboard, not at instrumentation.

### Non-Goals
- Do NOT add backend/edge-function instrumentation — Mixpanel is browser-only here.
- Do NOT add a database table for dwell data — Mixpanel is the storage layer.
- Do NOT instrument any reveal moment outside `/letter/*` (e.g., /live has its own reveal; that's separate scope).
- Do NOT redesign the reveal panel — that's P842 Phase B's territory.
- Do NOT block on perfect timing semantics — a noisy baseline beats no baseline.

## Done-When

- [ ] Event `letter_reveal_viewed` fires from the reveal panel surface on the live letter route in test build
- [ ] Properties populated correctly: `letter_id`, `stage_type`, `stage_index`, `time_to_next_click_ms`, `gap`
- [ ] Visibility-detection avoids firing when panel is off-screen (manual scroll test in browser)
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
