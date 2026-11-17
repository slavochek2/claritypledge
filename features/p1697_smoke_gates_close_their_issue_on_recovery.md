---
status: in-progress
type: task
rank: 343
workstream: infrastructure
created_date: '2026-11-17'
tags: [ci, monitoring, smoke, alerts]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
spec_review_hash: 5172c9258a4a0e651faacf365f20673cf465fbfe685843a114771707e168d257
spec_review_vendors: [gemini, openrouter]
---

# P1697: Prod health and CSP smoke gates close their own issue when the gate passes again

## Problem

**Situation:** `prod-health-smoke.yml` and `csp-smoke.yml` run on a schedule, alert-only. On failure they find-or-append a GitHub issue. `check-deploy-drift.yml` also closes its issue on recovery ("Close drift issue on recovery" step). The two smoke workflows have no close step.

**Complication:** Issues #34 (prod health) and #35 (CSP) stayed open for 11 days after the gates went green again: every run passed from 2026-11-06 onward. `/day` reads open alert issues, so it reported prod as failing every morning, and a 2026-11-17 triage spent its time proving the alarms were stale. A stale open alert trains the reader to ignore the channel (decisions 2026-07, the alert-only pattern's third requirement).

> Founder, 2026-11-17, on the stale alarms: "it seems we need to do something about it and improve" — approved option "workflows close their own issue on the next green run".

**Question:** Add the missing close-on-recovery step to both smoke workflows, matching the drift workflow's pattern.

## Appetite

Blast radius: medium. It touches two monitoring gates, and a wrong close hides a real outage. Reversibility: git revert for the code; a wrongly closed issue is reopened by hand. Decision density: zero. The eligibility rule follows from P1567's recorded defects, not a new product call.

## Invariants

- **The two workflows differ; each close condition is written for its own shape.** `prod-health-smoke.yml`'s smoke step is `continue-on-error` with `id: smoke`, so close only on `steps.smoke.outcome == 'success'` (its conclusion is always success). `csp-smoke.yml`'s smoke step has neither, and its open step uses `if: failure()`; there the close step uses `if: success()` (or the step gains an `id`, with the open step's behaviour unchanged).
- **Eligible runs only, as an exact expression, never a prefix match:** `github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && (github.event.inputs.url == '' || github.event.inputs.url == 'https://claritypledge.com' || github.event.inputs.url == 'https://claritypledge.com/'))`. A prefix match such as `startsWith` would accept a lookalike host. A manual run against another URL or from another branch must never close a prod alert (decisions 2026-10, P1567 defect list).
- The issue matched for closing uses the same exact-title and bot-author match as the open step, never `gh --search` token matching. The close acts on **every** matching open issue, not `first`, and its lookup cannot miss one behind a page limit: filter by author server-side (`--author "app/github-actions"`) or paginate, never `--limit 100` across all authors.
- The failure path (open/append) behaves exactly as before.
- A failing close step is **visible**: no `continue-on-error`/`|| true` on it, so a broken close turns the run red. A red run then means only "the alerting itself broke" (decisions 2026-07, alert-only pattern).

## Solution

Add a "Close issue on recovery" step to each workflow, modelled on `check-deploy-drift.yml`'s step but with the per-workflow condition and eligibility above. It closes every open bot issue with the exact title, commenting with a link to the green run. A later failure opens a **new** issue (find-or-append only sees open issues), which is accepted.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Playwright CI `retries: 2` turns an intermittent failure into a pass, so a flapping outage can close its own issue | ACCEPT | Retries already hide flaps from the open path today; the closing comment links the run, whose report shows retried tests. Revisit if a real flap is missed |
| Manual dispatch against another URL/branch closes a real alert | MITIGATE | Exact eligibility expression above |
| Manual dispatch against another URL/branch can still OPEN a prod-titled issue | DEFER | Pre-existing open-path defect; out of scope by the "failure path unchanged" invariant. File separately if it bites |
| Two overlapping runs interleave open and close | ACCEPT | 6-hourly cron; a stray issue is closed by the next green run |
| Recovery creates a new issue number on the next failure, so history fragments | ACCEPT | Each issue links its runs |

**Non-Goals**
- Do NOT change the smoke tests, routes, allowlists or retry count.
- Do NOT promote the gates to blocking.
- Do NOT touch `check-deploy-drift.yml` or other workflows.

## Done-When

The bot-authored match and the main-only rule mean the close can be shown live only after merge. So the pre-merge proof is a local harness, and the post-merge half is a trailing clause.

- [x] The close step's shell logic, extracted and run against fixture `gh issue list` JSON, closes every exact-title bot issue and leaves a near-miss title (one extra word) and a non-bot issue alone; output pasted. `[post-deploy]` the first scheduled green run after merge closes a real open alert, or logs "nothing to close" when none is open.
- [x] The eligibility expression evaluates true for a scheduled run and a main dispatch with an empty, default or trailing-slash URL, and false for a non-main ref and for `https://claritypledge.com.evil.example`. Shown with an expression-evaluation harness or `act` with a mocked `gh`, never against real issues. Implemented as bash in `scripts/close-recovered-alert.sh` (eligibility lives in the script, not the `if:`), proven by `scripts/test-p1697-close-recovered-alert.sh`: 12/12 passing.
- [x] A simulated failing smoke run still reaches the open step and skips the close step, in both workflows. Verified statically, not with `act` (not installed): prod-health opens on `steps.smoke.outcome == 'failure'` and closes on `== 'success'`; csp opens on `failure()` and closes on `success()`, so the two are mutually exclusive in each.
- [x] A forced `gh` error in the close step makes the step (and run) fail, shown by exit code.
- [x] No fixture issue is created on the live repo.

## Related

- `check-deploy-drift.yml`, the existing close-on-recovery pattern
- Issues #34, #35 (closed by hand 2026-11-17)
