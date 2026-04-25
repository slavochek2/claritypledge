---
name: mutate-stories
description: Safely mutate stories, points, and related rows on prod/test (content, st-tags, hashtags, membership, versions, visibility) with mandatory state verification, replay-detection gate, trigger-aware planning, and explicit commit gates.
when_to_use: "Any deliberate change to existing stories or points data — content edits, st-tag slot swaps, hashtag renames, story-point membership changes, version rewrites, visibility changes. NOT for new content creation (use /create-spec) or schema changes (use `.claude/rules/database.md` migration flow)."
version: 1.1.0
---

# Mutate Stories — Safe Data Mutation Operator

Performs content/metadata mutations on `stories`, `points`, and related rows with mandatory evidence gates. Built after the P701 ST-tag incident: a past migration was "replayed" against prod state that was already past the target, producing the wrong permutation. This skill makes that class of mistake impossible by construction.

**Core invariant:** Target state is expressed as concrete per-row column values, never as a transform. Current state is always read from prod with the service role key. The delta is derived, not assumed.

## Mutation Types Covered

| Type | Tables touched | Primary triggers to consider |
|------|----------------|------------------------------|
| Story content edit | `stories`, auto-append `story_versions` | `trg_stories_extract_hashtags`, `trg_stories_updated_at`, `trg_story_version_on_update` |
| Point statement/context edit | `points` | `trg_points_updated_at`, `trg_points_extract_hashtags` |
| System-tag change (`st1`–`st9`) | `stories.system_tags`, `points.system_tags` | `trg_sync_story_st_tags_to_points`, `trg_protect_system_tags_*` (role-gated) |
| Inline-hashtag fix (content text) | `stories.content`, `points.statement`/`context` | hashtag extractor re-runs |
| Plain-tag change | `stories.tags`, `points.tags` | overwritten by hashtag extractor on next content edit |
| Story↔point membership (link/unlink) | `story_points`, cascades `story_point_history` | `trg_story_point_link_history`, `trg_story_point_visibility_constraint` |
| Likert position change | `point_positions`, cascades `point_position_history` + possibly `story_points` | `trg_position_history`, `trg_cascade_position_removal` |
| Supersede wiring | `points.superseded_by` | `trg_enforce_supersede_invariants` |
| Version rewrite | `story_versions` (direct) | none (history table) |
| Visibility change | `stories.visibility`, `points.visibility` | `trg_story_visibility_immutable`, `trg_point_visibility_immutable` (RAISE — replica-bypassable) |

**Do not trust this table alone.** Re-read `docs/technical/database.md` and relevant `supabase/migrations/*.sql` at the start of every run — triggers drift.

## Mandatory Procedure — No Skips

Every run follows these 12 steps in order. Skipping any step voids the skill's guarantee.

### 0. Verify session currency — branch and schema-doc freshness

Data mutations on prod must not rely on stale local knowledge. Before anything else:

```bash
git branch --show-current
git log --oneline HEAD..origin/main -- \
  supabase/migrations/ \
  docs/technical/database.md \
  .claude/rules/database.md \
  .claude/rules/db-access.md \
  2>/dev/null
```

If the second command returns commits (you're behind origin/main on schema-relevant files), stop and tell the user: "This session is behind origin/main on schema files. The trigger map in this skill may be stale. Pull first, or confirm you want to proceed with known-stale knowledge."

If on a feature branch with unshipped migrations relevant to this mutation, proceed only if the user explicitly confirms the in-flight state is intentional for this mutation.

### 1. State environment explicitly — refuse to default

State aloud: "Running on **prod** DB" or "Running on **test** DB." If the user did not specify, **ask**. Never default. This is the `.claude/rules/db-access.md` rule, no exceptions.

### 2. Specify target state as concrete values, not as a transform

**Reject any intent phrased as "apply the same operation migration X did."** Insist on target state expressed as concrete per-row column values:

```
id=86d57f0f  stories.system_tags  target=[st5, understanding]
id=ae6ee29d  stories.system_tags  target=[st3, understanding]
id=f2a073c6  stories.system_tags  target=[st2, understanding]
```

If the user can't state the target as concrete values, stop — ask them to state it directly. Never back-derive the target by reading migration SQL; migration SQL describes a transform from a pre-state, and replaying it against unknown current state is the P701 failure mode.

Show the target table to the user. Wait for confirmation.

### 3. Read actual prod state with the service role key (not anon)

Anon key returns `[]` for RLS-filtered rows — indistinguishable from "row does not exist." For verification reads, always use the service role key:

```bash
source .env.prod
# PROD_SUPABASE_SERVICE_ROLE_KEY is the prod service-role key; confirm it's loaded.
curl -s "$VITE_SUPABASE_URL/rest/v1/<table>?select=id,<cols>&<filter>" \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
```

Fill in a `current=` column alongside each `target=` from step 2. Classify every row:

- **already-at-target** — `current == target` — remove from the mutation plan
- **needs-delta** — `current != target` and current matches a known prior-state — include
- **unknown-state** — `current` matches neither target nor any documented prior-state — **stop** and investigate with the user before mutating

### 3a. Replay-detection gate — halt if most rows are already at target

If ≥ 50% of candidate rows classify as `already-at-target`, this is very likely a replay of a migration or fix that already ran. Stop and ask the user explicitly:

> N of M rows are already at target. This looks like a replay of a prior successful run. Options:
> (a) Skip entirely — no mutation needed.
> (b) Apply only to the K rows not yet at target — [list them].
> (c) I'm reading the target wrong — help me re-derive.
> Which?

Do not proceed until the user picks one.

Report before moving on:
```
M candidate rows:
  already-at-target: N (skipping)
  needs-delta:       K (applying)
  unknown-state:     J  <- STOP if > 0
```

### 4. Derive minimal delta from current → target (per row)

For each `needs-delta` row, write the exact column-level change. **Do not compute the delta as "apply transform X"** — compute as `current → target`. If the same SQL transform happens to produce the target for multiple rows, that's an artifact of the data; do not let it become the source of truth.

**Permutation math reference** (in case the delta happens to be a cycle):
- 2-cycle `A↔B`: self-inverse. Applying twice = identity.
- 3-cycle `A→B→C→A`: order 3. Applying twice = inverse cycle (`A→C→B→A`). Applying thrice = identity.
- General k-cycle: C^n mod k. If current is `n` forward steps past target, apply `C^(k-n)`.

### 5. Enumerate side-effect tables and triggers — per affected table

For every table the mutation touches:

1. List every trigger (query `information_schema.triggers`):
   ```sql
   SELECT trigger_name, event_manipulation, action_timing, action_statement
   FROM information_schema.triggers
   WHERE event_object_table = '<table>'
   ORDER BY action_timing, event_manipulation;
   ```
2. Classify each: "let fire" (cascade, history, version) vs "suppress" (visibility-immutable on intentional visibility changes).
3. List side-effect tables that will receive INSERTs: `story_versions`, `story_point_history`, `point_position_history`, and any custom audit tables.

Output this as a checklist into the plan before writing SQL.

### 6. Plan trigger strategy — replica mode is surgical, not default

`SET LOCAL session_replication_role = replica` suppresses **all non-replica triggers** for the transaction. That is a big hammer. Use it only when you've decided every suppressed trigger is safe to skip.

**Key correction from P701 learnings:** `protect_system_tags` is **role-gated**, not trigger-gated:

```sql
-- from 20260403120000_p630_system_tags.sql
IF current_setting('role', true) = 'authenticated'
   AND OLD.system_tags IS DISTINCT FROM NEW.system_tags THEN
  NEW.system_tags := OLD.system_tags;
END IF;
```

It silently reverts `system_tags` writes only when the connection role equals `'authenticated'`. Management API runs as `postgres`, and service-role REST runs as `service_role` — **neither matches `'authenticated'`, so the guard does not fire for either path.** Replica mode is not required to bypass this guard; calling from the right role is.

What replica mode actually bypasses on `stories`:

| Trigger | Purpose | Effect if suppressed |
|---------|---------|----------------------|
| `trg_stories_extract_hashtags` | Rewrites `tags` from `#hashtag` in content | `tags` drifts from content on this edit |
| `trg_stories_updated_at` | Bumps `updated_at` | Audit trail gap |
| `trg_story_version_on_update` | Appends `story_versions` row + bumps `current_version` on title/content change | Version history incomplete |
| `trg_sync_story_st_tags_to_points` | Cascades st-tag changes from stories to linked points | Points drift from story; you MUST update points manually in the same txn |
| `trg_story_visibility_immutable` | `RAISE EXCEPTION` on visibility change | Only use replica when intentionally changing visibility |

Equivalent set exists on `points`.

**Decision matrix:**

| Changing | Role (Mgmt API = `postgres`, service REST = `service_role`) | Replica mode? |
|----------|-------------------------------------------------------------|---------------|
| `system_tags` only | `postgres` or `service_role` | **No** — guard is role-gated, inactive. Let cascade fire OR manually update points. |
| `visibility` | any role | **Yes** — visibility-immutable RAISEs regardless of role. |
| `content` preserving version history | any role | **No** — let `trg_story_version_on_update` fire. |
| `content` without version bump | any role | Yes, but justify to the user first. |

**Never use `ALTER TABLE ... DISABLE TRIGGER`** — takes `ACCESS EXCLUSIVE` lock, blocks all reads/writes. See Appendix B.

If you use replica mode, document which triggers you're suppressing and why in the SQL as a comment block.

### 7. Build a single transactional SQL block

One `BEGIN; … ; COMMIT;` block. Use `LOCK TABLE <affected> IN EXCLUSIVE MODE;` as the first statement after `BEGIN;` for prod mutations — blocks concurrent writers (reads still work on other connections) so dry-run/commit snapshots cannot be poisoned.

For multi-step permutations on the same column, use a sentinel value to avoid collisions. The 3-cycle `st2→st5, st3→st2, st5→st3` via sentinel:

```sql
BEGIN;
LOCK TABLE stories, points IN EXCLUSIVE MODE;
SET LOCAL session_replication_role = replica;
-- Suppressing: trg_sync_story_st_tags_to_points (replacing with manual points update),
-- trg_stories_updated_at (intentional — not bumping for tag-only change),
-- trg_story_version_on_update (no title/content change — no-op anyway).
-- NOT changing visibility, so visibility-immutable guard not in the way.

UPDATE stories SET system_tags = array_replace(system_tags, 'st2', 'st_temp') WHERE 'st2' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st2', 'st_temp') WHERE 'st2' = ANY(system_tags);
UPDATE stories SET system_tags = array_replace(system_tags, 'st3', 'st2')     WHERE 'st3' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st3', 'st2')     WHERE 'st3' = ANY(system_tags);
UPDATE stories SET system_tags = array_replace(system_tags, 'st5', 'st3')     WHERE 'st5' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st5', 'st3')     WHERE 'st5' = ANY(system_tags);
UPDATE stories SET system_tags = array_replace(system_tags, 'st_temp', 'st5') WHERE 'st_temp' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st_temp', 'st5') WHERE 'st_temp' = ANY(system_tags);
COMMIT;
```

Because the cascade trigger is suppressed (replica mode), points are updated manually in the same transaction — skipping this would leave points drifted from stories.

### 8. Dry-run with `BEGIN … ROLLBACK` returning before/after evidence

Capture before-state in temp tables, apply the transform, SELECT the before/after join AND side-effect counts, then ROLLBACK:

```sql
BEGIN;
LOCK TABLE stories, points IN EXCLUSIVE MODE;
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE _before_stories AS
  SELECT id, system_tags FROM stories WHERE system_tags && ARRAY['st2','st3','st5'];
CREATE TEMP TABLE _before_points AS
  SELECT id, system_tags FROM points  WHERE system_tags && ARRAY['st2','st3','st5'];

-- count side-effect tables before
CREATE TEMP TABLE _sidefx_before AS
  SELECT 'story_versions' AS t, count(*) FROM story_versions
  UNION ALL SELECT 'story_point_history', count(*) FROM story_point_history
  UNION ALL SELECT 'point_position_history', count(*) FROM point_position_history;

-- <the UPDATE statements from step 7>

-- pull before/after rows + side-effect counts
SELECT 'story' AS kind, b.id::text, b.system_tags AS before_tags, s.system_tags AS after_tags
FROM _before_stories b JOIN stories s USING(id)
UNION ALL
SELECT 'point', b.id::text, b.system_tags, p.system_tags
FROM _before_points b JOIN points p USING(id)
ORDER BY kind, before_tags;

SELECT a.t, a.count AS before_count,
       (SELECT count(*) FROM story_versions)         AS story_versions_after,
       (SELECT count(*) FROM story_point_history)    AS sph_after,
       (SELECT count(*) FROM point_position_history) AS pph_after
FROM _sidefx_before a;

ROLLBACK;
```

Present the evidence compactly:

```
Transforms:
  1x story [st2] -> [st5]   (Master's)
  1x story [st3] -> [st2]   (Asymmetry)
  1x story [st5] -> [st3]   (0-10 scale)
  4x point [st2] -> [st5]
  2x point [st3] -> [st2]
  2x point [st5] -> [st3]

Side-effect row-count delta:
  story_versions:          +0
  story_point_history:     +0
  point_position_history:  +0

Total: 3 stories + 8 points = 11 rows
```

If side-effect deltas don't match what you expected from step 5, halt and reconcile before committing.

### 9. Pause for explicit COMMIT approval

**The user's earlier approval of the plan is NOT commit approval.** Ask: "Approve COMMIT?" and wait for an unambiguous yes. Never collapse dry-run + commit into a single step on prod.

### 10. Execute COMMIT — same SQL with the snapshot preserved inside the txn

Use the identical SQL from step 8 but replace `ROLLBACK;` with `COMMIT;`. The temp tables are still captured inside the transaction; the SELECT results are returned to the caller before COMMIT. Those results become your authoritative post-commit evidence — a separate re-query could be poisoned by concurrent writes unless the table lock is held.

Execute via Management API for prod:

```bash
source .env.local
PROJECT_REF=$(grep "^VITE_SUPABASE_URL=" .env.prod | sed 's|.*://||; s|\.supabase\.co.*||')
# SUPABASE_ACCESS_TOKEN is a PAT; Management API executes as postgres (superuser).
curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg q "$SQL" '{query:$q}')"
```

**Heredoc hygiene:** when building `$SQL` in Bash, use a **quoted** heredoc (`<<'EOF'`). An unquoted heredoc expands `$$` (dollar-quote) to the shell PID and breaks the SQL.

### 11. Post-commit verification — independent re-query with service role

Run a separate read against prod using `PROD_SUPABASE_SERVICE_ROLE_KEY` (not anon). Compare each affected row to target:

```bash
source .env.prod
curl -s "$VITE_SUPABASE_URL/rest/v1/stories?select=id,system_tags&id=in.(<ids>)" \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
```

Declare done only when:
- Row count matches step 8 expected count
- Every sentinel (`st_temp`, any `-1` slot) is absent
- Side-effect-table deltas match what dry-run reported

Browser spot-check is the user's responsibility — name it as recommended but not part of the guarantee.

## Per-Type Playbooks

### Content edit (story body, point statement/context)

- Let `trg_story_version_on_update` fire — do NOT enable replica mode unless the user explicitly wants no version bump.
- Hashtag extractor re-runs on the edit — `tags` column is rewritten from the new content. Intended side-effect.
- For long bodies, build `$SQL` with a quoted heredoc and pass as a single-quoted PostgreSQL literal using `$$...$$` dollar-quoting.
- Check `letter_story_snapshots WHERE story_id = <id>` — any existing rows are frozen denormalizations; they do NOT reflect your edit (recipients see the snapshot, not the new content).

### System-tag change (st1–st9)

- `protect_system_tags` is role-gated — does NOT fire under Management API (`postgres`) or service-role REST (`service_role`). No replica mode needed for that guard.
- `trg_sync_story_st_tags_to_points` cascades story→point. If you let it fire, do NOT also update points manually (double-apply). If you suppress it (replica mode), MUST update points manually in same txn.
- **Shared-point drift risk:** A point can be linked to multiple stories via `story_points`. Pre-check:
  ```sql
  SELECT sp1.point_id, array_agg(DISTINCT sp2.story_id) AS co_linked_stories
  FROM story_points sp1 JOIN story_points sp2 USING (point_id)
  WHERE sp1.story_id IN (<affected_story_ids>)
    AND sp2.story_id <> sp1.story_id
  GROUP BY sp1.point_id;
  ```
  If any shared points, mutate all co-linked stories in the same transaction, or document why drift is acceptable.
- Inline `#st5` hashtags in content are independent of `system_tags`. Fix both if intent requires consistency — see "Inline hashtag rename" below.

### Inline hashtag rename (text in content)

- Change `#foo` → `#bar` in `stories.content` triggers `trg_stories_extract_hashtags`, which rewrites `tags`. Let it fire.
- `points.statement` and `points.context` also have an extractor — verify by reading migrations.
- Use word-boundary anchors to avoid partial matches. Postgres supports `\y` (word boundary) and `\M` (end-of-word):
  ```sql
  UPDATE stories SET content = regexp_replace(content, '#foo\M', '#bar', 'g')
  WHERE content ~ '#foo\M';
  ```
  Show the exact before/after content text in the dry-run evidence — don't just diff the `tags` array.

### Story↔point membership (link/unlink)

`story_points` is `(story_id, point_id, author_id, created_at)` with PK `(story_id, point_id)` and `UNIQUE(author_id, point_id)` since P465. **No `position` column** — display ordering is derived from `points.system_tags` lexicographically (`st1` < `st2` < …).

- **Link:** `INSERT INTO story_points (story_id, point_id, author_id) VALUES ...`. `author_id` is NOT NULL — look it up from `stories.author_id`; never infer from session.
- **Unlink:** `DELETE FROM story_points WHERE story_id = X AND point_id = Y`.
- Triggers that fire (let them, unless you have a reason not to):
  - `trg_story_point_link_history` (AFTER INSERT) — writes `story_point_history` with `unlinked_at = NULL`.
  - `trg_story_point_visibility_constraint` (BEFORE INSERT) — RAISEs if story is `public` and point is `private`.
- The disambiguation rule (`db-access.md`) applies: "remove point from story" could mean UNLINK (DELETE row in `story_points`) or DELETE the point itself. Ask.

### Likert position change (`point_positions`)

`point_positions.position` is the `position_type` ENUM (Likert: `strongly_disagree`, `disagree`, `somewhat_disagree`, `neutral`, `somewhat_agree`, `agree`, `strongly_agree`) — NOT an integer ordering.

- `trg_position_history` (AFTER INSERT OR UPDATE OR DELETE) writes to `point_position_history`. Every mutation produces an audit row.
- `trg_cascade_position_removal` (AFTER DELETE on `point_positions`) cascades into `story_points` DELETE + `story_point_history` INSERT. A single DELETE can write to 3+ tables.
- `.claude/rules/db-access.md` disambiguation applies hard here: "remove user X's position" is ambiguous between DELETE (cascades) and UPDATE-to-neutral (no cascade). Always ask.

### Supersede wiring (`points.superseded_by`)

Setting `superseded_by` on a point declares it an older version superseded by a newer head.

**Before writing any UPDATE:** read the `trg_enforce_supersede_invariants` migration to understand what it currently enforces — do not assume. The trigger is the spec; this playbook intentionally does not duplicate its conditions because they can evolve.

**Pre-flight query** — read both source (old) and target (new) points:
```sql
SELECT id, superseded_by, system_tags FROM points WHERE id IN ('old_uuid', 'new_uuid');
```

Derive from the actual data whether each invariant condition is met. The trigger raises with an explicit message on violation, so failures are never silent. If a violation is returned, rethink the pair — do not add an escape hatch to the trigger.

**No replica mode needed.** `trg_enforce_supersede_invariants` is a BEFORE trigger that raises on invalid state; suppressing it via replica mode would bypass your only safety net. Let it fire.

**One UPDATE per pair.** No cascade side effects — only `points.superseded_by` changes.

### Version rewrite (`story_versions`)

- Append-only by convention. Edit only to correct a recorded history error.
- Preserve `created_at` when editing. If inserting a new version, match the `version_number` ordering invariant (`current_version` on `stories` must remain consistent).

### Visibility change (`stories.visibility`, `points.visibility`)

- `trg_*_visibility_immutable` RAISE EXCEPTION on any visibility change — regardless of role.
- Replica mode bypasses them. This is the canonical case where replica mode is load-bearing.
- Side effects: RLS policies filter downstream queries by visibility. Visibility change is semantically large — confirm with user before changing more than a handful of rows at once.

## Environment & Tool Hierarchy

| Operation | Tool | Approval |
|-----------|------|----------|
| Schema discovery | `Read` local files (`docs/technical/database.md`, migrations) | No |
| Live row read (prod) | `curl` GET REST API with service role key | No |
| Live row read (test) | `curl` GET or Supabase MCP (`mcp__supabase__*` → test only) | No |
| Live row write (test) | Supabase MCP or `curl` PATCH | Yes (per `db-access.md`) |
| Live row write (prod) | Management API `curl` (runs as `postgres`) | Yes — always |
| Ad-hoc SQL on prod | Management API `curl` | Yes — always |

**Supabase MCP points at test** (project `gfjctyxqlwexxwsmkakq`). Never use MCP for prod. For prod, use Management API with `SUPABASE_ACCESS_TOKEN` (PAT) from `.env.local`, or REST with `PROD_SUPABASE_SERVICE_ROLE_KEY` from `.env.prod`.

## Explicit Non-Goals

This skill does NOT:
- Create new stories/points (use `/create-spec` + normal implementation flow)
- Change schema (columns, types, constraints) — use the migration flow under `.claude/rules/database.md`
- Handle profiles, RLS policy changes, or auth wiring
- Handle bulk imports — use dedicated import scripts
- Replay a past migration verbatim without state verification — explicitly the failure mode this skill prevents

## Known Coverage Gaps (v1.1)

Mutations not yet with a dedicated playbook — use the 12-step procedure and enumerate triggers yourself:
- `clarity_sessions.live_state` partial updates (use `patch_live_state` RPC, not direct UPDATE)
- Story ownership transfers (touches `stories.author_id`, `story_points.author_id`, `story_verifications.speaker_id`)
- Story/point anonymization (author_id redaction to a shared "ex-member" profile)
- `letter_story_snapshots.point_config` redaction post-seal
- `clarity_docs` / `doc_stories` mutations (has its own visibility-upgrade trigger)
- `story_verifications` speaker_id swaps (requires manual `ears_count` recomputation)
- `witnesses.witness_profile_id` post-hoc backfill when endorsees sign up later

When handling one of these, add a playbook back to this skill after shipping — KDD the pattern.

## Commit Discipline

After a mutation completes:
- No code-change artifacts to commit (this skill doesn't write code).
- If the mutation was incident response, file a `/create-bug` spec capturing root cause (separate from the data fix).
- Run `/kdd` if the incident surfaced a pattern worth persisting in `docs/decisions.md` or `.claude/rules/`.

Silently append one line to `.private/logs/skill-costs.log` per run (per `.claude/rules/skills.md`).

## Appendix A — State-Drift Classification Cheat Sheet

When current prod state doesn't match what you expected:

| Symptom | Likely cause | Fix approach |
|---------|--------------|--------------|
| No rows match filter at all | Migration never ran, or table/col renamed | Verify schema on prod |
| Rows match but values wrong | Migration ran incorrectly, or later manual edit | Derive delta from actual→target (never replay) |
| Partial match (some rows at target, some not) | Migration ran partially | Scope fix to un-migrated rows only |
| Current state = forward cycle applied ≥1× past target | Migration ran once too many, or replay | Apply inverse of the cycle (for a k-cycle n steps past, apply C^(k-n)). Concretely for a 3-cycle one step past: the inverse cycle IS running the cycle two more times — but always express this as concrete per-row target values, not as "run the migration again." |
| Current state = target state already | Prior run succeeded | Skip — no mutation needed |
| Values don't match any known migration step | Unknown history | Stop, investigate with user before mutating |

## Appendix B — Why `DISABLE TRIGGER` is Banned

`ALTER TABLE stories DISABLE TRIGGER ALL` (or even a specific trigger) takes `ACCESS EXCLUSIVE` lock — blocks every read and write on the table until the migration commits. On a hot prod table, this causes an outage.

`SET LOCAL session_replication_role = replica` achieves the same "skip non-replica triggers" effect scoped to the current transaction, without locking the table. Every other connection keeps firing triggers normally and keeps serving traffic.

Always use `SET LOCAL`. Always inside `BEGIN`. Never `DISABLE TRIGGER`.

## Appendix C — Sentinel values during concurrent reads

During a multi-step permutation, rows briefly hold sentinel values (e.g. `st_temp`). Because `LOCK TABLE ... IN EXCLUSIVE MODE` blocks concurrent writes but **not reads**, a reader on another connection could observe the sentinel mid-transaction. Keep transactions short and never ship sentinels that would render meaningfully in the UI if observed.
