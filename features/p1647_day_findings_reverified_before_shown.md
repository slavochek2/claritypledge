---
status: qa
type: task
rank: 111
workstream: infrastructure
created_date: '2026-11-06'
tags: [day, findings, false-positives, checks]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
spec_review_hash: 424325d1dadbd3d73ec4327f2cf2ac65a4dd3e06d5814329741af58fc2837a98
spec_review_vendors: [gemini, openrouter]
---

# P1647: /day shows stale or informational items as live faults

## Problem

> Founder framing, verbatim (2026-11-06): "we dealt with that how do we make sure sustainably that our agent when analyzing like doesn't create false positives and has the up-to-date information and so on is there something to review and improve"

**Situation:** The /day run of 2026-11-06 (05:43Z) raised 14 items. A fix session re-checked each one against current state the same morning.

**Complication:** Four items were already false when /day raised them, and the founder had answered two of them on earlier days:

| Item | Why it was stale at 05:43Z | Source /day relayed |
|---|---|---|
| Supply-chain audit incomplete (`cp.ops`, issue 30) | Fixed 2026-11-03 (`f565115ba`); a clean export of `main` audits `CLEAN (exit 0)`. The issue stays open until the weekly Monday run. | an open GitHub alert issue |
| Deploy drift, send-event-emails (`cp.ops`, issue 33) | Redeployed and stamped 2026-11-05 (`a8527dfa6`); `check-deploy-manifest.sh --env prod` passes | an open GitHub alert issue |
| Test project log ingestion over the free plan (`cp.quota`) | A cycle-to-date total. The project was paused 2026-11-03 (P1606) and cannot add to it; the counter resets 2026-11-20. Raised daily since 2026-10-28. | a cumulative counter read as a live rate |
| "Test project sits in its own organisation" (`cp.quota`) | An informational note by design (P1538), filed as a finding and rendered urgent | a note filed through the finding path |

A fifth, "infra changes have no KDD capture" (`cp.reflect`), was raised although the P1634 decision entry existed since 2026-11-05. A sixth, the Beeper message "token expired or unknown" when Beeper Desktop was only closed, is already fixed outside this repo (beeper-digest `3a2d09c`).

Not in scope as false positives: P1641 "ship unfinished" and TEST `_shared` drift were true at 05:43Z and were resolved by other sessions later that morning. The fix-session prompt's "check each item is still real" handled those correctly.

Each stale item costs a founder decision block or a fix-session re-check, and repeats teach the founder to discount the board. P1605's verdict ledger hides a card only after a fix session has written a verdict. Nothing stops a stale card from being raised in the first place.

**Question:** What must a /day check do before it files a finding, so that a stored artifact, a cumulative counter or a note never reaches the board as a live fault?

## Appetite

Blast radius: medium. It touches what /day shows on every run, across `day-cp.md` (this repo) and the global `~/.claude/scripts/day-step.sh` and `~/.claude/commands/day.md` (the `~/.claude` git repo). No product code, data or prod infrastructure. Reversibility: git revert in each repo. Decision density: zero founder decisions. Closing GitHub issues automatically is excluded (Non-Goals), which removes the one call that would need the founder.

## Invariants

- **A real fault is never hidden.** If a re-verification cannot run, errors, or is ambiguous, the original finding is filed unchanged. A failed check never counts as clean (P1605: only `accepted` and `false` hide, and a `fixed` fault reported again shows).
- **Re-verification runs the check itself.** It runs the local equivalent of the gate, never a second stored artifact (another issue comment, an earlier CI run, a cached report).
- **The alert issue stays the gate's own business.** /day never closes, edits or comments on a GitHub issue.
- **An over-limit reading reaches the founder at least once.** Cumulative counters are hidden only by a founder-visible verdict with a threshold (P1605), never by the check itself.

## Solution

Four check changes plus one shared rule.

1. **Open alert issues (`cp.ops`).** Move the per-issue logic into a script that reads `gh issue list --json number,title,labels,createdAt` on stdin (`createdAt` feeds `--first-seen`), so it can be tested on fixtures. For each open issue, by its exact title (titles are fixed strings set by each workflow's `TITLE=`):
   - "Supply-chain audit: FINDING or INCOMPLETE on main" → `dep-audit.sh` on a clean export of `main` (`git archive main`), the tree the alert is about; a working-tree run reports INCOMPLETE on untracked and `.private/` files, observed 2026-11-06.
   - "Deploy drift detected on prod" → `check-deploy-manifest.sh --env prod`.
   - Equivalent exits clean → no finding; the check detail says "issue N open, its check is clean now; closing it is the gate's job".
   - Equivalent finds the problem, errors, or times out → file as today (Invariant 1).
   - Any other title, including the smoke gates, which have no local equivalent here → file as today, and the detail names it as unmatched (epistemic gate 7e divergence check).
   - Issues labelled `p1155*` keep their existing `cp.signups` routing (`day-cp.md` finding table) and are not touched.
   - `cp.ops` status, over issues not labelled `p1155*`: `ok` when each re-verified clean, `problem` when any finding was filed. The existing `p1155*` stale-issue note is appended to the same detail.
2. **Cumulative counters (`cp.quota`), through P1605's existing threshold.** `day-loops.ts` already hides an `accepted` verdict that carries `--threshold` until the fault's `reading` exceeds it, but `day-step.sh finding` never writes a `reading` (P1605: "No check files `reading` yet"). Add `--reading <number>` to `day-step.sh finding`, and have `cp.quota` pass the used amount for every over-limit metric. A fix session that accepts a frozen counter then records `--threshold <current reading>` through the existing `tools/kanban/scripts/day-evaluated.ts --threshold`, and the card returns as soon as the counter grows, when the verdict expires, or on a new cycle that exceeds it. No new store; the figure stays in the private finding store.
3. **The organisation note is not a finding.** `quota:test-project-in-own-org` (day-cp step 5, described there as "a note") becomes a `cp.quota` check detail, and step 5's stale sentence "Both in one organisation is the normal case today" is corrected: separate organisations is the normal case since P1538. Audit, done while drafting: `day-cp.md` has five `finding --check` calls (generic template, `cp.quota` over-limit, two `cp.health` pipeline faults, `cp.goals` unparseable). All four concrete ones are faults, so this is the only conversion. The `p1155*` stale-issue case already files a note, not a card.
4. **KDD capture (`cp.reflect`), as a script testable on fixtures.** Before filing `kdd:uncaptured`, take the infra commits since `$SINCE` (the last-run timestamp `day-cp.md` already exports to every step). A commit counts as captured when its subject names a P-number that appears in a decision entry (`scripts/search-decisions.sh`, both logs). Commits naming no P-number count as uncaptured. File only when one or more are uncaptured, and name them (P-number or short SHA).

**Shared rule**, written in `~/.claude/commands/day.md` §9b (where the `finding` verb is documented): a finding relayed from a stored artifact (an issue, journal, log, cached report) carries the result of the check that re-ran it, or says that none exists. A cumulative counter passes `--reading`. The edit goes through `/slava:maintain:claude-md` only if it lands in a CLAUDE.md or `.claude/rules/` file; §9b is neither.

## Alternatives Considered

- **A private store of last readings for `cp.quota`, compared each run** (first draft). Rejected after review: it rebuilds P1605's threshold mechanism, adds a store with its own failure modes, and hides an over-limit reading without the founder ever seeing it.
- **Smoke gates re-checked from the newest CI run.** Rejected: an earlier CI run is a stored artifact (Invariant 2), and its timing relative to the alert needs issue comments.
- **/day closing stale alert issues.** Rejected: outward-facing, and it would fight P866's find-or-append design.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A local equivalent passes while the CI gate would still fail (environment differences) | MITIGATE | Clean export of `HEAD`, not the working tree; the gate's own run still decides the issue and re-alerts if it fails |
| A new gate with a new title is filed as today, unverified | ACCEPT | That is the current behaviour, and the detail names it so the list can grow |
| `gh issue list --limit 50` truncates | MITIGATE | The script names a possible truncation when it receives exactly 50 |
| A cumulative counter is accepted with a threshold and the next cycle starts below it | ACCEPT | Correctly hidden until it passes the threshold or the verdict expires (90 days at most) |
| Re-checks add run time to /day | ACCEPT | The audit is minutes on a clean export; runtime is not a ranking criterion here |

**Non-Goals**
- Do NOT close, edit or comment on GitHub issues from /day.
- Do NOT change the scheduled gates, their workflows, or how often they run.
- Do NOT change P1605's verdict ledger or the render fold, beyond feeding it `reading`.
- Do NOT touch the Beeper probe (fixed in beeper-digest).
- Do NOT change findings that were true when raised (P1641 ship journal, TEST drift): the fix-session prompt handles that latency.

## Done-When

- [x] The `cp.ops` script, fed a fixture shaped like 2026-11-06 (one supply-chain, one deploy-drift and two smoke-gate issues) with both equivalents stubbed clean, files findings only for the two smoke-gate issues and names them unmatched; a dirty deploy-drift stub also files that issue; an erroring stub files its issue unchanged; a `p1155`-labelled issue passes through untouched; a 50-row fixture names a possible truncation. Test output with exit codes recorded in the spec.
- [x] The script, run live on `main` at implementation time, re-checks whichever supply-chain and deploy-drift issues are open; if none are open, both equivalents are run directly and their exit codes recorded.
- [x] `day-step.sh finding --reading 2.4` writes a numeric `reading`; a non-number is refused. Through `day-loops.ts`, an `accepted` record with `--threshold 2.5` hides the card at reading 2.4 and shows it as `worse` at 2.6, shown by a test. `day-step.test.sh` and the kanban tests pass.
- [x] `cp.quota` passes `--reading` on its over-limit finding call in `day-cp.md`. No usage figure appears in any public file (pre-commit "account figures and token shapes" check clean).
- [x] `quota:test-project-in-own-org` is no longer filed as a finding; `day-cp.md` records it as a check detail.
- [x] The KDD capture script, run on fixture commits, files nothing when every infra commit's P-number has a decision entry, and names the rest otherwise; a commit naming no P-number is listed as uncaptured; on 2026-11-06's commits it counts P1634 as captured.
- [x] `~/.claude/commands/day.md` §9b carries the shared rule.

## Evidence (2026-11-06)

- `scripts/test-p1647-day-ops-reverify.sh`: 26 passed, 0 failed, exit 0. Covers the 2026-11-06-shaped fixture (only the two smoke-gate issues file, as `unmatched`), dirty, error and timeout stubs, `p1155` pass-through, all-clean `OPS-STATUS ok`, a 50-row truncation notice and malformed input (exit 2). Failability: mapping error exits to clean made the suite exit 1 with 2 failures.
- Live, `gh issue list ... | scripts/day-ops-reverify.sh` (exit 0): issues 30 and 33 `CLEAN` (dep-audit on a `git archive main` export, prod manifest check, both exit 0); 34 and 35 `FILE ... unmatched`; `OPS-STATUS problem`.
- `scripts/test-p1647-day-kdd-capture.sh`: 18 passed, 0 failed, exit 0. Failability: removing the decisions-command error check made it exit 1 with 2 failures. Live since 2026-11-05: `CAPTURED p1634` among 18 captured; two commits naming no P-number listed `UNCAPTURED` by SHA.
- `~/.claude/scripts/day-step.test.sh`: 136 passed, 0 failed (11 new `--reading` cases). Kanban `server/__tests__/day-evaluated.test.ts`: 54 passed, including threshold 2.5 hiding reading 2.4 and showing 2.6 as `worse`.
- `day-cp.md` (committed on main): `cp.ops` runs the re-check script when present and falls back to the old count otherwise; `cp.quota` passes `--reading`; the organisation note is a check detail, and only the regression (both projects in one organisation) files; `cp.reflect` uses the KDD script when present. Shared rule added to `~/.claude/commands/day.md` §9b.
- Known limits: the KDD script counts any decision-log line naming the P-number as a capture, including a passing mention. Stubbed tests skip the `git archive` path; only the live run exercises it.

## Related

- [P1605](done/2026-06-10/p1605_day_accepted_until_record.md): verdict ledger, after-the-fact suppression; this spec is the before-the-fact half.
- [P1530](p1530_supabase_log_ingestion_and_egress_before_restriction.md), [P1606](done/2026-06-10/p1606_switch_off_hosted_test_by_default.md): the quota history behind item 2.
- [P1538](done/2026-06-10/p1538_rebuild_test_project_in_own_org.md): why the test project is in its own organisation.
