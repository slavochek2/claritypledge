---
status: today
type: task
rank: 6
workstream: infrastructure
created_date: '2026-11-03'
tags: [testing, e2e, self-hosted, concurrency]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
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

- [ ] Two runs from different worktrees run on self-hosted TEST at once, shown by their overlapping times.
- [ ] A run past the limit waits and names every holder; a dead holder's slot is reclaimed; a run on hosted still waits for one.
- [ ] A spec touching server-wide state runs alone, shown by a control that does and one that does not.
- [ ] Load test results at each level are in this spec, and the default limit follows from them.
- [ ] `.claude/rules/tests.md` and `docs/technical/` state the new limit and how to change it.

## Alternatives Considered

- Waiting behind the lock: blocks features for hours on an idle server.
- Skipping the lock per run: fixes nothing for other sessions and can collide on server-wide state.
- One TEST server per session: runtime cost and upkeep far above the need measured here.

## Rollback Strategy

Set the limit to 1 for the old behaviour, or revert the commit.

## Related

- [P1541](done/2026-06-10/p1541_test_db_capacity_guard_for_concurrent_e2e.md), [P1572](done/2026-06-10/p1572_e2e_lock_guard_accuracy.md), [P1557](done/2026-06-10/p1557_self_hosted_supabase_test_database.md), [P1604](p1604_transcription_belongs_to_a_chat.md)
