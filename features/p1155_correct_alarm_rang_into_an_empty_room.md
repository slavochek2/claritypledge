---
status: in-progress
type: task
rank: 231
workstream: infrastructure
created_date: '2026-08-24'
tags: [monitoring, alerting, process, silent-skip]
delivery_stage: dev
pipeline_ran: [create-spec, challenge-prd, architect, adversarial-review, dev]
drafted_by: opus
driver: anomaly
feature_type: backend
flow: dev
pipeline_plan: [create-spec, challenge-prd, architect, adversarial-review, dev]
pipeline_skipped: ["ux -- no user-visible surface", "ui -- no components", "generate-tests -- /dev runs TDD; Done-When already requires observed firing plus the no-false-alarm case", "verify -- nothing to see in a browser", "decompose -- three files"]
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
     something due → one email to ops@ — issue number, title, age, URL. NOT the body.
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
row and needs no code. A new *kind* of check is code. Two kinds cover all seven of today's alarms:
each is an open issue with a known title, produced by a workflow with a known schedule.

**Correction — the seven do NOT all express themselves the same way.** An earlier draft of this
section claimed they did; that was false and is corrected here rather than quietly edited out.
Verified: `grep -l "select(.title==" .github/workflows/*.yml` returns **two** files
(`check-deploy-drift.yml`, `backup-staleness.yml`), which do a true exact-title `jq` match. The
other five — `auth-canary`, `csp-smoke`, `db-backup`, `prod-health-smoke`, `stranded-signups` —
use `gh issue list --search "$TITLE in:title"`, the token-matching form that
`check-deploy-drift.yml:72` explicitly documents as wrong:

> `# Exact-title match (NOT gh --search: `in:title` token-matches, so a different issue sharing`
> `# title words could swallow the comment).`

The knowledge was written down in the two hardened files and never propagated to their five
siblings — the same failure this whole spec is about, one layer down. `stranded-signups` also
carries **two** titles, so the registry must allow more than one title per producer.

**The reader therefore does not trust the detectors to be consistent.** `github-issue-age` does its
own exact-title match plus its own author check (Build Sequence 2a), independent of how the
producing workflow found or created the issue. That makes this spec robust whether or not the five
`--search` detectors are ever hardened.

**Recorded here because it WAS live, and is no longer.** The `--search` form was exploitable in
the producers themselves — an unrelated open issue sharing title words swallowed the detector's
comment, so a genuine alarm got appended to the wrong issue and never opened its own. This was
originally scoped out as a detector defect rather than a reader defect. The adversarial review
(A4) refused that split: a reader that only watches issues the producers can be diverted away from
watches nothing. All ten call sites across the seven producers were rewritten to the exact-title,
author-bound form in `5242694a7`, and `scripts/test-producer-author-bind.sh` extracts the jq filter
from the workflow files themselves so a regression in either direction fails rather than passing
quietly. Verified: `grep -n "gh issue list" .github/workflows/*.yml` returns no `--search` form.

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
  constraint, that is a follow-up with its own evidence — and it needs that evidence first, so it
  is deliberately not filed as a spec today.
- **ACCEPT — nothing watches the watcher** (§6).
- **MITIGATE — the escalator gains repo-secret access to a live mailbox.** It sends only; it never
  reads ops@, and it never receives. Body content is the issue body plus the fix commands, both of
  which already live in this public repo.

### Non-Goals

- **Do NOT auto-fix anything.** The escalation names the issue and links to it; the consumer is an
  agent, which can run `gh issue view <n>` to read the fix commands itself. It never runs them.
  *(Revised after adversarial review — an earlier draft inlined the issue body in the email. See
  Adversarial Review Findings A1.)* A prod deploy or migration is ALWAYS-ASK, and a workflow holding prod credentials that
  deploys unattended is a far larger blast radius than this spec's appetite. *(This reverses a
  suggestion made mid-conversation that the reader "prepare the fix" — the fix commands are
  pre-existing output, not something the reader generates.)*
- **Do NOT add a second detector anywhere, including `/push`.** The existing seven are correct and
  timely; duplicating them feeds the same channel. `decisions.md` 2026-08-09 (P1031) owns this.
  This still stands — adding an author check to an existing producer is hardening, not a new
  detector.
- **AMENDED 2026-09-08 — the seven producers ARE in scope, narrowly.** This spec originally said
  "do NOT fix the detectors." Adversarial review finding A4 showed the reader cannot function while
  the producers' find-or-append is unauthored, so an author check is added to each of the seven.
  **Nothing else in those files changes** — not their schedule, not `continue-on-error`, not their
  bodies. The `--search`-vs-exact-title inconsistency is not a separate item after all: author-binding
  and exact-title matching are the same edit at the same ten call sites, so fixing A4 closed it. All
  ten now use one canonical form; nothing about it remains outstanding.
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
behaviour rather than to no monitoring.

**Correction — the labels are NOT inert, and an earlier revision of this section said they were.**
The Post-deploy Checklist deliberately runs against **live issue #11**, which labels a real,
still-unresolved alarm `escalated`. If the feature is later reverted and re-applied, that label
permanently suppresses re-escalation of an alarm that was never fixed — silence again, caused by
the rollback path of the fix for silence. Revert is therefore two steps:

1. Revert the commit.
2. `gh issue edit <n> --remove-label escalated` on every issue the escalator touched, and delete
   the label (`gh label delete escalated`) so a later re-apply starts clean.

Repo secrets also persist through a revert; leave or remove them deliberately rather than assuming
the revert handled it.

## Done-When

- [x] An unattended consumer exists that reads the alert signal on a schedule with no session started
      and no human command typed
- [x] The check list is a registry file; adding a new check of an existing kind requires editing data
      only, demonstrated by adding one check without touching the reader's code
- [x] All seven alert-only workflows are covered by the registry, verified by diffing the registry
      against `grep -l "gh issue create" .github/workflows/*.yml`
- [x] All seven producers author-bind their find-or-append (and their close-on-recovery, where
      present), so a producer cannot be induced to append to an issue it did not create — with a
      fixture proving a genuine bot-authored issue is still matched (A4)
- [x] An issue aged past the threshold produces exactly one email to ops@ — **observed by running
      the script as a process**, not by asserting on an imported function's return value.
      `scripts/test-escalator-exit-codes.sh` stubs `gh` onto `PATH` and checks the three exit codes
      CI dispatches on: `0` nothing due, `1` due (and a message actually composed), `2` broken.
      Per gate 7 the failure path was exercised: removing the forced `EXIT_BROKEN` makes the two
      broken-case assertions fail with `expected exit 2, got 1`, and restoring it returns the suite
      to green. That regression is exactly A7 — a crash spelled the same way as a successful send,
      which no assertion inside the module can catch, because the module never sets the exit code
- [x] The same issue on the following run produces **no** second email (once per threshold crossing)
- [x] An issue younger than the threshold produces no email — the no-false-alarm case is tested, not
      only the catch case (gate 7c)
- [x] An issue past the threshold opened by an account other than `github-actions[bot]` produces no
      email — the untrusted-author case is tested (Security required change #1)
- [x] The registry's `match_title` values and the producers' `TITLE=` values are compared directly,
      extracted from both files rather than restated in a test — exact matching means one character
      of drift silently disables a check forever, and no fixture can catch it because fixtures
      supply their own titles. Byte-exact today across all 8 titles; failure path exercised in both
      directions (a retyped em-dash, and a renamed producer)
- [x] A producer workflow that has not run in > 25h is itself reported
- [x] A send failure **fails the workflow** — proven by simulating an SMTP failure and pasting the
      non-zero exit code (gate 7; note the agent shell is zsh, so `${pipestatus[1]}`, never
      `PIPESTATUS`), **and** the same simulation's output asserted free of the password
- [x] `MAILGUN_SENDING_KEY` / `MAILGUN_DOMAIN` / `OPS_EMAIL` exist as repo secrets

## Pre-deploy Checklist

### Secrets to provision — DONE 2026-09-08

All three are live repo secrets, created in the browser (the agent PAT returns 403 on
`actions/secrets`, so it cannot install them; the founder's logged-in session could).

- [x] `MAILGUN_SENDING_KEY` — a dedicated **domain-scoped sending key** on
      `mg.claritypledge.com`, minted via the EU API. Send-only, independently revocable,
      and distinct from the Mailgun **account** key, which is enrolled in P1239's locked
      half and must never enter CI.
- [x] `MAILGUN_DOMAIN` — `mg.claritypledge.com`
- [x] `OPS_EMAIL` — the ops recipient

`MAILGUN_REGION: eu` is a literal in the workflow, not a secret — a region name is not a
credential, and hiding it caused enough confusion already (see below).

**Region is load-bearing and was missing.** The account is in Mailgun's **EU** region.
`.env.local` sets `MAILGUN_REGION=eu`, the send layer reads it, and the earlier local
send therefore worked. The workflow did **not** pass it, so the first CI run would have
defaulted to the US base and 401'd with a correct key. Worse, the US API answers
`"domain not found"` for a live EU domain, so the symptom points at the domain rather
than the region — a full diagnostic detour ran on that false trail before the cause was
found. `MAILGUN_REGION` is now in the workflow env, both routes are pinned by fixtures,
and a non-2xx now names the base URL, the domain and the region rather than just the
status code.

## Post-deploy Verification — the one thing that cannot happen before merge

**Deliberately not part of the ship gate, and this section explains why rather than
asserting it.** Every item below needs a real GitHub Actions run. A run needs the
workflow on the default branch. Getting it there is the merge. So requiring these
before merging is not a strict gate, it is an unsatisfiable one — the spec's original
Done-When contained exactly that loop, authored by me, and the only way to make the
gate pass today would have been to tick boxes for things that had not occurred, which
is precisely what P1169 exists to stop.

The honest structure is: everything provable on a laptop is a Done-When item and is
ticked above; everything that needs the runner is here, unticked, and stays unticked
until someone runs it and pastes the result.

**`workflow_dispatch` is GitHub's manual "Run workflow" button.** It does not appear in
the Actions UI until the workflow file is on the default branch — which is why none of
this is reachable now, and why `gh api .../actions/workflows` currently returns nothing
for this workflow: GitHub has never seen it.

**Owner: whoever merges. Do this immediately after the merge, not "later" — an
escalator nobody has watched escalate is the same empty room this spec is about,
one level up.**

- [ ] One `workflow_dispatch` run against the live open issue #11 (aged 3+ days) delivers one email
- [ ] A second `workflow_dispatch` run delivers nothing (label suppression holds)
- [ ] **Remove the `p1155-escalated-2d` / `-7d` / `-30d` labels from #11 afterwards** — one per
      threshold the test run crossed; #11 is 3+ days old so at least `-2d` will be applied. The two runs above are a test, and #11
      is a live unresolved alarm — leaving the label on it silences its own re-escalation. Do this
      even if the feature stays: the label means "already escalated for this crossing", and the
      crossing being tested is synthetic.
- [ ] Confirm `concurrency:` actually serialized the two runs (check the Actions log for a queued,
      not concurrent, second run) — the two back-to-back dispatches are themselves the race the
      guard exists to stop

**The four P1155 canaries do not run at commit time in a worktree, and never have.**
Every worktree's `.git/hooks/pre-commit` is a symlink to the **main checkout's**
`scripts/pre-commit-checks.sh`, so the gating block added on this branch is invisible to
the hook until the branch merges. Confirmed: `git show main:scripts/pre-commit-checks.sh
| grep -c ALERT_PRODUCER_STAGED` returns `0`. Every green pre-commit run on this branch
therefore proves nothing about these canaries — the passes reported during development
came from invoking the script by hand, which is a different thing and was not
distinguished at the time. The wiring itself is correct and starts working the moment
this merges; the claim that had to be corrected is "wired and exercised", which was only
half true. Worth knowing generally: a canary added on a branch cannot gate that branch.

**If any item fails, the escalator is not working**, regardless of a green CI badge —
the badge only proves the job ran, and a job that decides nothing is due exits `0` too.

---

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

## Adversarial Review Findings

`/slava:think:adversarial-review`, 3 hostile reviewers (exploit / fail-open / forgeable), **3 of 3
reported**, 21 findings before dedup. Every finding below was re-verified by command in the main
session before being written here — the reviewers' claims are not the evidence, the commands are.

### A1 — [CRITICAL] The author check does not close the injection path. Do not email the body.

Author identity alone is not sufficient to trust an issue's *content*: the repo has a collaborator
tier that can alter issue content without altering its author, and can also alter the labels this
design uses as state. Mechanics, tier, and the enumerating command are in
`.private/docs/security-log.md` (P1155-A1) — not restated here, per CLAUDE.md's rule on unpatched
vulnerability mechanics in public files.

**Smallest fix, and it closes three findings at once:** the escalation email carries only issue
number, title, age in days, and the issue URL. No body, no comments, no fix commands. This works
*because the consumer is an agent* — it can run `gh issue view <n>` and read the untrusted content
in a context where that content has no privilege. Inlining was only ever needed for a human reader,
and the premise of this spec is that the reader is not human.

This also resolves:
- **A2 [LOW→moot]** — the escalator would have read `--json body`, frozen at creation time, while
  the real per-day detail lands in **comments** (verified: issue #10 has **4** bot comments). The
  email would have understated exactly the multi-day case this spec exists for.
- **A3 [HIGH→reduced]** — SMTP dot-stuffing severity. Still required (Build Sequence 4a-bis), but a
  title and URL are far smaller attack surface than a large attacker-editable body.

### A4 — [CRITICAL] The producers' find-or-append is not author-bound. Non-Goal collision.

None of the seven producers verify **who** authored the issue they append to — verified:
`grep -c "user.login\|author_association" .github/workflows/check-deploy-drift.yml` → 0, and the
same find-or-append shape appears in all seven (`check-deploy-drift.yml:74`, `backup-staleness.yml:87`,
`auth-canary.yml:54`, `csp-smoke.yml:61`, `db-backup.yml:191`, `prod-health-smoke.yml:77`,
`stranded-signups.yml:66,91`).

The consequence is that a producer can be induced to append to an issue it did not create, so no
bot-authored issue is ever created and `github-issue-age` — with its author check — correctly finds
nothing. Forever, reported as "nothing due," which is the normal healthy output. **The exploit path
is in `.private/docs/security-log.md` (P1155-A4)** and is deliberately not spelled out here while
the hole is open.

This is P1155's own defect one layer down: *alarm rang into an empty room* becomes *alarm never
rings*, and it is indistinguishable from health.

**This collides with the Non-Goal "do NOT fix the detectors."** The reader cannot compensate — it
cannot escalate an issue that was never created. **Founder decision, taken 2026-09-08: harden the
seven producers**, scoped narrowly to an author check in their find-or-append and nothing else. The
Non-Goal is amended accordingly (see Non-Goals).

### A5 — [CRITICAL] "Escalate once per threshold crossing" is implemented as "escalate once, ever."

Decision 5's `escalated` label is a permanent boolean. Once set, that issue never escalates again —
whether it stays open 3 days or 300. This *removes* the one redundancy today's broken system has:
the daily re-append. **Fix:** re-escalate on a cadence rather than never — carry the date in the
label (`escalated-YYYY-MM-DD`) or re-fire at successive thresholds (2, 7, 30 days). A permanent
suppression flag inside a spec about permanent silence is the wrong shape.

### A6 — [CRITICAL] Unrecognized `kind` fails open and is untested.

A typo'd or stale `kind` in the registry dispatches to nothing, returns exit 0, and reads as
"nothing due." Same for a `match_title` that matches nothing forever. **Fix:** unknown `kind` is
exit 2 (loud). Add a fixture. Consider warning on any check that has never matched anything.

### A7 — [HIGH] Node's default crash exit code collides with "email sent."

The 0/1/2 convention assigns **1** to "something due, email sent" — but Node exits **1** on an
uncaught exception. A crash before the send (malformed registry JSON, a `gh` parse error) is
therefore indistinguishable from a successful escalation. **Fix:** wrap `main()` and force
`process.exit(2)` on any unhandled error. Fixture required.

### A8 — [HIGH] `gh issue list` defaults to 30 results, newest first.

Verified: `gh issue list --help` → `-L, --limit int  (default 30)`. The old, long-drifting issues
this check exists to find are structurally the first to fall off that page as issue volume grows,
and the result reads as "nothing due," not as an error. **Fix:** pass an explicit `--limit`, or
query by title/state directly rather than listing and filtering client-side.

### A9 — [MEDIUM] Only 2 of 7 producers self-heal-close.

Verified: `grep -l "gh issue close" .github/workflows/*.yml` → `check-deploy-drift.yml`,
`backup-staleness.yml` only. The other five depend on a human or agent closing the issue.
`github-issue-age` evaluates **open** issues only, so a prematurely-closed alarm is invisible
forever for five of seven signals. Recorded as a known limitation of the coverage claim.

### A10 — [MEDIUM] Undocumented liveness precondition: GitHub disables `schedule:` after 60 days of repo inactivity.

Not mentioned anywhere in this repo (grepped, zero hits). The current commit cadence masks it. It is
a real precondition for every one of the seven producers *and* for the escalator itself, and
"an Actions outage is loud elsewhere" does not cover it — a silently-disabled cron is not an outage.

### A11 — [MEDIUM] `workflow-last-run` shares the substrate it watches.

Already named as an accepted residual in §6, but the reviewers sharpened it: a correlated failure
(billing/quota exhaustion, an org permission change, the 60-day disable above) takes down the
escalator and all seven producers *together*, which is precisely when the watch is needed. The
residual stands, but it is wider than §6 claimed.

### A12 — [MEDIUM] The `escalated` label is not trustworthy state.

Follows from A1 — the same tier that can alter issue content can alter labels. A label can be
cleared (forcing re-escalation) or pre-applied to a fresh alarm (suppressing it before it fires).
No separate fix beyond A5's cadence, which bounds how long a pre-applied label can suppress.

### A13 — [LOW] Gate 7b: the fixture suite cannot reach most of the above.

The fixtures feed canned objects to pure evaluate functions. Pagination truncation (A8), unknown
kind (A6), crash exit codes (A7) and every SMTP-layer behaviour live outside that boundary. Stated
plainly rather than letting "observed firing" imply more coverage than it has.

### Open question this review created — RESOLVED

A4 forced a choice the spec had ruled out. Options were: harden the producers (amends a Non-Goal),
re-derive the condition in the reader (rejected on sight — that is a second detector, which
`decisions.md` 2026-08-09 forbids), or accept the hole (not a security posture).

**Founder decision 2026-09-08: harden the seven producers**, narrowly. Non-Goal amended above;
Build Sequence step 0 added.

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

## Technical Architecture

### Technical Analysis

**Current code state — the seven producers, read in full.** `check-deploy-drift.yml`,
`backup-staleness.yml`, `prod-health-smoke.yml`, `auth-canary.yml`, `stranded-signups.yml`,
`db-backup.yml`, `csp-smoke.yml` all run on `schedule:` + `workflow_dispatch:`, pin
`actions/checkout` by SHA (`actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4`),
declare `permissions: contents: read` + `issues: write` (`db-backup.yml` also `id-token: write`
for GCP auth), and use `continue-on-error: true` on the detection step so the job stays green
while `steps.<id>.outcome` carries the real result to a conditional issue step.

**Two exact-title conventions coexist — only one is correct, and the spec already flags this
(§2, "the same way `check-deploy-drift.yml` already does").** `check-deploy-drift.yml:74-79` and
`backup-staleness.yml:87-92` do a true exact-title match:
```bash
existing=$(gh issue list --state open --json number,title \
  | jq -r --arg t "$TITLE" '[.[] | select(.title==$t) | .number] | first // empty')
```
`prod-health-smoke.yml:77`, `auth-canary.yml:54`, `db-backup.yml:191`, `stranded-signups.yml:66,91`
**used to** instead use `gh issue list --state open --search "$TITLE in:title" --json number --jq
'.[0].number // empty'` — `gh --search` token-matches `in:title`, which is exactly the failure mode
the spec's Problem section warns about.

**This analysis is kept as written, and then corrected, because the correction is the finding.**
The original conclusion — a pre-existing inconsistency, out of scope, noted for the next reader —
was wrong, and wrong in a way worth preserving: the reader this spec builds cannot be more reliable
than the issues it reads, so leaving five of seven producers divertible would have left the whole
mechanism divertible while every test went green. A4 overturned it. All ten call sites now use the
single exact-title, author-bound form, and `scripts/test-producer-author-bind.sh` binds the test to
the workflow files rather than restating their filter.

**Body-building convention.** `check-deploy-drift.yml` and `backup-staleness.yml` build the issue
body into a file (`> issue-body.md`) and pass `--body-file`, keeping shell interpolation out of
the body text. `github-issue-age`'s escalation email reuses the issue body verbatim (fetched via
`gh issue view <n> --json body`) — no new body-construction logic needed for that half.

**No YAML parser dependency exists.** `package.json` (read in full) has zero YAML libraries in
either `dependencies` or `devDependencies` — no `js-yaml`, no `yaml`. **Registry is JSON, not
YAML** (see Decision 1) — the spec's own `.github/alert-registry.yml` shape was marked
illustrative and `/architect owns the final schema`.

**No SMTP-send capability exists yet; an IMAP-read one does, and it is the reuse target.**
`grep -rln "nodemailer\|smtp\|SMTP\|sendmail" scripts/ package.json` returned nothing —
`nodemailer` is not a dependency anywhere. `scripts/read-ops-email.mjs` (read in full) is a
zero-dependency Node script that speaks raw IMAP over `tls.connect()` directly — no imap
library, hand-rolled tagged-command protocol state machine (`LOGIN` → `SELECT INBOX` → `FETCH` →
`LOGOUT`). It reads `OPS_EMAIL` / `OPS_EMAIL_PASSWORD` from `.env.local` and connects to
`w00dd4f1.kasserver.com:993`. `.private/docs/accounts.md:154` confirms the same host serves SMTP
on port 465 as SMTPS ("SMTP: 465 (SMTPS — use this; 587 filtered locally)") — same mailbox, same
credential pair, symmetric protocol shape (line-based, `\r\n`-terminated, tagged-response-free for
SMTP but reply-code-based). **This is the reuse precedent for the escalator's send step** — see
Decision 4.

**No `node scripts/x.mjs` step exists inside any `.github/workflows/*.yml` today.**
`grep -rn "node scripts/\|npx tsx\|\.mjs" .github/workflows/*.yml` matched only a code-comment
mentioning `prod-smoke-test.mjs`, never an actual CI invocation. Every workflow's logic is bash +
`gh` + `jq`, or a dedicated `.sh`/`.py` script (`scripts/check-backup-staleness.sh`,
`scripts/check-stranded-signups.sh`, `scripts/auth-canary.sh`). `prod-health-smoke.yml` does show
the pattern for adding Node to a workflow when needed (`actions/setup-node@...` then `npm ci`),
so precedent exists for wiring Node into CI — just not yet for a plain script invocation. This is
a **new pattern for this repo, justified below** (Decision 2).

**No `gh issue edit --add-label` / `gh label create` call exists anywhere in the repo.**
`grep -rn "add-label\|--label\|labels:" .github/workflows/*.yml scripts/*.sh` matched only
unrelated uses of the word "label" in `migrate.sh` and `pre-commit-checks.sh` (their own
internal --label flag, nothing to do with GitHub issue labels). **The `escalated` label does not
exist in the repo's label set today** — `gh issue edit --add-label <name>` fails if the label is
not already registered on the repo; it does not silently create one. This must be provisioned
(idempotently, in-workflow) before the first label-add — see Decision 5 and Files to Modify.

**Exit-code convention for "kind" checks.** `scripts/check-stranded-signups.sh` (read in full,
header comment) establishes a 3-way convention worth reusing for both `kind` implementations:
`0` = clean, `1` = the alerting condition (something to report), `2` = the check itself could not
run (missing credential, API error) — never conflated with "found nothing," because a broken
credential must not read as a clean day. Both `github-issue-age` and `workflow-last-run` follow
this in their pure-evaluation layer (Decision 3).

**PAT scope — UNVERIFIED for local dev use, and the distinction matters.** The repo has two
separate credential surfaces and this spec's constraints apply differently to each:
1. **In-workflow (`${{ github.token }}`)** — every existing detector authenticates with the
   Actions-minted `GITHUB_TOKEN`, scoped per-workflow by its own `permissions:` block (e.g.
   `issues: write`), completely independent of any developer's personal token. This is what the
   escalator itself will use in production, and `issues: write` is confirmed sufficient for
   `gh issue list`/`comment`/`create` by the seven existing precedents. Whether `issues: write`
   also covers `gh issue edit --add-label` and `gh label create` is **not exercised anywhere in
   this repo's history** (the label-usage grep above returned zero hits) — GitHub's documented
   permission model says Issues write covers labels, but per epistemic gate 7b that is inference
   from documentation, not an observed pass in this repo. **UNVERIFIED — must be exercised in the
   Simulate step (Build Sequence step 6) before this is trusted.**
2. **Local/dev (`gh` CLI via the fine-grained PAT `cp-agent-push`)** — `.private/docs/accounts.md:57`
   states this PAT's scope as **Contents R/W + Metadata R only — no Administration, and Issues is
   not listed**. If Issues is genuinely absent from this PAT's grant, the *architect/dev agent*
   cannot locally exercise `gh issue create`/`edit`/`label` against the live repo using its own
   credential — only the in-CI `github.token` can. This has one direct consequence for the
   Post-deploy Checklist's two `workflow_dispatch` runs: **triggering a `workflow_dispatch` run via
   `gh workflow run` requires Actions:write on the caller's token**, which is also not listed on
   `cp-agent-push`. **UNVERIFIED — flagging rather than assuming.** If `gh workflow run` fails
   locally with a scope error, the fallback is the GitHub web UI's "Run workflow" button (founder
   action, not a blocker to building this — Pre-deploy Checklist already routes secret provisioning
   to the founder for the same reason).

### Architecture Decisions

**Decision 1 — Registry is JSON (`.github/alert-registry.json`), not YAML.**
Chosen: JSON. Rationale: Technical Analysis confirms zero YAML-parsing dependency exists in
`package.json`; `JSON.parse()` is a zero-dependency, zero-install native call, and the registry's
own shape (a `checks:` array of flat objects — `id`, `kind`, and 2-4 kind-specific scalar/array
fields) has no need for YAML's extra expressiveness (anchors, multi-line strings, comments).
Trade-off: comments are not native to JSON, so the "why does this check exist" context that YAML
comments would carry inline must live in a sibling `id`-keyed doc comment at the top of the
reader script instead, or as a `note` field per entry — the reader ignores unknown fields, so this
is free. Alternative rejected: YAML as the spec illustrated it — would require adding a parsing
dependency (`js-yaml` or similar) solely for this one file, when the repo has gotten this far with
zero YAML anywhere; a new dependency for a data file this small fails the "reuse before build"
principle the spec itself invokes in the Problem section epigraph. New because inventory shows no
existing JSON *or* YAML alert-registry pattern to converge on either way — this is a fresh choice,
resolved by what's already a dependency vs. what isn't.

**Decision 2 — The reader is a Node script (`scripts/alert-escalator.mjs`), not inline bash.**
Chosen: Node script, invoked from the workflow as `node scripts/alert-escalator.mjs` (plus a
`--dry-run` flag for local/CI-safe simulation). Rationale: the spec's Done-When items require
*locally* exercising four distinct scenarios (fires once, doesn't fire twice, doesn't fire under
threshold, SMTP-failure produces non-zero exit) — this needs unit-testable pure logic, which bash
sourced-and-mocked (the `gh() { ... }` shadowing pattern) does not exist anywhere in this repo's
test scripts (`grep -rn "mock.*gh\|gh()\s*{" scripts/test-git-ops-ship.sh scripts/test-goal-gate.sh`
returned nothing — every existing bash test canary builds a real hermetic fixture repo instead,
e.g. `scripts/test-goal-gate.sh`'s `build_fixture()`, which is far heavier machinery than a JSON
registry needs). Node lets the evaluation logic be a pure function — `evaluateCheck(check, data,
now)` — that a small test script feeds canned fixture objects shaped exactly like `gh issue list
--json number,title,createdAt,labels` / `gh run list --json createdAt,conclusion` output, with zero
network calls and zero `gh` auth required to run the test suite. The `gh` calls themselves live in
a thin fetch layer the pure function never touches. Trade-off: this is the first `node scripts/x.mjs`
invocation inside any workflow YAML in the repo — `prod-health-smoke.yml` already establishes the
`actions/setup-node` + `npm ci` wiring pattern needed to add Node to a job, so the marginal cost is
one more `setup-node` step, not a new capability. Alternative rejected: inline bash matching the
seven detectors' style — rejected specifically because Done-When's four fixture scenarios need
pure-function unit testing that bash-with-mocked-`gh` has no precedent for in this repo, and
building that precedent from scratch is more machinery than switching to Node.

**Decision 3 — Two `kind` implementations as pure functions inside the one script, sharing a
fetch/evaluate split.** Chosen: `scripts/alert-escalator.mjs` contains `fetchGithubIssueAge(check)`
/ `evaluateGithubIssueAge(check, issues, now)` and `fetchWorkflowLastRun(check)` /
`evaluateWorkflowLastRun(check, runs, now)`, each following the 0/1/2 exit-code convention from
`scripts/check-stranded-signups.sh` (Technical Analysis) at the whole-script level: `0` nothing due,
`1` something is due for escalation (email sent, per check below), `2` the reader itself could not
run (malformed registry, `gh` call failed) — this must fail the workflow per the spec's §3 inverted
failure mode, never read as "quiet." Rationale: reuses `check-deploy-drift.yml`'s exact-title jq
filter (Technical Analysis) for `github-issue-age`'s issue lookup; `workflow-last-run` reuses the
same `gh run list --json createdAt,conclusion --limit 1` shape hinted at in the assignment and
confirmed to require only `actions: read` on the workflow's own `permissions:` block (new
permission for this repo — no existing workflow declares it, per the grep in Technical Analysis,
but it is a standard, narrowly-scoped read grant on the token this workflow already controls).
Trade-off: `workflow-last-run` cannot distinguish "producer never ran" from "gh run list errored"
without checking the call's own success first — the fetch layer must surface that distinction
(exit 2) rather than let an empty array silently mean "ancient." Alternative rejected: one giant
`kind`-agnostic evaluator — rejected because the two kinds' data shapes (issue metadata vs. run
history) share nothing beyond "a timestamp and a threshold," so a shared evaluator would need a
kind-dispatch inside it anyway; splitting at the top level is the same amount of code with a
clearer boundary for "add a third kind" per the spec's own extensibility requirement (§2).

**Decision 4 — SUPERSEDED 2026-09-08. Email goes through Mailgun's HTTP API, not raw SMTP.**
The original decision (kept below for the reasoning trail) chose a hand-rolled zero-dependency
SMTP client mirroring `read-ops-email.mjs`. That was wrong on two counts, both found by
building it: the IMAP precedent transfers the socket handling and **none** of SMTP's content
rules (dot-stuffing, 998-octet lines, CRLF, charset — `grep -c "DATA\|dot" read-ops-email.mjs`
→ 0), and the client produced two real defects in one session (a mid-reply continuation line
read as a complete response — intermittent and network-dependent; and an unreachable QUIT
branch). Mailgun is already wired into five edge functions, so the API path is reuse rather
than a new dependency, its credential is a scoped sending key rather than a mailbox password,
and the entire SMTP content surface ceases to exist. `scripts/send-ops-email.mjs` now posts to
`/<domain>/messages`; the handshake test is replaced by `scripts/test-mailgun-send.mjs`.
A 2xx without a message id counts as **sent** (P1256) — reporting it as not-sent causes retries,
i.e. duplicates.

*Original reasoning, superseded:*
**Decision 4 (superseded) — Email is sent via a new zero-dependency raw-SMTP script
(`scripts/send-ops-email.mjs`), not nodemailer.** Chosen: a small Node module that speaks SMTP
directly over `tls.connect()` to `w00dd4f1.kasserver.com:465` (SMTPS, confirmed in
`.private/docs/accounts.md:154`), mirroring `scripts/read-ops-email.mjs`'s hand-rolled protocol
state machine (that script does `LOGIN`/`SELECT`/`FETCH`/`LOGOUT` over IMAP; this one does
`EHLO`/`AUTH LOGIN`/`MAIL FROM`/`RCPT TO`/`DATA`/`QUIT` over SMTP — same shape, same credential
pair `OPS_EMAIL`/`OPS_EMAIL_PASSWORD`, same `.env.local` read pattern, same "no library" posture).
Rationale: `nodemailer` is not currently a dependency (Technical Analysis grep confirmed zero
hits), and adding it purely for one CI-only send would be a new dependency in a repo whose
`package.json` `dependencies` array ships in the frontend bundle — `nodemailer` would need to land
in `devDependencies` specifically to stay out of the Vite build (Vite only bundles what's
imported from `src/`, and this script is never imported there, so even a `dependencies`-listed
nodemailer would not reach the shipped bundle in practice — but `devDependencies` is still the
correct, unambiguous placement for a CI-only tool). Given `read-ops-email.mjs` already proves the
zero-dependency raw-socket approach works against this exact mailbox, matching that precedent is
more consistent with repo convention than introducing the first mail-sending library. Trade-off:
hand-rolled SMTP is more code than `nodemailer.sendMail()` and carries the same protocol-fragility
risk `read-ops-email.mjs`'s own header comments document (e.g., its comment about a body-literal
parsing bug it once had) — mitigated by keeping the script narrow (plain-text body only, single
recipient, no attachments, no HTML) since the escalation email's content (issue body + fix
commands) is already plain text. Alternative rejected: `nodemailer` as a new `devDependency` —
rejected on the reuse-inventory finding that this repo has an established zero-dependency
protocol-script convention for this exact mailbox, and a second approach (library-based) for the
same mailbox would be the inconsistency the Reference-Over-Duplication principle warns against.
**Flagging, not asserting:** this script is new and unexercised — Build Sequence step 5 requires a
real send succeed once against ops@ before this decision is considered validated (Done-When's
final item already requires this).

**Decision 5 — Escalation tracking is the `escalated` GitHub label, provisioned idempotently
in-workflow, not a marker comment or committed state file.** Chosen: `gh label create escalated
--color "B60205" --description "Alert threshold crossed; do not re-escalate" --force` as the first
step of the escalation action (idempotent — `--force` updates rather than errors if the label
already exists), immediately followed by `gh issue edit <n> --add-label escalated`. Rationale: the
spec's §4 names this label directly, and a label is queryable in the same `gh issue list --json
number,title,labels` call the exact-title lookup already makes — no second read path needed to
check "already escalated," unlike a marker comment (would need `gh issue view <n> --json comments`
and a text-content sniff, one extra `gh` call, and a note is not evidence of state as directly as a
label). Trade-off: per Technical Analysis, `escalated` does not exist in the repo's label set yet
and `gh issue edit --add-label` does not auto-create it — the idempotent `gh label create --force`
step closes that gap without needing a founder-run one-time setup step, at the cost of one extra
`gh` call per escalation. This is the one part of Technical Analysis's PAT-scope UNVERIFIED flag
that must be exercised in Build Sequence step 6 (Falsify Before You Rely) — if `issues: write`
does not cover label creation, this decision needs revisiting toward a marker-comment fallback
(named in Alternative rejected below, not built). Alternative rejected: a marker comment
(`gh issue comment <n> --body "escalated:2026-09-08"` + a `gh issue view --json comments` grep to
check it) — rejected as the fallback-of-record only if Decision 5's own label-creation step proves
unavailable under `issues: write`; carries strictly more `gh` calls and a text-matching read for no
benefit if labels work. A committed state file (e.g. `.github/escalated-state.json` updated via a
bot commit) was also considered and rejected: it requires `contents: write` on the escalator's
`permissions:` block (a wider grant than `issues: write` for the same job) and a self-commit step
that every other alert-only workflow in this repo deliberately avoids (none of the seven commits
back to the repo).

**Decision 6 — N=2 days lives in the registry per check, not as a script constant.** Chosen:
`escalate_after_days` (for `github-issue-age`) and `max_age_hours` (for `workflow-last-run`) are
both registry fields, exactly as the spec's illustrative shape shows. Rationale: reuses inventory
finding that the spec's own §5 states "N lives in the registry, so changing it is a one-line edit"
— this is a spec-level design requirement, not a fresh call, restated here only to confirm the
JSON registry (Decision 1) preserves it losslessly (both fields are plain JSON numbers). No
alternative considered — the spec already resolved this.

### Security Review
**Credential Blast Radius:** ⚠️ FINDINGS

- `OPS_EMAIL_PASSWORD` is a raw All-Inkl mailbox password used for BOTH IMAP (read, via
  `scripts/read-ops-email.mjs`) and SMTP (send) on the same account — confirmed by
  `docs/technical/mcp-servers.md:126-141` and `.private/docs/accounts.md` (candidate
  `manual-only` tier, "founder to confirm"). It is not a scoped send-only credential, an
  app-specific password, or an API token — All-Inkl/KAS hosting has no evidence in this repo
  of supporting scoped SMTP-submission-only credentials (grep of `docs/technical/` and
  `.private/docs/` found none; mark this UNVERIFIED — worth a direct check with the founder
  or All-Inkl's KAS panel before assuming no scoped option exists).
- Putting this password in GitHub Actions secrets means: leak → attacker gets full IMAP
  read of the ops@ inbox, not just send capability. `.private/docs/accounts.md:25` states
  ops@ is "the default email for all service account signups" — i.e. the account-recovery
  / password-reset destination for an unknown number of third-party service registrations.
  **Class of exposure, not enumerated:** compromising this mailbox's password would let an
  attacker intercept password-reset and account-recovery email for whatever services were
  registered under it — the accounts registry (`.private/docs/accounts.md`) lists several
  rows using `ops@claritypledge.com` as the registration email. I have not listed which
  ones here per the instruction to describe the class rather than the specific services.
- `.private/docs/accounts.md`'s own credential-tier taxonomy already has a category for
  "can mint/administer/revoke other credentials" being barred from `auto-api` tier
  (2026-06-27 rule). A full mailbox password that also gates every account-recovery email
  sent to that mailbox arguably belongs in that same barred category, even though its
  literal function (send/read mail) isn't administrative. This is a judgment call for the
  founder, not something I can resolve from the files alone — flagging it explicitly.
- **Fork/PR exposure check:** `grep -n "pull_request_target\|pull_request" .github/workflows/*.yml`
  → no workflow in this repo uses `pull_request_target` (the dangerous trigger that runs
  with base-repo secrets against a fork's code). The six matches are all plain `pull_request`
  (`goal-gate.yml`, `privacy-scan.yml`, `secret-scan.yml`, `ui-gate.yml`, `test.yml`), which
  GitHub does not grant fork-originated secrets to by default. **This is a non-issue for the
  credential-exfiltration-via-malicious-workflow-code vector.** The real vector for this spec
  is different — see "Issue-Body Trust Boundary" below, which does not require a fork PR at
  all, just an open GitHub Issue.
- **Recommended mitigations, ranked:**
  1. Verify with All-Inkl/KAS whether a scoped SMTP-submission-only credential (separate from
     the mailbox login password) exists; if so, provision a NEW dedicated credential for this
     workflow rather than reusing `OPS_EMAIL_PASSWORD`. This is the highest-leverage fix —
     it caps the blast radius of a leaked GitHub secret to "send mail as ops@", not "read the
     whole inbox."
  2. If no scoped credential exists, at minimum use a GitHub **environment** (Settings →
     Environments) with required reviewers or a wait timer gating this specific secret, so a
     compromised PAT or a rogue workflow edit can't silently exfiltrate it without a
     human-visible approval step. (No existing workflow in this repo uses environments today —
     `grep -n "environment:" .github/workflows/*.yml` returned nothing — so this would be new
     infrastructure; note it plainly as such rather than presenting it as already-proven.)
  3. Least-privilege the workflow's `permissions:` block (see below) so that even if the
     credential leaks via a different path, the workflow's OWN GITHUB_TOKEN can't be combined
     with it to escalate further.

**Issue-Body Trust Boundary:** ⚠️ THIS IS THE KEY FINDING

- Confirmed by reading `.github/workflows/check-deploy-drift.yml` in full: its find-or-append
  logic matches an existing issue purely by **exact title string**:
  ```
  existing=$(gh issue list --state open --json number,title \
    | jq -r --arg t "$TITLE" '[.[] | select(.title==$t) | .number] | first // empty')
  ```
  There is no check anywhere in this workflow of `.user.login` / `.author_association` on the
  matched issue. It matches ANY open issue with that exact title, regardless of who opened it.
- This repo is public AGPL-3.0 (confirmed via `CONTRIBUTING.md` and root `LICENSE`). Read
  `CONTRIBUTING.md` in full — it describes the CLA/licensing process for code contributions
  but says nothing about restricting GitHub Issue creation. There is no `.github/ISSUE_TEMPLATE`
  directory (`ls .github/ISSUE_TEMPLATE` → No such file or directory) and no repo-level
  issue-creation restriction is visible in the codebase. On a standard public GitHub repo,
  **any authenticated GitHub user can open an issue with an arbitrary title and body** — this
  does not require a PR, a fork, or any workflow-run approval gate (those gates, where they
  exist, apply to PR-triggered CI, not to issue creation).
- **Concrete attack:** an attacker opens an issue titled exactly `Deploy drift detected on prod`
  (or `Auth canary failing`, or whichever exact titles the other six detectors use — same
  pattern per the spec's own §2 table) with an attacker-controlled body, and does nothing else.
  Two days later (the spec's own N=2 threshold, §5), the new `github-issue-age` check in this
  spec's registry finds that issue, sees it's older than `escalate_after_days`, and — per
  Solution §"something due → one email to ops@ with the fix commands inline" and the spec's
  own Risk note ("Body content is the issue body plus the fix commands") — emails the
  attacker's issue body to ops@. The escalator has no way to distinguish this from a genuine
  `check-deploy-drift.yml`-opened issue, because neither the existing detector NOR the proposed
  registry-driven reader checks the issue author.
- This is functionally the same trust-boundary bug class as `pull_request_target` (a trusted,
  secret-bearing automation context consuming attacker-controlled content) even though the
  trigger here is `schedule`/`workflow_dispatch`, not a PR event — the vulnerable step is
  "read untrusted content, act on it with privilege," not "run untrusted code."
- **Verify by reading the workflow** — done above; this is not a hypothesis, it's read directly
  from `check-deploy-drift.yml`'s `jq` filter, which is the exact pattern the spec says the new
  `github-issue-age` check kind will reuse (§2: "the same way `check-deploy-drift.yml` already
  does").
- **Header injection:** GitHub issue titles are single-line UI fields, but I could not verify
  from this repo whether the GitHub API strips/rejects embedded CR/LF in a title (mark
  UNVERIFIED — test against the real API before relying on it). Issue **bodies** definitely
  allow arbitrary newlines and arbitrary text. Per `docs/technical/mcp-servers.md:140`, the
  intended send implementation is "the same raw TLS pattern" as `scripts/read-ops-email.mjs`
  (hand-rolled protocol, not a hardened mail library) — hand-rolled SMTP is exactly where
  header injection bugs happen: if the implementation builds a `Subject:` or any other header
  line by concatenating issue-derived text (title, check id, or any excerpt) into the raw SMTP
  `DATA` header block without stripping `\r`/`\n`, an attacker can inject arbitrary additional
  headers (extra `To:`/`Bcc:`, or even smuggle a second message). The issue **body** going into
  the message BODY (after the header/body blank-line separator) is not a header-injection risk
  by itself — only issue-derived text placed into HEADER fields is.

**Workflow Permissions:** ⚠️ minor

- Confirmed via `grep -n "^permissions:\|^  contents:\|^  issues:\|^  actions:" .github/workflows/*.yml`
  — every existing detector workflow (`auth-canary`, `check-deploy-drift`, `backup-staleness`,
  `csp-smoke`, `prod-health-smoke`, `stranded-signups`) uses the same minimal block:
  ```
  permissions:
    contents: read
    issues: write
  ```
  This repo's convention is job-level least-privilege, no workflow grants more than it needs,
  and none currently requests `actions: read`.
- The spec's Solution needs `actions: read` (to check `workflow-last-run`) in addition to
  `issues: write` (to label issues `escalated`). Both are read-mostly / narrow-write scopes;
  neither grants `contents: write`, `pull-requests: write`, or `administration`. This matches
  the repo's existing least-privilege convention — no objection to the scope itself.
- No workflow in this repo uses a GitHub `environment:` block (`grep -n "environment:"
  .github/workflows/*.yml` → no matches), so environment-protection gating (mitigation #2
  above) would be new infrastructure for this repo, not an existing pattern to lean on.
- `github.token` (the automatic `GITHUB_TOKEN`) is scoped per-workflow via the `permissions:`
  block and is separate from the agent's local `gh` PAT (`cp-agent-push`, which excludes
  Administration per `.private/docs/accounts.md`). The new workflow should declare its own
  minimal `permissions:` block explicitly (repo default may be broader) rather than relying on
  the org/repo default — this is what every existing detector already does, so it's a
  copy-the-existing-pattern instruction, not a new ask.

**Secret Leakage in Logs:** ⚠️ one concrete required mitigation

- No implementation exists yet (this is a spec), so I can't grep the actual send script. I can
  ground this in the one existing script that does the same class of operation:
  `scripts/read-ops-email.mjs` builds a raw IMAP command containing the password
  (`send(\`LOGIN ${USER} "${PASS}"\`)`) and writes it directly to the TLS socket — I confirmed
  by reading the file that it does NOT `console.log` this command or any other line containing
  `PASS`. That's the correct pattern to replicate for the new SMTP script: construct the raw
  `AUTH`/credential line and write it to the socket without ever passing it through a log
  statement.
- Concrete required mitigations for the new script/workflow, based on documented real leak
  paths (epistemic gate 7's failure-path-must-be-exercised rule applies here too — this must be
  tested, not just written defensively):
  1. Never use `set -x` (or any shell trace mode) in a step that has the SMTP password in an
     env var — trace mode echoes every command including credential-bearing ones. None of the
     existing workflows currently set `-x` (confirmed by grep — no matches), so this is a
     "don't introduce it" instruction, not a fix to existing code.
  2. Never build a connection string or inline URL containing `${{ secrets.OPS_EMAIL_PASSWORD }}`
     for logging/debugging purposes (e.g. printing "connecting to smtp://user:pass@host" for a
     debug step) — GitHub's secret-masking only redacts the exact literal secret value it knows
     about; a re-encoded or concatenated form (e.g. base64, or interpolated into a longer string
     the masker doesn't recognize verbatim) can bypass masking.
  3. If any SMTP client library is used instead of a hand-rolled socket, disable verbose/debug
     SMTP logging (`nodemailer`'s `debug`/`logger` options, for example, dump the full SMTP
     transcript including the `AUTH` exchange) — verify this is off, don't assume the default.
  4. Per the spec's own Done-When ("A send failure fails the workflow... pasting the non-zero
     exit code"), the failure path MUST be simulated per epistemic gate 7 before shipping — and
     that simulation should specifically confirm the failure output does NOT print the password
     (e.g., a library's exception message that echoes the connection config verbatim on auth
     failure is a common, easy-to-miss leak; test this, don't assume it's masked).

**Public-Repo Disclosure:** ✅

- The new files this spec proposes (`.github/alert-registry.yml`, the new workflow, the reader
  script) contain only: check ids, issue-title strings that already exist verbatim in the
  existing seven workflows, workflow filenames, and threshold numbers (N=2 days, 25h). All of
  this is already public (the existing workflows' exact titles, e.g. "Deploy drift detected on
  prod", are already committed and public today). No new sensitive data is introduced by the
  registry or reader files themselves.
- Checked `.claude/rules/pii.md` — this spec's content (workflow config, no user/customer data,
  no private individual referenced) does not implicate the third-party-names rule at all; N/A.
- The spec document itself (`features/p1155_*.md`) does not name any exact service other than
  ops@ (already a known, intentionally-public service-account address per
  `docs/technical/mcp-servers.md`) and does not inline any secret value — confirmed by reading
  the full spec text above. Clean.

**Not applicable:**
- **RLS / DB:** no schema or table access anywhere in this spec — it reads GitHub issues/workflow
  runs and sends one email. N/A.
- **Authentication/authorization (app-level):** no app user session, no login flow touched. N/A.
- **Input validation to DB:** no DB writes. N/A.
- **AI prompt security:** no LLM call anywhere in this design (registry lookup + string
  templating only, per the spec's own Solution). N/A.

**Required changes:**

1. **Author-check the matched issue before treating it as a real alarm.** In the
   `github-issue-age` check kind, after matching by exact title, additionally verify the issue's
   `user.login` is `github-actions[bot]` (or whatever identity the seven detector workflows
   actually create issues as — confirm via `gh api repos/OWNER/REPO/issues/<n>` on a real
   detector-created issue before hardcoding the expected login) before counting its age or
   escalating on it. An issue matching the title but opened by any other account must be
   ignored by the check, not escalated. This closes the key finding above and should be treated
   as a hard requirement, not a nice-to-have — without it, any GitHub user can inject arbitrary
   content into an ops@ email on a 2-day delay for free.
2. **Strip/reject CR and LF from any issue-derived string used in an email HEADER field**
   (Subject, To, or any custom header) before it reaches the raw SMTP write. The issue BODY may
   go into the message body unmodified (it already does today, per `check-deploy-drift.yml`'s
   own comment field, and per this repo's convention that drift detail is safe in a public
   body). Only header placement is the injection risk — scope the sanitization there
   specifically, don't over-apply it to the body and risk mangling the legitimate fix-command
   content the spec depends on (Non-Goals: "the fix commands are already in the issue body").
3. **Do not reuse `OPS_EMAIL_PASSWORD` as-is without checking for a scoped alternative first.**
   Before wiring the secret into this workflow, check whether All-Inkl/KAS offers a
   send-only/app-specific SMTP credential distinct from the mailbox login password; if yes,
   provision and use that instead, and keep `OPS_EMAIL_PASSWORD` (full mailbox access) out of
   CI entirely. If no such option exists, say so explicitly in the spec's Pre-deploy Checklist
   rather than silently defaulting to the full password, since that's a real, not hypothetical,
   increase in blast radius (CI secrets are inherently more exposed than a laptop's
   `.env.local` — more code paths can reach them, and a compromised workflow file on any branch
   that runs can read them).
4. **Add `actions: read` and `issues: write` explicitly in a `permissions:` block on the new
   workflow**, matching the existing repo convention (`contents: read` + narrow additional
   scopes only) — do not rely on repository-default permissions.
5. **Exercise the SMTP-failure path and inspect the raw log output for the password string**
   before shipping (this is required anyway by the spec's own Done-When for gate 7 — call out
   explicitly that "does the failure output leak the credential" is one of the things that
   specific simulation must check, not just "does it exit non-zero").
6. **Never log the constructed SMTP AUTH/credential line or any full connection string** — mirror
   `scripts/read-ops-email.mjs`'s existing pattern (raw socket write, no `console.log` of the
   credential-bearing command) in whatever script `/architect` designs for the send side.
7. **Confirm the actual GitHub login used by the seven detector workflows when they create
   issues** (needed to implement required change #1) — this is a one-command verification
   (`gh api repos/<owner>/<repo>/issues/<n>` on any existing detector-created issue, e.g. #10 or
   #11) that `/architect` or `/dev` should run and record, not assume.

### Implementation Approach

**Worktree recommended:** touches `.github/` and `scripts/` — shared infrastructure.

#### Build Sequence

0. **Harden the seven producers' find-or-append (A4, founder-authorised 2026-09-08).** Add an
   author check so each producer only appends to / closes an issue **it** created. Same edit in all
   seven, nothing else changed in those files:
   - Replace the `--search "$TITLE in:title"` form with the exact-title `jq` form in the five that
     use it (`auth-canary:54`, `csp-smoke:61`, `db-backup:191`, `prod-health-smoke:77`,
     `stranded-signups:66,91`) — required, because a token match cannot be author-bound
     meaningfully.
   - Extend the `--json` field list to include `author`, and add
     `and .author.login=="app/github-actions"` to the `jq` select in all seven.
   - Same change in the **close-on-recovery** steps (`check-deploy-drift.yml`,
     `backup-staleness.yml`) — otherwise the bot still closes an issue it did not create.
   - **Test the accept case, not only the reject case** (gate 7c): a fixture proving a genuine
     bot-authored issue is still matched. A check that rejects everything looks identical to a
     quiet system, and that is the failure this whole spec is about.
   Do this **first**: until it lands, the reader is escalating a signal that can be diverted before
   it is ever produced.

1. **Registry file** — write `.github/alert-registry.json` with the 7 producers mapped to 2
   `github-issue-age` checks (`deploy-drift` matching `check-deploy-drift.yml`'s exact issue
   title; a **second** `github-issue-age` entry is needed for any of the other six that already
   open alert-only issues under the exact-title convention — confirm against
   `grep -l "gh issue create" .github/workflows/*.yml` per Done-When item 3, since some existing
   titles use the `--search` convention and may need their producing workflow's title captured
   verbatim regardless of which lookup convention that *producer* uses internally) plus one
   `workflow-last-run` entry covering all seven workflow filenames.
2. **`scripts/alert-escalator.mjs`** — pure evaluate functions first (`evaluateGithubIssueAge`,
   `evaluateWorkflowLastRun`), written and unit-tested against fixture JSON before any `gh`-calling
   fetch code exists. TDD per the repo's `/dev` discipline.

   **2a. Author check — HARD REQUIREMENT, Security required change #1.** `evaluateGithubIssueAge`
   MUST ignore any issue whose author is not the detector bot.

   **The identity string differs by API, and the wrong one fails CLOSED — silently.** Two probes
   return two shapes for the same bot:

   ```
   gh api repos/<owner>/<repo>/issues/11 --jq '.user.login'
     → "github-actions[bot]"          # REST
   gh issue list --json number,title,author
     → {"author":{"is_bot":true,"login":"app/github-actions"}}   # CLI  ← the fetch layer uses THIS
   ```

   An earlier revision of this step specified `author.login != "github-actions[bot]"`, verified via
   REST while the fetch layer reads the CLI shape. That comparison matches **nothing**, so every
   genuine alarm would be dropped and the escalator would never fire — this spec's own defect,
   rebuilt inside its own fix, and silent because "no issues due" is the normal quiet output.

   **Correct check:** `author.is_bot === true && author.login === "app/github-actions"`, against
   `gh issue list --json number,title,createdAt,labels,author`. `is_bot` alone is insufficient (a
   different installed App is also a bot); the login alone is the field that just proved
   shape-dependent, so assert both. **A fixture asserting the check ACCEPTS a real detector issue
   is mandatory** — the non-bot rejection fixture alone would pass while the check rejected
   everything (gate 7c: a suite containing only inputs the gate should reject cannot measure
   whether it wrongly rejects). **Without this, any GitHub user can get arbitrary text
   emailed to ops@ on a 2-day delay** — the repo is public with issues enabled
   (`gh api repos/... --jq '{private,has_issues}'` → `{"private":false,"has_issues":true}`), and
   no existing detector checks authorship (`grep -c "user.login\|author_association"
   check-deploy-drift.yml` → 0). A fixture whose author is a non-bot account is a required test
   case in step 7.
3. **Fetch layer** — thin `gh issue list --json number,title,createdAt,labels` and `gh run list
   --workflow=<file> --json createdAt,conclusion --limit 1` wrappers, each surfacing a fetch
   failure as exit 2 (never silently empty).
4. **`scripts/send-ops-email.mjs`** — raw-SMTP send module per Decision 4, built and testable in
   isolation (a `--dry-run` mode that prints the composed message instead of connecting, for the
   no-live-send unit tests; a real integration path for step 5).

   **4a. Header sanitization — Security required change #2.** Any issue-derived string placed in an
   SMTP **header** (Subject above all) must have `\r` and `\n` stripped or the send rejected.
   Hand-rolled SMTP writes the `DATA` header block by concatenation, which is exactly where header
   injection lands — an attacker-controlled title carrying CRLF could smuggle extra `To:`/`Bcc:`
   headers. Scope this to headers only: the issue **body** goes into the message body unmodified,
   because the fix commands the escalation exists to carry live there (Non-Goals).
   **4a-bis. SMTP DATA-phase encoding — the IMAP precedent gives ZERO protection here.**
   Verified: `grep -c "DATA\|dot" scripts/read-ops-email.mjs` → **0**. IMAP has no `DATA` phase, so
   "mirror the existing raw-TLS script" transfers the socket handling and none of SMTP's content
   rules. The message body is an issue body — attacker-influenced, and routinely containing fenced
   code blocks and diffs. Required in the send script:
   - **Dot-stuffing (RFC 5321 §4.5.2):** any body line beginning with `.` must be prefixed with a
     second `.`, and the terminator is `\r\n.\r\n`. Without this, a body line that is exactly `.`
     ends the message early — silent truncation, or a corrupted send. A diff or code block makes
     this ordinary content, not a crafted attack.
   - **Line length:** 1000 octets including CRLF. Fold or reject longer lines rather than emitting
     them.
   - **CRLF normalization:** GitHub bodies use bare `\n`; SMTP requires `\r\n`.
   - **UTF-8:** declare `Content-Type: text/plain; charset=utf-8` and an appropriate
     `Content-Transfer-Encoding`; issue bodies contain non-ASCII.
   A fixture body containing a lone `.` line, a >1000-char line, and non-ASCII is a required test
   case — this is not covered by any of the five scenarios in step 7.

   **4c. Cap the sends per run.** A correlated failure — one GitHub Actions outage stales all seven
   producers at once — makes every `workflow-last-run` check due simultaneously, firing N raw-SMTP
   sends from one job. Send **one** email per run carrying all due checks, or cap and say how many
   were suppressed. Unbounded per-check sending is the duplicate-flood failure §4 exists to prevent,
   arriving by a different route.

   **4b. Never log the credential — Security required change #6.** Mirror
   `scripts/read-ops-email.mjs:62`, which builds `LOGIN ${USER} "${PASS}"` and writes it straight to
   the socket with no `console.log` (verified: `grep -n console.log scripts/read-ops-email.mjs |
   grep -i "pass\|login\|auth"` → no matches). No `set -x` in any step holding the password; no
   connection string built for debug output; if any library is ever substituted, its SMTP debug
   logging must be explicitly off. GitHub masks only the verbatim secret — a re-encoded or
   concatenated form is not masked.
5. **One real send** — from a local/CI run, send one real email to ops@ and confirm arrival via
   `node scripts/read-ops-email.mjs --latest` (existing script, zero new code) before wiring the
   escalator into a schedule. This is Done-When's final item and Decision 4's validation gate.
6. **`.github/workflows/alert-escalator.yml`** — `permissions: contents: read, issues: write,
   actions: read` (the last is new for this repo — Technical Analysis). Detection call is NOT
   `continue-on-error` (§3 — inverted from the seven detectors); a send failure must fail the job.

   **`concurrency:` block is REQUIRED, and the pattern already exists in this repo.** The reader
   does read → decide → send → label with no lock, so two overlapping runs both see "not yet
   escalated" and both send — the duplicate-email failure §4 exists to prevent. This is not
   hypothetical: the Post-deploy Checklist itself mandates two back-to-back `workflow_dispatch`
   runs, and a `schedule` run can land on top of a manual one. Reuse `db-backup.yml:12-14`
   verbatim in shape — the only `concurrency:` block in the repo
   (`grep -rn "concurrency:" .github/workflows/*.yml` → one hit):
   ```yaml
   concurrency:
     group: alert-escalator
     cancel-in-progress: false
   ```
   `cancel-in-progress: false` is the right half: a cancelled run mid-send is worse than a queued one.

   **Ordering of send vs. label must be specified, because both orders fail differently and the
   label permission is UNVERIFIED** (Technical Analysis flags that no workflow in this repo has ever
   used a label, so `issues: write` covering `gh label create` is inference from docs, not an
   observed pass):
   - **Label first, then send** — a send failure leaves the issue marked escalated with no email
     sent. Silence, permanently. Unacceptable: this is the spec's own defect.
   - **Send first, then label** — a label failure after a successful send means the next run
     re-sends. A duplicate email is the tolerable failure.

   **Send first, then label**, and if the label step fails, the job must **fail loudly** (§3) rather
   than exit 0, so a persistent label-permission problem surfaces as a repeated failure notification
   instead of a silent daily duplicate. Step 7 must include a fixture where the label-add fails
   after a successful send.
   First live run against a real issue exercises Decision 5's label-creation step — this is where
   the UNVERIFIED PAT/token-scope flag gets resolved one way or the other.
7. **Simulate fires and non-fires locally** (epistemic gate 7 + 7c) — an issue aged past threshold
   (fires, one email), the same issue on a second run (no second email — label present), an issue
   younger than threshold (no email), **an issue past threshold whose author is NOT
   `github-actions[bot]` (no email — step 2a)**, and a forced SMTP failure (non-zero exit,
   `${pipestatus[1]}` pasted per the spec's zsh note). All five via `--dry-run`/fixture injection,
   no live GitHub mutation needed for the first four; the fifth needs no `gh` call at all (it's a
   send-layer failure). **The SMTP-failure simulation must additionally assert the failure output
   does not contain the password** (Security required change #5) — a library or socket error that
   echoes the connection config on auth failure is a common leak and masking does not always cover
   it. Pasting a non-zero exit code alone does not discharge this item.
8. **Post-deploy** — `workflow_dispatch` against live issue #11 per the Pre-deploy Checklist,
   twice, per the spec's own two post-deploy verification items.

#### Files to Create

- `.github/alert-registry.json` — the registry (data)
- `.github/workflows/alert-escalator.yml` — the scheduled reader workflow
- `scripts/alert-escalator.mjs` — fetch + pure-evaluate logic for both `kind`s
- `scripts/send-ops-email.mjs` — raw-SMTP send module (Decision 4)
- `scripts/test-alert-escalator.mjs` (or `.sh` harness invoking it with fixtures) — the epistemic
  gate 7/7c fixture suite: fires, doesn't-refire, doesn't-fire-under-threshold, send-failure exits
  non-zero

#### Files to Modify

- None required in the seven existing producer workflows — the registry reads their public issue
  titles and workflow filenames from the outside; no producer needs to change to be covered.
