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
spec_review_hash: b8be7cc2f5b08b31c05948a9571f624ed2167be708e78bb7481b12e33126a022
spec_review_vendors: [codex, gemini, openrouter]
---

# P1672: Concurrent branches get isolated TEST lanes, not one shared server

## Problem

**Situation:** Every branch tests against one self-hosted TEST server: one database, one edge-functions
volume, one set of cron jobs and vault secrets.
- The function deploy ships the deploying checkout's whole tree.
- A full deploy prunes every function the checkout lacks.
- A single-function deploy still replaces all of `_shared`, the shared import map, the router and the
  JWT list.
- Every deploy recreates the functions container (`scripts/selfhosted/deploy-functions.sh:353-375, 411-417`).
- Every landing on main that touches function inputs full-deploys main's tip
  (`scripts/selfhosted/lib/deploy-on-land.sh`).

**Complication:** Two open branches with **no function directory in common** keep erasing each other.
- P1631 adds `clarify-draft`, which is called from the browser.
- P1529 changes `dispatch-event-emails` (fired by a database cron job), `send-event-emails`,
  `request-letter-response-signin` and 13 `_shared` files.
- A P1529 full deploy prunes `clarify-draft`. Any P1631 deploy puts main's `_shared` back over P1529's.
- The P1529 session logged on 2026-11-11: *"TEST functions overwritten by P1653 and P1631: this caused
  the canvas-draft 409 'terms' and drafts stuck queued. Fixed by redeploying each time."*
- The 2026-11-05 decision (P1312) chose "detect, do not prevent", and deferred "a server per branch or a
  deploy lease ... until the receipts show evidence runs regularly waiting on redeploys". That evidence
  now exists.

**Functions are only the most visible shared piece.** The schema is shared too.
- No table or function is defined by both branches. But P1631 re-defines 4 of main's database objects,
  and P1529 re-defines 11, on the server every other branch uses.
- `migrate.sh` cannot see this. It only checks that nothing local is pending
  (`scripts/selfhosted/migrate.sh:141-166`). It never flags extra versions another branch applied.
- Today the main lane receives landed migrations **only because branches apply them while they are being
  built**. Nothing applies them on landing:
  - The landing hook watches function paths only, and its path filter drops migrations
    (`deploy-on-land.sh:17`, `scripts/selfhosted/lib/deploy-guard.sh:54`).
  - `/ship` migrates prod.
  - `check-test-drift.sh` only warns (`scripts/git-ops.sh:5702-5706`).

**Why hosted Supabase never showed it:** the hosted deploy ran `supabase functions deploy <fn>` per
function (`scripts/deploy-functions.sh:207`). That bundles each function with its own copy of `_shared`,
and deletes nothing, so two branches clashed only when both changed the same function. The self-hosted
volume (P1557, 2026-10-28) shares one `_shared` and prunes, so every deploy now hits everyone.

**Question:** How do two or more active branches test at the same time, without redeploying over each
other, and without a landing on main disturbing them? This includes database changes and cron-driven
paths.

> Founder framing, verbatim: "This over deploying and removing something from test server is a continuous issue ... It seems to be that P1631 and P1529 are competing for test server and like deploying and removing and deploying and removing and functions are not working and we cannot test. How do we structurally solve this issue?"
>
> On going ahead: "i'm okay with this let's go forward in the best way possible ... if we need to upgrade server to something bigger you can let me know"
>
> On how it should feel: "I want to continue working on them and not think about what you do and when you're finished then the whole thing works."

## Appetite

**Blast radius: high.** It touches every branch's test loop, the function deploy, `migrate.sh`, the
landing hook, the E2E admission locks and the TEST resolver.

**Reversibility: medium.** Lanes are additive containers on the existing VM. The main lane keeps serving
every unclaimed worktree throughout. The script changes are shared by every session.

**Decision density: low.** The founder settled both open calls on 2026-11-13 (below). Two steps need the
founder's hand at the time they run:
- **The main-lane baseline cleanup.** It is destructive on shared TEST, so it waits for an explicit OK.
- **Confirming the lane mail recipient.** The mail provider sends the founder a confirmation email that
  the founder clicks.

## Decisions

- **D1 (founder, 2026-11-13): no interim lease; one lane first.** All four spec reviewers judged a
  whole-server lease not worth building: old checkouts ignore it, it starves landings, and it leaves one
  branch's schema behind for the next.
  - Stage 1 builds a single lane and puts the cron-driven branch (P1529's kind of work) on it. The shared
    server structurally cannot test that case.
  - Browser-only branches stay on the main lane until stage 2.
  - The founder's sessions keep working unchanged meanwhile.
- **D2 (founder, 2026-11-13): lanes answer only on the founder's private network (Tailscale).** The Mac
  and the TEST VM are both already on it. The main lane stays as reachable as it is today. A cloud-run
  agent or CI job cannot use a lane unless its machine joins the network.
- **D3: the word is "lane", not "slot".** "Slot" already means a worktree (`wN`) and a P1607 E2E admission
  slot (`scripts/lib/e2e-slot-lock.mjs`).

## Invariants

- **Prod is unreachable from all of this.** No lane command, resolver or script path may target prod or
  hosted TEST. Hosted TEST is switched off by default, and switching it on is the founder's act
  (decisions.md 2026-11-03, "Hosted TEST is switched off by default", P1606).
- **A claimed worktree fails closed, and never falls back.** A worktree whose lane claim is released,
  expired, failed, revoked or unknown refuses to run, deploy or migrate. It never silently uses the main
  lane. It returns to the main lane only through an explicit release, which records the transition.
  - An **unclaimed** worktree, the default for client-only branches, uses the main lane exactly as today.
- **One branch, one lane.** While a branch holds a lane, every other worktree on that branch refuses to
  deploy or migrate to the main lane.
- **The landing hook always targets the main lane.** It names the main lane explicitly, never through
  the per-worktree resolver, whichever worktree runs it and whatever that worktree has claimed.
- **A lane never acts on another environment.** Before a lane takes any request, every outbound
  address and credential a lane's database or functions can use either belongs to that lane or is
  absent. This covers vault entries, trigger targets, function env, the edge runtime's own Supabase URL,
  and inherited provider IDs such as scheduled-mail IDs.
  - A cloned database carries main's values until rewritten.
  - The lane stays quarantined until the check passes: no cron, no trigger-fired HTTP, no client access.
  - It re-enters quarantine before every later migration or configuration change.
- **No migration replay from empty, and no committed dump.** The chain cannot build from empty
  (decisions.md 2026-08-20; P1132, P1538). The P1557 schema dump stays private and off git.
- **A lane emails nobody but the founder.** It holds mail credentials for a separate provider sending
  domain that delivers only to the founder's addresses. Messages and scheduled-send IDs live in that
  domain, not main's.
  - This holds for every sender. Event, letter, agreement and sign-in functions each build their own
    provider URL (`supabase/functions/_shared/email-helpers.ts:578`, `create-and-sign/index.ts:102`,
    `request-letter-response-signin/index.ts:176`, `send-agreement-emails/index.ts:114`).
  - It also holds for scheduled-send cancellation (`send-event-emails/index.ts:168`). It holds whatever
    the branch's code does, because it is set by credentials, not by code.
  - Auth mail goes to the sink (decisions.md 2026-10-28).
- **TEST-only credentials only** (decisions.md 2026-10-29). Each lane provisioning creates a fresh JWT
  secret, anon key and service key. A lane never holds anything from prod.
- **One answer per worktree for "which TEST environment".** Every consumer reads it from one place. This
  changes P1591's single resolver (decisions.md 2026-10-29) from one shared answer to one answer per
  worktree. The main lane is the answer for every unclaimed worktree.

## Solution

### Stage 1: one lane, the protocol, and the main lane kept current

**What a lane is.** A trimmed second self-hosted Supabase stack on the same VM, as its own compose
project.
- It has its own network, container names, volumes and ports.
- It is reached through the existing Caddy at its own hostname, with TLS, answering only on Tailscale
  (D2).
- **Contents:**
  - Postgres (with cron, net and vault), auth, PostgREST, realtime (own tenant), storage (own empty
    volume), the edge runtime and the gateway.
  - Meta. The raw-SQL helper reaches it the way it reaches the main lane's: over SSH and `docker exec`,
    never through the gateway (`scripts/selfhosted/run-test-sql.sh:20,55`).
- **Left out:** studio and imgproxy.

**Lifecycle and fencing.**
- **States:** `provisioning → ready → draining → free`, plus `failed`.
- **Allocation** is atomic through a lock held on the VM. The VM is the authority, never a checkout's
  git dir.
- **Every claim re-provisions from scratch.** The previous generation's volumes are destroyed, then the
  database is copied fresh, keys are generated fresh, and the branch's functions are deployed.
  - Credentials from an earlier claim stop working. Database connections and cached tokens from that
    generation are dead.
  - SQL and deploy commands present the claim's generation to the VM. The VM refuses a stale one.
- **Reclaim** happens on lease expiry with a heartbeat. It never happens because a branch looks gone,
  since an unpushed local branch would read as gone. An unreadable inventory reclaims nothing.

**The per-worktree answer.**
- **Where it is stored:** the claim (lane id, origin, generation) is recorded per worktree in the git
  common dir. The lane's keys live on the Mac in a mode-600 file per lane, outside the repo.
- **Never written into the env files.** Each worktree's `.env.test.local`, `.env.local` and
  `.env.development.local` are symlinks to main's (`scripts/setup-worktree.sh`), so writing one would
  repoint every worktree.
- **The dev server and Playwright read the resolver from their own config.** Values Vite finds already
  set take precedence over env files, so a plain `npm run dev` or `npx playwright test` in a claimed
  worktree targets the lane with no wrapper.
- **Consumers of the TEST target:**
  - The dev server, Playwright, `migrate.sh`, the function deploy, `run-test-sql.sh` and
    `supabase-readonly-sql.py`.
  - `branch-functions-check.sh`, `deploy-drift.sh`, `health.sh`, `upkeep.sh` and the DB-latency check.
  - The E2E SQL helper and both E2E locks.
  - Their fixed identity checks change: today `run-test-sql.sh`, `migrate.sh` and
    `supabase-readonly-sql.py` refuse unless the Mac env file names the main lane. They now compare
    against the resolver's answer.
  - Hard-coded container names (`supabase-edge-functions`, `supabase-db`, `supabase-meta`) become
    per-lane values.
  - `/dev` greps the full list.
- **Claiming requires current scripts.** A worktree can claim a lane only when its branch contains the
  commit that ships this resolver. Older checkouts run their own branch-local scripts
  (`scripts/setup-worktree.sh`), which know nothing of lanes. The claim also restarts any running dev
  server of that worktree.

**Making a lane ready.**
1. **Quarantine** the empty lane: cron off, `net` requests blocked, no client route.
2. **Copy** the main-lane database into it, server side, including storage metadata rows. `/dev` chooses
   and proves the method. It must reproduce owners, ACLs, default privileges, RLS policies and
   security-definer functions (P1538: a green restore had 299 wrong ACLs).
3. **Re-create vault entries** from the main lane's own `vault.decrypted_secrets`, read on the server and
   never printed. The Mac file is not a source: several entries were generated on the server and exist
   nowhere else (decisions.md 2026-10-29).
   - URL-valued entries are rewritten to the lane's origin.
   - Key-valued entries are rewritten to the lane's own keys.
   - Entries for services a lane does not isolate are **not** created (deny-list below).
4. **Clear inherited runnable work and provider identities:**
   - dispatch, transcription and Mirror queues;
   - scheduled sends;
   - stored provider message IDs, so the lane can never address main's scheduled mail.
5. **Apply** the branch's migrations and **deploy** its functions, re-entering quarantine for each
   migration.
6. **Lift quarantine** only after the outbound check passes.

**Not isolated in stage 1: unconfigured in a lane, on a deny-list.** Neither service gets vault entries
or function env in a lane, so it fails without reaching the main lane or the bucket.
- **Transcription.** The external worker reads its own fixed Supabase URL and service key
  (`services/transcribe-room-batch/config.py`), so it would act on main's jobs.
- **Voice notes.** The cloud bucket's object paths carry no environment segment
  (`supabase/functions/chat-voice/handler.ts:194`), so a lane's retention sweep could delete main's
  objects.

Branches that need either keep the main lane.

**Stored files.** Inherited storage rows come across, but their bytes stay with the main lane. A lane's
own uploads work, and tests create their own fixtures.

**Keeping the main lane current.**
- **The landing hook applies main's newly landed migrations to the main lane.** It watches
  `supabase/migrations`, extracts them from main's tip, and runs under the same lock and failure record
  as the function deploy. A migration failure is recorded even when the function deploy in the same
  landing succeeds. Without this, once branches migrate their own lanes, the main lane (and every lane
  cloned from it) falls behind main.
- **E2E admission becomes VM-authoritative:**
  - one VM-wide capacity limit, because CPU is shared (P1607 measured 3 runs on one stack at about half
    of 4 CPUs);
  - per-lane exclusivity and leftover sweep, because databases are not shared.
  - Today's locks live in a checkout's git dir and skip themselves when `CI` is set
    (`scripts/lib/e2e-test-db-lock.mjs:50,105,122`). Neither holds for clients on separate machines.

**First user.** The P1529 session's next deploy or test runs through a claim of lane 1. The agent in
that session rebases onto the resolver commit, claims, and restarts its dev server. The founder does
nothing (D1).

### Stage 2: second lane, clean baseline, protected main lane

- **A second lane**, so a browser-only branch with function changes (P1631's kind) leaves the main lane.
- **Main-lane baseline cleanup.** The main-lane ledger is made equal to main's migration files, in both
  directions, and the branch-only objects behind removed versions are dropped.
  - It runs only once no active branch depends on the main lane for unlanded schema.
  - It waits for the founder's OK at the time it runs (db-access.md).
- **Server-side refusal on the main lane.** The VM refuses a function deploy or migration aimed at the
  main lane unless it comes from main's landing or an explicit main deploy. It holds whichever script
  version a checkout runs.
- **Capacity.** Measure two lanes plus the main lane under concurrent E2E. Recommend the VM upgrade to
  the founder only if the measurement shows contention.

**The acceptance demonstration, at the end of stage 2:**
- Two branches run in two lanes at the same time.
- One processes its own fixtures through its real scheduled dispatch.
- The other runs a branch-only browser-called function.
- A landing on main during both runs changes neither lane, and brings the main lane forward.

## Alternatives Considered

| Option | Verdict | Why |
|---|---|---|
| **Per-branch function overlay on the shared server, selected by a request header** (first proposal) | Rejected | Gemini, Codex and GLM each rejected it. Verified by command:<br>(1) Browsers send no custom header value on the CORS preflight, so a branch-only function's preflight lands on main's tree and fails. The router creates a worker for OPTIONS too (`supabase/selfhosted/functions-main/index.ts:93-118`).<br>(2) P1529's dispatch is fired by a cron tick reading one vault URL (`supabase/migrations/20260907170000_p1256_cron_tick_sends_jwt_and_secret_header.sql:42-66`).<br>(3) The JWT list is loaded once at router start (`index.ts:26-40`).<br>(4) Any reachable client could pick unreviewed branch code holding the TEST service key.<br>(5) The schema stays shared. |
| **Whole-server lease as an interim phase** (first draft) | Rejected (D1) | All four spec reviewers rejected it:<br>- Old checkouts and `migrate.sh` ignore a checkout-local lease.<br>- There is no owner model across separate commands.<br>- The landing redeploy waits 300 s and gives up at 1200 s (`deploy-on-land.sh:33,82`), so landings starve.<br>- It leaves one branch's schema behind for the next. |
| **A recipient guard in shared mail code** (round-2 draft) | Rejected | It misses senders that build their own provider URL, and a cancellation, which has no recipient. A separate sending domain covers every path whatever the branch's code. |
| Per-branch edge-runtime container, shared database | Rejected as end state | Cron, queues and schema stay shared. |
| Each worktree runs functions locally against the shared TEST database | Rejected | Same shared-schema and cron gap. Cloud cron cannot reach a laptop. |
| Lanes in local Docker on the Mac | Rejected | The founder chose the server path. Lanes would compete with parallel AI sessions for memory and stop when the Mac sleeps. |
| Hosted Supabase preview branches | Rejected | Paid per branch-hour. Needs a push per test cycle. Hosted TEST is off by founder rule. Fit with the custom router is unverified. |
| Merged integration branch | Rejected | Couples branches through merge conflicts. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The copy reproduces the schema but not permissions | MITIGATE | Catalog comparison (owners, ACLs, default privileges, RLS, security-definer) between the main lane and a fresh lane. |
| Vault ciphertext copied without its key decrypts to NULL, and every reader degrades to a quiet "skipping" warning | MITIGATE | Entries are re-created from decrypted values. The check works by effect: the dispatch tick reaches the lane. |
| A trigger fires HTTP inside a migration's transaction, before any after-the-fact check (`supabase/migrations/20261027120700_p1576_mirror_voice_server_trigger.sql:76`) | MITIGATE | Quarantine starts before the restore and is re-entered before every migration. A failed check keeps the lane quarantined. |
| The provider's restricted sending domain does not behave as assumed: it must refuse non-founder recipients, and must not cancel another domain's scheduled messages | MITIGATE | UNVERIFIED. `/dev` proves both by effect. If either fails, a capture proxy behind a provider-URL override in every sender replaces it, which changes product code and comes back to the founder first. |
| Adding or removing a lane's Caddy route reloads the proxy that also serves the main lane | MITIGATE | Route changes are validated before reload. A Done-When control shows the main lane serving throughout a lane add and remove. |
| The main lane holds unlanded branch schema, so stage-1 lanes inherit it | ACCEPT for stage 1 | The claim prints, after the copy, the two-way ledger diff against main's files. Stage 2 cleans it. |
| CPU contention with two lanes plus the main lane | MITIGATE | VM-wide admission, measured in stage 2. Upgrade priced in Cost Budget. |
| A third branch needs a lane while both are taken | ACCEPT | It waits for a lane, or stays on the main lane as an unclaimed worktree. Raising the pool beyond two is a later founder call. |
| Rollback strands worktrees that hold claims | MITIGATE | Rollback revokes every claim and leaves a tombstone. Those worktrees refuse until explicitly released, then use the main lane. Running dev servers are stopped. |

**Non-Goals**

- Do NOT change prod, the prod deploy path or hosted TEST.
- Do NOT repair the from-empty migration replay (P1132 and P1085 own it).
- Do NOT build the request-header overlay or an interim lease.
- Do NOT isolate the transcription worker or the voice-note bucket in this spec.
- Do NOT change product code. Environment configuration and resolver wiring only (Vite and Playwright
  config, scripts). The mail fallback above is the one route back to the founder.
- Do NOT build more than two lanes or an autoscaler.

## Cost Budget

Lanes run on the existing credits-paid VM. Without an upgrade, the added compute cost is zero. The
metered exposure is what a lane's cron jobs and functions call outward.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (cron and triggers to lane functions) | n/a | `cron jobs in a lane x ticks per hour each x lanes`, read from `cron.job` at build. Internal to the VM, not a paid unit | same, for the run's length |
| Egress (bytes) | n/a | Lane to Mac dev servers over Tailscale. It is traffic that runs on the main lane today, moved rather than added | unchanged vs today |
| Log lines | n/a | Per-lane container logs on the VM disk, with log rotation set on every lane service | n/a |
| Paid service units | n/a | **Delta vs today: 0.** Inherited runnable jobs are cleared before quarantine lifts, and transcription and voice are unconfigured in lanes. Gemini and mail calls come only from fixtures a branch creates, which it creates on the main lane today. The lane mail domain delivers only to the founder | unchanged vs today |
| VM upgrade, only if measured contention | n/a | e2-standard-4 to e2-standard-8 adds 4 vCPU and 16 GiB: `(4 x E2 core rate + 16 x E2 RAM rate) x 730 h` (registry row: Compute Engine, read 2026-10-26). Figure in .private/ | n/a |

1. **Fits the plan limit today?** Fits. There is no new paid service and no added paid calls. Compute is
   credits-paid. Runway is read privately per the registry row.
2. **Fits at 10x?** No. Ten lanes would not fit this machine, which is why the pool is capped at two.
3. **If either answer is no:** e2-standard-8 at the list price above (figure in .private/), from credits.
   The founder decides after the stage-2 measurement.

**Capacity reading, 2026-11-13 (read-only, over SSH):**
- e2-standard-4, 16 GB: 3.65 GB used, 12.3 GB available, load average about 1.3, disk 15 of 77 GB.
- The main stack's containers use about 2.8 GB at idle. The gateway is the largest, about 0.77 GB.
- A trimmed lane is estimated, not measured, at 1.5 to 2.3 GB idle.

## Done-When

Each check is by effect, and its control must fail first.

Stage 1
- [ ] **Lane 1 serves only on Tailscale.** Lane 1 is `ready`. Over Tailscale with TLS, its gateway serves auth, REST, realtime, storage and functions, and the raw-SQL helper reaches its meta. A machine off Tailscale gets no answer (shown both ways).
- [ ] **Every consumer of a claimed worktree hits lane 1.** A worktree claiming lane 1 has a plain `npm run dev`, `npx playwright test`, `migrate.sh`, the function deploy, the raw-SQL helper and the DB-latency check all hit lane 1. Shown by lane-1 access and SQL logs, not printed targets. A repo grep finds no consumer still reading the fixed main-lane origin or container names outside the resolver.
- [ ] **Unclaimed worktrees are unchanged.** An unclaimed worktree runs an unchanged E2E on the main lane.
- [ ] **Bad claims fail closed.** A worktree with a released, revoked or unknown claim refuses to run, deploy and migrate, and the main-lane access log shows nothing from it. A second worktree on a branch holding a lane refuses to deploy or migrate to the main lane. Control: the claimed worktree succeeds.
- [ ] **Old checkouts cannot claim.** A worktree whose branch lacks the resolver commit is refused a claim. After a rebase it claims, and its already-running dev server is restarted onto lane 1.
- [ ] **Lane 1 never calls the main lane.** During a full cycle of lane 1's cron jobs and a trigger-firing fixture, the main lane's gateway log shows zero requests from lane 1. Control: one deliberate request from lane 1 to the main lane appears in that log.
- [ ] **Quarantine holds through migrations.** A branch migration that installs and immediately fires an HTTP trigger to an outside address produces no request, and leaves the lane quarantined until the check passes (negative control).
- [ ] **The copy keeps permissions.** A fresh lane matches the main lane on owners, ACLs, default privileges, RLS policies and security-definer functions (catalog comparison output).
- [ ] **No inherited work runs.** After quarantine lifts, the lane's queues hold zero inherited runnable rows and zero inherited provider message IDs. A scheduled tick processes only a fixture created in the lane.
- [ ] **Lane mail reaches only the founder.**
  - From each of the four mail senders, a message to a non-founder fixture address is not delivered (provider log), and one to the founder is delivered.
  - A cancellation for a main-lane scheduled message ID, issued from lane 1, leaves that main-lane message scheduled.
- [ ] **Deny-listed services stay isolated.** Transcription and voice in lane 1 have no vault entries or env. Exercising them writes nothing to the main lane or the voice bucket (main-lane logs and bucket listing, unchanged).
- [ ] **Landings update only the main lane.**
  - A migration-only landing whose version was absent from the main lane beforehand leaves it applied, with its schema effect observable.
  - An injected failing migration in a landing is recorded as a failure even when that landing's function deploy succeeds.
  - A landing during a lane-1 run changes neither lane 1's served functions nor its schema (hashes and catalog read before and after).
- [ ] **Reuse starts clean.** After branch A releases lane 1 and branch B claims it, A's branch-only table, function and fixture are absent, and A's old keys and SQL generation are refused.
- [ ] **Allocation is safe.**
  - Two simultaneous claims never receive the same lane (race test).
  - A claim whose heartbeat stops is reclaimed after expiry, never on branch inventory.
- [ ] **E2E admission is VM-wide.**
  - An exclusive E2E run in lane 1 does not block a main-lane run.
  - The VM-wide limit caps total concurrent runs across two independent clients, one with `CI=1` set.
- [ ] **The proxy keeps serving the main lane.** Adding and removing lane 1's Caddy route leaves the main lane serving throughout (continuous probe log).
- [ ] **The founder confirmed the lane mail recipient** on the provider (the one founder action in stage 1).

Stage 2
- [ ] **Acceptance demonstration** (Solution): two lanes in use at once, one through its real scheduled dispatch and one through a branch-only browser-called function, while a main landing changes neither lane and brings the main lane forward.
- [ ] **The baseline is clean.** After the cleanup, run with the founder's OK, the main-lane ledger equals main's migration files in both directions. A branch-only object seeded beforehand under an extra version is gone (catalog diff).
- [ ] **The VM protects the main lane.** The VM refuses a branch's function deploy and migration aimed at the main lane, including from a checkout running pre-P1672 scripts. Control: a main landing deploy passes.
- [ ] **Capacity is measured.** CPU, memory and timeouts measured under two concurrent lane E2E runs plus main-lane traffic, recorded privately, with an upgrade recommendation for the founder if contention shows.
- [ ] **The docs record the change.** `docs/decisions.md` records the reversal of the 2026-11-05 "detect, do not prevent" deferral and the P1591 resolver change. The testing docs say how a lane is claimed, used and released.

## Rollback Strategy

1. Revoke every lane claim, leaving tombstones, and stop the dev servers bound to a lane.
2. Release each tombstoned worktree explicitly to the main lane.
3. Stop the lane containers and remove their volumes and Caddy routes.

The landing hook's migration step and the VM-wide E2E admission stay, because they are correct for the
main lane alone.

## Related

- [P1312](done/2026-06-10/p1312_branch_tests_run_against_old_edge_functions_on_test.md): the detect-only branch-function check. This spec acts on its deferred alternative.
- P1612: ancestry guard, deploy lock and landing redeploy.
- [P1557](done/2026-06-10/p1557_self_hosted_supabase_test_database.md): self-hosted TEST, its restore procedure and mail sink.
- [P1607](done/2026-06-10/p1607_parallel_e2e_on_self_hosted_test.md): E2E admission slots and the CPU measurement.
- P1584: TEST server upkeep and health reporting. Lanes join its checks.
- P1591: the single TEST resolver, changed here to one answer per worktree.
- P1132 and [P1085](p1085_trusted_e2e_core_in_ci.md): from-empty migration replay, not attempted here.
- [P1550](p1550_p1532_full_e2e_run_user_count_proof.md): full E2E at one worker while TEST is shared.
- P1631 and P1529: the colliding branches in the evidence.
