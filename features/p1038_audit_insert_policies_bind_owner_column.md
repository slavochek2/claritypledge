---
status: qa
type: task
rank: 1000962.0
severity: high
created_date: '2026-08-10'
tags: [security, rls, audit, content-integrity]
delivery_stage: dev
pipeline_ran: [create-spec, architect, dev]
driver: anomaly
feature_type: backend
---

# P1038: Audit all owner-column tables for INSERT policies that don't bind ownership

## Problem

P1032 and P1034 found the same bug class on two different tables discovered reactively, one
after the other: an INSERT policy checks that the caller is *a* verified user, but never that
the row's own owner column (`author_id`, `first_validator_id`, etc.) actually names the caller —
while the table's UPDATE/DELETE policies on the same column already do bind ownership. Both
instances were found by accident (P1032 via a spec-review pass on unrelated work; P1034 via
adversarial code review of P1032's own fix). There is no reason to believe these are the only two
— every table with an owner column and an INSERT policy is a candidate until checked.

## Appetite

Low blast radius per fix (a single `AND <owner_column> = auth.uid()` predicate addition, matching
the proven P1032/P1035 pattern) but the audit itself touches every owner-column table in the
schema — potentially multiple migrations. Fully reversible per-table (each fix is an independent
`DROP POLICY` + `CREATE POLICY` migration). Low decision density — the fix pattern is already
established; this is enumeration + verification, not design.

## Solution

1. Enumerate every table with an owner/author-identity column: grep all `CREATE TABLE` statements
   in `supabase/migrations/` for columns matching `author_id`, `*_id UUID.*REFERENCES profiles`,
   `user_id`, `creator_id`, `host_id`, etc. Cross-check against `docs/technical/database.md`.
2. For each such table, find its current INSERT policy (`grep -A5 "FOR INSERT" supabase/migrations/`
   for that table, taking the most recent one — same method P1032's spec used to confirm which
   policy is live) and its UPDATE/DELETE policies on the same table.
3. Compare: does the INSERT policy's `WITH CHECK` bind the owner column the same way UPDATE/DELETE
   do? If UPDATE/DELETE don't bind ownership either (some tables may be intentionally open), that's
   not a gap — only flag tables where INSERT is the odd one out.
4. For each confirmed gap, verify live state on both test and prod (`pg_policies` query) before
   fixing — P1035 showed migration file history can lie about live state.
5. Fix confirmed gaps with the established pattern; one migration per table or a batched migration
   if multiple gaps are confirmed at once. Write a canary per table following P1032's
   `e2e/integration/p1032-reproduce.spec.ts` shape (forge the owner column, assert rejection, plus
   a positive control).

## Risks / Non-Goals

### Risks
- **False positives on intentionally-open tables** (e.g., `witnesses` — any authenticated user can
  endorse any profile by design, per `.claude/rules/database.md`). Mitigation: only flag a gap when
  the table's own UPDATE/DELETE policies bind ownership and INSERT doesn't — an intentionally-open
  table won't bind ownership anywhere, so it won't false-positive under this comparison.
  **[CORRECTED by the /architect pass, 2026-08-10]** Both halves are wrong. `witnesses` is no
  longer open — its live INSERT policy binds `auth.uid() = profile_id`
  (`supabase/migrations/20260404120000_security_backlog_rls.sql`) and it has no UPDATE/DELETE
  policies at all, though both database docs still say otherwise. And the mitigation itself has a
  **confirmed false negative**: it clears `story_points`, the table P1034 already filed as a live
  gap. Decision 2's amended classifier supersedes this mitigation.
- **Scope creep into unrelated RLS hardening.** Mitigation: this audit is scoped to the exact
  bug class (INSERT vs UPDATE/DELETE ownership-binding asymmetry) — not a general RLS review.

### Non-Goals
- Do NOT audit SELECT policies (different bug class — visibility, not ownership-on-write)
- Do NOT audit service-role bypass policies (that's the separate P1035 bug class — unscoped `TO`
  clause — tracked as its own follow-up, not this audit). **[CLARIFIED by the /architect pass]**
  This exclusion covers *two distinct bypass mechanisms*, not one: (a) unscoped RLS policies
  (P1035's class), and (b) code paths that never evaluate RLS at all — edge functions constructing
  a client with `SUPABASE_SERVICE_ROLE_KEY`, and `SECURITY DEFINER` RPCs. Both are out of scope
  here, but neither is covered by this audit's fixes, so a bound INSERT policy must not be read as
  "all writes to this table are ownership-checked." Decision 2's classifier records the exposure
  per table rather than leaving it implied.
- Do NOT redesign the ownership model for any table — only add the missing binding predicate,
  matching the exact pattern each table's own UPDATE/DELETE policy already uses
- Do NOT fix tables where UPDATE/DELETE also don't bind ownership — that's a different, larger
  design question requiring a founder decision, not a mechanical audit fix

## Done-When

- [x] The permissive-OR aggregate `pg_policies` query has been run once against test and prod, and
      any table it returned had its full live policy set read before classification
- [x] Every table with an owner column has been checked and its status recorded in **one of four**
      buckets: bound / not applicable (open by design) / no comparison basis (no UPDATE/DELETE
      policy) / gap found — plus, per table, whether a `SECURITY DEFINER` or service-role path
      writes to it
- [x] Every confirmed gap has a fix migration, verified live on test before merging
- [x] Each fix has a regression canary following the P1032 pattern (forge + assert rejection +
      positive control), and each canary was **observed failing** against the unfixed policy before
      the fix was applied (epistemic gate 7 — a green-only canary is unproven)
- [x] Every confirmed gap was recorded in `.private/docs/security-log.md` **before** any
      public-repo file named the table, and no public file names an open gap whose fix has not
      landed (ordering constraint — see Build Sequence)
- [x] Findings summarized in `docs/decisions.md` or this spec's resolution, even if the audit
      finds zero additional gaps (a clean audit is still worth recording — see decisions.md
      epistemic gate 8, record under uncertainty)
- [x] The two out-of-scope follow-ups are filed, not absorbed: stale `witnesses` docs, and whether
      the service-role edge functions re-validate ownership in application code

## Technical Architecture

### Technical Analysis

**Current code state.** `supabase/migrations/` holds 22 files with `CREATE TABLE` and 224
`CREATE POLICY` statements total, spanning `20250101_initial_schema.sql` through
`20260724120000_p1010_organizations_membership.sql`. There is no existing policy-enumeration
script (`scripts/` has none — checked `find scripts -iname "*rls*" -o -iname "*polic*"`, only hit
is `scripts/archive/apply-rls-fix.ts`, an archived one-off). `docs/technical/database.md` and
`docs/technical/architecture.md#rls-policies` both carry hand-maintained per-table policy
summaries that are incomplete for this audit's purpose — they describe the *actor* allowed
("Verified users", "Story author") but not whether the INSERT check actually *binds* the row's
own owner column, which is the exact distinction P1032/P1034 fell through.

**Reuse inventory (mandatory — every decision below cites this):**

| Artifact | Path | Reused for |
|---|---|---|
| P1032 fix migration (predicate pattern) | `supabase/migrations/20260809150000_p1032_bind_insert_author_predicates.sql` | Exact `WITH CHECK` shape every new fix migration follows: `DROP POLICY IF EXISTS` + recreate with `<owner_col> = auth.uid()` ANDed in, plus a `-- client-safe:` comment block naming every client insert path checked |
| P1035 fix migration (independent-drop pattern) | `supabase/migrations/20260810130000_p1035_drop_unscoped_service_role_bypass.sql` | Confirms per-table `DROP POLICY IF EXISTS` + recreate is this repo's established idiom for a single-table RLS correction; also the concrete precedent for "a duplicate permissive policy silently defeats a correct sibling" |
| P1032 canary (test shape) | `e2e/integration/p1032-reproduce.spec.ts` | Structural template for every new canary: `beforeAll` creates attacker+victim via `createTestUser`/`generateTestEmail`, forged-insert test asserts `error` is non-null, positive-control test asserts `error` is null, `afterAll` cleans up via `deleteTestUser` |
| Test helpers | `e2e/helpers/test-user.ts`, `e2e/helpers/supabase-admin.ts` | `createTestUser`, `generateTestEmail`, `deleteTestUser`, `supabaseAdmin` — no new test infra needed |
| Migration tooling | `scripts/migrate.sh` | Unchanged — `--env prod` already enumerates every pending migration and hard-blocks on `-- requires-frontend:`; these fixes are `-- client-safe:` (see Decision 2), not `requires-frontend` |
| `docs/decisions.md` 2026-08-10 [technical] entry | `docs/decisions.md:51-61` | The entry this audit's results extend (Decision 3) — its own Consequences line already names this exact audit as the recommended next step |
| Intentionally-open precedent | `.claude/rules/database.md` (`witnesses` — any authenticated user can insert to any profile, by design) | The concrete "not applicable" case the gap classifier (Decision 2) must reproduce mechanically |

No existing RLS helper function (`_is_letter_sender`, `_is_delivery_receiver`, etc.) is reusable
for this audit's classifier — those gate cross-table visibility, not owner-column binding.

**Grep sweep already performed this session (evidence for Decision 2, not a substitute for
/dev's full run):** every `CREATE TABLE` in `supabase/migrations/*.sql` was read for
`UUID REFERENCES profiles/auth.users` columns, then cross-checked against that table's live
INSERT/UPDATE/DELETE policy text. Confirmed bound (no gap): `events`, `event_rsvps`,
`event_sub_rooms`, `event_practice_rooms`, `clarity_docs`, `doc_stories`, `clarity_agreements`,
`clarity_letters`, `letter_deliveries`, `letter_point_responses`, `badge_points`,
`story_explain_backs`, `membership`, `story_verifications`, and — **correcting the spec's own
Risks section** — `witnesses`, whose live INSERT policy
(`supabase/migrations/20260404120000_security_backlog_rls.sql`) reads `TO authenticated WITH
CHECK (auth.uid() = profile_id)`. It **binds** ownership; it is not open-by-design. Both
`.claude/rules/database.md` and `docs/technical/database.md` still describe it as open and
describe UPDATE/DELETE policies that do not exist (only SELECT + INSERT are defined for that
table). The spec's Risk mitigation happens to reach the right conclusion for the wrong reason —
see the corrected note in Risks. This is the gate-3 failure mode the audit must not repeat at
scale: **grep the live migration per table; do not trust either database doc's prose.**

Confirmed not-applicable (no owner column, or no client-reachable INSERT at all):
`organization` (SELECT-only, no client INSERT), `terms_acceptances`,
`session_consents`, the anonymous session-scoped demo/idea/chat sibling tables (no `auth.uid()`
involved at all), `ai_rate_limits`, `email_send_log`, `letter_response_pending` (no client
INSERT/UPDATE/DELETE policy found for either — service-role/RPC-only). Already tracked, not new:
`stories`, `points` (fixed by P1032), `story_points` (was an open gap filed as P1034; fixed
independently on main in `20260811140000` while this audit was in flight — this audit
should not re-file it, only cross-reference).

**One high-confidence candidate gap was found via this sweep, not yet in any filed spec — and it
reproduces the exact P1032/P1034 shape (UPDATE binds the owner column, INSERT does not).**
Per CLAUDE.md's rule against publishing unpatched vulnerability mechanics in this public repo,
the table name, policy names, and exploit path are recorded in `.private/docs/security-log.md`
(entry dated 2026-08-10) and deliberately not restated here. Both the Architect and Security
passes converged on the same table independently.

**Status: CONFIRMED live on prod and test — no longer a candidate.** Verified read-only via the
Management API `POST /v1/projects/{ref}/database/query` with `SUPABASE_ACCESS_TOKEN` from
`.env.prod` (the fallback path `scripts/migrate.sh` already uses). The live policy text was read
from `pg_policies` directly, not inferred from migration files, and prod and test are identical.
Detail stays in `.private/docs/security-log.md`; this remains an **unfixed** gap, so no public
file names it until the fix lands.

**Build Sequence steps 0, 1 and 4 are therefore already discharged** (see below) — `/dev` inherits
them rather than repeating them:

- **Step 0 — credential path: cleared.** The Management API route works for both projects. The
  earlier "no `mcp__supabase__execute_sql` in the loadout" blocker was a wrong conclusion about the
  *only* path, not a real dead end; `pg_policies` is genuinely unavailable over PostgREST, but the
  Management API is not PostgREST.
- **Step 1 — permissive-OR aggregate: run against prod.** Three tables returned >1 permissive
  INSERT policy. Two are benign (one has its second policy correctly scoped `TO service_role`; one
  is the Supabase-managed `storage` schema). The third has **no owner column at all**, so it is
  correctly outside this audit's bug class — but it carries two `WITH CHECK (true)` INSERT
  policies, one reaching anonymous callers. That is an open-write finding of a different class,
  recorded privately and needing its own spec and a founder call; do **not** absorb it here.
- **Step 4 — candidate re-verification: done**, with the result above.

**Also confirmed by the same sweep: P1035's fix is live on prod** — a query for the unscoped
service-role bypass policies it dropped returns zero rows across all tables. That had been an open
question in the reuse inventory.

### Architecture Decisions

**Decision 1 — Enumeration method: grep is primary and sufficient for candidate discovery; live
`pg_policies` is a targeted verification step, not the primary source.**

**Chosen:** Grep `supabase/migrations/*.sql` for `CREATE TABLE` + `UUID REFERENCES
profiles(id)|auth.users(id)` to enumerate candidate owner-column tables, then grep `FOR
INSERT|FOR UPDATE|FOR DELETE` per table across the full migration history to read each policy's
current text (most-recent-undropped `CREATE POLICY` wins, matching the method P1032's own spec
used and confirmed correct against live state). Escalate to a live `pg_policies` query — test via
`mcp__supabase__execute_sql` or `list_migrations` per `.claude/rules/db-access.md`'s tool
hierarchy, prod via `curl` against the REST API with `.env.prod` credentials, never
`mcp__supabase__*` for prod — **only** when either of two triggers fires: (a) grep finds **more
than one** currently-undropped `FOR INSERT` `CREATE POLICY` block for the same table (the
multiple-permissive-policy case — Decision 2 explains why), or (b) the classifier is about to
mark a table CONFIRMED GAP, immediately before writing its fix migration (already required by
this spec's own step 4, restated here as binding on the classifier, not optional).

**Rationale:** `.claude/rules/db-access.md` states schema discovery is "always local" and lists
querying live state to answer a question Read already answers as a "wasteful pattern" — grep
against migration files is that local source, and it is what candidate-discovery structurally
needs (a name-and-shape sweep across 22 files, not a targeted state check). But P1035 proved the
specific failure mode migration-file grep cannot see: an *undropped* duplicate permissive policy.
Since Postgres ORs all permissive policies for the same command together, "the most recent
CREATE POLICY text" is only truthful when it is also the *only* one — and grep alone cannot
prove absence of an earlier undropped sibling as reliably as counting live rows in
`pg_policies` can. Gating the live check on those two triggers keeps every NOT-APPLICABLE and
already-BOUND table at zero live queries (matching db-access.md's "zero unnecessary queries"
principle) while making the live check *mandatory*, not optional, exactly where grep's blind spot
and this spec's own risk (false negatives — a gap that looks fixed on paper but isn't live)
actually live.

**AMENDED during the /architect merge pass (2026-08-10) — trigger (a) is circular as written.**
It fires the live check only when *grep* finds more than one undropped INSERT policy, but
detecting an undropped duplicate is precisely what grep cannot do reliably: `DROP POLICY IF
EXISTS` removes by exact name, so two *differently-named* permissive policies on the same
table+command coexist silently in the file history with nothing textually marking them as
simultaneous. Gating the live check on the unreliable signal means the check never fires in the
case it exists for. This is the P1035 failure mode reproduced one level up.

**Replacement:** run this **once, unconditionally, before classifying any table** — it is a
single aggregate query covering the whole schema, not per-table, so it costs one query total and
`.claude/rules/db-access.md`'s "zero unnecessary queries" principle is not in tension with it:

```sql
SELECT tablename, cmd, count(*) AS policy_count
FROM pg_policies
WHERE cmd = 'INSERT' AND permissive = 'PERMISSIVE'
GROUP BY tablename, cmd HAVING count(*) > 1;
```

Any table it returns gets its full live policy set read before classification. Trigger (b) —
mandatory live verification immediately before writing a fix migration — is unchanged.

**Trade-off (revised):** a table that grep marks BOUND from a single clean INSERT policy is still
never individually double-checked live, but the aggregate query above now closes the specific
blind spot that made that residual dangerous. What remains is only the case where grep's `FOR
INSERT` pattern misses a policy entirely (e.g. non-standard whitespace) *and* that policy is the
sole one on the table — checked: 0 counterexamples across the 224 `CREATE POLICY` statements in
this repo.

**Credential path (blocking precondition, verify before starting):** test via
`mcp__supabase__execute_sql` (test project). **`pg_policies` is not exposed over PostgREST**, so
the prod half cannot use the usual `curl` REST path — it needs the Supabase Management API
`POST /database/query` (the fallback `scripts/migrate.sh` already uses) or `psql` via
`SUPABASE_DB_URL` from `.env.prod`. Confirm that path works before step 2, not mid-audit.

**Alternative rejected:** Live `pg_policies` as the primary source for every table. Rejected —
directly contradicts `.claude/rules/db-access.md`'s local-first schema-discovery rule, and would
turn a one-time 22-file grep sweep into ~15-20 live queries (test) for tables that are already
provably fine from the file text alone, all for a risk (undropped duplicate) that a *count*
query, not a full read, is enough to rule out.

---

**Decision 2 — The gap classifier: a five-step mechanical procedure, anchored on policy usage
(not column naming), with an explicit rule for multi-actor columns and permissive-OR duplicates.**

**Chosen:**

1. **Identify the owner-identity column(s) for table T.** A column `C` counts as owner-identity
   iff (a) it is `UUID REFERENCES profiles(id)` (or `auth.users(id)`), **and** (b) T's own UPDATE
   or DELETE policy (whichever exists) uses `C` in a `USING`/`WITH CHECK` predicate of the shape
   `auth.uid() = C`, `C = auth.uid()`, or `auth.uid() IN (C, ...)`. Anchoring to actual policy
   usage — not a name allowlist (`author_id`, `owner_id`, `creator_id`, `host_id`, `sender_id`,
   `recorder_id`, `initiator_id`, `first_validator_id`, `user_id` all
   appear in this codebase, and none is a superset of the others) — is what makes step 1 immune
   to the naming inconsistency: a differently-named column on a future table is caught the moment
   it is used to bind UPDATE/DELETE ownership, with no manifest to keep in sync.
2. **Multi-actor tables — bind only the creating party's column, not every column in an
   UPDATE OR-list.** Some tables (`event_sub_rooms`: `initiator_id`/`target_id`, and the
   redacted candidate) let *either* of two parties satisfy UPDATE via
   `auth.uid() IN (colA, colB)`. At INSERT time only one party — the one creating the row — can
   correctly be checked; the other party (`target_listener_id`, `target_id`) is being invited and
   by definition is not `auth.uid()` yet. The classifier binds INSERT only against the
   creator-role column. `event_sub_rooms` already does this correctly (`WITH CHECK (auth.uid() =
   initiator_id)` — confirmed bound, no gap). The redacted candidate does not (see Technical
   Analysis).
3. **Table has no owner-identity column, or no client-reachable INSERT policy at all** (RLS
   enabled with zero INSERT policy, or the only INSERT policy is `WITH CHECK (false)`, or INSERT
   is `TO service_role` only) → **NOT APPLICABLE.**
4. **Owner-identity column exists but neither UPDATE nor DELETE binds it.** Split into two
   buckets — collapsing them is what lets "we didn't check" read as "we checked and it was fine":
   - UPDATE/DELETE policies **exist** and are permissive on ownership (`USING (true)`, or bind an
     unrelated column) → **NOT APPLICABLE — open by design.** Nothing to be asymmetric *with*.
   - UPDATE/DELETE policies **do not exist at all** → **NO COMPARISON BASIS.** Under RLS this is
     implicit deny for those commands, which is the opposite of "open by design" — the audit
     simply has no signal either way about whether INSERT *should* bind. Record it as its own
     status; do not fold it into NOT APPLICABLE. (`badge_points` and `witnesses` both land here.)
5. **Owner-identity column is bound by UPDATE and/or DELETE.** Enumerate **every** currently
   undropped `FOR INSERT` policy on T (not just the most recent — see the multiple-permissive-policy
   rule below). If **any** one of them lacks `<owner_column> = auth.uid()` (or the reverse
   operand order, or IN-list membership per step 2) as a top-level ANDed condition in its `WITH
   CHECK` → **CONFIRMED GAP**, regardless of whether a sibling INSERT policy on the same table
   does bind it. If every live INSERT policy binds it → **BOUND**.

   **A `DEFAULT auth.uid()` on the owner column does not satisfy step 5.** A default only fires
   when the client omits the column; a forged INSERT supplies it explicitly, bypassing the
   default entirely. The classifier reads the `WITH CHECK` predicate text only — column defaults
   are not evidence of binding.

   **Multiple permissive INSERT policies apply the OR-defeats-AND rule.** Postgres evaluates
   multiple `PERMISSIVE` policies for the same command as OR'd together — a row need only satisfy
   one. A table with two live INSERT policies, one bound and one not, is exactly as forgeable as
   a table with zero bound INSERT policies. This is mechanically the same class of failure P1035
   fixed (unscoped duplicate `TO`-less policies), applied to the owner-binding predicate instead
   of role scoping — which is why Decision 1's live-verification trigger (a) fires specifically
   on this case.

**AMENDED during the /architect merge pass (2026-08-10) — step 1 as originally written cleared
P1034, the very bug it was designed to catch.** Verified by direct grep, not inference:
`story_points.author_id` is `NOT NULL` with a unique constraint
(`supabase/migrations/20260301120000_story_points_author_unique.sql`), but **both** its INSERT
policy and its DELETE policy bind only the *parent story's* author —
`EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())`, where the
unqualified `author_id` resolves to `stories.author_id` in the subquery scope. Under step 1's
criterion (b), `story_points.author_id` is never used in T's own UPDATE/DELETE predicates, so it
would not count as an owner-identity column at all → step 4 → cleared. P1034 is a filed,
`status: week`, unfixed high-severity bug on exactly that column. A classifier that clears it is
not fit for purpose.

**Step 1 is therefore replaced by 1a + 1b — a column qualifies via EITHER path:**

- **1a (policy-usage anchor — as originally written).** `C` is `UUID REFERENCES profiles(id)` /
  `auth.users(id)` **and** T's own UPDATE or DELETE policy uses `C` in a predicate of the shape
  `auth.uid() = C`, `C = auth.uid()`, or `auth.uid() IN (C, ...)`.
- **1b (ungoverned-attribution column — new).** `C` is `UUID REFERENCES profiles(id)` /
  `auth.users(id)`, is `NOT NULL` **or** carries a uniqueness/attribution constraint, and is
  referenced by **no** policy on T in any command. A column that records who a row belongs to and
  that no policy constrains is ungoverned by definition — the fact that UPDATE/DELETE guard the
  row through a *parent* table says nothing about whether `C` itself can be forged.

Under 1b, `story_points.author_id` qualifies, INSERT does not bind it → **CONFIRMED GAP**, which
matches P1034's filed finding. The audit still must not re-file it — cross-reference P1034 — but
the classifier now *reaches* it, which is the point.

**Consequence for the parent-join pattern generally:** when UPDATE/DELETE bind ownership through
an `EXISTS (SELECT ... FROM <parent>)` join, the comparison "does INSERT look as guarded as
DELETE" returns symmetric and is worthless. Diff at **column granularity** — does the row's own
owner column appear as a bound predicate in INSERT's `WITH CHECK`, and separately, does it appear
anywhere in UPDATE/DELETE — never at policy-strictness granularity.

**Also record, per table, whether any `SECURITY DEFINER` function or service-role edge function
writes to it.** Not to fix those paths (Non-Goals excludes them) but so a BOUND status cannot be
misread as "every write to this table is ownership-checked." Grep `supabase/functions/` for
`SUPABASE_SERVICE_ROLE_KEY` and `supabase/migrations/` for `SECURITY DEFINER` while classifying.

**Rationale:** The architect brief asks for a classifier a `/dev` run can apply "table-by-table
without judgment drift." Anchoring step 1 to policy usage rather than a column-name list is the
single change that makes the procedure survive a future table using a column name none of today's
14 owner-column tables use. Step 2 exists because a naive "INSERT must bind every column the
UPDATE policy touches" rule would misfire on every multi-actor table in the schema today —
`event_sub_rooms` would false-positive as a gap for not requiring `target_id = auth.uid()` at
insert time, which is structurally impossible (the target hasn't acted yet).

**Trade-off:** Step 1's policy-usage anchor means a table whose UPDATE/DELETE policies are
*also* missing the binding (step 4, not-applicable) never gets its INSERT policy scrutinized
either — by design (Non-Goals: "Do NOT fix tables where UPDATE/DELETE also don't bind ownership
— that's a different, larger design question"), but it does mean this audit cannot be read as
"every table's INSERT is provably safe," only "every table's INSERT is at least as consistent as
its own UPDATE/DELETE."

**Alternative rejected:** A column-name allowlist (`author_id|owner_id|creator_id|...`) as the
trigger for step 1. Rejected — it is exactly the kind of hand-maintained manifest that drifts
silently (nobody remembers to add `recorder_id` to the list when `story_explain_backs` ships),
and per CLAUDE.md's "Enumerate dependents" principle, a manifest nobody is forced to update is
worse than no manifest, because it looks authoritative while quietly going stale.

---

**Decision 3 — Findings artifact: the per-table status table lives in
`docs/technical/database.md`; the narrative extends the existing `docs/decisions.md` 2026-08-10
[technical] entry rather than creating a new one.**

**Chosen:** Two homes, per CHARTER.md's routing tree, each holding a different kind of fact:

- **Per-table status (bound / not-applicable / gap-found), one row per table** → new subsection
  `### INSERT Ownership-Binding Audit (P1038)` under `docs/technical/database.md`'s existing `##
  Row Level Security (RLS)` heading. This is schema reference material — CHARTER.md has no
  explicit rule for "per-table technical status," but `database.md` already is the maintained
  home for exactly this shape of fact (see its existing `### profiles policies` / `### witnesses
  policies` tables). A future agent about to write a new INSERT policy greps `database.md` before
  writing code (CLAUDE.md "Before Starting Work" → "Search the codebase" / this repo's existing
  habit of reading `database.md` first per `.claude/rules/db-access.md`) — that is the audience
  this table serves, and it needs to outlive this spec's closure.
- **Why this audit happened, and the reusable rule it establishes** → `docs/decisions.md`,
  **extending** the existing `## 2026-08-10 [technical]: RLS INSERT policies must bind the row's
  own owner column...` entry's Consequences and References (not a new dated entry). That entry's
  own Consequences line already states the plan this spec executes ("worth a one-time audit
  across all tables with an owner column") — per CLAUDE.md's Reference Over Duplication
  principle, the audit's result is the payoff of a promise that entry already made, not a new
  fact needing its own entry. `/kdd` (run at spec close) appends the result there, referencing
  the new `database.md` subsection instead of restating the table.

**Rationale:** CHARTER.md rule 3 (decisions.md = append-only WHY log with falsifier/alternatives)
does not fit a per-table status table — that's reference material, not a dated decision — so
`decisions.md` alone would be the wrong single home, and this spec's own Done-When leaves that
choice open ("this spec's resolution" as a fallback). Resolving it now avoids `/dev` guessing.

**Trade-off:** Two homes instead of one adds a cross-reference to maintain (the decisions.md
entry must link to the database.md subsection). Accepted — the alternative (duplicating the
full table into decisions.md, an append-only log never meant to be re-edited) is the exact
"copies diverge silently" failure Reference Over Duplication warns against.

**Alternative rejected:** This spec's own body as the findings' permanent home. Rejected — this
spec moves to `features/done/` on close and stops being anyone's first read; `database.md` is
read routinely (per `.claude/rules/db-access.md`, it's the load-bearing schema-discovery doc for
every future `src/`, `e2e/`, `supabase/` change), so putting durable reference material in a
closed spec buries it exactly where CLAUDE.md's "Reference Over Duplication" says not to.

---

**Decision 4 — Migration granularity: one migration per confirmed gap.**

**Chosen:** Each confirmed gap gets its own migration file
(`YYYYMMDDHHMMSS_p1038_bind_insert_<table>.sql`), following the P1032/P1035
`DROP POLICY IF EXISTS` + recreate idiom, each independently deployable and independently
revertible.

**Rationale:** The spec's own Appetite states "Fully reversible per-table (each fix is an
independent `DROP POLICY` + `CREATE POLICY` migration)" — that is already the decision; this
entry makes it binding rather than re-litigating it. Rollback Strategy for a batched migration
covering N tables is strictly worse: reverting table B's fix because it surfaced a false positive
means hand-splitting a shared file mid-review, whereas one-file-per-table means `git revert
<sha>` for exactly the affected table. `scripts/migrate.sh --env prod` already enumerates and
gates on *all* pending migrations in one interactive ack regardless of file count, so N small
files cost nothing extra at deploy time versus one large file.

**Trade-off:** N filenames and N `deploy-manifest.json` entries instead of one, plus the P1032↔P1035
same-day manifest-conflict pattern (`docs/decisions.md` 2026-08-10 [process], "Cross-Branch
Manifest Merge") recurs at higher N if fixes ship across separate worktrees/sessions rather than
one batch. Accepted — that entry's own resolution (entry-level manifest merge, not wholesale
checkout) already covers this, and per-table independence is worth more than avoiding manifest
churn given this audit could ship over multiple sessions.

**Alternative rejected:** One batched migration for all confirmed gaps. Rejected per the Rollback
Strategy reasoning above — the "Do NOT redesign the ownership model" Non-Goal implies each fix
should be independently reviewable in isolation, which a batch migration structurally prevents
(a reviewer must approve or reject the whole file).

---

**Decision 5 — Canary shape: one file per confirmed gap, mirroring
`e2e/integration/p1032-reproduce.spec.ts` exactly; explicit statement of what a green run does
NOT prove.**

**Chosen:** `e2e/integration/p1038-reproduce-<table>.spec.ts` per confirmed gap. Each file:
attacker+victim `createTestUser` in `beforeAll`, one test asserting a forged owner-column INSERT
is rejected (`error` non-null), one positive-control test asserting a self-attributed INSERT
succeeds, `afterAll` cleanup via `deleteTestUser`. Per gate 7: write the canary against the
**unfixed** policy first, run it, confirm the exploit assertion fails (insert succeeds,
`error: null`) exactly as P1032's own file docstring records ("This test MUST FAIL until the fix
adds the ownership predicate"), only then apply the migration and re-run to green.

**What the canary does NOT prove (epistemic gate 7b):** it exercises exactly one shape — a
single-row PostgREST insert via the acting user's own JWT, with the owner column set to a second
real test profile's UUID. It structurally cannot emit, and therefore proves nothing about: (a)
forged inserts via any SECURITY DEFINER RPC path (out of scope — Non-Goals excludes redesigning
the ownership model, and no table in the Technical Analysis sweep has an RPC insert path that
bypasses its own RLS-policy INSERT), (b) multi-row batch PostgREST inserts where only some array
elements are forged, (c) — most importantly — whether a **second, still-live, unbound permissive
INSERT policy** independently admits the same forged row alongside the now-fixed one. A green
canary proves the *fixed* policy rejects the forged shape; it does not prove no *other* policy on
the same table ORs its way around it. That residual is closed procedurally, not by the canary:
Decision 1's live-verification trigger (a) — enumerate all live INSERT policies before
classifying — and Decision 2's multiple-permissive-policy rule are what actually rule this out,
before the migration is even written.

**Rationale:** Symmetry with Decision 4 — one fix migration, one canary, both revert as a unit.
Each table's forged-payload shape genuinely differs (`story_points` needs an owned parent story
first; the redacted candidate needs different columns entirely), so a parameterized/table-driven
single file would still need a per-table setup function, gaining nothing over separate files
while losing clean per-table revert.

**Alternative rejected:** One parameterized spec file looping over a `{table, ownerColumn,
payloadBuilder}` manifest. Rejected — the per-table setup functions this would still require are
the same amount of code as separate files, but a shared file means reverting one table's canary
(if a fix is ever reverted) requires editing a shared file under time pressure instead of
deleting one.

---

**Decision 6 — Standing check: out of scope for this spec; argued against before for.**

**Against building it now:** This spec's own Appetite frames the work as "enumeration +
verification, not design... Low decision density." A standing CI/pre-commit gate that
re-runs Decision 2's classifier against every new migration is itself a design task with its own
build sequence, test plan, and — per Decision 2's own reasoning against a name-allowlist — no
cheap, low-false-positive implementation exists *yet*: the classifier's step 1 (owner-column
identification) works by reading how a column is *used* across a table's UPDATE/DELETE policies,
which for a **brand-new** table has no UPDATE/DELETE policy yet to read at INSERT-authoring time
— exactly when the gate would need to fire. A mechanical gate would therefore either (a) need a
hand-maintained manifest of owner columns (the exact anti-pattern Decision 2 rejected), or (b)
only catch the bug one migration *after* the INSERT policy ships, once an UPDATE/DELETE policy
exists to compare against — too late to prevent the exact failure this audit fixes. Building it
inside this spec would also directly contradict the spec's own Risk mitigation ("Scope creep into
unrelated RLS hardening... not a general RLS review").

**For building it eventually:** The bug class has now independently recurred at least three times
in two days across three tables (`stories`/`points` — P1032, `story_points` — P1034, and this
architecture pass's redacted candidate) before any fix for the third was even filed —
CLAUDE.md's Proactive Improvement principle names this pattern explicitly ("If you see the same
manual step for the second time — name it: automation debt"). Once this audit's `database.md`
findings table (Decision 3) exists, it doubles as exactly the manifest a future gate would need
without inventing one — every table's owner column and its bound/not-applicable status is already
recorded, so a future script could diff a new migration's INSERT policy against that table's
`database.md` row instead of re-deriving ownership from UPDATE/DELETE policy text.

**Decision:** Do not build it here. Recommend filing a separate, small follow-up task once this
audit's findings table exists and is confirmed accurate — the manifest this audit produces is the
missing precondition for a low-false-positive gate, and building the gate before the manifest
exists would repeat Decision 2's rejected-alternative mistake at the tooling layer instead of the
documentation layer.

### Security Review

Reviewed the spec's **own audit methodology** against live migration history rather than the
spec's prose (epistemic gate 3). Two findings below were independently re-verified by direct grep
during the merge pass before being recorded here (gate 9) — they are not forwarded agent claims.

**Redaction notice:** one finding concerns an unfixed gap that reads as live on prod. Per
CLAUDE.md's rule against publishing unpatched vulnerability mechanics in this public repo, its
table name, policy names and exploit path live in `.private/docs/security-log.md` (2026-08-10)
and are referenced generically here.

**RLS Policies:**

- ⚠️ **The classifier as originally written has a confirmed false negative — it clears P1034.**
  The rule "flag a table only when UPDATE/DELETE bind ownership and INSERT doesn't" assumes the
  *shape* of the UPDATE/DELETE check is a reliable signal. It is not when UPDATE/DELETE bind
  ownership **indirectly, through a parent table's column**. `story_points` is the worked case:
  INSERT and DELETE both check `EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id =
  auth.uid())` — the *parent story's* author — and neither constrains `story_points.author_id`,
  the column P1034 is filed against. A policy-shape comparison sees symmetry and passes the
  table. This is why P1034 was found by adversarial review, not by any structural comparison.
  **Resolved:** Decision 2 step 1b (ungoverned-attribution column) + the column-granularity rule.
- ⚠️ **Second false-negative class: no UPDATE/DELETE policy exists at all.** An owner-column table
  with an unbound INSERT and simply no UPDATE/DELETE policy has nothing to compare against. That
  is implicit deny, not "open by design" — folding the two together lets "we had no signal" read
  as "we checked and it was fine." **Resolved:** Decision 2 step 4's `NO COMPARISON BASIS` bucket.
- ⚠️ **A live, previously unaudited instance of the exact P1032/P1034 bug class was found during
  this pass** — same asymmetry (UPDATE binds the owner column, INSERT does not), on a table no
  prior P-number covers, with both relevant migrations listed as applied to prod in
  `deploy-manifest.json`. Detail in `.private/docs/security-log.md`. Confidence is migration-file
  text + manifest, **not** live policy state — no `pg_policies` query was run this session. This
  validates that the audit will find real gaps rather than closing a theoretical risk.
- ⚠️ **The spec's own canonical false-positive example was built on stale documentation.**
  `witnesses` is described as intentionally open by both `.claude/rules/database.md` and
  `docs/technical/database.md`, with UPDATE/DELETE policies scoped to "own witness records."
  Neither is true: the live INSERT policy binds `auth.uid() = profile_id`
  (`supabase/migrations/20260404120000_security_backlog_rls.sql`) and **no UPDATE or DELETE policy
  exists for the table at all**. The mitigation's conclusion survives; its reasoning does not.
  Both docs need correcting — outside this spec's scope, flagged for doc maintenance. **Resolved
  in-spec:** Risks correction + Technical Analysis reclassification.
- ✅ **Multiple permissive INSERT policies — historical instance confirmed, currently fixed.**
  `20260219_service_role_test_policies.sql` created 5 unscoped policies alongside correctly-scoped
  same-purpose duplicates; `20260810130000_p1035_...` drops the unscoped ones. No other live
  same-table/same-command duplicate INSERT pair was found by name-grep across migrations — **but
  that check used migration text, which is exactly the method P1035 proved unreliable.** Only a
  live `pg_policies` aggregate closes it. **Resolved:** Decision 1's unconditional aggregate query.
- ✅ **`WITH CHECK` vs `USING` semantics.** Every INSERT policy in this schema correctly uses
  `WITH CHECK` only. `USING` on INSERT is a no-op in Postgres (no pre-existing row to filter), so
  that footgun is not live here. Worth stating in the findings table so nobody re-derives it.
- ✅ **`badge_points` is a legitimate insert-on-behalf-of-another pattern the audit must not
  mechanically "fix."** It carries both `user_id` (badge recipient) and `verified_by` (certifier
  inserting). INSERT binds `verified_by = auth.uid()` — correct, that is the caller — and does not
  bind `user_id`, by design: a certifier awards badges to other users, so `user_id != auth.uid()`
  is the normal case. Mechanically adding `AND user_id = auth.uid()` would break the certifier
  flow outright. The classifier needs the caller-identity vs. beneficiary distinction that grep
  alone cannot make; Decision 2 step 2 covers the multi-actor case, and this is its positive
  control.

**Authentication:**

- ✅ Every bound INSERT policy found (`events`, `event_rsvps`, `event_sub_rooms`,
  `clarity_agreements`, `clarity_docs`, `point_position_history`, `membership`, plus P1032's fix)
  compares `auth.uid()` directly against the owner column. No policy in scope substitutes a
  spoofable client-supplied claim.
- N/A — no LLM/AI prompt surface in this spec. AI Prompt Security block deliberately skipped, not
  silently omitted.

**Authorization:**

- ⚠️ **Service-role edge functions write to owner-column tables this audit will never see.** Three
  functions (`supabase/functions/create-and-sign/`, `create-and-open-letter/`,
  `confirm-letter-response/`) construct a client with `SUPABASE_SERVICE_ROLE_KEY`, bypassing RLS
  entirely — every `WITH CHECK` fix here is irrelevant to rows they write (`profiles`,
  `terms_acceptances`, `story_verifications`, `letter_point_responses`). Correctly out of scope,
  but the Non-Goals wording named only P1035's unscoped-policy class, so a reader would assume
  these paths were covered. Whether those functions re-validate ownership in application code was
  **not** audited — that is a separate code-level review worth filing, not assuming safe.
  **Resolved:** Non-Goals clarification (both mechanisms named).
- ⚠️ **`SECURITY DEFINER` RPCs are the other bypass class.** 30+ migration files touch
  `SECURITY DEFINER` (`complete_clarity_session`, `seal_and_send_letter`,
  `create_initial_story_version`, …); they run with the owner's privileges regardless of caller
  RLS context, so a correctly-bound INSERT policy is moot if such an RPC writes to the table
  without its own ownership check. This repo has direct history here (`docs/decisions.md`
  2026-04-09, "SECURITY DEFINER stripping risk"). **Resolved:** Decision 2 now requires recording
  per-table whether any definer-rights or service-role path writes to it, so BOUND cannot be
  misread as full coverage.

**Input Validation:**

- N/A — no new user input surface. This spec only tightens an existing `WITH CHECK` predicate
  using the pattern P1032 already proved safe.

**Data Protection:**

- ⚠️ **A findings table naming unfixed gaps is a real disclosure risk in this public AGPL repo —
  and this review produced a live example of one.** P1032 and P1035 both already used the
  mitigation: exploit mechanics to `.private/docs/security-log.md`, public files carry only the
  problem class. P1038's Done-When ("findings summarized in `docs/decisions.md`") needs an
  **ordering constraint**, not just a content rule. A public table reading "table X: **gap**, fix
  in migration N" committed before migration N lands is a public advisory for an unpatched
  vulnerability. Required order: **gap found → private log entry → fix migration merged → then
  public summary.** **Resolved:** Build Sequence reordered (public findings write moved after the
  fixes) + the redaction applied to this spec.
- ✅ No PII or secrets introduced by this spec's own changes — policy predicates only, no new
  columns or data flows.

#### Verification queries the audit must run

```sql
-- Per-table INSERT policy text (test, then prod)
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE cmd = 'INSERT' ORDER BY tablename;

-- Permissive-OR duplicates: one bound + one unbound policy is as forgeable as zero bound
SELECT tablename, cmd, count(*) AS policy_count
FROM pg_policies WHERE cmd = 'INSERT' AND permissive = 'PERMISSIVE'
GROUP BY tablename, cmd HAVING count(*) > 1;
```

Neither was run during this pass — no `mcp__supabase__execute_sql` in the session's tool loadout.
See Decision 1's credential-path note for the prod connection constraint.

#### Unrelated observation, not chased down

`src/app/data/letters-service.ts` queries `.from('stories').eq('user_id', …)`, but every migration
and `docs/technical/database.md` name that column `author_id`. Either a dead path or an
undocumented column. Out of scope (it is a SELECT), noted only because it reinforces the finding
that app-layer code cannot stand in for reading the migration either.

#### Summary judgment

The spec's core comparison is sound as a **first pass** but was insufficient as the **sole** test,
for three reasons found by applying it to this schema rather than reasoning abstractly: it is
fooled by symmetric-looking indirect binding (`story_points`/P1034), it had no bucket for "no
UPDATE/DELETE exists," and reading migration text for duplicate permissive policies is the exact
method P1035 showed produces false-clean results. None invalidate the audit; all three are folded
into Decisions 1 and 2 above.

### Implementation Approach

**Worktree recommended:** this spec touches `supabase/migrations/` (one file per confirmed gap),
`e2e/integration/` (one canary per confirmed gap), `docs/technical/database.md`, and
`docs/decisions.md` — at minimum 4 files for zero additional gaps, 10+ if the redacted
candidate and any further gaps confirm, matching this repo's worktree threshold.

#### Build Sequence

**Ordering constraint (from the Security Review, binding — not advisory).** For any table found
unbound, the sequence is **private log entry → fix migration merged → public summary.** No
public-repo file (`docs/technical/database.md`, `docs/decisions.md`, this spec, or a commit
message) may name a table as having an open gap before its fix has landed. That is what moves the
public findings write from early to late below.

0. **Precondition — confirm the live-query path works before starting.** Test:
   `mcp__supabase__execute_sql`. Prod: `pg_policies` is **not** exposed over PostgREST, so use the
   Management API `POST /database/query` or `psql` via `SUPABASE_DB_URL` from `.env.prod`. If
   neither prod path is available, stop and report — the audit cannot satisfy its own step 4
   without it, and proceeding would produce a file-text-only result labelled as verified.
1. **Run the permissive-OR aggregate query once, unconditionally** (Decision 1, amended) before
   classifying anything. Any table it returns has its full live policy set read before it is
   classified. This is the P1035 blind spot and grep cannot substitute for it.
2. Enumerate candidate tables (Decision 1 grep sweep) — start from the Technical Analysis list
   rather than re-deriving it, but re-verify each entry against current `main`; that list was
   built on 2026-08-10 and may be stale by the time `/dev` runs.
3. Apply Decision 2's **amended** classifier (1a + 1b, column-granularity) to every candidate.
   Record each table's status as you go — do not batch to the end — using all four buckets:
   **BOUND / NOT APPLICABLE (open by design) / NO COMPARISON BASIS (no UPDATE/DELETE policy) /
   CONFIRMED GAP.** For each table also record whether a `SECURITY DEFINER` function or
   service-role edge function writes to it, so BOUND is not misread as full write coverage.
   Keep this working table in the private log or scratch until step 7 — see the ordering
   constraint above.
4. Re-verify the candidate already identified in Technical Analysis (detail in
   `.private/docs/security-log.md`) via Decision 1 trigger (b) on test before treating it as
   confirmed: enumerate **all** live INSERT policies on that table and confirm none binds the
   owner column.
5. For each CONFIRMED GAP:
   a. Record it in `.private/docs/security-log.md` **first** — before any code, and before any
      public file names the table.
   b. Write the canary against the **unfixed** policy (Decision 5). Run it and confirm the exploit
      assertion **fails** — a canary never observed failing is unproven (gate 7). Paste the
      failing output; do not assert it "would" fail.
   c. Write the fix migration (Decision 4), following P1032's `-- client-safe:` comment
      convention — enumerate every client insert path into that table and confirm none currently
      sends a caller-supplied owner-column value. A legitimate insert-on-behalf-of-another flow
      (the `badge_points` shape) means **stop and report**, not "add the predicate anyway."
   d. Run `./scripts/migrate.sh` (test), re-run the canary, confirm it flips to green.
   e. Verify live on prod before merging.
6. Only after every confirmed gap's fix has landed: write
   `docs/technical/database.md`'s `### INSERT Ownership-Binding Audit (P1038)` subsection from the
   completed status table (Decision 3). Write it even if zero new gaps are confirmed — Done-When
   requires it either way, and with zero gaps there is nothing to sequence around.
7. Extend the `docs/decisions.md` 2026-08-10 `[technical]` entry (Decision 3) — do not create a new
   entry — with the audit's results and a link to the `database.md` subsection. Keep it at
   problem-class level; mechanics stay in the private log.
8. File the two follow-ups this pass surfaced, rather than absorbing them: (a) correct the stale
   `witnesses` descriptions in `.claude/rules/database.md` and `docs/technical/database.md`;
   (b) review whether the three service-role edge functions re-validate ownership in application
   code. Both are out of scope here (Non-Goals) but neither should evaporate.
9. Do NOT build a standing check (Decision 6). If the audit surfaces a strong case for
   reconsidering, stop and report rather than building it inline.

#### Files to Create

- `supabase/migrations/<ts>_p1038_bind_insert_<table>.sql` — one per confirmed gap, including the
  candidate already identified (see `.private/docs/security-log.md`), pending its live verification
- `e2e/integration/p1038-reproduce-<table>.spec.ts` — one per confirmed gap

Filenames encode the table name, so the migration and canary for an unfixed gap are created at
step 5 — after the private log entry, alongside the fix — never earlier as placeholders.

#### Files to Modify

- `docs/technical/database.md` — new `### INSERT Ownership-Binding Audit (P1038)` subsection
  under `## Row Level Security (RLS)`
- `docs/decisions.md` — extend the existing 2026-08-10 `[technical]` entry (Consequences +
  References), do not add a new entry
- `supabase/deploy-manifest.json` — one entry per new migration, per existing `migrate.sh`
  convention
- `.private/docs/security-log.md` (gitignored) — one entry per confirmed gap, written **before**
  any public file names the table; already seeded with this pass's candidate
