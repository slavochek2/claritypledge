---
status: week
type: task
rank: 1000063
workstream: keyring
created_date: '2026-09-01'
tags: [security, credentials, least-privilege, supabase]
related: [p1148, p1186, p998, p1189]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1214: Shrink the credential set and the standing privilege that agents can reach

## Problem

**Situation:** An adversarial review of the local agent setup (2026-09-01) found that any agent
with a shell reads every credential on the machine and reaches the open network; write-fencing is
the only confinement in place. The founder's response was not "add a sandbox" but a better
question:

> "its sot painful to ratotate all and even if i ortate then i rotate agian or what? its forever
> rotation - why not somthing sutianalbe so i rotate less?"

**Complication:** Four measurements taken this session say the set itself is the problem, not the
rotation mechanism.

1. **~~A known-leaked production master key is still live.~~ WITHDRAWN — the key is dead.**
   An earlier draft of this spec asserted the leaked prod `service_role` key was still enabled,
   reasoning from two unticked checkboxes in `pp/tasks/p46` and from the Management API still
   *listing* a `{"id":"service_role","type":"legacy"}` entry. Both were misread: `projects
   api-keys` returns key material regardless of whether legacy JWT auth is disabled, and p46's
   checklist section is superseded by its own Outcome section ("CLOSED, leaked key confirmed
   dead"). Probed directly 2026-09-01 — the legacy key returns **401 on 5/5** against prod REST.
   Recorded rather than deleted because the misread is the reusable lesson, and p46 states it
   outright: *"Do not trust `status: done` on a credential task; trust the 401."* The same applies
   to `type: legacy` in an API listing. **Phase 0 is removed from this spec.**

2. **The credential set carries dead weight.** `scripts/audit-credential-drift.sh --audit` run
   2026-09-01 with the full argument set `/weekly` uses (`--env-dir`, two `--registry`, six
   `--consumers-dir`; the bare form exits 2) reports 101 classified credentials, **28 retirement
   candidates**, 48 stale consumer lists, `COVERAGE:84/86`. It exited 0 — which means **no
   registry row held an inline plaintext value**, the script's one hard-fail class. Exit 0 is not
   "clean": every finding above is informational by design. It also reports `CONSUMER_LIST_STALE:
   PROD_SUPABASE_SERVICE_ROLE_KEY:documented=0:live=13` and `MULTI_KEY_ROW_BUNDLED:
   PROD_SUPABASE_SERVICE_ROLE_KEY/TEST_SUPABASE_SERVICE_ROLE_KEY` — the prod and test master keys
   share one registry row. That is shared *metadata* — the audit does not show the two values are
   conflated or that one operation would overwrite both. It is the shape
   [P1148](p1148_credential_rotation_system.md) names as its first design constraint, not proof
   the hazard has fired.
3. **Some reach for the master key is over-privileged, but the exact split is not yet known.**
   18 skills read `PROD_SUPABASE_SERVICE_ROLE_KEY` — but "skill" is the wrong unit, and an
   earlier draft of this spec used it. `.claude/commands/slava/` is the single source of truth;
   `.agents/skills/` is a **generated, committed projection** of it (`scripts/sync-agent-skills.sh`,
   P1151) whose header reads *"NEVER hand-edit anything under `.agents/skills/` — regenerate."*
   Both trees hold 18 key-readers; 99 pairs are byte-identical, 2 have drifted (`kdd`, `note`),
   24 sources have no twin. A Done-When grepping the projection would have passed while an agent
   edited generated files the next sync reverts. **The unit is a consumer FILE under
   `.claude/commands/slava/` or `scripts/`, never a "skill".** Six issue a direct write (`-X POST|PATCH|PUT|
   DELETE`). At least five more write *indirectly*: they shell out to
   `scripts/event-photo-prep.sh`, which uploads to Supabase storage with the master key at
   `scripts/event-photo-prep.sh:122`. **An earlier draft of this spec claimed "12 of 18 are
   read-only" on the strength of the direct-write grep alone; that number was wrong and is
   withdrawn** — grep cannot see a write that happens behind a shell-out, an RPC, or a
   `supabase-js` call. What is verified: `/day-cp` reads `profiles?select=id,name,email` daily
   with an RLS-bypassing credential to produce activity counts, and that read needs no write
   privilege. Establishing the real split is the first task of Phase 1, by reading each consumer,
   not by grepping them.

4. **Eight consumers are not skills at all, and no earlier draft reached them.**
   `scripts/create-event.ts`, `scripts/seed-webinars.ts`, `scripts/bootstrap-align-agent.mjs`,
   `scripts/update-webinar-descriptions.ts`, `scripts/event-photo-prep.sh`, and three under
   `scripts/archive/migrations/`. The archive three are dead code still carrying a live-key read —
   the retirement-candidate shape this spec looks for, in a directory it never enumerated.

**Question:** What has to change so that a leak is a smaller event and rotation becomes rare
rather than perpetual?

## Appetite

**Blast radius: high.** Phase 0 disables live production API keys and forces a frontend redeploy;
a mistake is user-visible immediately. Later phases touch 18 skills and the credential registry.

**Reversibility: mixed, and that is the design constraint.** Creating a scoped role, editing a
skill and updating the registry are all revertible. **Disabling legacy API keys is not** — and
deleting a retired credential is not. Every irreversible step must follow a verification step,
never precede it.

**Decision density: low.** The architecture is decided ([decisions.md](../docs/decisions.md)
2026-08-28 [infra]); the de-privileging pattern is proven in
[P901](done/2026-04-22/p901_second_operator_event_promotion.md). No founder call is outstanding.

## Invariants

- **This spec performs no irreversible step at all.** No deletion, no revocation, no provider-side
  disable. If a phase appears to require one, it belongs to
  [P1148](p1148_credential_rotation_system.md) instead. Added after review found that marking a row
  retired and then removing its value puts the irreversible action after a *bookkeeping* mutation
  rather than after a successful run of the real consumer without the credential.
- **A credential this spec CREATES is registered before it carries traffic.** The non-destructive
  boundary forbids deletion but not minting, which opens an orphan class neither spec owned: a
  newly-minted, in-use, unregistered, unrotatable credential.
  [P1148](p1148_credential_rotation_system.md)'s non-goal is *"Do NOT rotate anything absent from
  the registry"*, so an unregistered new principal is permanently outside the rotation system.
  Every credential minted here gets a row in `.private/docs/accounts.md` and an explicit
  `manual-only` declaration with a reason, at mint time — not later.
- **Enumeration is not verification — but the evidence differs by verdict, and an earlier draft
  conflated them into one unsatisfiable rule.**
  *De-privileged* consumer: the evidence is that consumer running successfully on the reduced
  credential, with the master key unset. Available, so required.
  *Retired* credential: there is no consumer left to run, so the "run it without the credential"
  evidence does not exist — and the 401 that p46 calls the real proof is produced only by
  revocation, which this spec forbids. **Retirement therefore closes on a liveness probe, not on
  a run:** the row records its current expectation (200 today), and the probe flips to 401 when
  P1148 revokes. Until then the credential is monitored rather than dark. A retired row with no
  probe is not retired, it is forgotten.
- **A "retirement candidate" is a shortlist, never a verdict, and text search cannot clear it.**
  The audit scans this repo only; `CRD_PIN` appears in the 28 and is live, consumed from the
  founder's global config. But cross-repo grep is also insufficient — a credential can be absent
  from every file and still installed in Vercel, GCP Secret Manager, GitHub Actions secrets, a
  launchd job, a deployed container revision, a provider dashboard, or another machine. p46 hit
  exactly this: the effective frontend credential lived in **Vercel**, not in the apparent local
  source. Every retirement verdict must name which *deployed* surfaces were enumerated live, not
  only which directories were grepped.
- **Credential identity is `(name, surface, value-fingerprint)`, never `name`.** One name holds
  different live values across env files; `MULTI_KEY_ROW_BUNDLED` proves the registry already
  conflates two. Carried from [P1148](p1148_credential_rotation_system.md).
- **Fix the class, not the instance.** Before closing a finding, state whether the fix closes the
  class or one case of it — [decisions.md](../docs/decisions.md) 2026-07-17, recorded after a
  de-privileging pass that read as complete while a legacy-ACL route stayed open.

## Solution

**This spec is now non-destructive by construction.** Adversarial review (Codex, 2026-09-01)
established that it otherwise deadlocks with [P1148](p1148_credential_rotation_system.md): P1214
would create, swap and delete credentials while the spec that builds the safety machinery for
exactly those operations waits for P1214 to finish. The resolution is a boundary, not an order —
**P1214 never deletes or revokes anything. P1148 owns every irreversible step.** Both can run in
parallel.

**Phase 1 — establish the true read/write split, per consumer file.** Enumerate every file that
reads the key under `.claude/commands/slava/` (the source tree) **and** `scripts/` (including
`scripts/archive/migrations/`), and record a verdict naming the write form found (direct HTTP
verb, shell-out, RPC, client library, storage upload) or stating none. Grep cannot do this:
`scripts/event-photo-prep.sh:122` POSTs to prod storage with the master key, and five promote
skills reach it by shell-out with no matching verb in their own text. Never edit
`.agents/skills/` — it is generated; change the source and re-run `scripts/sync-agent-skills.sh`.

**Phase 2 — REDUCED IN SCOPE after review. Read this before starting it.**

Adversarial review (Opus, 2026-09-03) steelmanned the null option and it lands: **under the
threat model this spec states, moving one consumer to a scoped credential reduces expected loss
by approximately zero.** The adversary is an injected local agent that already has shell and
reads every credential on the machine. It reads `PROD_SUPABASE_SERVICE_ROLE_KEY` out of
`.env.local` (72 keys) regardless of what `/day-cp` presents, because six direct-write skills,
`scripts/event-photo-prep.sh:122`, and four non-skill scripts keep the master key in that file
either way. Swapping one consumer's credential changes *which credential one consumer presents*.
It does not remove the key from the machine, and **removing the key from the machine is the only
move that changes the outcome for the stated adversary.**

So Phase 2 is worth doing only as *the path to that removal*, never as a win by itself. The
success condition is not "`/day-cp` uses a scoped key" — it is
**`PROD_SUPABASE_SERVICE_ROLE_KEY` no longer present in `.env.local`**, which requires every
consumer off it. Phase 1's per-consumer verdicts are what size that. If the write-side consumers
turn out to be immovable, Phase 2 should be abandoned rather than half-done: a scoped key for the
readers plus the master key still on disk is pure motion, and it adds a credential to rotate.

Phase 2 also defends a narrower scenario worth naming honestly — one consumer compromised in
isolation, without machine-wide shell — but that is a different and weaker threat than the one
this spec opens with.

**The replacement goal, and the bill for it.** Not "de-privilege `/day-cp`" but
**`grep PROD_SUPABASE_SERVICE_ROLE_KEY .env.local` returns nothing.** That is the only version
whose benefit survives the threat model, and it has the useful property that it cannot be
satisfied by editing a generated mirror. Because the key stays in the file for whoever has not
moved yet, **only the last consumer's migration produces any security benefit** — so the *total*
is the unit of work, and this phase must be sized on the total rather than on "one skill, then
the rest".

- **Read half → candidate (d).** The counts artifact. Free, and it moves `/day-cp` and `/weekly`
  off the data plane entirely.
- **Write half → candidate (b).** One edge function per *operation*, not per caller — collapsing
  6 direct-write skills (×2 trees = 12 files), 5 shell-out promote skills,
  `scripts/event-photo-prep.sh`, and 4 non-skill scripts into roughly **four functions**: storage
  upload, event create/update, point/story mutation, test-user cleanup. Callers then present a
  credential authorizing *an operation*, never the database. The 3 archive migrations are deleted,
  not migrated.
- **Sequence:** read half first (it is free), then one write shape at a time, each proven before
  the next.

Four functions plus one artifact is materially more than the phase originally described. That is
the honest price of the only version that pays.

**Original framing follows.** The mechanism is an open question, not
a decision (below). Whatever is chosen must be demonstrated on `/day-cp` — the daily consumer, and
the one whose reads (`profiles?select=id,name,email`) least need RLS bypass — before any second
consumer moves. **Any credential this phase mints is registered in `.private/docs/accounts.md`
and declared `manual-only` with a reason before it carries traffic** (see Invariants).

**Phase 3 — retire on paper, not on the provider. This is the phase that answers the question
that started this work** (*"why not something sustainable so I rotate less?"*): 28 of 72 keys is
up to a ~39% reduction in both the loot on disk and the rotation surface, and it is the only phase
whose benefit scales directly with the stated threat model. For each of the 28 candidates: search cp, pp,
the global config **and the deployed surfaces** (below), then mark the registry row retired and
remove the credential from active use. **Do not delete the value and do not revoke it at the
provider** — that is P1148's escrow-and-rollback path, and it is the step with no undo.

**Phase 4 — unbundle the registry.** Split the prod/test master-key row into one row per
credential and repair the 48 stale consumer lists. Reversible, but **NOT independent** — an
earlier draft called it independent and that was wrong. `.private/docs/accounts.md` is a shared
mutable resource: [P1148](p1148_credential_rotation_system.md)'s driver resolves `coupled_with`
and its consumer list from the very rows this phase rewrites. Splitting a row mid-rotation —
after `mint`, before `verify` — leaves P1148's rollback pointing at a row identity that no longer
exists, so it either no-ops with a half-written key, or re-creates the merged row and silently
reverts this phase. **Run Phase 4 only with no in-flight P1148 run, and have P1148 fingerprint
the registry rows it started from and abort on change** — it already has the fingerprint concept
for values; this applies it to the registry.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A retirement candidate is live in a deployed surface no text search reaches | MITIGATE | Live enumeration of Vercel, GCP Secret Manager, GitHub Actions, launchd and provider dashboards, named per verdict. p46 found the real frontend credential in Vercel |
| A custom read role inherits an RPC escalation path | MITIGATE | Table-level SELECT does not make a role read-only: Postgres grants function EXECUTE to `PUBLIC` by default and this repo has `SECURITY DEFINER` functions that mutate. Any new principal must be run through the existing function-grant drift check and have its allowed/denied RPC set tested before it carries traffic |
| A retired-but-unrevoked credential becomes an unmonitored liability | MITIGATE | Phase 3's output still authenticates, appears in no consumer list, and stops triggering `CONSUMER_LIST_STALE` — so a leak of it breaks nothing visible and raises no drift finding, unlike the master key. Every retired-not-revoked credential is listed in the handoff to P1148 with a date, and that list is a standing `/weekly` item until the queue is empty |
| "Parallel" is asserted but not scheduled, so the retired-not-revoked window is unbounded | MITIGATE | P1214 is `status: week`; P1148 is `status: backlog`. Nothing schedules the revocations this spec hands off. Either promote P1148 out of backlog when the first retirement verdict lands, or accept the window explicitly with the liveness probes above as the compensating control |
| A phase edits the generated `.agents/skills/` tree and the next sync reverts it | MITIGATE | Phase 1 names the source tree explicitly; `scripts/pre-commit-checks.sh` already runs the sync check |
| A scoped read credential still exposes the full email dataset | ACCEPT | `/weekly` reads `profiles?select=email` with no row filter, so column scoping bounds integrity and cross-table reach but not privacy for that field. Row-scoping the reporting reads is out of scope here; noted so the next spec does not read this as solved |
| The read/write classification is wrong again, and a skill moved to the read role silently loses a write | MITIGATE | Classification is per-skill reading, not grep; each migrated skill is run once against prod before the next is moved. The first draft of this spec already got this wrong — treat any grep-derived split as unverified |
| A scoped read role is missing a column a skill needs | MITIGATE | Migrate one skill, run it, then the rest — `/day-cp` runs daily and surfaces a gap within a day |
| The new read role drifts back toward broad grants | ACCEPT | The function-grant and RLS drift checks already run in `/day-cp`; no new mechanism until drift is observed |
| Vaulting/encrypting what remains | DEFER | Depends on the surviving set; revisit after Phase 2 with a real count |

**Non-Goals**
- Do NOT rotate the Supabase JWT **signing** key — explicitly rejected 2026-08-28; it signs user
  sessions and is unrelated to API-key exposure.
- Do NOT delete, revoke, or provider-side disable ANY credential in this spec. Retirement here
  means "marked retired and no longer used". The irreversible half is
  [P1148](p1148_credential_rotation_system.md)'s, and it has the escrow and rollback machinery
  for it. This is the boundary that breaks the deadlock the review found.
- Do NOT rotate the frontend or the legacy keys — that work completed in `pp/tasks/p46` on
  2026-08-28 and is verified dead (401 on 5/5, re-probed 2026-09-01).
- Do NOT sandbox or containerize the interactive agent session — evaluated 2026-09-01 and
  rejected: it needs the repo, MCP servers and browser, and would still hold the same credentials.
- Do NOT change RLS policies. This is credential scope and lifetime only.

## Done-When

- [ ] Every consumer FILE that reads the key carries a written read/write verdict derived from
      reading it, naming the write form found (direct, shell-out, RPC, client library) or stating
      none — covering `.claude/commands/slava/` AND `scripts/` including `scripts/archive/`
- [ ] `grep -rln "PROD_SUPABASE_SERVICE_ROLE_KEY" .claude/commands/slava/ scripts/` returns only
      files whose verdict is write; `/day-cp` is not among them
- [ ] `git diff --stat .agents/skills/` shows only changes produced by
      `scripts/sync-agent-skills.sh`, never a hand edit
- [ ] Every credential minted by Phase 2 has a registry row and a `manual-only` declaration dated
      before its first use
- [ ] `/day-cp` completes its user-activity block using the scoped read key, with the master key
      unset in the environment
- [ ] Each of the 28 retirement candidates carries a written verdict (retired | live-elsewhere)
      naming the consumer AND which deployed surfaces were enumerated live — not only which
      directories were grepped
- [ ] No credential value was deleted and nothing was revoked at any provider by this spec
- [ ] Every credential marked retired carries a liveness probe with its current expected status,
      and the handoff queue to P1148 is a standing `/weekly` item until empty
- [ ] The de-privileging mechanism chosen in Phase 2 is demonstrated on `/day-cp` with the master
      key unset, and its principal's allowed/denied RPC set is recorded
- [ ] `audit-credential-drift.sh --audit` reports no `MULTI_KEY_ROW_BUNDLED` for the
      prod/test service-role pair, and `CONSUMER_LIST_STALE` for
      `PROD_SUPABASE_SERVICE_ROLE_KEY` shows `documented` matching `live`

## Open Questions

1. **What mechanism can actually de-privilege a PostgREST read? The obvious one does not exist.**
   The first draft proposed "a read-only Postgres role plus its own `sb_secret_…` key". Review
   refuted it and the vendor docs confirm: secret keys authorize as the built-in `service_role`,
   which holds `BYPASSRLS` and full data access. New-format keys are independently *revocable*,
   never independently *privileged*. Candidates not yet assessed:
   (a) ~~a scoped Postgres user over the direct connection (`SUPABASE_DB_URL`)~~ — **assessed and
   rejected 2026-09-03.** The URL exists, but `psql` is not installed and
   [decisions.md](../docs/decisions.md):14318 records it as a rejected alternative
   ("do not install"), so the transport is Node or the Management API — and the latter
   authenticates with `SUPABASE_ACCESS_TOKEN`, a *higher*-privilege meta-credential than the one
   being de-privileged. The role would also need clearing against **162 migrations containing
   `SECURITY DEFINER` and 266 `GRANT`/`REVOKE EXECUTE` statements**, and its password cannot be
   minted without the plaintext crossing the session transcript. Net: trades a PostgREST
   credential for a direct-DB one with no RLS, no column filtering and DDL capability — a
   *larger* blast radius if leaked;
   (b) **an edge function exposing only aggregate counts — viable, and stronger than first
   written.** The caller gets an integer and holds *no data-plane credential at all*; the function
   holds the key server-side through platform-injected values, which are swapped by the platform
   rather than hand-rotated. It needs no RLS change, mints no Postgres principal, puts no secret
   through the session transcript, and `supabase/functions/` is already an audited
   `--consumers-dir` so it is inside the drift check on day one. It also **closes** the
   full-email-dataset risk this spec currently ACCEPTs, because a counts endpoint returns no rows.
   Cost: one deploy;
   (c) ~~publishable key + RLS reporting view~~ — **rejected.** Requires amending the "do NOT
   change RLS" non-goal, and `public.profiles` carries an actively-churning policy stack — five
   migrations touch it, including one dated 2026-09-03. Highest regression risk, for an outcome
   (b) delivers without touching RLS;
   (d) **no new credential at all — the strongest, and unconsidered until review.**
   `.github/workflows/db-backup.yml:66` ALREADY runs
   `psql "$DB_URL" -tAc "SELECT count(*) FROM public.profiles"` on a schedule, authenticating with
   `secrets.SUPABASE_DB_URL` — a GitHub Actions secret this spec's own audit invocation declares
   the local agent cannot read (`--not-enumerated "ci-secrets: … HTTP 403 by design"`). Extend
   that job to emit a counts artifact; the skills read the artifact. Zero credentials minted, zero
   local data-plane credential, and the query runs as a principal already outside the threat
   model. Weakness: counts are as fresh as the last run — acceptable for a *daily* report. This
   candidate exists only because review reframed the question from "which credential should
   `/day-cp` use" to **"does `/day-cp` need to query prod at all"**.

   **Recommendation: (d), falling back to (b) where freshness matters. (a) and (c) are rejected
   with evidence above.**
   **Phases 1, 3 and 4 stand on their own. Phase 2 does not, and may be dropped entirely —
   see the scope note in Solution.**
2. Does the vault / timed-unlock idea belong here or in
   [P1148](p1148_credential_rotation_system.md), whose title already claims "vault"? The session
   finding was that an unlock window gates a *state* rather than an *action*, so it does not
   inherit `push-on`'s guarantees. Now leaning P1148, since that spec owns the irreversible half.
3. Should `TEST_SUPABASE_SERVICE_ROLE_KEY` (still legacy `eyJ…`) migrate in the same pass, or
   after? Not assessed.

## Related

- **Predecessor (complete):** `pp/tasks/p46` — legacy keys disabled, leaked key verified dead.
  Its unticked checklist is stale; its Outcome section is authoritative.
- **Peer, not successor:** [P1148](p1148_credential_rotation_system.md) — owns every irreversible
  credential operation, including the deletions this spec deliberately stops short of. Runs in
  parallel behind that boundary. Its own blocker P1147 shipped 2026-06-10.
- **Review:** Codex hostile review 2026-09-01 rejected the first draft (stale production premise,
  unbuildable Phase 1 mechanism, false 12-of-18 sizing, irreversible steps ahead of their
  safeguards). This revision answers all four.
- **Pattern precedent:** [P901](done/2026-04-22/p901_second_operator_event_promotion.md) —
  de-privileged the promote skills from service-role to anon.
- **Same class, different surface:** [P998](p998_shared_sa_remaining_consumers.md) (GCP shared
  service account), [P1189](done/2026-06-10/p1189_generate_banner_uses_db_master_key_as_shared_secret.md)
  (master key used as a service-to-service shared secret) — **shipped during this session**, so the
  same-class instance it fixed is closed; the class is not.
