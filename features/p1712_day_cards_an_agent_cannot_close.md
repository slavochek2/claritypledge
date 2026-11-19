---
status: qa
type: bug
rank: 353
severity: high
date_reported: 2026-11-19
created_date: 2026-11-19
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [day, kanban, insights, founder-input]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
date_resolved: 2026-11-19
root_cause: "Items 1-5 and 7 as reproduced: the insight card printed the stored read's wording with no read date; the fixing prompt offered insight fps to day-evaluated, which cannot hide a server-added card; a confirm hid a key only until the next read; carriedNotes kept only the latest choice per card; day-kdd-capture.sh never searched for a P-less commit's sha. Item 6 (Due Board) is handled separately on main."
resolution: "insightIssue dates each card from the read and its age, re-words the read's this-week text, and rebuilds the next step by insight kind; evaluatedFingerprints skips insights and day-evaluated.ts refuses an insight fp, naming day-insight.ts; a confirm records the read's count and hides the key for 30 days unless the count doubles (confirmHides, shared by the Day page and the analytics route); carriedNotes carries every undelivered note per card, each run's last choice counting, a Park withdrawing earlier notes, and the prompt prints one insight block per insight; day-kdd-capture.sh captures a P-less commit when a decision entry cites a 7+ character bounded prefix of its full sha, failing closed on a search error."
reproduce_artifact:
  test_file: [tools/kanban/server/__tests__/day-p1712-reproduce.test.ts, scripts/test-p1712-day-kdd-capture-sha.sh]
  root_cause: "insightIssue prints the stored read's 'this week / first week it is raised / real user problem' text with no read date; evaluatedFingerprints offers insight fps that day-evaluated cannot clear; undecidedInsights lets a confirm hide a key only until the next read; carriedNotes drops an undelivered note once a later pick replaces it; day-kdd-capture.sh lists every P-less infra commit UNCAPTURED unconditionally"
  confidence: high
  surfaces_in_scope: [insight-card-text, fixing-prompt-verdict-list, insight-confirm-suppression, carried-notes, kdd-capture-p-less, due-board-prose]
  surfaces_deferred: []
  reproduced_at: 2026-11-19
  fix_shape: decided
  fix_shape_why: "decided per Fix Approach and the founder's 2026-11-19 decisions; item 6 has no executable canary (prose in day-cp.md plus the global dispatcher)"
---

# P1712: Day cards an agent cannot close come back every day (insight cards, monthly review, KDD capture)

## Summary

Four Day-page cards return daily because nothing an agent does can close them. The worst case: the weekly insight card "A new kind of failure appeared: Dead clicks" was shown on 2026-11-16, 17, 18 and 19 with the same week-old number. The founder answered it every day and believed they were being ignored. Follows P1707 (shipped 2026-11-18), which fixed note delivery but left the defects below. Related: P1673 (insight cards), P1647 (KDD capture check).

Founder, 2026-11-19, after the fourth day:
> "four times in a row this issue with clicks. Clearly something is going super wrong"

## Root Cause

Verified by command on 2026-11-19 unless marked otherwise.

1. **The card still asks whether the problem is "real".** `insightIssue` sets the obstacle to "Not yet known whether this is a real user problem" (`tools/kanban/src/lib/day.ts:1800`). The stored read's `next_step` ("decide whether it is a real user problem", written by `tools/kanban/src/lib/weeklyRead.ts:198` and already saved in `~/.claude-analytics/reads/2026-11-12.json`) shows under More info. The founder rejected this framing on 11-16, 11-17 and 11-18.
2. **A week-old read is shown as new, every day.** `point_a` reads "102 this week, first week it is raised" (`day.ts:1793-1799`), and the title is the stored "A new kind of failure appeared". The newest read is dated 2026-11-12, and the card never shows that date.
3. **The fixing prompt asks for a verdict command that cannot hide an insight card.** `evaluatedFingerprints` is passed `all.issues`, insights included (`day.ts:2573`), so insight fps appear under "Fingerprints to record" for `day-evaluated.ts`. But loops and `evaluate()` (`tools/kanban/scripts/day-loops.ts:348-350`) run only over the report's issues. Insight cards are added later on the server by `withInsights` (`tools/kanban/server/day.ts:193`, `:312`), and the 2026-11-19 report contains 0 `insight:` fps. An agent that records its verdict that way leaves the card up.
4. **Confirming a problem does not stop it coming back.** A confirm hides a key only until the next read (`analyticsStore.ts:123`). A dismiss hides it permanently (`weeklyRead.ts:174-187`). Dead clicks never reach zero, so a problem that was confirmed and fixed returns with the next read. Dismiss is the only way out, and it also hides any later spike.
5. **Notes replaced by a later pick are never delivered.** `carriedNotes` (`day.ts:2185-2193`) keeps only the latest option per card. The 11-19 "Look into it" pick replaced the founder's 11-16..18 notes, which were never sent (P1707 root cause 1) and are now neither carried nor flagged. `unansweredNotes` (`tools/kanban/scripts/day-notes.ts`) follows the same latest-choice rule; that half is a reviewer claim not re-run by command.
6. **The monthly review blocks the weekly one.**
   - `/day` runs at most one review per run: the one more days past its threshold (`.claude/commands/slava/maintain/day-cp.md`, Due Board step 1).
   - Monthly (last run 2026-10-21, due after 28 days) cannot run inside the `/day` subagent. It needs 4 session-log analysts plus a programme-health analyst. The founder's global rule requires their ok, with a token estimate, for 3 or more subagents, and a subagent cannot ask (2026-11-19 report, `cp.monthly:monthly:not-run-fanout`).
   - From 2026-11-20 monthly is always more overdue than weekly, so weekly is never picked. Weekly writes the analytics read (`/weekly` step 2.9.0), so the insight cards stay frozen on the 11-12 read.
   - Predicted from the selection rule; not yet observed on a run.
7. **A P-number-less infra commit can never count as captured.** `scripts/day-kdd-capture.sh:76-78` lists any infra commit whose subject has no P-number as `UNCAPTURED`, unconditionally. No decision entry can capture it. Commit 4f0087f4c has an entry ("Preparation funnel events…", 2026-11-18) and was still reported on 11-19.

**Reproduction, 2026-11-19 (/reproduce).** Canaries fail before the fix: items 1+2, 3, 4 and 5 in `tools/kanban/server/__tests__/day-p1712-reproduce.test.ts`, item 7 in `scripts/test-p1712-day-kdd-capture-sha.sh`. Item 6 has no canary: the Due Board choice is prose in `day-cp.md` and the global dispatcher, with no executable selection logic in this repo. Found while reproducing:
- The real 2026-11-18 entry for 4f0087f4c cites P1709 and P1708, never the sha (`grep 4f0087f docs/decisions.md` finds nothing). The sha rule alone will not clear the live `UNCAPTURED 4f0087f4c`: the fix must also add the sha to that entry. Decide too whether a 7-character citation matches git's 9-character short sha.
- The `unansweredNotes` half of item 5 is a documented rule (`day-notes.ts` header: a replaced note "is no longer the founder's question"). It covers delivered notes only, so it is not the 11-16..19 symptom. No canary was written for it.
- Existing tests assert the current behaviour and must change with the fix: `day-p1673-insights.test.ts` (point_a "first week it is raised", obstacle "real user problem"), `day-p1707-notes.test.ts` (`→ --fp ${fp}` in the evaluated list, and the `answeredToday` case expecting a replaced note not to be carried).

## Invariants

- **Analytics strings never reach an agent prompt unfenced** (P1673, P1707).
- **One ledger decision per insight** (P1673): a retry or double press never records a second one.
- **A founder-typed note is never silently discarded** (P1707): it is sent, or the page says plainly that it will not be.
- **The founder is never asked a judgement they cannot make** (founder, 2026-11-16..18): cards offer actions, never "is this real?".
- **The 3+ subagent fan-out rule is not weakened to unblock the monthly review.** The fix goes around the rule (ask at a point where the founder can answer), never through it.

## Reproduction Steps

1. Use the main repo with `~/.claude-analytics/reads/2026-11-12.json` as the newest read and no entry in `~/.claude-analytics/ledger.jsonl`.
2. `npm run kanban`, open `http://localhost:9050` → Day → Daily report for any run between 2026-11-13 and 2026-11-19.
3. Observe: the Dead clicks card shows "102 this week, first week it is raised" and "Not yet known whether this is a real user problem", with no read date.
4. Pick "Look into it", press Start fixing, and read the prompt. Observe: the insight fps appear under both "Record your verdict once" (day-insight) and "Fingerprints to record" (day-evaluated).
5. Run `day-evaluated.ts --fp insight:5fdd9c986d80f6c7 --verdict false …` and reload. Observe: the card is still shown.
6. KDD: `scripts/day-kdd-capture.sh --since 2026-11-18T10:00:00Z`. Observe: `UNCAPTURED 4f0087f4c`, although a decision entry exists.

**Reproduction rate:** 100% for 1-5 and 7. Item 6 is a prediction from the selection rule.

## Expected Behavior

- An insight card states the read's date and age, never says "this week" or "first week it is raised" for an old read, and never asks whether a problem is "real".
- The fixing prompt names one verdict command per insight, and that command removes the card.
- A problem the agent confirmed and fixed stays hidden until it crosses a threshold or an expiry, like `day-evaluated --threshold/--expires`. Founder decision 2026-11-19: hidden for 30 days, or sooner if the count doubles.
- A founder note replaced by a later pick before it was sent is carried with that pick.
- An overdue monthly review that cannot run in this pass does not block an overdue weekly review: the weekly one runs.
- The monthly review gets a way to run with the founder's ok, asked where the founder can answer. Founder decision 2026-11-19: one yes/no at /day start, at the dispatcher's announce point.
- A P-number-less infra commit is captured when a decision entry cites its short sha.

## Actual Behavior

The same three insight cards (Dead clicks `insight:5fdd9c986d80f6c7`, Rage clicks `insight:e23162390ddec8ae`, Not-found views `insight:ef533dcddf740b6a`) showed four days in a row with the 11-12 numbers. Founder notes on 11-16..18 reached no agent. `cp.reflect:kdd:uncaptured` returned after the founder handed it to an agent on 11-18. The monthly review did not run on 11-19 and, by the selection rule, would have blocked the weekly one from 11-20.

## Affected Files

- `tools/kanban/src/lib/day.ts`: `insightIssue` (~1792-1803), `carriedNotes` (~2185), `evaluatedFingerprints` (~2379) and its call (~2573)
- `tools/kanban/src/lib/weeklyRead.ts`: suppression rule (~174-198), stored `next_step` text
- `tools/kanban/src/lib/analyticsStore.ts` (path as found by `find`): confirm-hides-until-next-read (~123)
- `tools/kanban/src/components/day/DailyReport.tsx`: More info rendering (~627-673)
- `tools/kanban/scripts/day-notes.ts`: `unansweredNotes`
- `.claude/commands/slava/maintain/day-cp.md`: Due Board step 1 (one review per run)
- `~/.claude/commands/day.md`: due-board computation (global, outside this repo)
- `scripts/day-kdd-capture.sh`: P-less branch (~76-78), with its test `scripts/test-p1647-day-kdd-capture.sh`

## Severity

**High.** The founder's daily triage surface repeated an unanswerable card for four days, and the weekly review was about to stop running.

## Fix Approach

1. `insightIssue`: put the read date and age in `point_a`; drop "first week it is raised" when the read is older than the run; replace the obstacle wording; rebuild `next_step` at card time instead of showing the stored text.
2. Leave insight fps out of `evaluatedFingerprints`, or make `day-evaluated.ts` refuse an `insight:` fp with a message naming `day-insight.ts`.
3. Give a confirm the same threshold/expiry semantics as `day-evaluated`: 30 days, or until the count doubles (founder, 2026-11-19).
4. `carriedNotes`: when the latest option is a pick and an earlier note on the same target was never delivered, carry that note with the pick.
5. Due Board: when the review chosen this pass cannot run, run the other overdue one. For the monthly fan-out, apply the founder's decision above.
6. `day-kdd-capture.sh`: for a P-less commit, search the decisions logs for its short sha with a bounded pattern (decided 2026-11-19: a citation counts when it is a hex token of at least 7 characters, bounded by non-alphanumerics, that is a prefix of the full sha, so a 7-character citation matches git's 9-character short sha; the search cap is 500 lines per log so decoys sharing the prefix cannot hide it); add test cases for "cited sha captures" and "uncited sha stays uncaptured".

Rejected alternative, per P1673: sending insight text unfenced. Decisions grep run for "insight", "Due Board" and "kdd-capture": no entry contradicts this approach.

## Known Limitations

Set aside after the 2026-11-19 review (6 reviewers), each judged not a realistic open failure:
- A verdict command retried after a later read has doubled the count can record the verdict on the newer raising. It needs an old command re-run a week later.
- A note and a different pick on the same run: the pick replaces the note. Unchanged P1707 behaviour.
- A Park whose line is later removed lets earlier undelivered notes return.
- A note reworded on a later day is carried as two notes.
- `carriedNotes` orders runs by their position in `decisions.jsonl`, which is append-only.
- The live `UNCAPTURED 4f0087f4c` is cleared by a new decision entry citing its sha in the closing KDD on main; old entries are append-only.
- `scripts/test-p1712-day-kdd-capture-sha.sh`, like the existing `test-p1647-day-kdd-capture.sh`, is run by no runner (checked: pre-commit, CI workflows, package.json). Run by hand.

## Acceptance Criteria

- [x] On a run seven days after the newest read, the insight card shows the read's date and age and does not say "first week it is raised" or "real user problem" anywhere a founder sees it.
- [x] The fixing prompt for an insight card names exactly one verdict command, and running it removes the card on reload.
- [x] A confirmed insight does not return on the next read for 30 days unless its count doubles.
- [x] A note typed on a card, followed by a different pick the next day, reaches the next Start fixing. When several notes on one card were never delivered (the real case: 11-16, 11-17, 11-18), all of them reach it, not only the newest.
- [ ] [post-deploy] On the next /day with the monthly review chosen, the dispatcher asks one yes/no before the cp sub-day; on no, or with nobody at the keyboard, weekly runs. (Item 6, on main as ffb952906 plus a review-wording commit, and ~/.claude 83ff7d7 plus its review-wording commit.)
- [ ] [post-deploy] With monthly and weekly both overdue and monthly unable to run in the pass, the weekly review runs and writes a new analytics read. (Item 6 is prose in day-cp.md and the global dispatcher, committed on main as ffb952906 and ~/.claude 83ff7d7; there is no executable selection logic to test, so this is verified on the next /day run with both reviews overdue.)
- [x] `scripts/day-kdd-capture.sh` reports a P-less commit as captured when a decision entry cites its short sha, and as uncaptured when none does (new test cases, plus a mutation of the real decisions file per epistemic gate 7d).
- [x] Existing day-page and kanban tests pass. (Kanban vitest 49 files / 932 tests passing (round 4); P1647 KDD test 59/0. Two day-page e2e tests, "a long unbroken carried note wraps at 320px (P1707)" and "a folded note with a long URL wraps at 320px (P1707)" in `tools/kanban/e2e-day/day-analytics.spec.ts`, fail identically on clean main ffb952906 without this change: a P1707 regression filed as INBOX-382 in `docs/process-learnings.md`. In full-suite runs `opportunities.test.ts` and `security.test.ts` failed intermittently and pass on their own; not touched by this change.)
