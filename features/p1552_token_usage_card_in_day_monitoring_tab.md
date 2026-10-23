---
status: week
type: story
rank: 64
created_date: '2026-10-23'
tags: [day, kanban, monitoring, tokens]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: sonnet
exec_model: opus
exec_effort: high
---

# P1552: Token usage in the Day page Monitoring tab

## Problem

**Situation:** The Kanban Day page (the pp Kanban; it only turns on where the launcher sets `KANBAN_DAY_DIR`, and the pp launcher points it at a private folder in the home directory) has a Monitoring tab with two sources, Google Cloud and Subscriptions. Claude Code and Codex token usage is monitoring information of the same kind, but today it lives on a separate private claude.ai page that a weekly `/weekly` step refreshes by uploading files. That page is a second place to look and cannot be embedded in the Kanban (not tested; expected to fail because the page needs a claude.ai login).

**Complication:** The founder wants the numbers where the rest of monitoring already is, updated by `/day` without spending model tokens. P1399 recorded a founder ruling that Monitoring is "money and subscriptions only"; this request widens it, and a test is named after that ruling. The Subscriptions chart already holds the quota history the claude.ai page lacks.

**Question:** What shape does the token data take inside the day report, who writes it without disturbing the other monitoring data, and what does the new pane show?

> Founder, verbatim: "I mean, we have in monitoring section in PP Kanban the Google Cloud, the subscriptions, and these are token usage. Shouldn't it live there?"
>
> Founder, verbatim: "I don't want to spend a lot of tokens on this."

The readings were decided on 2026-10-23 (private log, see Related): output as activity, never productivity; context per reply instead of total tokens.

## Appetite

Blast radius: the Monitoring tab, the report parser, and the personal `/day` report writer that every day run uses. A bad change there could cost the quota and cloud data, so the writer part is the sensitive one. Reversibility: high (old reports never had the new field; revert the pane, the parser field and the writer lines). Decision density: five founder calls, marked below.

## Invariants

- **Old and unknown reports still open.** A report without the token block renders the pane as "not collected yet" and every other pane is unchanged. A value not collected renders "not collected yet", never 0. An unknown top-level schema still falls back to plain text. (Code: `readMonitoring` in `tools/kanban/src/lib/day.ts`; the schema check looks only at the top-level `schema`.)
- **One writer per report section.** The `monitoring` section is written once, by the single report-building step in `/day`, as one object. The token data is added into that object. It is never written by a second call that records the section on its own, because recording a section replaces the whole section file and would erase quotas and cloud (verified: `day-step.sh` `cmd_data` replaces the file).
- **Collection never blocks `/day` and never costs the other data.** A collector failure, timeout or missing log folder marks the token block `collected: false`; quotas and cloud are still written and the run finishes.
- **A step registered in the day step registry is protected from silent deletion.** Ruling 2026-09-16 [process] (P1324): a consistency check passed while a required step had been deleted, because the file's own teaching example used a real step id. A new step is its own registry row, and examples in docs use a placeholder id.
- **Nothing derived from a report is logged or persisted in browser storage** (P1399 invariant). The week/month choice lives in component state only.
- **No private project name or account usage figure in any tracked file, test fixture or screenshot.** Real per-project output exists only in the local reports folder (home directory, outside every repo). Fixtures, tests and visual-QA screenshots use an invented day folder with invented project names.
- **Counts are labelled as activity.** No dollar cost (prices are not in the logs), no productivity score, no comparison with other people.

## Solution

Build order matters because one contract joins three parts. `/dev` may split B into its own spec if it judges the personal-file change needs a separate review.

**A. Data contract, collector reduction, parser.**
1. A token block inside `monitoring`. Sketch (names may change, but the writer, parser, pane and tests must share one definition):
   ```
   tokens: { collected, as_of,                       // latest log day included
     weeks:  [{ p, output:{Opus,Sonnet,Haiku,Fable,Codex}, median4?, days:{claude,codex}, ctx_per_reply? }],   // last ~13 completed weeks
     months: [ same shape ],                         // last ~10 completed months
     projects_28d: [{ project, output, share }] }    // top 8 plus "all others"
   ```
   Model share is computed by the pane from the per-family outputs, not stored. Context per reply is Claude only.
2. The reduction from the collector's rows to this block lives in the collector (`scripts/token-usage-refresh.py`), tested with synthetic logs, so the personal writer only reads a file.
3. The parser gains an optional `tokens` type and a validator. No schema bump. Malformed periods or projects are removed and the rest renders. (Unlike the top-level lists, `readMonitoring` has no drop counter today; adding one is out of scope.)

**B. The writer, in the personal `/day`.**
4. The collector runs as its own registered step before the report-building step, wrapped so a crash or timeout writes `{collected:false}` and exits 0 (a registered command step records its exit code, and a non-zero one shows on the board as a failed step).
5. The existing report-building step reads that step's output and adds `tokens` to the single `monitoring` object it already writes.

**C. The pane.**
6. A third source button, Token usage, beside Google Cloud and Subscriptions, with a detail pane. Reuse the existing week/month switch, `LineChart` and `Legend`. The pane is deliberately compact: ONE chart (output per period by model, with the median line), a row of four readings (days in use per tool, Opus share of Claude output, average context per reply, last full period vs the median), and a list of the 28-day project output with bars (new small markup; no chart type exists for it today).
7. The Monitoring ruling is widened on purpose: the comment at the top of the tab and the end-to-end test named for it are updated to say Monitoring is money, subscriptions and token usage. [FOUNDER DECISION: confirm the widening.]

[FOUNDER DECISION: title and wording of each reading, including how "output" is described so it reads as activity.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A second writer erases quotas and cloud | MITIGATE | One writer (Invariants). Test: collector killed, report still holds quotas and cloud |
| Step failure semantics: a failing registered step shows as failed, a hard step cannot be skipped | MITIGATE | Wrapper with try/except and timeout that exits 0 |
| Widening a recorded founder ruling by accident | MITIGATE | Founder decision above; header comment and the named e2e test changed deliberately |
| Parser silently drops an unknown field | MITIGATE | The parser change is part of the work, with tests for old report, malformed block, unknown schema |
| Monitoring parser counts no dropped rows | ACCEPT | Malformed token rows are removed and the rest renders |
| `/day` slows on a cold collector run (a full re-read takes minutes; warm runs take seconds to about ten) | MITIGATE | Timeout and `collected: false` |
| The personal `/day` file is outside this repo, so cp review and ship do not see it | ACCEPT | The spec names the exact change; the in-repo half goes through `/finish`; the step registry check covers deletion |
| The collector also writes a quota file that duplicates the Subscriptions owner | ACCEPT | `/day` ignores it; the Subscriptions pane keeps owning quota |
| Day buckets are UTC, not local time | ACCEPT | Documented in the collector |
| Codex logs under `archived_sessions` are not read | ACCEPT | The folder does not exist on this machine |
| Reporting rule "monitoring is a scheduled workflow" (2026-08-09 [process], P1031) | ACCEPT | This reports a signal and detects nothing |

**Non-Goals**
- Do NOT change the Subscriptions pane or how quotas are collected.
- Do NOT add dollar cost, a productivity score, or outside comparison.
- Do NOT count Claude.ai chats or API keys used by projects (not in local logs).
- Do NOT bump the report schema.
- Do NOT touch other tabs, the Status headline, or the Day page layout.
- Do NOT retire the claude.ai page or the weekly step in this build (follow-up, below).

## Done-When

- [ ] After a `/day` run, the Monitoring tab has a Token usage source whose pane shows the output chart, the four readings and the 28-day project list, Claude and Codex as separate series.
- [ ] A run recorded before this change opens; the pane reads "not collected yet" and every other pane is unchanged.
- [ ] With the collector forced to fail or time out, `/day` finishes, the report still holds quotas and cloud, and the pane reads "not collected yet", never 0 (test output pasted).
- [ ] The collector is its own row in the step registry; deleting it from `/day` makes the consistency check exit non-zero (mutation run, exit code pasted).
- [ ] Parser tests cover: a valid block, malformed periods removed with the rest rendered, an old report, an unknown schema. A render test covers the pane in collected and not-collected states.
- [ ] The widened ruling is reflected in the tab's header comment and the end-to-end test name, changed on purpose.
- [ ] Test fixtures and screenshots use invented project names only, and the reports folder is shown to be outside every repo (path cited).
- [ ] Visual QA per `.claude/rules/visual-qa.md` at 375px, 320px and desktop, by a separate reviewer, using an invented day folder.

## Acceptance Criteria

- [ ] On the Kanban Day page, after `/day`, the Monitoring tab offers Token usage beside Google Cloud and Subscriptions.
- [ ] From that pane alone I can answer: how much did the models write last period compared with my usual; which models did the work; on how many days did I use each tool; where did the output go in the last 28 days; and how big is my average reply context (bigger means longer sessions).
- [ ] The week/month switch changes the period for the time-based readings.
- [ ] When usage was not collected, the pane says so in words and the rest of the tab looks as before.

## UX Notes

States:
- collected (all readings);
- not collected (one muted line, the pane keeps its height);
- fewer than two earlier periods (the median line is hidden, the reading says "no baseline yet");
- Claude missing but Codex present, and the reverse (only the series that exist are drawn and listed);
- a period with no usage (a zero, not a gap);
- many projects (top 8 plus "all others"; long names truncate, full name on hover);
- 375px width (readings stack, nothing clipped).

Siblings to compare against: the Subscriptions and Google Cloud panes.

## Alternatives Considered

- **Keep the claude.ai page only.** Works today, but is a separate place to look and costs a weekly upload. Kept as a stopgap, not the end state.
- **Put it in the pp weekly.** The pp weekly has its own schedule and no monitoring surface.
- **A new Kanban page.** More navigation for one set of readings; the Monitoring tab already exists.
- **Embed the claude.ai page.** UNVERIFIED: expected to fail on the required claude.ai login.
- **A separate step recording the section itself.** Rejected: it would replace the whole `monitoring` section (Invariants).

## Open Questions

Answer before `/dev` starts:
1. **Widen the P1399 ruling "Monitoring is money and subscriptions only" to include token usage?** The founder asked for it in this conversation; confirm. [FOUNDER DECISION]
2. **Where does the collector live?** Today it is in this public repo with its tests. Keeping it here keeps it reviewed and tested; moving it to the personal half of `/day` (as the cloud-credit check was, 2026-08-27 [process], pp p48) keeps real figures out of any repo by construction. The collector holds no private data itself; real names and figures exist only in the local reports folder. [FOUNDER DECISION]
3. **How often?** Every `/day` (the collector is incremental, so it is cheap) or weekly. [FOUNDER DECISION]
4. **Default period for the pane: week or month?** [FOUNDER DECISION]
5. **Wording of the pane and its readings.** [FOUNDER DECISION]

Closed: where the Day page reads reports from. The pp launcher sets `KANBAN_DAY_DIR` to a folder in the home directory (`.claude-day`), the page reads `reports/<run>.json` from it, and that folder is not a git repository.

Follow-up, after the pane is confirmed: retire the claude.ai page and the weekly refresh step (`/weekly` step 2.12.1). [FOUNDER DECISION at that time]

## Related

- Private decision log, 2026-10-23: the weekly token script, and which metrics to trust (output and context per reply, not total tokens).
- P1399 (Day report and Day page): the report schema, the parse rules and the "money and subscriptions only" ruling.
- `scripts/token-usage-refresh.py`, `scripts/test-token-usage-refresh.py`, `/weekly` step 2.12.1: the current collector and its stopgap refresh.
- Rulings: 2026-09-16 [process] (P1324), 2026-08-27 [process] (pp p48), 2026-08-09 [process] (P1031).
