---
status: backlog
type: task
rank: 1000770.0
workstream: C2
created_date: '2026-05-17'
tags: [letter-snapshot, superseded, parity, p800-followup]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P845: Seal RPC + backfill — bake `superseded` boolean into snapshot.point_config so the recipient view filters parity with the sender's overview

## Problem

**Situation:** P843 added a `superseded_by` filter to `get_letter_overview` (sender's cohort table). The recipient-side path (`letter-snapshot-mapper.ts` → `LetterStoryReader`) cannot mirror the filter because the mapper is a pure transform of `point_config` with no DB access. Adding async `points.superseded_by` lookups to the mapper would convert every snapshot read into an N+1 query and defeat the purpose of snapshotting.

**Complication:** The result is a parity gap — sender sees the filtered point set on the overview, recipient sees the unfiltered set on the reading page. Today the gap is small (few letters have superseded points) but it grows as P800 supersede usage grows.

**Question:** Bake `superseded: true` onto each `point_config.points[i]` whose underlying point has `superseded_by IS NOT NULL` at seal time, plus a backfill for already-sealed letters. The mapper's existing filter line then becomes `!p.hidden && !p.superseded && !topLevelHidden.has(p.id)` — no async work, no architecture change.

## Appetite

Low blast radius — touches one RPC (`seal_and_send_letter`), one mapper (`letter-snapshot-mapper.ts`), and one backfill migration. No new tables, no UI changes (filter line is a 1-token addition). Reversible — both the snapshot column and the mapper filter degrade gracefully if absent.

## Solution

1. **Seal RPC update.** In `seal_and_send_letter` (or whichever current seal RPC writes `letter_story_snapshots.point_config`), enrich each emitted `point_config.points[i]` with `superseded: (points.superseded_by IS NOT NULL)` via a JOIN on the source points. This is a write-time bake — the snapshot freezes the value as of seal, never re-evaluated.

2. **Backfill migration for sealed letters.** Iterate over `letter_story_snapshots`, look up each point's current `superseded_by`, and patch `point_config.points[i].superseded` accordingly. Idempotent: rerun-safe by checking whether the field is already present and matches.

3. **Mapper filter update.** In `letter-snapshot-mapper.ts:snapshotToStoryWithPoints`, extend the `visiblePoints` filter to honor `p.superseded`. One-line addition; the comment block already names this path as the fix.

4. **Drop the RPC-side superseded filter from `get_letter_overview`?** Open question — keeping it costs nothing and provides defense-in-depth; removing it after P845 ships consolidates the source of truth. Decide during /architect.

## Risks / Non-Goals

### Risks
- **Backfill correctness on edge cases.** Letters where a point was superseded AFTER seal time vs BEFORE seal time. Decision needed: snapshot freezes "as-of-now" (one-shot at backfill time, then never re-evaluated) — same semantics the seal-time enrichment uses going forward. Mitigation: explicit backfill date in commit message; rerun if subsequent supersedes were missed (idempotent).
- **Mapper consumers downstream of `LetterStoryReader`.** Anything that bypasses `snapshotToStoryWithPoints` and reads `point_config.points` raw must be audited. Grep `point_config.points\[` across `src/`.
- **`docStoryToSnapshot` (preview path).** The preview builder writes its own snapshot for live preview before seal. It does NOT currently know about supersession — preview would still show superseded points. Decision: either also bake `superseded` in preview, or accept preview leak as low-impact (preview is author-facing, P843 already filters in author overview after seal).

### Non-Goals
- Do NOT change `get_letter_overview` removal of the SQL-side filter in this spec — leave both filters until backfill is verified in prod.
- Do NOT extend supersede semantics in this spec — P800 + P801 own that surface; this spec only propagates an existing flag into a new place.
- Do NOT refactor the snapshot/mapper architecture more broadly — narrow scope: one field, one bake, one mapper line.

## Done-When

- [ ] Seal RPC writes `superseded` boolean on each `point_config.points[i]` at seal time
- [ ] Backfill migration sets `superseded` on already-sealed letter snapshots
- [ ] `letter-snapshot-mapper.ts` filters by `p.superseded` in addition to `p.hidden`
- [ ] Recipient reading view (`/letter/.../read`) hides superseded points (E2E test asserts this)
- [ ] Backfill is idempotent — rerun produces zero diffs
- [ ] No regression on P700 / P836 / P843 e2e suite (overview, cohort table, header)
- [ ] Decision: remove SQL-side filter from `get_letter_overview` now, or leave for defense-in-depth — document the choice

## Acceptance Criteria

- [ ] A letter with a sealed point that has been superseded since: recipient reading view no longer shows the superseded point; sender overview also hides it (unchanged from P843).
- [ ] Reseal a letter that had a superseded point at seal time: new snapshot has `superseded: true` on that point.
- [ ] Older sealed letters in prod (pre-backfill): show the bake after migration applies; no API call needed beyond the migration.

---

**References:** P843 (this gap is documented in `letter-snapshot-mapper.ts` comment + decisions.md 2026-05-17 entry) · P800 (origin of `superseded_by`) · P801 (supersede action UI — blocks by trigger).
