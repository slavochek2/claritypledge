---
status: all-done
type: task
rank: 1000752.5
created_date: '2026-04-24'
tags: [versioning, points, schema, migration]
pipeline_ran: [create-spec, architect, generate-tests, dev, ship]
uat_file: features/uat/p800.md
test_files:
  - e2e/integration/p800-supersede-migration.spec.ts
  - e2e/integration/p800-display-filter.spec.ts
  - e2e/p800-supersede-banner.spec.ts
  - e2e/a11y/p800-accessibility.spec.ts
  - src/tests/p800-sealed-letter-regression.test.ts
  - src/tests/p800-chain-utils.test.ts
completed_at: 2026-04-25
---

# P800: Point Supersede — Schema + Display (D1-mini)

## Problem

**Situation:** Points can have multiple versions (v1, v2, v3) marked via write-protected `system_tags`. When a point's wording is revised, the original must stay immutable because endorsers have staked positions on it (per `definitions.md:256-258`). The founder has been creating new versions this way; only the founder can, because `protect_system_tags` trigger (migration `20260403120000`) blocks writes by other users.

**Complication:** Every surface that renders "story's linked points" shows ALL versions. Story `/story/883d89f5-4449-46b2-a663-f4f2c7204c22` displays 5 linked points but only 2 are current — the other 3 are outdated versions that clutter /live (pre-load and active session), profile story views, and draft compose. Endorsers of v1 have no breadcrumb to v2. The letter-hide mechanism (P749) solves this for letters only; every other surface is still broken. The `system_tags`-based versioning is a founder-private workaround and doesn't generalize.

**Question:** How do we represent supersession as first-class schema (not founder-private tags), filter outdated versions from linked-point lists everywhere, and give v1 endorsers a discoverable path to the current head — without adding user-facing UI yet (no non-founder is authoring points)?

## Appetite

**Blast radius:** Medium — schema change (one column, one trigger) plus display filter applied to multiple surfaces (story detail, /live preload, /live active, profile story view, draft compose). Sealed letters unchanged by design.

**Reversibility:** Medium — schema column can be dropped; display filter is code-only revert. Backfill data is derivable again from `v<N>` tags if needed.

**Decision density:** Low — key decisions resolved in conversation prior to spec:
- Point author = `points.first_validator_id` (already exists; not a new column)
- Within-variant only (main ↔ main, anti ↔ anti)
- Linear chain only (no branches)
- Banner on point detail is the only discovery path (no push/nudge)
- No position transfer, no endorser-count aggregation
- Founder-manual rollout — no UI button yet (that's P801)

## Design Rationale

The original product model ([definitions.md:256-258](../docs/definitions.md)) makes points immutable after engagement and instructs authors to "file a new point" when wording evolves. Old positions stay valid because the point they pinned to never changes.

In practice the founder has been versioning points anyway — via write-protected `system_tags` (`v1`, `v2`, …) — to correct wording without abandoning endorsers. This is a founder-private workaround enforced at the DB trigger level. It works for the founder but never generalized: `system_tags` are unwritable by anyone else, and no surface consistently filters to the latest version, so stories accumulate outdated points that confuse readers in /live, on profiles, and in drafts.

We considered three paths (see Alternatives Considered): keep the founder-only tag workaround and just filter everywhere (fragile, doesn't generalize), build a full user-facing supersede feature with UI now (no consumer — no non-founder authors points today), or formalize the supersede relationship as first-class schema and ship only the founder-needed slice now. We chose the third. It honors the immutability rule (old points and old positions are never mutated), uses machinery that already exists (`points.first_validator_id` as the point's author — no new authorship concept), and defers the UI button to P801 when user-gen authoring arrives.

The scoped-visibility rule — hide superseded points only where a story's linked-points list is rendered, never on endorser history or direct links — prevents a hypothetical author-abuse vector (where an author could mark a strongly-endorsed v1 as "superseded by" an unrelated v2 to redirect social gravity) while still solving the real clutter problem. An endorser's record of their own stake is sacred and survives supersede.

## Solution

**What changes for users:**

- A reader or endorser lands on a story today and sees 5 linked points, 3 of which are outdated versions. After this ships, they see only the 2 current versions. The same filter applies in /live pre-load, /live active session, profile story view, and draft compose.
- An endorser who previously staked a position on v1 keeps that position. In their own profile's "points I've engaged with" list, v1 is still visible — their history is preserved. If they follow a saved link or their history back to v1, they see a clear banner: *"Superseded by → [current version]"* with a jump link. One click takes them to the head of the chain (not to the immediate next version — to the current head even through long chains).
- The point detail page for any superseded version also offers an expandable "Version history" showing the full ancestor chain, so readers can see how the claim evolved.
- Sealed letters are frozen and unaffected. A letter that was sealed when v1 was current continues to render v1 content even after v2 is published — the letter's meaning is preserved.
- Search results still include all points (including superseded). Direct URLs to superseded points still resolve; they just carry the banner.
- The story author versions points exactly as they do today. A one-time migration wires existing version chains into the new successor structure. No action required from any user.

**What's being built (at spec level — DDL specifics for `/architect`):**

- A point-level pointer field that records "this point has been superseded by that point." Stored on `points`, not on the `story_points` junction, so it survives position removal and any future re-linking of points to other stories.
- A write-time invariant enforcement that rejects: cross-variant supersede (main ↔ anti), cycles, and pointers targeting anything other than a current head. Same-variant is determined by shared presence (or absence) of the `misunderstanding` system_tag.
- A one-time backfill that walks existing `v<N>` system_tags per `(st-group, variant)` and wires the equivalent successor chain. The `v<N>` and `misunderstanding` tags remain in place as decorative version markers — they render as pills today and continue to.
- A display filter applied at every surface that lists a story's linked points. Surfaces that show full discourse (search, direct links, endorser history, sealed letters) are untouched.
- Point detail renders the "superseded by → head" banner and the version history expander when applicable. Head is resolved by walking the successor pointer at read time (no denormalization; walks are trivially short today).
- **No UI authoring path.** The founder sets the supersede pointer via SQL until P801 introduces the button for general users.

## Risks / Non-Goals

### Risks

- **Backfill correctness:** If `(st-group, variant)` resolution is wrong, backfill creates bad chains or branches. Mitigation: backfill script verifies exactly one head per `(st-group, variant)` after running; fails loudly if multiple.
- **CHECK-via-trigger complexity:** Same-variant check inspects `system_tags` arrays, which is awkward in a pure CHECK. Mitigation: implement as `BEFORE INSERT OR UPDATE` trigger function, unit-tested on test DB before prod.
- **Cycle prevention race:** Two simultaneous writes could theoretically create a cycle. Mitigation: trigger runs inside the write transaction; PostgreSQL row locks prevent concurrent conflicting updates on the same chain.
- **Missed surface:** A linked-points list that doesn't apply the filter would still show the old clutter. Mitigation: grep-audit all queries that read `story_points` joined to `points` in one pass; add integration test verifying story `883d89f5` renders 2 points, not 5, on each named surface.
- **Sealed letter regression:** Letter snapshots must NOT re-filter by current `superseded_by` — they're frozen. Mitigation: verify `letter-snapshot-mapper.ts` and rendering paths do not join live `points.superseded_by`. Existing v1-sealed letters must continue to render v1 content.
- **first_validator_id surfacing:** Not introduced by this spec, but spec uses the field conceptually. Any UI surfacing of authorship is deferred to P801 and subject to its own privacy review.

### Non-Goals

- **Do NOT** add UI button for author to set `superseded_by`. That is P801 (D1-full).
- **Do NOT** build push notifications / inbox alerts to v1 endorsers when a successor is published. The banner on point detail is the sole discovery path.
- **Do NOT** aggregate endorser counts across the chain. Each point keeps its own count. P2 starts at zero endorsers regardless of how many P1 had.
- **Do NOT** remove or rewrite `v<N>` or `misunderstanding` system_tags. Decorative use continues.
- **Do NOT** modify the position-removal cascade trigger (`cascade_position_removal_to_story_points` from `20260220120000`). Supersede is orthogonal; point orphaning via position removal is unchanged behavior.
- **Do NOT** add a new `points.author_id` column. `first_validator_id` already serves as the canonical point author.
- **Do NOT** allow cross-variant supersede. Main supersedes main; anti supersedes anti. Enforced at trigger level.
- **Do NOT** allow branching chains (two successors claiming the same predecessor). Linear chains only. Enforced via "target must be head" invariant.
- **Do NOT** extend this spec to cover orphan cleanup (points with no positions and no story link). Existing skill `/slava:maintain:abandoned-points` handles that separately.
- **Do NOT** add an UPDATE RLS policy on `points`. The `points` table has no UPDATE policy today (migration `20260204:343–354` — "Points are not editable after creation"). This structurally gates `superseded_by` writes to trusted paths (migrations, `service_role`); the founder-manual rollout depends on this invariant. Introducing a scoped UPDATE policy belongs to P801 and must be narrowly tied to the `superseded_by` column.

### Alternatives Considered

- **D2+: keep `system_tags` as authoritative versioning source and just apply the filter universally.** Rejected: tags are write-protected (founder-only), so D2 cannot generalize to user-authored points. Every future user-facing versioning feature would require admin-only schema bypass.
- **D1-full: ship schema + display + user-facing supersede button in one spec.** Rejected: zero non-founder users currently author points, so the button has no consumer. Shipping it now is premature scope.
- **No schema change; expand P749 letter-hide to cover all surfaces.** Rejected: P749's `point_config.hidden` lives on `stories.point_config` JSONB — a per-story author-side hide flag, not a point-level supersede relationship. It doesn't create discoverability (no banner, no jump link, no breadcrumb for v1 endorsers).

### Rollback Strategy

- **Display filter only is broken:** revert feature branch — code-only rollback, immediate.
- **Constraint triggers reject valid data:** `DROP TRIGGER enforce_supersede_invariants ON points;` — column stays, but writes become unchecked until fixed.
- **Backfill is wrong:** `UPDATE points SET superseded_by = NULL;` then re-run corrected backfill.
- **Full revert (last resort):** `ALTER TABLE points DROP COLUMN superseded_by;` via follow-up migration.

## Done-When

- [ ] Migration applies on test DB: `points.superseded_by` column present, trigger installed
- [ ] Backfill migration populates chains for existing versioned content on test DB
- [ ] On test DB, `/story/883d89f5-4449-46b2-a663-f4f2c7204c22` renders 2 linked points (not 5) on: story detail card, /live preload, /live active, profile story view, draft compose
- [ ] Point detail page of a superseded point renders "Superseded by → [HEAD]" banner with working jump link
- [ ] "Version history" expandable section on point detail lists all ancestors in chain
- [ ] Direct URL to a superseded point resolves (not 404), shows banner
- [ ] Search results still include superseded points (no filter applied)
- [ ] Endorser profile shows their position on superseded v1 (history preserved)
- [ ] Existing sealed letters continue to render their frozen v1 snapshot (no regression)
- [ ] Integration test: story `883d89f5` linked-points count equals 2 on story detail page
- [ ] Trigger rejects: cross-variant supersede, cycle, target with non-null `superseded_by`
- [ ] Migration applied on prod; story `883d89f5` shows 2 points in all named surfaces

## Migration Plan

1. **Author migrations on feature branch:**
   - `p800_point_supersede.sql` — column + trigger
   - `p800_backfill_supersede.sql` — chain wiring from `v<N>` tags
2. **Run on test DB** via `./scripts/migrate.sh`
3. **Verify on test:** story `883d89f5` query returns 2 linked points; each old-version point has `superseded_by` set; constraint-trigger rejects invalid inserts (test via deliberate violation)
4. **Ship feature branch** per normal `/ship` workflow
5. **Run migrations on prod** via `./scripts/migrate.sh` (or Management API fallback)
6. **Manual prod verification:** visit `/story/883d89f5`, /live preload, draft compose — confirm 2 points on each; visit a superseded point directly, confirm banner

## Data Integrity Check

After backfill on each environment:

```sql
-- Count of superseded points should match expected (one less than total versions per st-group variant)
SELECT COUNT(*) FROM points WHERE superseded_by IS NOT NULL;

-- Every (st-group, variant) has exactly one head (non-null st-group tag, no successor)
SELECT st_tag, has_misunderstanding, COUNT(*) AS head_count
FROM (
  SELECT p.id,
         (SELECT t FROM unnest(p.system_tags) t WHERE t ~ '^st\d+$' LIMIT 1) AS st_tag,
         'misunderstanding' = ANY(p.system_tags) AS has_misunderstanding
  FROM points p
  WHERE NOT EXISTS (SELECT 1 FROM points p2 WHERE p2.superseded_by = p.id)
    AND EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t ~ '^st\d+$')
) heads
GROUP BY st_tag, has_misunderstanding
HAVING COUNT(*) > 1;
-- Expected: zero rows (exactly one head per st-group variant)

-- No cycles: every non-null superseded_by eventually reaches NULL within 100 hops
-- (enforced by trigger; this is a post-migration sanity check via recursive CTE)

-- Sample: story 883d89f5 has exactly 2 non-superseded linked points
SELECT COUNT(*) FROM story_points sp
JOIN points p ON p.id = sp.point_id
WHERE sp.story_id = '883d89f5-4449-46b2-a663-f4f2c7204c22'
  AND p.superseded_by IS NULL;
-- Expected: 2
```

## Related Specs

- **Supersedes [P635](../../p635_point_version_discovery.md)** — P635 proposed UI-level version navigation; this spec obsoletes it with schema-level supersession plus display filter. P635's `status: backlog` should be closed when P800 ships (user action: update P635 frontmatter).
- **[P749](done/.../p749_letter_point_hidden_preview.md)** — letter-level hide for outdated points; same problem scoped to letters only. This spec generalizes.
- **[P602](../2026-03-29/p602_feed_multi_tag_version_filter.md)** — feed-level version filter; related but distinct surface.
- **[P781 / P783](.)** — shell-safety framing unrelated; linked only because recent activity.
- **Next: P801** — D1-full UI button for user-facing supersede authoring.

## Technical Architecture

### Technical Analysis

**Schema realities (verified against migrations):**

- `points.first_validator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` exists (migration `20260204_stories_points_calibration.sql` line 58). Confirmed — spec's decision to reuse it as the conceptual "point author" needs no new column.
- `points` RLS has `SELECT (true)` and `INSERT (verified users)` but **no UPDATE policy** (migration `20260204_stories_points_calibration.sql` lines 343–354). Comment on line 354: *"Points are not editable after creation (statement is immutable)"*. Authenticated PostgREST clients cannot UPDATE the `points` table at all today. This is load-bearing for the security posture — see Security Review.
- `points.system_tags TEXT[] NOT NULL DEFAULT '{}'` exists (migration `20260403120000_p630_system_tags.sql` line 11). Write-protected by `protect_system_tags()` BEFORE UPDATE trigger (line 150–162): when `current_setting('role', true) = 'authenticated'` and `system_tags` differs, the trigger silently restores OLD.system_tags. SECURITY DEFINER functions bypass it. This is how the founder sets `v<N>` tags via admin role today.
- `cascade_position_removal_to_story_points()` trigger (migration `20260220120000_story_point_history_cascade.sql` lines 126–168) fires `AFTER DELETE ON point_positions` and deletes matching rows from `story_points` for the story-author whose position was removed. It does not touch `points` itself. Supersede is orthogonal — confirmed.
- `story_points` junction has `(story_id, point_id)` primary key with CASCADE on both FKs (migration `20260204_stories_points_calibration.sql` lines 68–73). Plus `author_id` added by `20260301120000_story_points_author_unique.sql` (referenced by `linkPointToStory`). Junction-level filtering is not a candidate for the supersede hide — the pointer must live on `points` to survive junction churn.

**Sealed letter isolation (verified):**

The seal path (`seal_and_send_letter` RPC, latest version `20260418144500_p749_seal_rpc_hidden_per_point.sql`) denormalizes everything into `letter_story_snapshots.point_config` at seal time via `jsonb_build_object(...)`: `storyText`, `storyTitle`, per-point `id/text/authorPosition/visibility/hidden`, `order`, top-level `hidden` array. The read path is `src/app/utils/letter-snapshot-mapper.ts::snapshotToStoryWithPoints()` — it reads ONLY from `snapshot.point_config`, with an explicit security comment: *"All data sourced from point_config only — no DB queries."* No join to live `points` at read time. **Preservation invariant: a v1-sealed letter will continue to render v1 content after v2 publishes, because the sealed snapshot carries the full point statement text frozen at seal time.** This spec must not introduce any new join from snapshot rendering to `points`.

**Display-surface inventory — call sites that load a story's linked points:**

| # | Caller | File | Classification |
|---|--------|------|----------------|
| 1 | `getStoryWithPoints(storyId)` → story detail card | `src/app/pages/story-detail-page.tsx:697` → `stories-service-real.ts:247` | **Filter** (spec surface 1) |
| 2 | `getStoryWithPoints(sess.sourceStoryId)` → /live preload into active session bootstrap | `src/app/pages/clarity-live-page.tsx:2798` → `stories-service-real.ts:247` | **Filter** (spec surfaces 2+3 — one fetch feeds both preload and active) |
| 3 | `getStoriesByAuthorWithPoints(profile.id, currentUser.id)` → profile story list | `src/app/pages/profile-page-v2.tsx:277` (also line 527 refresh) → `stories-service-real.ts:353` | **Filter** (spec surface 4) |
| 4 | `getStoriesByAuthorWithPoints(userId, userId)` → content picker inside /live | `src/app/components/partners/live-mode-view.tsx:1230` → `stories-service-real.ts:353` | **Filter** (already covered by surface 2 per spec intent — host's own stories in content picker) |
| 5 | `docsService.getDoc(docId)` → doc detail (draft compose) | `src/app/pages/doc-detail-page.tsx:259` → `docs-service.ts:278` (inner join `story_points → points`) | **Filter** (spec surface 5) |
| 6 | `docsService.getDoc(docId)` → letter compose | `src/app/pages/letter-compose-page.tsx:67` → same path | **Filter** (same `docsService.getDoc` code path as #5; one fix covers both) |
| 7 | `docsService.getDoc(docId)` → letter preview (pre-seal) | `src/app/pages/letter-preview-page.tsx:57` → same path | **Filter** (same `docsService.getDoc` code path; preview is the sender's view of the about-to-be-sealed letter — superseded content should not be sealed into a new letter) |
| 8 | `snapshotToStoryWithPoints(snapshot, ...)` → sealed letter reading (letter-reading-page, letter-flow-content, story-walk, useLetterReadingState) | `src/app/utils/letter-snapshot-mapper.ts:115` | **Leave alone** — reads `point_config` only, never joins live `points`. Preservation invariant. |
| 9 | Point detail page → linked stories (NOT linked points of a story) | `src/app/pages/point-detail-page.tsx:125` via `getStoriesForPoints([pointId])` | **Show** — this is the reverse direction (point → stories). Endorser history surface. |
| 10 | `getPublicStoriesFeed()` → feed page | `src/app/pages/feed-page.tsx:58` → `stories-service-real.ts:500` | **Leave alone** — returns `StoryWithAuthor[]` without linked points (no `story_points` join). |
| 11 | Landing page `StoryCardWithLinks` | `src/app/pages/landing-v4.tsx` | **Leave alone** — static demo content, not DB-driven. |
| 12 | `clarity-live-page.tsx:1677` raw `story_points` query for `#understanding` point lookup | `src/app/pages/clarity-live-page.tsx:1674–1685` | **Leave alone** — this is a badge-certification probe that intentionally scans ALL linked points to find the one tagged `understanding`. Filtering superseded here would break the badge path; the `#understanding` point itself should not be superseded. Flag as a probe that bypasses display-filter by design. |
| 13 | `docsService.getDocsByUser()` doc-list point count flattening | `src/app/data/docs-service.ts:352` | **Leave alone** — aggregates a count-per-doc metric; filtering would desync "N points" metadata from what the user sees in the doc. Acceptable; doc-list shows a number, not the points themselves. |
| 14 | `profile-page-v2.tsx:311` → viewer's own story-link lookup for "Add your story" CTA | `src/app/pages/profile-page-v2.tsx:311–322` and line 402 | **Leave alone** — this is the **reverse** join (points → viewer's own stories), used to decide whether the viewer has already authored a story on this point. It's point-centric, not story-centric. |
| 15 | `points-service-real.ts:903` → `story_points` count for a point's story-reach metric | `src/app/data/points-service-real.ts:903` | **Leave alone** — point-centric count (how many stories reference this point), not "story's linked points". |

**Count vs spec:** The spec names 5 surfaces; I found 7 filter-requiring call sites that collapse into **3 service methods**:
- `stories-service-real.ts::getStoryWithPoints` (covers spec surfaces 1, 2, 3 — story detail card, /live preload, /live active session bootstrap)
- `stories-service-real.ts::getStoriesByAuthorWithPoints` (covers spec surface 4 — profile story view)
- `docs-service.ts::getDoc` (covers spec surface 5 — draft compose, plus letter-compose and letter-preview which share the same path)

**Extras flagged vs the 5 named surfaces:** `letter-compose-page.tsx` and `letter-preview-page.tsx` both reach through `docsService.getDoc`. The spec implicitly covers them by naming "draft compose" (they all render the same `doc_stories.story.points` data), but note explicitly: filtering in `docsService.getDoc` fixes all three doc-reading pages at once. No new filter locations needed. The two /live surfaces (preload + active session) are fed by a single `getStoryWithPoints` call — one service-level fix covers both spec surfaces.

**Reuse inventory (existing patterns to leverage):**
- Per-point filter pattern: `letter-snapshot-mapper.ts:129` filters hidden points via array predicate after fetch — precedent for application-layer filtering post-fetch.
- Banner UX precedent: P749 handled hide via a per-point boolean in `point_config.hidden` (no banner; just hide). P800 needs a **new** banner because endorsers need a discoverability path. No reusable component — create one.
- Point detail page (`point-detail-page.tsx`) already has ChevronDown/ChevronRight expandable patterns (line 12, used for linked stories). The "Version history" expander can reuse this pattern.
- `FocusHeader`, `SEO`, `Pin`, `Loader2` already imported in point-detail-page — no new icon imports needed beyond what lucide-react provides.

**Dependencies:** no new npm packages. No new edge functions. No new external APIs.

### Architecture Decisions

**Decision 1: Represent chain head resolution by runtime walk, not denormalization**
- **Chosen:** Resolve "head of chain" by walking `superseded_by` at read time (starting from a given point id, follow pointer until NULL). Hard cap 100 hops — matches the spec's trigger invariant.
- **Rationale:** Chains in production today are short (3–5 versions per `(st-group, variant)` based on story `883d89f5`'s 5 points = at most one v1→v2 chain of length 2 per variant). Walking is O(chain length); denormalizing a `head_id` column requires cascade updates every time a new link is appended — two writes per publish and a new failure mode if the cascade is interrupted. The runtime walk is a pure function of the column.
- **Runtime-observable consequence:** One additional single-row SELECT per `superseded_by` hop per banner render. Acceptable because the banner renders on a Focus page (point detail), not a list.
- **Alternative rejected:** denormalized `head_id` column — extra column to keep consistent, extra write path, extra trigger surface. No benefit until chain lengths hit >100 (the trigger's hard cap) — at which point the chain is pathological and needs human intervention, not a faster read.

**Decision 2: Invariant enforcement via trigger function, not CHECK constraint**
- **Chosen:** `BEFORE INSERT OR UPDATE OF superseded_by ON points` trigger running a PL/pgSQL function that enforces four invariants: (a) target exists, (b) same variant (misunderstanding array membership match), (c) target is a head (target's `superseded_by IS NULL`), (d) no cycle (walk from NEW.superseded_by; hard cap 100 hops; reject if NEW.id appears).
- **Rationale:** The variant check must inspect `system_tags` of BOTH source and target rows — `'misunderstanding' = ANY(source.system_tags)` equated with `'misunderstanding' = ANY(target.system_tags)`. CHECK constraints can only read NEW.*; they cannot reference other rows. The cycle check is equally row-traversal — impossible in CHECK.
- **Runtime-observable consequence:** A trigger function running inside the write transaction. Concurrent conflicting writes on the same chain are serialized by the row lock PostgreSQL takes for UPDATE. The 100-hop walk is bounded.
- **Alternative rejected:** A partial CHECK on cross-variant via a stored generated boolean column — too much new surface for one invariant, doesn't cover cycles or target-is-head.

**Decision 3: Same-variant defined as matching presence/absence of `'misunderstanding'` in system_tags**
- **Chosen:** Helper function `same_variant_misunderstanding(src_tags TEXT[], tgt_tags TEXT[]) RETURNS BOOLEAN` with body `('misunderstanding' = ANY(src_tags)) IS NOT DISTINCT FROM ('misunderstanding' = ANY(tgt_tags))`.
- **Rationale:** `IS NOT DISTINCT FROM` handles NULL arrays safely (both NULL → true). Boolean-on-boolean comparison is trivially symmetric. Using a named helper keeps the main trigger readable and gives the invariant a single edit point if the spec evolves to include other variants later.
- **Runtime-observable consequence:** Two `ANY` array scans per write. Arrays are tiny (~5 tags). Negligible.
- **Alternative rejected:** Inline the boolean expression in the trigger body — harder to unit-test, and the spec explicitly enumerates this as the variant rule, so it deserves a named function.

**Decision 4: Display filter lives at the service layer (application), not the query layer**
- **Chosen:** Filter `superseded_by IS NOT NULL` after the fetch, inside each service method (`getStoryWithPoints`, `getStoriesByAuthorWithPoints`, and `docs-service.ts::getDoc`'s `mapPointSummaries`). Add `superseded_by` to the `points` SELECT list; drop rows where it's non-null before returning.
- **Rationale:** The query path uses nested PostgREST selects (`point:points!story_points_point_id_fkey(...)`), which PostgREST accepts WHERE clauses only on the top-level table in the join expression. Inner-resource filtering in PostgREST requires either a view or `?point.superseded_by=is.null` syntax — the latter being brittle (breaks if PostgREST's inner-filter semantics change, not well-tested across our query shapes). Application-layer filter is a one-line `.filter(p => !p.superseded_by)` in each service method. The nested query already fetches all joined points; filtering in app costs nothing — rows are already in memory.
- **Runtime-observable consequence:** Over-fetch: outdated points are transferred from DB to client then dropped. At 5 points per story and ~3 superseded, 3 extra rows per fetch. Negligible bandwidth.
- **Alternative rejected:** Database view `points_current` (filtered) — adds a new surface to keep in sync with RLS (views inherit base-table RLS in Postgres 15, so this would work, but adds a migration and a grep target for future schema changes). Not worth it for 3 rows.

**Decision 5: Banner resolves the head client-side, walking via a dedicated service method**
- **Chosen:** New service method `pointsService.getChainHead(startPointId: string): Promise<{ headId: string; hops: number } | null>` that does the runtime walk via successive `select('id, superseded_by').eq('id', nextId).maybeSingle()` calls, bailing at null or 100 hops. Banner component calls it inside a `useEffect` on point-detail page when `point.supersededBy != null`.
- **Rationale:** Client-side walk is a small sequence of cached PostgREST GETs. Each intermediate row is typically cached by the browser after the first render. An RPC for this is overkill — no transaction requirement, no security boundary, no complex joins. If chain depth grows beyond a handful, switch to a recursive CTE via RPC — explicitly document this as a future refinement, not current work.
- **Runtime-observable consequence:** Up to N HTTP GETs where N = chain length. At N=2 this is one extra round-trip. The banner is rendered async (loading spinner acceptable during walk).
- **Alternative rejected:** Server-side RPC `get_point_chain_head(UUID) RETURNS UUID` using a recursive CTE — cleaner for deep chains, but adds a new RPC surface, a new migration, and (importantly) bypasses RLS unless marked `SECURITY INVOKER`. Not needed at current chain depths. Reserve for a future refinement if chains grow.

**Decision 6: "Version history" expander uses the same client-walk service method**
- **Chosen:** The expander fetches the full chain by walking from the current point both forward (via `superseded_by`) and backward (via a reverse lookup `select('id').eq('superseded_by', currentId).maybeSingle()` repeated until null). Returns an ordered array `[root, ..., current, ..., head]` for rendering.
- **Rationale:** Same reasoning as Decision 5 — chain length is small, no RPC needed. Reuses the same walk primitive.
- **Alternative rejected:** Server-side recursive CTE returning the full chain — same trade-off as Decision 5. Defer.

**Decision 7: Migration files use 14-digit timestamps per `.claude/rules/database.md`**
- **Chosen:** Two files: `supabase/migrations/20260424120000_p800_point_supersede.sql` (column + trigger + helper function) and `supabase/migrations/20260424120100_p800_backfill_supersede.sql` (backfill). Timestamps are illustrative; `/dev` picks real timestamps at write time.
- **Rationale:** The database rules mandate 14-digit timestamps to prevent `db push` collisions on same-day migrations. Separating column+trigger from backfill lets the backfill be re-run or rolled back independently if chains wire incorrectly (per spec's rollback strategy).
- **Alternative rejected:** Single combined migration — harder to partial-rollback the backfill if chains wire wrong.

### Security Review

Author-only write enforcement is already structural via the absent UPDATE RLS policy on `points` (migration `20260204:343–354` — "Points are not editable after creation"). No additional authority guard is needed in D1-mini: SQL/migration paths use `service_role`, PostgREST/authenticated clients are denied by default. A compromised PostgREST request cannot set `superseded_by` because the UPDATE itself is blocked at the policy layer.

Sealed letter isolation: verified during architect investigation. `letter-snapshot-mapper.ts` reads from the sealed `point_config` JSONB (denormalized at seal time by P749's seal RPC) and never joins live `points`. Letters sealed with v1 content continue to render v1 content forever, unaffected by any later supersession. No code change needed on the snapshot path; this is a preservation invariant — future changes to the snapshot reader must not introduce a join to live `points`.

No PII newly exposed: the banner renders the successor point's statement text and links to it; it does not surface `first_validator_id`. Version history expander lists ancestor statements, not authorship. Authorship privacy review is deferred to P801, which is the first spec to consider surfacing author identity.

Intentional bypass — `clarity-live-page.tsx:1677` runs a raw `story_points` query for the `#understanding` badge certification probe. Badge certification is history-dependent and must see the full point linkage regardless of supersede state. This query deliberately does NOT apply the supersede filter; `/dev` must add an inline comment stating the exemption and its reason. Flagged so future refactors of that file don't silently apply the filter.

### Implementation Approach

#### Build Sequence

1. **Migration 1 — `points.superseded_by` column + invariant trigger + variant helper.**
   - ALTER TABLE points ADD COLUMN superseded_by UUID REFERENCES points(id) ON DELETE SET NULL (DEFAULT NULL).
   - CREATE INDEX on `points(superseded_by)` for the reverse lookup (version history's backward walk).
   - CREATE FUNCTION `same_variant_misunderstanding(text[], text[]) RETURNS boolean` (IMMUTABLE, LANGUAGE sql).
   - CREATE FUNCTION `enforce_supersede_invariants() RETURNS trigger` — validates target row exists, same-variant, target is head, no cycle (bounded walk, hard cap 100).
   - CREATE TRIGGER `trg_enforce_supersede_invariants BEFORE INSERT OR UPDATE OF superseded_by ON points FOR EACH ROW EXECUTE FUNCTION enforce_supersede_invariants()`.
   - Run on test DB via `./scripts/migrate.sh`. Verify trigger rejects: cross-variant (main → anti), cycle (A → B, then B → A), target-not-head (A → B where B already has superseded_by set).
   - **Rollback if step fails:** `DROP TRIGGER`, `DROP FUNCTION`s, `ALTER TABLE points DROP COLUMN superseded_by`. All three in one transaction.

2. **Migration 2 — backfill from `v<N>` + `misunderstanding` tags.**
   - PL/pgSQL block: for each `(st-tag, misunderstanding-presence)` group, SELECT all `points` with that signature, ORDER BY version-number-extracted-from-system-tags, then within that group chain each row to the next (`UPDATE points SET superseded_by = next.id WHERE id = current.id`).
   - The highest version in each group keeps `superseded_by = NULL` (head).
   - Post-migration SELECT: verify exactly one head per `(st-tag, variant)` (spec's Data Integrity Check query).
   - Run on test DB; verify `/story/883d89f5` returns 2 non-null-head points in the Data Integrity Check.
   - **Rollback if step fails:** `UPDATE points SET superseded_by = NULL WHERE superseded_by IS NOT NULL` — the column is still present, chains just reset. Re-run corrected backfill.

3. **Display filter — service layer, one commit per service method, each verified separately.**
   - 3a. `stories-service-real.ts`: add `superseded_by` to the `points` SELECT columns in `getStoryWithPoints` and `getStoriesByAuthorWithPoints`; add `.filter(p => !p.superseded_by)` to the post-fetch mapping. Verify: `/story/883d89f5` on test renders 2 points (story detail, /live preload, /live active, profile). **Rollback if wrong:** revert the two-line change; supersede continues working, surfaces just don't filter.
   - 3b. `docs-service.ts`: add `superseded_by` to the nested `point` select string (`STORY_WITH_AUTHOR_AND_POINTS_SELECT`); in `mapPointSummaries`, drop rows where `sp.point.superseded_by !== null`. Verify: draft compose on test for a doc that includes story `883d89f5` renders 2 points. **Rollback if wrong:** revert.

4. **Point detail page banner (when `point.supersededBy != null`).**
   - 4a. Add `superseded_by` to the point fetch in `pointsService.getPointWithUserPosition` and `getPointWithCounts` (and propagate through the `PointWithCounts` / `PointWithUserPosition` types in `src/app/types/`).
   - 4b. Add `pointsService.getChainHead(pointId: string): Promise<{ headId: string, hops: number } | null>` (client-side walk, hard cap 100, returns `null` on cycle/overflow).
   - 4c. New component `src/app/components/social/point-supersede-banner.tsx` — renders: "Superseded by → [jump-link-to-head]". Uses `FocusHeader`-adjacent styling; colors per design-system (blue link only; no green/amber/orange/yellow per `.claude/rules/src.md`).
   - 4d. Render the banner at the top of `point-detail-page.tsx` (above the point statement) when `point.supersededBy !== null`.
   - Verify: direct URL to a v1 point resolves, shows banner, jump-link navigates to v2. **Rollback if wrong:** remove the component mount in point-detail-page; banner vanishes; detail page still works.

5. **Version history expander on point detail page.**
   - 5a. Add `pointsService.getVersionChain(pointId: string): Promise<PointSummary[]>` — walks backward + forward, returns ordered ancestor+current+descendant array.
   - 5b. New component `src/app/components/social/point-version-history.tsx` — expandable (Chevron pattern per existing `point-detail-page.tsx`), lists each version's statement and created_at.
   - 5c. Mount below the banner when the chain has >1 point.
   - **Rollback if wrong:** unmount; history hides; banner still works.

6. **Integration test: story `883d89f5` linked-points count = 2 across named surfaces.**
   - Add to `e2e/` (or `src/tests/` if service-level). Probe: getStoryWithPoints(883d89f5) → points.length === 2. Probe: docsService.getDoc(<doc-with-story-883d89f5>) → filtered story.points.length === 2.
   - **Rollback if wrong:** test itself is a signal; if it fails, fix the filter logic before proceeding.

7. **Trigger rejection tests.**
   - In a test migration script (`scripts/archive/migrations/YYYYMMDD-p800-trigger-tests.sql` or a Jest DB test), attempt deliberate INSERTs: cross-variant (expect error), cycle (expect error), target-not-head (expect error). Assert each error message.
   - **Rollback if wrong:** fix trigger logic before ship.

8. **Sealed letter regression test.**
   - Confirm `snapshotToStoryWithPoints` still renders a v1-sealed letter's v1 content unchanged after v2 publishes. Existing tests in `src/tests/p749-hidden-points-snapshot-mapper.test.ts` cover the pattern — add a P800-specific case asserting that `superseded_by` never enters the snapshot code path.
   - **Rollback if wrong:** sealed-letter rendering broke — immediate revert of display-filter changes (they're the only paths that could affect letters through accidental code sharing).

#### Files to Create

- `supabase/migrations/YYYYMMDDHHMMSS_p800_point_supersede.sql` — column, index, helper function, trigger function, trigger. Timestamp per `.claude/rules/database.md` (14 digits, sub-second separation from any same-day migration).
- `supabase/migrations/YYYYMMDDHHMMSS_p800_backfill_supersede.sql` — backfill block; idempotent (`UPDATE ... WHERE superseded_by IS NULL AND <condition>` so re-run is safe).
- `src/app/components/social/point-supersede-banner.tsx` — banner component. Props: `{ supersededById: string }`. Renders loading state during walk, then "Superseded by → [link]".
- `src/app/components/social/point-version-history.tsx` — expandable version chain component. Props: `{ chain: PointSummary[] }`.
- `src/tests/p800-supersede-filter.test.ts` — unit/integration test asserting filter behavior across the three service methods.
- `src/tests/p800-trigger-invariants.test.ts` — trigger rejection tests (if using Jest-DB pattern) OR inline assertions inside the migration for MVP.

#### Files to Modify

- `src/app/data/stories-service-real.ts` — add `superseded_by` to point select columns and filter in `getStoryWithPoints` (~line 259) and `getStoriesByAuthorWithPoints` (~line 395).
- `src/app/data/docs-service.ts` — add `superseded_by` to `STORY_WITH_AUTHOR_AND_POINTS_SELECT` (~line 242) and filter in `mapPointSummaries` (~line 141).
- `src/app/data/points-service-real.ts` — add `superseded_by` to `getPointWithCounts`, `getPointWithUserPosition` select columns; add `getChainHead` and `getVersionChain` methods.
- `src/app/data/points-service.interface.ts` — expose `getChainHead`, `getVersionChain` on the interface.
- `src/app/data/points-service-mock.ts` — add mock implementations (return null / empty).
- `src/app/types/index.ts` — add `supersededBy?: string | null` to `PointSummary`, `PointWithCounts`, `PointWithUserPosition`.
- `src/app/pages/point-detail-page.tsx` — mount banner and version-history components at the top of the page (above the statement and tag pills). Thread `supersededBy` through the existing `point` state.
- `src/app/utils/letter-snapshot-mapper.ts` — **no change required.** Confirmed: the mapper reads from `snapshot.point_config` only, never joins live `points`, never references `superseded_by`. Document this file as "intentionally untouched" in the PR description so reviewers don't wonder.
- `src/app/data/stories-service.interface.ts` — no signature changes (filter is an internal impl detail; return type `StoryWithPoints[]` unchanged).
- `src/app/pages/clarity-live-page.tsx:1677` — **no change required** (the `story_points` query at this site is a `#understanding`-tag probe, not a display surface; see Technical Analysis #12). Add a one-line code comment documenting why it bypasses the filter.
- `src/app/data/stories-service-mock.ts` — no change (mock doesn't need to model supersede for unit tests).

## Test Coverage Strategy

**What's Tested:**
- ✅ `points.superseded_by` column exists after migration (integration) — catches P160-class "column missing" bugs
- ✅ New points default to `superseded_by IS NULL` (integration)
- ✅ Trigger invariant: valid same-variant supersede succeeds (integration)
- ✅ Trigger invariant: cross-variant supersede rejected — both directions (integration)
- ✅ Trigger invariant: target-not-head rejected (integration)
- ✅ Trigger invariant: cycle rejected (integration)
- ✅ Display filter: story `883d89f5` has exactly 2 non-superseded linked points after backfill (integration)
- ✅ Display filter: controlled test story correctly excludes superseded_by-set points (integration)
- ✅ Sealed letter mapper renders v1 statement unchanged (unit) — preservation invariant
- ✅ Sealed letter mapper ignores unknown `superseded_by` field in snapshot data (unit)
- ✅ `countTotalPoints` counts all sealed points including would-be-superseded (unit)
- ✅ `getChainHead` walks chain of depth 1, 2, 3; returns null at 100-hop cap; returns null for missing point (unit)
- ✅ `getVersionChain` returns full ancestor-to-head ordered array from any position in chain (unit)
- ✅ Point detail page loads without console errors (E2E smoke)
- ✅ Non-superseded point shows no banner (E2E)
- ✅ Superseded point shows "Superseded by" banner (E2E)
- ✅ Version history section visible when chain exists (E2E)
- ✅ Banner link is keyboard accessible (a11y)
- ✅ Version history expander is keyboard accessible; aria-expanded toggles (a11y)
- ✅ Banner link has descriptive accessible text (a11y)

**What's NOT Tested (rationale):**
- ❌ `/live` preload and active session surfaces separately — both fed by `getStoryWithPoints`; one service fix covers both; covered by display-filter integration test
- ❌ Profile page and draft compose UI separately — all route through service methods tested via integration; manual UAT covers the UI
- ❌ Search unaffected — search doesn't use `story_points` join; no regression risk; manual UAT-4 covers it
- ❌ Endorser profile history — requires a sealed position on a superseded point; complex to seed in E2E; manual UAT-5 covers it
- ❌ `getChainHead` and `getVersionChain` with real Supabase calls — unit tests with stubs are sufficient at this chain depth; integration tests cover the DB writes they depend on

**Test Pyramid:**
```
       /\
      /  \   4 E2E tests
     /____\
    / 3 A11y \
   /__________\
  /  9 Integration \
 /__________________\
/  9 Unit (Vitest)   \
```

**Files:**
- `e2e/integration/p800-supersede-migration.spec.ts` — 7 tests
- `e2e/integration/p800-display-filter.spec.ts` — 2 tests
- `e2e/p800-supersede-banner.spec.ts` — 4 tests
- `e2e/a11y/p800-accessibility.spec.ts` — 3 tests
- `src/tests/p800-sealed-letter-regression.test.ts` — 4 tests
- `src/tests/p800-chain-utils.test.ts` — 9 tests (5 getChainHead + 4 getVersionChain)
- `features/uat/p800.md` — 15 Given/When/Then scenarios

**Total:** 25 automated tests + 15 UAT scenarios
