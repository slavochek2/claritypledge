---
status: qa
date_resolved: '2026-05-14'
type: bug
rank: 1000765.0
severity: high
workstream: C1
date_reported: '2026-05-13'
created_date: '2026-05-13'
tags: [letters, seal-rpc, story-versions, data-integrity]
delivery_stage: ship
pipeline_ran: [create-bug, challenge-prd, fix, ship]
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

**Layer B — `stories.current_version` historical desync.** For 3 of 4 stories on the founder's CK doc (test DB), `current_version` is higher than the max `version_number` in `story_versions`:

| Story | `stories.current_version` | max `story_versions.version_number` | Gap |
|---|---|---|---|
| 883d89f5 (st1) | 4 | 4 | OK |
| f2a073c6 (st2) | 7 | 3 | 4 missing |
| ae6ee29d (st3) | 2 | 1 | 1 missing |
| 425fac1f (st4) | 6 | 2 | 4 missing |

**Root cause (high confidence after /challenge-prd forensics):** This is *not* an ongoing application bug. A codebase grep confirms no app-layer writer of `stories.current_version` exists — every write goes through the `create_story_version_on_update` trigger (`20260204` / `20260417180000_p701`), which atomically bumps the column AND inserts the `story_versions` row.

The drift was produced by `scripts/archive/migrations/20260310-points-stories-refresh.sql`, a one-off ad-hoc seed/refresh script (not a tracked migration). It UPSERTs the affected stories with `ON CONFLICT DO UPDATE SET current_version = stories.current_version + 1` (lines 36–97), then separately inserts `story_versions` rows at the bottom (lines 162–226). Two failure modes interact:

1. **Trigger collision:** The BEFORE UPDATE trigger fires on the UPSERT's UPDATE branch when content changes, overriding `NEW.current_version = OLD.current_version + 1` and inserting a `story_versions` row in the same transaction. The explicit `story_versions` INSERT at the bottom then collides on the UNIQUE `(story_id, version_number)` constraint — fails or silently duplicates.
2. **Partial-run drift:** If the script was interrupted between the UPSERT block and the `story_versions` block, `current_version` is bumped while `story_versions` is not. The observed gap pattern (4, 4, 1, 0) is consistent with multiple partial / repeated ad-hoc runs.

This was historical drift. Layer 1 of Fix Approach (find an app-layer writer) is therefore dropped — there is no writer to patch.

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

- `supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql:340-353` — the silent-drop INNER JOIN (and the same pattern in every later seal-RPC migration: `20260410090000`, `20260410091421`, `20260412135402`, `20260417180000_p701`, `20260418120000`, `20260418144500`, `20260418210000`, `20260418220000`, `20260425183500`). The new RPC migration must replace whichever version is currently live.
- `scripts/archive/migrations/20260310-points-stories-refresh.sql` — historical drift source (no longer in active use; cited for archaeology only)
- Affected data: letter `42ae1ef1-325c-4fad-9bd6-05bdc3c6e685` and any other letter sealed on a doc with desynced stories (cross-check query in Fix Approach Layer 3)

## Severity

**High** — letters silently lose stories on seal. Sender believes letter is complete; receiver sees a truncated letter; P827 /live preload silently degrades to blank entry. No error surfaced to either party. Data integrity bug with no user-visible warning.

## Risks / Non-Goals

**Non-Goals — do NOT in this spec:**
- Do NOT refactor the seal RPC's other joins (`doc_stories`, `point_config` handling, visibility filtering, hidden_per_point logic). The fix is the version-desync handling only.
- Do NOT introduce a generic "data integrity invariant" framework for other denorm columns (`understood_count`, `listener_calibration_avg`, etc.). One invariant, one column, one trigger.
- Do NOT re-architect story versioning. `stories.current_version` denorm-pointer + immutable `story_versions` rows stays as designed.
- Do NOT delete `scripts/archive/migrations/20260310-points-stories-refresh.sql`. It is archived for a reason; the fix prevents *any* such script from causing silent drift again, not just this one.
- Do NOT migrate fabricated `story_versions` rows for backfill. Reset `current_version` down (option a) only.

**Risks:**
- Backfill on prod will reduce `current_version` for affected stories. Any system that references `current_version` as a monotonic counter (e.g., cached prediction keys, external integrations) could observe a step backwards. Audit references before running the reset.
- Fail-loud RPC will surface previously-hidden drift. If prod has more drifted stories than test, the first seal attempts after deploy could error. Run Layer 3 backfill on prod *before* deploying the new RPC.
- Deferred-constraint trigger adds a small write cost on every story UPDATE. Negligible at current scale, flag for /architect if it touches a hot path.

## Fix Approach

Two layers (root cause is historical — no ongoing app-layer writer to patch; see Layer B above):

1. **Harden the RPC — fail-loud.** Replace the silent INNER JOIN with a LEFT JOIN + pre-flight check: count rows where `sv.id IS NULL` for `(story_id, current_version)`; if non-zero, `RAISE EXCEPTION 'seal_and_send_letter: story_versions desync for story_ids=[...]'`. Sender sees a clear error; no incomplete letter is ever marked sealed. **Conditional on Layer 3 backfill running first on the target environment** — fail-loud against unclean data would convert this silent data bug into a noisy availability bug on existing letters.

2. **Enforce the invariant at the DB level.** Add a deferred-constraint trigger (or stored-function CHECK) on `stories` such that `current_version` cannot exceed `max(story_versions.version_number)` for that story at commit time. The trigger that bumps `current_version` already inserts the corresponding `story_versions` row in the same statement, so this invariant should never fail in the application path; it exists to make ad-hoc DB intervention (manual SQL, scripts/archive replays, Supabase Studio edits) fail loudly instead of silently drifting.

3. **Backfill broken data.** For each story with `current_version > max(story_versions.version_number)`, **reset `stories.current_version` down to the existing max** (rejected alternative: inserting synthetic `story_versions` rows — fabricates audit history in an append-only table, not git-revertable). Plus re-seal or back-snapshot any letters affected by the historical drop:

```sql
-- Cross-check: letters where prediction-count > snapshot-count
SELECT l.id, count(p.*) AS predictions, count(s.*) AS snapshots
FROM letters l
LEFT JOIN letter_predictions p ON p.letter_id = l.id
LEFT JOIN letter_story_snapshots s ON s.letter_id = l.id
GROUP BY l.id
HAVING count(p.*) > count(s.*);
```

Run on test first, then prod. For each affected letter: re-run snapshot insertion after Layer 3 backfill resets `current_version`.

## Acceptance Criteria

- [x] Sealing a letter on a doc with N public stories produces N `letter_story_snapshots` rows, OR the RPC raises a `story_versions desync` exception with the offending `story_id`(s) named — never silently incomplete.
- [x] DB-enforced invariant: a trigger (or stored-function CHECK) on `stories` raises if any commit would leave `current_version > max(story_versions.version_number)` for that story. Verified by an attempted direct `UPDATE stories SET current_version = current_version + 1` that fails. **Enforcement is the criterion** — a one-time check that passes after backfill does not satisfy this AC.
- [x] Cross-check query (see Fix Approach Layer 3) returns zero rows on test and prod after backfill.
- [x] Letter `42ae1ef1-325c-4fad-9bd6-05bdc3c6e685` shows all 4 stories in results after the backfill.
- [x] Regression test (vitest or pgTAP): creates a story, then directly bumps `current_version` past `max(version_number)` and asserts the invariant trigger raises. Plus a seal-RPC test that runs against a desynced fixture and asserts fail-loud behavior.
- [ ] No console errors during letter composition, sealing, results view, or /live preload. [post-deploy]

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd Q1 | Spec assumed an ongoing app-layer writer of `stories.current_version`; codebase grep showed only the trigger writes. | Ran 30-min forensics. Root cause is historical drift from `scripts/archive/migrations/20260310-points-stories-refresh.sql` (one-off ad-hoc script). Layer B rewritten; Fix Approach Layer 1 dropped (no writer to patch). | Without forensics, /architect would design a patch around a phantom writer. |
| 2 | /challenge-prd Q2 | Three RPC options offered (fail-loud / fallback-to-latest / pre-flight check). | **Fail-loud** (LEFT JOIN + pre-flight RAISE EXCEPTION), conditional on backfill running first on the target environment. | Fallback masks future drift (same class of silent failure we're removing). Fail-loud against clean data is the correct posture once Q3 enforcement is in place. |
| 3 | /challenge-prd Q3 | Invariant AC was ambiguous — one-time check vs. enforced. | **DB-level enforcement** via deferred-constraint trigger or stored-function CHECK on `stories`. | The seal RPC was the de facto check, silently. Anything weaker than DB-level enforcement leaves the same bug class open. |
| 4 | /challenge-prd WARN | Backfill option (b) — synthesize `story_versions` rows — fabricates audit history. | Rejected. Reset `current_version` down (option a) is the only backfill path. | Append-only audit table; synthetic rows are not git-revertable and corrupt provenance. |
| 5 | /challenge-prd WARN | AC4 (P827 preload regression) mixed scopes. | Dropped from this spec. P827 preload correctness is asserted indirectly via AC3 + the cross-check query. | Independent test surface; not a P833 acceptance signal. |
