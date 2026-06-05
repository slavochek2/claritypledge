---
status: today
type: story
rank: 1000787.0
workstream: letters
created_date: '2026-06-05'
tags: [letters, compose, point-order, reader-flow]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P898: Author-Controlled Split Between Pre-Story and Post-Story Points

## Problem

**Situation:** In the letter reading flow, when a story has ≥2 points, exactly one point (`points[0]`) renders before the story as the calibration lead; the rest render after. *Which* point leads is author-controlled via `doc_stories.point_config.order` (P837 made this deterministic), but *how many* lead is hardcoded at 1.

**Complication:** The letter-composing agent surfaced an expressiveness ceiling: rhetorical structures that need a multi-point setup — e.g. a fact-point paired with an anti-point before the story, or multiple anti-points as the lead — cannot be expressed at all. No human author has asked for this yet; the evidence is a composition pattern the model forbids, not a damaged letter. This spec treats that as an explicit hypothesis to validate, not established harm.

**Question:** How do we let the author choose the split position between pre-story and post-story points without diluting the single-prediction calibration mechanic?

## Appetite

Medium blast radius (touches sealed-snapshot shape, composer, and reader walk — but additive: default preserves current behavior for every existing letter). High reversibility (field defaults to 1; removing the control reverts to status quo, no data loss). Medium decision density — the reader-side UX with 2+ leads is an open design question ([FOUNDER DECISION] territory), and the max-N cap needs a call.

## Solution

Add a single split index — `lead_count` (default `1`) — inside the existing `doc_stories.point_config`. The first N points of the already-ordered `point_config.order` render pre-story; the rest post-story. Compose-time control only: author sets it while composing, value is sealed into the snapshot like the order itself.

- No new ordering machinery — reuses P837's order as the single source of truth; `lead_count` only marks where the split falls.
- Reader honors `lead_count` with fallback to `1` when absent → zero behavior change for the entire back catalog of sealed letters.
- UX layer must answer first-class: what does the reader's prediction/reveal step look like with 2+ pre-story points? If no good answer exists, cap at `lead_count ≤ 2` for now.

## Risks / Non-Goals

### Risks
- **Calibration dilution (primary risk, could reshape the feature):** the pre-story point is the prediction prompt; the reveal works because the reader holds one position while reading. Multiple leads may turn calibration into a quiz preamble. Mitigation: resolve at `/ux` before implementation; cap N if the mechanic doesn't generalize.
- **Snapshot shape drift:** sealed letters are an integrity guarantee; a malformed `lead_count` (> points.length, 0, negative) could break the reader walk. Mitigation: clamp on read (`min(max(lead_count,1), points.length)`), validate on seal.
- **Knob nobody turns:** built on hypothesis, not demand. Mitigation: Done-When requires at least one real letter composed with a multi-point lead.

### Non-Goals
- Do NOT migrate or reflow sealed letters — existing letters keep effective `lead_count: 1` via fallback. No backfill.
- Do NOT build interleaving (points *within* the story) or named sections — split index only.
- Do NOT add new ordering UI beyond the split control — point reorder already exists.
- Do NOT change the prediction data model or scoring — only where points render relative to the story.

## Done-When

- [ ] Author can set, at compose time, how many points render before the story (default 1)
- [ ] Sealed snapshot carries the split; reader renders N points pre-story, rest post-story
- [ ] All existing sealed letters render identically to today (fallback verified by regression test)
- [ ] Out-of-range `lead_count` values are clamped — reader never breaks on malformed data
- [ ] Reader prediction/reveal UX with 2+ leads is designed and approved (or N capped at the value the UX supports)
- [ ] At least one real letter is composed (by founder or letter-agent) using a multi-point lead — validates the hypothesis

## UX Notes

- Compose: the split is a property of the existing point-order list — likely a draggable divider or "before story / after story" grouping in the current reorder UI, not a separate numeric input. [FOUNDER DECISION: exact control]
- Reader, ≥2 leads: open question — single prediction after all leads? prediction per lead? `/ux` must resolve.
- States: 1 lead (today's behavior, default), 2+ leads, all-points-lead (story last), single-point story (control hidden — split is meaningless).

## Acceptance Criteria

- [ ] Author controls the pre/post-story split during composition; default behavior unchanged
- [ ] No sealed letter changes appearance without author action
- [ ] Letter-composing agent can express fact-point + anti-point as a paired pre-story setup
