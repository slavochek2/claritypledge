---
status: week
type: story
rank: 48
workstream: C2
created_date: '2026-08-20'
tags: [agent-accounts, accountability, schema, profiles]
delivery_stage: architect
pipeline_ran: [create-spec, architect]
driver: anomaly
---

# P1124: An agent account's operator must be a real profile, not free text

## Depends on P1104

Every surface named below exists **only** on `feature/p1104-agents-visually-distinguishable`,
which is not merged and whose seven migrations are not on prod. This spec cannot be built until
P1104 ships. Do not begin implementation before `features/done/**/p1104*` exists.

## Problem

**Situation:** P1104 gave agent accounts a profile-header line reading *"Operated by {name}"*.
The name comes from `agent_accounts.operator_name`, a `TEXT NOT NULL` column
(`supabase/migrations/20260819120000_p1104_agent_accounts.sql:35`). Nothing validates it.

**Complication:** That line is the accountability claim the whole agent-account design rests on —
an agent carries positions a real public figure never took, and the operator line is what says a
real human stands behind that reading. As free text it asserts accountability without
establishing it. When the demo agent was seeded, `scripts/dev-agent-fixture.mjs:71` simply wrote
the string `Slava (ClarityPledge)` into the column; `Albert Einstein` or `Nobody` would have been
accepted identically. A reader who wants to know who is behind the agent has nowhere to click.

**Question:** How do we make the operator line name a human the reader can actually reach?

## Appetite

**Blast radius:** medium — one column, one RPC signature, one service read, two render surfaces
(profile header, OG card), one fixture. No existing user-facing flow changes; agent accounts have
no production rows yet, so there is no live audience for a regression.

**Reversibility:** medium. A migration plus code. The column change is forward-only in this
repo's convention, but with zero prod rows the rollback is a second migration that widens the
constraint again, not a data recovery.

**Decision density:** one open decision — the header string for an agent whose operator has
deleted their profile. The deletion behaviour itself is settled (see Decided). Everything else
follows from the direction the founder has already approved.

## Solution

`agent_accounts` gains an operator reference to `public.profiles(id)`. The header and OG card
resolve the operator's display name **through that reference** rather than from stored text, so
the rendered line always reflects the operator's current profile name. The header line becomes a
link to `/p/{operator profile id}` — the existing profile route (`src/App.tsx:399`).

Creation moves with it: `create_or_reuse_agent_account` takes an operator **profile id** instead
of a name string, and rejects an id that does not resolve to a profile.

The free-text column is removed once nothing reads it. Keeping both would let the two disagree,
and a stale denormalized copy is exactly the unverifiable claim this spec exists to close.

### Constraints the implementation must respect

- **New columns are unreadable by default here.** P877's convention means `anon`/`authenticated`
  hold a *column-scoped* `GRANT SELECT` on `agent_accounts` (`profile_id, operator_name`), not a
  table grant. A new column without an explicit grant returns `42501` at every public read site.
- **`profiles` column grants are also column-scoped.** `name` and `slug` are publicly readable;
  `email`, `linkedin_url`, and `reason` are not, and are not filterable in a `WHERE`. The
  operator join must touch only the readable columns.
- **The `select('profile_id, operator_name')` in `agent-accounts-service.ts:46` is deliberate.**
  `subject_key` is ungranted on purpose, so `select('*')` fails loudly. Any new read must stay
  explicitly column-listed.

## Risks / Non-Goals

### Risks

- **Publishing a real person's identity on every agent page.** The operator's name and a link to
  their profile appear on the agent's profile and in its OG card, which crawlers index. No new
  column becomes readable (`profiles.name` is already public), but a new *association* is
  published. Mitigation: operators are a deliberate, service-role-only role — an agent account
  cannot be created by an ordinary user — so nobody is enrolled without knowing.
- **A join failure silently erases the accountability line.** With `SET NULL` chosen, a missing
  operator is a *normal* state, not only a bug — so the header could render *"Operated by "* or
  drop the line entirely on a page that otherwise looks fully attributed. This is the primary risk
  of this spec. Mitigation: the missing-operator case is an explicit, tested render state with its
  own string; a blank name fails the build.
- **The OG card reads through PostgREST embedding.** `api/og.ts:78` embeds
  `agent_accounts(operator_name)`; resolving a name now requires a second embed level. Mitigation:
  verify the nested embed against the live API before building on it — do not assume depth works.
- **A cached OG card keeps naming a person after they delete their profile. [ACCEPT]** Once a
  social platform's unfurl bot has cached the card built by `api/og.ts`, deleting the operator's
  profile does not retract it. The database row nulls and the live page switches to
  `Operator account deleted`, but the platform's cached copy keeps publishing the deleted
  person's name for as long as its own TTL holds — outside this repo's control. There is no code
  fix; accepted as a documented limitation rather than left to be discovered later.
- **The operator link makes "who runs which agents" a bulk-queryable, verified mapping.**
  `getAgentAccounts()` (`agent-accounts-service.ts:35`) already paginates the whole table
  unauthenticated, so enumeration is possible today — but the payload is free text that need not
  correspond to anyone real. After this change every row carries an FK-guaranteed pointer to a
  real person. The escalation is from "unverifiable text" to "database-guaranteed identity link",
  and it applies in bulk, not just on the page a reader happens to visit.
- **The service-role gate is authorization, not consent.** `EXECUTE` being `service_role`-only
  controls *who may call* the creation RPC; nothing controls *whose profile id may be passed*. A
  pipeline operator can name any profile as an agent's operator without that person's agreement.
  This is a process control, not a database one — the spec must not let the service-role gate
  stand in as a consent mechanism it does not provide.
- **Test-database fixture rows already carry free text.** The migration must state what happens to
  them rather than assume the table is empty.

### Non-Goals

- Do NOT build an operator-management UI. Operators are set at creation by the pipeline.
- Do NOT change who may create an agent account — `EXECUTE` stays `service_role` only.
- Do NOT introduce a separate `operators` table. A profile is already the human record.
- Do NOT touch the agent visual marker, the reserved-name guard, or any other P1104 mechanism.
- Do NOT denormalize the operator name back into `agent_accounts` "for performance".
- Do NOT refactor adjacent P1104 code that this change does not require.

### Alternatives Considered

- **Keep the text, add a nullable profile link beside it.** Rejected: two sources for one claim
  that can disagree, and the unverified one still renders.
- **Validate the text against a list of known operator names.** Rejected: a name is not an
  identity, and the list is another thing to keep true.

## Decided

**On operator profile deletion: leave the agent unattributed (`ON DELETE SET NULL`).**
Decided 2026-08-20 by the founder.

Cascade was rejected first: an agent account is a profile that owns stories and points, and those
points carry *other people's* positions. Deleting the operator would destroy work that is not the
operator's to destroy.

Blocking the deletion (`RESTRICT`) was rejected second, for a different reason: it means a human
cannot leave the platform while an agent they operate is still published. P520
(`pledge_withdrawal_account_deletion`) is an open spec about that right. Trapping a person's
account is a worse failure than losing an attribution line.

**What this choice costs, and what the build must therefore do.** The accountability claim can
evaporate: an agent can outlive the human who stood behind it, keeping its stories, points and
everyone's positions on them, with nothing but a label saying the operator is gone.

**How large that cost is today, and when it grows.** Right now the operator *is* the publishing
mechanism — an agent produces nothing on its own, so a deleted operator means the agent simply
goes quiet. The unattributed state is a stale record, not an unsupervised publisher. That changes
when P1096 makes publishing automatic: at that point an agent with no operator would keep emitting
positions with nobody accountable for them. **Whether an unattributed agent should be frozen once
publishing is automated is a P1096 decision, deliberately not scoped here** — but it is the reason
this spec insists the unattributed state be visible rather than silent.

Consequences that are binding on the implementation:

- The operator reference is **nullable**. It is not a `NOT NULL` FK.
- The no-operator header state is **load-bearing and must be tested**, not treated as an edge case.
- A blank or absent operator line is a defect, not an acceptable degradation. The page must not
  render as an ordinary agent account while silently asserting nothing.

**The no-operator header string is `Operator account deleted`.** Decided 2026-08-20 by the
founder. It names the fact rather than the state, so a reader can tell "the human who stood behind
this left" apart from "nobody ever did". It replaces the whole `Operated by {name}` line — it is
not appended to it.

## Done-When

- [ ] The profile header of an agent account renders the operator's name read from their profile,
      not from text stored on the agent row
- [ ] That name is a link, and following it lands on the operator's profile page
- [ ] Changing the operator's name on their own profile changes what the agent's header shows,
      without touching the agent row
- [ ] Creating an agent account with an operator id that matches no profile is rejected with a
      clear error
- [ ] The OG card for an agent account shows the operator's real name
- [ ] `agent_accounts` no longer carries a free-text operator column
- [ ] A public (unauthenticated) read of an agent account returns the operator reference —
      confirmed against the live API, not inferred from the grant statement
- [ ] Deleting an operator's profile leaves the agent account intact, with its stories, points
      and every position other people set on them unaffected — demonstrated by running the deletion
- [ ] After that deletion, the agent's header renders `Operator account deleted` — verified on the
      running page, not inferred from the code
- [ ] A permission or embed failure on the operator read is distinguishable from a real deletion:
      the page never claims `Operator account deleted` about an operator whose account is live
- [ ] `api/og.ts` never renders an agent as an ordinary person: when the agent-detection embed
      fails, the card fails loud rather than dropping the "machine-generated reading, not the
      person" disclosure — demonstrated by forcing the failure, per epistemic gate 7
- [ ] The creation RPC rejects, each with its own clear error: an unknown operator id, NULL, the
      agent's own profile id, and the profile id of another agent account
- [ ] `scripts/dev-agent-fixture.mjs` seeds a real profile as operator and no longer contains an
      invented operator string

## Acceptance Criteria

- [ ] A reader looking at an agent account can reach the human accountable for it in one click
- [ ] No agent account can exist whose operator line names someone who does not exist
- [ ] Existing agent-account behaviour from P1104 is unchanged in every other respect

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Operator line | `Operated by {profile name}` | Agent profile header — wording settled in P1104, do not re-decide |
| Operator link target | `/p/{operator profile id}` | Existing profile route |
| No-operator line | `Operator account deleted` | Replaces the whole operator line; reachable in production |

## Migration Plan

1. Confirm the row count in `agent_accounts` on **test** and **prod** before writing anything —
   the plan below assumes prod is empty because P1104 is undeployed; verify, do not assume.
2. Add the **nullable** operator profile reference with `ON DELETE SET NULL`.
3. Backfill or delete existing fixture rows per the count found in step 1.
4. Add the column-level `GRANT SELECT` for the new column, and confirm an `anon` read returns it.
5. Redefine `create_or_reuse_agent_account` to take the profile id.
6. Migrate the read path, the header, the OG card, and the fixture.
7. Drop the free-text column only after step 6 lands and nothing selects it.

## Rollback Plan

Prod carries zero agent-account rows until P1104 deploys, so rollback is a forward migration that
restores the text column and re-widens the RPC — not a data-recovery operation. If this spec is
built *after* agents exist in prod, this section must be rewritten before the migration runs.

## Data Integrity Check

- Every `agent_accounts` row resolves to an existing profile — a join returning fewer rows than
  the table holds is a failure.
- The operator name rendered on a seeded agent matches that profile's `name` column exactly.

## Technical Architecture

### Technical Analysis

**This feature cannot be built until P1104 merges to main.** Every file cited below lives only on
`feature/p1104-agents-visually-distinguishable`, checked out at
`.claude/worktrees/w1`. There are **seven** P1104 migrations
(`ls .claude/worktrees/w1/supabase/migrations/ | grep p1104`), and `create_or_reuse_agent_account`
is redefined **twice** — once at `20260819120000_p1104_agent_accounts.sql` (creation) and again at
`20260819160000_p1104_reserve_agent_name_at_the_table.sql` (round 3). The three migrations after
that (`20260820090000/091000/092000`) touch only `is_reserved_agent_name` and never redefine
`create_or_reuse_agent_account` or the table — confirmed with
`grep -l create_or_reuse_agent_account .claude/worktrees/w1/supabase/migrations/20260820*.sql`
(no matches). This plan is written against the **20260819160000** definition, which is current.

**Verified facts, and how:**

1. **Current `create_or_reuse_agent_account` signature** — read in full from
   `20260819160000_p1104_reserve_agent_name_at_the_table.sql`. `SECURITY DEFINER`,
   `SET search_path = ''`, 8 positional args ending `p_operator_name TEXT`, `EXECUTE` revoked from
   `PUBLIC, anon, authenticated` and granted only to `service_role`. It inserts a `profiles` row
   and an `agent_accounts` row in one transaction, and on reuse (`subject_key` already registered)
   now **refuses** if the stored `operator_name` differs from the caller's — an existing
   same-operator invariant this spec's schema change must preserve in spirit for the new FK.

2. **Column-level grant pattern on `agent_accounts`** — read from
   `20260819120000_p1104_agent_accounts.sql`: `REVOKE ALL ON TABLE ... FROM PUBLIC, anon,
   authenticated` first, then `GRANT SELECT (profile_id, operator_name) ON public.agent_accounts
   TO anon, authenticated`. `subject_key` is deliberately excluded and `select('*')` returns
   `42501` by design (confirmed by the comment and by `agent-accounts-service.ts`'s explicit
   column list). A new `operator_profile_id` column therefore has **zero** grant until this
   spec's migration adds it.

3. **`profiles` columns readable by `anon`/`authenticated`** — read from
   `20260602160000_p877_profiles_pii_column_grants.sql:387-392`:
   `GRANT SELECT (id, name, role, avatar_color, is_verified, created_at, updated_at, slug,
   pledge_version, accepted_terms_version, has_pledged, avatar_url, avatar_provider,
   ears_count, verification_session_count, bio, banner_url, banner_generation_attempted,
   is_test_account, is_certifier) ON public.profiles TO anon, authenticated`. `id`, `name`, `slug`
   are all present — the operator embed only needs these three, all already public. `email`,
   `linkedin_url`, `reason` are absent (P877), confirming the constraint the spec already states.

4. **`agent-accounts-service.ts` current read, and why** — read in full. It calls
   `.select('profile_id, operator_name')` with explicit pagination to exhaustion (a documented
   P1104 finding: PostgREST caps unbounded reads at 1000 rows via `content-range`, silent
   otherwise). The docstring states the column list is load-bearing because `subject_key` is
   ungranted on purpose. This function is the **only** place in the app that reads the registry;
   it feeds `AgentAccountsProvider` (`agent-accounts-context.tsx`), which exposes
   `isAgentAccountId()` and `operatorNameFor()` as synchronous lookups consumed by
   `profile-page-v2.tsx:195-197,902`, plus four card components
   (`point-card-with-links.tsx`, `story-card-with-links.tsx`, `StoryCardDetail.tsx`,
   `feed-story-card.tsx`) and `point-detail-page.tsx`.

5. **`api/og.ts`'s PostgREST query** — read in full. `AGENT_EMBED =
   'agent_accounts(operator_name)'` is spliced into three separate PostgREST `select=` query
   strings (story OG, point OG, profile OG), each already using a **constraint-name hint** to
   disambiguate a different multi-FK case:
   `profiles!stories_author_id_fkey(name,${AGENT_EMBED})` and
   `profiles!points_first_validator_id_fkey(name,${AGENT_EMBED})`. `agentOperator()` reads
   `profile.agent_accounts` (PostgREST returns a single embedded object here because
   `agent_accounts.profile_id` is a 1:1 unique/PK FK back to `profiles`) and pulls
   `operator_name` off it. This constraint-hint pattern is the existing reuse target for the new
   nested embed — see Decision 3.

**Reuse inventory — how this codebase already renders a link to a profile.** Grepped
`to={\`/p/`ROUTE pattern across `src/`. The canonical pattern is a plain React Router `<Link
to={`/p/${id}`}>` (route defined at `src/App.tsx:399`, `path="/p/:id"`) wrapping the display name
— used elsewhere for author/validator attribution on story and point cards. No dedicated
`<ProfileLink>` component exists; every call site inlines the `Link` + `/p/{id}` string. **New
because inventory shows no existing component** — this spec should follow the established inline
pattern at `profile-page-v2.tsx:902`, not introduce a new abstraction for one call site (Non-Goal:
"Do NOT build an operator-management UI" implies minimal new UI surface generally).

**Dependencies:** `agent-accounts-context.tsx`'s fail-closed design (empty registry on fetch
failure ⇒ nothing renders as an agent) is untouched by this spec — it gates *whether* a profile is
an agent, which stays keyed off `agent_accounts` row existence, not off the operator reference.
This spec only changes what `operatorNameFor()` returns and how it's sourced.

### Open verification — do not build on this without running the command first

**The two-level PostgREST embed (profiles → agent_accounts → operator's profiles) is UNVERIFIED.**
Code and docs establish that column grants exist for `profiles(id,name,slug)` and that
constraint-hint disambiguation already works one level deep in this codebase
(`profiles!stories_author_id_fkey`), but no artifact in this repo demonstrates a **second-level**
embed through a table that itself has two FKs to the same target table. This is exactly the shape
this spec creates: `agent_accounts` will hold both `profile_id → profiles(id)` (the agent) and the
new `operator_profile_id → profiles(id)` (the operator) — two FKs, same target table, same source
table. PostgREST resolves embed ambiguity by **constraint name**, and once the second FK exists,
**every** existing embed of `agent_accounts(...)` from `profiles` (not just the new nested one)
becomes ambiguous and will start returning a `300 Multiple Choices`-class PostgREST error unless
every call site is updated to name its constraint explicitly. This is a **regression risk to
existing P1104 code**, not just a new-feature risk.

**Before writing the migration, the implementer must run this exact sequence against the test
Supabase project** (after adding the column + both grants + constraint, on a throwaway branch or
inside the transaction before commit):

```bash
# 1. First-level embed still resolves once ambiguous (must name profile_id's constraint):
curl -s "$SUPABASE_URL/rest/v1/profiles?select=id,name,agent_accounts!agent_accounts_profile_id_fkey(operator_profile_id)&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY"

# 2. Second-level embed to the OPERATOR's profile, via the new constraint name, columns
#    restricted to the anon/authenticated grant set:
curl -s "$SUPABASE_URL/rest/v1/profiles?select=id,name,agent_accounts!agent_accounts_profile_id_fkey(operator:profiles!agent_accounts_operator_profile_id_fkey(id,name,slug))&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY"

# 3. Confirm the SET NULL path: an agent row whose operator_profile_id is NULL returns
#    operator: null, not an error or a dropped row.
```

If (2) fails or returns nested-embed depth errors, the fallback is a **second client-side query**:
fetch `agent_accounts(operator_profile_id)` from the primary embed, then a follow-up
`.from('profiles').select('id,name,slug').in('id', operatorIds)` batched across all operators
needed for the page (one extra round trip on the profile page and OG endpoints, not per-agent).
This fallback is architecturally acceptable — `getAgentAccounts()` already does exactly this shape
(fetch registry, resolve names) for the existing operator-name case — but it must not be the
starting assumption. **Run the curl first.**

### Architecture Decisions

**Decision 1 — the new column is `agent_accounts.operator_profile_id UUID REFERENCES
public.profiles(id) ON DELETE SET NULL`, nullable, no default.**
- **Chosen:** A second FK column on the existing `agent_accounts` table, named for the constraint
  it needs (`agent_accounts_operator_profile_id_fkey`, needed explicitly for embed disambiguation
  per the open verification above).
- **Rationale:** Directly implements the founder-decided `ON DELETE SET NULL` (spec's Decided
  section) and the nullable requirement. Keeping it on `agent_accounts` — not `profiles` — matches
  where `operator_name` already lives and keeps the registry table as the single place that
  answers both "is this an agent" and "who operates it."
- **Trade-off:** Two FKs from one table to the same target table is the exact shape that forces
  every embed touching `agent_accounts` to carry an explicit constraint hint from now on,
  including ones this spec doesn't otherwise touch. That cost is taken deliberately (see Decision
  3) rather than worked around.
- **Alternative rejected:** A join table (`agent_operators`). Rejected per spec Non-Goals — "Do
  NOT introduce a separate `operators` table. A profile is already the human record" — and a join
  table doesn't remove the two-FK-to-profiles shape anyway, it just relocates it.

**Decision 2 — `create_or_reuse_agent_account` takes `p_operator_profile_id UUID` in place of
`p_operator_name TEXT`, and validates it resolves to an existing profile before insert.**
- **Chosen:** Redefine the function (whole-function replace, matching this repo's own stated
  convention — "Functions are replaced whole, never patched in place," per the P1104 migration
  comments) with the new parameter, replacing the existing
  `IF p_operator_name IS NULL OR btrim(p_operator_name) = '' THEN RAISE EXCEPTION` guard with:
  `IF p_operator_profile_id IS NULL THEN RAISE EXCEPTION` (still required at creation time — the
  spec's Done-When only requires the *column* be nullable for the deletion path, not that
  creation may omit an operator) **and** `IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id =
  p_operator_profile_id) THEN RAISE EXCEPTION 'operator_profile_id % does not resolve to an
  existing profile', p_operator_profile_id`.
- **Rationale:** Satisfies Done-When: "Creating an agent account with an operator id that matches
  no profile is rejected with a clear error." The FK constraint itself would also reject an
  unresolvable id (23503 at INSERT time), but the explicit pre-check gives a named, readable error
  rather than a raw Postgres FK-violation code — matching this function's existing style
  (`subject_key`/`operator_name` emptiness checks are pre-checked, not left to NOT NULL alone).
- **Trade-off:** Two round-trip-equivalent checks (SELECT then INSERT) inside one transaction;
  negligible cost, one function, service_role-only call path.
- **Alternative rejected:** Rely solely on the FK constraint and let the raw 23503 propagate.
  Rejected because the existing function already establishes the pattern of pre-checking and
  raising a named exception for every required input, and P1096 (the future caller) benefits from
  a stable, documented error rather than a raw constraint-violation code.
- **Reuse note:** the same-operator refusal-on-reuse block (added in the round-3 migration:
  "Reuse must not silently publish one operator's content under another's name") must be updated
  to compare `operator_profile_id` instead of `operator_name` — same logic, new column.

**Decision 3 — every PostgREST embed touching `agent_accounts` from `profiles`, and every embed
of `profiles` from `agent_accounts`, must name its FK constraint explicitly, using the existing
`table!constraint_name(...)` hint pattern already in `api/og.ts`.**
- **Chosen:** `agent-accounts-service.ts` doesn't embed (it queries `agent_accounts` directly, no
  change needed there beyond the column list — see Decision 4). `api/og.ts`'s three `AGENT_EMBED`
  splice points change from `agent_accounts(operator_name)` to
  `agent_accounts!agent_accounts_profile_id_fkey(operator:profiles!agent_accounts_operator_profile_id_fkey(name,slug))`.
- **Rationale:** This is the only way to keep both FKs resolvable per the Open Verification
  section above — PostgREST cannot infer which of two FKs between the same table pair is meant
  once a second one exists, and this codebase already established the fix (constraint-name hints)
  for the `stories_author_id_fkey` / `points_first_validator_id_fkey` case one level up.
- **Trade-off:** Constraint names become part of the query surface — a future migration that
  drops and recreates either FK (even with identical semantics) under a different auto-generated
  name silently breaks these queries with no compile-time signal, only a runtime PostgREST error.
  Mitigate by naming both constraints explicitly in the migration (never let Postgres
  auto-generate the name) and commenting the query strings with a pointer to this fact, matching
  the existing `AGENT_EMBED` comment style.
- **Alternative rejected:** A `SECURITY DEFINER` RPC that returns the joined shape directly
  (`get_agent_operator(profile_id)`), bypassing PostgREST embed resolution entirely. Rejected
  because `api/og.ts` already has a working embed-based pattern for the sibling case, and adding
  an RPC here means two different resolution mechanisms for structurally identical
  "profile → agent_accounts → related data" reads in the same file.

**Decision 4 — `agent-accounts-service.ts`'s `getAgentAccounts()` return type changes from `Map<string, string>` (profileId → operatorName) to `Map<string, string | null>` (profileId → operator profileId), and the select list changes accordingly.**
- **Chosen:** `.select('profile_id, operator_profile_id')`, still exhaustively paginated (that
  logic is untouched — it's about row count, not columns). `operatorNameFor()` on the context
  can no longer return a *name* synchronously from this Map alone, since the map now holds
  operator **ids**. Resolving the operator's current `name` requires a second read.
- **Rationale:** This is the direct consequence of removing the denormalized `operator_name` text
  (spec Solution: "the free-text column is removed once nothing reads it") — the registry fetch
  can only return what's actually stored, which after this migration is an id, not a name.
- **Trade-off:** `useAgentAccountIds()` consumers that today get a name synchronously
  (`profile-page-v2.tsx:197`, and the OG builders) now need the operator's live profile fetched
  too. For the profile page, this is one extra `profiles` row fetch keyed on the operator id
  already in the Map — cheap, and it's the mechanism that makes Done-When's "changing the
  operator's name on their own profile changes what the agent's header shows" true (a stored
  name could never do this; a stored id resolved at render time always does).
- **Alternative rejected:** Keep `getAgentAccounts()` batch-fetching names by doing a second join
  inside the same function (fetch `agent_accounts`, then batch-fetch `profiles` for all distinct
  operator ids, return `Map<string, {id, name}>`). This is *also* acceptable and is the natural
  fallback if the nested-embed verification (Open Verification) fails for the OG-card case — it's
  the same shape `api/og.ts`'s fallback would use. Recorded here as the fallback, not the primary
  plan, because the primary plan (nested embed) is simpler if it works and must be tried first.

**Decision 5 — the profile-header no-operator render path is an explicit state, not a fallback
string interpolation.**
- **Chosen:** In `profile-page-v2.tsx`, replace the current `` `Operated by ${operatorName}` ``
  (line 902) with a conditional: when the resolved operator is present, render
  `<Link to={`/p/${operatorId}`}>Operated by {operatorName}</Link>`; when the agent has no
  operator (`operator_profile_id IS NULL`, resolved as `null`/`undefined` after the id→name
  lookup), render the literal string `Operator account deleted` (UI Contract), with **no** link.
- **Rationale:** Spec Decided section: "A blank or absent operator line is a defect, not an
  acceptable degradation" and "the missing-operator case is an explicit, tested render state with
  its own string." A ternary on a possibly-`null` resolved name, rendered inline, is exactly the
  failure mode the spec calls out ("the header could render *"Operated by "*") if the null case
  isn't branched before string construction.
- **Trade-off:** None material — one more conditional branch in an existing render path.
- **Alternative rejected:** Keep interpolating into the same template and let `operatorName`
  default to `''`. Rejected explicitly by the spec's Decided section.

### Security Review

Spec: `features/p1124_agent_operator_is_a_real_profile.md`
Code read from worktree w1 (`feature/p1104-agents-visually-distinguishable`):
- `supabase/migrations/20260819120000_p1104_agent_accounts.sql`
- `supabase/migrations/20260819160000_p1104_reserve_agent_name_at_the_table.sql`
- `src/app/data/agent-accounts-service.ts`
- `src/app/pages/profile-page-v2.tsx` (L860-905)
- `api/og.ts`
- `docs/technical/database.md` (P877 section, `profiles policies`)

No LLM/AI API calls in this surface — AI Prompt Security table skipped.

**RLS Policies:**
- ✅ `agent_accounts` is `REVOKE ALL ... FROM PUBLIC, anon, authenticated` at table level, then `GRANT SELECT (profile_id, operator_name) ON public.agent_accounts TO anon, authenticated` (20260819120000_p1104_agent_accounts.sql:46,57), plus RLS policy `"agent_accounts are publicly readable"` (line 59) using `true`. This is P877's column-scoped-grant-over-row-level-RLS pattern, confirmed by reading the migration, not inferred from prose.
- ✅ **New FK column requires its own GRANT, or existing selects are unaffected but the new column is unreadable.** Since `anon`/`authenticated` hold column-scoped `SELECT`, an ungranted new column (e.g. `operator_id`) is simply invisible to `select('profile_id, operator_name')` — no error, because that statement never names the ungranted column. The error only fires (`42501`) the moment code adds the new column name to an explicit select list without the matching `GRANT SELECT (operator_id, ...)`. The spec's Migration Plan step 4 ("Add the column-level GRANT SELECT for the new column, and confirm an anon read returns it") correctly anticipates this — but the plan should also state the negative case explicitly for the implementer: if step 4 is skipped or lands in a later migration than the code that starts selecting the column, the client throws (per `agent-accounts-service.ts`'s "throws on error" design, L27-29) and **every profile page with an agent account goes blank/pending**, not just the operator line — this is a full-page-visible regression, worth stating plainly in the migration plan rather than left implicit.

**Authentication:**
- Not applicable — this surface has no new auth flow. `create_or_reuse_agent_account` remains `SECURITY DEFINER`, callable only by `service_role` (see Authorization below).

**Authorization:**
- ✅ `create_or_reuse_agent_account` is `SECURITY DEFINER`, and both the current definition (20260819160000, L251, L304-306) and its predecessor (20260819120000, L112, L153-155) `REVOKE ALL ... FROM PUBLIC, anon, authenticated` then `GRANT EXECUTE ... TO service_role` only. Confirmed by reading both migrations directly. No path exists for `anon`/`authenticated` PostgREST callers to reach this RPC — `service_role` is never exposed to a browser client, only to server-side pipeline code holding the service key. This matches the spec's Non-Goal ("Do NOT change who may create an agent account — EXECUTE stays service_role only") and the spec is right that swapping the `TEXT` param for a `UUID` param does not change this grant surface.
- ⚠️ **The parameter-type change does introduce a new authorization *question* the spec names but does not resolve: can the operator id point at a profile that has not consented to being publicly linked as an agent's operator?** Today `service_role`-only EXECUTE gates *who can call the RPC*, not *whose profile id may be passed as the argument*. Nothing in the RPC (as currently written for `p_operator_name TEXT`, and nothing proposed in the spec for `p_operator_id UUID`) validates that the referenced profile belongs to a party who agreed to the public operator role. The spec's own mitigation text ("operators are a deliberate, service-role-only role... so nobody is enrolled without knowing") answers "can the RPC be called by an attacker" — it does **not** answer "does calling it with profile X's id require X's consent." Because the caller is a trusted pipeline, this is process-level (who feeds the pipeline a profile id), not a database vulnerability — but the spec should say so explicitly rather than let the service-role gate silently stand in for a consent gate it doesn't provide. Recommend a one-line addition to Risks: "Mitigation is authorization-only (who can call), not consent-based (whose id is passed) — enforced by pipeline process, not by the database."
- ⚠️ **Self-operation / agent-operates-agent is unvalidated and untested.** Neither the current RPC (20260819160000, L240-306) nor the spec's Migration Plan / Data Integrity Check requires the new `p_operator_id` to be checked against: (a) `p_operator_id = p_profile_id` (an agent set as its own operator), or (b) `p_operator_id` already existing as a row in `agent_accounts.profile_id` (an agent operating another agent — meaning zero humans stand behind the reading, exactly the harm this spec exists to prevent). The spec's Done-When only requires rejecting an id that "matches no profile" — a self-referential or agent-owned id *does* match a real profile row, so that check alone passes it through. Recommend adding to Migration Plan step 5: `p_operator_id` must be validated to be an existing `profiles.id` that is NOT itself present in `agent_accounts.profile_id`, and NOT equal to `p_profile_id`.

**Input Validation:**
- ⚠️ (repeats/expands the above) Spec Done-When says only "Creating an agent account with an operator id that matches no profile is rejected with a clear error." Missing from spec: NULL handling (is `p_operator_id` allowed to be NULL at creation time, i.e. can an agent be created operator-less from day one, or is NULL only reachable via later `ON DELETE SET NULL`?) — the spec doesn't say, and the RPC signature/behavior for a NULL argument at creation should be explicit rather than left to implementer discretion. Recommend the spec state whether creation requires a non-NULL operator id (my reading of "Creation moves with it... and rejects an id that does not resolve to a profile" implies yes, but it should say so for NULL specifically, since NULL "resolves to no profile" ambiguously).
- ✅ FK constraint (`REFERENCES public.profiles(id) ON DELETE SET NULL`, per spec's Decided section) gives free enforcement of "must be a real profile" at the schema level once the RPC's own pre-check is added for a clean error message — using the FK alone would surface a raw Postgres FK-violation error rather than the "clear error" the spec's Done-When requires, so the RPC-level `IF NOT EXISTS (...) THEN RAISE EXCEPTION` check (pattern already used for `p_subject_key`, 20260819160000 L259) should be replicated for the operator id — flag this to the implementer as a required addition, not present in either read migration today.

**Data Protection:**
- ⚠️ **New disclosure, not new column.** Confirmed `profiles.name`/`slug` are already public (`docs/technical/database.md:349` — "Anyone" read, RLS `using(true)`, P877 restricting only `email`/`linkedin_url`/`reason`). So resolving the operator's name via the FK does not expose a column that was private before. But the spec is correct that the **association itself is new**: today `operator_name` is unverified free text that need not resolve to any real account; after this change, `agent_accounts` becomes a queryable, FK-enforced, publicly-readable table of `{agent profile_id} → {real operator profile_id}` pairs. This enables an enumeration that was not reliably possible before: paginate `agent_accounts` publicly (already done by `getAgentAccounts()`, `agent-accounts-service.ts:35`) and now every row's operator column is a verified, joinable pointer to a real person's profile — a mass "who runs which agents" mapping. Previously the free-text column made this unreliable (values might not even be real names). This is a genuine escalation from "maybe true, unverifiable text" to "database-guaranteed true, bulk-queryable identity link." The spec names the risk (Risks section, "Publishing a real person's identity on every agent page") but its mitigation only addresses *creation* authorization, not *bulk enumeration* of operators — worth a one-line acknowledgment that this table already permits full enumeration today (unauthenticated `getAgentAccounts()` reads to exhaustion) and this spec makes that enumeration's payload (the operator link) verified rather than freeform.
- ⚠️ **`ON DELETE SET NULL` + cached OG cards is a real gap, not covered in the spec's Risks section at all.** The spec's Risks list four items; a cached social-platform OG preview is not one of them. Once a crawler (Twitter/Facebook/LinkedIn/Slack unfurl bots) has fetched and cached `api/og.ts`'s rendered description containing `"...operated by {operator}..."` (see `api/og.ts` `ogForStory`/`ogForPoint`, description strings built from `agentOperator(profile)`), deleting the operator's profile does not retract that cache — the platform's cached card keeps naming a person who asked to be deleted, for as long as that platform's cache TTL holds (days to indefinitely, outside this repo's control). This is a genuine "right to erasure" gap: the profile row and the on-platform render both correctly go to "Operator account deleted," but the off-platform crawler cache does not and cannot be reached by this migration. Recommend adding this as an explicit **ACCEPT** risk (per `.claude/rules/features.md` risk labeling convention) rather than leaving it unaddressed, since there is no code fix available for it — it should be a documented, accepted limitation, not a silent gap discovered later.
- ⚠️ **Post-deletion trace: only the FK column, but check the free-text column's removal ordering.** Migration Plan step 7 drops `operator_name` "only after step 6 lands and nothing selects it" — correct ordering to avoid breaking reads mid-migration, but note explicitly: until step 7 runs, the deleted operator's **name string** (not just the id) still sits in the old `operator_name TEXT` column for any row created before the cutover, even after the FK is nulled by the delete trigger — because `ON DELETE SET NULL` only touches the new FK column, not the legacy text column, which is not tied to the FK and will not be nulled by the cascade. If there is any window where both columns coexist and a real profile is deleted in that window, `operator_name` keeps the human's name even though `operator_id` correctly went NULL. Confirm the migration either drops/nulls `operator_name` in the same transaction as adding the FK (per step 3's "delete existing fixture rows"), or explicitly accept this as a bounded, temporary window (only possible while old and new columns coexist, and only for rows that predate the FK column). This should be stated, not left implicit — it's exactly the "denormalized copy disagrees with the source of truth" failure the spec's own Solution section names as the reason to drop the text column in the first place.

**Fail-open render — the sharpest gap:**
- ⚠️ Confirmed by reading `src/app/data/agent-accounts-service.ts:27-29,58-64`: the client-side path **fails closed today** — `getAgentAccounts()` throws on any Supabase error rather than returning an empty/partial Map, and the doc comment states the caller (`AgentAccountsProvider`) keeps consumers gated while unresolved/failed. This is the correct existing pattern and the new operator-name-via-join read must preserve it — a `42501` from a missing grant on the new column must throw, not silently resolve to "no operator."
- ⚠️ **`api/og.ts` does NOT have this property — it fails open today, and the spec's planned nested embed inherits that.** `supabaseGet()` (api/og.ts L16-31) returns `null` on any non-`ok` HTTP response, collapsing "row genuinely absent" and "permission/grant error" into the identical fallback. `agentOperator()` (L79-87) further returns `null` whenever the embedded `agent_accounts` object is missing or malformed — again, no distinction between "this profile really has no agent account" and "the nested embed 42501'd because a grant is missing on the new join path." Per the spec (Risk: "The OG card reads through PostgREST embedding... resolving a name now requires a second embed level"), the planned embed is `profiles!...(name, agent_accounts(operator_name via operator_id join))` or similar — if the grant on the new operator path is misconfigured, `agentOperator()` returns `null`, and `ogForStory`/`ogForPoint` render the **non-agent branch** (title without "read by", description without the "machine-generated reading, not the person" disclosure) for an account that IS an agent. That is the reverse of "Operator account deleted" — it is **silently dropping the entire machine-disclosure notice from the crawler-facing OG card for an agent that has a live operator**, which is arguably worse than this spec's named risk, since it removes the "this is not the real person" disclaimer itself, not just the operator's name. This is not covered by the spec's Risk #2 ("A join failure silently erases the accountability line") because that risk is scoped to the profile-page header, not `api/og.ts`. Recommend the spec explicitly extend Risk #2's mitigation ("the missing-operator case is an explicit, tested render state") to `api/og.ts`, and require `og.ts`'s embed/grant path to be verified to fail loud (non-200) rather than fail into the "ordinary human" branch when the *agent-detection* embed itself (not just the operator-name field within it) hits a grant error.

**Unverified — implementer must confirm:**
- Exact new column name/type is not yet chosen in the spec (spec says "operator reference to public.profiles(id)" without naming the column) — confirm the actual migration text against this review once written.
- Whether `create_or_reuse_agent_account`'s new UUID parameter allows NULL at creation: `grep -n "p_operator_id\|IS NULL" supabase/migrations/<new p1124 migration>.sql` once drafted.
- Whether the nested OG embed for the operator's profile name actually works at the PostgREST depth required — the spec itself flags this as unverified ("verify the nested embed against the live API before building on it — do not assume depth works"); confirm with: `curl "$SUPABASE_URL/rest/v1/stories?select=title,profiles!stories_author_id_fkey(name,agent_accounts(operator:profiles!agent_accounts_operator_id_fkey(name)))&limit=1" -H "apikey: $SUPABASE_ANON_KEY"` (adjust FK constraint name to whatever the migration actually creates) against the **test** project, and confirm a `42501` from a missing grant surfaces as a non-200 top-level response rather than a silently-null embed.
- Whether `agent_accounts.operator_name`'s removal (Migration Plan step 7) is transactionally coupled to nulling any pre-existing `operator_id` FK inconsistency — confirm by reading the actual migration once drafted for a `DROP COLUMN operator_name` in the same file/transaction as the FK backfill, per the Data Protection finding above.

### Implementation Approach

**Worktree recommended:** touches 3 migration-equivalent DDL steps plus 5+ application files
across DB, service, context, two render surfaces, and the fixture — matches this repo's worktree
threshold.

#### Build Sequence

1. **Confirm row counts** in `agent_accounts` on test and prod (Migration Plan step 1). Prod is
   expected empty (P1104 unmerged); verify, do not assume — `select count(*) from
   agent_accounts` on both.
2. **Add the nullable column + FK**, naming the constraint explicitly:
   `ALTER TABLE public.agent_accounts ADD COLUMN operator_profile_id UUID REFERENCES
   public.profiles(id) ON DELETE SET NULL;` then confirm (via `\d agent_accounts` or
   `information_schema.table_constraints`) the auto-generated constraint name is
   `agent_accounts_operator_profile_id_fkey` — if Postgres names it differently, add
   `CONSTRAINT agent_accounts_operator_profile_id_fkey` explicitly to the `ADD COLUMN` clause so
   Decision 3's embed hints resolve.
3. **Backfill or delete existing fixture rows** per the step-1 count (Migration Plan step 3) —
   only relevant on test; if any fixture rows exist, either delete them (dev-only data) or set
   `operator_profile_id` by matching the existing dev-agent operator profile if one already
   exists as a real profile row.
4. **Grant the new column explicitly**, then verify with an actual anon read (not inferred from
   the GRANT statement — Done-When requires this):
   ```sql
   GRANT SELECT (operator_profile_id) ON public.agent_accounts TO anon, authenticated;
   ```
   ```bash
   curl -s "$SUPABASE_URL/rest/v1/agent_accounts?select=profile_id,operator_profile_id&limit=1" \
     -H "apikey: $SUPABASE_ANON_KEY"
   ```
   A `42501` here means the grant step was skipped or misapplied — do not proceed until this
   returns 200 with the column present.
5. **Run the Open Verification curl sequence** (both embed levels) against the test project before
   writing any application code that assumes the nested-embed shape. Record which path (nested
   embed vs. two-query fallback) is taken.
6. **Redefine `create_or_reuse_agent_account`** per Decision 2 (whole-function replace, provenance
   comment naming what it's diffed against, per this repo's existing migration-comment
   convention). **Reconciled with the Security Review — the RPC must reject all four of these,
   each with its own clear error, not rely on the FK constraint alone** (a raw FK violation is not
   the "clear error" Done-When requires, and three of the four pass the FK check anyway):
   - a `p_operator_id` that matches no `profiles` row;
   - `NULL` — an agent is never created operator-less. NULL is reachable **only** via
     `ON DELETE SET NULL` after the operator deletes their profile;
   - `p_operator_id = p_profile_id` — an agent set as its own operator;
   - a `p_operator_id` that already exists in `agent_accounts.profile_id` — an agent operating
     another agent, which leaves **zero humans** accountable for the reading. This is the exact
     harm the spec exists to prevent, and it passes every check the spec originally listed.
   Follow the `RAISE EXCEPTION` pre-check pattern already used for `p_subject_key` in
   `20260819160000_p1104_reserve_agent_name_at_the_table.sql:259`.
7. **Confirm P1108 has closed the `api/og.ts` fail-open before adding a second embed level.**
   **This fix is owned by P1108** (`features/p1108_link_previews_say_true_things.md`, section
   "A second untrue thing the same handler says"), not by this spec — it is the same unchecked-
   crawler-claim pattern and it can fire without any P1124 change. If P1108 has not landed when
   this step is reached, stop and land it first; do not proceed, and do not re-fix it here.
   Context for why this step gates the next one: `supabaseGet()`
   (`api/og.ts:28`) returns `null` on any non-`ok` response and `agentOperator()` (`api/og.ts:81`)
   returns `null` on any missing or malformed embed. `operator` is then the *sole* gate on the
   agent branch at lines 108/111, 135 and 157 — so a permission or embed error makes the crawler
   card render an agent as an ordinary person, dropping the "machine-generated reading, not the
   person" disclosure entirely. Verified by reading those lines, not inferred. **This is a live
   defect on the P1104 branch today, independent of P1124** — see the note under Technical
   Analysis. Fix the collapse of "no agent account" into "could not read the agent account"
   *before* step 8 makes the embed more fragile.
8. **Migrate the read path**: `agent-accounts-service.ts` (Decision 4), `agent-accounts-context.tsx`
   (`operatorNameFor` → needs the resolved-name shape from whichever path step 5 selected),
   `profile-page-v2.tsx` (Decision 5), `api/og.ts` (Decision 3), `scripts/dev-agent-fixture.mjs`
   (seed a real profile as operator via `create_or_reuse_agent_account`'s new signature — the
   fixture already creates a second human profile at line ~130 for the black-and-white-photo case;
   reuse that mechanism or add one more profile insert for the operator, then pass its id).
9. **Drop the free-text column only after step 8 lands and nothing selects `operator_name`** —
   grep `operator_name` across `src/`, `api/`, and `scripts/` to confirm zero remaining reads
   before this migration runs (Migration Plan step 7 ordering is load-bearing: dropping first
   would break every render site mid-deploy). **Reconciled with the Security Review:** while both
   columns coexist, `ON DELETE SET NULL` nulls only `operator_profile_id` — the legacy
   `operator_name` text keeps the deleted human's name. Either null `operator_name` in the same
   migration that adds the FK, or state the window as bounded and accepted; do not leave it
   implicit.
10. Update `e2e`/unit tests for the no-operator render state and the reject-nonexistent-operator
   RPC path (Done-When items are the acceptance surface — this build sequence does not itself
   write tests, per the PLAN ONLY constraint on this document).

#### Files to Create

- None. This spec extends existing tables, functions, and components; no new files are required
  by the architecture (a new migration file per this repo's `YYYYMMDDHHMMSS_pNNNN_description.sql`
  convention, filename TBD by the implementer at build time).

#### Files to Modify

- `.claude/worktrees/w1/supabase/migrations/` — new migration file: add column, add FK/constraint,
  grant, redefine `create_or_reuse_agent_account`, backfill/delete fixture rows, drop
  `operator_name` (as a **later** migration file per step 8, not the same one, so the drop can be
  deferred independently once reads are confirmed clear).
- `.claude/worktrees/w1/src/app/data/agent-accounts-service.ts` — select list + return type
  (Decision 4).
- `.claude/worktrees/w1/src/app/contexts/agent-accounts-context.tsx` — `operatorNameFor` resolution
  shape; docstring updates (several comments there currently describe the id→name Map as coming
  directly from `agent_accounts`, which is no longer true).
- `.claude/worktrees/w1/src/app/pages/profile-page-v2.tsx` — header render branch (Decision 5),
  around lines 195-197 and 902.
- `.claude/worktrees/w1/api/og.ts` — `AGENT_EMBED` constant and its three splice sites (Decision
  3), `agentOperator()` helper's field access (`operator_name` → nested `operator.name`).
- `.claude/worktrees/w1/scripts/dev-agent-fixture.mjs` — replace the literal `operator: 'Slava
  (ClarityPledge)'` string (line 71) and its use at the RPC call (line ~161) with a real seeded
  operator profile id.
