---
status: week
type: task
rank: 68
workstream: infrastructure
created_date: '2026-08-24'
tags: [monitoring, alerting, process, silent-skip]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: anomaly
---

# P1155: The drift alarm was correct for three days and reached nobody

## Problem

**Situation:** The `check-deploy-drift` workflow runs daily at 06:00 UTC. It is alert-only by
deliberate design (P866 pattern): it never fails the build, it opens or appends a GitHub issue, and
the design note in the workflow states plainly who is meant to read it — *"the agent watches this
signal, not the founder's inbox."*

**Complication:** It worked. Perfectly. It ran on 2026-08-21, 22, 23 and 24, succeeded every time,
opened **issue #10** on 2026-08-21T06:53Z, and appended once per day for three days. During those
same three days production carried unauthenticated write policies on four tables and was missing the
schema its own deployed frontend calls. Nothing acted on it until a human happened to ship an
unrelated shell-script change on 2026-08-24 and tripped a *different* gate inside `/ship`.

**The detection is not the defect. The detection is the only part that worked.**

**Question:** What makes a correct alarm produce a decision, rather than an append to an issue
nobody opened?

### The asymmetry

| | Cadence | Reliability |
|---|---|---|
| Producing the signal | daily, on a cron, unattended | ran 5/5, verified via `gh run list` |
| Consuming the signal | whenever a human types `/day` | unknown — see below |

`/day` is the **only** consumer. Verified, and re-verified against the current tree on
2026-08-28: `grep -rln 'Deploy drift\|check-deploy-drift' .claude/commands/` returns exactly one
file — now `.claude/commands/slava/maintain/day-cp.md`, after the pp p48 split moved the personal
half of `/day` out of this public repo — which lists open issues via
`gh issue list --state open --limit 50`. Nothing else in the repo reads it. (The claim survived the
split unchanged; only the path moved. Line-number citation dropped rather than re-pinned.)

A machine produces the signal on a fixed schedule; a human decides when it is read. That gap is the
whole defect, and it widens silently — every day of drift looks exactly like every other day.

**What could not be determined:** whether `/day` ran during those three days. `.private/logs/skill-costs.log`
records ~50 skill invocations and **zero** for `/day` across its entire history, so the log cannot
distinguish "did not run" from "does not log." A control confirmed the log is genuinely written by
other skills (`kdd` ×25, `create-spec` ×5, `ship` ×2), which is what makes the absence uninformative
rather than evidence. **Do not build on the assumption that `/day` was skipped** — establish it
first; the fix differs depending on the answer.

### Why the answer is not "add another check"

The instinct on discovering this was to add a migration check to `/push`. That would have been
wrong, and the reasoning is worth keeping: a second detector, feeding the same unread channel,
produces a second thing to ignore. The repo already decided detection belongs on a cron and not in a
skill (`decisions.md` 2026-08-09, P1031). That decision was followed here and it was correct. The
unexamined half was what happens **after** detection.

## Appetite

**Blast radius: medium** — changes what interrupts the founder, which is a scarce resource. Getting
it wrong in the loud direction trains alarm-blindness; the quiet direction is the status quo.

**Reversibility: high.** Notification wiring, revertible in a commit.

**Decision density: one, and it is a founder call** — what is permitted to interrupt you, and after
how long. See `[FOUNDER DECISION]` below.

## Solution

Establish the fact first, then wire the escalation. Do not skip step 1 — the whole shape depends on
it.

1. **Determine whether `/day` ran on 21–23 Aug.** Session transcripts or shell history, not the cost
   log. Two different defects hide behind the same symptom:
   - **It did not run** → the consumer is optional, and an unread signal is the expected steady
     state. The fix is escalation that does not depend on a human starting a session.
   - **It ran and surfaced the issue** → the signal *was* delivered and lost among 50 issue lines
     with no severity weighting or age. The fix is ranking and escalation-by-age inside `/day`.
2. **Make an aging drift issue escalate.** An issue open for N days is categorically different from
   one opened this morning; today they render identically. Escalation must reach the founder
   through a channel that does not require them to start a session.
   **[FOUNDER DECISION: what channel, and what N?]** Candidates: push notification, email on the
   Nth day only (not daily — that is what made per-push alerting fail before), or a hard block in
   `/push`. Note the workflow's own history: per-push alerting was removed because it generated
   20+ duplicate emails, so any answer must degrade well when drift persists.
3. **Make the consumer's absence visible.** If nothing has read the signal in N days, that fact is
   itself a finding and should be reported, otherwise a silent consumer is indistinguishable from a
   quiet system — the same equivalence this repo has now hit three times in a week.
4. **Per epistemic gate 7, watch it fire.** Simulate drift persisting past the threshold and observe
   the escalation actually arrive. An alerting path nobody has seen fire is unproven.

## Risks / Non-Goals

### Risks

- **Alarm fatigue is the real failure mode of the fix.** Escalating too eagerly trains the founder
  to dismiss it, reproducing this defect with extra steps. Mitigation: escalate on *age*, not on
  each occurrence, and only once per threshold crossing.
- **The channel may be unavailable when it matters.** A notification path that itself fails silently
  is this bug again, one level up. Whatever is chosen must fail loudly.

### Non-Goals

- Do NOT add a second drift detector anywhere, including `/push`. The existing one is correct and
  timely; duplicating it feeds the same unread channel.
- Do NOT make `check-deploy-drift` fail the build. It was made alert-only deliberately after
  per-push alerting produced 20+ duplicate emails; reverting that is re-breaking a solved problem.
- Do NOT fix the migration collision here — that is P1154, and bundling would hide this behind it.
- Do NOT assume `/day` was skipped. That is the thing step 1 exists to establish.

### Alternatives Considered

- **Block `/push` on drift.** Rejected as the primary fix: it catches drift only when someone
  deploys, which is precisely when they are focused on something else, and it says nothing during
  the days in between. Possibly worth having as a backstop *after* escalation works.
- **Have `/day` run on a schedule.** Rejected: `/day` is a founder-facing session skill with far
  broader scope; putting it on a cron to deliver one alert is the tail wagging the dog, and
  `decisions.md` 2026-08-09 already routes automated detection to workflows instead.
- **Do nothing — the `/ship` gate eventually caught it.** Rejected on evidence: it took three days,
  and it only fired because of unrelated work. Had nothing shipped this week, it would still be
  open.

### Rollback Strategy

Revert the commit. The detection workflow is untouched by this spec, so rollback returns to
today's alert-only behaviour rather than to no monitoring.

## Done-When

- [ ] It is established, from evidence rather than inference, whether `/day` ran on 21–23 Aug, and
      the finding is written down
- [ ] Drift persisting beyond the agreed threshold reaches the founder without a session being
      started
- [ ] The escalation was **observed firing** in a simulated persistent-drift scenario, not asserted
- [ ] Drift resolved on day one does NOT escalate — the no-false-alarm case is tested too
- [ ] A signal that nothing has consumed for N days is itself reported
- [ ] Issue #10's own resolution is confirmed by the workflow going quiet on its next scheduled
      run, not by anyone declaring it fixed

## Related

- **Sibling:** P1154 — the migration collision this alarm was correctly reporting.
- **Same failure class:** P1147, P1153 — a signal that is produced correctly and read as clean.
  Here the signal was not even wrong; it was simply never read.
- **Constrains the solution:** `decisions.md` 2026-08-09 (P1031) — automated detection belongs in
  workflows, not skills. This spec must not violate it while fixing the consumption half.
- **Origin of the alert-only design:** the `check-deploy-drift.yml` header, which documents why
  per-push alerting was abandoned.
