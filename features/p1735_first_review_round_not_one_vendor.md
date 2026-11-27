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

**Builds on P1734's tally**, which records every reviewer's outcome per round, at triage, whether or not the round's receipt survives. Only rounds that have a tally are in scope: a snapshot taken without a session id has none, so it gets no refusal, no line and no place in the reading. That is accepted; it is a shell or CI path, not a session's review.

1. **First round** is P1734's rule: a round, `/finish` or spec review, whose tally does not name an earlier snapshot with `--after`. P1735 tightens `--after`: it is refused unless the two snapshots share at least one file key. Today it checks only that both are in the same worktree (`review_receipt.py:1306`), so an unrelated later round can pass as freshness and hide its warning. Files added in the re-review are still allowed. Spec reviews take a snapshot under P1734, so a spec re-review after fixes is a freshness round like any other. A `/finish` round and a spec round never chain (`--after` needs the same kind); a cross-kind re-review is classed first, which is accepted.
2. **Remove the avoidable causes.**
   - **GLM empty outputs**: fixed by P1737 (shipped).
   - **A successful output not passed.** The tally already refuses an `ok` row for Gemini, GLM or Codex with no output file (P1734, `review_receipt.py:1286-1288`); that is not new work. New: on a **first round only**, `review_receipt.py write` and `spec_review_stamp.py write` refuse unless the evidence includes every output the tally recorded as a successful Gemini, GLM or Codex attempt (`ok: true` with a hash; failed attempts, `local` extra rows and the hashless Opus row are not demanded) **whose file still exists at its recorded path with its recorded hash**. The refusal names the original file to pass. The fix is to pass it; no reviewer runs again and nothing waits. A recorded output that is gone or changed does not block: the write goes on and prints `warning: <slot> output <file> no longer matches its tally`, and that slot counts as not received in the round's line. Freshness rounds keep today's rule (one fresh Gemini or Codex run) and are not checked.
3. **Say so when a first round ends with fewer than two outside vendors.** The tally prints, as the last part of the `Reviewers:` line after ` · `, `single vendor: <reasons>` when one outside vendor (Gemini, GLM or Codex) is `ok`, or `no outside vendor: <reasons>` when none is. `<reasons>` lists every outside reviewer that is not `ok`, in the order Gemini, GLM, Codex, with its recorded outcome, `not triggered` included, for example `GLM skipped (embargo), Codex missing (quota)` or `GLM failed (exit 5), Codex not triggered`. The outcome grammar (`OUTCOME_RE`) is unchanged, so `not triggered` carries no reason. Opus is excluded from the suffix and the outside-vendor count only; it stays in the line and in `received`, so Gemini and Opus `ok` with GLM and Codex absent warns and still reads `2 of 2 received`. A freshness round repeats its first round's suffix as ` · first round single vendor: <reasons>`, found through its `--after` chain, so the line pasted in the final report carries it. After an amend the line is computed from the latest record. A spec review's GLM reason is the `skip:` text `glm-allowed` printed, with any parentheses removed, or `glm-allowed error` on exit 2; `/create-spec` reports that reason instead of always saying `embargo`, and so does `/finish` Step 4b's reporting clause. The receipt format does not change.
4. **This spec never blocks a single-vendor round.** It adds no floor: the existing one (a valid Gemini or Codex run, P1630) still refuses a round where only GLM answered, exactly as today. Every round that meets the floor writes its receipt, and the founder sees the warning line. P1734's monthly reading turns the recorded causes into roster decisions.
5. **The skills carry it.** `/finish` Steps 4b and 6b, the receipt-writing steps in `/dev` (`dev.md:214`) and `/fix` (`fix.md:647`) and the spec review in `/create-spec` print the tally's `Reviewers:` line verbatim in the final report, and each lists the new refusal next to the P1734 one. `/create-spec`'s stamp example passes every successful output of the round, not only Gemini and GLM. The low-blast-radius spec-review skip is unchanged: no snapshot, no tally, and the report says `Spec review skipped (low blast radius)`. In Step 4b, the GLM skip bullets and the skip-and-force logic of the Codex-forcing sentence are not edited; only its reporting clause ("Report it as `GLM skipped (embargo)`") changes, to name the actual reason.
6. **Two weeks after merge, report the reading.** It is a query over the tally store, written with the build: first rounds by kind (`/finish`, spec), the share with fewer than two outside vendors, and the count of rounds per cause (one round can name two causes), using each snapshot's latest record. Waived and abandoned records have no reviewer outcomes; they are counted separately, never in the share. It is a reading for the founder, not a target this spec must hit. A share that stays high points to Alternative C or B, which need their own decision.

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
| A change near the GLM skip logic loosens the embargo rule by mistake | MITIGATE | This spec does not edit Step 4b's skip bullets or the skip-and-force logic; the diff of those lines is shown empty, and only the reporting clause changes. |
| "First round" is mis-detected | MITIGATE | Fixtures for review, fix, re-review of the same files (one first, one freshness), plus a negative case: `--after` an unrelated round in the same worktree is refused. |
| The new refusal blocks a "done" | MITIGATE | It fires only for a file that still exists unchanged, names it, and passing it needs no reviewer to run. A lost or changed output warns instead. |
| The session does not paste the tally's `Reviewers:` line into its final report | ACCEPT | Solution 4's promise that the founder sees it rests on skill text. The tally still records the round, and the reading reads the record, not the chat. |
| The single-vendor share does not fall | ACCEPT | Codex quota and policy skips remain; this spec makes them visible for a roster decision, not invisible. |

**Non-Goals**
- Do NOT change GLM's embargo or private-path skip rules.
- Do NOT change freshness-round rules.
- Do NOT add a reviewer or change any model.
- Do NOT read a reviewer's quota to choose the roster (decisions 2026-11-05).
- Do NOT change the receipt format.

## Done-When

- [ ] On a first round with Gemini and Codex both `ok`, passing only Gemini's output makes `review_receipt.py write` refuse, naming Codex's original file; passing both succeeds. The same for GLM, and for `spec_review_stamp.py write`. With Codex's recorded file deleted, or changed after the tally, the write succeeds and prints the `no longer matches` warning. A freshness round with one fresh Gemini output and an unpassed successful GLM rerun still writes. Tests, exit codes pasted.
- [ ] Fixture first rounds with GLM skipped (embargo), Codex missing (quota), GLM failed (exit 5) and Codex not triggered each print the exact reasons in the `single vendor` suffix; a round with no outside vendor `ok` prints `no outside vendor:`; Gemini and Opus `ok` alone warns and reads `2 of 2 received`; a round with two outside vendors `ok` prints no suffix. Tests, output pasted.
- [ ] A review, fix, re-review sequence, for `/finish` and for a spec review, is classed as one first round and one freshness round; the freshness round's line carries ` · first round single vendor: ...` when its first round was single-vendor, and no suffix otherwise. `--after` naming a reviewed round that shares no file key is refused.
- [ ] The skill text in `/finish` Steps 4b and 6b, `/dev`, `/fix` and `/create-spec` carries the verbatim line and the new refusal, and `/create-spec` passes `glm-allowed`'s reason (or `glm-allowed error`) instead of `embargo`; diff shown. A fresh-session run is checked after merge, under a task-inbox item filed with the build, because a session runs the skills on main.
- [ ] In Step 4b, the GLM skip bullets and the skip-and-force logic are unchanged (diff of those lines shown empty apart from the reporting clause), and `scripts/test-p1634-spec-review-stamp.sh` `[glm-allowed]` cases still pass.
- [ ] The reading query in Solution 6 runs on the live tally store and prints both kinds, the share and the per-cause counts; output pasted. A task-inbox item due two weeks after merge is filed (`/note`) to run it and report to the founder.
- [ ] Every other reader of the receipt still passes, each suite run in full: `scripts/test-p1734-tally.sh`, `scripts/test-p1505-review-gate.sh`, `scripts/test-p1664-receipt-unreadable.sh`, `scripts/test-p1634-spec-review-stamp.sh`. Three p1634 cases stamp with one of two `ok` outputs ("replace keeps single stamp", "real gemini header stamps", "real codex header stamps"); they change to pass every output, as the intended new rule. The Stop hook is covered by the hook cases in the p1734 and p1505 suites.

## Rollback Strategy

Revert the commit. The receipt format is unchanged and the tally is P1734's.

## Related

- P1630: the receipt floor, `vendors`, and its Alternative F (two vendors on every receipt), which P1630 deferred; this spec keeps it off as Alternative B here.
- P1634: never wait for quota; the spec review roster.
- P1734: the reviewer yield tally this builds on.
- P1737: GLM reviews came back empty on large prompts (shipped).
