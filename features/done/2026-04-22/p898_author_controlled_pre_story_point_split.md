---
status: all-done
type: story
rank: 297108.547
workstream: letters
created_date: '2026-06-05'
tags:
  - letters
  - compose
  - point-order
  - reader-flow
pipeline_ran: [create-spec, spec-review, dev, ship]
completed_at: 2026-06-10
---

# P898: Author-Controlled Split Between Pre-Story and Post-Story Points

## Problem

**Situation:** In the letter reading flow, when a story has ≥2 points, exactly one point (`points[0]`) renders before the story as the calibration lead; the rest render after. *Which* point leads is author-controlled via `doc_stories.point_config.order` (P837 made this deterministic), but *how many* lead is hardcoded at 1.

**Complication:** The letter-composing agent surfaced an expressiveness ceiling: rhetorical structures that need a multi-point setup — e.g. a fact-point paired with an anti-point before the story, or multiple anti-points as the lead — cannot be expressed at all. No human author has asked for this yet; the evidence is a composition pattern the model forbids, not a damaged letter. This spec treats that as an explicit hypothesis to validate, not established harm.

**Question:** How do we let the author choose the split position between pre-story and post-story points without diluting the single-prediction calibration mechanic?

## Appetite

Medium blast radius (touches sealed-snapshot shape, composer, and reader walk — but additive: default preserves current behavior for every existing letter). High reversibility (field defaults to 1; removing the control reverts to status quo, no data loss). Low decision density after 2026-06-06 — compose control, range, default, and reader walk all resolved in founder conversation (see UX Notes); no cap.

## Solution

Add a single split index — `lead_count` (default `1`) — inside the existing `doc_stories.point_config`. The first N points of the already-ordered `point_config.order` render pre-story; the rest post-story. Compose-time control only: author sets it while composing, value is sealed into the snapshot like the order itself.

### Storage model (resolved at /spec-review — Model A: integer, no marked-set)

- **Stored:** `point_config.lead_count` — a single integer. NO `leads: [ids]` array. `order` remains the single source of truth for sequence (P837 decision intact); `lead_count` only marks where the split falls.
- **Type:** extend `DocPointConfig` (`src/app/types/index.ts`) with `lead_count?: number`.
- **The per-point toggle is purely UI sugar over (order, lead_count):** marking a point as lead moves it to the *end of the lead group* in `order` (relative order of other points preserved) and increments `lead_count`; unmarking moves it to the *front of the post group* and decrements. Both mutations go through the existing `updatePointConfig` path (`docs-service.ts`).
- **Seal RPC must be updated (migration required):** the seal RPC builds the snapshot's `point_config` with an explicit `jsonb_build_object('order', …, 'hidden', …)` (see `p833_seal_rpc_version_desync.sql`) — fields not listed there are silently dropped. Add `'lead_count', COALESCE(ds.point_config->'lead_count', '1'::jsonb)`. Without this, an author's `lead_count` vanishes at seal and the reader's fallback-to-1 makes the bug invisible.
- Reader honors `lead_count` with fallback to `1` when absent → zero behavior change for the entire back catalog of sealed letters.
- **Full range allowed: `0 ≤ lead_count ≤ points.length`** (resolved 2026-06-06). Zero leads = story-first flow; all leads = story last. An earlier min-1 assumption ("the pre-story point IS the prediction prompt, so ≥1 is required") was falsified against the reader code — 1-point stories already render story-first.

### Reader phase walk — explicit transition table (resolved at /spec-review)

`useLetterReadingState` is currently hardcoded to exactly 1 lead (`initialPhase` → `point-engage` whenever visibleCount ≥ 2; `advanceFromPointReveal` always jumps to story; `advanceFromStoryReveal` hardcodes `nextIdx = 1`). Generalize to N = effective (clamped) lead count, V = visible point count:

| N | Walk |
|---|------|
| 0 (V ≥ 1) | `story-rate → story-revealed → remaining-point-engage/revealed` for points `0..V-1` → `transition`. **This path does not exist verbatim today** — the V=1 story-first flow uses `point-engage` phases; this one must enter `remaining-*` directly after story-revealed. |
| 1 (today) | unchanged: `point-engage/revealed(0) → story-rate/revealed → remaining-*(1..V-1) → transition` |
| 2..V | `point-engage/revealed(i)` for `i = 0..N-1` → `story-rate/revealed` → `remaining-*(N..V-1)` → `transition` |

`calculateStoryProgress` generalizes accordingly: total screens = `2N + 2 + 2(V−N)`, with the story pair after screen `2N`.

## Risks / Non-Goals

### Risks
- **Calibration dilution — ACCEPT (validate by Done-When):** multiple leads may turn calibration into a quiz preamble. The mechanic generalizes technically (per-point engage/reveal already exists); whether it *feels* right is the hypothesis the Done-When letter validates. No design-time cap.
- **Snapshot shape drift — MITIGATE:** sealed letters are an integrity guarantee; a malformed `lead_count` (> points.length, negative, non-integer) could break the reader walk. Clamp on read (`min(max(lead_count, 0), visiblePoints.length)` — against *visible* points, after the hidden filter), validate on seal. Note: `0` is a *valid* authorial value, not malformed — the clamp guards only out-of-range data.
- **Progress-bar math — MITIGATE:** `calculateStoryProgress` hardcodes the 1-lead shape (screen indices assume exactly one pre-story point). Likeliest off-by-one site. Regression test must cover lead counts 0, 1, 2, and all-leads.
- **Knob nobody turns — ACCEPT:** built on hypothesis, not demand. Done-When requires at least one real letter composed with a multi-point lead.

### Non-Goals
- Do NOT migrate or reflow sealed letters — existing letters keep effective `lead_count: 1` via fallback. No backfill.
- Do NOT build interleaving (points *within* the story) or named sections — split index only.
- Do NOT add new ordering UI beyond the split control — point reorder already exists.
- Do NOT change the prediction data model or scoring — only where points render relative to the story.

## Done-When

- [x] Author can set, at compose time, how many points render before the story (default 1, range 0..N)
- [x] Sealed snapshot carries the split; reader renders N points pre-story, rest post-story
- [x] All existing sealed letters render identically to today (fallback verified by regression test)
- [x] Out-of-range `lead_count` values are clamped to `[0, points.length]` — reader never breaks on malformed data
- [x] `useLetterReadingState` phase machine and `calculateStoryProgress` generalized per the transition table; regression covers lead counts 0, 1, 2, all-leads
- [x] Seal RPC migration carries `lead_count` into the snapshot (verified by seal→read round-trip test)

**Post-deploy validation (human-checked, not a QA-gate item):** at least one real letter composed (by founder or letter-agent) using a multi-point lead — validates the hypothesis. Tracked here deliberately outside the checkbox list so it doesn't block the `qa` status transition.

## UX Notes

(Resolved 2026-06-06 in founder conversation — no `/ux` pass needed.)

- **Compose control:** per-point "lead" toggle, sibling of the existing hide eye-toggle on each point row (doc-detail-page pattern, `point_config.hidden`). Toggle semantics are defined in Solution → Storage model (UI sugar over `order` + `lead_count`). Hide and lead stay orthogonal toggles — no three-state cycle, no draggable story-divider.
- **Toggle visibility:** shown when *visible* (non-hidden) point count ≥ 2 — same filter as `compose-default-point-order.ts`. A 2-point story with one hidden point is effectively single-point: control hidden.
- **Default:** with ≥2 visible points, the first point renders pre-marked as lead (makes today's implicit `points[0]` behavior explicit). Author may mark all, some, or none — unmarking the last lead is allowed and maps to the story-first reader walk (N=0 row in the transition table).
- **Hidden lead:** hiding a lead point removes it from the visible set; the *effective* lead count is the read-time clamp `min(lead_count, visible points)` — no eager rewrite of `lead_count` on hide, no auto-transfer rule.
- **Agent path:** the letter-composing agent sets the split via the same `updatePointConfig` service call, writing `order` + `lead_count` directly — no UI involved.
- **Reader, ≥2 leads:** each lead gets its existing engage→reveal pair in order, then story rate/reveal, then remaining points.
- **States:** 0 leads (story first — existing 1-point flow shape), 1 lead (today's default), 2+ leads, all-points-lead (story last), single-point story (control hidden — split is meaningless).

## Acceptance Criteria

- [x] Author controls the pre/post-story split during composition; default behavior unchanged
- [x] No sealed letter changes appearance without author action
- [x] Letter-composing agent can express fact-point + anti-point as a paired pre-story setup
