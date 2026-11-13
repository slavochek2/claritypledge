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

# P1672: Concurrent branches get isolated TEST environments, not one shared server

## Problem

**Situation:** Every branch tests against one self-hosted TEST server: one database, one edge-functions
volume, one set of cron jobs and vault secrets. The function deploy ships the deploying checkout's whole
tree. A full deploy prunes every function the checkout lacks. A single-function deploy still replaces all
of `_shared`, the shared import map, the router and the JWT list. Every deploy recreates the functions
container. Every landing on main that touches function inputs full-deploys main's tip.

**Complication:** Two open branches with **no function directory in common** keep erasing each other.
P1631 adds `clarify-draft` (browser-called). P1529 changes `dispatch-event-emails` (fired by a database
cron job), `send-event-emails`, `request-letter-response-signin` and 13 `_shared` files. A P1529 full
deploy prunes `clarify-draft`; any P1631 deploy puts main's `_shared` back over P1529's. The P1529 session
logged on 2026-11-11: *"TEST functions overwritten by P1653 and P1631: this caused the canvas-draft 409
'terms' and drafts stuck queued. Fixed by redeploying each time."* Deploy output across 2026-11-06 to
2026-11-10 shows ownership of `canvas-draft`, `_shared` and `transcribe-slice` alternating between
branches. The 2026-11-05 decision (P1312) chose "detect, do not prevent" and deferred "a server per
branch or a deploy lease ... until the receipts show evidence runs regularly waiting on redeploys". That
evidence now exists.

Functions are only the most visible shared piece. The branches also share the schema: a screen of their
migrations found no table or function both define, but P1631 re-defines 4 of main's database objects and
P1529 re-defines 11, on the server every other branch uses. `migrate.sh` cannot see this: it only checks
that nothing local is pending (`scripts/selfhosted/migrate.sh:141-166`) and never flags extra versions
another branch applied.

**Why hosted Supabase never showed it:** the hosted deploy ran `supabase functions deploy <fn>` per
function (`scripts/deploy-functions.sh:207`), which bundles that function with its own copy of `_shared`
and deletes nothing. Two branches clashed only when both changed the same function. The self-hosted
volume (P1557, 2026-10-28) shares one `_shared` and prunes, so every deploy now hits everyone.

**Question:** How do two or more active branches test at the same time, including database changes and
cron-driven paths, without redeploying over each other, and without a landing on main disturbing them?

> Founder framing, verbatim: "This over deploying and removing something from test server is a continuous issue ... It seems to be that P1631 and P1529 are competing for test server and like deploying and removing and deploying and removing and functions are not working and we cannot test. How do we structurally solve this issue?"
>
> And on the decision: "i'm okay with this let's go forward in the best way possible ... if we need to upgrade server to something bigger you can let me know"

## Appetite

Blast radius: **high**. It touches every branch's test loop, the function deploy, `migrate.sh`, the
landing redeploy and the E2E gate. Reversibility: medium. Slots are additive containers on the existing
VM and the main lane keeps working throughout, but the script changes are shared by every session.
Decision density: low. The founder approved the direction and the VM upgrade path. One open call is
listed under Open Questions.

## Invariants

- **Prod is unreachable from all of this.** No slot command, resolver or script path may target prod or
  hosted TEST. Hosted TEST stays paused; restoring it is the founder's act (decisions.md 2026-11-03,
  "Hosted TEST is switched off by default", P1606).
- **Fail closed, never fall back.** A worktree whose slot claim is unknown, expired or released refuses to
  run, deploy or migrate. It never silently uses the main lane instead. Fallback makes a missing deploy
  look like a pass (review finding, 2026-11-13).
- **Main lane is written only by landings and explicit main deploys.** Once Phase 2 ships, no branch
  deploy or branch migration writes the main lane.
- **A slot's database never calls another environment.** Vault URLs, cron targets and any stored
  function address inside a slot point at that slot's own gateway. A cloned database carries main's
  values until rewritten, so the rewrite happens before any cron job in the slot is enabled.
- **No migration replay from empty and no committed dump.** The chain cannot build from empty
  (decisions.md 2026-08-20; P1132, P1538). The P1557 schema dump stays private and off git.
- **Mail from tests never reaches a real inbox** beyond the founder's relay rule (decisions.md
  2026-10-28, P1557 mail sink).
- **TEST-only credentials only** (decisions.md 2026-10-29: self-hosted TEST holds AI and storage keys,
  all TEST-only). A slot gets the same set and nothing from prod.
- **One resolver per worktree.** Which TEST environment a worktree targets has exactly one answer, read
  by the dev server, Playwright, `migrate.sh` and the deploy alike (extends P1591's single-resolver
  ruling, decisions.md 2026-10-29).

## Solution

Two phases. Phase 1 stops the clobbering now. Phase 2 removes the cause.

### Phase 1: a whole-environment TEST lease (containment)

One holder owns the TEST server for the length of a test session. The lease covers every write path:
branch function deploys, `migrate.sh` on TEST, E2E runs that need branch functions, and the landing
redeploy. A second branch's write refuses with the holder's branch, age and how to wait. A landing's
detached redeploy waits for the lease, bounded, then runs. If the bound passes it records a failure the
drift check reports, the same channel it uses today. The lease has an owner-alive check, so a crashed
session does not hold it forever (the deploy lock's `dg_lock_owner_dead` is the precedent). Phase 1 makes
branches take turns. It does not let them run at once.

### Phase 2: a bounded pool of isolated environments on the TEST VM

Two **slots** to start, each a trimmed self-hosted Supabase stack beside the main lane on the same VM.
Each slot has its own Postgres (with cron and vault), auth, PostgREST, realtime, storage, edge runtime and
gateway, reached at its own hostname behind the existing Caddy. Admin-only services (studio, imgproxy,
meta) are left out.

- **Claim / release.** A worktree claims a free slot. The slot is reset to a fresh copy of the main
  lane's database, then the branch's own migrations are applied and its functions deployed. Claiming
  writes the worktree's env so the dev server, Playwright, `migrate.sh` and the deploy all resolve to
  that slot through the one resolver. Release frees the slot. A slot whose branch is gone is reclaimed
  only after a grace period and a check that no run is active. An unreadable branch inventory never
  means "delete everything".
- **Database copy.** Copy from the live main-lane database on the VM. It is already private and already
  correct, which avoids the from-empty replay and avoids moving the dump. The copy must reproduce owners,
  ACLs, default privileges, RLS policies and security-definer functions (the P1538 lesson: a green
  restore had 299 wrong ACLs). It must then rewrite vault secrets and cron targets to the slot, and
  clear queued work inherited from main before cron starts (see Cost Budget).
- **Reset is the answer to a bad migration.** A branch that amends or drops one of its migrations resets
  its slot. There is no hand-repair of a shared ledger.
- **Main lane unchanged.** Landings keep full-deploying main's tip to the main lane only. The ancestry
  guard keeps protecting the main lane. Branch deploys go to slots and never need it.
- **Evidence binds to the environment.** The P1312 branch-function check compares a slot against its own
  branch. A slot's drift is not reported as main-lane drift.
- **Capacity.** Measure two concurrent E2E runs plus main-lane traffic. Upgrade the VM only if the
  measurement shows contention (see Cost Budget for the upgrade price).

The acceptance demonstration, from the Codex review: **two simultaneous runs. P1529's real scheduled
dispatch processes its own fixtures in its slot, P1631 runs `clarify-draft` in another slot, and a main
landing during both changes neither run's code or database.**

## Alternatives Considered

| Option | Verdict | Why |
|---|---|---|
| **A. Per-branch function overlay on the shared server, chosen by request header** (first proposal this session) | Rejected | Reviewed by Gemini, Codex and GLM (3 of 3 rejected). Verified by command: (1) browsers send no custom header value on the CORS preflight, so a branch-only function's preflight hits main's tree and fails (the router creates a worker for OPTIONS too, `supabase/selfhosted/functions-main/index.ts:93-118`; Codex reproduced it against the real router); (2) P1529's dispatch is fired by a cron tick that reads one vault URL and sends an empty body (`supabase/migrations/20260907170000_p1256_cron_tick_sends_jwt_and_secret_header.sql:42-66`), so no header can reach it; (3) the JWT list is loaded once at router start (`index.ts:26-40`); (4) any reachable client could select unreviewed branch code holding the TEST service key; (5) the schema stays shared. |
| B. Lease only, no pool | Phase 1 only | Ends the clobbering but serializes branches, the founder's complaint. |
| Per-branch edge-runtime container, shared database | Rejected as end state | Fixes functions, preflight and function-to-function calls, but cron, queues and schema stay shared, so P1529's path is still untestable. |
| Each worktree runs functions locally (`supabase functions serve`) against the shared TEST database (GLM's pick) | Rejected | Same shared-schema and cron gap. Cloud cron cannot reach a laptop. Ties tests to the Mac being on with Docker running. |
| Slots in local Docker on the Mac (36 GB) | Rejected | The founder chose the server path ("if we need to upgrade server ... let me know"). Local slots compete with the parallel AI sessions for memory and stop when the Mac sleeps. |
| Hosted Supabase preview branches | Rejected | Paid per branch-hour. Needs a push per test cycle and cannot test uncommitted work. Hosted TEST is paused by founder rule. Compatibility with the custom self-hosted router was not verified. |
| D. Merged integration branch | Rejected | Couples branches through merge conflicts. Integration evidence, not branch evidence. |
| E. Fixed-order single-function deploys | Stopgap only | Works for P1631 and P1529 today (neither touches the JWT list, import map or router; both are rebased) but is undone by every landing. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Copied database carries main's vault URLs, so a slot's cron calls main-lane functions | MITIGATE | Invariant above. Rewrite before cron is enabled; verify by reading `vault.decrypted_secrets` names and the cron job targets in the slot. |
| Vault secrets encrypted under the main lane's key do not decrypt in a slot's Postgres | MITIGATE | UNVERIFIED either way. Re-create slot vault secrets from the Mac secrets file rather than copying ciphertext. |
| Inherited pending rows (transcription retries, email dispatch) make a slot's cron call paid services: Gemini, the GPU transcription service | MITIGATE | Clear or mark inherited queue rows before enabling cron. Cost Budget below. |
| Copy reproduces the schema but not permissions (P1538: 299 wrong ACLs on a green restore) | MITIGATE | Catalog comparison of owners, ACLs, default privileges, RLS and security-definer functions between the main lane and a fresh slot, as P1557 did. |
| CPU contention under concurrent E2E (hosted TEST was left because concurrent E2E timed out) | MITIGATE | Measured Done-When below; upgrade path priced in Cost Budget. |
| Slot hostnames expose unreviewed branch code with TEST keys to the internet | MITIGATE | Slot ingress no weaker than the main lane's. Whether to restrict slots further is an Open Question. |
| Lease left by a crashed session blocks every branch | MITIGATE | Owner-alive check plus a printed clear command, as the deploy lock does. |
| A third branch needs a slot while both are taken | ACCEPT | It waits on the lease for the main lane, or the founder raises the pool size. Two slots cover today's evidence (2 of 22 worktrees change functions). |
| Old worktrees run their own stale copy of the scripts and bypass slot routing | MITIGATE | Same limit P1612 recorded. The main-lane lease refuses an unrouted branch write, whichever script version runs. |
| Auth redirect allowlists and storage buckets differ per slot | ACCEPT | Configured at slot creation from the main lane's settings. Checked by the acceptance demonstration's sign-in step. |

**Non-Goals**

- Do NOT change prod, the prod deploy path or hosted TEST.
- Do NOT repair the from-empty migration replay (P1132 and P1085 own it).
- Do NOT build the request-header overlay (option A).
- Do NOT change product code beyond environment configuration (no per-call header helper, no CORS change).
- Do NOT build more than two slots or an autoscaler.
- Do NOT remove the P1312, P1612 or P1584 machinery from the main lane. Re-bind it per environment only where a slot needs it.

## Cost Budget

Slots run on the existing credits-paid VM. Without an upgrade, the compute cost added is zero. The
metered exposure is what a slot's cron jobs and functions call.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (cron to slot functions) | n/a | `cron jobs copied into a slot x ticks per hour each x slots`. Job set and schedules are read from `cron.job` at build time (currently includes `canvas_draft_material_expire`, `chat_voice_retention`, `chat_voice_sweep`, `transcribe_post_retry`, `transcribe_round_clean` and the event dispatch tick). Internal to the VM, not a paid unit | same as per hour, for the run's length |
| Egress (bytes) | n/a | slot to Mac dev servers, same traffic a branch generates on the main lane today, moved not added | unchanged vs today |
| Log lines | n/a | per slot container logs on the VM disk; bounded by the existing log rotation (UNVERIFIED, check at build) | n/a |
| Paid service units | n/a | `inherited pending jobs x paid calls per job x registry price`. **Target 0** by clearing inherited queues before cron starts. After that, only fixtures the branch itself creates call Gemini, GPU transcription or Mailgun, as they would on the main lane today | unchanged vs today |
| VM upgrade, only if measured contention | n/a | e2-standard-4 to e2-standard-8 adds 4 vCPU and 16 GiB: `(4 x E2 core rate + 16 x E2 RAM rate) x 730 h` (registry row: Compute Engine, read 2026-10-26); figure in .private/ | n/a |

1. **Fits the plan limit today?** Fits: no new paid service, and paid calls are held at today's level by
   the queue-clearing rule. Compute is credits-paid. Runway is read privately per the registry row.
2. **Fits at 10x?** Ten slots would not fit memory on the current machine, by the measurement below. The
   pool is capped at two on purpose.
3. **If either answer is no:** e2-standard-8 at the list price above (figure in .private/), from credits,
   decided by the founder after the capacity measurement.

**Capacity reading, 2026-11-13 (read-only, over SSH):** e2-standard-4, 16 GB. 3.65 GB used, 12.3 GB
available. Load average about 1.3. Disk 15 of 77 GB. The full main-lane stack's containers use about
2.8 GB at idle, of which the gateway is the largest (about 0.77 GB). A trimmed slot is estimated, not
measured, at 1.5 to 2.3 GB idle, so two slots should fit memory. CPU under concurrent E2E is the
unmeasured limit.

## Done-When

Phase 1
- [ ] While one branch holds the TEST lease, a function deploy, a `migrate.sh` run and a branch-function E2E run from another branch each refuse, naming the holder, its age and how to wait. Shown by running all three.
- [ ] A landing during a held lease redeploys main's tip after the lease is released, not during it. Shown in the landing log.
- [ ] A lease whose owner process is dead is detected and cleared without hand editing. Shown by killing a holder.

Phase 2
- [ ] **Acceptance demonstration:** two slots in use at once. One holds P1529's work (or a branch with a cron-fired function) and its real scheduled dispatch processes that slot's fixtures. The other runs `clarify-draft` from P1631 (or a branch-only function). A main landing during both runs changes neither slot's served functions nor its schema, verified by hashes and a catalog read before and after.
- [ ] Claiming a slot from a worktree makes its dev server, Playwright, `migrate.sh` and the function deploy all report the slot as their target, with no hand edit of an env file.
- [ ] A worktree with a released or unknown slot claim refuses to run, deploy or migrate, and does not reach the main lane.
- [ ] A fresh slot matches the main lane on owners, ACLs, default privileges, RLS policies and security-definer functions (catalog comparison output).
- [ ] Inside a slot, every vault secret and cron target points at that slot's gateway. Shown by listing them (names and hosts only, never values).
- [ ] A slot's cron run after creation calls no paid service for work inherited from the main lane. Shown by the slot's function logs and the paid-call counts staying flat.
- [ ] Mail sent from a slot lands in the sink. Only the founder's relay rule forwards anything.
- [ ] Two concurrent E2E runs in two slots, plus main-lane traffic, measured for CPU, memory and timeouts. The reading is recorded privately, with an upgrade recommendation for the founder if contention shows.
- [ ] A slot whose branch is gone is reclaimed after the grace period and only when no run is active. An unreadable branch list reclaims nothing.
- [ ] `docs/decisions.md` records the reversal of the 2026-11-05 "detect, do not prevent" deferral, and the testing docs say how to claim, use and release a slot.

## Rollback Strategy

Phase 1: remove the lease checks; deploys and migrations behave as today. Phase 2: release all slots,
stop their containers and remove the slot resolver entries. The main lane is untouched throughout and
remains what every worktree used before.

## Open Questions

1. [FOUNDER DECISION: slot ingress] Slots expose unreviewed branch code holding the TEST keys. Keep them
   reachable like the main lane (public HTTPS, keys gate requests), or restrict slot hostnames to
   Tailscale only? Restricting is stronger but needs every dev machine and CI path on Tailscale.
2. Should Phase 1's lease also be held by plain E2E runs of client-only branches? They write test data
   to the shared database but deploy nothing.

## Related

- [P1312](done/2026-06-10/p1312_branch_tests_run_against_old_edge_functions_on_test.md): detect-only branch-function check. This spec acts on its deferred alternative.
- P1612: ancestry guard, deploy lock and landing redeploy. Main-lane protection kept.
- [P1557](done/2026-06-10/p1557_self_hosted_supabase_test_database.md): self-hosted TEST, restore procedure and mail sink.
- P1584: TEST server upkeep and health reporting. Slots join its checks.
- P1591: single TEST resolver.
- P1132 and [P1085](p1085_trusted_e2e_core_in_ci.md): from-empty migration replay, not attempted here.
- [P1550](p1550_p1532_full_e2e_run_user_count_proof.md): full E2E runs at one worker while TEST is shared.
- P1631 and P1529: the colliding branches in the evidence.
