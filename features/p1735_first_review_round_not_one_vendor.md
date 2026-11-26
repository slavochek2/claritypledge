---
status: week
type: task
rank: 361
workstream: infrastructure
created_date: '2026-11-26'
tags: [finish, review, receipt, reviewers]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1735: When a first review round rests on one outside vendor, remove the avoidable causes and show the founder the rest

## Problem

**Situation:** `/finish` Step 4b sends a first review round to Gemini on every run, GLM unless a skip condition holds, Codex by size, and Opus on sensitive paths (P1630, P1634). The receipt needs one valid Gemini or Codex run and records `vendors`. P1630 deferred "require any two vendors on every receipt" (its Alternative F) until `vendors` showed how often single-vendor receipts still happen.

**Complication:** `vendors` cannot answer that alone. A round whose findings were fixed never writes a receipt, because `review_receipt.py write` refuses on a changed file; the freshness round after it writes one, and freshness rounds need only one vendor by design. Of the 499 receipts with `vendors` since 2026-11-05, 414 follow an earlier snapshot of overlapping files, within 24 hours, that has no receipt. **Of the 85 that do not, rounds that wrote their receipt directly, 60 (71%) are backed by Gemini alone.** The 24-hour rule is approximate: an unrelated task touching the same file the same day also counts as a predecessor. A different proxy, the first receipt per file set, gives about the same share (266 of 382). First rounds that led to a fix leave no receipt, so their vendor mix is unknown. In the November reviewer benchmark (decisions 2026-11-19), Carbon, the Gemini reviewer, scored about 5.5 of 12 known bugs: one Gemini run misses about half of what is there. The causes found in session transcripts since 2026-11-05 (approximate, phrase extraction):

- GLM was **skipped** at least 34 times: 16 for unknown disclosure or no spec on the branch, 11 for a private path or private repo, 7 reported as embargo. The embargo count is an upper bound: the spec review in `/create-spec` reports every `glm-allowed` skip as `GLM skipped (embargo)`, whatever `spec_review_stamp.py` gave as the reason.
- GLM **failed or went missing** at least 32 times, partly from the empty-output cap (P1737).
- **Codex** failed on 11 of the 17 result headers found, mostly the usage limit. An unknown-disclosure or embargo skip forces Codex, so when Codex is also out, the round is Gemini alone.
- A run that succeeded but whose output file was not passed to `write` also shows as single-vendor. How often is unknown.

Step 4b already asks the report to list each reviewer's outcome, but nothing says that the round ended with one outside vendor (Gemini, GLM or Codex; Opus is not outside), and the line is often not printed.

**Question:** How do we remove the causes of a single-vendor first round that are mistakes rather than policy, and make the rest visible with their cause, without breaking the 2026-11-05 rule that work does not wait for a reviewer's quota?

> Founder framing, verbatim: *"lets improve for whatever needs to be doen so we get better yield on it and others too"*.

## Appetite

Blast radius: high. It adds a refusal to `review_receipt.py write`, which gates "done" in every session (P1505). Reversibility: high, one commit. Decision density: zero. Blocking was rejected by the 2026-11-05 ruling and suppressing the warning where Opus ran was rejected below, which leaves warning.

## Invariants

- **Never wait for a reviewer's quota reset** unless the founder says to wait for specific work (decisions 2026-11-05 [process], P1634).
- **The existing floor stays**: at least one valid Gemini or Codex run (P1630). This spec never removes that requirement.
- **GLM's embargo and private-path skips are not loosened** (P1630, fail closed). A skip for a private path still does not force Codex (P1630: that would send private content to one more vendor).
- **No single reviewer's "no defects" is clearance** (P1630).
- **Freshness rounds keep today's rule**: one fresh Gemini or Codex run per new snapshot.
- **Evidence is passed, never discovered.** `write` never scans for output files: nothing ties an output on disk to the review input, and a concurrent session's valid output would count as a second vendor.

## Solution

**Builds on P1734's tally**, which records every reviewer's outcome per round, at triage, whether or not the round's receipt survives.

1. **First round** is P1734's rule: a round, `/finish` or spec review, whose tally does not name an earlier snapshot with `--after`. Spec reviews take a snapshot under P1734, so a spec re-review after fixes is a freshness round like any other.
2. **Remove the avoidable causes.**
   - **GLM empty outputs**: P1737.
   - **A successful output not passed**: the tally command refuses an `ok` row for Gemini, GLM or Codex that has no output file (P1734 already validates the file it is given). `review_receipt.py write` and `spec_review_stamp.py write` then refuse unless every output the round's tally lists as `ok` is among their valid evidence, matched by content hash, naming any missing file. The fix is to pass the file; no reviewer runs again and nothing waits.
3. **Say so when a first round ends with one outside vendor.** The tally command prints `single vendor: <reasons>` as the last part of the `Reviewers:` line, listing every outside reviewer that is not `ok` with its outcome, `not triggered` included, for example `GLM skipped (embargo), Codex missing (quota)` or `GLM failed (exit 5), Codex not triggered (size)`. It applies to `/finish` and spec-review first rounds. Opus is never listed and never counts. A spec review's GLM reason is the one `glm-allowed` printed, and `/create-spec` reports that reason instead of always saying `embargo`. The receipt format does not change.
4. **A single-vendor first round warns and is never blocked.** The receipt is written and the founder sees the `single vendor` line. P1734's monthly reading turns the recorded causes into roster decisions.
5. **The skills carry it.** `/finish` Steps 4b and 6b and the spec review in `/create-spec` print the tally's `Reviewers:` line verbatim in the final report, and Step 6b lists the new refusal. Step 4b's GLM skip bullets and its Codex-forcing sentence are not edited.
6. **Two weeks after merge, report the reading**: from the tally, the share of first rounds with one outside vendor and the count per cause. It is a reading for the founder, not a target this spec must hit. A share that stays high points to Alternative C or B, which need their own decision.

## Alternatives Considered

| Option | Verdict | Why |
|---|---|---|
| A. Remove the avoidable causes, warn on the rest with reasons | **Chosen** | Works on what is a mistake now, and turns the rest into data without blocking work. |
| B. Require two vendors on every first round (P1630 Alternative F; an earlier draft offered it as an option) | Rejected | With GLM skipped for embargo and Codex out of quota, the round cannot get a second vendor and the work waits. That reverses the 2026-11-05 never-wait ruling; reopen only as a decision to reverse it. |
| F. Treat an Opus report as the second lens where Opus ran | Rejected | Opus runs on the most sensitive paths; hiding the warning there hides single-vendor rounds exactly where they matter most. It is also the building session's own model family. |
| C. Run Codex on every first round | Deferred | Codex is the reviewer most often unavailable (quota). P1734's availability criterion decides whether its effort or allocation changes first. |
| D. Let `write` find the round's outputs itself | Rejected | Nothing ties an output file to the review input; a concurrent session's output would count. |
| E. Leave it | Rejected | Most first rounds that wrote their receipt directly rest on Gemini alone, which scored about half the known bugs in the benchmark. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A change near the GLM skip logic loosens the embargo rule by mistake | MITIGATE | This spec does not edit Step 4b's skip bullets; the diff of those lines is shown empty. |
| "First round" is mis-detected and freshness rounds start warning | MITIGATE | Fixture tests for review → fix → re-review of the same files, which must yield one first round and one freshness round. |
| The new refusal blocks a "done" | MITIGATE | It names the file, and passing it needs no reviewer to run. |
| The session does not paste the tally's `Reviewers:` line into its final report | ACCEPT | The tally still records the round, and P1734's monthly reading reads the record, not the chat. |
| The single-vendor share does not fall | ACCEPT | Codex quota and policy skips remain; this spec makes them visible for a roster decision, not invisible. |

**Non-Goals**
- Do NOT change GLM's embargo or private-path skip rules.
- Do NOT change freshness-round rules.
- Do NOT add a reviewer or change any model.
- Do NOT read a reviewer's quota to choose the roster (decisions 2026-11-05).
- Do NOT change the receipt format.

## Done-When

- [ ] With Gemini and Codex both `ok` in the tally, passing only one of their outputs makes `review_receipt.py write` refuse, naming the other; passing both makes it succeed. The same for GLM, and for `spec_review_stamp.py write`. A modified copy of a listed output is refused. Tests, exit codes pasted.
- [ ] The tally command refuses an `ok` row for Gemini, GLM or Codex with no output file.
- [ ] Fixture rounds with GLM skipped (embargo), Codex missing (quota), GLM failed (exit 5) and Codex not triggered (size) each print the right reasons in the `single vendor` line, and a round with two outside vendors `ok` prints none. A spec review whose `glm-allowed` skip is not embargo (for example, no committed copy) prints that reason, not `embargo`.
- [ ] A review → fix → re-review sequence, for `/finish` and for a spec review, is classed as one first round and one freshness round; the freshness round prints no `single vendor` line.
- [ ] `/finish` and `/create-spec` carry the tally call and the verbatim `Reviewers:` line; a fresh-session run of each shows it.
- [ ] Step 4b's GLM skip bullets and Codex-forcing sentence are unchanged (diff of those lines shown empty), and `scripts/test-p1634-spec-review-stamp.sh` `[glm-allowed]` cases still pass. Those cases cover the spec review only; `/finish`'s skip rules are skill text.
- [ ] A task-inbox item due two weeks after merge is filed (`/note`) to record the reading in Solution 6 here.
- [ ] Every other reader of the receipt still passes, each run directly: `.claude/hooks/verify-before-stop.py`, `scripts/test-p1505-review-gate.sh`, `scripts/test-p1664-receipt-unreadable.sh`.

## Rollback Strategy

Revert the commit. The receipt format is unchanged and the tally is P1734's.

## Related

- P1630: the receipt floor, `vendors`, and Alternative F, which this keeps rejected.
- P1634: never wait for quota; the spec review roster.
- P1734: the reviewer yield tally this builds on.
- P1737: GLM reviews come back empty on large prompts.
