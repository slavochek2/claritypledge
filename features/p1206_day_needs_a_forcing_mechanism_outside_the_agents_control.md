---
status: week
type: task
rank: 1000057
workstream: infrastructure
created_date: '2026-09-01'
tags: [day, skills, process, monitoring, hooks]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1206: every `/day` continuity check is opt-in, so an agent that skips them all is invisible

## Problem

**Situation:** P1205 gave `/day` a dispatcher-continuity check in `~/.claude/scripts/day-gates.sh`
(D6): Step 0d snapshots the pass, Step 1 reports what the back half still owes, Step 11 records
what the pass achieved graded on the calendar push receipt, and the *next* pass's Step 0d fails
loudly if the previous pass never recorded a completion. That closes the fabricable-marker hole —
an agent can no longer buy a clean grade with one `date` command.

**Complication:** every one of those calls is invoked by prose in `day.md`. The adversarial review
of P1205 reproduced the consequence in one command sequence: a pass that skips **Step 0d as well**
leaves no snapshot, so the next pass grades the *previous* completed pass and reports
`previous pass completed`, exit 0. The reviewer's own words:

> The detection half does not close the failure — it makes it discoverable one pass later,
> conditional on the dropping agent having run 0d.

This is not an oversight in D6; it is structural. A gate only runs if the agent chooses to run it,
and the failure under investigation *is* an agent choosing to stop. The 2026-09-01 incident agent
dropped 8 of 11 dispatcher steps; dropping the 9th is not a stretch. P1205 mitigates as far as a
gate can — Step 0d prints a NOTE when its newest snapshot is over 36h old — but a NOTE that fires
only if the founder happens to read it is the same instruction class that already failed twice
(2026-08-28, 2026-09-01).

**Question:** what mechanism observes a `/day` pass without the pass having to cooperate?

> Founder framing, verbatim, on the original incident: *"can you fix so next time it runs for
> sure? i asked for that before it didn't work?"* — P1205 answered "for sure" only for passes that
> opt into being checked.

## Appetite

**Blast radius:** medium — the founder's daily-cadence tooling, plus (for the hook option) a
session-lifecycle hook that fires on every session in every repo, not just `/day`.
**Reversibility:** high for the scheduled-job option; **medium** for the hook option — a bad Stop
hook degrades or blocks every session until removed, and this repo has already shipped one that
silently disabled an existing safety gate.
**Decision density:** two real decisions — whether to build at all (Open Question 4), and if so
which of two mechanisms that detect genuinely different things (Open Question 1).

## Related — read before designing

- **`docs/decisions.md` 2026-08-13 [process]** — the Phase 1/2/3 plan. Phase 1 (`day-gates.sh`) is
  live; P1205 built the sub-day-return slice of Phase 2. This spec is the "local scheduled job as
  the named end state" that entry already anticipated.
- **`.claude/rules/skills.md` "Recurring Checks Do Not Belong Inside Skills" (P1031)** — this is
  the rule that *points at* the answer here rather than against it. P1205 resolved that P1031 did
  not reach a run-scoped gate. It does reach this one: a check that must fire whether or not a
  `/day` pass happened is exactly the scheduled detection P1031 says belongs outside a skill.
- **`docs/decisions.md` 2026-08-19** — "Adding a second check to an existing Stop hook" silently
  disabled an existing safety gate. Load-bearing if the hook option is chosen, and the single
  strongest argument against it.
- **`.claude/rules/epistemic.md` gate 7 and 7c** — whatever is built must be watched failing, and
  must be run against the workflows that already exist. P1205's own guard hard-failed two existing
  cases on its first cut; the same trap is waiting here, amplified by the hook option's blast
  radius.

**Duplicate gate:** `DUPLICATE|RELATED|NONE` — **RELATED**. Searched "forcing mechanism", "stop
hook day", "launchd day", "scheduled marker check". P1205 is the predecessor and explicitly
scoped this out ("Nothing inside this file can catch that, because a gate only runs if the agent
runs it"). No prior ruling found on a `/day` Stop hook or a local scheduled marker check.

## Solution

Not settled — this spec exists to decide it. The adversarial review of this spec's first draft
(codex, 2026-09-01, verdict REJECT) established the distinction that draft blurred, and it is the
whole decision:

**The two options do not detect the same thing.** One detects *inactivity*; the other detects *a
specific bad pass*. The first draft recommended the inactivity option while demanding exact-pass
detection in its Done-When — a contradiction that would have been discovered during
implementation, not before it.

**Option 1 — a local scheduled job (launchd): inactivity detection.**
Reads the completion record on a timer and raises a signal if no `/day` pass has recorded a
completion in N days. Fires whether or not `/day` ran, so nothing can opt out of it.
**What it cannot do:** identify that a bad pass happened. A pass that skips Step 0d leaves no
artifact naming it, so this job sees only "the newest completion is old" — a state a legitimate
few days off produces identically. On 2026-09-01 it would have said *"no complete /day since
2026-08-31"* the following day; it would **not** have said *"the pass you ran this morning dropped
its back half."*

**Option 2 — a session-lifecycle (Stop) hook: exact detection.**
Fires when a session ends and checks whether a `/day` pass is open with no completion recorded.
This is the only option that catches a pass which skipped Step 0d — **but only if it has an
independent way to know a pass began.** The existing open-pass artifact *is* the Step 0d snapshot,
so a hook defined as "snapshot without matching completion" inherits the exact blind spot this
spec exists to close, while passing generic hook tests. **The independent invocation oracle is
therefore part of Option 2's contract, not an implementation detail** — without it, Option 2 is
Option 1 with worse blast radius. Candidate oracles (to be verified against what the harness
actually exposes, none assumed to exist): hook input naming the invoked skill, or a marker the
`/day` frontmatter itself causes to be written before Step 0.

**No recommendation is offered between them, because they answer different questions and the
founder's need decides which.** The stated need — *"fix so next time it runs for sure"* — is
exact-pass detection, which points at Option 2. The safety argument points at Option 1: a bad Stop
hook degrades every session in every repo, and `docs/decisions.md` 2026-08-19 records exactly that
regression. What the first draft did was pick the safe option and then write down the ambitious
option's success criteria; this version refuses to do that.

**A third answer is live and must be argued down, not skipped:** accept the residual hole,
document it, and build nothing (see Open Question 4).

**Settle before building, whichever is chosen** — the first draft named this and then failed its
own test:
- **Where the signal lands.** A check that writes a line only a future agent might read reproduces
  the bug it is fixing. Name the delivery path and its maximum acceptable latency.
- **Who watches the watcher.** "It reports its own liveness" is circular: a checker that has
  stopped cannot report that it stopped. Name an independent consumer of the heartbeat, the age at
  which a missing heartbeat is itself an alarm, and where that alarm goes.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A Stop hook degrades or blocks every session across every repo | MITIGATE | If Option 2 is chosen: a new hook, never an edit to an existing one (2026-08-19). Exercise the failure path and the pass-through path before installing. |
| The new check duplicates D6 and both fire on one incident | MITIGATE | Scope this to the shape D6 provably cannot see (no snapshot at all). D6 keeps the in-pass shapes; do not re-detect what already fails loudly. |
| A scheduled job goes stale and nobody notices — the original bug, relocated | MITIGATE | Whatever is built must report its own liveness, not only its findings. A silent checker is indistinguishable from a healthy system. |
| Noise: a founder who takes days off gets alarmed for not running `/day` | MITIGATE | P1205's measured cadence: gaps of 1-3 days, sometimes 5. Any threshold must be set against that, not against "daily". |

**Non-Goals**
- Do NOT revisit D6's receipt-based grading — it works and is tested (119-case suite).
- Do NOT re-litigate whether `day-cp.md` may read home-directory state. Settled: no.
- Do NOT gate the completion marker's write on anything. Step 10 settled that; gating it truncates
  every other section's reflection window.

## Done-When

**Common to whichever mechanism is chosen:**

- [ ] The mechanism is chosen and the rejected option's reason is recorded, not left implicit
- [ ] The signal's delivery path is named, and a test confirms the founder actually receives it —
      not that a line was written to a file something might read
- [ ] The failure path has been watched failing (epistemic gate 7), exit code pasted
- [ ] It has been run against the documented `/day` workflows and fires on none of them (gate 7c),
      including a legitimate 3-day and a 5-day gap between passes
- [ ] **A missing-heartbeat test:** the checker is disabled outright, and the resulting alarm is
      observed. Self-reported liveness does not satisfy this — the failure being tested is the
      checker not running at all
- [ ] `docs/decisions.md` records which shape of failure remains undetected afterwards, since
      neither option detects everything

**If Option 1 (scheduled job) is chosen:**

- [ ] It raises a signal after N days with no recorded completion, N justified against the measured
      1-5 day cadence
- [ ] **The spec and the decision entry state plainly that this is inactivity detection, not
      bad-pass detection** — and that a `/day` pass which skipped Step 0d remains invisible. This
      replaces the exact-detection criterion the first draft wrongly required of this option.

**If Option 2 (Stop hook) is chosen:**

- [ ] An independent pass-invocation oracle is identified and **verified to exist** against the
      running harness — not assumed from documentation
- [ ] A pass that skipped Step 0d entirely is simulated end to end, the hook fires, and the test
      demonstrates the *oracle* is what triggered it — a hook that passes by reading the Step 0d
      snapshot has not met this criterion and must fail the test
- [ ] It is a NEW hook, and every pre-existing hook is confirmed still firing after installation
      (2026-08-19)
- [ ] A session in an unrelated repo, with no `/day` pass open, is unaffected

## Open Questions

1. **Inactivity detection or exact-pass detection?** This is the decision, and it is not a
   safety-versus-ambition trade the agent should make alone: the founder's stated need is exact,
   the safe build is inactivity-only. Founder call.
2. For Option 2 only: does the harness expose anything that names the invoked skill to a
   lifecycle hook? **If no independent oracle exists, Option 2 collapses into Option 1** with a
   larger blast radius and should be dropped rather than approximated.
3. What gap length is a real alarm, given measured `/day` cadence of 1-5 days? If no threshold both
   catches a real drop and stays quiet across a normal week, that falsifies Option 1 outright and
   the answer is Option 2 or nothing.
4. **Is this worth building at all?** The honest case for "no": P1205 already closed the fabricable
   marker, the abandon-path noise, and the concurrent-pass false alarms; what remains is a pass
   that skips *every* gate call, which has not yet been observed once. Against: the observed agent
   dropped 8 of 11 steps, so dropping the 9th is a difference of degree; and the founder has now
   asked twice for this to work "for sure". Decide this before Question 1 — if the answer is no,
   the other three do not need answering.

## References

- `features/done/` — P1205 (predecessor; read its Solution and the "one shape still escapes it"
  paragraph in `day.md` Step 1)
- `docs/decisions.md` 2026-09-01 [process] (the incident), 2026-08-13 [process] (the phased plan),
  2026-08-19 (the Stop hook regression)
- `.claude/rules/skills.md` "Recurring Checks Do Not Belong Inside Skills" (P1031)
- `~/.claude/commands/day.md`, `~/.claude/scripts/day-gates.sh` (both outside this repo)

## Adversarial review of this spec

Reviewed by codex (`codex-review`, read-only) before any implementation, 1 of 1 reports received.
**Verdict: REJECT** on the first draft. All four findings were verified independently against the
spec text and `.claude/rules/features.md` before being accepted:

| # | Finding | Disposition |
|---|---|---|
| 1 | The recommended option (scheduled job) is structurally incapable of satisfying the Done-When criterion the draft required of it | **Fixed** — the two options are now separated by what they detect, Done-When is split per option, and the exact-detection criterion no longer applies to Option 1 |
| 2 | "It reports its own liveness" is circular and fails open — a stopped checker cannot report that it stopped | **Fixed** — replaced with a named independent consumer and a missing-heartbeat test that disables the checker outright |
| 3 | Option 2 claims exact detection without defining how it observes invocation; an implementer would reuse the Step 0d snapshot and keep the blind spot while passing tests | **Fixed** — the independent invocation oracle is now part of Option 2's contract, and Question 2 says to drop Option 2 if no such oracle exists |
| 4 | `driver: adversarial-review` is not a valid value (`heuristic \| anomaly`), so programme-health reporting would silently exclude this task | **Fixed** — `driver: anomaly` |

The draft also carried a recommendation (Option 1) that the review showed was safety-aversion
presented as reasoning. It has been withdrawn rather than re-argued: the choice is the founder's,
and Question 4 asks first whether anything should be built at all.
