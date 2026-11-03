---
status: all-done
type: task
rank: 6
workstream: infrastructure
created_date: '2026-11-03'
tags: [testing, e2e, self-hosted, concurrency]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
completed_at: 2026-11-03
---

# P1607: Let e2e runs share the self-hosted TEST server in parallel

## Problem

**Situation:** P1541 allows one e2e run at a time per database, because two full runs took hosted TEST down on 2026-10-21. P1557 gave the self-hosted server its own copy of that lock.

**Complication:** On 2026-11-03 one run held the lock for over 90 minutes and blocked P1604 for two hours, while the server had 4 CPUs at load 0.6, 12 of 16 GB free, and 2 active database connections. Waiters poll with no queue, so the wait is unbounded in practice.

**Question:** How many runs can share the self-hosted server, and how do runs that change server-wide state stay safe?

> Founder, 2026-11-03: "make sure it susianble so we canrun in parlel more in future? and agnets knwo?"

## Appetite

Blast radius: every session's e2e runs. Reversibility: git revert, or set the limit to 1. Decision density: zero; the founder approved the direction.

## Invariants

- Hosted TEST stays at one run at a time (P1541's measured limit).
- Waiting never hangs forever, and a dead holder never blocks anyone (P1541, P1572).

## Solution

The self-hosted lock becomes a fixed number of slots, each taken and released atomically, with the limit in one setting. A load test sets the default. A later machine change means changing that one number.

A run touching server-wide state takes every slot, so it runs alone. Which specs count is derived from what they touch, so a new spec cannot be missed by a hand-kept list. Tests that write the kill switch (`transcribe_channel_posting`) are the known case; the build lists the rest.

The wait message names every holder. The rules and docs that say "one run at a time" are corrected, so agents read the new limit.

## Resolved Decisions (Gemini 4 Argon review, 2026-11-03; 1 of 1 reported)

1. **Which specs a run covers** is resolved from the run's file, directory and project arguments with the config's own project rules. A run whose set includes any server-wide spec is exclusive. A full suite stays exclusive until those specs move out.
2. **Inside an exclusive run,** server-wide specs must not race each other: they run with one worker.
3. **An exclusive waiter blocks new one-slot runs from taking free slots** while it drains, or it starves; it takes all slots at once or holds none. The claim goes stale like any other owner.
4. **Detection covers** writes to unscoped tables, global tick RPCs and cron, and helpers those specs import; each path has a known member.
5. **A held slot records its dev-server port.** A run on a port already held waits, because a shared server dies with the run that started it (P1234).
6. **The older-leftovers sweep runs only when no other slot is held.** A run always deletes its own users.
7. **Load test protocol:** the same fixed workload at each level, started together, measured only while all runs overlap: failures, retries, worst database response, auth 429s, Mac load and free memory. Other sessions on the server count toward the level and are named.
8. **Saved-auth users** (`.private/test-auth/local.json`) are audited; mutating specs do not share one across runs.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A spec changes server-wide state and is not detected | MITIGATE | Derive from the code, with a known member per detection path (epistemic gate 7e) |
| Timing tests get slower under load and flake | MITIGATE | The load test compares failures and response times at each level |
| The auth rate limit trips at higher load | MITIGATE | The load test watches for it; P1541 saw this at 3 workers on hosted |
| Local Mac limits (Chrome, dev servers) arrive before server limits | ACCEPT | The limit is one setting; lower it if the Mac struggles |

**Non-Goals**
- Do NOT change hosted TEST's limit.
- Do NOT resize the VM.
- Do NOT edit P1604 or P1536 specs.
- Do NOT stop a run in progress for the load test; run it alongside what is running, and report who else was on the server.

## Done-When

- [x] Two runs from different worktrees run on self-hosted TEST at once, shown by their overlapping times.
- [x] A run past the limit waits and names every holder; a dead holder's slot is reclaimed; a run on hosted still waits for one.
- [x] A spec touching server-wide state runs alone, shown by a control that does and one that does not.
- [x] Load test results at each level are in this spec, and the default limit follows from them.
- [x] `.claude/rules/tests.md` and `docs/technical/` state the new limit and how to change it.

## Load Test Results

Measured with `scripts/e2e-load-test.mjs` on the self-hosted TEST server (4 CPUs, 16 GB), 2026-11-04, from the build checkout. Each level starts N identical runs at the same moment; each run is 2 workers; the workload calls no metered service (the server's edge-function log for every window showed no function call, and no run touched hosted TEST or production). Numbers are measured only while all N runs overlap.

**Every level included another session's run.** A run from another worktree (a 1-worker walkthrough suite on the old lock script, alive for the whole test) was on the server throughout, so the number of runs on the server at level N was **N + 1**. A second run from another worktree was queued on the old lock and put no load on the server. The Mac also ran other sessions' work (Mac load average was roughly 4 to 6 before any level started on this 11-core Mac).

Server load is the server's 1-minute load average, sampled over ssh every 20 s or more (5 to 15 samples per level), so a peak between samples is not seen. Database response is a timed REST read every 5 s.

| Workload | Level N | Runs on server (N + other) | Failed / flaky / retried | Auth 429 | DB read median / p95 / worst (ms) | Server load max (4 CPUs) | Mac load max | Wall per run (s) | Tests per second |
|---|---|---|---|---|---|---|---|---|---|
| Light, no sign-ups | 1 | 2 | 0 / 0 / 0 | 0 | 136 / 142 / 146 | 0.85 | 8.8 | 136 | 2.3 |
| Light, no sign-ups | 2 | 3 | 0 / 0 / 0 | 0 | 141 / 174 / 188 | 1.03 | 18.6 | 161-163 | 3.9 |
| Light, no sign-ups | 3 | 4 | 0 / 0 / 0 | 0 | 151 / 183 / 211 | 1.67 | 39.4 | 205-211 | 4.4 |
| Light, no sign-ups | 4 | 5 | 0 / 0 / 0 | 0 | 157 / 197 / 244 | 1.40 | 35.1 | 265-269 | 4.7 |
| With sign-ups (18 users per run) | 1 | 2 | 0 / 0 / 0 | 0 | 134 / 146 / 168 | 1.91 | 12.2 | 196 | 1.9 |
| With sign-ups | 2 | 3 | 0 / 0 / 0 | 0 | 137 / 156 / 201 | 1.90 | 12.2 | 215 | 3.5 |
| With sign-ups | 3 | 4 | 0 / 0 / 0 | 0 | 142 / 199 / 208 | 3.80 | 20.4 | 252-254 | 4.4 |
| With sign-ups | 4 | 5 | 0 / 0 / 0 | 0 | 151 / 192 / 214 | 4.55 | 27.3 | 302-311 | 4.8 |

- Auth 429 is counted twice: in each run's report, and in the auth service's log for the window. Both were 0 at every level. This is the failure P1541 saw on hosted TEST at 3 workers; at up to 8 workers (4 runs) from one IP on self-hosted TEST it did not appear. 18 users per run is a light sign-up load, so this is not a proof for a full suite.
- Throughput gains: 1 to 2 runs +80%, 2 to 3 +26%, 3 to 4 +9% (sign-up workload). Wall time per run grows 58% from 1 to 4 runs, mostly on the Mac (Mac load 20 to 39 on 11 cores at levels 3 and 4).
- **Default limit: 3.** It is the largest count of runs on the server (mine plus the other session's) for which the server's CPU stayed under half (load 1.9 of 4); the next count reached 3.8 of 4 and the one after 4.55, with no failure yet but no headroom for the other sessions that share the machine, and the throughput gain had fallen to +9%. The limit is the single constant `SELFHOSTED_SLOT_LIMIT`.
- Stopping rules did not fire: no database read over the stop limit (8 s, 3 s at the last level), no failed read, no run interrupted.

**The other session's run (w1) during the test.** It stayed alive through every level. Its test-results directory gained entries during the test, but its tests were already failing and retrying before the first level started (13 test/retry pairs were present then, and its worker counter rose at roughly the same rate before and during the test), so nothing in it lines up with the load. This is an inference from directory listings, not from that run's report; the other session's own report is the evidence.

**Findings that are not load, and what was done.** Two specs failed at level 2 and passed at level 1 for a reason that is not server load, so they were taken out of the workload:
- `e2e/p1083-ready-distribution.spec.ts` counts the rows of a table every run writes to; two overlapping runs disturb its dot count. It now carries `// e2e-exclusive: <reason>`, which the detector reads (new detection path 5, also usable by future specs and helpers), so any run containing it takes the whole server.
- `e2e/integration/p1314c-release-requires-seat-secret.spec.ts` named its fixture session by the last five digits of the millisecond clock; two runs starting in the same millisecond collide. The code is now five random characters from the same alphabet; its assertions are unchanged.

Three more specs failed at level 1 on this server's data and were also left out of the workload.

**Lock-respecting overlap (real runs, temporary lock directory; repeated after the second review round, with the admission mutex).** The real old lock directory is held by another session's run, so this used `E2E_SLOT_LOCK_BASE` with `E2E_SLOT_LOCK_PROOF` (a proof-only override of the slot lock directory: temp directory only, marker required) and three checkouts: this one and two copies of it, each with its own dev-server port (5400, 5845, 5846), limit set to 2, all against self-hosted TEST. Times are the Playwright reports' start and end (UTC):

| Run | Checkout | Specs | Start | End | Result |
|---|---|---|---|---|---|
| A | w4 (port 5400) | p951 + p1193, 10 repeats | 18:49:20.032 | 18:51:35.435 | 180 passed |
| B | copy b (port 5845) | p508 + p1212, 10 repeats | 18:49:20.134 | 18:50:21.026 | 170 passed |
| C | copy c (port 5846) | p1193 | 18:49:41 | gave up 18:49:57, exit 75 | waited 12 s, named both holders |
| X | w4, exclusive (forced) | p951, 4 repeats | 18:51:36.981 | 18:53:01.273 | 90 passed |
| Y | copy b, one slot | p508 | queued 18:51:48 | tests 18:53:04.387 to 18:53:11.659 | 8 passed, waited for X |

A and B held `slot-1` and `slot-2` at the same time for 61 seconds (listing at 18:49:41: `slot-1=w4:5400 slot-2=ovlb:5845`; no old-directory entry is created any more). C was refused naming both holders (`... pid ..., running 1 min, port 5400); ovlb (..., port 5845)`). While X ran alone, Y printed `held by w4 (... running alone)` every 30 s and started its tests three seconds after X ended. The older-leftovers sweep: B finished while A was still live and printed `older-leftovers sweep skipped: other runs are live on this server: w4 (...)`; A finished last and ran it (`sweep: deleted 0, failed 0`). A dead holder's slot reclaim is covered by the unit tests with real dead processes, not by this run. The real old lock directory was not touched.

## Known Limitations

- The overlap proof ran through a temporary lock directory, because another session's run held the old lock on the real one. The first real overlap happens after this ships.
- Final review: Gemini 4 Argon raised three minor shapes, left as they are: `-c test` before the subcommand reads as exclusive (safe direction), space-separated flags are refused by the load driver's switch, and a failed probe releases its slot through the exit handler. Codex's final pass failed to run; its previous pass was fixed.

- **Older-script runs overlap new runs during the switch.** A new run only reads the old lock directory (a live holder counts as one occupied slot, or as the whole server for an exclusive run) and never writes it. A worktree still on the old script does not read the new slots, so it can start while new runs hold slots. Accepted and temporary: the load test carried 5 runs on the server without a failure, and the overlap ends when every worktree runs this script. The one exposure that matters is an old-script run that starts during an exclusive run, which then overlaps server-wide specs; it is not prevented.
- **The detector is a syntax-level scan, not a type-aware one.** It reads the write's own call chain with the TypeScript parser, so a filter in a later statement does not excuse a write. It fails closed (exclusive) on an unreadable file, an unresolved local import, an empty migration read, or a failed listing. It does not see: lower-case SQL; SQL or table names produced by a function call; a WHERE that exists only inside a sub-select of the same statement; code outside `e2e/` that a spec imports (scripts, `src/`); reads of a shared table (use the `// e2e-exclusive: <reason>` annotation for those, as `p1083-ready-distribution` does). `p1256-db-schema` is flagged by mistake (it calls a tick function as anon and expects refusal); the cost is parallelism, not safety.
- **Inside a run, server-wide specs run in their own one-worker project only when the command names no project.** With `--project=...` they stay in their project and the whole run uses one worker; `--workers`/`-j` above 1 is refused. A full suite keeps two workers for everything else.
- **Two proof/measurement knobs exist and can be set by hand:** `E2E_LOADTEST` (refused unless the database is self-hosted TEST, the driver is a live ancestor process whose command is `e2e-load-test.mjs`, and the specs equal the fixed workload) and `E2E_SLOT_LOCK_BASE` (needs a temp directory and `E2E_SLOT_LOCK_PROOF`). An agent could still write its own script with the driver's name, or set both proof variables; the guards stop a slip, not a deliberate forgery.
- **The older-leftovers sweep check is check-then-act.** The teardown asks who else is live, then sweeps; a run that starts in between is not seen. Accepted: that run adds load while the sweep deletes, but loses nothing, because the sweep only touches users older than 6 hours and a run in progress creates fresh ones.
- **Admission is serialized by a short mutex directory** (`e2e-test-db-selfhosted.admission.lock`, held only for one scan-and-take, a dead holder reclaimed like any other owner). A new run that cannot get it within about 5 seconds simply tries again on its next poll. The mutex covers new runs only: an old-script run does not take it (see the first limitation).
- **Saved-auth users (decision 8), audited 2026-11-04.** `.private/test-auth/local.json` is the only shared saved login; it does not exist on this machine (the directory holds only the per-port generated state files and a prod state file). Code that reads it: the config's storage-state helper (read-only merge, written to a per-port file, so runs on different ports never share one); `e2e/save-auth.ts` writes `<host>.json` files there by hand; `e2e/a11y/p160-accessibility.spec.ts` only mentions it (its comment says it no longer depends on it); the other a11y specs create their own users. Nothing writes the saved user. If someone creates it, every run would replay the same session; mutating specs create their own users through the test helpers, so no spec found depends on it.
- **Not covered by this build:** hosted TEST is unchanged (one run at a time); the load test is a measurement on one machine on one day; egress is the server's whole outgoing counter, other sessions included.

## Cost Budget

Self-hosted TEST is a flat-priced VM (registry row "Compute Engine"), paid from credits, so requests to it are not billed one by one. What the design adds: the load driver (measurement only, run by hand), one local `playwright test --list` per lock-taking run, and the slot lock's directory reads. Registry rows used: Compute Engine (price per VM-hour, egress per the network pricing page, no figure in the row) and, as a stand-in for the egress figure, the Google Cloud Storage row ("internet egress about $0.12 per GB for the first TiB").

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests to the server | n/a (no users added) | Driver sampling while a level runs: 1 REST read per 5 s = 720 per hour, plus 1 ssh session per at least 20 s = at most 180 per hour; by hand, not scheduled | One level-1 run, counted by the driver: 40 REST reads (36 samples in the 180 s window plus 3 baseline plus 1) and 13 ssh sessions; level 4 (275 s window): 55 + 3 = 58 reads. The runs' own traffic: 18 users created and 18 deleted per run (ledger) |
| Egress (bytes) | n/a | n/a | 23,112,760 bytes = 23.1 MB measured as the server's outgoing counter over one 192 s level-1 run; it counts all traffic on the server (another session's run was on it), so it is an upper bound for one run. Level N: about N x 23.1 MB (assumed linear) |
| Log lines | n/a | n/a | Failures provoked: 0. Measured at every level: 0 unexpected, 0 flaky, 0 auth 429, no edge-function call in the window |
| Service unit x registry price | n/a | VM hours added: 0 (the VM runs whether or not runs happen) | Egress only: 0.0231 GB x $0.12 per GB = $0.0028 per run (stand-in price, see above) |

The added listing makes 0 requests to the server (a local process, about 1 s on the Mac per lock-taking run, plus about 0.7 s to scan all 314 specs when the run's set is unknown). The sweep change lowers traffic: the older-leftovers sweep no longer runs when another run is live.

1. **Fits the plan limit today?** Yes: no per-request plan limit applies to the flat-priced VM, and the added cost is egress only: `runs per month x $0.0028` (an upper bound at the stand-in price). The load test itself: 27 level-runs (1+1+1+1+2+1+2+3+4+1+2+3+4+1) x 23.1 MB = 0.62 GB x $0.12 = $0.075, plus the overlap proofs (about 8 runs, under $0.03). Compare `runs per month x $0.0028` with the spend accepted for TEST; the figures stay in `.private/docs/usage/`.
2. **Fits at 10x?** Yes: `10 x runs per month x $0.0028`, same formula; the server's CPU, not cost, is the limit at higher counts (load 3.8 of 4 at four runs, see Load Test Results).
3. **If either answer is no:** not applicable. Not measured: the Compute egress price (the registry row names none), so the dollar figure rests on the stand-in; the byte figure is measured.

## Alternatives Considered

- Waiting behind the lock: blocks features for hours on an idle server.
- Skipping the lock per run: fixes nothing for other sessions and can collide on server-wide state.
- One TEST server per session: runtime cost and upkeep far above the need measured here.

## Rollback Strategy

Set the limit to 1 for the old behaviour, or revert the commit.

## Related

- [P1541](p1541_test_db_capacity_guard_for_concurrent_e2e.md), [P1572](p1572_e2e_lock_guard_accuracy.md), [P1557](p1557_self_hosted_supabase_test_database.md), [P1604](../../p1604_transcription_belongs_to_a_chat.md)
