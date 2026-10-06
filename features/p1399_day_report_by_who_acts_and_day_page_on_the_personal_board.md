---
status: in-progress
type: story
rank: 20
workstream: infrastructure
created_date: '2026-10-04'
tags: [day, kanban, reporting, founder-workflow]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

> **Superseded by §3 (2026-10-04)** for layout: the two action groups became one Issues flow.
> Still binding: who-acts thinking, "did not run never reads as clean", the output inventory as
> a coverage list (§2b), and the visibility idea (detail one step away).

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

### 3. The board's Day page (personal board) — redesigned 2026-10-04

The first build of this section was rejected ("cluttered, not according to the tasks, not clear,
copywriting bad, overview bad"). The replacement below was reached through user stories and twelve
rounds of a frontend-only mockup reviewed by the founder, two hostile visual reviews (Opus, Gemini)
and one adversarial coverage review. The approved mockup (`index.html`), its control list (`controls.md`: every
clickable control and exactly what it does) and the user stories live in the private design
folder `<cp-root>/.private/p1399-day-design/`. The mockup is the visual reference; this section
and §7 are the contract where they differ. It supersedes the "three groups" layout of §1: Needs-your-answer and
Give-to-an-agent were found to be **one thing** ("isn't it the same?"), an issue whose options may
include handing it to an agent.

> Founder, verbatim: "a decision it should explain the problem ... my options and what you
> recommend and why and then just select the option" · "connection is straightforward click and
> fix" · "at the beginning I just want to see what worked" · "I resolve them all ... and at the
> end I say go and start" · "it has to be consistent across everything"

**Placement and look.** One entry in the board's existing left sidebar (personal board only). The
page uses the ClarityPledge design system (font, colours, buttons, cards), not the board's Notion
theme (overrides decision 2). Colour has three meanings only: blue = an action, amber = needs you,
green = worked. Red appears only on the "not connected" mark. One centred column; the header is
identical on every tab.

**Header.** Four tabs: **Daily report · Stats · Monitoring · Reflection**, and directly below them a
compact day switcher `‹ Sun 4 Oct ›` (earlier runs open read-only, with "Back to today"). A run
that also ran a weekly or monthly review carries a small "Weekly review" / "Monthly review" badge;
its items join Issues and Reflection — no separate tab. Stale or incomplete runs show one warning
line under the switcher.

**Daily report — one flow, not steps.**
1. **Status panel** (left on desktop, collapsible strip on phones). Broken connections first, one
   row each ("Sentry · login expired") with a **Fix** button — no options, no explanation. Then
   every check of the run, one row each, with the run's own status: **✓ Worked · ! Problem ·
   ? Not proven · – Skipped (on purpose)**. Passed rows are folded. When all connections are fixed
   the panel collapses to one line ("✓ All connected · 9 passed · 3 checks → in Issues") and can be
   reopened. Also on this line: unpushed commits.
2. **Issues, one card at a time.** Card, top to bottom: small topic tag (top-left) and Urgent
   (filled amber) / Important (filled dark) pills and age in days; title; **Point A · Obstacle ·
   Point B** (labelled, one short line each); "More info" (folded, directly under Point B: why
   recommended, first seen, source); then **options** as a radio list, the recommended one
   preselected and marked "Recommended · 85%" (the agent's confidence; nothing else), plus "Ask a
   question…" and "Other…" which open a text box. Typical options include "Give to an agent" and
   "Park: stop asking until I bring it back". Anything that fits nowhere else — sub-day questions,
   open questions, weekly/monthly proposals, a failed check with no write-up — is an issue.
3. **Navigation and progress** live in a fixed bottom bar on every tab: `‹ Previous · 3 of 10 ·
   Next ›` (≥44px, keyboard ← →, ignored while typing), "4 of 10 resolved" with a thin progress
   line, and a compact **Start fixing (N)** with a copy icon. Next accepts the preselected answer.
   Nothing on the page moves when a card expands; the page has one scroll.
4. **Start fixing is global**: it collects issue answers, reflection ratings and stories, and
   budget changes from Monitoring into one prompt that opens with "check each item is still real",
   answers the founder's questions first, and acts on the rest. Clicking it opens a new tab in the
   founder's terminal and starts a Claude session with that prompt; copy is the fallback.

**Stats.** Funnel first: Reach-outs → Champion talks → Qualified opportunities → Pilot agreed →
Pilot event held. Then simple line charts against proposed targets: reach-outs per week, events per
week (goals review, all targets `[FOUNDER DECISION]`). Plus product readings: signups that did not
confirm, mentions and help requests. Metrics /day does not collect yet are labelled "not collected
yet", never shown as zero.

**Monitoring.** Overview cards (Claude, Codex, Google Cloud); selecting one shows its detail with a
Week / Month toggle and ‹ period ›. Claude and Codex: remaining quota with a dashed projection to
the reset date, the reset marked, a verdict ("Runs out Tue"), and the 5-hour window for Claude.
Google Cloud: account budget and credits (shown with their own caveat, e.g. "~€N · unverified"),
then one horizontal bar per key, spent vs its budget, closest to the limit first. Clicking a key or
the account budget offers "Raise monthly budget to €__", which joins Start fixing. A **Systems**
section lists every non-money check, grouped (servers and blog, backups and mirror, transcription
and video, keys liveness, cost-leak tripwire, outreach machine, CRM, email and sessions), each
with status and one line.

**Reflection.** Provocative "change" statements only (no "keep"), one at a time, each rendered with
the product's point card and its position control (Disagree / Unsure / Agree, with Somewhat /
Strongly). Choosing a position opens an optional "Add your story" box. Ratings and stories join
Start fixing. The statements are written by an **Opus** agent that `/day` spawns for this step
(the rest of `/day` may run on Sonnet).

**Extensibility contract (adversarial review, adopted).** The page never needs a UI change for a
new check: every check gets a row; an unknown status renders as "Not proven", never as fine; any
non-ok check without a finding becomes a default issue (Give to an agent / Park); every finding,
including weekly and monthly ones, uses the one issue format; readings are rendered as given; a
newer report schema falls back to plain text rather than an empty or clean page.

### 4. Data contract (Phase A fixes it; Phase B produces it)

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

**Additions for the redesign (§3).** A run also carries: `reviews` (which of weekly / monthly ran
inside it); `issues` in the one format (fingerprint, topic, urgent/important, point A / obstacle /
point B, options with one `recommended` and a 0–100 `confidence`, more-info text, first seen);
`checks` with a `group` for the Monitoring Systems section; `monitoring` (quotas with reset dates,
budgets and per-key spend, each with a freshness/verified flag); `stats` (funnel and weekly series,
each metric marked `collected` or not); `reflection` (statements). A **decision** gains the kinds
the page creates: an option choice with optional free text or question, a reflection position with
optional story, a monthly budget change, a connection fix. Unknown fields are ignored; unknown
statuses render as "Not proven".

### 5. Phase B: `/day` produces the report

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

- **Decisions persist across runs.** The next pass reads `decisions.jsonl` and does not re-ask a
  parked fingerprint (the 2026-10-02 "maybe future day should know about it?" complaint). This is
  why the fault-key fingerprint above is required.
- **Weekly and monthly reviews feed the same report.** The cp monthly review's interactive "apply
  all / some / skip" becomes one issue per proposal, the review is marked done, and Start fixing
  applies what was picked. The pp weekly review runs from `/day` when overdue (today it is only
  listed). Their outputs land per the weekly/monthly map: actions → issues, counts → Stats,
  health checks → Monitoring, pattern interrupts and programme-health verdict → Reflection.
- **Reflection statements are written by an Opus agent** spawned by `/day` for that step.
- **Start fixing opens a terminal tab.** The board server, on the founder's click only, opens a new
  tab in the founder's terminal and starts a Claude session with the assembled prompt. Whether the
  terminal app accepts a scripted new tab is unverified; a new window is the fallback, copy the
  last resort.
- **New data, separate spec:** Codex quota, the outreach funnel (reach-outs → pilot event held)
  and the event-attendance / subscribed-after-event events are not collected by `/day` today. The
  page labels them "not collected yet" until that spec lands.

### 6. Delivery: one spec, three phases, one orchestrator (founder, 2026-10-04)

> "just important that it's given as one to an orchestrator agent ... and it will instrument
> building, reviewing etc of all."

One orchestrator runs the phases in order. Each phase ends with its own tests, a hostile review
and a visual QA (for UI), and its ACs ticked with evidence, before the next phase starts.

- **Phase A: the page.** Report schema v2, the decision model, the Daily report (Status + Issues +
  Start fixing as copy-only), the day switcher, the four tabs with Stats / Monitoring / Reflection
  showing what the report carries and "not collected yet" otherwise. Fed by a hand-made v2 report of
  a real run. Replaces the rejected UI on this branch.
- **Phase B: `/day` writes the report** (§5): per-check status lines, fault-key fingerprints, report
  written at start and end, decisions respected on the next pass, weekly/monthly reviews folded in,
  Opus-written reflection statements.
- **Phase C: the data and the launch:** Stats / Monitoring data /day does not collect yet (Codex
  quota, outreach funnel, event attendance and newsletter events, per-key budgets), and Start
  fixing opening a terminal session under the contract below.

### 7. Rules from the spec reviews (Opus + Codex, 2 of 2 reported, 2026-10-04; verified in code)

1. **"Fixed" lasts until the fault recurs.** A done/dismiss decision resolves a fingerprint only for
   runs up to the one it was made on; if a later run reports the same fingerprint as a problem, it
   is an issue again, marked "came back". (Codex repro: `buildView` resolves on any old `done`.)
2. **A dead or running pass is shown, not skipped.** Schema v2 accepts `state: running`; the latest
   run by `started_at` is shown even if incomplete, with the warning line. An unreadable newest file
   shows as "latest run unreadable", never silently yields to yesterday's.
3. **Tolerant reading.** Unknown check statuses render "Not proven"; unknown fields are ignored; a
   newer schema renders as plain text; malformed rows are dropped with a visible "N rows unreadable"
   note instead of crashing the page.
4. **Decisions carry a run id and a kind.** `kind ∈ option | reflection | budget | connection`,
   with a target id per kind (fingerprint, statement id, budget id, connection id), `run_id`, and
   payload (`option_id`, optional `text`, `is_question`; `position` ±1/±2/0 and optional `story`
   up to 2000 chars; budget `amount` + `scope`; connection `step`). The server accepts a decision
   only for targets in the run named by `run_id`, and only if that run is the latest. Latest line
   per (kind, target) wins; an explicit `remove` undoes.
5. **Paging records nothing.** Next/Previous never write. Decisions are written when the founder
   picks an option, rates, adds a story, sets a budget or presses Fix; preselected recommendations
   are written in one batch only on Start fixing / copy.
6. **"Fix" on a connection** records the fix step for the prompt and may open a documented sign-in
   link; it never marks the check as worked. Only the next run can.
7. **Ordering is one rule:** urgent = a deadline within 72h or a check that did not run / not proven;
   important = set by the check's own severity, not the agent's mood. Sort: urgent+important,
   urgent, important, rest; then deadline, first seen, title.
8. **Two confidences, two names:** `recommendation_confidence` (0–100, shown as the %) and
   `evidence` = verified / unverified (drives the verify-first prompt). Both kept.
9. **Start fixing launch contract (Phase C):** the server builds the prompt from the latest run plus
   the decisions file; the request body carries no prompt text; JSON content type and the board's
   Origin are required; a fixed command runs via execFile with no shell, prompt passed by temp file;
   at most one launch per minute; each launch writes a `sent` line so the same collection is not
   sent twice. Phase A ships copy-only.
10. **Design system reuse** without importing product code: the page reproduces the ClarityPledge
    tokens and the point card's look in the board; the board bundle must not import Supabase or
    product auth code.

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
- Do NOT restyle the board or change other pages (a board-wide move to the ClarityPledge design
  system is a separate task; only the Day page uses it here).
- Do NOT let the board run checks or trigger `/day`. It shows, records decisions, and (on the
  founder's click only) opens one terminal session with the assembled prompt.
- Do NOT change what `/day` checks in this spec. Only how results are recorded, kept and shown.
- Do NOT publish any report to a hosted page.

## Acceptance Criteria

**Phase A: board page (redesigned 2026-10-04; each control's expected effect is listed in the
control list in the private design folder, and tested against it)**
- [x] The personal board's sidebar has a Day entry; the cp board has none (verified by loading it).
      Evidence: e2e `the Day entry is present when the day dir is set` / `…absent when KANBAN_DAY_DIR is unset` (a second, Day-less board on its own ports); pp `scripts/kanban.sh` sets `KANBAN_DAY_DIR`, cp's launcher does not.
- [x] Tabs Daily report · Stats · Monitoring · Reflection share one header with the day switcher
      directly below; no tab repeats its own name as a heading.
      Evidence: e2e `four tabs, one switcher below, no tab repeats its own name`; visual QA rounds 1–3.
- [x] Status lists **every** check of the run with the run's own status word; a fixture check with
      an unknown status renders "Not proven". Connections show one Fix button each; when all are
      fixed the panel collapses to one line and reopens on click.
      Evidence: unit `reads an unknown check status as Not proven`; e2e `lists every check with its status word…`, `Fix records the decision, never shows ✓, and the panel collapses to a line that reopens`.
- [x] Known-bad control: a check with status problem / not-run / unproven and **no finding**
      appears as an issue and is never counted as worked. Breaking the rule turns the test red.
      Evidence: unit `every problem / not-run / unproven check with no issue becomes an issue`, `a not-run check … never counted as worked`; `scripts/day-mutation-controls.sh` Invariant 1 control RED with synthesis disabled.
- [x] Issues show one at a time in the order urgent+important, urgent, important, rest; each card
      shows Point A / Obstacle / Point B, the recommended option preselected with its confidence,
      and "Ask a question…" / "Other…" open a text box.
      Evidence: unit rule-7 tests (comparator + view order), mutation controls `urgent before important`, `urgent within 72h`; e2e `cards follow the view order; the card shows A / Obstacle / B, the preselected recommendation…`.
- [x] Previous / Next (and ← →) move between cards; their position does not change when a card
      expands (measured); the page has no inner scroll areas.
      Evidence: e2e `Previous / Next and ← → move between cards and write nothing`, `the bottom bar does not move when More info or Other expands` (boundingBox, < 1px), `no inner scroll areas`.
- [x] Choosing an option, a reflection position, a story, a budget change or a connection fix
      appends one line to the decisions file; reloading keeps it. Earlier runs are read-only.
      Evidence: e2e `picking an option appends exactly one line, and a reload keeps it`, budget/reflection/connection-fix tests each read `decisions.jsonl`, `an earlier run is read-only…`.
- [x] Start fixing (Phase A: copy) assembles one prompt that opens with the verify-first
      instruction, puts the founder's questions first, and contains every collected decision.
      Evidence: unit `opens with verify-first, puts the founder’s questions first, and contains every collected decision` (+ mutation controls verify-first and questions-first RED); e2e `Start fixing writes the preselected batch and copies a verify-first prompt…`.
- [x] Monitoring: Claude and Codex show remaining quota, projection and reset date; Google Cloud
      shows budget, credits with their caveat, and one bar per key; Systems lists every non-money
      check. "Raise monthly budget" joins Start fixing.
      Evidence: e2e `Monitoring: Systems lists every non-money check; a budget raise joins Start fixing…`; Codex shows "not collected yet"; shots a3b/a5 monitoring-claude, monitoring-gcloud.
- [x] Stats: funnel and weekly lines; metrics not collected say "not collected yet", never 0.
      Evidence: e2e `Stats: readings show; what is not collected says so, never 0`; unit fixture `collected:false` funnel/series.
- [x] Reflection uses the product's point card and position control; a story box opens after a
      position is chosen.
      Evidence: e2e `Reflection: a position opens the story box; keys 1 2 3 rate and cycle; Remove position…`; 7-level product scale −3…+3 (see Phase A build notes).
- [x] A run with a weekly or monthly review shows its badge and its items inside Issues/Reflection.
      Evidence: e2e `a weekly-review run shows its badge…` and `a monthly-review run shows its badge…`.
- [x] A newest run older than 24h, or an incomplete run, shows the warning line.
      Evidence: unit `warns when the newest run is older than 24h, or did not finish`; e2e `stale run warning`, `running and incomplete runs say they are partial`.
- [x] Missing day-data directory → the page says so; empty reports directory → "no runs recorded
      yet"; a report with an unknown schema falls back to plain text.
      Evidence: unit API `missing day dir → absent; empty reports → no runs`, `RULE 3 — a newer schema is served as plain text`; e2e `missing folder and empty folder say so`, `a newer report format shows as plain text`.
- [x] Privacy: API on loopback only (`lsof`); a secret marker in fixtures never reaches logs; no
      report content in browser storage; screenshots use a synthetic run.
      Evidence: `lsof` on the QA board: `node 127.0.0.1:9071` only; unit `privacy: report and decision content never reaches the logs` (+ mutation control RED when a log line carries the file text); `grep localStorage|sessionStorage|indexedDB src/components/day src/lib/day.ts` = comments only; QA board logs grep for the fixture secret = 0; every screenshot uses `day-fixture.ts`.
- [x] A fault marked fixed comes back as an issue ("came back") when a later run reports it again
      (known-bad control: the current behaviour fails this test).
      Evidence: unit `RULE 1 — "fixed" lasts until the fault recurs…` and `RULE 1 — "came back" only when a run in between did not report the fault`; mutation control `v1 behaviour` RED. Sharpened by review: "Came back" only after a gap, else "You answered on <date>… Still reported.".
- [x] The newest run in state running/incomplete is shown as latest with the warning; an
      unreadable newest file says so instead of showing yesterday's.
      Evidence: unit API `RULE 2 — the newest run in state running is the latest…`, `RULE 2 — an unreadable newest file says so…`, `RULE 2 — a newest file that exists but cannot be read (permissions) still sorts first`; e2e `an unreadable newest file says so instead of showing yesterday`.
- [x] A report with an unknown status, an unknown field, a malformed row and a newer schema each
      render (Not proven / ignored / "N rows unreadable" / plain text) without crashing.
      Evidence: unit rule-3 tests (unknown status, unknown fields, malformed rows counted, other schema); e2e `a malformed row is dropped with a visible note`, `a newer report format shows as plain text`.
- [x] A decision for a run that is not the latest, or a target not in that run, is refused (409).
      Evidence: unit API `RULE 4 — … refused (409)`, `a batch is all-or-nothing`; mutation controls rule 4 ×2 RED.
- [x] Paging with Previous/Next writes nothing to the decisions file (file unchanged).
      Evidence: unit API `RULE 5 — reading runs, paging … writes nothing` (day dir listing unchanged); e2e Previous/Next test compares decisions.jsonl byte-for-byte.
- [x] The board bundle imports no Supabase or product auth module.
      Evidence: unit `rule 10 — no file under tools/kanban/src imports Supabase or anything outside tools/kanban`; mutation control plants a Supabase import → RED.
- [x] Screenshots at 1440, 375 and 320 pass the visual QA checklist, reviewed by a separate
      subagent given only screenshots and the checklist.
      Evidence: separate visual-QA agents (screenshots + checklist only), 3 full rounds + 1 focused re-check: final BLOCKs 0 (phones with the board sidebar collapsed, per the risk row). Remaining WARNs are listed in the Phase A build notes.

**Phase B: `/day` writes it**
- [x] Reflection statements in a real run were written by an Opus agent (model shown in the run).
      Evidence: real run 2026-10-04: 5 statements, model recorded from the agent's own answer: claude-opus-5-5 (Reflection tab).
- [x] A real `/day` pass ends with the renderer's card as its final output, and the same run
      appears on the board without hand-editing.
      Evidence: real run 2026-10-04: the pass ended with the card; the branch board read the same run from ~/.claude-day with 0 dropped rows, 28 checks, 19 issues, 4 connections, 3 people, 6 notes.
- [x] An item the founder parked does not reappear as an issue on the next pass, **even when the
      check's title text changed**. It shows under Parked with the reason.
      Evidence: renderer test `e` (two synthetic passes, same check + fault key, different titles, a park line → not on the card, under Parked) + buildView rule-1 tests; fault keys in the runbooks are fixed slugs from source ids. A real repeat pass will confirm it on live data.
- [x] Every check has its own status row in the ledger; a check failing inside a wave is a problem
      on the board.
      Evidence: real ledger 2026-10-04: 27 CHECK rows; wave cp.w3 recorded ok (exit 0) while cp.rls and cp.grants inside it are problem on the board.
- [x] A pass killed mid-run leaves a report marked incomplete, and the board shows it as latest.
      Evidence: the real run wrote its report as `running` at Step 0r and re-rendered after the sub-day registered; renderer test + control: the next pass rewrites an earlier `running` report as incomplete; Phase A e2e: running/incomplete latest shows the warning.
- [x] A standing fault's age is computed from the first run that saw it, and matches the healer's
      own date within a day.
      Evidence: real run: the VM fault's first_seen is 2026-09-14 from the healer's own unhealthy_since (card: 20 days); otherwise the earliest earlier report carrying the fingerprint (renderer test f).

**Phase C: data and launch**
- [x] Codex quota, per-key budgets and the outreach funnel appear with real values from a run;
      until then each says "not collected yet".
      Evidence: real run 2026-10-04: Codex 95% left (from its session log), Claude 40% left; per-key budgets 2 of 7 measured, 5 'not collected yet' (no billing data or disqualified budgets); events per week 6 real points. The OUTREACH FUNNEL has no source — nothing tracks reach-outs, champion talks or pilots ([FOUNDER DECISION] where to record them); it stays 'not collected yet'. Left open. → Closed in Phase D by founder decision 3A: the funnel counts the board's Pipeline columns (day-pipeline.ts, unit tests; e2e `the funnel shows the Pipeline columns with real zeros`); per-key budgets without billing data say why.
- [x] A second Start fixing within a minute, or for an already-sent collection, does not launch.
      Evidence: day-launch tests `within a minute does not launch`, `only what changed goes out` (unchanged → 409 already-sent; a change → follow-up with only the change) + controls.

**Phase D: founder review round (2026-10-06 decisions; tests first, each with a known-bad control)**
- [x] One custom option, "Your answer or question…", replaces Ask a question… and Other…; a reply
      ending in "?" is a question and goes to the questions-first part of the prompt; decision lines
      written by the old Ask/Other still read correctly.
      Evidence: e2e `Phase D: one custom option` (3) + unit OWN/legacy ask-other tests; old sent keys honoured (unit).
- [x] The recommended option shows "Fit N%" (fixes the real cause without breaking something else),
      one "Main risk" line, and a "Cause checked" / "Cause suspected" tag; an issue without a fit says
      "Fit not rated", never a made-up number. `finding --recommend` is refused without `--fit` and
      `--risk`, and every runbook finding that recommends carries both (registry test).
      Evidence: e2e `Phase D: fit, risk and cause`; private day-step.test.sh 121/0 refuses --recommend without --fit/--risk/--evidence; cp registry test 19/0 scans day-cp, weekly, monthly (control: one --risk deleted from a real copy → RED).
- [x] Start fixing sends only answered cards (picked, or accepted with Next) plus cards whose
      recommendation is to give it to the agent; an unopened founder-choice card is not in the prompt
      and is counted on the page as "still yours".
      Evidence: unit 1B tests (old collect as known-bad control → RED); e2e `Next accepts…`, `Accept` on the last card, bar height at 1440/375/320; Next reads "Accept & next" on unanswered founder cards (review: Opus).
- [x] The Help requests and Mentions tiles open the chat-digest note.
      Evidence: e2e `Stats: Help requests and Mentions open their note…`; 9d readings carry note chat-digest (report-sections test).
- [x] Monitoring has no Systems list (every check stays in Status); Monitoring is money and
      subscriptions only.
      Evidence: e2e `Monitoring is money and subscriptions only…`; Status headline now "N checks need attention".
- [x] Claude and Codex share one "Subscriptions" card and chart: % left over the week from this
      week's runs, a dashed projection to each reset, each reset marked and named.
      Evidence: e2e Subscriptions overview/detail/pace/single-reading/merged-reset tests; unit quotaHistory window tests.
- [x] AI keys with no billing data say why ("no billing data: unused, or not in the export"), and an
      inbox item asks an agent to check the export per project.
      Evidence: e2e `keys with no data say why`; inbox item INBOX-P61 annotated with the founder's question.
- [x] The Stats funnel counts the cp board's Pipeline columns (Contacted → In conversation →
      Qualified → Committed → Active) with real numbers, zeros included.
      Evidence: unit day-pipeline tests (dir resolved from the script, not cwd — review fix); e2e `the funnel shows the Pipeline columns with real zeros`.
- [x] Reflection memory: the Opus statement writer receives the last 14 days of statements with the
      founder's positions and stories; a new statement that repeats an answered one is refused and
      the agent is asked again (positions and stories live in the decisions file, read back here).
      Evidence: unit day-reflection-history tests (opposite angle not a repeat; identical refused; threshold control); day.md 9r passes the history inline and pipes through --reject-repeats (report-sections tests).
- [x] Plain-language pass: before the report is written, one agent rewrites each card's title,
      Point A, Obstacle and Point B into what it means for the founder; the original wording moves to
      More info › Technical detail; an overlay for an unknown card is ignored; no overlay = original.
      Evidence: unit applyPlain tests (overlay applied; originals in technical; unknown fp ignored; new number or changed source → original kept); prompt uses original wording, plain title fenced as data (review: Codex/Opus/Gemini); day.md 9p hard step + fence-tolerant validator.
- [x] Cards whose recommendation is agent work are folded into one line ("N things an agent can
      fix") that opens them as the same cards; the pager walks the founder's cards.
      Evidence: e2e `Phase D: agent work folded` (5) + Back to yours in the bar on phones.
- [x] The Goals page and its API are gone from the board (both boards), and the board's other pages
      use the Day page's type, colours, buttons and cards without losing any function (board e2e
      suite unchanged, before/after screenshots reviewed).
      Evidence: board unit + p147 e2e unchanged (4 pass / 2 pre-existing); unit pages.test (goals falls back) + columnColours tests (Blocked red, WIP overflow red, Pipeline/Content neutral); before/after shots reviewed by the Opus reviewer.
- [x] Screenshots at 1440, 375 and 320 pass a separate visual QA; one hostile review by Opus,
      Gemini 3.8 and Codex (technical and UX), claims verified before acting.
      Evidence: visual QA (separate agent, 4 BLOCKs verified → 3 real, fixed) and hostile review Opus + Gemini 3.8 + Codex, 3 of 3 reported; every BLOCK verified in code and fixed (overlay into prompt, pipeline path, fence parse); final: vitest 330/330, day e2e 91/91, all mutation controls fired, tsc 16 = baseline.

## Post-ship live confirmation (tracked in the private task inbox, not gating /ship)

Both are built and tested; only a live run can prove them, and none can happen before shipping
(founder decision 4B: /day switches to the report only after this ships).

- [ ] (live) The cp monthly review run inside `/day` asks nothing mid-run; its proposals appear as issues
      and the review is marked done. The pp weekly runs from `/day` when overdue.
      Evidence: pp weekly ran from the real /day of 2026-10-04 when overdue (marker updated; its drift became 4 findings, review-tagged). cp monthly: wired (monthly SKILL.md records each proposal as a finding with options and writes its marker; e2e `a monthly-review run shows its badge…`) but NOT yet seen in a real run — next due after 2026-10-20. Left open for that run.
- [ ] (live) Start fixing opens a terminal session with the server-built prompt; a cross-origin POST, a
      text/plain POST and a POST carrying prompt text are each refused and spawn nothing (tested).
      Evidence: 17 launch tests + 11 known-bad controls (cross-origin, no Origin, text/plain, extra fields incl. prompt text → refused, nothing spawned); a scripted Ghostty tab proven by a probe (returned 'tab'); the session counts as sent only when the launcher acknowledges Claude started. Claude actually starting in that tab is left for the founder's first click at UAT.

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

## Phase A build (2026-10-04)

**Founder additions during the build (binding):**
- **New people in Status.** "When new people register we want to know who they are and what they
  did." The report carries `people` (name, how they arrived, joined, confirmed or not, what they did,
  where they stopped, returning, LinkedIn, one line of background). The Status panel shows them as a
  fold under Connections ("New people (3) · Person A, … · 1 not confirmed"); `people` absent reads
  "not collected yet", `[]` reads "No new people". Read-only: never in the prompt or the count.
  A history sweep (≈13 sessions, Feb–Sep 2026) found what /day does not collect yet: confirmation
  status, LinkedIn, source (event/letter/invite), and filtering out agent accounts. Phase B owns it.
- **Keyboard on Daily report and Reflection.** The position buttons were far from Next. Keys 1–9
  pick the Nth option; on Reflection 1/2/3 = Disagree/Unsure/Agree, pressing the chosen side again
  cycles its strength. Per-option key chips on desktop; the pager stays in the bottom bar.

**Reconciled where the mockup, the controls list and §7 disagreed (§7 wins):**
- Reflection uses the product's 7-level scale, −3…+3 (strongly disagree … strongly agree), not
  rule 4's ±1/±2/0: the AC requires the product's position control, which has seven levels.
- Rule 1, sharpened by review: an earlier non-park answer never resolves a fault that is reported
  again. "Came back" is shown only when a run in between did not report it; a fault that never left
  says "You answered on <date>: <answer>. Still reported." (Labelling a standing fault "came back"
  every day would put a false claim into a verify-first prompt.)
- A connection Fix never shows ✓ (rule 6): the row reads "Fix in Start fixing" with Undo and
  "Open sign-in again". Start fixing is copy-only in Phase A (its label stays; Phase C launches).
- An empty "Ask a question…"/"Other…" is not an answer: it does not count as resolved, and Start
  fixing refuses until text is written (else the prompt silently carried the recommended option).
- A run with an empty checks list is incomplete and yields an urgent issue; a budget "raise" must
  exceed the current budget; a missing number shows "—", never 0.

**Evidence kept in the repo:** `server/__tests__/day.test.ts` (rules, synthetic fixture),
`scripts/day-mutation-controls.sh` (each rule broken in a throwaway copy must turn its test red),
`e2e-day/day-page.spec.ts` (the page, on a seeded synthetic day dir; `DAY_E2E_PORT_BASE` moves its
ports). Board regression: the P147 board suite, run against this branch and against main's live
board, gives the same result on both (4 pass; the same 2 fail on main too — pre-existing).

**Reviews (2026-10-04):** visual QA ×2 (separate agent, screenshots + checklist only) and one
hostile round by Opus, Gemini 3.8 Flash (screenshots attached, served model verified) and Codex
gpt-6-sol: 4 of 4 reported. Adopted after verification: unreadable newest file sorted by an empty
key on a read error (now stat mtime first); an empty Ask/Other sent the recommended action;
fast run switching could show the wrong run; the page went read-only without explanation when a
newer run landed; story box remounted mid-typing; collapsed Status locked open on phones;
see-through sticky bars; counts and status words differed across tabs; colour used for non-actions;
€0 for unknown spend; "First seen: Today" for unknown ages. Not adopted: auto-collapsing the board
sidebar on phones (a board change, Non-Goal; the spec's risk row accepts phones with the sidebar
collapsed) and renaming Start fixing to "Copy prompt" (Phase C makes it launch).

**Visual QA warnings left open after Phase A (none blocking):** "Start fixing (N)" also counts
reflection ratings and budget changes, so it can read 14 next to "0 of 13 resolved" (by design: the
control list says N is everything collected); the Reflection column is narrower than the other tabs
(the approved mockup's centred point card); position labels are the product's title case
("Somewhat Agree"); at 320px the Google Cloud tile breaks "€70 / €400" across two lines; read-only
options keep their bordered rows (radios hidden, "Not answered on this run" shown).

## Phases B and C build (2026-10-04/05)

**What runs where.** The ledger tooling (`~/.claude/scripts/day-step.sh`: CHECK rows from a step's own
`$DAY_CHECK_FILE`, agent `check`, `data` sections, `finding --fault-key` + issue sidecar) is live on
`~/.claude` main and backward compatible. The dispatcher runbook (`day.md`, `day-steps.tsv`,
`day-checks.tsv`, the findings filer) is on the `p1399-day-report` branch of `~/.claude`: it needs this
branch's cp sub-day and renderer, so **both go live together — merge that branch in the same step as
`/ship p1399`**. Until then the founder's `/day` is unchanged.

**The first real run (2026-10-04, from this worktree, ~/.claude switched to the branch for the run):**
every step recorded, card printed, report on the board unedited. It found what tests could not:
gate 0d must run before 0a (0a was refused against the closed ledger); per-key money findings would
have made ~24 near-identical cards (now one per kind of fault); an issue with its own options lacked
Park (now always offered). Beeper Desktop was closed, so the calendar read NOT VERIFIED and the
finish gate said INCOMPLETE — reported honestly; the card's header still read "complete" (every step
recorded), a known wording gap. The video-summary heal was run read-only because the acceptance brief
forbade database writes.

**Reviews:** Phase B — Opus, Gemini 3.8, Codex (3 of 3); Phase C + B fixes — Opus, Gemini 3.8, Codex
(3 of 3) and three visual-QA passes. Adopted after verification: checks reported only through the
step's file (stdout could forge them); a check accepted only from its registered step; an exit code
never overruled by an agent; no phantom "Worked" rows; a ledger-injection hole in `finding --check`
(closed, live); owner-only ledger files; earliest first-seen; Codex quota read only from codex lines
(it vanished exactly when used up); a send counts only when Claude acknowledged starting, is reserved
before spawning, and later sends carry only changes; the prompt never sits in argv; irreversible
actions need an explicit yes in the session. Not adopted, with reason: Gemini's DNS-rebinding,
shell-injection and path-traversal claims (each refuted in code); "Next marks resolved" (the founder's
approved design).

**Still open after these phases:** the outreach funnel's source (closed in Phase D: decision 3A); the first
real Start-fixing click; the cp monthly inside a real run; where a launched session should start
(cp repo today; most fixes are code there).

## Founder review of the built page (2026-10-05) — built in Phase D

Founder, verbatim excerpts: "other and ask a question is same .. its just custom answer" · "it doesnt
show confidence scoring - how confident in the solution option recommended and in issue root cause ..
if it breaks more shit than it helps thats bad problem solution fit" · "start fixing (19) - do you
think" · "what is help requests? who asked for help?" · "whats the diff between systems in monitoring
and status in daily report ... are there redundancies" · "how come we dont have data from monitoring
our ai prepaid cards" · "claude and codex ... unite under subscriptions and put into same graph ...
weekly projections and show reset days for both" · "what we do with reflection statements that were
processed - do they influence generation of new statements? (dont want to answer same thing again)" ·
"what happens with my stories and positions".

Recommendations to confirm (orchestrator, 2026-10-05):
1. One custom option, "Your answer or question…", replaces Ask a question… and Other…; a reply ending
   in "?" goes to the questions-first part of the prompt.
2. Confidence = problem-solution fit, required on every finding: "Fit N%" on the recommended option =
   how likely it fixes the root cause without breaking anything else, with one line on the main risk;
   plus "Cause: verified / not verified" for the diagnosis. The real run showed most findings carry no
   number — the runbooks must require it.
3. Start fixing sends only what the founder opened and answered, plus items whose recommendation is
   "Give to the agent"; unopened founder-choice items (revoke a key, ship, read a console) stay out
   and are listed as "not sent: still yours". 19 in one session is too many.
4. Help requests and Mentions tiles open the Chat digest note (who asked, in which chat, the
   suggested reply).
5. Drop the Systems list from Monitoring: Status already lists every check (problems first, worked
   folded). Monitoring keeps money and subscriptions only.
6. AI keys with no data: 5 of 7 have no billing rows — unused or not recorded by the export. Filed as
   an inbox finding; an agent checks the export per project.
7. Claude + Codex under one "Subscriptions" card: one chart, both weekly quotas with projections to
   each reset day, resets marked.
8. Reflection memory: the reflection agent gets the last 14 days of statements with the founder's
   positions and stories, is told not to repeat answered ones and to push on disagreements; positions
   and stories are recorded by /day into a reflection log (not only into the Start-fixing prompt).
9. Readiness: /day goes live only when this branch ships together with the ~/.claude
   `p1399-day-report` branch; tomorrow's /day after that is the next real test.

**Founder decisions on the review (2026-10-06), binding for the next round:** all nine above approved, plus
(10) a plain-language pass in /day rewrites every card into what it means for the founder (money,
users, event, time), keeps the facts, moves mechanism into More info, and folds pure agent work into
one line ("N things an agent can fix"). Choices: **1B** Start fixing sends only answered cards plus
clear agent work; unopened founder choices stay out, listed "still yours". **2A** one "Fit N%" number
(fixes the real cause without breaking something else) + one main-risk line + a "cause checked /
suspected" tag. **3A** the outreach funnel counts the cp board's existing Pipeline columns
(Contacted → In conversation → Qualified → Committed → Active); no new logging — real zeros until
outreach starts. **4B** /day switches to the report only after this round ships.

## Open Questions

1. ~~Terminal `/day park <n>` commands~~ — not built; the board is the one place decisions are made. Revisit only if the founder asks.

## Related

- P1324 (step ledger, findings filed to inbox) · P1328 (sub-day in a subagent) · P1317 (inbox on
  the board, privacy precedent) · P1155 (escalate on age, not occurrence) · P1205 (completion
  graded on a third-party artifact)
