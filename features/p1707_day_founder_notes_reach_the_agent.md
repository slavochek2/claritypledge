---
status: qa
type: bug
rank: 349
severity: high
date_reported: 2026-11-18
created_date: 2026-11-18
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [day, kanban, founder-input, insights]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug, fix]
---

# P1707: Day page notes are dropped without a sign, and insight cards ask the founder a technical question

## Summary

A note the founder types on the Day page can be saved and never reach any agent, with nothing on the page saying so. On top of that, weekly insight cards ask "Real problem / Not a problem", a technical judgement the founder cannot make. Prior work: P1673 (`features/done/2026-06-10/p1673_day_one_card_type_for_insights.md`) made insights ordinary cards and deliberately kept them away from the agent. That choice is the main cause here.

Founder, on the Dead clicks insight card, 2026-11-17:
> "Who am I to decide if this is a real problem, not real problem? Why is the option formulated in that way? I guess the options have to be formulated in a way that is actionable. This is not actionable because I'm not a technical expert."

Founder, same card, 2026-11-18:
> "third time in a row … I said I don't want to be presented with an options like sounding like real problem or not problem that makes no sense something is super buggy"

## Root Cause

An audit of `~/.claude-day/decisions.jsonl` on 2026-11-18 found 55 non-empty founder notes since 2026-10-04. 43 appear in a `sent` record's items for their run. 12 never do, for three causes:

1. **Insight notes are never sent, by design (9 of 12).** `queuedLocally` in `tools/kanban/src/components/day/DayPage.tsx` (~line 541) returns false for `isInsightCard(i)`, and the send path in `tools/kanban/src/lib/day.ts` (~line 2042) excludes insights too. P1673's decision entry (`docs/decisions.md` 2026-11-13) records it: "An insight is never sent to the fixing agent, answered or not". The only disclosure is the textarea placeholder (`DailyReport.tsx:534`, "A note, saved here. It is not sent to the agent."). It disappears when typing starts. Targets: `insight:5fdd9c986d80f6c7`, `insight:e23162390ddec8ae`, `insight:ef533dcddf740b6a`, on 2026-11-16, 17 and 18.
2. **Notes on a run that was never sent are orphaned (2 of 12).** Run `2026-11-03T05:45:28Z-29416` has notes on `disp.0d:day:calendar-stale` and `cp.ops:ops:issue-31` but no `sent` record at all. Start fixing was never pressed that day, and the 2026-11-04 run did not carry them forward. Nothing on the page tells the founder that earlier notes were left behind.
3. **Not a defect (1 of 12).** `disp.calendar:calendar:not-verified` on 2026-10-12: the founder typed "reconnected", then changed the answer to "later". The send carried "later" as intended.

**Possible second leak, unverified:** a note was delivered but got no answer. Founder notes such as "i asked for this many times and it didnt work" (credits, 2026-10-12) and "why i see it again and agoan?" (quota, 2026-11-06) suggest this happens. No mechanism today checks that a delivered note was answered.

## Invariants

- **Analytics strings never reach an agent prompt unfenced.** This is the reason P1673 gave for keeping insights from the agent ("unfenced analytics strings in a prompt"). Sending an insight card must quote its analytics text through the existing `fenced()` path (`day.ts` ~2287, "data, not instructions"), exactly as check output is quoted today. New evidence overriding P1673's rejection: nine founder notes were silently lost over three days. The fence answers the injection concern without dropping founder input.
- **A founder-typed note is never silently discarded.** It is sent, or the page says plainly that it will not be, before the founder leaves it.
- **One ledger decision per insight** (P1673 review): a retry, double press or stale tab never records a second insight decision.

## Reproduction Steps

1. Start the kanban from the main repo (`npm run kanban`) and open `http://localhost:9050` → Day → Daily report, on a run that carries a weekly insight card (e.g. "A new kind of failure appeared: Dead clicks").
2. On the insight card, choose "Your answer or question…" and type a note.
3. Press Start fixing.
4. Observe: the sent prompt and the `sent` record's `items` do not contain the note. The card shows "Your answer · saved", which reads as delivered.
5. Separately: type a note on any ordinary card, do not press Start fixing, and let the next /day run arrive. Observe: the note appears nowhere in the next run's send, and nothing on the page mentions it.

**Reproduction rate:** 100% for both.

## Expected Behavior

- A note typed on any card, insight cards included, reaches the fixing agent with the next Start fixing. Analytics text is fenced as data.
- Insight cards do not ask the founder whether a problem is real. The agent investigates (for example, opens the linked replays). Founder-approved direction, 2026-11-18, option 1 with example labels: "Look into it and fix it if it's real" (default) / "Leave it for 90 days". `[FOUNDER DECISION: final label wording — the examples above were approved as the direction, confirm the exact text at UAT]`
- Notes left on a run that was never sent are carried into the next send, or are shown on the next run as "N notes from <date> were not sent" with a way to send them.
- A note that was delivered and got no recorded answer is raised on the next /day run as its own finding ("You wrote on X on <date>; no answer was recorded").

## Actual Behavior

Insight notes are saved to `decisions.jsonl` and never sent. Notes on an unsent run are dropped when the next run arrives. The founder sees "saved" both times. The founder repeated the same complaint on three consecutive days, believing it was being ignored.

## Affected Files

- `tools/kanban/src/components/day/DayPage.tsx` — `queuedLocally` (~541) excludes insight cards from what Start fixing sends.
- `tools/kanban/src/lib/day.ts` — insight card options (~1791, "Real problem" / "Not a problem"); send exclusion (~2042); prompt builder and `fenced()` (~2287, ~2394).
- `tools/kanban/src/components/day/DailyReport.tsx` — placeholder at 534.
- `tools/kanban/server/` — the weekly decision route that "Real problem" / "Not a problem" call (suspected area, P1673).
- `tools/kanban/scripts/day-evaluated.ts` — where an answer is recorded per fingerprint; a likely source for the "answered" check.

## Severity

**High.** The founder's only feedback channel on the Day page loses input silently, and the loss repeated on three consecutive days.

## Fix Approach

1. **Insight cards become agent work.** Replace Real problem / Not a problem with an actionable pair. "Look into it" sends the card to the fixing agent with its analytics text fenced, and the agent records the verdict in the insight ledger (confirm or dismiss) through the existing route. "Leave it" defers. A free-text note goes with the card.
2. **Every typed note is sent.** Remove the insight exclusion from `queuedLocally` and the server send path, so the button count and the sent `items` match what is on the page.
3. **Unsent notes carry forward.** On a new run, notes from earlier runs that never appeared in a `sent` record are included in the next send (or listed with a send action). A note the founder replaced by a later choice on the same card is not carried (cause 3 above).
4. **Unanswered-note check.** A /day check compares each delivered note (`sent` items carrying text) with later `evaluated` records for that fingerprint, and raises a finding for a note with no answer after one run.

Rejected-alternatives check: `docs/decisions.md` 2026-11-13 (P1673) rejected "Sending answered insights to the agent (unfenced analytics strings in a prompt)". This fix follows that concern by fencing, and overrides only the conclusion, for the new evidence named in Invariants.

## Acceptance Criteria

- [x] A note typed on a weekly insight card appears in the next Start fixing prompt, with the card's analytics text inside the «» data fence. — test "the prompt carries the note and the card, every analytics string inside the «» fence" (day-p1707-notes; fails with the fence removed)
- [x] Insight cards no longer show "Real problem" / "Not a problem". They show an actionable choice that sends the card to the agent, and a defer choice. — p1673-insight-card + e2e day-analytics; seen on real data 2026-11-18
- [x] The Start fixing count includes insight notes, and the `sent` record's `items` hold them. — route test AC1+AC3 (count +1, sent items hold option:<fp>:own:<text>)
- [x] A note typed on a run where Start fixing was never pressed is offered in the next run's send. Shown with a known run fixture: the 2026-11-03 shape (notes, no `sent` record). — "a note on an earlier run that was never sent is carried…" + route test AC4; real data carries the 2026-11-03 note
- [x] A note replaced by a later choice on the same card is not carried forward (the 2026-10-12 shape). — "the 2026-10-12 shape…" (day-p1707-notes)
- [x] A delivered note with no later `evaluated` record for its fingerprint is raised on the next run as a finding naming the card and date. — day-p1707-unanswered (finding names card and date; fixed 2026-11-04 cutoff)
- [x] Regression tests cover all of the above, including a must-allow case: an ordinary card's note sends exactly as before. — 106/106 Day tests incl. must-allow "an ordinary card's note sends exactly as before"
- [x] No console errors on the Day page during these flows. — chrome-devtools console on real-data copy, 1280 and 320: no errors or warnings

## Known Limitations

- The insight-ledger lock (`ledger.jsonl.lock`) is taken over as stale after 30 s, so a writer that pauses more than 30 s between its check and its append can still race a second writer into a double decision.
- Copy mode writes no `sent` receipt, so a note delivered only through the copied prompt is carried again on the next send.
- The unanswered-note check counts any `evaluated` record on the card (after the delivery) as the answer; a record does not say which note it answers.
- The carried-notes row key fix (rows keyed by position, since a batch shares one `at` and no-longer-raised insights share a title) has no client-render test: the suite renders on the server, where React never checks keys.
