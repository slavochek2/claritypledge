---
status: in-progress
type: bug
rank: 1
severity: high
date_reported: '2026-08-12'
created_date: '2026-08-12'
tags: [security, rls, grants, privacy, live]
driver: anomaly
feature_type: backend
changes: p1053
delivery_stage: verify
pipeline_ran: [architect, dev, verify]
---

# P1057: the room code is a bearer token, and the SELECT policy publishes it

## Summary

P1053 made the 6-character room `code` the capability that authorizes claiming a joiner
seat — `claim_joiner_seat(p_code, p_joiner_name)` accepts nothing else. But the
`clarity_sessions` SELECT policy exposes every null-target row to `anon`, and `code` is one
of the columns it exposes. **The capability is published to the people it is supposed to
exclude.**

Split out of P1053 as AD9 [FOUNDER DECISION 2026-08-12] so the transcript-exposure fix
could ship without waiting on this. P1053 closed seat seizure, seat erasure and empty-seat
claiming; this closes the remaining path, which is that the key is readable.

## Problem

`claim_joiner_seat` refuses an occupied seat and refuses an ended session, so a code-holder
cannot displace a signed-in participant. What a code-holder *can* still do:

1. **Claim any vacant seat on any reachable room** — the intended practice-room model, but
   the reader never had to be invited, because enumeration is free.
2. **Take an anonymously-held seat**, per the P1053 resolution of Reconciliation item 3
   (anonymous rooms have no participant identity — release-then-claim makes any secret on
   claim alone worthless).

Neither is exploitable *at scale by a stranger* once the code is unreadable. Both are
trivially exploitable while it is readable, because no guessing is required.

**This is a different property from the one P1053 closed.** P1053 closed *who may write the
seat*. This closes *who may learn the capability*. A fix to one does not touch the other,
which is why they separate cleanly.

## Appetite

**Blast radius: the highest of anything in the P1053 family.** Every read path that projects
`code` breaks the moment the grant narrows — `mapSessionFromDb` (`api.ts:853`) selects `*`,
and four `.eq('code', …)` call sites resolve rooms by it. This is why it was split: it is
strictly riskier than the fix it was bundled with, and bundling them meant a UAT problem
here would have held the transcript fix hostage.

**Reversible:** yes — re-granting the column restores the previous state exactly.
**Decision density:** low. The mechanism is settled (see Solution); the work is enumeration.

## Solution

Sketch, inherited from P1053 AD9. Not yet re-verified against current code — treat the line
numbers as leads, not facts.

1. **Column-level SELECT split, not a row-predicate narrowing.**
   `REVOKE SELECT ON public.clarity_sessions FROM anon, authenticated;` then an explicit
   per-column `GRANT SELECT` that omits `code`. The P877/P886 idiom, already proven twice on
   `profiles`.

   The row-predicate narrowing stays **rejected** [FOUNDER DECISION, carried from P1053]:
   the null-target branch is what makes anonymous practice rooms reachable at all.

2. **Two SECURITY DEFINER read RPCs** to replace the reads that need `code`:
   `get_session_by_code` and `get_active_session_by_code`, each with `SET search_path =
   public`, `REVOKE ALL … FROM PUBLIC`, then explicit `GRANT EXECUTE`. The grace-period and
   ended-session logic currently in `getActiveSessionByCode` (`api.ts:1190-1222`) moves
   server-side with it.

3. **Audit every `code` projection reachable from `mapSessionFromDb`.** After the split,
   selecting `code` as `anon`/`authenticated` raises 42501. A missed projection is a silent
   break on a path that works today — this is the bulk of the work and the whole risk.

4. **Deploy frontend first**, exactly like P1053 Migration B: the migration carries
   `-- requires-frontend: <sha>` and `migrate.sh` blocks the prod apply until that commit is
   an ancestor of `origin/main`.

## Risks / Non-Goals

- **MITIGATE — a missed `code` projection.** The dominant risk. **Enumerate by *projection of
  `code`*, not from `mapSessionFromDb` + `.eq('code', …)`** — that method is structurally blind to
  embedded projections from other base tables and missed four live reads (Security Review). There
  are three `.eq('code', …)` sites, not four. Pinned commands are in the Security Review; the
  compiler-enforced check is Build Sequence step 2.
- **ACCEPT — anonymous seats remain claimable by a code-holder.** Unchanged from P1053 and
  deliberate. Anonymous practice rooms have no participant identity; no `session_transcripts`
  row is reachable through one — but **not** for the reason previously stated here. The policy
  (`20260313120000_p495_transcription_tables.sql:70-79`) does not check for a non-NULL
  `auth.uid()`; it is fail-closed because with `auth.uid()` NULL both comparisons evaluate to NULL
  and a `USING` clause excludes any row that is not TRUE. The distinction matters: the identical
  expression inside an `IF` in a definer function is fail-**open** (P1063,
  `20260813080000:44-49`). **Verify against live `pg_policies` on prod before accepting** — per
  P1046 (`20260810160000:17-20`), prod has carried a policy on `clarity_sessions` that exists in
  no migration.
- **ACCEPT — the read RPC is a cheaper enumeration probe than anything that exists today.**
  Non-mutating, side-effect-free, and no anon-reachable rate limit exists in the schema. Accepted
  per **D-B** (Resolved Decisions) on measured prod concurrency of **0 active rooms over 7 days**.
  Carries an explicit revisit trigger at ~50 concurrent live rooms — this is an ACCEPT with an
  expiry, not a permanent one.
- **DEFER — the room code is client-minted with `Math.random()`.** A 6-char code from a
  non-CSPRNG is guessable independently of whether it is published. Hiding it raises the bar
  only as far as the generator allows — and only as far as probe cost allows, which is what the
  entry above is about. Its own spec (below).
- **Non-goal — room *contents* stay anon-readable.** After this fix `anon` can still read every
  non-`code` column of every `target_listener_id IS NULL` row, including `state`, `live_state`,
  `creator_note`, `creator_name`, `joiner_name`. `live_state.sessionHistory` carries titles,
  participant names and ratings (`src/app/types/index.ts:563-577`). This spec closes *who may
  learn the capability*, not room-content confidentiality. Do not read it as having closed the latter.
- **Non-goal — the room code ships to Mixpanel in cleartext on eight call sites**
  (`start-clarity-session-button.tsx:76`, `clarity-live-page.tsx:706, 725, 730, 805, 1184, 1204,
  1220, 1234`) while `api.ts:1020-1024` forbids exactly that for Sentry and reports `codeLength`
  instead. Named here because a spec arguing "this string is a bearer token" cannot leave it
  unmentioned. Belongs with the P1059 hardening backlog if not taken here.
- **DEFER — a leaked code is unrevocable.** No rotation path, `expires_at` is NULL by design.
- **Non-goal:** the single-slot `joiner_profile_id` ACL. Separate spec, separate backfill.

## ~~BLOCKER~~ — RESOLVED 2026-08-17: P1053 is on prod

**Re-verified 2026-08-17 against prod REST (read-only, anon key), same method as the original
finding.** The blocker below is history; it is kept because the 21-column list and Build Sequence
step 0 both cite it.

| Re-check (prod, 2026-08-17) | Result |
|---|---|
| All 22 migration-described columns selectable as `anon` | **HTTP 200** — `ended_at` and `joiner_seat_claimed_at` both present |
| Probe control — a bogus column name | `42703 column … does not exist` — the probe is not blind |
| `POST /rpc/claim_joiner_seat` | **exists** — returns `42501 cannot join this room`, the deliberate generic refusal, not `PGRST202` |
| `GET ?select=code` as `anon` | **still returns a live code** — the defect this spec closes is unfixed |

**Consequences:** the Solution's premise now holds on prod (`claim_joiner_seat` is the seat-claim
authority there), and Decision 1's 21-column `GRANT` is correct against the **live catalog**, not
only against migration text. Re-read `information_schema.columns` on prod once more at
Migration-B-authoring time anyway — that requirement (Security Review, blocking finding 2) is
standing, not a one-time check.

---

### Original finding (2026-08-13) — kept for the root cause

**Discovered 2026-08-13 by reading prod, not the migration files.** Verified against prod REST
(read-only, anon key); every claim below is a live response, not an inference.

| Check | Result |
|---|---|
| `clarity_sessions` columns on prod | **20** — local migrations describe **22** |
| Missing on prod | `ended_at`, `joiner_seat_claimed_at` (both added by `20260812150000_p1053_…`) |
| `POST /rpc/claim_joiner_seat` on prod | **404 PGRST202** — the function does not exist |
| `target_listener_id IS NULL` rows on prod | 225 |

**Two consequences for this spec, both hard:**

1. **The Solution's premise is not true on prod.** The Summary says the code is the capability that
   authorizes claiming a seat because `claim_joiner_seat` accepts nothing else. That RPC is not
   deployed. Whatever P1057 does to the `code` column, it is not yet closing the path this spec
   describes.
2. **Migration B would abort on prod.** Decision 1 grants SELECT on 21 columns including
   `ended_at` and `joiner_seat_claimed_at`. `GRANT` on a nonexistent column raises **42703** and the
   migration fails. The list is correct against local migrations and wrong against prod.

**Root cause — `/ship`'s cherry-pick invalidates `requires-frontend` markers.**
`20260812160000_p1053_revoke_client_joiner_writes.sql:3` carries
`-- requires-frontend: 3dce8b69…`. That commit is on **no branch**: `/ship` cherry-picked it to
main, where it now lives as `65a7e2e9`. Both have patch-id `79a23e05…` — *identical change, rewritten
sha*. The real commit **is** on `origin/main`, so the frontend is deployed and the gate is a **false
block**.

And `migrate.sh:266-291` loops **all** pending migrations and `exit 1`s if any one is blocked — so
the harmless client-safe Migration A never applied either. Prod migrations have been silently
stalled since 2026-08-12 with no alert: the P886 prevention gate failing closed on a sha its own
ship pipeline rewrote.

**The root cause is structural and still unfixed** — `/ship` cherry-picks, so any sha taken from a
feature branch is rewritten by the time it reaches `main`. `decisions.md:6903` records the standing
workaround. **Constraint for P1057's marker:** take the sha from `origin/main` *after* the frontend
commit has landed there (Build Sequence step 10), never from the feature branch, and confirm with
`git merge-base --is-ancestor <sha> origin/main` before committing Migration B.

---

## Resolved Decisions

**D-A — Practice-room codes stay published, scoped.** `[FOUNDER DECISION 2026-08-13]` — option (a).

`getPracticeRooms` (`events-service-real.ts:827-836`) renders the code to every visitor of a public
event page; this is documented design (`docs/technical/database.md:96-102`) and the Join button is
gated on it (`PracticeRooms.tsx:90-91, 201-205`). For that room class, publishing the capability
**is the feature** — nobody is being excluded, which is the point of an event.

Implementation: a definer RPC returns codes **only** for sessions that have an `event_practice_rooms`
row for the requested event. Everything else goes dark. Event pages are unchanged for users.

The line this draws: *published because it is listed on a public page* vs *shared 1:1 by link*. Both
are `target_listener_id IS NULL`, so no column distinguishes them — but the `event_practice_rooms`
join does, exactly and cheaply.

**Accepted consequence:** event practice rooms gain nothing from this spec; a stranger can still join
one. That is correct, not a gap. Whether event rooms should be attendee-only is a **product**
question, filed separately — deliberately not decided inside a security fix.

**Rejected:** narrowing event-page publication (sign-in wall or server-side join). It closes the
stranger-joins-practice gap but costs the frictionless event flow, which is a top-of-funnel surface.
Reversing a deliberate product decision under a security label is scope creep.

**D-B — Rate limiting: accept, with a written revisit trigger.** `[FOUNDER DECISION 2026-08-13]` —
option (a).

Measured on prod 2026-08-13 (read-only): **0 rooms active in the last hour, 24h, or 7 days**
(`last_activity_at`, `target_listener_id IS NULL`). To crash a conversation an attacker needs a room
that is live *right now* with a vacant seat. At current concurrency the probe has essentially nothing
to hit; the arithmetic is in `.private/docs/security-log.md` (2026-08-13, P1057) and stays out of this
public file while prod is unpatched.

**Revisit trigger — this decision expires when it is no longer true:** re-open when concurrent live
rooms routinely exceed **~50**. Expected-guesses-to-hit scales inversely with concurrency, so that is
roughly a 50× reduction in attacker cost from today. Anyone reading this after that threshold is
crossed should treat D-B as lapsed, not settled.

**Rejected (b) — in-DB throttle** keyed on the forwarded-for header: the header is client-suppliable,
so it is a speed bump rather than a control, and it puts a database **write** on the guest read path
this feature family has been keeping clean.

**Rejected (c) — ship only `get_active_session_by_code`**: genuinely narrows the oracle and removes
the exists-but-ended discriminator, but `getClaritySession` serves cold `/live/:code` loads
(`clarity-live-page.tsx:1121`) and the rejoin banner (`active-session-banner.tsx:33`). Dropping it
collapses "this session ended" into "no such room" for anyone opening an old link. Real UX cost, for
a defence against an attack that currently has no targets.

**Unverified and not counted as protection:** Supabase's platform-level rate limits sit underneath
all of this. They were not measured.

---

## Done-When

> **Revised by the Security Review.** The original privilege assertion was blind to a `PUBLIC`
> grant — `information_schema.column_privileges` filtered by grantee returns zero rows both when
> the privilege is gone and when it is held via `PUBLIC`. That is the same shape that made four
> RPC lockdowns silent no-ops ([decisions.md](../docs/decisions.md) 2026-08-13 [technical]).

**Status 2026-08-17:** everything below is DONE **on test**. The prod half is deliberately still
open — it belongs to `/ship`, and the Pre-deploy Checklist carries it.

- [x] `code` is not readable by `anon` or `authenticated` — asserted inside Migration B itself
      with `has_column_privilege()` (which resolves `PUBLIC` and role inheritance; the
      `information_schema` form is blind to both), and the migration raises rather than warns.
      **Test: applied and green. Prod: pending `/ship`** — see Pre-deploy Checklist.
- [x] Behaviourally rejected on every shape, on **test**, all four returning `42501 permission
      denied for table clarity_sessions`:
      (a) anon `select=code` · (b) anon `select=*` · (c) the `event_practice_rooms` embedded
      shape · (d) the `clarity_live_invites` embedded shape
- [x] The positive control holds: anon `select=id,creator_name,live_state` still returns rows
      (HTTP 200) on test. Migration B also asserts this *itself*, per-column, over the whole
      table — so a grant narrower than the deployed bundle (the P886 shape) aborts the apply
      rather than shipping. `service_role` still reads `code` (HTTP 200); `INSERT` on `code`
      survives, or room creation would break.
- [x] Each RPC called as `anon` returns **exactly** its declared column set — 21 columns, `code`
      absent, asserted as an exact set (not a subset) in `p1057-db-schema.spec.ts` so both a
      leaked column and a drifted `RETURNS TABLE` fail.
- [x] **Realtime payload — ANSWERED, no longer UNVERIFIED.** Supabase Realtime **does** filter
      `postgres_changes` payload columns by the subscriber's column-level SELECT privilege. An
      anon subscriber to a null-target room receives exactly the **21 granted columns** and
      **no `code` key**; the payload is otherwise complete (`live_state`, `id` present).
      Locked in by `e2e/integration/p1057-realtime-payload.spec.ts` — the first test in this
      repo to open a WebSocket. It carries a control that FAILS on an empty payload, so silence
      can never read as an all-clear.
- [x] `getClaritySession` and `getActiveSessionByCode` migrated onto the read RPCs
- [x] Every `code` projection enumerated and confirmed — projection-indexed, re-run this
      session, and then **independently re-derived by the compiler**: making `knownCode`
      required turned the enumeration into type errors. It found the same set the Security
      Review's table names, plus three test suites the table does not.
- [x] `createClaritySession` round-trips: the bare `.select()` is now an explicit 21-column
      list and the locally-minted code is spliced onto the mapped result
- [x] All three anon-reachable RPCs added to P1064's allowlist
      (`scripts/anon-execute-allowlist.txt`); `get_room_code_for_invite` deliberately absent
      because it is granted to `authenticated` only
- [ ] **Deployed frontend-first, `requires-frontend` sha repointed, prod grants re-read after
      apply** — `/ship` owns this; see Pre-deploy Checklist

## Pre-deploy Checklist

Two steps here are **session-coupled** and cannot be done during `/dev` — doing them early is
itself the failure mode.

### 1. Repoint Migration B's `requires-frontend` sha (REQUIRED — it currently blocks)

`20260817140001_p1057_revoke_code_select.sql` carries the pre-ship branch sha `29587a64`.
`/ship` cherry-picks, which rewrites it, so that value will not be an ancestor of `origin/main`
and `migrate.sh` will refuse the prod apply. **That refusal is correct** — it is the gate
working, not a bug.

- [ ] After the merge, take the post-cherry-pick sha from `origin/main`
- [ ] Write it into the migration header
- [ ] Confirm: `git merge-base --is-ancestor <sha> origin/main`
- [ ] Only then apply to prod

Do not skip this by removing the marker. `migrate.sh` `exit 1`s on **any** blocked pending
migration, so a stale sha silently stalls every unrelated migration behind it — that is exactly
what kept P1053 off prod from 2026-08-12 to 2026-08-17.

### 2. Add the prod-smoke canary — in the SAME session as the prod migrate

- [ ] Mirror `scripts/prod-smoke-test.mjs:129-141`: anon
      `GET /rest/v1/clarity_sessions?select=code&limit=1` must return `>= 400` with `42501`
- [ ] Land it **only** alongside the prod apply. `migrate.sh` auto-runs the smoke after every
      prod migrate, so a canary committed early fails a co-tenant's unrelated migration
      (P886 sequencing constraint, `p886_…md:59`)

### 3. Post-apply verification on prod

- [ ] `has_column_privilege('anon'|'authenticated', 'public.clarity_sessions', 'code', 'SELECT')`
      → both `false` (Migration B asserts this itself and aborts otherwise)
- [ ] Re-run the four behavioural shapes + the positive control against prod
- [ ] `prod-smoke-test.mjs` green

## Related

- **P1053** — server-side join authorization. Shipped the write-side fix; this is its AD9,
  split out at `/dev` time so the transcript exposure could close first.
- Follow-ups still unfiled from P1053's Security Review: server-minted codes from a CSPRNG;
  code rotation/revocability; the two unpinned `search_path` RPCs
  (`create_transcription_job`, `retry_transcription`); the single-slot participant ACL.

---

## Technical Architecture

### Technical Analysis

#### 0. Corrections to this spec's own enumeration

The Solution section says to treat its line numbers as leads. They are stale in four ways, and
one of them changes the shape of the work.

| Spec claim | Reality | Command run |
|---|---|---|
| `mapSessionFromDb` at `api.ts:853` | Function opens at **`api.ts:850`**; `853` is the `code:` line inside it | `grep -n "function mapSessionFromDb" src/app/data/api.ts` → `850` |
| "four `.eq('code', …)` call sites" | **Three** in `src/` — `api.ts:970`, `:1049`, `:1207` | `grep -rn "eq('code'" src/` → 3 lines |
| `getActiveSessionByCode` grace logic at `api.ts:1190-1222` | **`api.ts:1201-1234`** (function `1201`, grace block `1220-1231`, return `1233`) | `Read src/app/data/api.ts:1140-1460` |
| "audit every `code` projection **reachable from `mapSessionFromDb`**" | `mapSessionFromDb` is the wrong anchor — it is a **pure mapper over an already-fetched row** and reaches nothing. Four of the seven breaking projections never call it | `grep -rn "clarity_sessions(\|clarity_sessions!" src/` → 4 hits, none via `mapSessionFromDb` |

**Where "four" came from, and why it matters.** P1053's AD9 trade-off reads: *"four client lookups
must move. Two are already moving to `claim_joiner_seat`; the other two become the RPCs above."*
That count was taken when `joinClaritySession` did **two** code-keyed operations — a SELECT and an
UPDATE. P1053 moved the UPDATE into `claim_joiner_seat`. **The SELECT did not fully move**: a P921
pre-flight read survives at `api.ts:967-971`, before the RPC call at `:1004`. So the arithmetic is
`4 − 1 = 3`, and *three* lookups need a server-side home, not two. The same stale string is frozen
into an assertion message at `e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts:404`
(`"resolved by code at api.ts:970/1002/1026/1184"`).

**The bigger correction: the count of *filters* was never the risk.** Filters are three. **Projections
are seven**, and five of them are invisible to every grep the spec proposes — three are PostgREST
FK embeds (`clarity_sessions(code)`) that never touch `.from('clarity_sessions')`, and one is a
no-argument `.select()`. The spec's stated audit method would have found two of the seven.

#### 1. Why every one of these breaks

Three independent Postgres facts, each already recorded in this repo:

1. **A column-level `REVOKE SELECT (col)` is a no-op while the role holds a table-level SELECT
   grant.** Only `REVOKE SELECT ON <table>` + `GRANT SELECT (<cols>)` gates. — `decisions.md:6290`
   (P877 trap 1), restated in `20260602160000_p877_profiles_pii_column_grants.sql:372-386`.
2. **Referencing a column in `WHERE` requires SELECT privilege on it.** So `.eq('code', …)` fails
   even when `code` is not in the projection. — P1053 AD9 trade-off, `p1053_…md:731`.
3. **`select=*` raises 42501; it does not silently narrow.** See §2.

**`.select()` with no argument is `select=*`.** `columns ?? '*'` at
`node_modules/@supabase/postgrest-js/dist/cjs/PostgrestQueryBuilder.js:51` and
`…/PostgrestTransformBuilder.js:18` (the `insert().select()` path). This is what makes
`createClaritySession` a breaking site that reads as harmless.

#### 2. Design question 1 — what does an anon `select=*` return after the split?

**A 42501 error, not a narrowed row.** Determined from repo artifacts, not from a live test this
session:

- `scripts/prod-smoke-test.mjs:75-78`, written as the P886 remediation:
  > `// P877/P886: profiles has NO table-level SELECT for anon/authenticated — only a`
  > `// column-level GRANT on non-sensitive columns. An implicit select=* (or selecting`
  > `// email/linkedin_url/reason directly) returns 42501. Whitelisted columns only here;`

  The line below it (`:80`) is the fix in force: `?select=id,is_verified`, not `select=*`.
- The P886 incident is the empirical proof on this codebase: a deployed bundle whose profile reads
  used `select('*')` returned **403 for ~1.5h** once the gate applied
  (`decisions.md:6259`; `p886_…md:27,72`). `p877_…md:71` names the pre-fix shape:
  *"multiple `from('profiles').select('*')` reads"*.

**Consequence for this spec:** every `select('*')` site is a hard break, not a degradation. There is
no "it just returns fewer fields" outcome to fall back on.

#### 3. Complete enumeration — every read path that could project or filter `code`

Role column: `anon+auth` = the browser bundle's anon key, with or without a user JWT — both are
subject to these grants. `service_role` is never subject to them.

**`src/` — direct table access**

| # | Path | Select list / filter | Role | `code`? | Verdict |
|---|---|---|---|---|---|
| 1 | `api.ts:916-930` `createClaritySession` | `.insert({code,…}).select()` → `select=*` | anon+auth | projects (RETURNING) | **BREAKS** |
| 2 | `api.ts:967-971` `joinClaritySession` P921 pre-flight | `.select('*').eq('code', …)` | anon+auth | **filters AND projects** | **MOVES-TO-RPC** |
| 3 | `api.ts:1046-1050` `getClaritySession` | `.select('*').eq('code', …)` | anon+auth | filters AND projects | **MOVES-TO-RPC** |
| 4 | `api.ts:1068-1071` `updateClaritySessionState` | `UPDATE {state} .eq('id')` | anon+auth | no | SAFE |
| 5 | `api.ts:1090-1093` `updateClaritySessionLiveState` | `UPDATE {live_state,mode} .eq('id')` | anon+auth | no | SAFE |
| 6 | `api.ts:1151-1154` `updateClarityDemoStatus` | `UPDATE {demo_status} .eq('id')` | anon+auth | no | SAFE |
| 7 | `api.ts:1204-1208` `getActiveSessionByCode` | `.select('*').eq('code', …)` | anon+auth | filters AND projects | **MOVES-TO-RPC** |
| 8 | `api.ts:1277-1281` `endClaritySession` read | `.select('live_state').eq('id')` | anon+auth | no | SAFE |
| 9 | `api.ts:1285-1294` `endClaritySession` write | `UPDATE {live_state} .eq('id')` | anon+auth | no | SAFE |
| 10 | `api.ts:1350-1354` realtime re-fetch inside `subscribeToClaritySession` | `.select('*').eq('id')` | anon+auth | projects | **BREAKS** |
| 11 | `api.ts:1408-1412` `updateDemoFlowState` read | `.select('state').eq('id')` | anon+auth | no | SAFE |
| 12 | `api.ts:1425-1428` `updateDemoFlowState` write | `UPDATE {state} .eq('id')` | anon+auth | no | SAFE |
| 13 | `sessions-service.ts:65-69` `getUserSessions` | explicit 8 columns + `transcription_jobs(…)` embed | auth | **no — `code` absent** | SAFE |
| 14 | `useOpenLiveInvite.ts:123-129` invite enrichment | `.select('code, creator_name, source_letter_id, profiles!…, stories!…')` | auth | **projects explicitly** | **BREAKS** |

**`src/` — PostgREST FK embeds (never match a `.from('clarity_sessions')` grep)**

| # | Path | Select list | Role | Verdict |
|---|---|---|---|---|
| 15 | `api.ts:4084-4092` `getOpenLiveInviteForUser` | `from('clarity_live_invites').select('…, clarity_sessions(code, creator_name, …)')` | auth | **BREAKS** |
| 16 | `api.ts:4308-4313` `getOpenInviteForSender` | `from('clarity_live_invites').select('session_id, clarity_sessions!inner(code)')` | auth | **BREAKS** |
| 17 | `events-service-real.ts:826-836` `getPracticeRooms` | `from('event_practice_rooms').select('*, session:clarity_sessions!…(code)')` | anon+auth | **BREAKS** |
| 18 | `events-service-real.ts:874-887` `openPracticeRoom` | `insert(…).select('*, session:clarity_sessions!…(code)')` | auth | **BREAKS** |

Sites 16–18 are absent from this spec entirely. Site 16 is absent from P1053's AD9 watch item too.
The embed compiles to a lateral subquery executed as the request role, so column ACLs apply exactly
as on a direct select.

**Realtime**

| # | Path | Shape | Role | Verdict |
|---|---|---|---|---|
| 19 | `api.ts:1337-1364` `postgres_changes` UPDATE on `clarity_sessions`, filter `id=eq.<uuid>` | payload consumed at `:1348` — reads **only** `payload.new.id` | anon+auth | **SAFE functionally · UNVERIFIED for confidentiality** |

`clarity_sessions` **is** in the publication (`20250101_initial_schema.sql:171`). It has **no**
`REPLICA IDENTITY FULL` — only `clarity_live_invites` does
(`20260415140000_p703_invites_replica_identity.sql:15`) — so `payload.old` carries the PK only;
`payload.new` carries the full new tuple regardless of which columns changed.

**UNVERIFIED — whether Supabase Realtime filters `postgres_changes` payload columns by the
subscriber's column-level SELECT privilege, or by RLS row-visibility only.** This repo has already
refused to rely on the vendor claim here. `20260812130000_p1048_close_chat_realtime_channel.sql`
(header, "WHY REMOVE RATHER THAN RELY ON RLS"):
> *"Supabase documents postgres_changes as gated by whether the subscriber can SELECT the changed
> row… That is vendor documentation this session did not test, and the REST-based regression suite
> structurally CANNOT test it — it speaks only `@supabase/supabase-js .from()` calls and never opens
> a WebSocket. This is epistemic gate 7b applied to the fix itself."*

Row-visibility gating is **not** column gating, and `clarity_sessions_select` keeps every
null-target row visible to `anon` by design. If Realtime gates on rows only, `code` continues to
reach anonymous subscribers over the WebSocket and the gate is defeated on that channel.
**What would settle it:** a test that opens an anon WebSocket subscription to a null-target session,
triggers an UPDATE, and asserts `payload.new.code` is `undefined`. No test of that shape exists in
this repo — `grep -rn "postgres_changes" e2e/` returns only `e2e/helpers/test-realtime.ts`, which
polls via `.from()`. Do not treat this as closed on inference.

**Edge functions, services, scripts — all clear**

| Path | Finding | Command |
|---|---|---|
| `supabase/functions/**` (17 functions) | **zero** references to `clarity_sessions` | `grep -rn "clarity_sessions" supabase/functions/` → no output |
| `services/transcribe/pipeline.py:44` | docstring only (`session_id: Supabase clarity_sessions.id UUID`) | `grep -n "clarity_sessions" services/transcribe/pipeline.py` |
| `scripts/copy-prod-to-test.mjs:382` | `UPDATE clarity_sessions SET source_story_id = NULL` — write, no `code` | — |
| `scripts/progress-refresh.sh:29` | `count clarity_sessions` → `?select=id` with **`VITE_SUPABASE_ANON_KEY`** (`:16`). `id` stays granted | SAFE |
| `.claude/commands/slava/maintain/analyze-transcripts.md:47` | curls `select=id,code,…` but with **`$PROD_SERVICE`** (service_role) | SAFE |

**`e2e/` — 62 files read `clarity_sessions`; the client split**

Every `code` projection in `e2e/` is issued through `supabaseAdmin` (service_role), which these
grants do not touch. Verified per-file, then spot-read at each site that names `code`:

- `e2e/integration/p1053-claim-joiner-seat.spec.ts:152-156` (`seed…`) and `:164-167` (`readRow`,
  commented *"Re-reads the row bypassing RLS"*) — both `supabaseAdmin`.
- `e2e/integration/p1058-release-seat-authorization.spec.ts:84-88` — `supabaseAdmin`.
- `e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts:399-400` — the read-back that
  asserts `code` is unchanged is `supabaseAdmin`; the anon client on the line above only *writes*.

Non-admin clients (`makeAnonClient()`, `makeUserClient(jwt)`, `signInAs(…)`) do appear on
`clarity_sessions` — in `p1038`, `p1047`, `p1053`, `p1058`, `p396`, `p703` — but every one of them
either UPDATEs, or INSERTs with `code` in the **payload** and `.select('id…')` in the projection
(e.g. `p1038-reproduce…:69-79`, `p396-host-rls-migration.spec.ts:73-80`). **INSERT of `code` needs
INSERT privilege on `code`, not SELECT** — those stay green, and this spec must not revoke INSERT.

**Verdict count: 7 breaking projections + 3 breaking filters across 6 files.** The spec's Appetite
implies 5 (`mapSessionFromDb` + "four `.eq`").

#### 4. Design question 2 — must the RPCs return `code`?

**No, and they must not.** But dropping it from the *row* is not the same as dropping it from
`ClaritySession`, and conflating the two is how this breaks silently.

**Every caller of the three code-keyed reads already holds the code:**

| Caller | Where its code comes from |
|---|---|
| `joinClaritySession(code, …)` (`api.ts:959`) | the join form |
| `getClaritySession(code)` (`api.ts:1043`) | the URL / form |
| `getActiveSessionByCode(stored.code)` (`clarity-live-page.tsx:1036`) | `sessionStorage` |
| `getActiveSessionByCode(rejoinSession.code)` (`clarity-live-page.tsx:1086`) | in-memory rejoin record |
| `getActiveSessionByCode(...)` (`src/hooks/use-active-session.ts`) | stored active-session record |

**But `ClaritySession.code` is load-bearing downstream and must stay populated:**

- **GCS audio upload path** — `sessionCodeForChunks.current = session.code`
  (`clarity-live-page.tsx:887`), consumed by `uploadSingleChunk(metadata.sessionCode, …)` (`:563`)
  and `uploadSessionRecording(session.code, …)` (`:3502`). An empty `code` writes chunks to a
  path segment of `''` — a **silent data-loss** failure, not an error.
- **Analytics** — `session_code` is sent as a Mixpanel property at `clarity-live-page.tsx:706`,
  `:725`, `:730`, `:1184`, `:1204`, `:1220`, `:1234`, `:1388`, `:1609`, `:1616`, `:2213`, `:3396`.
- **Display** — `{session.code}` rendered at `clarity-demo-page.tsx:382`.

So: the **row** stops carrying `code`; the **client object** keeps it, spliced from the value the
caller already has. That splice must happen at one place, or it will be missed at one.

#### 5. Design question 4 — where the grace-period logic goes

Into `get_active_session_by_code`, verbatim in behaviour. Current JS (`api.ts:1210-1233`): return
NULL if `live_state->>'sessionEnded'` or `->>'joinerEnded'` is true; else compare
`COALESCE(last_activity_at, created_at)` against `now() - 120s`; else return the row. SQL in
Decision 3 below. `SESSION_GRACE_PERIOD_SECONDS = 120` (`api.ts:1167`) becomes a literal in the
function body; the exported constant stays in `api.ts` because nothing else reads it from the DB.

#### 6. Dependencies

- **`claim_joiner_seat` is unaffected and must stay unchanged.** It is `SECURITY DEFINER`, so it
  executes as its owner and column grants do not constrain it — the P877 precedent is explicit
  (`decisions.md:5799`: *"since they are SECURITY DEFINER (run as owner), the P877 column-grant
  REVOKE did not constrain the read"*). It `RETURNS SETOF public.clarity_sessions`
  (`20260812150000_p1053_joiner_seat_claim_rpcs.sql`), so it keeps handing `code` back to its
  caller. That is not a disclosure: the caller supplied that exact code to get here. Changing its
  signature is a shipped-RPC signature change with no security gain — **explicitly out of scope**,
  said here so a reviewer does not read the omission as an oversight.
- **`patch_live_state`, `release_joiner_seat`, `complete_clarity_session`, `update_last_activity`** —
  all `SECURITY DEFINER`, all unaffected.
- **`clarity_sessions_select` policy is untouched** (`20260414100001_p703_letter_sourced_live.sql:124-129`).
  Rows stay as visible as they are today; only the column set narrows. This is what preserves the
  positive control in Done-When.
- **`scripts/prod-smoke-test.mjs` does not read `clarity_sessions`** (`grep -c` → `0`), so the
  P887 mandatory post-migrate smoke will not false-fail — and equally will not catch a regression
  here. A canary must be added, mirroring the `select=email` canary at `:134-141`.
- **`scripts/check-migration-client-safety.sh`** will arm on this migration:
  `BREAKING_SHAPES` at `:27` matches `REVOKE[[:space:]].*FROM.*(anon|authenticated)`. It requires a
  `-- requires-frontend: <7-40 hex>` or `-- client-safe:` marker. Note the gate does **not** match
  `REVOKE … FROM PUBLIC` alone.
- **`scripts/migrate.sh:260-291`** enforces the marker: `git merge-base --is-ancestor <sha> origin/main`,
  refusing *before* the ack prompt, and `--yes` does not bypass it. Mechanism verified by reading
  the code, and it has one live pass on record (`decisions.md:6201`, P886).

---

### Architecture Decisions

#### Reuse inventory

Read this session; every decision below cites into it.

| Artifact | Path | What it gives this spec |
|---|---|---|
| Table-drop-then-column-grant idiom | `20260602160000_p877_profiles_pii_column_grants.sql:372-395` | The exact SELECT-gate shape + the "new column is default-deny" maintenance note |
| Same idiom, re-applied | `20260605002428_p886_reapply_p877_column_gate.sql:1-45` | The `-- requires-frontend: <sha>` header format |
| Same idiom **on this table**, for UPDATE | `20260811150000_p1047_bind_update_clarity_sessions.sql:71-90` | The authoritative 18-column list + the "explicit allowlist, not what-we-use-today" rationale |
| Narrow column REVOKE on this table | `20260812160000_p1053_revoke_client_joiner_writes.sql:62` | The `information_schema.column_privileges` verification block (`:84-93`) |
| SECURITY DEFINER RPC hardening | `20260812150000_p1053_joiner_seat_claim_rpcs.sql` | `SET search_path = public`; `REVOKE ALL … FROM PUBLIC`; explicit `GRANT EXECUTE`; `upper(btrim())` normalization; 6-char length guard; single generic error to defeat the existence oracle |
| Both-forms REVOKE finding | `decisions.md:34-58` (commit `fb894456`) | Apply `FROM PUBLIC` **and** `FROM anon, authenticated`; verify against `proacl`/`column_privileges`, never against migration text |
| Read-accessor RPC pattern | `get_profile_by_id`, `get_featured_profiles` (P877 §1-2) | Precedent for replacing a direct client read with a DEFINER accessor |
| Prod smoke canary | `scripts/prod-smoke-test.mjs:129-141` | The `403-on-gated-column` canary shape to copy |
| Client mapper | `api.ts:850-878` `mapSessionFromDb` | Single choke point for the code-splice |
| Migration coupling gate | `scripts/migrate.sh:260-291`, `scripts/check-migration-client-safety.sh:27` | The frontend-first enforcement |

**Nothing in the inventory covers:** a Realtime-payload column assertion (no WebSocket test exists),
or an invite-scoped code accessor. Both are new.

---

#### Decision 1 — Column-level SELECT split with an explicit 21-column allowlist

**Chosen.**
```sql
REVOKE SELECT ON public.clarity_sessions FROM PUBLIC;
REVOKE SELECT ON public.clarity_sessions FROM anon, authenticated;

GRANT SELECT (
  id, creator_name, creator_note, joiner_name, joiner_profile_id, state,
  demo_status, partnership_status, created_at, expires_at, mode, live_state,
  is_private, last_activity_at, source_letter_id, source_story_id, status,
  creator_profile_id, target_listener_id, joiner_seat_claimed_at, ended_at
) ON public.clarity_sessions TO anon, authenticated;
```

**Rationale.** Reuses the P877/P886 idiom, third application in this repo and second on this table.
The 21 columns are the table's full set minus `code` — derived from the P1047 `GRANT UPDATE` list
(18 columns, `20260811150000…:73-90`), plus the two it deliberately excludes (`creator_profile_id`,
`target_listener_id`), plus the two P1053 added (`joiner_seat_claimed_at`, `ended_at`,
`20260812150000…:61-63`). **Grant everything except `code`, not just what today's bundle reads** —
P1047's header names why: *"a gate narrower than the deployed bundle is exactly what caused the P886
outage"* (`decisions.md:869`).

Both REVOKE forms, per the `fb894456` finding: each is a silent no-op against the other's grant, and
REVOKE is idempotent so the redundant half is free. The `FROM PUBLIC` form also strips
PUBLIC-derived access from `authenticated` — the `GRANT SELECT (…)` immediately below re-asserts it
in the same migration, which is the corollary that entry warns about.

**Trade-off.** A new `clarity_sessions` column is unreadable by `anon`/`authenticated` until added
to this grant. Intentional default-deny, identical to P877 and P1047; must be stated in the
migration header so a future author adds it deliberately.

**Alternative rejected.** *Row-predicate narrowing* — standing founder decision, carried from P1053.
The `target_listener_id IS NULL` branch is what makes anonymous practice rooms reachable
(`20260414100001…:124-129`); narrowing it takes guest rooms down.
*Per-column `REVOKE SELECT (code)`* — silently a no-op while the table grant stands
(`decisions.md:6290`).

---

#### Decision 2 — Four RPC needs, not two. The spec's count is short by two.

**Chosen.** Three new SECURITY DEFINER functions:

| Function | Replaces | Authorization |
|---|---|---|
| `get_session_by_code(p_code text)` | sites 2 (`joinClaritySession` pre-flight) + 3 (`getClaritySession`) | capability: possession of the code |
| `get_active_session_by_code(p_code text)` | site 7 | capability: possession of the code |
| `get_room_code_for_invite(p_session_id uuid)` | sites 14, 15, 16 (both invite paths + the hook) | `auth.uid()` is the invite's `target_user_id` **or** the session's `creator_profile_id` |

**Site 17/18 (`getPracticeRooms` / `openPracticeRoom`) is a fourth need and a founder call — see
Decision 6.**

**Rationale.** Sites 2 and 3 collapse into one function: both want "the row for this code,"
differing only in what the caller does with `live_state`. Sites 14–16 are a different question
entirely — the caller does **not** hold the code, and legitimately needs to learn it, because being
invited *is* the capability grant. Routing them through one id-keyed accessor is also a
**strengthening**: today any authenticated caller who can read a `clarity_live_invites` row reads
the code embedded beside it.

**Trade-off.** Three functions instead of two, and one of them (`get_room_code_for_invite`) is new
authorization logic rather than a port. `get_session_by_code` and `get_active_session_by_code`
overlap ~80%; keeping them separate mirrors the two distinct client contracts the spec's Done-When
already names.

**Alternative rejected.** *One `get_session_by_code(p_code, p_require_active boolean)`* — a boolean
that changes an authorization-adjacent function's semantics is the shape that lets a caller pick the
weaker branch. *Returning `code` from `claim_joiner_seat` and reusing it for the invite paths* — the
invite paths have no code to pass in; that is the whole problem.

---

#### Decision 3 — Explicit `TABLE(...)` return type, never `SETOF public.clarity_sessions`

**Chosen.** Each read RPC declares its output columns literally. Sketch, carrying the P1053
hardening idiom byte-for-byte:

```sql
CREATE OR REPLACE FUNCTION public.get_active_session_by_code(p_code text)
RETURNS TABLE (
  id uuid, creator_name text, creator_note text, joiner_name text,
  creator_profile_id uuid, joiner_profile_id uuid, state jsonb,
  demo_status text, partnership_status text, created_at timestamptz,
  expires_at timestamptz, ended_at timestamptz, mode text, live_state jsonb,
  is_private boolean, last_activity_at timestamptz, source_letter_id uuid,
  source_story_id uuid, target_listener_id uuid, status text,
  joiner_seat_claimed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Same bound + same generic failure as claim_joiner_seat: an unbounded input is
  -- materialized per request, and a distinguishable failure is an existence oracle.
  IF p_code IS NULL OR length(btrim(p_code)) <> 6 THEN
    RETURN;                                  -- empty set, not an exception: the client
  END IF;                                    -- contract here is "null when not found"

  RETURN QUERY
  SELECT s.id, s.creator_name, s.creator_note, s.joiner_name,
         s.creator_profile_id, s.joiner_profile_id, s.state,
         s.demo_status, s.partnership_status, s.created_at,
         s.expires_at, s.ended_at, s.mode, s.live_state,
         s.is_private, s.last_activity_at, s.source_letter_id,
         s.source_story_id, s.target_listener_id, s.status,
         s.joiner_seat_claimed_at
    FROM public.clarity_sessions s
   WHERE s.code = upper(btrim(p_code))
     -- api.ts:1216 — explicitly ended, by either party
     AND COALESCE((s.live_state->>'sessionEnded')::boolean, false) IS NOT TRUE
     AND COALESCE((s.live_state->>'joinerEnded')::boolean,  false) IS NOT TRUE
     -- api.ts:1220-1231 — grace window, last_activity_at falling back to created_at
     AND COALESCE(s.last_activity_at, s.created_at) >= now() - interval '120 seconds';
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_session_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_session_by_code(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_session_by_code(text) TO anon, authenticated;
```

**Rationale.** `SETOF public.clarity_sessions` binds the output to the **table row type**, which
contains `code` — the function would hand back exactly the value the migration just revoked, and
SECURITY DEFINER means no grant stops it (`decisions.md:5799`). Worse, the row type is
*open-ended*: a future `ALTER TABLE … ADD COLUMN secret` is added to this RPC's output with nobody
reviewing it. An explicit `TABLE(...)` makes the omission of `code` a structural property of the
function, readable in `\df+`, rather than a property of a grant in another file.

**Trade-off.** The signature must be updated by hand when a column is added, and a type mismatch
fails at `CREATE` time rather than silently. That loudness is the point. It also diverges from
`claim_joiner_seat`'s `SETOF` — deliberate, and Decision 2's table says why that one stays.

**Alternative rejected.** *`RETURNS SETOF public.clarity_sessions` with the client dropping `code`* —
the value crosses the wire; a client-side drop is not a control. *`RETURNS jsonb` built from a key
whitelist* (the P877 accessor shape) — viable, but it discards column typing and forces every caller
through a cast; `TABLE(...)` gives the same whitelist guarantee with types intact.

**Both REVOKE forms** on the function too, per `fb894456`: `FROM PUBLIC` alone leaves a role-direct
`anon=X/postgres` grant untouched, and `FROM anon` alone leaves an empty-grantee PUBLIC grant
untouched. Verify with `has_function_privilege()` against the live DB, never by reading the SQL.

---

#### Decision 4 — `mapSessionFromDb` takes the code as a parameter; one splice point, not seven

**Chosen.** `api.ts:850` becomes:

```ts
function mapSessionFromDb(dbSession: Omit<DbClaritySession,'code'> & {code?: string}, knownCode?: string): ClaritySession {
  return { id: dbSession.id, code: dbSession.code ?? knownCode ?? '', … };
}
```

Every caller passes the code it already holds (§4 table). `DbClaritySession.code` (`types/index.ts:174`)
becomes optional; `ClaritySession.code` stays required.

**Rationale.** There are five `mapSessionFromDb` call sites (`api.ts:934, 985, 1035, 1056, 1233`)
plus `:1361` inside the subscription. Splicing at each one is five chances to miss one, and a miss
produces `code: undefined` → the GCS chunk path silently writes to `''` (§4). Making the parameter
part of the signature turns every miss into a **TypeScript error at build time** instead of a
runtime data-loss bug. This is the one change that converts the spec's dominant risk from
"enumerate carefully" into "the compiler enumerates."

**Trade-off.** Two `mapSessionFromDb` functions now exist with different signatures — this one and
the unrelated `sessions-service.ts:36`, which maps a different row shape into `SessionSummary` and
never touches `code`. They are already distinct and neither is exported; no consolidation needed,
but a reader grepping the name will hit both.

**Alternative rejected.** *Leave the mapper alone and splice at each call site* — five silent-failure
opportunities on a path whose failure mode is lost audio, not an exception.

---

#### Decision 5 — `subscribeToClaritySession` carries the code; the realtime re-fetch is the highest-risk site

**Chosen.** `subscribeToClaritySession(sessionId, onUpdate, onStatusChange)` gains a required
`knownCode: string`. The re-fetch at `api.ts:1350-1354` drops `select('*')` for the explicit
21-column list and passes `knownCode` into `mapSessionFromDb`.

**Rationale.** This is the only `code`-projecting site whose failure is **invisible in the happy
path**: the subscription fires only on partner activity, so a broken re-fetch shows up as
"the session object went blank mid-call," minutes in, on a path with no test coverage. Four
components consume it — `clarity-live-page.tsx:1076` and `:1159`, `clarity-demo-page.tsx:68`,
`clarity-chat-page.tsx:371`, `use-active-session.ts:84` — and `clarity-live-page.tsx:1241` does
`setSession(updatedSession)`, wholesale-replacing the object that `sessionCodeForChunks` and every
Mixpanel call read from.

**Trade-off.** `use-active-session.ts` and `clarity-chat-page.tsx` subscribe from contexts that may
not have a code to hand (`clarity-chat-page` is behind a redirect — `App.tsx` routes `/chat` and
`/clarity-chat` to `/create`, per `20260812130000_p1048…` header). Making the parameter required
forces each to prove it has one. Where it genuinely does not, `''` is passed explicitly and visibly
rather than by omission.

---

#### Decision 6 — Practice-room codes: `[FOUNDER DECISION]` required, spec scope expands

**The problem.** `getPracticeRooms` (`events-service-real.ts:826-836`) publishes `sessionCode` to
**every viewer of an event page**, including `anon` — that is the P406 design (`database.md:96-102`
documents the embed as the intended query pattern). After the split it returns 42501 and practice
rooms become unjoinable.

**Chosen (recommended).** A fourth RPC, `get_practice_room_codes(p_event_id uuid)`, returning
`(room_id, code)` for rooms in `('waiting','active')` and unexpired — the same predicate the current
query uses (`:833-835`). Grant EXECUTE to `anon, authenticated`.

**Rationale.** This is a **faithful port, not a tightening**: the code is exposed to exactly the
same audience as today. It keeps P406 working and confines the exposure to one auditable function
that a later spec can gate on event RSVP.

**The founder call.** This makes the room code readable by any anonymous visitor to an event page —
so for event-hosted rooms, P1057's stated property ("the capability is not published to the people
it is supposed to exclude") is **not** achieved. The alternatives are: (a) port as-is and accept the
residue, scoped and named; (b) gate the RPC on `event_rsvps` membership, which changes P406's
product behaviour and needs its own spec; (c) let practice rooms lose their code, which breaks P406.
**(a) is recommended** — it matches the spec's existing pattern of naming residue rather than
expanding scope (see its ACCEPT/DEFER entries) — but it is a confidentiality concession the spec
does not currently mention, so it needs an explicit decision rather than an architect's default.

`openPracticeRoom` (`:874-887`) is the easier half: it is the creator's own INSERT, and the caller
minted the session, so it drops the embed and splices the code it already has.

---

#### Decision 7 — Rollback is two statements, and one alone is not a true inverse

**Chosen.**
```sql
REVOKE SELECT (
  id, creator_name, creator_note, joiner_name, joiner_profile_id, state,
  demo_status, partnership_status, created_at, expires_at, mode, live_state,
  is_private, last_activity_at, source_letter_id, source_story_id, status,
  creator_profile_id, target_listener_id, joiner_seat_claimed_at, ended_at
) ON public.clarity_sessions FROM anon, authenticated;

GRANT SELECT ON public.clarity_sessions TO anon, authenticated;
```

**Is it a true inverse?** For *effective privilege*, yes. `clarity_sessions` currently holds the
Supabase **default table-level SELECT grant** — `grep -rn "REVOKE SELECT" supabase/migrations/`
returns hits on `profiles` only (P877 `:387`, P886 `:36`), never on this table. P1047 replaced the
table-level **UPDATE** grant, not SELECT. So restoring table-level SELECT restores the pre-migration
reachability exactly.

For *ACL text*, the second statement alone is **not** an inverse: `GRANT SELECT ON <table>` adds the
table grant but leaves the 21 column grants in `information_schema.column_privileges`. They become
redundant (a table grant subsumes them) but persist, so a later `REVOKE SELECT ON <table>` would
re-activate the gate as a surprise. The column REVOKE must run first. This is the
`decisions.md:34-58` rule applied to rollback: *a grant is not what the migration says, it is what
the database holds* — confirm with `column_privileges` after either direction.

**Trade-off.** Rolling back re-publishes the room code. It is the P886 mitigation shape
(`decisions.md:6261`) and must be recorded as untracked drift if executed outside a migration.

---

#### Decision 8 — Realtime: add a WebSocket canary, do not assume

**Chosen.** Ship a test that subscribes to `clarity_sessions` `postgres_changes` as `anon`, triggers
an UPDATE via `supabaseAdmin`, and asserts on `payload.new.code`. Record the observed result in the
spec. If `code` is present, the confidentiality goal is not met on that channel and the follow-up is
a separate decision (narrow the publication, or accept and record).

**Rationale.** Epistemic gate 7b, and this repo has already been bitten in exactly this shape:
`20260812130000_p1048…` removed a table from the publication precisely because the REST suite
"structurally CANNOT test" the WebSocket path. Every test this spec would otherwise write speaks
`.from()` and would go green while the channel stays open — a green suite bounding only what was
modelled.

**Trade-off.** This is a new test shape for this repo; `grep -rn "postgres_changes" e2e/` finds no
precedent to copy. Budget for it as new work, not a variation.

**Alternative rejected.** *Cite the Supabase docs and move on* — the `p1048` header already refused
that trade once, on a table nothing used. Refusing it here, on the live `/live` path, is the same
call with more at stake.

---

#### Decision 9 — Deploy order (design question 5)

**Chosen.** Frontend first, `-- requires-frontend: <sha>` marker, exactly the P886 shape.

1. Land every `src/` change (Decisions 4, 5, 6-half, and all seven projection fixes) **plus** the
   three RPC-consuming call sites, on `origin/main`.
2. Take that commit's sha; write it into the migration header.
3. Apply the **additive** migration (the three/four RPCs) — client-safe, nothing narrows, the RPCs
   are unreachable until the bundle calls them. This mirrors P1053's Migration A/B split
   (`20260812150000…` header: *"Applying this file ALONE closes nothing — that is deliberate"*).
4. Apply the **narrowing** migration (the REVOKE/GRANT split). `migrate.sh:279` blocks until the
   step-1 sha is an ancestor of `origin/main`.
5. Post-migrate: `prod-smoke-test.mjs` auto-runs (`migrate.sh` gate 3). Re-read
   `information_schema.column_privileges` on prod and confirm `code` has no row for `anon`/`authenticated`.

**What breaks if the order is violated.** Applying step 4 before step 1 reproduces P886 verbatim:
the deployed bundle's `select('*')` at `api.ts:929/969/1048/1206/1352` and the four embeds all
return 403. Concretely — **room creation, room joining, session resume, the invite banner, and the
event practice-room list all fail at once**, and the realtime re-fetch failure is silent. That is a
strictly wider blast radius than P886's, which hit reads only. `migrate.sh`'s coupling gate is the
only thing preventing it and it refuses before the ack prompt, `--yes` included.

**Why two migrations, not one.** A single file carrying both the RPCs and the REVOKE would be
`requires-frontend`-blocked as a unit, so the RPCs could not be verified on prod before the gate
closes. Splitting lets step 3 land and be smoke-tested while every read path still works.

---

### Security Review

Independent pass, run in parallel with the architecture above. Where the two converged
(both-forms REVOKE, `RETURNS TABLE`, the practice-room contradiction) the Decisions already
carry it; the findings below are the ones that **change** the Build Sequence, and the
reconciliation at the end of this section records what was fixed.

**Disclosure routing:** prod is unpatched and this file is public. Per
[decisions.md](../docs/decisions.md) 2026-08-13 [process] — *"exploit detail in a public
migration header opened a disclosure window against unpatched prod"* — the quantified attack
economics for the enumeration-oracle finding live in `.private/docs/security-log.md`
(2026-08-13, P1057), not here. What stays here is the decision and why it is safe.

**RLS Policies:**

- ✅ **`REVOKE … FROM anon, authenticated` is the correct form for this table — but only because
  the grant is role-direct, which must be asserted rather than assumed.**
  `20250101_initial_schema.sql:2` grants via `alter default privileges … to postgres, anon,
  authenticated, service_role` — role-direct, grantee is not `PUBLIC`. `clarity_sessions` is
  created at `:137` in the same file, after that line, so it inherits it. Negative check:
  `grep -rniE "GRANT [A-Z, ()a-z_]* ON (TABLE )?public\.[a-z_]+ TO (public|PUBLIC)"
  supabase/migrations/*.sql` → 0 hits. Behavioural corroboration is stronger than the text: the
  identical form on `profiles` **worked, loudly** — `20260605002428_p886_reapply_p877_column_gate.sql:9-14`
  records it 403'ing every prod login/signup/profile read for ~1.5h. A no-op does not cause an outage.

- ⚠️ **…and the same file records why you still cannot trust it.** P886's emergency mitigation
  "re-granted table-level SELECT on profiles to anon + authenticated via the Management API —
  untracked drift" (`20260605002428:12-14`). And `20260810160000_p1046_drop_drifted_prod_only_policies.sql:17-20`
  found a prod-only policy on **this exact table** that "appears in NO migration at all… Applied
  out-of-band." Prod has twice held grants/policies no migration explains. Decision 1 already
  writes both REVOKE forms; the residual requirement is that **verification reads live ACL, never
  migration text** — see the Done-When changes below.

- ✅ **The row policy is untouched and the Done-When positive control is the right one.**
  `20260414100001_p703_letter_sourced_live.sql:124-129` keeps the `target_listener_id IS NULL OR
  auth.uid() IN (…)` branch that makes anonymous practice rooms reachable — the founder's stated
  requirement, and consistent with `decisions.md:859-862`.

- ⚠️ **The `session_transcripts` claim in Risks is TRUE but its stated mechanism is wrong.** The
  actual policy (`20260313120000_p495_transcription_tables.sql:70-79`) does **not** gate on a
  non-NULL `auth.uid()` — `grep -n "auth.uid() IS NOT NULL"` on that file returns 0 hits. It is
  fail-closed because with `auth.uid()` NULL both comparisons evaluate to NULL and a `USING`
  clause excludes any row that is not TRUE. That is the WHERE-vs-IF distinction P1063 spells out
  at `20260813080000:44-49` — the identical expression inside an `IF` is fail-**open**. Restating
  it as "gates on a non-NULL `auth.uid()`" teaches the wrong lesson and would not survive someone
  moving that predicate into a definer function. **Risks text corrected below.**

**Authentication:**

- ⚠️ **`anon` EXECUTE on the read RPCs is *required*, not optional — and must be recorded as such.**
  The guest join path has no session: `claim_joiner_seat` is deliberately anon-reachable
  (`20260812210000_p1053_null_safe_guest_name_match.sql:142-143`) and P1063 carves it out at `:77-80`
  as "the product working". `getActiveSessionByCode` is what a cold `/live/:code` visit calls before
  any auth exists. So `get_active_session_by_code` **must** carry `GRANT EXECUTE … TO anon,
  authenticated`. That makes it correct — but only if recorded. Shipping two more unclassified
  anon-executable SECURITY DEFINER functions **while P1064 is open** is the backlog outrunning the
  audit. See `[FOUNDER DECISION]` + allowlist step below.

- ✅ **The hardening triple is complete for brand-new functions.** `SET search_path = public` +
  `REVOKE ALL … FROM PUBLIC` + explicit `GRANT EXECUTE`. A new function's only ACL entry is the
  default EXECUTE-to-PUBLIC, so the PUBLIC-form revoke is the one that bites. Decision 3 already
  writes both forms.

- ⚠️ **P1063 corollary to inherit:** if either RPC later gains an argument, the overload is a *new*
  function with a fresh PUBLIC grant that the original REVOKE does not cover
  (`20260813080000:26-29`). Note it in the migration header.

**Authorization:**

- ⚠️ **The RPC return shape is how this fix defeats itself — and there is a live precedent in this
  feature family.** `claim_joiner_seat` is `RETURNS SETOF public.clarity_sessions`
  (`20260812210000:53`) with `RETURNING *` at `:138`. SECURITY DEFINER runs as owner, so column
  grants do not apply — it returns every column including `code`. Acceptable there (the caller
  supplied the code); **not** acceptable as a template. Decision 3 correctly specifies
  `RETURNS TABLE (…)`. **Corollary the migration must carry: `SELECT *` and `RETURNING *` are banned
  inside any definer function on this table**, because a column added later silently joins the output.

- ⚠️ **The spec's original enumeration method was structurally blind.** Solution §3 indexed on
  `mapSessionFromDb` + "four `.eq('code', …)` sites" — the count is three (`api.ts:970, 1049, 1207`),
  and neither anchor reaches a projection of `code` from **another base table**. Four live reads were
  missed; all four are now in the Technical Analysis table and the Files to Modify list:
  `events-service-real.ts:827-836` (embedded from `event_practice_rooms`, **anon-reachable**, fails
  double-swallowed into an empty list), `events-service-real.ts:883-886`, `api.ts:4084-4092`,
  `useOpenLiveInvite.ts:123-131`. Reproducible commands, pinned:

  ```bash
  grep -rn "clarity_sessions" src/ | grep -E "select|\(code|'code|\"code"
  grep -rn "clarity_sessions!.*\(" src/     # embedded/FK-join projections from other base tables
  ```

- ⚠️ **Hiding `code` from `authenticated` does not merely inconvenience the creator — it stops room
  creation outright.** `createClaritySession` (`api.ts:916-931`) ends `.insert({…}).select().single()`;
  a bare `.select()` is `select=*`, and `INSERT … RETURNING *` requires SELECT on every returned
  column, so it 42501s and throws at `:946` (the retry loop only catches `23505`). All three creator
  entry points break. The creator never needs to *read* the column back — `generateRoomCode()`
  (`api.ts:838-846`) mints it client-side and `/live/:code` carries it thereafter — so the fix is
  (a) explicit insert-returning column list omitting `code`, **and** (b) re-attach the local `code`
  onto the mapped result. **Miss (b) and `session.code` is `undefined`, and the creator navigates to
  `/live/undefined` — a break that ships green because nothing throws.** Both halves are in the
  Build Sequence.

- ⚠️ **The realtime re-fetch is a `select('*')` on the hottest path in the product.**
  `api.ts:1350-1354`, inside `subscribeToClaritySession`, re-fetches on every UPDATE and feeds
  `mapSessionFromDb`. After the split this 42501s on **every tick for both participants**, and the
  only handling is `console.error('📡 Re-fetch failed:', error)` at `:1358` — live state sync dies
  silently. Not reachable from `.eq('code', …)`; now explicit in the Build Sequence.

- ⚠️ **Product contradiction: P406 practice rooms publish the code on purpose.**
  `getPracticeRooms` renders the code to every visitor of a public event page — documented as
  intended design at `docs/technical/database.md:96-102`, with the Join button gated on it
  (`PracticeRooms.tsx:90-91, 201-205`). For that class of room, "the capability is published to the
  people it is supposed to exclude" **is the feature**. The spec's threat model silently assumed all
  rooms are private-by-link. This is Decision 6 and it is a founder call — do not let the enumeration
  pass settle it by accident.

**Input Validation:**

- ⚠️ **Error-channel uniformity is already right in `claim_joiner_seat` and must be copied
  deliberately.** Five distinct refusal reasons in `20260812210000` (`:78-81`, `:83-86`, `:88-94`,
  `:96-105`, `:118-122`) all raise the identical `'cannot join this room'` with `ERRCODE = 42501`;
  only the server-side `RAISE LOG` differs. The read RPCs must return an **empty result**, never a
  distinguishable error, for unknown code / ended session / past grace period. Today all three
  collapse to `return null` in JS (`api.ts:1210-1234`) — moving that logic server-side is exactly
  the moment a well-meaning implementer adds `RAISE EXCEPTION 'session expired'` and creates a
  discriminator that does not exist today. Decision 3 already specifies the empty set; keep it.

- ✅ **Timing is not the channel; return shape is.** The lookup is a unique-index probe
  (`idx_clarity_sessions_code`, `20250101_initial_schema.sql:150`), so hit-vs-miss timing is
  negligible against network noise.

- ⚠️ **The pair of RPCs is itself a discriminator.** `get_session_by_code` returning a row while
  `get_active_session_by_code` returns nothing distinguishes "exists but ended" from "does not
  exist". Weaker than the code itself and probably acceptable — but state it as accepted, or ship
  only the active variant.

**Data Protection:**

- ⚠️ **The enumeration oracle — a `[FOUNDER DECISION]` this spec owes, not the deferred one.**
  Hiding the column is a real improvement of *kind*: today the capability is enumerable in bulk,
  after the split it is not. But a non-mutating read RPC is a cheaper probe than the only oracle
  that exists today, and no anon-reachable rate limit exists in the schema — every rate-limit table
  found (`ai_rate_limits`, `search_rate_limits` `20260605150000_p878:86-90`) is keyed on an
  authenticated identity an anon caller does not have. Quantification and the time-to-first-hit
  arithmetic are in `.private/docs/security-log.md` (2026-08-13, P1057), deliberately not here.
  Three honest options — **(a)** accept and write the reasoning down; **(b)** throttle in-DB keyed on
  `current_setting('request.headers', true)::json->>'x-forwarded-for'` — client-suppliable, so a
  speed bump rather than a control, and it adds a write to the guest read path; **(c)** ship only
  `get_active_session_by_code`, halving the probe surface. **Recommend (a) or (c).**

- ⚠️ **The room code ships to Mixpanel in cleartext on eight call sites — the exact thing P1053's
  review fixed for Sentry.** `api.ts:1020-1024` states the principle in code ("the room code is now
  the authorization capability… sending it to Sentry in cleartext… is credential logging") and
  reports `codeLength` instead. Meanwhile `analytics.track` still carries `session_code: session.code`
  at `start-clarity-session-button.tsx:76` and `clarity-live-page.tsx:706, 725, 730, 805, 1184, 1204,
  1220, 1234`. A spec whose thesis is "this string is a bearer token" cannot leave the token flowing
  to a third-party analytics vendor unmentioned. Not necessarily this spec's work — filed as a
  Non-Goal below.

- ✅ **The 21-column list is complete — verified independently, and the review's objection to it did
  not survive.** The security pass argued Decision 1 was unsafe for deriving its list from P1047's
  `GRANT UPDATE` allowlist (a *write* list, which by design omits server-written columns) and named
  `joiner_left_at` + `joiner_seat_claimed_at` as omissions. Both claims are false: `joiner_left_at`
  is not a column at all — it is a name *considered and rejected* in a comment
  (`20260812150000_p1053_joiner_seat_claim_rpcs.sql:44`) — and `joiner_seat_claimed_at` is already
  in Decision 1's list. Full enumeration from the migrations: 10 base columns
  (`20250101_initial_schema.sql:137-147`) + 12 added by `ADD COLUMN` across nine migrations
  (`mode`, `live_state`, `creator_profile_id`, `joiner_profile_id`, `is_private`,
  `last_activity_at`, `source_letter_id`, `source_story_id`, `target_listener_id`, `status`,
  `joiner_seat_claimed_at`, `ended_at`) = **22 total, minus `code` = 21.** Decision 1's arithmetic
  is right and no column is missing.

- ⚠️ **…and the demand attached to those wrong examples was nonetheless correct — prod has 20
  columns, not 22.** Verified live 2026-08-13: `ended_at` and `joiner_seat_claimed_at` return
  **42703 (column does not exist)** on prod, because P1053's migration never applied (see BLOCKER).
  So the 21-column list is right against the migrations and **wrong against the database**, and
  `GRANT SELECT (ended_at)` would abort Migration B. This is the third instance of the same class:
  P886's Management API re-grant (`20260605002428:12-14`) and P1046's out-of-band policy on this
  exact table (`20260810160000:17-20`) were the first two. **Read `information_schema.columns` on
  prod at migration-authoring time** — `decisions.md:867-870` is the standing rule, and
  `src/app/types/supabase.ts` does not exist despite `.claude/rules/db-access.md` citing it as a
  schema source, so the types file is not an alternative check.

  Standing lesson, now earned three times: *the migration files describe an intended database, not
  the deployed one.* Every gate in this spec must read live ACL and live catalog.

**Blocking findings — reconciliation against the Build Sequence**

Convergent, already carried by the Decisions above — no change needed: both-forms REVOKE (D1),
`RETURNS TABLE` never `SETOF` (D3), empty-set-not-exception (D3), practice-room founder call (D6),
the four missed projections + `createClaritySession` + the realtime re-fetch (Technical Analysis §3,
Files to Modify).

Required changes, applied to Done-When / Risks / Build Sequence in this pass:

1. **Done-When privilege assertion was blind.** `information_schema.column_privileges` filtered by
   grantee returns zero rows *both* when the privilege is gone **and** when it is held via `PUBLIC` —
   the exact shape that made four RPC lockdowns silent no-ops (`decisions.md:34-58`). Replaced with
   `has_column_privilege()`, which resolves PUBLIC and role inheritance, plus a `pg_class.relacl`
   read. Consistent with `decisions.md:874-876`.
2. **GRANT column list — the review's examples were wrong and its conclusion was right.** Its two
   named omissions do not survive checking (`joiner_left_at` is not a column; `joiner_seat_claimed_at`
   was already in the list), and against *local migrations* the 21 are complete. But the demand it
   attached to them — **derive the list from the live table, not from migration text** — is
   correct, and for a reason neither agent found: **prod has only 20 columns.** `ended_at` and
   `joiner_seat_claimed_at` exist in the migrations and not in the database, so a list derived from
   migration text raises 42703 on prod. See BLOCKER. Requirement stands at full strength: read
   `information_schema.columns` **on prod** at authoring time.
3. **`anon` EXECUTE stated per RPC as `[FOUNDER DECISION]`**, and both functions added to P1064's
   deliberately-anon allowlist in the same commit, so P1065's drift check has a baseline on day one.
4. **Rate limiting decided in this spec**, not deferred.
5. **`session_transcripts` Risks text corrected** (USING-excludes-non-TRUE, not "gates on non-NULL
   `auth.uid()`") **and verified against live `pg_policies` on prod** — per P1046, "one policy in the
   files" is not "one policy on prod".
6. **Behavioural checks widened** beyond a direct anon GET: `select=*`, the two embedded shapes, each
   RPC's returned column set, and the realtime payload.

**UNVERIFIED:** whether Supabase Realtime omits columns the subscribing role lacks SELECT on.
Settled by subscribing to `postgres_changes` on `clarity_sessions` with the anon key on **test**
after the grant is applied and inspecting `payload.new` for a `code` key (Build Sequence step 7).
`decisions.md:479` already records publication membership as "the part with no local signal".
No database was touched in this review; every schema and grant statement above is from local
migration files, cited by file:line.

---

### Implementation Approach

**Worktree recommended:** two migrations plus ~8 source files across `api.ts`, a hook, two services
and the live page — and the migration is prod-coupled, so an isolated branch keeps the
`requires-frontend` sha stable while `main` moves.

**Model + effort:** migration authoring + the RPC bodies → Opus, high (authorization logic, not
mechanical). The seven projection fixes → Sonnet, medium (each is a mechanical select-list edit once
Decision 4 makes the compiler enforce the splice).

#### Build Sequence

0. ✅ **CLEARED 2026-08-17.** P1053 is on prod: `claim_joiner_seat` exists (generic `42501`, not
   `PGRST202`) and all 22 columns are selectable, so Decision 1's 21-column `GRANT` will not abort
   with 42703. Evidence and the probe control are in the resolved-BLOCKER table above. The standing
   requirement survives: **re-read prod's live column list at Migration-B-authoring time** — this
   check is per-migration, not one-time.
1. ✅ **Decision 6 / D-A resolved** — practice-room codes stay published, scoped to sessions with an
   `event_practice_rooms` row. Adds `get_practice_room_codes`; RPC count is settled. D-B settles
   rate limiting as ACCEPT, so no throttle work and both read RPCs ship.
2. **Type + mapper change first** (`types/index.ts:174`, `api.ts:850`). Make `DbClaritySession.code`
   optional and add the `knownCode` parameter. `npx tsc --noEmit` now **lists every site that must
   change** — paste that output into the spec as the enumeration's independent check against §3.
3. **Fix the seven projections + three filters** (§3 table, verdicts BREAKS / MOVES-TO-RPC). The
   three MOVES-TO-RPC sites call RPCs that do not exist yet — stub them so the build stays honest.
4. **Migration A (additive)** — the three (or four) SECURITY DEFINER RPCs, Decision 3 shape.
   `-- client-safe:` marker with the P1053 Migration A wording. Apply to test.
   **In the same commit** (Security Review, Authentication): record the `anon` EXECUTE grant per
   RPC as a `[FOUNDER DECISION]` in the migration header, and add both functions to P1064's
   deliberately-anon allowlist so P1065's drift check has a baseline the day this lands. Also note
   the P1063 overload corollary in the header — a future argument change creates a *new* function
   with a fresh PUBLIC grant that this REVOKE does not cover.
5. **Integration tests against the RPCs on test** — including the negative: `get_room_code_for_invite`
   called by a user who is neither target nor creator returns nothing.
6. **Exercise the failure path before trusting the gate** (epistemic gate 7): apply Migration B to
   **test**, confirm an anon `select=*` returns 42501 and the positive control (`select` without
   `code`) still returns rows. Paste both responses.
7. **Realtime canary** (Decision 8). Record the result whichever way it goes.
8. **Add the prod-smoke canary** — mirror `prod-smoke-test.mjs:129-141`: anon
   `GET /rest/v1/clarity_sessions?select=code&limit=1` must be `>= 400` with `42501`. Per the P886
   sequencing constraint (`p886_…md:59`), add this **only in the same session as the migration** —
   `migrate.sh` auto-runs the smoke after every prod migrate, so a premature canary fails a
   co-tenant's unrelated migration.
9. **Re-run `p1053-claim-joiner-seat.spec.ts` and `p1058-release-seat-authorization.spec.ts` on test
   after Migration B.** These prove `claim_joiner_seat`'s `SETOF clarity_sessions` return still
   serializes through PostgREST when the caller lacks table SELECT. Reasoning says it does — the ACL
   attaches to the table, not the function result — but that is inference, and these suites test it
   for free.
10. **Push the frontend**, capture the sha, write it into Migration B's header, commit.
11. **Apply Migration A then Migration B to prod**, in that order, in one session.
12. **Verify on prod** — the privilege assertion is `has_column_privilege()`, **not**
    `information_schema.column_privileges`: the latter, filtered by grantee, returns zero rows both
    when the privilege is gone and when it is held via `PUBLIC`, which is the shape that made four
    RPC lockdowns silent no-ops ([decisions.md](../docs/decisions.md) 2026-08-13 [technical]).

    ```sql
    SELECT has_column_privilege('anon',          'public.clarity_sessions', 'code', 'SELECT') AS anon_code,
           has_column_privilege('authenticated', 'public.clarity_sessions', 'code', 'SELECT') AS auth_code;
    -- both must be false
    SELECT relacl FROM pg_class WHERE oid = 'public.clarity_sessions'::regclass;  -- table-level state
    ```

    Then behavioural 42501 on all four shapes from Done-When; positive control confirmed; RPC
    column sets match their declarations; smoke 8/8.

#### Files to Create

| Path | Purpose |
|---|---|
| `supabase/migrations/<ts>_p1057_session_read_rpcs.sql` | Migration A — `get_session_by_code`, `get_active_session_by_code`, `get_room_code_for_invite`, and (pending Decision 6) `get_practice_room_codes`. `-- client-safe:` marker |
| `supabase/migrations/<ts>_p1057_revoke_code_select.sql` | Migration B — the REVOKE/GRANT split. `-- requires-frontend: <sha>` |
| `e2e/integration/p1057-code-column-gate.spec.ts` | Anon `select=*` → 42501; anon `select=code` → 42501; **positive control**: anon select without `code` on a null-target row still returns rows; each RPC's happy + negative path |
| `e2e/integration/p1057-realtime-payload.spec.ts` | Decision 8 — the WebSocket canary. New test shape; no precedent in this repo |

#### Files to Modify

| Path | Change |
|---|---|
| `src/app/types/index.ts:174` | `code` optional on `DbClaritySession` |
| `src/app/data/api.ts:850-878` | `mapSessionFromDb` gains `knownCode` (Decision 4) |
| `src/app/data/api.ts:916-930` | `createClaritySession`: `.select()` → explicit 21 columns; splice the locally-minted `code` (already in scope at `:904`/`:939`) |
| `src/app/data/api.ts:959-1036` | `joinClaritySession`: pre-flight onto `get_session_by_code`; pass `normalizedCode` to both `mapSessionFromDb` calls (`:985`, `:1035`) |
| `src/app/data/api.ts:1043-1057` | `getClaritySession` → `get_session_by_code` RPC |
| `src/app/data/api.ts:1201-1234` | `getActiveSessionByCode` → `get_active_session_by_code` RPC; grace/ended logic deleted from JS (now server-side) |
| `src/app/data/api.ts:1326-1391` | `subscribeToClaritySession`: `knownCode` parameter; re-fetch select list (Decision 5) |
| `src/app/data/api.ts:4084-4092` | `getOpenLiveInviteForUser`: drop `code` from the embed; resolve via `get_room_code_for_invite` |
| `src/app/data/api.ts:4308-4313` | `getOpenInviteForSender`: same |
| `src/app/hooks/useOpenLiveInvite.ts:123-129` | Drop `code` from the select; resolve via the RPC. Note `:143-153` raises a Sentry warning when `code` is missing — that branch must not become the normal path |
| `src/app/data/events-service-real.ts:826-836` | `getPracticeRooms` — pending Decision 6 |
| `src/app/data/events-service-real.ts:874-887` | `openPracticeRoom`: drop the embed, splice the caller's code |
| `src/app/pages/clarity-live-page.tsx:1076, 1159` | Pass the known code to `subscribeToClaritySession` |
| `src/app/pages/clarity-demo-page.tsx:68` · `clarity-chat-page.tsx:371` · `src/hooks/use-active-session.ts:84` | Same; pass `''` explicitly where no code is available |
| `scripts/prod-smoke-test.mjs` | Add the `select=code` 403 canary (step 8 — session-coupled) |
| `docs/technical/database.md:96-102` | The documented `getPracticeRooms` embed pattern changes; update or it becomes a stale instruction |

#### Not modified — verified in scope and clear

`supabase/functions/**` (zero `clarity_sessions` references), `services/transcribe/pipeline.py`
(docstring only), `scripts/copy-prod-to-test.mjs` (write), `scripts/progress-refresh.sh`
(anon key but `select=id`), `.claude/commands/slava/maintain/analyze-transcripts.md` (service_role),
`sessions-service.ts` (explicit select, `code` absent), and all 62 `e2e/` files that read
`clarity_sessions` (every `code` projection is `supabaseAdmin`).
