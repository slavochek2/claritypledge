---
status: all-done
type: task
rank: 360
workstream: infrastructure
created_date: '2026-11-26'
tags: [finish, review, reviewers, measurement]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 84c6db561b9221b8b7d2dd6272d49f2d76f02d0f53bd1150a8f2136a1bef7cb9
spec_review_vendors: [codex, gemini, openrouter]
completed_at: 2026-11-27
---

# P1734: Measure what each outside reviewer actually catches, so roster and model calls rest on data

## Problem

**Situation:** A `/finish` first round goes to several outside reviewers: Gemini (Carbon since 2026-11-17, falling back to Argon; Argon was the primary before that), GLM through OpenRouter unless skipped, Codex by size, and an Opus adversary on sensitive paths. Freshness rounds after a fix run fewer. Spec reviews use Gemini and GLM, plus Codex and Opus at high blast radius. The main session checks each finding and drops what does not hold. The receipt (`scripts/review_receipt.py`) records which vendors back it. Nothing records **what each reviewer found, how much of it was real, and whether anyone else found it too**.

**Complication:** On 2026-11-26 the founder asked whether GLM pays off, and the answer had to be dug out of 7 GB of session transcripts. What that dig found, across the three weeks since P1630 (2026-11-05):

1. **The keep-or-cut check cannot be computed from the records.** P1630 told every report to print `GLM ok (N findings, M verified, K unverified)`. Two phrase searches found between 8 and 16 real count lines, a minority of GLM-ok reports, with 34–40% of findings verified. Neither search can fully separate a real line from the skill's own example line, which appears over a thousand times in transcripts.
2. **Unique catches can only be found by phrase search, and the search over-counts.** It turned up three candidate defects that only GLM raised. Checked against their rounds: P1658's symlink entry guard was raised by Gemini too in the same round (Gemini rated it LOW, GLM HIGH), so it is not unique. Live usage readings written into a public spec (against `metered-services.md`) stands as a `/finish` catch. Guessable handles letting anyone message anyone stands, but came from a spec review. Nothing records "only this reviewer found it", and nothing records a severity disagreement like P1658's.
3. **Receipts miss exactly the rounds that found something.** `review_receipt.py write` refuses when a file changed after the snapshot, so a round whose findings were fixed never writes a receipt; only the freshness round after it does. Of the 499 receipts with `vendors` from 2026-11-05 to the count taken on 2026-11-26 (a dated figure; the store keeps growing), 414 follow an earlier snapshot of overlapping files, within 24 hours, that has no receipt. Receipts also cannot say whether GLM was skipped, failed, or ran without its output being passed.
4. **Codex vs the rest and Carbon vs Argon have no production numbers either.** Of the Codex result headers found in transcripts, 11 of 17 are failures, mostly the usage limit. Argon was the primary Gemini reviewer until 2026-11-17; since then 7 review headers show it serving as Carbon's fallback. Model choice rests on the November reviewer benchmark (12 real bugs from this repo's history plus 3 controls, one judge; decisions 2026-11-19), which is the right oracle for model choice but says nothing about day-to-day work.

**Question:** What is the smallest record, written at the moment of triage, that answers "is reviewer X (or model Y) worth what it costs" for every reviewer, without falling into the trap that got a findings ledger rejected on 2026-11-05?

> Founder framing, verbatim: *"How do we evaluate ROI on using JLM? ... in which cases it does or it does not? And do we need to adjust something? And when and how we allow more agents to call it?"* and *"lets improve for whatever needs to be doen so we get better yield on it and others too .. we can probably do the same with carbon vs argon and codex vs rest?"*

**The INBOX-289 verdict, recorded here with the founder's approval (2026-11-26).** P1630's 30-day rule was: if GLM produced no verified defect the other reviewers missed, fall back or remove it. It produced at least one in `/finish` and one more in a spec review (item 2; the first draft of this spec claimed three, one of which turned out not to be unique), so **GLM stays always-on, unchanged**. The verdict rests on two catches found by phrase search; the next check rests on the tally. This spec makes the next such check answerable from the records.

## Appetite

Blast radius: high. Every `/finish` round and every spec review gains a step, and the receipt and stamp commands gain a refusal; both sit on the path that clears "done" (P1505). Reversibility: high, an untracked local file, one subcommand, a report script and the skill steps that call it. Decision density: low; the one founder call (the thresholds) was made 2026-11-26.

## Invariants

- **The 2026-11-05 ruling stands: a raw count of findings per reviewer is never a measure of value.** Decisions 2026-11-05 [process] (P1634) rejected "a per-reviewer findings ledger (rewards noisy reviewers)". Value here is **a verified defect no other reviewer that ran in the same round raised**. Dropped findings are a **cost** (triage load), never output. The report never ranks reviewers by findings raised.
- **Absence is not uniqueness.** A catch counts as unique only when at least one other reviewer ran successfully in that round. A catch made while every peer was skipped or failed is reported separately and never counts toward keeping a reviewer.
- **No single reviewer's "no defects" is clearance** (P1630). A run with zero findings is recorded as zero, not as a pass.
- **The receipt floor is unchanged.** A valid Gemini or Codex run is still required (P1630). The only new refusals in this spec are about the tally (missing, abandoned, or not matching the evidence passed), and each is always fixable with one command and no reviewer re-run (P1735 adds a second, also fixable without a re-run). A GLM, Codex or Opus outcome of `failed`, `missing` or `skipped` is always a valid row.
- **Never wait for a reviewer's quota reset** unless the founder says to wait for specific work (decisions 2026-11-05, P1634). An out-of-quota reviewer is recorded `missing (quota)`.
- **The benchmark stays the oracle for model choice** (decisions 2026-11-19). Since 2026-11-17 Argon runs only after Carbon fails, often on the largest prompts, so production numbers never compare Carbon with Argon directly.
- **The criteria never remove the receipt floor or a roster rule.** A Remove or Stakes-gate verdict against Gemini, Codex or the Opus sensitive-path trigger is advisory: it becomes a founder item, never a roster change, because the floor (P1630) and the Opus trigger (P1505) are rules, not yield bets.
- **The record is local and untracked, never in a spec file.** It holds severities of defects on sensitive paths before they ship, and the stamp suite asserts that a stamp changes exactly two frontmatter lines. Spend totals stay in `.private/` (P1526).

## Solution

1. **A tally per round, written at triage, before any fix.** Its own subcommand (for example `review_receipt.py tally --snapshot <path> ...`) appends one record to an untracked file in the common git directory, beside `.review-receipts`. It is written before fixes, so it survives whether the round's receipt is ever written. A record holds:
   - **Round**: snapshot id, the session that took it, time, the commit at `HEAD`, kind (`spec review`, `finish first` or `finish freshness`), and the prompt file's path and byte count (`--prompt-file`; no header carries the size). A round is `freshness` only when the tally names the earlier snapshot it re-reviews (`--after <snapshot>`), and the command checks that snapshot is in the same worktree, covers overlapping files and has a reviewed tally (an `--abandoned` or `waived` record does not count). Otherwise it is a first round. A time-window guess was rejected: two unrelated tasks touching one hot file the same day would turn the second task's first round into a freshness round. Every snapshot carries a random nonce, so two identical snapshots taken in the same second are still two rounds.
   - **Spec reviews take a snapshot too, when anyone reviews.** `spec_review_stamp.py` hashes the spec body and never snapshots, so a spec review whose roster is not None starts with `review_receipt.py snapshot -- <spec>` and tallies against it like a `/finish` round. A low-blast-radius skip takes no snapshot and writes no tally. The stamp still hashes the body at stamp time, after verified findings are folded in, exactly as today.
   - **One outcome for each of the four reviewers**, from a fixed list (Gemini, GLM, Codex, Opus): `ok`, `failed (<reason>)` (an exit code, a model mismatch, an empty file), `missing (<reason>)` (`quota`, never launched), `skipped (<reason>)` or `not triggered`. Leaving a reviewer out is impossible; a skip must be stated. The header's vendor maps to the slot: `gemini` to Gemini, `openrouter` to GLM, `codex` to Codex. An `ask-model local` output is recorded as an extra attempt row, never in one of the four slots.
   - **One row per attempt**: requested model, served model, effort, token counts where the header reports them, and the output file's path and hash. Successful outputs are passed with `--evidence`, failed ones with `--failed-run`. A Carbon failure followed by an Argon success is two attempts: inside one `ask-model` call the single output file carries `fallback_from=<failed model>`, and the command writes a failed attempt row for that model (no file of its own) before the row for the model that answered; a manual re-run writes a second file and gets its own row. The Codex header has no `served=` field, so Codex's served model is recorded as the requested one and the report says so. Opus runs as an agent with no `ask-model` header, so its row has an outcome and no output file.
   - **One row per distinct defect after triage**: a one-line summary, the file and line, state (`verified`, `unverified` or `dropped`), and each reviewer that raised it with the severity it gave. The defect's severity is the highest a reviewer gave that triage upheld. The main session merges different descriptions of the same defect into one row at triage, and does not record again in a freshness round a defect already recorded in the round named by `--after`. The tally keeps a copy of each defect file's content as the reviewers saw it (only when the file still matches its snapshot hash), keyed by that hash in a store beside the tally under the common git directory, because a reviewed tree is usually uncommitted and the defect is fixed before it is ever committed. The summary, location and stored content are what the monthly re-check reads.
2. **Checks the tally command applies.** Every `--evidence` output must pass the same check `write` applies (non-empty, written after the snapshot, a valid successful header) and map to an `ok` reviewer. Every `--failed-run` output must be non-empty, written after the snapshot and carry an `ASK-MODEL:` header that is not a success, and map to a reviewer that is not `skipped` or `not triggered`. A Gemini, GLM or Codex slot marked `ok` must cite at least one valid output of its vendor, so a defect can never be credited to a reviewer that did not run. A defect names only reviewers that were `ok`. The command prints the round's `Reviewers:` line from the record and the skill tells the session to paste it verbatim. This changes Step 4b's format on purpose: every `ok` reviewer gets counts, not GLM alone, and a failed run reads `failed (<reason>)` instead of `missing (exit N)`.
3. **The receipt and stamp commands refuse without a tally.** `snapshot` records the session that took it (`CLAUDE_CODE_SESSION_ID`, which the shell already carries). `review_receipt.py write`, the `waive` subcommand and `spec_review_stamp.py write` refuse while any snapshot **taken by the same session** of overlapping files has no tally. Scoping by session keeps a co-tenant's abandoned round on the shared main checkout from blocking anyone else, and makes the rollout clean: snapshots taken before this ships carry no session and never block. The check reads the snapshot store and the tally file only, never the receipts, because `waive` records no snapshot. So a first round whose fix voided its receipt is still covered, and so are rounds where both floor vendors failed. A snapshot taken by mistake, before any reviewer ran, is closed with `tally --abandoned <snapshot> --reason <text>`, which records no reviewer outcomes; the report counts abandoned rounds, so the hatch is visible. `spec_review_stamp.py` has no `waive`; when no floor vendor ran, the stamp is withheld as today and the tally still records the round.
   - **The tally must back what is written.** `write` also refuses when the snapshot's latest tally is `--abandoned`, or when a valid evidence file it is given is not one the tally recorded (by hash), so a receipt cannot rest on a run the tally says failed. `spec_review_stamp.py write` gains `--snapshot <path>`, required when the session id is set: the snapshot must hold the spec, have a reviewed tally, and every valid evidence file must be in that tally. Without it, a spec review that never snapshotted would have nothing open and stamp as today.
   - **No session id, no enforcement, said out loud.** `snapshot` prints a warning when `CLAUDE_CODE_SESSION_ID` is unset (a human shell, another harness, CI), since such a snapshot can never block.
   - **The founder's "skip review" never refuses.** The Stop hook calls `rr.waive()` inside a `try` that passes the turn on any exception (`verify-before-stop.py`, the founder-waiver branch), so a refusal there would fail open and record nothing. That path keeps waiving as today, first, and then writes a `waived` tally record, with the founder's words as the reason, for each untallied snapshot the session took that overlaps the waived files. The tally write sits in its own `try`, so its failure never undoes the waiver. The hook passes its own `session_id` (from its stdin JSON) down to that call rather than trusting its environment, and the waiver branch writes these records whenever the founder waived, even when no file was missing.
4. **The skills that run reviews call it.** `/finish` Steps 4b and 6b, the spec review in `/create-spec`, and the receipt steps in `/dev` (9.5a) and `/fix` (1a) gain the tally call and the spec-review snapshot.
5. **A report script.** For a date window, per reviewer and per requested and served model:
   - per reviewer slot: rounds `ok`, `failed`, `missing`, `skipped` and `not triggered`, and availability (failed or missing over slots that were neither skipped nor not triggered); per model: attempts and success rate from the attempt rows, so a Carbon failure rescued by Argon shows as a Carbon failure while the Gemini slot stays `ok`;
   - verified-unique defects per successful run in rounds where a peer also succeeded, plus a separate count of catches made with no peer present;
   - dropped per successful run (the triage cost) and tokens per run;
   - an overlap table of how many verified defects each pair of reviewers shared, so two reviewers that cover each other are visible even though neither scores unique;
   - splits by round kind and prompt-size bucket, with Gemini rounds that used the fallback flagged;
   - abandoned and waived rounds, counted per window.
6. **A monthly reading.** The first `/slava:maintain:weekly` run of each month (its own marker file, beside the weekly one) prints the report over the trailing 30 days and the Decision Criteria verdicts. (`/monthly` was ruled out: it carries no metrics by design. A cron was ruled out: the tally is a local file under `.git`.) It also re-checks three randomly picked `verified` defects and one `dropped` defect against the content the tally stored, since every number rests on the session's own triage; with fewer eligible, it re-checks all of them and says so.
7. **Baseline.** The numbers in Problem are the pre-ledger baseline, with their method stated (transcript phrase search, header extraction and the receipt and snapshot stores, deduplicated, approximate). They are not compared like for like with ledger numbers.

## Decision Criteria

Pre-registered: written before the data exists. **Runs** below means a reviewer's successful runs in any round (first, freshness or spec review) in which at least one other reviewer also succeeded. Freshness rounds count because multi-round reviews keep finding new defects after the first round. A Carbon failure followed by an Argon success is one run, Argon's. The report also splits every number by round kind.

Thresholds confirmed by the founder, 2026-11-26. Changing them later is a dated decision, not a quiet edit.

Every reviewer gets exactly one verdict per window, checked in this order:

1. **Not enough runs**: fewer than 20 runs. Nothing changes.
2. **Keep always-on**: at least 1 verified-unique defect per 20 runs (`unique × 20 ≥ runs`), or any verified-unique HIGH.
3. **Remove**: zero verified-unique defects in 60 or more runs.
4. **Stakes-gate**: zero verified-unique defects in 40 to 59 runs. Stakes-gated means it runs where its past catches cluster, by the report's splits.
5. **Watch**: anything else (some verified-unique defects but fewer than 1 per 20 runs, or zero in fewer than 40 runs). Nothing changes; the founder sees the numbers.

Dropped per run is printed beside every verdict.

6. **Noise is its own finding.** A reviewer averaging more than 5 dropped findings per run over 20 or more runs gets a tune item (prompt, effort or model), whatever its verdict. Volume buys more chances at a unique catch, so a noisy reviewer can still earn Keep through rule 2, including through one verified-unique HIGH. That is deliberate: Keep rests on verified catches nobody else made, which is the value; the noise is a cost, and this rule surfaces it as a tune item rather than hiding it inside the verdict. What the 2026-11-05 ruling rejected, ranking by findings raised, never happens.
7. **Overlap guard.** Two reviewers overlap when they share at least half of the smaller one's verified defects. Among reviewers that get Remove or Stakes-gate in the same window and overlap one another, directly or through a chain, act on one of them only, the one with the most dropped findings per run, and re-read the next month. Removing all of them could lose defects that only the group catches. A protected reviewer (Gemini, Codex or the Opus trigger, see Invariants) is never the one acted on; it becomes a founder item.
8. **Availability is its own finding.** A reviewer failed or missing in more than a third of at least 10 non-skipped attempts gets a fix-or-replace item, whatever its yield.
9. **Model choice (Carbon vs Argon, any new Gemini, GLM version)** is decided by the benchmark, as today. Production triggers a benchmark re-run only by comparing a model with its own past: when a requested model's verified-unique per run over 40 or more runs falls below half its rate in the 90 days before the window starts. A run belongs to the model that answered, so an Argon rescue counts for Argon. No trigger when that earlier period has fewer than 40 runs or a rate of zero.

## Alternatives Considered

| Option | Verdict | Why |
|---|---|---|
| A. Tally written at triage by its own command, enforced by the receipt and stamp commands, report and monthly reading | **Chosen** | Survives a fix voiding the receipt, and omitting a reviewer is impossible by construction. P1630's prose-only counts reached a minority of reports. |
| B. Keep the counts in the `Reviewers:` line and parse transcripts monthly | Rejected | Today's state. Transcripts are 7 GB, get pruned, and the line is skipped most of the time. |
| C. Per-reviewer raw findings ledger | Rejected | The 2026-11-05 ruling: it rewards noisy reviewers. |
| D. Benchmark only, no production record | Rejected | The benchmark is 12 historical bugs plus 3 controls and says nothing about availability, skips, or today's work. Kept as the model-choice oracle. |
| E. A judge model scores every finding | Deferred | Adds a vendor and a cost per run. The monthly sample re-check (Solution 6) measures triage quality first; reopen if it shows triage cannot be trusted. |
| F. Store the tally in the receipt or the spec's stamp | Rejected | The receipt is lost whenever a fix voids it, and the stamp overwrites in place, has no timestamp and sits in a public file. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A session labels a reviewer `skipped` that actually ran, or under-reports a run's findings | ACCEPT | No command can see what the session launched. The tally makes the omission explicit and visible; the monthly sample checks triage, not launches. |
| "Unique" is unfair when Codex and Opus read the repo and Gemini and GLM see only the prompt | ACCEPT | The question is whether anyone else caught the defect. The splits show round kind and reviewer set. |
| The new refusal blocks a "done" | MITIGATE | It names the snapshot that lacks a tally, and writing a tally needs no reviewer to run. |
| Duplicate merging at triage is inconsistent between sessions | ACCEPT | Same judgement P1630 already requires; the monthly sample includes merged rows. |
| The report cannot give money ROI | ACCEPT | It measures yield, availability, triage cost and tokens. Money is a private monthly figure read beside it. |
| Thresholds are arbitrary | ACCEPT | Pre-registered and founder-confirmed; changing them later is a dated decision, not a quiet edit. |
| GLM runs in a freshness round only as the finder of the fixed issue, so its freshness runs are a selected sample | ACCEPT | The founder's definition counts freshness runs. The report prints every number split by round kind beside the verdict, so a verdict carried by freshness runs is visible. |
| A session with no `CLAUDE_CODE_SESSION_ID` (a human shell, another harness, CI) is never refused | ACCEPT | Needed for a clean rollout and for tools that do not carry the id. `snapshot` warns each time. |
| `--abandoned` closes a real round without recording it | MITIGATE | The report counts abandoned rounds per window; a rising count is itself a finding. |

**Non-Goals**
- Do NOT change who reviews (the roster), the receipt floor, or GLM's skip rules. Roster changes are founder decisions taken from the monthly reading.
- Do NOT add a reviewer or a judge model.
- Do NOT re-run the benchmark in this spec.
- Do NOT write the tally into a spec file or any tracked file, and do NOT record spend totals in a public file.

## Done-When

- [x] A `/finish` round whose findings were fixed, and a spec review whose findings were fixed before a second round, each leave a tally per round with an outcome for all four reviewers, readable with `review_receipt.py tally --show`. Shown on real rounds. *Evidence: the `/finish` half is shown on this build's own eight real rounds (Build Report, Rounds), each tallied with all four outcomes. The spec-review half is shown on P1735's real spec review (2026-11-27): `tally --show` on `3dd1ca6d04df63f4.json` gives `spec first reviewed`, all four reviewers `ok`, 31 defects; on `7fbcbce43a8a0981.json`, after the round-1 findings were folded (commit 3631f08a8), `spec freshness` `after 3dd1ca6d04df63f4.json`, Gemini `failed (spend cap reached, HTTP 403)`, GLM and Codex `ok`, Opus `not triggered`, 16 defects. The stamp on P1735 was written from that second round (c06ee3567). INBOX-421 is met.*
- [x] Two unrelated first rounds touching the same file on the same day are both classed `first`; a re-review with `--after` is classed `freshness`. *Evidence: `scripts/test-p1734-tally.sh` groups [12], [40].*
- [x] A snapshot closed with `--abandoned` stops blocking `write`; one left open blocks it. An untallied snapshot taken by another session, or one with no session recorded, does not block. *Evidence: `scripts/test-p1734-tally.sh` groups [1], [11], [16], [18].*
- [x] Founder waiver: snapshot, every reviewer fails, the founder types "skip review"; the Stop hook (on a turn that announces completion over a reviewable, non-`.md` file) passes the turn, the waiver is in `.review-receipts` and a `waived` tally record exists. A second case makes the tally write fail and shows the waiver still recorded. Run through the hook itself, not only the subcommand. *Evidence: `scripts/test-p1734-tally.sh` groups [15], [20], [21], [38], [39], [40], all through `unreviewed_edits` in the hook.*
- [x] `review_receipt.py write`, `waive` and `spec_review_stamp.py write` each refuse when a snapshot that needs a tally has none, and accept `failed`, `missing` and `skipped` outcomes. `write` also refuses an abandoned snapshot and an evidence file the tally did not record; the stamp refuses without a tallied `--snapshot` holding the spec when the session id is set. Canned tests per command, exit codes pasted, plus a control built by deleting the tally of a real round. *Evidence: `scripts/test-p1734-tally.sh` groups [3]-[7], [14], [19], [23], [30].*
- [x] The tally command refuses an `--evidence` output whose vendor is not `ok`, an output older than the snapshot, an `ok` Gemini, GLM or Codex slot with no valid output, and a defect that names a reviewer that was not `ok`. Tests, exit codes pasted. *Evidence: `scripts/test-p1734-tally.sh` groups [8], [24], [26].*
- [x] Two identical snapshots taken in the same second by one session are two rounds, and one tally does not clear both. *Evidence: `scripts/test-p1734-tally.sh` group [2].*
- [x] `/finish`, the spec review in `/create-spec`, `/dev` and `/fix` call the tally; a fresh-session run of each is checked after merge. *Evidence: the skill text calls it (Build Report, Skill text), and this session's `/finish` rounds and the P1735 spec review ran it. Founder decision 2026-11-27: the fresh-session run moves to a post-merge check (INBOX-422), because a session runs the skills on main, so before merge it would exercise the old copies and pass falsely.*
- [x] A round where Carbon fails and Argon succeeds records two attempts with their own requested and served models, from a single output file carrying `fallback_from=` (the shape `ask-model` actually writes) and from two files. *Evidence: `scripts/test-p1734-tally.sh` group [9]; `scripts/test-p1734-yield-report.sh` `[single-file fallback]`, `[round-1 fix 4]`.*
- [x] Report, fixture 1, over 20 or more runs: a noisy reviewer (many dropped, no unique), an echo reviewer (many verified, all also raised by a peer), a quiet reviewer (few raised, one unique HIGH) and a noisy reviewer with one unique HIGH. The quiet one and the noisy-with-HIGH one get Keep, both noisy ones get a noise item, the echo one gets no Keep, and no output orders reviewers by findings raised or verified. This is the control for the 2026-11-05 ruling. *Evidence: `scripts/test-p1734-yield-report.sh` `[fixture 1]`.*
- [x] Report, fixture 2: a reviewer whose only catches came while every peer was absent. They appear in the separate column and do not earn Keep. *Evidence: `scripts/test-p1734-yield-report.sh` `[fixture 2]`.*
- [x] Every combination of runs and catches yields exactly one verdict: a table test over run counts 0–80, unique counts 0–5 and a verified-unique HIGH present or not, including the boundaries (one unique catch at 20 runs is Keep, at 21 runs is Watch). *Evidence: `scripts/test-p1734-yield-report.sh` `[table test]`.*
- [x] Report, fixture 3: two reviewers that always find the same defects. The overlap table shows it and the overlap guard acts on only one of them. A Remove verdict against Gemini or Codex prints as a founder item, not a roster change. *Evidence: `scripts/test-p1734-yield-report.sh` `[fixture 3]`, `[round-1 fix 10]`.*
- [x] The monthly report prints the reading, the verdict per reviewer or "not enough runs", and the re-check sample (three verified and one dropped defect, each with the stored content around its line, or all of them when fewer are eligible). *Evidence: `scripts/test-p1734-yield-report.sh` `[recheck]`, `[round-1 fix 7]`.*
- [x] Founder decision on the thresholds recorded in this spec (confirmed as proposed, 2026-11-26).
- [x] The existing suites pass, each run directly: `scripts/test-p1505-review-gate.sh`, `scripts/test-p1634-spec-review-stamp.sh` (including its assertion that a stamp changes exactly two lines), `scripts/test-p1664-receipt-unreadable.sh`, `scripts/pre-commit-checks.sh`. This spec changes what `write` and the stamp require, so the cases that write a receipt or stamp after a snapshot (the `[receipt]` sequence in test-p1505, the stamp writes in test-p1634) gain a tally step. Every such changed case is listed in the build report with its old and new setup; no expected exit code changes. *Evidence: p1505 103/0, p1634 42/0, p1664 all cases passed, pre-commit-checks exit 0 (one warning: an orphaned vite process this work did not start), 2026-11-27, final tree (Build Report, Evidence).*


## Build Report

**Built (P1734, /dev 2026-11-26 to 11-27).** Eleven review rounds:
- **Rounds.** Round 1 is the first round. Rounds 2 to 11 are freshness rounds, each over the previous round's fixes. Each is tallied under its own snapshot and readable with `review_receipt.py tally --show --snapshot <path>`.
- **`scripts/review_receipt.py`.** Adds `tally` (outcomes, attempts, defects, `--abandoned`, `--show`) and the write-once record with its additive amend. `write`, `waive` and the spec stamp refuse an untallied round. `tally_waived` serves the Stop hook.
- **`scripts/review_yield_report.py`.** The monthly reading.
- **`.claude/hooks/verify-before-stop.py`.** The founder waiver tallies the session's open rounds, and the founder's waiver is read before the edit scan. Its tail has one deadline counted from the hook's start. A file whose current content a `waived` round of the same session holds is not blocked on later (`review_receipt.founder_waived`), and no receipt is written for it.
- **Skill text.** `/finish`, `/create-spec`, `/dev`, `/fix` and `/weekly`.

### Changed cases in the existing suites (old setup -> new setup; no expected exit code changed)

Both suites now set `CLAUDE_CODE_SESSION_ID=t-legacy-suite-<p1505|p1634>` instead of unsetting it. They gain helpers `tally_for` (p1505) and `tally_spec` (p1634), which derive each reviewer slot from the evidence header's `vendor=`, plus `abandon` (p1505).

**scripts/test-p1505-review-gate.sh** (103 -> 103 assertions)
- `[receipt]` "write accepts fresh evidence for the snapshotted content": `snapshot; evidence; write` -> `abandon` the section's refusal-only snapshot, then `snapshot; evidence; tally_for; write`.
- `[receipt]` "only the latest record counts": `snapshot; evidence; write` -> `...; tally_for SNAP2 EV; write`.
- `[round 2] receipts` (alias.ts, a.ts, worktree a.ts): `write` -> `tally_for SN EV; write`.
- `[P1630]` vendor floor: one `tally_for "$VSNAP" "$V_OR" "$V_GEM" "$V_CODEX"` sits before the first accepting write. Stale and failed files are left out, since `write` ignores them.
- `[gate] P1634: subagent edits count`, and `[gate] P1634: scan that cannot finish` (301 files): `write` -> `tally_for SNAP EV; write`.
- Refusal cases are unchanged and still fire on their original reasons. The tally checks sit last in `write`.

**scripts/test-p1634-spec-review-stamp.sh** (42 -> 42)
- Stamped specs moved into a throwaway git repo (`$TMP/srepo`), because `snapshot` refuses files outside a git repo.
- `[check]`: `S1=$(snapshot -- "$S")`, then evidence, then `tally_spec "$S1" g o` (kind spec). The writes gained `--snapshot "$S1"`.
- The assertion that a stamp changes exactly two lines is unchanged and passes.
- The final real-header cases follow the same pattern with `S2`.
- Refusal cases are untouched.

**scripts/test-p1664-receipt-unreadable.sh**: unchanged (it stays sessionless).

### Evidence (live worktree, final tree)

```
test-p1734-tally exit=0 :: === Results: 354 passed, 0 failed ===
test-p1734-yield-report exit=0 :: === Results: 113 passed, 0 failed ===
test-p1505-review-gate exit=0 :: === Results: 103 passed, 0 failed ===
test-p1634-spec-review-stamp exit=0 :: === Results: 42 passed, 0 failed ===
test-p1664-receipt-unreadable exit=0 :: P1664 canary: all cases passed
```

The tests for each fix batch were run first against the unfixed code, and then passed with the fix. Round 4: 20 tally and 3 report assertions failed, plus 4 more in its second batch. Round 5: 3 tally and 2 report assertions failed, plus 11 more in its second batch. Round 6: 6 tally assertions failed, plus 7 more in its second batch. Round 7: 5 tally assertions failed. Round 8: 2 tally and 1 report assertions failed, plus 1 more in its second batch. Its two controls (another session's gate, and a file edited again after the waiver) block before and after the fix. Round 9: the hook-start test failed on the old clock (it got the full 5 s), and the unreadable-file test failed on the old loop. Round 10: 5 tally assertions failed across three batches. They cover the sibling in one snapshot, the deadline the hook passes, the second repo's unreadable index, the early-start control and the single tally parse. Round 11 (3 of 4 received: Codex hit its usage limit, recorded as `missing`) was told to fix forward only HIGH or MEDIUM findings that a probe reproduced. It found none that held, so it changed no file, and the receipt stands on its snapshot `ef17dd8bdc377b78`. Its Opus mutant run caught 9 of 13 mutants. The 4 survivors are listed below. Over the eleven rounds, 89 verified HIGH or MEDIUM defects were found and 87 fixed. The two left are INBOX-423 and the `session_untallied` traceback below. Two earlier mutation controls each failed exactly their own group: `_transition_refusal` returning None failed group 17, and `snapshot_store_check` passing copies failed group 23.

### Known limitations (recorded, not fixed)

- `spec_review_stamp.py write` with the session id unset and no `--snapshot` is not refused. This is the sessionless rollout contract.
- The Stop hook reads the session id from its stdin, and Bash reads it from the environment. After a resume they were not verified to agree.
- `--abandoned` closes only your own session's rounds.
- One review tallied under two snapshots counts twice. A run cannot be identified by its content, since two real runs can return identical bytes. Round 3 added a content-based refusal, and round 4 removed it after it broke the P1505 suite.
- A byte-identical failed retry, or two byte-identical outputs in one tally, count as one run. Without a wrapper-issued run ID, content is the only identity there is.
- A multi-repo snapshot copied into its second repo's store can be tallied there as well. Each repo's report reads one store.
- `--after` compares second-resolution timestamps and does not check that the two rounds are related. A wrong link misfiles a first round as freshness in the yield split, and it changes no receipt.
- When the edit scan is incomplete under a founder waiver, the hook closes every open round this session took in its repo, including one still under review. A later reviewed tally supersedes that waiver. The files those rounds hold are not receipt-waived, since a round can hold a co-tenant's file. The same session's later turns do not block on them while their content is unchanged. A file that was edited but never snapshotted, and lies past the scan, is not waived.
- A reviewed round past an incomplete scan, whose files changed after review, gets neither a waiver nor a note.
- The tail deadline does not bound gate 4's own pass over the transcript. A hook killed at the 20 s timeout drops every gate's message, since all of them are written after gate 4. This structure predates P1734.
- A revert to waived content after a later reviewed version is excused when the founder's turn scanned incompletely, and blocked when it scanned completely. The excused content is content the founder waived.
- `founder_waived` reads one session's index and the snapshots it lists before its per-snapshot deadline check. That took 0.10 s at 150 snapshots and a 31 MB tally store, down from 9.2 s before round 9.
- GLM timed out once in round 9 at 600 s and succeeded at 900 s. The timed-out attempt left no output, so the tally does not record it.
- The tally read in `founder_waived` takes a shared lock and waits behind a writer, whose appends hold it for milliseconds.
- A file swapped for a link between the link check and the read is read through. The hash check runs after the read, so mismatched bytes are never stored.
- Without a founder waiver, a receipt-store read error makes the gate pass silently. This is pre-existing on main and filed as INBOX-423.
- The receipt-store `waive` takes a blocking lock, also in the hook. Its single-line appends hold the lock for milliseconds.
- A late reviewer output that comes back empty stays recorded as `missing`, reworded with its reason. It cannot become `failed`, since an empty file is not an attempt row.
- An amend's "no new evidence needed for a held run" check reads the tally before taking the lock. Two concurrent amends of one snapshot are not a shape this repo produces.
- `session_untallied` raises on an unreadable session index rather than refusing cleanly. Every caller is a CLI refusal path (`write`, `waive`, the spec stamp), so the traceback writes nothing and fails closed. The hook's founder path wraps its tally call in a try.
- Four mutants survive the tally suite. No test pins that a walk cut short by a malformed entry keeps its earlier matches, or any one of `founder_waived`'s three deadline checks on its own. The per-file guards around `fingerprint` and `locate` cannot be reached by real inputs, since `fingerprint` already returns None on error and the hook passes strings.
- The waiver deadline is checked between tally stores, not inside one. A store whose read crosses the deadline is still written.

## Rollback Strategy

Revert P1735 first if it has shipped, since its refusal and `single vendor` line read the tally. Then revert this commit. The tally file is an untracked local file; receipts and stamps keep their current format.

## Related

- P1630: GLM in `/finish`, the receipt floor, the `vendors` field and the 30-day check this spec closes.
- P1634: the spec review roster and stamp; the 2026-11-05 ruling against a raw findings ledger.
- P1735: a first review round should not rest on one vendor (filed with this spec; builds on this tally).
- P1737: GLM reviews come back empty on large prompts (filed with this spec).
- Decisions 2026-11-19: Carbon stays the Gemini reviewer, on the benchmark.
