---
status: week
type: bug
rank: 1000768.0
severity: high
workstream: letters
date_reported: '2026-05-15'
created_date: '2026-05-15'
tags: [letters, points, ordering, snapshot-mapper, seal-rpc]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P837: Letter default point order diverges between composer draft and sealed snapshot

## Summary

When the author has not manually reordered points (`point_config.order = []`), the composer's draft view and the sealed letter snapshot render points in different orders — silently violating P767's promise that "preview and sealed receiver view render points in the same order the author set in the draft."

## Root Cause

Two code paths use different *fallback* orderings when `point_config.order` is empty:

- **Composer fetch** (`src/app/data/docs-service.ts:236` — `STORY_WITH_AUTHOR_AND_POINTS_SELECT`): nested PostgREST select on `story_points` has no explicit `ORDER BY`. Rows come back in PostgreSQL physical-heap order, which for this case happens to put the newer anti-point first.
- **Seal RPC** (`supabase/migrations/20260513000000_p833_seal_rpc_version_desync.sql:186` — and identical in every prior seal-RPC migration): `SELECT jsonb_agg(...) ORDER BY sp.created_at FROM story_points sp`. Bakes points into `snapshot.point_config.points` in `created_at` ASC order — anti-point (added later) ends up second.

The snapshot mapper (`src/app/utils/letter-snapshot-mapper.ts:142-150`) honors `point_config.order` correctly (the P767 fix), but `order` is `[]` here so the sort is a no-op and the raw `points` array order wins.

P767 explicitly assumed: "Letters where default insertion order was never changed appear correct by coincidence." That assumption only holds when PostgREST physical-heap order == `created_at` ASC. It breaks whenever a point was added to `story_points` later than another (e.g., the "anti-point" attach mechanism that appends `misunderstanding` points after the original was sealed into the story).

D36 from P581 (`features/done/.../p581_letters_with_comprehension_assessment.md` — refined in commit `f7611a60`) specifies: "2+ points → anti-point first → position → story → remaining points (commit-before-context for Clarity Flip mechanic). Sender controls implicitly through doc structure (point priority via arrows in Clarity Docs)." The reader (`src/app/hooks/useLetterReadingState.ts:173`) does its job — `point-engage` phase, render `points[0]` before the story — but `points[0]` is now the wrong card because the seal RPC reordered.

## Reproduction Steps

Live evidence — no fresh repro needed:

1. Open prod letter `https://claritypledge.com/letter/ff2dda21-c198-43fe-9e28-a9a455f2ccda` as the recipient. Observe the first card shown before the story is the regular point ("The speaker knows what they meant…") — Disagree/Unsure/Agree buttons visible.
2. As the founder (author of doc `7b619620-1520-43f5-ae94-605c124ea8ff`), open `/letters/drafts/7b619620-1520-43f5-ae94-605c124ea8ff`. Walk through the prediction. Observe the same story shows the anti-point first ("If you feel you understood what someone meant, you did. No need to overthink it.") — Disagree highlighted.
3. Compare. Different points lead.

Underlying data:

- `story_points` for story `f2a073c6-de12-480b-925a-9bd304ced82f`: anti `14377ba0-879a-4034-90f2-cab71834d513` `created_at` 2026-03-23; regular `86fb9e04-e04d-4399-9928-83fd8da9ab03` `created_at` 2026-03-08.
- Letter `ff2dda21` snapshot: `point_config.order = []`, `points: [regular, anti]`.

**Reproduction rate:** 100% whenever `point_config.order` is empty AND `created_at` order ≠ PostgREST physical-heap order for that story's `story_points`. Likely affects every letter whose author never used the manual up/down arrows on a story that had an anti-point attached after the original point.

## Expected Behavior

The point shown first in the author's draft (composer + preview) is the point that leads the recipient's view before the story. If `point_config.order` is empty, both surfaces still agree on an order — by construction, not by coincidence.

For this letter specifically: the anti-point ("If you feel you understood what someone meant…") should lead the recipient view, matching what the founder saw in the draft.

## Actual Behavior

Composer renders the anti-point first; sealed snapshot has the regular point first; recipient sees the regular point as the "anti-point lead" before the story. No console error, no visible warning — silent author-intent violation.

## Affected Files

- `src/app/pages/letter-compose-page.tsx` — primary fix site. Before `lettersService.sealLetter(...)` runs (around the `handleSeal` callback, ~line 155), persist the currently-displayed point order into `doc_stories.point_config.order` for every story whose `order` is empty. Uses existing `docsService.updatePointConfig`.
- `src/app/data/docs-service.ts:236` — origin of the composer's default order (PostgREST nested select, no `ORDER BY`). Not changed — the fix snapshots whatever this returns.
- `supabase/migrations/20260513000000_p833_seal_rpc_version_desync.sql:186` (and prior copies) — origin of the seal RPC's divergent default order. Not changed; with `order` populated, the snapshot mapper's explicit sort wins.

## Severity

**High** — silently violates author intent on a core expressive surface (the Clarity Flip anti-point lead). Sealed letters already delivered with the wrong leading card cannot be corrected after the fact (snapshots are immutable). Same severity as the parent P767.

## Fix Approach

In `letter-compose-page.tsx`, before calling `lettersService.sealLetter(...)`:

For each story in `stories`, if `s.point_config?.order` is empty/missing, build `order = s.story.points.map(p => p.id)` (the displayed order — already filtered for hidden and sorted by `point_config.order` if it existed, otherwise raw PostgREST order) and write it back via `docsService.updatePointConfig(docId, s.story_id, { ...s.point_config, order })`. Fire all updates in parallel; only proceed to seal once they succeed.

Why this works:
- WYSIWYG: whatever the author saw in the draft is what gets persisted, regardless of which path computed the order.
- No schema change, no seal-RPC change, no migration.
- Idempotent: re-sealing the same doc writes the same `order` array.
- Composes with P767: the snapshot mapper already honors non-empty `order`.

Alternatives considered (do not implement):
- Change seal RPC to `ORDER BY` something else (e.g., DESC, or `system_tags @> ARRAY['misunderstanding']` first) — fragile, depends on creation timing or data-shape as proxy for intent.
- Change `docs-service.ts` to add an explicit `ORDER BY` matching the seal RPC — makes both deterministic but changes existing draft display for letters in flight (worse than the bug).

## Acceptance Criteria

- [ ] For letter `ff2dda21-c198-43fe-9e28-a9a455f2ccda` (after re-seal of a new equivalent letter from the same doc), the anti-point lead in the recipient view matches the first point shown in the author's draft.
- [ ] For any new letter sealed from a doc where the author has not manually reordered points, the composer's displayed point order is byte-identical to `snapshot.point_config.order` and to the order points appear in `snapshot.point_config.points` after the mapper's sort.
- [ ] For letters where the author HAS manually reordered points (P767 path), behavior is unchanged — regression guard.
- [ ] Stories with only one visible point are unaffected — `point_config.order` may remain empty since order is meaningless for length 1.
- [ ] Sealing fails closed if the pre-seal `updatePointConfig` writes fail (no half-sealed state with mismatched orders).
- [ ] No console errors during the compose → seal flow.
- [ ] Regression test passes: `src/tests/p837-compose-persists-default-point-order.test.ts`.
