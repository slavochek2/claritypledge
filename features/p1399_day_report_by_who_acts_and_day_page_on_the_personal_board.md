---
status: week
type: story
rank: 20
workstream: infrastructure
created_date: '2026-10-04'
tags: [day, kanban, reporting, founder-workflow]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1399: The /day report is sorted by who has to act, and the personal board shows it

## Problem

**Situation:** `/day` runs ~45 checks across the personal dispatcher and the ClarityPledge sub-day.
Its output is assembled by the agent, block by block, over several turns: cost, reflection, goals,
branches, users, due board, a 21-row HEALTH block, standing faults, triage, calendar concerns,
findings, questions. Nothing is kept after the session: the step ledger is overwritten by the next
pass, so there is no "yesterday's report" to look at.

**Complication:** The three or four things that need the founder sit at the same visual weight as
"mirror ✓". On 2026-10-04 the items that mattered (new room-access rules on live two days before an
event, a spec waiting 37 days, the hand-off prompt) were spread across six turns. Across the 30
recorded `/day` sessions since 2026-08-28, the founder's follow-up after the report is, in ~10 of
them, the same three questions: *what do I decide, is this real or already fixed, give me the
prompt for an Opus session*. Decisions already taken resurface: the founder parked p1181 and was
asked about it again on 2026-09-29 and 2026-10-02 ("maybe future day should know about it?").

**Question:** What shape does the report take so the important part is visible in seconds, stays
the same shape as `/day` keeps gaining checks, remembers what the founder decided, and can be
browsed on the personal board alongside earlier runs?

> Founder framing, verbatim: "It's too much. If I read it, I don't see what is important, what is
> not important." · "a lot of times I ask, for example, what's next? What's the next prompt?" ·
> "how to accommodate for future day changes" · "also to tell me what it did and what went
> successful so there could be like check marks" · "also we need to reflect what we don't show or
> where we hide the details if at all"

## Appetite

Blast radius: one flow (the founder's morning run) plus one new page on the personal board. Nothing
user-facing in the product. Reversibility: high, all git-revertable; the private data files are
additive. Decision density: low, since the four calls below were made in the 2026-10-04 session.

**Decisions already made (2026-10-04, do not re-ask):**
1. The history view lives on the **personal (pp) board only**. The board code is shared (cp
   `tools/kanban`); the page is switched on by the pp launcher and is off on the cp board.
2. **Look matches the board it lives in** (the existing kanban theme), with ClarityPledge's wording
   style and severity colours. Not the product's serif/brand look.
3. The board **can record founder decisions** (answer / park / done / snooze) into one private
   decisions file that `/day` reads. Plus a copy-prompt button.
4. **Phase 1 = the board page, fed by a hand-made report of the 2026-10-04 run.** No artifact, no
   hosted page. Phase 2 = `/day` writes that report itself.

## Solution

### 1. One report, two parts, each with a single dimension

The founder rejected a layout that mixed *who acts* with *what area* ("This is not one dimension").
So:

**Part A: what happened.** `DONE` is check marks for what the run did and what succeeded
(calendar refreshed +71, smoke 8/8, mirror 14/14, findings filed, what shipped since the last run).
One line each.

**Part B: what needs doing, sorted ONLY by who acts.** Each line carries an area tag
(`product`, `cost`, `security`, `outreach`, `life`, …) that never changes the grouping.

| Group | Definition | Who puts an item here |
|---|---|---|
| **Needs your answer** | A choice only the founder can make. Nothing moves until it is answered. Shows the options and any deadline. | A check, when its finding carries a question |
| **Give to an agent** | A problem an agent can investigate and fix on its own. **Includes a check that failed to run**, since then nobody knows whether that thing is fine. One prompt covers the whole group. | Every finding without a question |
| **On hold** | Still broken, but the founder decided to wait. Shows the founder's reason and how long it has been open. Returns as a question when the snooze ends or the fault gets worse. | **Only a founder decision.** An agent can never put an item on hold. |

**Part C: Readings.** One line each, never asking anything: Plan (goal and next event), Money
(cloud spend against budget, credits, Claude quota), Users, Life (mentions, help requests,
calendar), Checks (N of M ran clean). A reading out of range produces an item in Part B. It does
not change colour and expect to be noticed.

**Ordering inside a group is a rule, not a judgement:** has a deadline (soonest first), then days
open (oldest first), then real users affected.

**Why this survives future `/day` changes:** a new check either feeds a reading or emits items with
the fields above. Neither part ever gains a section. The layout is owned by one renderer, not by
the agent composing prose.

### 2. Visibility contract: what is shown, what is one step away, what is never shown

| Tier | What | Where |
|---|---|---|
| **Shown** | Run header (when, window covered, complete or not) · Done ✓ lines (up to 8, then "+N more ✓") · every Part B item: title, why it matters in plain words, deadline or age, options · Readings | Terminal card and board page, identically |
| **One step away** | Per item: what the check actually returned (the evidence), the healer's or tool's own words, how sure we are (verified / unverified) · the full check table (every check with its status) · long lists (all 29 calendar concerns, the branch list, funnel detail, full triage text) · earlier runs | Board: expand a card or open a run · Terminal: printed under a `DETAIL` heading after the card |
| **Never shown** | Step ids, ledger and stop-hook chatter, gate stdout that passed, "recording step X" narration, model-routing chatter beyond one line | Stays in the ledger and the session log |

Two rules bind the contract:
- **Nothing that did not run is ever hidden.** A failed or missing check is a Part B item (Give to
  an agent), never folded into "17 checks clean" and never pushed down to "one step away".
- **Anything moved down a tier stays reachable.** Hiding means one step away, never deleted. Only
  process noise is never shown.

### 2b. Output inventory: every current `/day` output, decided one by one

Founder, 2026-10-04: *"every output has been explained consciously: where, how, hidden or not and
why."* The routing rule is the same for every check, and the table records the exception where one
exists.

**The general rule.** A check that **passed** is counted in the Checks reading, and gets a Done ✓
line only if it *did* something worth knowing (refreshed, backed up, shipped). A check that **found
a problem** becomes an item: Needs your answer if only the founder can resolve it, Give to an agent
otherwise. A check that **did not run or could not prove its result** becomes a Give-to-an-agent
item, never a ✓. Its full raw output sits one step away in the all-checks table.

**The rule is enforced by the renderer, not by the agent.** A check whose status is `problem`,
`not-run` or `unproven` and that no recorded item points at gets an item synthesised for it. On
2026-10-04 the agent recorded 5 findings while the checks showed about 9 problems (adversarial
review, verified against the ledger). Every row below therefore has an implicit third column:
**did not run → G**, whatever its "when not fine" cell says.

**An item with options is a question.** The same fault never appears twice: a finding that carries
a question is shown under Needs your answer, otherwise under Give to an agent. One fault, one
fingerprint, one card.

**Mid-run asks are separate.** When the run is blocked on the founder *right now* (open Beeper, log
in to gcloud), it asks in one line at that moment and carries on. That is not a report section. The
outcome lands in Done ("calendar refreshed after Beeper was opened") or, if still unresolved at the
end, in Needs your answer.

Tiers: **D** Done ✓ · **A** Needs your answer · **G** Give to an agent · **H** On hold (founder only)
· **R** Reading · **X** one step away (expand / DETAIL) · **N** never shown.

| Current output | When fine | When not fine | Why |
|---|---|---|---|
| Model warning (not on Opus) | N in card; one header note "ran on Sonnet" | same | The founder chooses the model; one note is enough |
| Setup reminders (Whisper reset, extension check) | N | A if it needs his hand, else G | Housekeeping that only matters when broken |
| MCP / OAuth reconnect needed (Sentry, Mixpanel, Beeper token) | N | A, because only he can sign in | Agent cannot complete a sign-in |
| gcloud gate | N | mid-run ask | Blocks the run, so it cannot wait for the card |
| Start gate (previous pass finished?, calendar staleness, stop-hook liveness, NO LEDGER) | N | G "yesterday's run did not finish: steps …" | Only news when it failed |
| Due board (weekly/monthly reviews) | N | G "weekly review N days overdue (run in pp)" | An agent session can run a review |
| Sub-days dispatched | D "ClarityPledge checks: N ran" | G | Proves the second half happened |
| GCP credits | R Money | A (finding with a question) when the baseline needs a console reading · LOW BALANCE → A | Only he can read the console page |
| GCP budgets | R Money (account-wide %), per-budget lines X | G if a budget is new-over or unmeasured is new | Percent of budget is what he steers by |
| AI keys spend + prod ping | R Money "N keys, 0 over budget" | G unmonitored or dead key · A missing cap (console click) | Money summary daily; gaps are work |
| Off-machine mirror | D "N of N repos backed up" | G names the stale repo and age | A backup he never has to think about |
| CRM ingest, dsh key | counted in Checks | G | Background plumbing |
| Agent VM (outreach) | R Life/outreach "N actions in 24h" | G, or H if he deferred the fix | He cares whether outreach runs, not the VM |
| Heal attempt output | X | X, quoted on the item as the healer's claim | A label is not a diagnosis (4a ruling) |
| Standing faults (≥24h / ≥72h) | — | no own section; the item shows "open N days" and sorts first | Age was the signal; a red section beside others was read past |
| HEALTH block | replaced by the all-checks table X + Checks reading | failures are items | 21 equal rows hid the 3 that mattered |
| CM Events refresh + verify gate | D "Calendar: +71 new, 0 failed, verified" | G not verified | He sees it worked; proof one step away |
| Calendar concerns list | X, count on the Done line | G only if events were pushed wrong | 29 lines nobody acts on |
| Beeper triage: you came up, help requests | R Life counts, full text X | — | Ambient; worth a glance, not a task |
| Unanswered replies to his event posts | — | A "reply to … in …" | Missed replies on hikes were a stated pain (2026-09-03) |
| Stale triage digest | note on the Life reading "(from 2 Oct)" | G when older than 1 day: the digest pipeline is not running | Freshness is a pipeline fault, not a footnote |
| Imprecise reply matching (IMPRECISE count) | note on the Life reading | — | Says the reply count is weaker evidence |
| Memory save | N, or D if something was saved | — | Internal |
| Findings filed to inbox | D "N items filed" | G if filing failed | Proof the work left the session |
| Hand-off prompt | the G group's Copy prompt; full text X | — | One action instead of a re-ask |
| Finish gate, ledger, stop hooks, step ids | header "complete ✓" | header "incomplete" plus a G item per missing step | Process noise; only completeness matters |
| Prod smoke | D "Prod smoke 8/8" | G high | Confidence the product is up |
| Commits since last run (reflection) | D "Shipped: …" in user-value words | — | The check marks he asked for |
| Branches, stranded specs | spec waiting in QA → A "ship or park", branch list X | — | Only he ships or parks |
| Unpushed commits on main | R Plan "N commits not pushed" | — | Push is his call; a reading, not a nag |
| Stashes | N | A apply / drop | Rare and his call |
| KDD reminder, agent-config change verdict | X | G "run /kdd for …", or "rule change needs revision" | Agent work |
| Cloud servers, Ghost, DB backup | D "3 servers up, backup 1d old" | G | Reassurance plus proof |
| Gemini prod key, event-email cron, sessions, transcription, video summaries | counted in Checks | G (video summaries awaiting his yes → A) | Background; failures are work |
| Cost tripwire, €/day estimate | R Money estimate | G, or H if he accepted it | Spend is a reading; a leak is work |
| Signups, funnel, user intelligence | R Users "N signups, funnel …", narrative X | — | He asks "who are they" only when there are some |
| Sentry new issues | counted in Checks | G one item per issue: users affected, events | Agent investigates first |
| Ops issues (GitHub) | — | G with the issue's own age | Agent work |
| Lint and tests | D "5410 tests pass, 0 lint" | G | Check marks |
| RLS / function-grant / privilege-floor drift | counted in Checks | G (an agent can match it to migrations) · unproven result → G | 2026-10-04 showed the "is it yours?" question is answerable from the repo |
| Reflection: Business / Insight / Challenge / Attention | X | — | Useful context, not daily action |
| Tomorrow + goals "what's next" | R Plan: next goal and next event; rest X | G if goals.md does not parse | The one line he plans by |
| Do / Don't | X | — | Reference, not news |
| Sub-day's "questions for the founder" | — | A, one item each | They are his decisions |

### 3. The board's Day page (personal board)

- A new page in the sidebar, present only when the server is given a day-data directory (the pp
  launcher sets it; the cp launcher does not).
- **Order: header with a one-line summary** ("2 need your answer · 8 for an agent · ✓ 11 done ·
  14 of 23 checks clean") **→ the three groups → Readings → Done ✓ → one step away.** The first
  build put Readings and Done on top, and at 1440×900 "Needs your answer" fell below the fold:
  the original complaint, rebuilt. Actions first; success stays visible in the summary line.
- A run that is the newest but older than 24h carries a warning: either /day has not run, or a
  later run died before saving (adversarial review W7).
- Card actions: **Needs your answer** shows the options as buttons plus hold and snooze. **Give to
  an agent** has one "Copy prompt" for the group, and per card: **Fixed**, **Not a problem** (a false
  alarm, so a later phase can flag the check that raised it), snooze and hold. **On hold** shows the
  founder's reason and age, and an "un-hold" action.
- A list of earlier runs: date, complete or not, and counts per group. Selecting one shows that
  run read-only (decisions apply to the latest run only).
- Pressing a decision writes one line to the private decisions file and moves the card immediately.

### 4. Data contract (Phase 1 fixes it; Phase 2 produces it)

Private, outside every repo: a day-data directory holding `reports/<pass>.json` (one per run) and
`decisions.jsonl` (append-only). The board reads both; it writes only `decisions.jsonl`. An item is
keyed by a **fingerprint** so a decision on Monday still matches the same fault on Thursday.

**The fingerprint must not come from the title** (adversarial review B1, verified 2026-10-04 against
the private inbox: the Agent VM fault was filed under 6 different fingerprints, the mirror under 4,
CRM ingest under 3, because titles carried "62h+", "13.6 days", "escalated 7d"). Phase 2 makes the
fingerprint `check id + fault key`, where the fault key is a fixed slug the check names
(`vm:healer-gave-up`, `mirror:repo-stale:<repo>`), never prose. Titles are free text.

**Titles carry no ages or counts.** The card shows "open N days" from `first_seen`; a title that
also says "19 days" disagrees with it the next morning (seen in the first build: title "19 days
ago", card "open 20 days"). Counts and dates go in `why` or `evidence`.

### 5. Phase 2: `/day` produces the report

- **Per-check status, from the check's own command.** Today the ledger records one row per *wave*
  (`cp.w3 ok 0` while RLS drift inside it exited 1), and 14 of 34 rows are agent-attested prose.
  Each check prints one machine line (`CHECK <id> <ok|problem|not-run|unproven> <detail>`) that the
  step runner records; MCP checks that only the agent can attest are marked agent-reported. This is
  a change to how results are *recorded*, not to what is checked, so it sits inside the non-goal.
- Checks record items at the moment of finding, extending the existing finding command with a
  required fault key, optional question/options, area, deadline and evidence. Readings and Done
  lines are recorded the same way.
- **The report is written at the start of the pass (state `running`) and rewritten at the end**,
  so a pass that dies still leaves a visible, incomplete report instead of yesterday's as "latest".
- **The terminal prints only the card.** Detail lives on the board; `day detail` prints it on
  demand. Printing a DETAIL block after the card would leave the terminal as long as today
  (review N12).
- Age of a fault already open before Phase 2: taken from the check's own clock when it reports one
  (the healer's `unhealthy_since`), else from the first run that saw the fingerprint.
- At the end of the pass a renderer script (not the agent) reads the ledger, the manifests and the
  decisions file, writes the run's JSON, and prints the terminal card. The agent relays it.
- The existing hand-off prompt is generated from the "Give to an agent" group and opens by telling
  the receiving session to **verify every item before acting**.
- The sub-day's "QUESTIONS FOR THE FOUNDER" become findings with a question; standing-fault age
  comes from the first run that saw the fingerprint, not from the agent's reading.

## Invariants

- **"Did not run" never reads as clean.** This is the property every `/day` gate exists to protect
  (P1324, P1205; decisions.md 2026-09-16). A missing or failed check is always a visible item.
- **Private data never enters a repo.** Reports and decisions live only in the private day-data
  directory. The board code (public repo) carries no report content, and committed tests and
  evidence screenshots use synthetic fixtures (P1317 precedent).
- **Nothing derived from report content is logged**, nor persisted in browser storage. Logs carry
  path, line and a fixed-vocabulary reason only. The API binds to loopback (P1317 Invariants).
- **Only the founder puts an item on hold.** No agent code path writes a hold decision: the board
  writes on his click, and a terminal `/day park` runs only when he types it. This is enforced by
  where the writers are, not cryptographically: the decisions file is a plain private file.
  Decisions made before this shipped (the 2026-10-02 VM deferral, the p1181 park) are not
  migrated by an agent. He presses Hold on them once.
- **The board's inbox stays read-only.** Day decisions go to their own file; they never edit, close
  or annotate inbox entries (P1317 Non-Goals).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Hiding green checks hides a "did not run" | MITIGATE | Invariant 1; Done-When has a known-bad control |
| A held item silently gets worse | MITIGATE | Hold expires on snooze date, and an item whose severity rises re-surfaces as a question |
| The ready-made prompt contains a wrong claim (2026-10-04's run contradicted itself twice) | MITIGATE | The prompt instructs verify-first; items carry their evidence and verified/unverified flag |
| Severity ranking reflects the agent's mood | MITIGATE | Ordering is the fixed rule in Solution 1 |
| Phase 1 fixture drifts from what Phase 2 emits | MITIGATE | Phase 1 defines a validated schema; Phase 2 must pass the same validator |
| Decision file written while a `/day` pass reads it | ACCEPT | Append-only lines, read once at render; a decision made mid-run lands on the next run |
| Report history grows without bound | ACCEPT | ~10 KB per run; prune later if ever needed |
| Terminal still long | MITIGATE | Phase 2 prints the card only; detail on demand |
| Fingerprints drift with titles (verified: 6 fingerprints for one fault) | MITIGATE | Fault key, Solution 4 |
| Ledger is per wave, so a problem inside a wave reads ok | MITIGATE | Per-check status lines, Solution 5 |
| Phone widths: the board shell keeps a 200px sidebar, and the API answers on loopback only, so no phone can reach it | ACCEPT | Verified at 720px (half-screen) and at 375/320 with the sidebar collapsed |

**Non-Goals**
- Do NOT show the Day page on the cp board.
- Do NOT restyle the board or change other pages.
- Do NOT let the board fix anything, run checks, or trigger `/day`. It shows and records decisions.
- Do NOT change what `/day` checks in this spec. Only how results are recorded, kept and shown.
- Do NOT publish any report to a hosted page.

## Acceptance Criteria

**Phase 1: board page**
- [ ] On the personal board, a "Day" page shows the 2026-10-04 run: header, Readings, Done ✓, and
      the three groups, each item with its area tag, plain-words consequence, deadline or age.
- [ ] The cp board shows no Day page (verified by loading it).
- [ ] "Copy prompt" puts one prompt on the clipboard covering every "Give to an agent" item, and it
      starts with the verify-first instruction.
- [ ] Park / snooze / done / answer on a card moves it at once and appends one line to the
      decisions file. Reloading the page keeps the result.
- [ ] Expanding an item shows its evidence. Opening "all checks" lists every check with its status.
- [ ] An earlier run can be opened from the history list and reads as read-only.
- [ ] Known-bad control: a fixture with a check whose status is not-run, unproven or problem and
      **no item pointing at it** shows a synthesised card under "Give to an agent", and the Checks
      reading does not count it as clean. The grouping is computed by the board from the check
      status, so the control can fail (shown by breaking the rule and watching the test go red).
- [ ] "Not a problem" resolves an item as a false alarm, distinct from "Fixed".
- [ ] A newest run older than 24h shows a warning.
- [ ] The API answers on loopback only (`lsof` evidence), and no report text reaches the server log
      (a secret marker in the fixtures is asserted absent from captured logs).
- [ ] Missing day-data directory → the page says so plainly. An empty reports directory → "no runs
      recorded yet". Neither shows an empty-but-normal page.
- [ ] Screenshots at 1440, 720, and 375/320 (sidebar collapsed) pass the visual QA checklist,
      reviewed by a separate subagent given only screenshots and the checklist. Screenshots use a
      synthetic copy of the run, never the real one.
- [ ] At 1440×900, "Needs your answer" is visible without scrolling.

**Phase 2: `/day` writes it**
- [ ] A real `/day` pass ends with the renderer's card as its final output, and the same run
      appears on the board without hand-editing.
- [ ] An item the founder parked on the board does not appear under "Needs your answer" on the
      next pass, **even when the check's title text changed**. It shows under "On hold" with the
      reason.
- [ ] Every check has its own status row in the ledger; a check failing inside a wave is a problem
      on the board.
- [ ] A pass killed mid-run leaves a report marked incomplete, and the board shows it as latest.
- [ ] A standing fault's age is computed from the first run that saw it, and matches the healer's
      own date within a day.

## Alternatives Considered

- **A hosted artifact page first.** Rejected: it would publish real infrastructure and spend data,
  or be a throwaway on fake data that then gets rebuilt in the board.
- **Agent writes the report JSON at the end of the pass.** Rejected for Phase 2: the agent is what
  dropped steps 12 of 13 times (P1324); the renderer must read recorded facts.
- **Grouping by area (Money / Product / Life).** Rejected by the founder in session: it mixes two
  dimensions with "who acts".
- **Write decisions into the task inbox.** Rejected: the inbox is read-only on the board by design
  (P1317), and a parked `/day` item is not deferred work.

## Rollback Strategy

Phase 1: unset the day-data directory in the pp launcher and the page disappears, or revert the
board commit. Phase 2: revert the skill and script commits; `/day` returns to agent-composed
output. Private data files can be deleted without affecting anything else.

## Founder verdict on the first build (2026-10-04)

> "it looks like shit, it's cluttered, it's not according to the tasks, it's not clear ... the
> copywriting is bad. Overview is bad. ... Let's redo it."

The Phase 1 UI on this branch (commits 598e63aaa, d02c53ba4) is **rejected as a design**. Keep: the
data contract, server routes, decision file, tests and the rules in `src/lib/day.ts`. Redo: the
page. Next step: a product-manager pass turns this conversation's inputs into user stories, and a
fresh agent builds a frontend-only artifact from those stories alone, before anything is wired.

## Review findings (2026-10-04)

One hostile reviewer, 1 of 1 reported. Verified by command before adoption: B1 (fingerprint drift,
inbox titles), B2/B3 (per-wave ledger, 5 findings vs ~9 problems, from the run's own ledger). B4
was partly wrong: the Phase 1 board computes grouping from check status, and the control was shown
to fail when the rule was broken. W5, W7, W8, W11 and N12 adopted above. W10: the server logs only
fixed-vocabulary reasons (asserted by test with a secret marker); QA screenshots use a synthetic
copy. Not verified by anyone: Vite dev-server DNS-rebinding behaviour (the API itself refuses
non-loopback Host headers, tested).

## Open Questions

1. Should the terminal card also offer `/day park <n>` style commands, so decisions can be made
   without opening the board? Founder said "terminal can write it too" was fine. Phase 2 detail.

## Related

- P1324 (step ledger, findings filed to inbox) · P1328 (sub-day in a subagent) · P1317 (inbox on
  the board, privacy precedent) · P1155 (escalate on age, not occurrence) · P1205 (completion
  graded on a third-party artifact)
