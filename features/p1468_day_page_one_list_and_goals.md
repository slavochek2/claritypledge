---
status: week
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: high
rank: 1000106
changes: p1463
disclosure: public
workstream: infrastructure
tags:
  - redesign
  - p1463
  - day-page
  - kanban
created_date: 2026-10-13
delivery_stage: change-request
pipeline_ran: [change-request]
---

# P1468: Day page: one list for cards and stories, the agent's work said once, goals instead of "From this run"

> **Redesign of:** [P1463: Day page attention pass](done/2026-06-10/p1463_day_page_attention_pass.md)
> **What was wrong:** P1463 joined cards and reflection statements into one pager, but they still
> render as two layouts: the cards view has the status line on top and a card list on the left;
> the statements view (`tab === 'reflection'`) drops the status line and draws a second list. The
> agent's work is named twice (`Agent: 7 tasks` panel and footer link) and the name says nothing
> about why it is there. The Stats tab's "From this run" holds notes the founder does not use, one
> of them a duplicate of Monitoring.

## Operating Mode

> This spec is an **incremental correction** to P1463, not a greenfield design.
> The predecessor spec is **read-only shipped history**. Do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1463 are not up for re-examination.

## Problem Statement

The founder reviewed the Day page on 2026-10-13 and annotated two screenshots (task inbox INBOX-165). Verbatim:

> "keep the left side and be integrated" (switching between issue cards and stories changes the left side and the top)

> "should be here!?" (an arrow from the `AGENT on Slava · Agrees` header down into the "Their story" block)

> "Add your story" should be a button that expands; "no custom things … follow components as we have, like points, cards"

> "Cloud spend estimate in stats? Isn't it redundant to monitoring?"; "what's next" is "too cryptic"; "Ship since last run, we can delete"; the chat digest should become issues to act on; "From this run section in stats … not sure we need any of that … instead it could be like goals, what goal and what's next"

> "Agent: 7 tasks. What's that?" … "these two redundant?" … "what is this? why i need it?"

The cost is attention. The page moves under the founder when they go from a card to a statement. It names one thing twice without saying what it is. And the Stats tab gives a section to text they don't read.

## Jobs To Be Done

- **Preserved from P1463:** see each problem once; every number on screen backed by something visible; go through cards and then statements in one pager; reach any problem in ≤1 click.
- **Corrected:** move from cards into statements without the layout changing (P1463 made it one *queue* but kept two *layouts*). Know what the agent's work list is for (P1463 made it visible but named it `Agent: N tasks` in two places).
- **New:** see the current goals (the open next steps from goals.md), in plain words, where "From this run" was. Act on a chat message addressed to the founder as a card instead of reading about it in a note.

## Current State

What ships today (verified in code, 2026-10-13):

- **Two layouts.** `DayPage.tsx:858-880` renders `<DailyReport>` when `tab === 'report'`, and `DayPage.tsx:885-920` renders `<ReflectionTab>` when `tab === 'reflection'`. `DailyReport` draws the `StatusLine` (`DailyReport.tsx:178-182`, component at `:228`) and its own `ListPane` labelled "Cards" (`CardList`, `DailyReport.tsx:105`). `ReflectionTab` draws no status line and a second `ListPane` labelled "Statements" with a summary head ("All 2 rated") and a "12 cards" row back (`ReflectionTab.tsx:127-149`). With one statement it shows no list at all (`ReflectionTab.tsx:125`, P1449).
- **Agent stance above the point.** `AgentOwnerRow` (`ReflectionTab.tsx:154`, `:213-219`) renders CP's `PointOwnerRow` (avatar, AGENT byline, `PositionBadge`) above the quoted point. The story header under `Their story` shows only avatar and byline (`ReflectionTab.tsx:244-249`).
- **Story box always open.** `Story` (`ReflectionTab.tsx:369-408`) always renders a `<label>Add your story (optional)</label>` and a textarea (when not read-only).
- **Agent work named twice.** `agentWord(n)` = `` `Agent: ${n} task(s)` `` (`statusWords.ts:29`) is the `AgentList` fold header (`DailyReport.tsx:656`, `AgentList`) and the footer link `data-agent-link` (`DayPage.tsx:988-991`, handler `openAgentList` `:753-757`). The count is `agentCards = everyIssue.filter(agentOnly)` (`DayPage.tsx:249`): cards whose recommended option is agent work (`isAgentWork`, `lib/day.ts:1365-1367`) and that the founder hasn't answered with a non-agent option (`DayPage.tsx:247`). These are the items Start fixing sends to the fixing agent without asking the founder. Before the first send the button reads `Start fixing` with no number; the count only sits in its `title` and `data-send-count` (`DayPage.tsx:1042-1046`). After a send it can read `Send {N} changes`, where N = `collectedCount` + locally queued answers (`DayPage.tsx:478`).
- **Stats "From this run".** `StatsTab.tsx:27-50` renders every `report.notes` entry as a fold under the heading "From this run". The 2026-10-13 run carries five notes: `shipped`, `whats-next`, `branches`, `cloud-spend`, `chat-digest`. It also carries two reading tiles, `mentions` and `help_requests`, both with `note: chat-digest`, that open that note (`StatsTab.tsx:95-118`).

**Before (current):**
```
On a card                                         On a statement
▶ ✓ 31 worked  ✕ 1 didn't work  2 new people      (no status line)
┌ Cards ─────────────┐ ┌ card ─────────────┐      ┌ ✓ All 2 rated ──────┐ ┌ statement ─────────────────┐
│ ✓ card …           │ │ …                 │      │ ✓ Settle whether …  │ │ (S) AGENT on Slava Agrees– │
│ ✓ card …           │ └───────────────────┘      │ ✓ Run the online …  │ │ (pin) Settle whether …     │
│ ○ 1 parked         │ ┌ ▼ Agent: 7 tasks ─┐      │ ○ 12 cards answered │ │ [Disagree|Unsure|Agree+]   │
│ ✓ Reflection rated │ │ row            ✓  │      └─────────────────────┘ │ Add your story (optional)  │
└────────────────────┘ └───────────────────┘                              │ [textarea, always open]    │
                                                                         │ Done · answered            │
                                                                         │ [▾ Their story]            │
                                                                         │   (S) AGENT on Slava       │
                                                                         │   story text …             │
                                                                         └────────────────────────────┘
footer: ‹ 1 of 14 ›  Agent: 7 tasks ▸  ← → move            footer: ‹ 13 of 14 ›  2 of 2 rated ▬▬

Stats: … reading tiles (Mentions ›, Help requests ›) … ## From this run
       ▶ Shipped since the last run ▶ What's next ▶ Branches and specs ▶ Cloud spend estimate ▶ Chat digest
```

## Root Cause

1. **The layout lives inside each view, not around them.** P1463 Round 3 (point 12) made the statements follow the cards *in the pager* (`DayPage.tsx:583`, `queue`). But the status line and the list stayed inside the two view components, so switching `tab` swaps the whole layout. `aria-selected` already treats `reflection` as `report` (`DayPage.tsx:771`). The page claims to be one view and draws two.
2. **The footer link's reason is gone.** P1463 point 4 put `Agent: {k} tasks ▸` beside the button "so its number is never unexplained". Before the first send the button shows no number (`Start fixing`, count only in `title`). When it does show one (`Send {N} changes`), the panel under the card already shows the agent's part. So the link explains nothing the panel doesn't, and it repeats the panel header word for word (P1463 point 10: "One wording for the agent's work").
3. **Notes were a dump of what the terminal used to print.** `day-cp.md` Step 6 ("what used to be printed, kept for the board", `.claude/commands/slava/maintain/day-cp.md:1531-1545`) and the dispatcher's Step 9d (`~/.claude/commands/day.md:1384`, `:1414`) move old terminal blocks onto the board unchanged. `cloud-spend` repeats Monitoring's Google Cloud spend (`MonitoringTab.tsx:146`). The `whats-next` note's first line (`PIPELINE 2 conversations … target …`) repeats the Stats funnel (`report.stats.funnel` steps Contacted → Active). Its `Next: 3a …; 3b …` lines use goals.md step numbers. The same line is the only place two signals reach the board: `overdue next_date: K` and `target: unparseable` (`tools/kanban/scripts/day-pipeline.ts:149`, `:167`), so dropping the note must turn those two into findings. Help requests stay text: only a 🔔 hit or a 💬 item addressed to the founder becomes a reply card (`~/.claude/commands/day.md:1248`). 🤝 help requests go only to the note and the `help_requests` tile (`day.md:1252`, `:1373`).
4. **The agent's stance went where CP shows a point's owner.** P1449 copied CP's profile point card, where the owner row sits above the point. On the Day page the point belongs to the founder, and the agent's stance is part of its story. So the row above the point reads as if the agent owns the statement.

## Redesign

### 1. One list, one top, for cards and statements

The status line (and the people box it opens), one `ListPane`, and the agent panel render **around** whichever item is open, card or statement. The list holds the cards, then the parked row, then a **non-interactive divider label reading `Stories`** (the existing `d-clsec` section style, `ListPane.tsx:81`, rendered as a label, not a button), then one row per statement. A statement row shows its text and its word (Not rated / Somewhat Agree / …), as the Statements list does today. Clicking a card or statement row opens it in the same right pane. Clicking the parked row while a statement is open switches to the card view, expands Parked and scrolls it into view: one click. Today's handler only works from a card, because it sets `DailyReport`-local state and scrolls to a panel that is mounted only under the card (`DailyReport.tsx:198-201`, `:207`). The "N cards ✓ answered" back-row and the "All N rated" head go away; the rows' ✓ already say it (P1463 point 9). The rule for whether the list shows is the same for every item: shown when the queue holds ≥ 2 rows (cards + parked + statements); otherwise the one item is centred (`d-single`, as today). On a narrow screen the folded list shows only its summary (`ListPane.tsx:47-50`). Today that summary differs between the halves: `N still need you · 16 cards` (`DailyReport.tsx:122`) against `1 not rated · 2 statements` (`ReflectionTab.tsx:116-121`). It becomes one string for both, defined in the UI Contract.

```
Same on a card and on a statement
▶ ✓ 31 worked  ✕ 1 didn't work  2 new people
┌ list ──────────────────┐ ┌ open item (card or statement) ──────┐
│ ✓ card …               │ │                                     │
│ ✓ card …               │ │                                     │
│ ○ 1 parked     Parked  │ └─────────────────────────────────────┘
│ ── Stories ─────────── │
│ ✓ Settle whether …     │  ← current row highlighted, whichever half it is in
│ ○ Run the online …     │
└────────────────────────┘
```

### 2. The agent's stance moves into "Their story"

The row above the point goes. The story under `Their story` shows avatar and AGENT byline in its `header` (as today), and the agent's stance through `QuotedStoryShell`'s own `authorPosition` prop, which already renders the `PositionBadge` as `data-testid="story-author-stance"` (`src/app/components/shared/presentational/quoted-story-shell.tsx:23`, `:72-76`). No new import: `ReflectionTab.tsx` does not import `PositionBadge` itself, and `boundary.ts` `APPROVED` is unchanged.

### 3. "Add your story" is CP's `+ Add a story` button

```
Statement, empty story                          Statement, story has text (saved, sent)
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ (pin) Settle whether …               │        │ (pin) Settle whether …               │
│ [Disagree | Unsure | ✓ Agree+]       │        │ [Disagree | Unsure | ✓ Agree+]       │
│ ──────────────────────────────────── │        │ ──────────────────────────────────── │
│ [▾ Their story]  [+ Add a story]     │        │ [▾ Their story]                      │
│  │ (S) AGENT on Slava  Agrees–       │        │ [textarea: can you help me decide…]  │
│  │ The outreach plan …               │        │ Done · answered                      │
│                                      │        │  │ (S) AGENT on Slava  Agrees–       │
│                                      │        │  │ The outreach plan …               │
└──────────────────────────────────────┘        └──────────────────────────────────────┘
No agent on the statement: the footer row still renders, with only [+ Add a story].
```

The bottom row is CP's point-card footer (P1366 layout: `CardExpander` then the viewer's one `CardSlotLink`). With no saved story and no draft, it carries `+ Add a story` (CP's copy, decided). `CardSlotLink` moves unchanged into `presentational/card-footer.tsx` (already in `boundary.ts` `APPROVED`, so `APPROVED` does not change), and the add-story copy (`+ Add a story`, aria-label `Add a story for this point`) is defined there as one exported constant; `getPositionCTACopy` (`src/app/utils/position-helpers.ts:35-47`) reads it from there, so the copy has one home and the board never imports `position-helpers.ts`. A click replaces the button with the story box, focused.

**Order inside the card, top to bottom:** point → position control → footer row (`Their story` expander only when the statement has an agent, then `+ Add a story`) → story box → "Not saved" → story-state chip (Done · Resend) → the agent's story when expanded. The footer row renders on every statement. Today it exists only when `s.agent` is set (`ReflectionTab.tsx:193`), and `agent` is optional (`lib/day.ts:151`). So a statement without an agent still gets the row, with only the slot button. "Not saved" and the chip move below the box, so the story and its state stay together (today they sit above where the box will open, `ReflectionTab.tsx:173-191`). The chip renders only when a ledger entry exists (`ReflectionTab.tsx:104`, `:181`), so an empty story never shows one.

**When the box is open.** It is open on arrival when the statement has a saved story or a draft, where "draft" means `draftOf(id) !== undefined`. A draft emptied over a saved story counts as a draft: it is unsaved (`DayPage.tsx:426`), and the box stays open so the founder sees what Accept would do. Otherwise the button shows. Read-only runs: no button; a saved story shows as text, as today.

### 4. The agent's work: said once, in plain words

The footer link goes. The panel stays and renders under the open item **in both halves**, card and statement, so it is always on the page (today it renders only under `IssueCard`, `DailyReport.tsx:205`). Rows keep ✓ / `Not sent`. Its header counts **not-sent rows**, because that is the part of `Send {N} changes` the agent rows contribute: `collect()` drops items already sent (`lib/day.ts:1408-1411`) while `agentCards` keeps them (`DayPage.tsx:249`).

Header copy (decided; the founder can veto at UAT):
- while any row is not sent: `Start fixing also sends these · {n} not sent`
- once every row is sent: `Sent to the fixing agent · {k}`

Status rows that point into it ("Open card ›" on an agent card, `DayPage.tsx:461`) keep opening and focusing it.

### 5. Stats: Goals instead of "From this run"

```
Stats
  [funnel] [weekly lines] [reading tiles: Unconfirmed sign-ups, Sign-ups, Story authors, …]
  Goals
  ┌──────────────────────────────────────────────────────────┐
  │ <open Next Step 1: its bold title, or its first sentence>│
  │ <open Next Step 2>                                       │
  │ <open Next Step 3>                                       │
  └──────────────────────────────────────────────────────────┘
  Review notes   (weekly / monthly, folded, only on a review day)
```

- **Goals** (decided) come from `docs/goals.md` `## Next Steps`, parsed **at render time by `day-render.ts`** and snapshotted into the report as `goals`. No new `/day` data section and no `DATA_SECTIONS` edit. The parser is one exported function: take the open `[ ]` items in file order, cap at 3, and for each use its bold title (`**…**`) or, without one, its first sentence, with markdown links and code marks stripped. The step label (`3a`) is the row's id and is never shown. No `PIPELINE` line (the funnel shows it), no DO/DON'T; they stay in goals.md. Rendered in the existing `d-card` with `d-row` rows (the shape `AgentList`/`Parked` rows use).
- **Goals states.** `goals` absent (runs before this change) → `Goals` + "not collected yet" (`NotCollected`, `StatsTab.tsx:8`). The parse failed, or zero open items → `Goals` + "No open goals found in docs/goals.md", and day-cp Step 3 (`cp.goals`, still `attest` in `scripts/day-cp-steps.tsv:38`) runs the same parser and files `--check cp.goals --fault-key goals:unparseable` (the existing pattern, `day-cp.md:1413`). Never an empty box.
- **Dropped from the board:** the `shipped`, `cloud-spend`, `whats-next`, `branches` and `chat-digest` notes, and the `mentions` and `help_requests` tiles. The board hides them on its own: it renders only notes that carry a `review` (weekly / monthly), under the heading `Review notes`, and skips the `mentions` and `help_requests` reading ids. Dropping `mentions` goes beyond the founder's words (INBOX-165 names help requests), but nothing is lost: 🔔 hits are already reply cards (`day.md:1248`). So older runs, and runs written before the producers change, look the same as new ones. Producers stop writing them as a separate step that does not block UAT (Surfaces). day-cp's `cp.notes` is a hard `cmd` step (`scripts/day-cp-steps.tsv:41`), so it keeps running and records `[]` on a day with no review, or the run reads incomplete. Where each dropped thing still lives: cloud spend → Monitoring; pipeline → the Stats funnel; branches → the Board, and stranded specs are already findings (`day-cp.md:104-105`); unpushed commits → the status line chip; shipped → git log; the digest → its file and the cards below.
- **Chat digest → reply cards** (decided). Only items addressed to the founder become cards: every 🔔 hit, plus 🤝 and 💬 items addressed to him or naming him. Group asks not addressed to him stay in the digest file. Each becomes the existing **reply finding** (`~/.claude/commands/day.md:1248`): `--check disp.replies`, options `reply` / `none`, its own Fit and evidence.
- **Keyed per message.** Today the key is `reply:<chat key>` and "the later recording wins" (`day.md:1291-1294`), so two items in one chat overwrite each other. The key becomes `reply:<chat key>:<message key>` when the item has a message id, where `<message key>` is a short lowercase hash of the id: fault keys must match `^[a-z0-9][a-z0-9._:-]{0,59}$` (`tools/kanban/scripts/day-render.ts:61`) and raw message ids do not. Without a message id the key stays `reply:<chat key>`. The digest and the replies check use the same message key, so one message found by both is still one card.
- **What the dropped `whats-next` note carried** becomes findings, counts only, no names: `overdue next_date` > 0 → `--check cp.health --fault-key pipeline:overdue`; `target: unparseable` → `--check cp.health --fault-key pipeline:target-unparseable`.
- The `disp.triage` freshness check and its stale-digest finding are unchanged.

### Decided (orchestrator, 2026-10-13; the founder can veto at UAT)

1. Agent panel header: `Start fixing also sends these · {n} not sent` / `Sent to the fixing agent · {k}`; shown in both halves.
2. Goals: the first 3 open items of `docs/goals.md` `## Next Steps`, parsed at render time; no new goals.md section (related: P1008).
3. Chat cards: only items addressed to the founder; keyed per message.
4. Button copy: CP's `+ Add a story`.
5. Weekly / monthly review notes stay on Stats under `Review notes`.

## Predecessor Sections Superseded

| Section | P1463 said | Status | Replaced by |
|---|---|---|---|
| Solution 4 | "the bottom bar shows `Agent will also do {k} tasks ▸`, opening the With-the-agent list" | Superseded | Redesign §4, AC 7-8 |
| Round 2, point 10 | "bottom link and list header both read `Agent: {k} tasks`" | Superseded | One place, new copy (Redesign §4) |
| Round 3, point 12 | "the card list's `Reflection` row is the divider and the jump" | Superseded | A non-interactive `Stories` divider; the statements are rows of the same list under it (Redesign §1) |
| AC 5 | "The bottom bar shows `Agent: {k} tasks ▸`, where k equals the With-the-agent list length; clicking it shows the list." | Superseded | AC 7-8 |
| AC 6 | "The button's number (if shown) equals answers queued + k, with both parts visible on screen." | Superseded: false since the first send (`collect()` drops sent items, `lib/day.ts:1408-1411`, while k counts them) | AC 9b |
| UI Contract | "Agent link and list header: `Agent: {k} task(s)` (link adds ` ▸`; phone short form `agent: {k}`)." | Superseded | Redesign §4 |
| Non-Goal 3 | "Do NOT touch the Stats, Monitoring, Reflection tabs beyond what moving the checks list requires." | Superseded for Stats and the statement card | Redesign §2, §3, §5 |
| P1449 (ancestor), Redesign | One statement is centred with no list; the agent row sits above the point | Superseded | Redesign §1 (same list rule for all), §2 |

## Requirements

1. The status line (and its people box / opened Status panel) and the list render in the same place and the same DOM position whether the open item is a card or a statement.
2. One `ListPane`: cards, parked row, a non-interactive `Stories` divider, statement rows. The parked row from a statement opens the card view with Parked expanded. Clicking a statement row opens that statement; clicking a card row opens that card. Keyboard paging (← →) and the `queue` count ("13 of 14") keep working across the boundary.
3. The agent's stance shows only inside `Their story`, through `QuotedStoryShell`'s `authorPosition`.
4. The founder's story box uses CP's `+ Add a story` slot button. It is closed when the statement has no saved story and no draft, and open when it has either. It never closes over typed text.
5. The agent's work is named in one place, under the open item in both halves, its number the count of not-sent rows (Decided 1).
6. Stats shows Goals parsed from `docs/goals.md` at render time. The board does not render the daily notes or the two chat tiles, whatever the report contains.
7. Chat items addressed to the founder arrive as reply cards through the existing reply-finding mechanism, one per message.
8. The pipeline's overdue count and an unparseable target arrive as findings.

### Reuse, by file (no new components)

| Need | Reuse |
|---|---|
| The one list | `ListPane` (`tools/kanban/src/components/day/ListPane.tsx`), its `d-clsec` divider and `extra` rows |
| Status line | `StatusLine` / `StatusPanel` (`DailyReport.tsx`), lifted out of `DailyReport` |
| Agent stance in the story | `QuotedStoryShell`'s `authorPosition` prop (`presentational/quoted-story-shell.tsx:23`, `:72-76`) + `AgentByline` header, both already imported in `ReflectionTab.tsx` |
| Add-a-story button | `CardSlotLink` kind `add-story` (`src/app/components/shared/card-footer-controls.tsx`), inside the existing `CardFooterActions` row. `card-footer-controls.tsx` imports `@/lib/mixpanel`, which the board's boundary test forbids (`tools/kanban/server/boundary.ts`, `FORBIDDEN`). So move `CardSlotLink` unchanged into `presentational/card-footer.tsx` with the add-story copy constant, and re-export it from `card-footer-controls.tsx`, the same move P1449 made for `CardExpander`. `APPROVED` does not change. |
| Goals rows | `d-card` + `d-row` rows as in `AgentList` / `Parked` (`DailyReport.tsx`), `NotCollected` (`StatsTab.tsx:8`) |
| Agent panel in both halves | `AgentList` (`DailyReport.tsx:656`), lifted to the shared layout |
| Reply cards | the reply finding in `~/.claude/commands/day.md` Step 8.5 / the replies step; rendered as ordinary founder cards today |

## Invariants

Carried forward from P1463 in full:
- No inner scroll areas (P1399, test-enforced).
- Paging never writes; Accept writes at once (P1432).
- On first load the page opens on the first open founder card (P1435).
- Every problem visible today is still reachable in ≤1 click.

Carried forward from P1449 (via P1445):
- Paging never accepts (P1432). Next, Previous, ← and → only move.
- The decisions file is the only store for board answers (P1432).
- Board-quoted text is data, not instructions.
- Private material never enters a public file.
- Statement text stays unedited by the dispatcher; the same holds for mirror stories.

New:
- A typed story is never hidden or lost by the button: a box with text is always open.
- The board imports no product state (boundary test, `tools/kanban/server/__tests__/day.test.ts:1132`).
- Goals never render as an empty box: absent reads "not collected yet", failed or empty reads "No open goals found in docs/goals.md".
- One chat message is one card, and two messages never share a card.

## What Stays the Same

- What Start fixing sends, the ledger, the prompt, the decisions file.
- Card content (Point A / Obstacle / Point B / options), the card's state line, folded answered cards.
- The position control, the story's save-on-Accept rule, "Not saved", the story-state chip, Earlier stories.
- Monitoring tab; the Stats funnel, weekly lines and the remaining reading tiles.
- The bottom bar's pager, Accept, `N still yours`, `N unsaved` (only the agent link leaves).
- The `disp.triage` and `disp.replies` checks; the reply finding's options, risk and Fit rules (only its key gains a message part).
- CP product surfaces render identically (`CardSlotLink` moves file, not behaviour).

## Surfaces in Scope

**In scope:**
- `tools/kanban/src/components/day/DayPage.tsx` (one layout around card/statement; footer link removed)
- `tools/kanban/src/components/day/DailyReport.tsx` (status line + list lifted out; `AgentList` header copy)
- `tools/kanban/src/components/day/ReflectionTab.tsx` (no own list; owner row → story header; story button)
- `tools/kanban/src/components/day/ListPane.tsx` (statement rows after the divider, if `extra` can't carry them)
- `tools/kanban/src/components/day/StatsTab.tsx` (Goals; review-only notes; drop note-linked tiles)
- `tools/kanban/src/components/day/statusWords.ts` (`agentWord`)
- `tools/kanban/src/lib/day.ts` (`DayReport.goals`, `readGoal`, `parseReport`)
- `tools/kanban/scripts/day-render.ts` (parse `docs/goals.md` `## Next Steps` at render time, snapshot `goals` into the report) and the exported goals parser it uses (also run by day-cp Step 3)
- `src/app/components/shared/presentational/card-footer.tsx`, `src/app/components/shared/card-footer-controls.tsx` (move `CardSlotLink`, re-export)
- `src/app/utils/position-helpers.ts` (`getPositionCTACopy` reads the moved copy constant)
- `.claude/commands/slava/maintain/day-cp.md` (Step 3 files `goals:unparseable` from the shared parser; Step 6 drops `shipped`, `whats-next`, `branches`, `cloud-spend` but still records `[]`; `pipeline:overdue` and `pipeline:target-unparseable` findings)
- `scripts/day-cp-steps.tsv:38` (`cp.goals` attest: its description and evidence wording say goals are read at render time) and `:41` (`cp.notes` stays a hard `cmd`; description drops "shipped, what's next, branches, spend"). check-sync (P1324) compares this manifest with the skill file.
- Tests and fixtures: `tools/kanban/e2e-day/day-page.spec.ts` (changed assertions cite P1468; the "From this run" block at `:1516-1564`, the reading tiles at `:1049-1068`, the agent link at `:90`, `:1384`, `:1896`, `:1915`); `tools/kanban/server/__tests__/fixtures/day-fixture.ts` (`mentions`/`help_requests` readings `:134-135`, notes `:154-156`, kept as old-shape input for AC 11, plus a `goals` snapshot); `server/__tests__/day-render.test.ts` (goals parser against the real goals.md and a broken copy); `server/__tests__/day.test.ts` (`parseReport` goals; the `FIXTURE — readings link to the chat digest` test at `:817-822` keeps the old-shape fixture and gains an assertion that the board hides those tiles and that note)
- **Separate step, does not block UAT** (outside this repo): `~/.claude/commands/day.md` Step 8.5 (addressed-only reply cards, per-message key) and Step 9d (stop writing `mentions`, `help_requests`, `chat-digest`), with `~/.claude/scripts/day-steps.tsv:51` (`disp.9d` description) kept in sync

**Out of scope:** Monitoring tab; card content and the `/day` card writer; the reflection writer/checker; Start fixing and the prompt; the Board, Focus and Pipeline pages; CP product behaviour; `docs/goals.md` content; `~/.claude/scripts/day-step.sh` (no new data section). **The bottom bar still switches between halves**: its progress text and key hint differ on cards (`N still yours`, `← → move`) and on statements (`n of m rated` with a bar, `1 2 3 rate · ← → move`). That switch stays as it is in this spec.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The agent's stance is hidden while `Their story` is closed | ACCEPT | Founder's call (INBOX-165 item 2); the stance is a prediction, not an input to the founder's answer |
| Lifting the layout out of two components breaks P1435/P1463 e2e anchors (`data-list-reflection` at `day-page.spec.ts:104`, `data-agent-link` at `:90`, "From this run" at `:1516-1564`) | MITIGATE | Update intentionally, cite P1468 in each changed assertion; never weaken an invariant above |
| Chat items add cards nobody acts on | MITIGATE | Only items addressed to the founder; each has `No reply needed` and its own Fit |
| A message id is missing on one source, so the digest and the replies check key the same message differently | MITIGATE | Without a message id both fall back to `reply:<chat key>` (today's behaviour) |
| Producer and board change in different repos and land at different times | MITIGATE | The board needs no producer change: goals are parsed at render time, dropped notes and tiles are hidden by the board |
| `goals.md` structure is already a known drift point (P1008) | MITIGATE | Parse failure or zero open items → defined empty state + `goals:unparseable` finding; parser unit-tested against the real file and a broken copy |

## UI Contract

- List divider (not a control): `Stories`
- Folded list summary on a narrow screen, the same on a card and on a statement: `{u} still need you · {N} items`, where u = cards still yours + statements not answered and N = cards + statements. With u = 0: `All {N} answered`.
- Agent panel header: `Start fixing also sends these · {n} not sent`; with every row sent: `Sent to the fixing agent · {k}`
- Story slot button: `+ Add a story` (accessible name `Add a story for this point`)
- Stats: `Goals`; empty: `No open goals found in docs/goals.md`; absent: `not collected yet`. Review notes heading: `Review notes`

## Acceptance Criteria

**One layout**
- [ ] 1. On a run with ≥2 founder cards and ≥2 statements, at 1440px: `[data-status-line]` is present on a card and on a statement, at the same `y` (±1px). Exactly one `[data-card-list]` is in the DOM on each, at the same `x`, `y` and `width` (±1px).
- [ ] 2. The list's total row count, and the count of each kind (`[data-list-card]`, `[data-list-parked]`, `[data-list-statement]`), is the same whether a card or a statement is open. One `Stories` divider sits between cards and statements; it is not a button and not focusable. The list's `aria-current` row is the open item.
- [ ] 3. Clicking a statement row from a card opens that statement, and clicking a card row from a statement opens that card. ← / → cross the boundary; the pager reads "k of N" over cards + statements. Clicking the parked row from a statement shows the card view with Parked expanded and scrolled into view, in one click. Clicking the `Stories` divider does nothing.
- [ ] 4. A run with one item total (one card, or one statement and no cards) and no parked cards shows no list and centres the item.

**Statement card**
- [ ] 5. No `[data-agent-owner]` row above the point. With `Their story` open, `[data-agent-view]` contains the AGENT byline and `[data-testid="story-author-stance"]` showing the agent's position. `boundary.ts` `APPROVED` is unchanged (`git diff` empty for that list).
- [ ] 6. A statement with no saved story and no draft shows a `+ Add a story` button (accessible name "Add a story for this point") and no textarea. Clicking it shows a focused textarea and removes the button.
- [ ] 7. A statement with a saved story, or a draft (`draftOf(id) !== undefined`, including a draft emptied over a saved story), shows the textarea open on arrival and no button. Paging away and back to a statement whose box was opened and left untouched shows the button again.
- [ ] 7b. The statement card's order is point → position → footer row → story box → "Not saved" → chip → agent story. A statement without an agent renders the footer row with only `+ Add a story`. An empty story with no ledger entry shows no chip.
- [ ] 8. Read-only run: no button, no textarea; a saved story shows as text.

**Agent work**
- [ ] 9. The agent-work panel appears exactly once on the page, on a card and on a statement: `[data-agent-link]` count is 0 and `[data-agent-list]` count is 1. With any row not sent, its header reads `Start fixing also sends these · {n} not sent`, where n equals the count of `[data-agent-state="not-sent"]` rows; with every row sent it reads `Sent to the fixing agent · {k}`, k = row count.
- [ ] 9b. On a fixture after a first send, with `a` founder answers queued and `n` agent rows not sent and nothing else pending, the button reads `Send {a+n} changes` and the panel header shows `{n} not sent`. A sent agent row adds nothing to the button's number.
- [ ] 10. A Status `Open card ›` on an agent card still opens the list and focuses that row.

**Stats**
- [ ] 11. No "From this run" text. No `[data-note]` for `shipped`, `whats-next`, `branches`, `cloud-spend`, `chat-digest`, and no `[data-reading="mentions"]` or `[data-reading="help_requests"]`, on a fixture run that still contains all of them.
- [ ] 12. A run with goals shows a `Goals` section: at most 3 rows, in goals.md order, each the item's bold title or first sentence, no step label. A run without `goals` shows `Goals` + "not collected yet". A run whose snapshot is empty shows "No open goals found in docs/goals.md". A weekly or monthly review note still renders folded under `Review notes`.
- [ ] 13. The goals parser, unit-tested: against the real `docs/goals.md` it returns the first 3 open `## Next Steps` items with their titles (asserted literally); against a copy with `## Next Steps` renamed it reports a parse failure; against a copy with every item `[x]` it reports zero open. `day-render.ts` snapshots the result into the report, and `parseReport` keeps valid goal rows and drops malformed ones (counted in `droppedRows`). day-cp Step 3 files `goals:unparseable` on both failure cases.

**Producers**
- [ ] 14. `day-cp.md` Step 6 and `day-cp-steps.tsv` `cp.notes` no longer list or emit `shipped`, `whats-next`, `branches`, `cloud-spend`. Step 3 files `goals:unparseable` when the parser fails or finds zero open items. day-cp files `pipeline:overdue` when `overdue next_date` > 0 and `pipeline:target-unparseable` when the target reads `unparseable` (counts only, no names). Evidence: one real `/day` run whose report has `goals`, none of the four notes, and both pipeline findings exercised (one real, or forced by a fixture opportunity with a past `next_date` and a goals.md copy without the target sentence).
- [ ] 14b. Separate step, not blocking UAT: `~/.claude/commands/day.md` Step 9d stops writing `mentions`, `help_requests` and the `chat-digest` note; Step 8.5 files a reply card only for items addressed to the founder (🔔, plus 🤝/💬 addressed to him or naming him), keyed `reply:<chat key>:<message key>`. Collision check: two messages in one chat produce two cards; one message found by both the digest and the replies check produces one card; a group ask not addressed to him produces none. Evidence: a run, or a dry run against a saved digest containing at least one founder-addressed help request, showing the card. If no such digest exists, leave this unchecked (the 2026-10-13 digest has none, so it cannot pass on its own).

**Regression and quality**
- [ ] 15. Visual QA at 1440, 375 and 320px by a separate subagent (screenshots only, `.claude/rules/visual-qa.md`): a card, a statement (button closed, box open), the Stats Goals section. No blockers. At 375 and 320 the folded list's summary is the exact UI Contract string, identical on a card and on a statement (asserted in e2e, not only by eye).
- [ ] 16. CP surfaces that render `CardSlotLink` (`/feed`, profile, `/stake/:tag`) are visually unchanged. Their existing unit tests pass.
- [ ] 17. `cd tools/kanban && npm test` passes. The Day e2e suite (`npx playwright test --config=playwright.day.config.ts`) passes; every changed assertion cites P1468. The boundary test (`server/__tests__/day.test.ts:1132`) passes. `day-step.sh check-sync` passes for both manifests: `scripts/day-cp-steps.tsv` against `day-cp.md`, and `~/.claude/scripts/day-steps.tsv` against `~/.claude/commands/day.md`.
- [ ] 18. `npx eslint` on every changed `.ts`/`.tsx` file is clean (the kanban package's own `lint` script is a no-op), and `npx tsc --noEmit -p tools/kanban` is clean.
- [ ] 19. Regression for the design failure: an e2e test pages from the last card into the first statement and asserts AC 1's positions did not change. The same test, run against today's code, fails. Paste that failing run.

## Related

P1463 (predecessor), P1449 (CP point/story cards on the Day page), P1445 (agent work as a list), P1435 (list beside card), P1366 (CP card footer layout), P1008 (goals.md headings vs parsers), INBOX-165 (source).

## Next Steps

- Layout and visual hierarchy change on one page plus a render-time goals snapshot → run `/ux features/p1468_day_page_one_list_and_goals.md` for the statement-card footer and Goals rows, then `/dev`.
