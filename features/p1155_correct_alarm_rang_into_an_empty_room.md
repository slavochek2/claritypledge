---
status: backlog
type: task
rank: 231
workstream: infrastructure
created_date: '2026-08-24'
tags: [monitoring, alerting, process, silent-skip]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
drafted_by: opus
driver: anomaly
flow: dev
exec_model: sonnet
exec_effort: medium
---

# P1155: Every consumer of every alarm is human-initiated

## Problem

**Situation:** Seven workflows in `.github/workflows/` detect a prod problem and open or append a
GitHub issue rather than failing the build (P866 pattern) — `check-deploy-drift`, `auth-canary`,
`csp-smoke`, `backup-staleness`, `db-backup`, `prod-health-smoke`, `stranded-signups`. The design
note in `check-deploy-drift.yml` states plainly who is meant to read them:

> *"the agent watches this signal, not the founder's inbox."*

**Complication:** They work. `check-deploy-drift` opened **issue #10** on 2026-08-21 and appended
daily for three days while prod carried unauthenticated write policies on four tables. It then
opened **issue #11** on 2026-09-05 and appended on 09-06 and 2026-09-07T12:01Z, naming two missing
migrations and two stale edge functions. Nobody read either one. #10 was closed only after an
unrelated ship tripped a different gate; #11 was found ~10 hours after its last append by the
founder noticing wrong copy on the live site, not knowing an alarm existed.

**The detection is not the defect. The detection is the only part that worked.**

**Question:** What reads a correct alarm, given that no human reliably will?

### The answer is not "escalate to the founder" — that was this spec's original error

The first draft of this spec proposed notifying the founder after N days and marked the channel as
a `[FOUNDER DECISION]`. That contradicted the design intent quoted above, and the founder rejected
it in those terms: *"this is not for me, is it?"* He is right. This is agent-facing infrastructure.
A channel change — Telegram, personal email, a `/push` block — moves the same unread signal to a
different unread place.

### The measured root cause

```
crontab -l              → no crontab for slavochek
ls ~/.claude/routines   → does not exist
```

**There is no unattended consumer of anything on this machine.** Every reader in the system is
human-initiated:

| Signal | Reader | Trigger |
|---|---|---|
| Open alert-only GitHub issues | `/day` (`day-cp.md`, `gh issue list --state open --limit 50`) | human types `/day` |
| Drift condition (re-derived, not the issue) | `/ship` step 3.6 (`ship.md:63`) | human ships |
| ops@ inbox | `/weekly` step (`weekly/SKILL.md:559`) | human types `/weekly` |

`/weekly`'s ops-email step has never produced its `OPS EMAIL:` output block in seven weeks of
history across all four transcript stores — that step is effectively dead code.

A machine produces every signal on a fixed schedule; a human decides when any of them is read. That
gap is the whole defect, it is identical across all seven alarms, and it widens silently — every
day of drift looks exactly like every other day.

### This is a rate, not an incident

| Issue | Opened | Closed | Days open |
|---|---|---|---|
| #2 | 2026-06-17 | 06-18 | ~1 |
| #3 | 2026-06-19 | 06-20 | ~1 |
| #8 | 2026-08-13 | 08-14 | ~1 |
| #10 | 2026-08-21 | 08-25 | 4 |
| #11 | 2026-09-05 | **still open** | 3+ |

Two multi-day misses two weeks apart. The three one-day cases resolved without anyone being
interrupted, which is the behaviour any fix must preserve.

### Why the answer is not "add another check"

The instinct on discovering this was to add a migration check to `/push`. That would have been
wrong: a second detector feeding the same unread channel produces a second thing to ignore, and
`decisions.md` 2026-08-09 (P1031) already routes detection to workflows rather than skills. That
decision was followed here and it was correct. The unexamined half was what happens **after**
detection.

Issue #11 also proves a push-time gate could not have worked. `FUNCTION_STALE` was in its body for
both edge functions: edge functions deploy out-of-band, so no pre-push or ship-time gate can ever
observe that class. And the two missing migrations were **content** changes (guarded `UPDATE`s to
organization copy) — nothing errored, PostgREST was fine, and the only symptom was stale text on a
public page. That has no natural discovery path at all.

## Appetite

**Blast radius: medium** — introduces the first unattended consumer in the system, and gives it a
write path to an external channel. It does not touch detection, prod data, or the deploy path.

**Reversibility: high.** One workflow file, one registry file, one script. Revert the commit and
the system returns to today's alert-only behaviour, detection intact.

**Decision density: three, and none of them is about interrupting the founder.**
1. Where the unattended consumer runs (resolved — GitHub Actions).
2. What the expandability boundary is: what is data vs. what is code (resolved — see Solution).
3. Whether it may act on what it finds (resolved — no; see Non-Goals).

All three are resolved below. Nothing in this spec is a `[FOUNDER DECISION]`.

## Solution

**One scheduled reader, a registry of checks, one agent-facing channel.** Building this as a *drift*
checker would guarantee a rebuild the first time something else needs watching, so the check list is
data and the reader is generic.

```
registry (data — adding a check is a row, not code)
  ├─ github-issue-age    : open alert-only issue older than N days
  └─ workflow-last-run   : a producer workflow that has not run in > N hours
                    ↓
        scheduled reader  (GitHub Actions, daily)
                    ↓
     nothing due   → exit silently, no output
     something due → one email to ops@ with the fix commands inline
                     + label the issue `escalated` so it fires once, not daily
```

### 1. The consumer runs on GitHub Actions

It is the substrate all seven producers already run on, it needs no machine to be awake, and it
requires no new infrastructure. Rejected alternatives are in Alternatives Considered.

### 2. The registry is data; the check *kinds* are code

```yaml
# .github/alert-registry.yml  (shape illustrative — /architect owns the final schema)
checks:
  - id: deploy-drift
    kind: github-issue-age
    match_title: "Deploy drift detected on prod"
    escalate_after_days: 2
  - id: producer-freshness
    kind: workflow-last-run
    workflows: [check-deploy-drift.yml, auth-canary.yml, csp-smoke.yml,
                backup-staleness.yml, db-backup.yml, prod-health-smoke.yml,
                stranded-signups.yml]
    max_age_hours: 25
```

**State the boundary honestly rather than claiming "fully generic":** a new *check* is a registry
row and needs no code. A new *kind* of check is code. Two kinds cover all seven of today's alarms
because they all express themselves the same way — an open issue with an exact title, produced by a
workflow with a known schedule.

`github-issue-age` matches on **exact title**, the same way `check-deploy-drift.yml` already does,
and for the same reason its comment gives: `gh --search` token-matches `in:title`, so a different
issue sharing title words would be swallowed.

### 3. The channel is ops@, and it fails loudly

ops@ is the service-account inbox for automation (`.private/docs/accounts.md`) and is agent-read via
`scripts/read-ops-email.mjs`. It is the correct destination for agent-facing ops output, and routing
here gives `/weekly`'s currently-dead ops-email step something real to read.

**The escalator's own failure mode is inverted relative to the detectors.** The detectors are
`continue-on-error` on purpose — a detector that fails the build produces email floods. The
escalator is the opposite: if SMTP fails, the workflow **fails**, producing a GitHub Actions failure
notification. This is the one place in the system where a failure email is the correct outcome,
because a silent escalator is this exact bug one level up.

### 4. Escalate once per threshold crossing

On escalating, add the label `escalated` to the issue. The `github-issue-age` check skips issues
already carrying it. Persistent drift produces one email, not one per day — which is what made
per-push alerting fail before (20+ duplicates, per the workflow header).

### 5. N = 2 days

Against the table above, N=2 fires on #10 (4d) and #11 (3d) — both real misses — and stays silent on
#2, #3 and #8 (~1d, all self-resolved). Two of five fire, zero false alarms against the observed
base rate. N lives in the registry, so changing it is a one-line edit.

### 6. Watch the producers, and be honest about the regress

`workflow-last-run` catches a producer that has stopped running, so silence stops reading as health
— the failure `backup-staleness.yml` exists for, applied to the alarm layer. **Nothing watches the
watcher.** The regress is cut at one level deliberately: the escalator runs on the same substrate as
CI and `/ship`, so a total Actions outage is loud through other paths. Accepted residual, named
rather than papered over.

### 7. Per epistemic gate 7 and 7c, watch it fire *and* watch it stay quiet

Simulate an issue aged past the threshold and observe the email arrive. Then simulate a
one-day-old issue and an already-`escalated` issue and observe that nothing is sent. A gate whose
fixture contains only inputs it should catch has an unmeasured false-positive rate.

## Risks / Non-Goals

### Risks

- **MITIGATE — Alarm fatigue is the real failure mode of the fix.** Escalating per occurrence
  instead of per threshold crossing reproduces the 20+ duplicate-email failure. Mitigated by the
  `escalated` label (§4) and by age-based firing (§5).
- **MITIGATE — A silent escalator is this bug one level up.** Mitigated by failing the workflow on
  send failure (§3), which is the inverse of the detectors' `continue-on-error`.
- **ACCEPT — ops@ is read by `/weekly`, which is itself human-initiated.** This spec does not fix
  that, and does not need to: the escalation's job is to put a decision-ready item in the agent's
  inbox, not to guarantee sub-day latency. Escalation at N=2 days into a weekly-read inbox is
  strictly better than the status quo of never. If ops@ latency proves to be the next binding
  constraint, that is a follow-up with its own evidence.
- **ACCEPT — nothing watches the watcher** (§6).
- **MITIGATE — the escalator gains repo-secret access to a live mailbox.** It sends only; it never
  reads ops@, and it never receives. Body content is the issue body plus the fix commands, both of
  which already live in this public repo.

### Non-Goals

- **Do NOT auto-fix anything.** The escalation carries the fix commands (they are already in the
  issue body) so the human decision shrinks from "investigate" to "run these three lines." It never
  runs them. A prod deploy or migration is ALWAYS-ASK, and a workflow holding prod credentials that
  deploys unattended is a far larger blast radius than this spec's appetite. *(This reverses a
  suggestion made mid-conversation that the reader "prepare the fix" — the fix commands are
  pre-existing output, not something the reader generates.)*
- **Do NOT add a second detector anywhere, including `/push`.** The existing seven are correct and
  timely; duplicating them feeds the same channel. `decisions.md` 2026-08-09 (P1031) owns this.
- **Do NOT make any detector fail the build.** Alert-only was deliberate after per-push alerting
  produced 20+ duplicate emails. This applies to the seven detectors only — the escalator itself
  deliberately fails loudly (§3).
- **Do NOT notify the founder directly** — not Telegram, not personal email, not a `/push` block.
  The founder is not the consumer; that was this spec's original error.
- **Do NOT build this as drift-specific.** The registry is the deliverable as much as the reader.
- **Do NOT resolve issue #11's drift here.** That is live prod state and belongs with P1211; fixing
  it inside this spec would hide the escalation behind it and remove the live test case.
- **Do NOT make `/day` or `/weekly` run on a schedule.** Both are founder-facing session skills with
  far broader scope; cronning either to deliver one alert is the tail wagging the dog, and
  `decisions.md` 2026-08-09 routes automated work to workflows.

### Alternatives Considered

- **Notify the founder after N days** (the original spec). Rejected: contradicts the design intent
  in `check-deploy-drift.yml`, and rejected by the founder directly. Moves an unread signal to a
  different unread place.
- **Ops@ as a founder-read channel.** Rejected on the same grounds, but note the *reason* differs
  from the first draft's: ops@ is correct as an **agent** inbox and wrong as a founder inbox. Three
  genuine reads in seven weeks of history, all pull-on-demand for a specific purpose; the most
  recent was a session diagnosing that reading it hangs under VPN.
- **Local cron / launchd.** Rejected: requires the machine awake, and the machine currently has no
  crontab at all — an unattended job that only runs when the laptop is open reproduces the
  human-initiated defect with extra steps.
- **A scheduled cloud agent that reasons about and repairs the drift.** Rejected for *this* spec:
  it needs prod credentials to be useful, which is the blast radius the auto-fix non-goal excludes.
  Revisit only after escalation is proven.
- **Block `/push` on drift.** Rejected: catches drift only when someone deploys, says nothing in
  between, and structurally cannot see `FUNCTION_STALE` (out-of-band deploys) — which was half of
  issue #11.
- **Do nothing — `/ship` eventually catches it.** Rejected on evidence: it took three days for #10
  and only fired because of unrelated work, and it did not fire at all for #11.

### Rollback Strategy

Revert the commit. Detection is untouched by this spec, so rollback returns to today's alert-only
behaviour rather than to no monitoring. The `escalated` labels left on any issues are inert.

## Done-When

- [ ] An unattended consumer exists that reads the alert signal on a schedule with no session started
      and no human command typed
- [ ] The check list is a registry file; adding a new check of an existing kind requires editing data
      only, demonstrated by adding one check without touching the reader's code
- [ ] All seven alert-only workflows are covered by the registry, verified by diffing the registry
      against `grep -l "gh issue create" .github/workflows/*.yml`
- [ ] An issue aged past the threshold produces exactly one email to ops@, **observed firing** in a
      simulated run — not asserted
- [ ] The same issue on the following run produces **no** second email (once per threshold crossing)
- [ ] An issue younger than the threshold produces no email — the no-false-alarm case is tested, not
      only the catch case (gate 7c)
- [ ] A producer workflow that has not run in > 25h is itself reported
- [ ] A send failure **fails the workflow** — proven by simulating an SMTP failure and pasting the
      non-zero exit code (gate 7; note the agent shell is zsh, so `${pipestatus[1]}`, never
      `PIPESTATUS`)
- [ ] `OPS_EMAIL` / `OPS_EMAIL_PASSWORD` exist as repo secrets and a real send has succeeded once

## Pre-deploy Checklist

### Secrets to provision
- [ ] `OPS_EMAIL` — GitHub repo secret (value already in `.env.local`)
- [ ] `OPS_EMAIL_PASSWORD` — GitHub repo secret (value already in `.env.local`)

Founder action — the agent PAT excludes Administration scope and cannot create repo secrets.

### Post-deploy verification
- [ ] One `workflow_dispatch` run against the live open issue #11 (aged 3+ days) delivers one email
- [ ] A second `workflow_dispatch` run delivers nothing (label suppression holds)

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | founder | *"this is not for me, is it?"* — the spec's premise contradicted the design intent it quoted | **Premise rewritten**: consumer is an unattended agent, not the founder. `[FOUNDER DECISION]` removed entirely | `check-deploy-drift.yml` header: *"the agent watches this signal, not the founder's inbox."* The original Solution and Appetite were answering the wrong question |
| 2 | /challenge-prd | [BLOCK] *"`/day` is the only consumer… Nothing else in the repo reads it"* is false | Corrected — `/ship` step 3.6 (`ship.md:63`) is a second consumer of the drift *condition* | The verifying grep used `Deploy drift\|check-deploy-drift`; `/ship` contains neither token because it re-runs `check-deploy-manifest.sh`. Re-verified twice and stayed false both times because both runs used the same blind token (epistemic gate 1) |
| 3 | /challenge-prd | [BLOCK] Scope was 1 of 7 alarms | **All seven**, via a registry | `grep -l "gh issue create" .github/workflows/*.yml` → 7 producers; `grep -rln "gh issue list"` → 1 consumer. A drift-only fix leaves six identical holes |
| 4 | /challenge-prd | [BLOCK] The defect was live and unknown to the spec | Issue #11 folded in as evidence; step 1's transcript archaeology **deleted** | A live 3-day-old unread issue is stronger evidence than reconstructing 21–23 Aug, and it collapses a research task into an observation |
| 5 | founder | The checker must be expandable — don't rebuild when the next thing needs watching | Registry is data, check *kinds* are code; boundary stated explicitly rather than claimed generic | Two kinds cover all seven of today's alarms |
| 6 | agent | Telegram proposed as the channel, then withdrawn | Rejected | Proposed on an unverified inference ("you already act on it") drawn from `cloud-agent.sh` sending there. Founder: *"i dont check telegram."* Asserting an unverified consumption claim, inside a spec about unverified consumption claims |
| 7 | /challenge-prd | [WARN] Done-When #6 cited issue #10, already closed 2026-08-25 | Removed | The criterion had become a statement about history |
| 8 | /challenge-prd | [WARN] Nothing watches the producer | `workflow-last-run` check added (§6); the regress cut at one level, named as an accepted residual | Silence must stop reading as health — the reason `backup-staleness.yml` exists |
| 9 | agent | Mid-conversation suggestion that the reader "prepare the fix" | Rejected before implementation | Fix commands are pre-existing output in the issue body; generating or running them needs prod credentials, exceeding this spec's appetite |
| 10 | founder | New spec + reject P1155, vs. rewrite in place? | **Rewrite in place** | Never implemented (`status: backlog`, nothing built on it), so `/change-request` does not apply; `## Resolved Decisions` is the designed record for a premise change; a second P-number would require copying this Problem section and its evidence, which `Reference Over Duplication` forbids |

## Related

- **Same surface, both `status: week`, `severity: high`:** P1211 (frontend ships ahead of its
  migration with no gate) and P1246 (every pipeline control is advisory, none deterministic). P1246
  documents this exact triage error. **P1155 at `rank: 231`/`backlog` is mis-triaged relative to
  both** — reprioritize before or alongside implementation.
- **Same failure class:** P1147, P1153 — a signal produced correctly and read as clean. Here the
  signal was not even wrong; it was never read.
- **Constrains the solution:** `decisions.md` 2026-08-09 (P1031) — automated detection belongs in
  workflows, not skills. This spec fixes the consumption half without violating it.
- **Origin of the alert-only design:** the `check-deploy-drift.yml` header, which documents why
  per-push alerting was abandoned — and which states the design intent this spec had inverted.
- **Was cited as a sibling, now stale:** P1154 is in `features/archive/` (rejected). The live
  migration-collision work is P1211.
