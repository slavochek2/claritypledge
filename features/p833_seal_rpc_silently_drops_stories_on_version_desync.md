---
status: week
type: bug
rank: 1000765.0
severity: high
workstream: C1
date_reported: '2026-05-13'
created_date: '2026-05-13'
tags: [letters, seal-rpc, story-versions, data-integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P833: seal_and_send_letter silently drops stories when stories.current_version is ahead of story_versions

## Summary

`seal_and_send_letter` RPC uses an INNER JOIN on `story_versions.version_number = stories.current_version`. When `stories.current_version` points to a version row that doesn't exist in `story_versions`, the join silently drops the story — no `letter_story_snapshots` row is written, no error is raised. The sender sees a "successfully sealed" letter that's missing stories in results, and P827 /live preload returns null for those stories.

## Root Cause

Two-layer bug:

**Layer A — RPC silently drops on join miss.** `supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql:340-353`:

```sql
INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
SELECT
  p_letter_id, ds.story_id, sv.id, ds.position, ds.point_config, s.visibility::text
FROM doc_stories ds
JOIN stories s ON s.id = ds.story_id
JOIN story_versions sv ON sv.story_id = s.id AND sv.version_number = s.current_version
WHERE ds.doc_id = v_source_doc_id
  AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
ON CONFLICT (letter_id, story_id) DO NOTHING;
```

The inner join on `story_versions` requires the row `(story_id, current_version)` to exist. If it doesn't, the story is dropped. The RPC returns `true`, the sender sees success, but only the stories with matching version rows get snapshotted.

**Layer B — `stories.current_version` desync.** For 3 of 4 stories on the founder's CK doc (test DB), `current_version` is higher than the max `version_number` in `story_versions`:

| Story | `stories.current_version` | max `story_versions.version_number` | Gap |
|---|---|---|---|
| 883d89f5 (st1) | 4 | 4 | OK |
| f2a073c6 (st2) | 7 | 3 | 4 missing |
| ae6ee29d (st3) | 2 | 1 | 1 missing |
| 425fac1f (st4) | 6 | 2 | 4 missing |

Something is bumping `stories.current_version` without inserting a corresponding `story_versions` row. Suspected callers: story edit/version handlers in `src/app/data/stories-service.ts` or related RPCs. Under investigation.

## Reproduction Steps

1. Sign in as founder account on test DB
2. Open letter results: `http://localhost:5100/letter/42ae1ef1-325c-4fad-9bd6-05bdc3c6e685`
3. Observe: only **1 story** shown in results, despite the sender having predicted 4 stories during composition
4. Query test DB directly to confirm:
   - `letter_predictions` has 4 rows for this letter (story_ids 883d89f5, f2a073c6, ae6ee29d, 425fac1f)
   - `letter_story_snapshots` has only 1 row (883d89f5)
   - `stories.current_version` for the missing 3 stories points to version_numbers that don't exist in `story_versions`
5. In /live, pick st2 or st3 from the picker — P827 preload returns null, lands on blank rating-capture instead of preloaded explain-back

**Reproduction rate:** 100% on letter `42ae1ef1-325c-4fad-9bd6-05bdc3c6e685` (test DB). Will reproduce for any future letter sealed on a doc containing stories with desynced `current_version`.

## Expected Behavior

- Sealing a letter snapshots **every** story in the source doc (subject to the existing one-to-many visibility filter)
- If a story has a broken `current_version` reference, the RPC fails loudly (RAISE EXCEPTION) — the sender does not get a misleading "sealed" success while data is incomplete
- `stories.current_version` invariant: always points to a row that exists in `story_versions`

## Actual Behavior

- RPC returns `true` and marks letter `sealed`, but `letter_story_snapshots` is missing rows for stories with desynced `current_version`
- Letter results page shows only the stories that survived the join (1 of 4 in this case)
- P827 /live preload correctly returns null for dropped stories (no snapshot = no preload)
- No error surfaced to the sender at any point

## Affected Files

- `supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql:340-353` — the silent-drop INNER JOIN
- `src/app/data/stories-service.ts` — suspected callers that bump `stories.current_version` without inserting `story_versions`. Under investigation
- `supabase/migrations/` — any RPC or trigger that updates `stories.current_version` (grep for `current_version`)
- Affected data: letter `42ae1ef1-325c-4fad-9bd6-05bdc3c6e685` and any other letter sealed on a doc with desynced stories

## Severity

**High** — letters silently lose stories on seal. Sender believes letter is complete; receiver sees a truncated letter; P827 /live preload silently degrades to blank entry. No error surfaced to either party. Data integrity bug with no user-visible warning.

## Fix Approach

Three layers, in order:

1. **Find the desync source.** Grep for every writer of `stories.current_version`. Check that each one inserts the corresponding `story_versions` row in the same transaction. Likely culprit: a story-edit path that bumps the counter but skips the insert (or inserts conditionally and silently swallows the failure).

2. **Harden the RPC.** Replace the silent INNER JOIN with one of:
   - LEFT JOIN + `RAISE EXCEPTION` when any joined `sv.id` is NULL — fail-loud on data anomaly
   - LEFT JOIN + fallback to the latest existing `story_versions` row by `version_number DESC` — degrade gracefully and log a warning row
   - Pre-flight check: count missing version rows before the INSERT, raise if non-zero
   Decision: which is preferable. /architect should pick — preference for fail-loud unless the desync is expected during a known migration window.

3. **Backfill broken data.** For each story with `current_version > max(story_versions.version_number)`, either:
   - Reset `stories.current_version` down to the existing max, OR
   - Insert synthetic `story_versions` rows up to `current_version` (from `stories.content`/`stories.title` snapshot)
   Plus re-seal or back-snapshot any letters affected by the historical drop (query `letter_predictions` vs `letter_story_snapshots` to find letters with prediction-count > snapshot-count).

## Acceptance Criteria

- [ ] Sealing a letter on a doc with N public stories produces N `letter_story_snapshots` rows (or RPC fails loudly with a clear error)
- [ ] No story in `stories` has `current_version` greater than the max `version_number` for that story in `story_versions` (invariant check passes on test and prod)
- [ ] Letter `42ae1ef1-325c-4fad-9bd6-05bdc3c6e685` shows all 4 stories in results after the backfill
- [ ] In /live, picking any of the 4 letter-backed stories triggers P827 preload (explain-back phase, ratings filled)
- [ ] Regression test: a vitest unit test or migration assertion that creates a story with desynced `current_version` and asserts the seal RPC behavior (fail-loud or fall-back, whichever is chosen)
- [ ] No console errors during letter composition, sealing, results view, or /live preload
