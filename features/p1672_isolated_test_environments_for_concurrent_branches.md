---
status: week
type: task
rank: 333
workstream: infrastructure
created_date: '2026-11-13'
tags: [test-server, self-hosted, edge-functions, concurrency]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1672: Concurrent branches get isolated TEST lanes, not one shared server

## Problem

**Situation:** Every branch tests against one self-hosted TEST server: one database, one edge-functions
volume, one set of cron jobs and vault secrets. The function deploy ships the deploying checkout's whole
tree. A full deploy prunes every function the checkout lacks. A single-function deploy still replaces all
of `_shared`, the shared import map, the router and the JWT list. Every deploy recreates the functions
container (`scripts/selfhosted/deploy-functions.sh:353-375, 411-417`). Every landing on main that touches
function inputs full-deploys main's tip (`scripts/selfhosted/lib/deploy-on-land.sh`).

**Complication:** Two open branches with **no function directory in common** keep erasing each other.
- **P1631** adds `clarify-draft`, which is called from the browser.
- **P1529** changes `dispatch-event-emails` (fired by a database cron job), `send-event-emails`,
  `request-letter-response-signin` and 13 `_shared` files.
- A P1529 full deploy prunes `clarify-draft`. Any P1631 deploy puts main's `_shared` back over P1529's.

The P1529 session logged on 2026-11-11: *"TEST functions overwritten by P1653 and P1631: this caused the
canvas-draft 409 'terms' and drafts stuck queued. Fixed by redeploying each time."* The 2026-11-05
decision (P1312) chose "detect, do not prevent". It deferred "a server per branch or a deploy lease ...
until the receipts show evidence runs regularly waiting on redeploys". That evidence now exists.

**Functions are only the most visible shared piece.** The schema is shared too:
- No table or function is defined by both branches, but P1631 re-defines 4 of main's database objects and
  P1529 re-defines 11, on the server every other branch uses.
- `migrate.sh` cannot see this. It only checks that nothing local is pending
  (`scripts/selfhosted/migrate.sh:141-166`) and never flags extra versions another branch applied.
- Today the main lane receives landed migrations **only because branches apply them while they are being
  built**. Neither the landing hook nor `/ship` applies migrations to TEST.
  - `deploy-on-land.sh` deploys functions only.
  - `/ship` migrates prod.
  - `check-test-drift.sh` only warns (`scripts/git-ops.sh:5702-5706`).

**Why hosted Supabase never showed it:** the hosted deploy ran `supabase functions deploy <fn>` per
function (`scripts/deploy-functions.sh:207`). That bundles each function with its own copy of `_shared`
and deletes nothing, so two branches clashed only when both changed the same function. The self-hosted
volume (P1557, 2026-10-28) shares one `_shared` and prunes, so every deploy now hits everyone.

**Question:** How do two or more active branches test at the same time, without redeploying over each
other, and without a landing on main disturbing them? That has to cover database changes and cron-driven
paths too.

> Founder framing, verbatim: "This over deploying and removing something from test server is a continuous issue ... It seems to be that P1631 and P1529 are competing for test server and like deploying and removing and deploying and removing and functions are not working and we cannot test. How do we structurally solve this issue?"
>
> On going ahead: "i'm okay with this let's go forward in the best way possible ... if we need to upgrade server to something bigger you can let me know"
>
> On how it should feel: "I want to continue working on them and not think about what you do and when you're finished then the whole thing works."

## Appetite

**Blast radius: high.** It touches every branch's test loop, the function deploy, `migrate.sh`, the
landing hook, the E2E admission lock and the TEST resolver.

**Reversibility: medium.** Lanes are additive containers on the existing VM. The main lane keeps serving
every worktree throughout. The script changes, though, are shared by every session.

**Decision density: low.** The founder settled both open calls on 2026-11-13 (below). The one deliberate
destructive step, the main-lane baseline cleanup, asks for the founder's OK at the moment it runs.

## Decisions

- **D1 (founder, 2026-11-13): no interim lease; one lane first.** All four spec reviewers judged a
  whole-server lease not worth building: old checkouts ignore it, it starves landings, and it leaves one
  branch's schema behind for the next.
  - Stage 1 builds a single lane and puts the cron-driven branch (P1529's kind of work) on it. That is the
    case the shared server structurally cannot test.
  - Browser-only branches stay on the main lane until stage 2.
  - The founder's sessions keep working unchanged meanwhile.
- **D2 (founder, 2026-11-13): lanes answer only on the founder's private network (Tailscale).** The Mac
  and the TEST VM are both already on it. The main lane stays as reachable as it is today. A cloud-run
  agent or CI job cannot use a lane unless its machine joins the network.
- **D3: the word is "lane", not "slot".** "Slot" already means a worktree (`wN`) and a P1607 E2E admission
  slot (`scripts/lib/e2e-slot-lock.mjs`).

## Invariants

- **Prod is unreachable from all of this.** No lane command, resolver or script path may target prod or
  hosted TEST. Hosted TEST stays off by default, and switching it on is the founder's act (decisions.md
  2026-11-03, "Hosted TEST is switched off by default", P1606).
- **A claimed worktree fails closed, never falls back.** A worktree whose lane claim is released, expired,
  failed or unknown refuses to run, deploy or migrate. It never silently uses the main lane, because
  fallback makes a missing deploy look like a pass.
  - An **unclaimed** worktree, which is the default for client-only branches, uses the main lane exactly as
    today.
- **The landing hook always targets the main lane**, whichever worktree runs it and whatever that worktree
  has claimed.
- **A lane never calls another environment.** Before the lane takes any request, every outbound address a
  lane's database or functions can use points at that lane's own gateway. That covers vault URLs, trigger
  targets, function env and the edge-functions' own Supabase URL. A cloned database carries main's values
  until rewritten. Until the rewrite is verified, the lane stays quarantined: no cron, no
  trigger-fired HTTP and no client access.
- **No migration replay from empty and no committed dump.** The chain cannot build from empty
  (decisions.md 2026-08-20; P1132, P1538). The P1557 schema dump stays private and off git.
- **A lane emails nobody but the founder.** Auth mail goes to the sink (decisions.md 2026-10-28). Event
  mail, which calls the mail provider's HTTPS API directly (`supabase/functions/_shared/email-helpers.ts:578`)
  and bypasses the SMTP sink, passes through a recipient guard in a lane: only the founder's addresses are
  delivered, and everything else is captured.
- **TEST-only credentials only** (decisions.md 2026-10-29). A lane gets its own JWT secret and keys, and
  never anything from prod.
- **One answer per worktree for "which TEST environment".** Every consumer reads it from one place. This
  changes P1591's single resolver (decisions.md 2026-10-29) from one shared answer to one answer per
  worktree, with the main lane as the answer for every unclaimed worktree.

## Solution

### Stage 1: one lane, the protocol, and the main lane kept current

**A lane** is a trimmed second self-hosted Supabase stack on the same VM. It is its own compose project
with its own network, container names, volumes and ports, reached through the existing Caddy at its own
hostname, which answers only on Tailscale (D2).
- **It contains:** Postgres (with cron, net and vault), auth, PostgREST, realtime (with its own tenant),
  storage (with its own empty volume), the edge runtime, the gateway, and meta. Meta stays because the
  raw-SQL E2E helper runs through it (`scripts/selfhosted/run-test-sql.sh:20,55`).
- **It leaves out** studio and imgproxy.
- **It has its own JWT secret, anon key and service key**, so a token minted on the main lane does not
  work on a lane, and the reverse.

**Lane lifecycle and ownership.**
- **States:** `provisioning → ready → draining → free`, plus `failed`.
- **Allocation:** atomic, through a lock held on the VM, which is the authority. A lock in one checkout's
  git dir does not count.
- **Generation token:** each claim carries one, so a process from an earlier claim cannot write after the
  lane is reassigned.
- **Before reuse:** release drains the lane (connections, functions, background work).
- **Reclaim:** a lane is reclaimed on lease expiry with a heartbeat. It is never reclaimed because a branch
  looks gone: unpushed local branches would read as gone. An unreadable inventory reclaims nothing.

**The per-worktree answer.**
- **Where it lives:** the claim is recorded per worktree in the git common dir. It is **never** written
  into the env files: each worktree's `.env.test.local`, `.env.local` and `.env.development.local` are
  symlinks to main's (`scripts/setup-worktree.sh`), so writing one would repoint every worktree.
- **What it answers:** `{lane: main | lane-N, origin, keys}`.
- **Who reads it:** every consumer of the TEST target. That is the dev server, Playwright, `migrate.sh`,
  the function deploy, `run-test-sql.sh`, `supabase-readonly-sql.py`, `branch-functions-check.sh`,
  `deploy-drift.sh`, `health.sh`, `upkeep.sh`, the DB-latency check, the E2E SQL helper and both E2E
  locks. `/dev` greps the full list. Hard-coded container names (`supabase-edge-functions`,
  `supabase-db`, `supabase-meta`) become per-lane values.

**Making a lane ready.**
1. **Quarantine** the empty lane: cron off, `net` requests blocked, no client route.
2. **Copy** the main-lane database into it, server side. The copy method is chosen and proven in `/dev`,
   and it must reproduce owners, ACLs, default privileges, RLS policies and security-definer functions
   (P1538: a green restore had 299 wrong ACLs).
3. **Re-create vault entries** from the main lane's own `vault.decrypted_secrets`, read on the server and
   never printed. The Mac secrets file is not the source: several entries were generated on the server
   and exist nowhere else (decisions.md 2026-10-29). Rewrite the URL-valued entries to the lane's origin,
   and the key-valued entries to the lane's own keys.
4. **Clear inherited runnable work** (dispatch, transcription and Mirror queues, scheduled sends).
5. **Apply** the branch's migrations and **deploy** its functions.
6. **Lift the quarantine** only after the outbound-address check passes. Repeat the check after any later
   branch migration, because a migration can add a schedule or trigger.

**Services a lane does not isolate in stage 1.** Each is left unconfigured in a lane, so it fails with a
clear "not available in a lane" message instead of reaching main:
- **Transcription.** The external worker reads its own fixed Supabase URL and service key
  (`services/transcribe-room-batch/config.py`), so it would act on main's jobs.
- **Voice notes.** The cloud bucket's paths carry no environment segment, so a lane's retention sweep
  could delete main's objects (`supabase/functions/chat-voice/handler.ts`).

Branches that need either keep the main lane.

**Inherited storage rows.** Rows that reference main's bytes are not copied. A lane's own uploads work,
and tests create their own fixtures.

**The main lane, kept current and protected.**
- **The landing hook applies main's newly landed migrations to the main lane** under the same lock and
  failure record as the function deploy. Without this, once branches migrate their own lanes, the main
  lane, and every lane cloned from it, falls behind main.
- **The E2E admission lock** (P1607, `SELFHOSTED_SLOT_LIMIT = 3`) becomes:
  - a **VM-wide capacity limit**, because CPU is shared;
  - **per-lane exclusivity and leftover sweep**, because databases are not shared.

**First user.** The cron-driven branch moves onto lane 1. When the founder's P1529 session next deploys
or tests, it is pointed at lane 1, with no action from the founder (D1).

### Stage 2: second lane, clean baseline, protected main lane

- **A second lane**, so a browser-only branch with function changes (P1631's kind) leaves the main lane.
- **Main-lane baseline cleanup.** Make the main-lane migration ledger equal main's migration files, with
  no versions applied by unlanded branches. It runs only once no active branch depends on the main lane
  for unlanded schema. It is destructive on shared TEST, so it waits for the founder's OK at the time it
  runs (db-access.md).
- **Server-side refusal on the main lane.** The VM refuses a function deploy or migration aimed at the
  main lane unless it comes from main's landing or an explicit main deploy. It holds whichever script
  version a checkout runs, because the refusal lives on the server.
- **Capacity.** Measure two lanes plus the main lane under concurrent E2E. P1607 measured 3 runs on one
  stack at about half of the 4 CPUs. Recommend the VM upgrade to the founder only if the measurement
  shows contention.

**The acceptance demonstration, run at the end of stage 2:**
- Two branches run in two lanes at the same time.
- One processes its own fixtures through its real scheduled dispatch.
- The other runs a branch-only browser-called function.
- A landing on main during both runs changes neither lane's served functions nor its schema, and does
  bring the main lane forward.

## Alternatives Considered

| Option | Verdict | Why |
|---|---|---|
| **Per-branch function overlay on the shared server, selected by a request header** (first proposal) | Rejected | Gemini, Codex and GLM each rejected it. Checked by command:<br>(1) Browsers send no custom header value on the CORS preflight, so a branch-only function's preflight lands on main's tree and fails. The router creates a worker for OPTIONS too (`supabase/selfhosted/functions-main/index.ts:93-118`).<br>(2) P1529's dispatch is fired by a cron tick that reads one vault URL (`supabase/migrations/20260907170000_p1256_cron_tick_sends_jwt_and_secret_header.sql:42-66`).<br>(3) The JWT list is loaded once at router start (`index.ts:26-40`).<br>(4) Any reachable client could pick unreviewed branch code holding the TEST service key.<br>(5) The schema stays shared. |
| **Whole-server lease as an interim phase** (first draft of this spec) | Rejected (D1) | All four spec reviewers rejected it:<br>- Old checkouts and `migrate.sh` ignore a checkout-local lease.<br>- It has no owner model across separate commands.<br>- The landing redeploy waits 300 s for the lock and gives up at 1200 s (`deploy-on-land.sh:33,82`), so landings starve.<br>- It leaves one branch's schema for the next. |
| Per-branch edge-runtime container, shared database | Rejected as end state | Cron, queues and schema stay shared. |
| Each worktree runs functions locally against the shared TEST database | Rejected | Same shared-schema and cron gap. Cloud cron cannot reach a laptop. |
| Lanes in local Docker on the Mac | Rejected | The founder chose the server path. Lanes would compete with parallel AI sessions for memory and stop when the Mac sleeps. |
| Hosted Supabase preview branches | Rejected | Paid per branch-hour. Needs a push per test cycle. Hosted TEST is off by founder rule. Fit with the custom router is unverified. |
| Merged integration branch | Rejected | Couples branches through merge conflicts. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The copy reproduces the schema but not permissions | MITIGATE | Catalog comparison (owners, ACLs, default privileges, RLS, security-definer) between the main lane and a fresh lane, as P1557 did. |
| Vault ciphertext copied without its key decrypts to NULL, and every reader degrades to a quiet "skipping" warning | MITIGATE | Vault entries are re-created from decrypted values, never copied as ciphertext. The check reads them back by effect: the dispatch tick reaches the lane. |
| A trigger fires HTTP during restore or migration, before cron is even on (`supabase/migrations/20261027120700_p1576_mirror_voice_server_trigger.sql:76`) | MITIGATE | Quarantine starts before the restore and blocks `net` requests until the outbound-address check passes. |
| Copied IDs collide with main's in an external service | MITIGATE | Transcription and voice are unconfigured in lanes in stage 1 (Solution). |
| The main lane holds unlanded branch schema, so stage-1 lanes inherit it | ACCEPT for stage 1 | The claim prints the ledger diff against main's files so the tester sees it. Stage 2's cleanup removes it. |
| CPU contention with two lanes plus the main lane | MITIGATE | VM-wide E2E capacity limit, measured in stage 2. Upgrade priced in Cost Budget. |
| A crashed claimer holds a lane forever | MITIGATE | Lease expiry with heartbeat, and drain before reuse. |
| A third branch needs a lane while both are taken | ACCEPT | It waits for a lane or stays on the main lane as an unclaimed worktree. Raising the pool beyond two is a later founder call, not this spec. |
| Rollback leaves worktrees holding claims to lanes that no longer exist | MITIGATE | Rollback clears every claim record, so those worktrees become unclaimed and use the main lane. |

**Non-Goals**

- Do NOT change prod, the prod deploy path or hosted TEST.
- Do NOT repair the from-empty migration replay (P1132 and P1085 own it).
- Do NOT build the request-header overlay or an interim lease.
- Do NOT isolate the transcription worker or the voice-note bucket in this spec.
- Do NOT change product code beyond environment configuration and the lane recipient guard.
- Do NOT build more than two lanes or an autoscaler.

## Cost Budget

Lanes run on the existing credits-paid VM. Without an upgrade, the added compute cost is zero. The
metered exposure is what a lane's cron jobs and functions call outward.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (cron and triggers to lane functions) | n/a | `cron jobs in a lane x ticks per hour each x lanes`, read from `cron.job` at build. Internal to the VM, not a paid unit | same, for the run's length |
| Egress (bytes) | n/a | lane to Mac dev servers over Tailscale. Branch traffic that runs on the main lane today moves to a lane; none is added | unchanged vs today |
| Log lines | n/a | per-lane container logs on the VM disk, with log rotation set on every lane service | n/a |
| Paid service units | n/a | `inherited runnable jobs x paid calls per job x registry price`. **0 by construction:** queues are cleared before quarantine lifts, and transcription and voice are unconfigured in lanes. Gemini and Mailgun calls come only from fixtures the branch creates, as on the main lane today, and the recipient guard limits Mailgun to the founder's addresses | unchanged vs today |
| VM upgrade, only if measured contention | n/a | e2-standard-4 to e2-standard-8 adds 4 vCPU and 16 GiB: `(4 x E2 core rate + 16 x E2 RAM rate) x 730 h` (registry row: Compute Engine, read 2026-10-26). Figure in .private/ | n/a |

1. **Fits the plan limit today?** Fits. There is no new paid service and no added paid calls. Compute is
   credits-paid, and runway is read privately per the registry row.
2. **Fits at 10x?** No. Ten lanes would not fit this machine, which is why the pool is capped at two.
3. **If either answer is no:** e2-standard-8 at the list price above (figure in .private/), from credits.
   The founder decides after the stage-2 measurement.

**Capacity reading, 2026-11-13 (read-only, over SSH):**
- Machine: e2-standard-4, 16 GB.
- In use: 3.65 GB used, 12.3 GB available, load average about 1.3, disk 15 of 77 GB.
- The main stack's containers use about 2.8 GB at idle. The gateway is the largest, at about 0.77 GB.
- A trimmed lane is estimated, not measured, at 1.5 to 2.3 GB idle.
- P1607 measured CPU on one stack: 3 concurrent E2E runs used about half of 4 CPUs.

## Done-When

Each check works by effect and carries a control that must fail first.

Stage 1
- [ ] Lane 1 is `ready` on the VM. From the Mac over Tailscale, its gateway serves auth, REST, realtime, storage, functions and meta. From a machine off Tailscale it does not answer (shown both ways).
- [ ] A worktree that claims lane 1 has its dev server, Playwright, `migrate.sh`, function deploy, raw-SQL helper and DB-latency check all hit lane 1, shown by lane-1 access logs, not by printed target lines. A repo grep finds no consumer left reading the fixed main-lane origin or container names outside the resolver.
- [ ] An unclaimed worktree behaves exactly as today, shown by an unchanged E2E run on the main lane.
- [ ] A worktree with a released or unknown claim refuses to run, deploy and migrate, and the main-lane access log shows nothing from it. Control: the same worktree with a valid claim succeeds.
- [ ] Isolation by effect: during a full cycle of lane 1's cron jobs and a trigger-firing fixture, the main lane's gateway log shows zero requests from lane 1. Control: one deliberate request from lane 1 to the main lane does appear in that log.
- [ ] A fresh lane matches the main lane on owners, ACLs, default privileges, RLS policies and security-definer functions (catalog comparison output).
- [ ] After quarantine lifts, the lane's queues hold zero inherited runnable rows, and a scheduled tick processes only a fixture created in the lane.
- [ ] An event email from lane 1 to a non-founder fixture address is captured, never delivered, and one to the founder's address is delivered. Shown from the guard's capture log and the provider's event log.
- [ ] Transcription and voice in lane 1 return the "not available in a lane" message and write nothing to the main lane or the voice bucket.
- [ ] A landing that carries a migration leaves the main-lane ledger containing it. A landing during a lane-1 run changes neither lane 1's served functions nor its schema (hashes and catalog read before and after).
- [ ] Two simultaneous claims never get the same lane (race test). A process holding an old generation token cannot write after reassignment. A claim whose heartbeat stops is reclaimed after expiry, never on branch inventory.
- [ ] An exclusive E2E run in lane 1 does not block a main-lane run, and the VM-wide limit still caps total concurrent runs.

Stage 2
- [ ] **Acceptance demonstration** (Solution): two lanes in use at once, one through its real scheduled dispatch and one through a branch-only browser-called function, while a main landing changes neither lane and brings the main lane forward.
- [ ] Main-lane ledger minus main's migration files is empty after the cleanup, shown as a diff, run with the founder's OK.
- [ ] The VM refuses a branch's function deploy and migration aimed at the main lane, including from a checkout running pre-P1672 scripts. Control: a main landing deploy still passes.
- [ ] CPU, memory and timeouts measured under two concurrent lane E2E runs plus main-lane traffic. The reading is recorded privately, with an upgrade recommendation for the founder if contention shows.
- [ ] `docs/decisions.md` records the reversal of the 2026-11-05 "detect, do not prevent" deferral and the P1591 resolver change. The testing docs say how a lane is claimed, used and released.

## Rollback Strategy

1. Clear every lane claim record, so every worktree becomes unclaimed and uses the main lane.
2. Stop the lane containers and remove their volumes and Caddy routes.

The landing hook's migration step and the E2E lock change stay, because they are correct for the main lane
alone.

## Related

- [P1312](done/2026-06-10/p1312_branch_tests_run_against_old_edge_functions_on_test.md): detect-only branch-function check. This spec acts on its deferred alternative.
- P1612: ancestry guard, deploy lock and landing redeploy.
- [P1557](done/2026-06-10/p1557_self_hosted_supabase_test_database.md): self-hosted TEST, restore procedure and mail sink.
- [P1607](done/2026-06-10/p1607_parallel_e2e_on_self_hosted_test.md): E2E admission slots and the CPU measurement.
- P1584: TEST server upkeep and health reporting. Lanes join its checks.
- P1591: single TEST resolver, changed here to one answer per worktree.
- P1132 and [P1085](p1085_trusted_e2e_core_in_ci.md): from-empty migration replay, not attempted here.
- [P1550](p1550_p1532_full_e2e_run_user_count_proof.md): full E2E at one worker while TEST is shared.
- P1631 and P1529: the colliding branches in the evidence.
