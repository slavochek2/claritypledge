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
- **New:** see the current goals and the next step for each, in plain words, where "From this run" was. Act on a chat help request as a card instead of reading about it in a note.

## Current State

What ships today (verified in code, 2026-10-13):

- **Two layouts.** `DayPage.tsx:858-880` renders `<DailyReport>` when `tab === 'report'`, and `DayPage.tsx:885-920` renders `<ReflectionTab>` when `tab === 'reflection'`. `DailyReport` draws the `StatusLine` (`DailyReport.tsx:178-182`, component at `:228`) and its own `ListPane` labelled "Cards" (`CardList`, `DailyReport.tsx:105`). `ReflectionTab` draws no status line and a second `ListPane` labelled "Statements" with a summary head ("All 2 rated") and a "12 cards" row back (`ReflectionTab.tsx:127-149`). With one statement it shows no list at all (`ReflectionTab.tsx:125`, P1449).
- **Agent stance above the point.** `AgentOwnerRow` (`ReflectionTab.tsx:154`, `:213-219`) renders CP's `PointOwnerRow` (avatar, AGENT byline, `PositionBadge`) above the quoted point. The story header under `Their story` shows only avatar and byline (`ReflectionTab.tsx:244-249`).
- **Story box always open.** `Story` (`ReflectionTab.tsx:369-408`) always renders a `<label>Add your story (optional)</label>` and a textarea (when not read-only).
- **Agent work named twice.** `agentWord(n)` = `` `Agent: ${n} task(s)` `` (`statusWords.ts:29`) is the `AgentList` fold header (`DailyReport.tsx:656`, `AgentList`) and the footer link `data-agent-link` (`DayPage.tsx:988-991`, handler `openAgentList` `:753-757`). The count is `agentCards = everyIssue.filter(agentOnly)` (`DayPage.tsx:249`): cards whose recommended option is agent work (`isAgentWork`, `lib/day.ts:1365-1367`) and that the founder hasn't answered with a non-agent option (`DayPage.tsx:247`). These are the items Start fixing sends to the fixing agent without asking the founder. The Start fixing button shows no number; the count only sits in its `title` and `data-send-count` (`DayPage.tsx:1042-1046`).
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
2. **The footer link's reason is gone.** P1463 point 4 put `Agent: {k} tasks ▸` beside the button "so its number is never unexplained". The button no longer shows a number (it reads `Start fixing`, count only in `title`), so the link explains nothing. It repeats the panel header word for word (P1463 point 10: "One wording for the agent's work").
3. **Notes were a dump of what the terminal used to print.** `day-cp.md` Step 6 ("what used to be printed, kept for the board", `.claude/commands/slava/maintain/day-cp.md:1531-1545`) and the dispatcher's Step 9d (`~/.claude/commands/day.md:1384`, `:1414`) move old terminal blocks onto the board unchanged. `cloud-spend` repeats Monitoring's Google Cloud spend (`MonitoringTab.tsx:146`). The `whats-next` note's first line (`PIPELINE 2 conversations … target …`) repeats the Stats funnel (`report.stats.funnel` steps Contacted → Active). Its `Next: 3a …; 3b …` lines use goals.md step numbers. Help requests stay text: only a 🔔 hit or a 💬 item addressed to the founder becomes a reply card (`~/.claude/commands/day.md:1248`). 🤝 help requests go only to the note and the `help_requests` tile (`day.md:1252`, `:1373`).
4. **The agent's stance went where CP shows a point's owner.** P1449 copied CP's profile point card, where the owner row sits above the point. On the Day page the point belongs to the founder, and the agent's stance is part of its story. So the row above the point reads as if the agent owns the statement.

## Redesign

### 1. One list, one top, for cards and statements

The status line (and the people box it opens) and one `ListPane` render **around** whichever item is open, card or statement. The list holds the cards, then the parked row, then a `Reflection` divider row (the existing `d-clsec` section style, `ListPane.tsx:81`), then one row per statement. The row shows the statement text and its word (Not rated / Somewhat Agree / …), as the Statements list does today. Clicking any row opens it in the same right pane. The "N cards ✓ answered" back-row and the "All N rated" head go away; the rows' ✓ already say it (P1463 point 9). The rule for whether the list shows is the same for every item: shown when the queue holds ≥ 2 rows (cards + parked + statements); otherwise the one item is centred (`d-single`, as today).

```
Same on a card and on a statement
▶ ✓ 31 worked  ✕ 1 didn't work  2 new people
┌ list ──────────────────┐ ┌ open item (card or statement) ──────┐
│ ✓ card …               │ │                                     │
│ ✓ card …               │ │                                     │
│ ○ 1 parked     Parked  │ └─────────────────────────────────────┘
│ ── Reflection ──────── │
│ ✓ Settle whether …     │  ← current row highlighted, whichever half it is in
│ ○ Run the online …     │
└────────────────────────┘
```

### 2. The agent's stance moves into "Their story"

The row above the point goes. The story header under `Their story` shows avatar, AGENT byline **and the agent's `PositionBadge`**: the same three things, moved, using the same CP components.

### 3. "Add your story" is CP's `+ Add a story` button

```
Statement, empty story                          Statement, story has text
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ (pin) Settle whether …               │        │ (pin) Settle whether …               │
│ [Disagree | Unsure | ✓ Agree+]       │        │ [Disagree | Unsure | ✓ Agree+]       │
│ Done · answered                      │        │ Done · answered                      │
│ ──────────────────────────────────── │        │ ──────────────────────────────────── │
│ [▾ Their story]  [+ Add a story]     │        │ [▾ Their story]                      │
│                                      │        │ [textarea: can you help me decide…]  │
│  │ (S) AGENT on Slava  Agrees–       │        │  │ (S) AGENT on Slava  Agrees–       │
│  │ The outreach plan …               │        │  │ The outreach plan …               │
└──────────────────────────────────────┘        └──────────────────────────────────────┘
```

The bottom row is CP's point-card footer (P1366 layout: `CardExpander` then the viewer's one `CardSlotLink`). With no saved story and no draft, it carries `+ Add a story`. A click replaces the button with the story box, focused, directly under the footer row. With text, saved or a draft, the box is open on arrival and no button shows. The "Not saved" line and the story-state chip (Done · Resend) keep their behaviour. Read-only runs: no button; a saved story shows as text, as today.

### 4. The agent's work: said once, in plain words

The footer link goes. The panel under the card stays, its header reads [FOUNDER DECISION: panel header copy, recommended default `For the fixing agent (7)`], and rows keep ✓ / `Not sent`. Status rows that point into it ("Open card ›" on an agent card, `DayPage.tsx:461`) keep opening and focusing it.

### 5. Stats: Goals instead of "From this run"

```
Stats
  [funnel] [weekly lines] [reading tiles: Unconfirmed sign-ups, Sign-ups, Story authors, …]
  Goals
  ┌──────────────────────────────────────────────────────────┐
  │ <goal, one plain sentence>                               │
  │   Next: <the next step, one plain sentence>              │
  │ <goal>                                                   │
  │   Next: <…>                                              │
  └──────────────────────────────────────────────────────────┘
  (a weekly / monthly review note, folded, only on a review day)
```

- **Goals** come from a new report section `goals`: `[{ id, goal, next }]`, at most 5, one line each. Day-cp writes it at Step 3 from `docs/goals.md` [FOUNDER DECISION: where the goal sentences come from, see below]. No step numbers ("3a"), no `PIPELINE` line (the funnel shows it), no DO/DON'T. They stay in goals.md. Rendered in the existing `d-card` with `d-row` rows (the shape `AgentList`/`Parked` rows use). An absent section reads `Goals` + "not collected yet" (`NotCollected`, `StatsTab.tsx:8`), never an empty box.
- **Dropped from the board:** the `shipped`, `cloud-spend`, `whats-next`, `branches` and `chat-digest` notes, and the `mentions` and `help_requests` tiles. Producers stop writing them. The board renders only notes that carry a `review` (weekly / monthly), so older runs that still have the daily notes look the same as new ones. Where each dropped thing still lives: cloud spend → Monitoring; pipeline → the Stats funnel; branches → the Board, and stranded specs are already findings (`day-cp.md:104-105`); unpushed commits → the status line chip; shipped → git log; the digest → its file and the cards below.
- **Chat digest → reply cards.** Every item the digest says needs the founder becomes the existing **reply finding** (`~/.claude/commands/day.md:1248`): `--check disp.replies --fault-key reply:<chat key>`, options `reply` / `none`, its own Fit and evidence. This now includes 🤝 help requests [FOUNDER DECISION: whether 💬 "worth engaging" items not addressed to the founder also become cards, recommended default **no**: they stay in the digest file only, so the card list doesn't fill with optional chatter]. One card per chat, the key scheme already used (`day.md:1293`). The `disp.triage` freshness check and its stale-digest finding are unchanged.

### Founder decisions

1. `[FOUNDER DECISION: panel header copy for the agent's work, recommended default "For the fixing agent (N)"]`
2. `[FOUNDER DECISION: goal source, recommended default: add a short "## Goals" section to docs/goals.md, one line per goal with a "Next:" line, which /day copies verbatim. The alternative is /day writing goal sentences from the open Next Steps. Recommended because goal wording is the founder's, and an agent rewording it daily drifts. A missing section shows "not collected yet" and files the existing goals:unparseable finding (day-cp.md:1413). Overlaps P1008 (goals.md headings vs parsers).]`
3. `[FOUNDER DECISION: chat items not addressed to the founder (💬 worth engaging) as cards, recommended default no]`
4. `[FOUNDER DECISION: button copy: CP's "+ Add a story" (reused as-is, recommended) vs the board's current "Add your story"]`
5. `[FOUNDER DECISION: weekly / monthly review notes stay on Stats, folded under Goals on review days, recommended default keep]`

## Predecessor Sections Superseded

| Section | P1463 said | Status | Replaced by |
|---|---|---|---|
| Solution 4 | "the bottom bar shows `Agent will also do {k} tasks ▸`, opening the With-the-agent list" | Superseded | Redesign §4, AC 7-8 |
| Round 2, point 10 | "bottom link and list header both read `Agent: {k} tasks`" | Superseded | One place, new copy (Redesign §4) |
| Round 3, point 12 | "the card list's `Reflection` row is the divider and the jump" | Extended | The divider stays; the statements are rows of the same list under it (Redesign §1) |
| AC 5 | "The bottom bar shows `Agent: {k} tasks ▸`, where k equals the With-the-agent list length; clicking it shows the list." | Superseded | AC 7-8 |
| AC 6 | "The button's number (if shown) equals answers queued + k, with both parts visible on screen." | Superseded (the button shows no number; nothing left to explain) | Not replaced |
| UI Contract | "Agent link and list header: `Agent: {k} task(s)` (link adds ` ▸`; phone short form `agent: {k}`)." | Superseded | Redesign §4 |
| Non-Goal 3 | "Do NOT touch the Stats, Monitoring, Reflection tabs beyond what moving the checks list requires." | Superseded for Stats and the statement card | Redesign §2, §3, §5 |
| P1449 (ancestor), Redesign | One statement is centred with no list; the agent row sits above the point | Superseded | Redesign §1 (same list rule for all), §2 |

## Requirements

1. The status line (and its people box / opened Status panel) and the list render in the same place and the same DOM position whether the open item is a card or a statement.
2. One `ListPane`: cards, parked row, `Reflection` divider, statement rows. Clicking a statement row opens that statement; clicking a card row opens that card. Keyboard paging (← →) and the `queue` count ("13 of 14") keep working across the boundary.
3. The agent's stance shows only inside `Their story`, with CP's `PositionBadge`.
4. The founder's story box uses CP's `+ Add a story` slot button. It is closed when the statement has no saved story and no draft, and open when it has either. It never closes over typed text.
5. The agent's work is named in one place, with plain copy (FOUNDER DECISION 1).
6. Stats shows Goals from a `goals` report section. The daily notes and the two chat tiles are neither written nor rendered.
7. Help requests from the digest arrive as reply cards through the existing reply-finding mechanism.

### Reuse, by file (no new components)

| Need | Reuse |
|---|---|
| The one list | `ListPane` (`tools/kanban/src/components/day/ListPane.tsx`), its `d-clsec` divider and `extra` rows |
| Status line | `StatusLine` / `StatusPanel` (`DailyReport.tsx`), lifted out of `DailyReport` |
| Agent stance in the story | `PositionBadge` (`src/app/components/shared/PositionBadge.tsx`) + `AgentByline` + `QuotedStoryShell` header (already imported in `ReflectionTab.tsx`) |
| Add-a-story button | `CardSlotLink` kind `add-story` (`src/app/components/shared/card-footer-controls.tsx`) with `getPositionCTACopy` (`src/app/utils/position-helpers.ts`), inside the existing `CardFooterActions` row. `card-footer-controls.tsx` imports `@/lib/mixpanel`, which the board's boundary test forbids (`tools/kanban/server/boundary.ts`, `FORBIDDEN`). So move `CardSlotLink` unchanged into `presentational/card-footer.tsx` and re-export it from `card-footer-controls.tsx`, the same move P1449 made for `CardExpander`. |
| Goals rows | `d-card` + `d-row` rows as in `AgentList` / `Parked` (`DailyReport.tsx`), `NotCollected` (`StatsTab.tsx:8`) |
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
- A goal the run didn't collect reads "not collected yet", never an empty list.

## What Stays the Same

- What Start fixing sends, the ledger, the prompt, the decisions file.
- Card content (Point A / Obstacle / Point B / options), the card's state line, folded answered cards.
- The position control, the story's save-on-Accept rule, "Not saved", the story-state chip, Earlier stories.
- Monitoring tab; the Stats funnel, weekly lines and the remaining reading tiles.
- The bottom bar's pager, Accept, `N still yours`, `N unsaved`, the per-section progress and key hint (only the agent link leaves).
- The `disp.triage` and `disp.replies` checks; the reply finding's options, risk and Fit rules.
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
- `tools/kanban/scripts/day-render.ts` (`SECTIONS`, `dataUsable`, report assembly for `goals`)
- `src/app/components/shared/presentational/card-footer.tsx`, `src/app/components/shared/card-footer-controls.tsx` (move `CardSlotLink`, re-export)
- `.claude/commands/slava/maintain/day-cp.md` (Step 3 writes `goals`; Step 6 drops `shipped`, `whats-next`, `branches`, `cloud-spend`)
- Outside this repo, founder-approved direction: `~/.claude/commands/day.md` (Step 8.5 help requests → reply findings; Step 9d drops `mentions`, `help_requests`, `chat-digest`) and `~/.claude/scripts/day-step.sh` (`DATA_SECTIONS` + `goals`)
- `docs/goals.md`, only if FOUNDER DECISION 2 picks the `## Goals` section (the founder writes or approves the goal text)
- `tools/kanban/e2e-day/day-page.spec.ts` (changed assertions cite P1468)

**Out of scope:** Monitoring tab; card content and the `/day` card writer; the reflection writer/checker; Start fixing and the prompt; the Board, Focus and Pipeline pages; CP product behaviour; the bottom bar's progress text.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The agent's stance is hidden while `Their story` is closed | ACCEPT | Founder's call (INBOX-165 item 2); the stance is a prediction, not an input to the founder's answer |
| Lifting the layout out of two components breaks P1435/P1463 e2e anchors (`data-list-cards`, `data-list-reflection`, `data-agent-link`, "From this run") | MITIGATE | Update intentionally, cite P1468 in each changed assertion; never weaken an invariant above |
| Help requests add cards nobody acts on | MITIGATE | Each has `No reply needed` and its own Fit; FOUNDER DECISION 3 keeps optional chatter out |
| Producer and board change in different repos and land at different times | MITIGATE | The board tolerates both shapes: no `goals` → "not collected yet"; daily notes present → not rendered |
| `goals.md` structure is already a known drift point (P1008) | MITIGATE | Missing section → explicit "not collected yet" + `goals:unparseable` finding, never an empty block |

## Acceptance Criteria

**One layout**
- [ ] 1. On a run with ≥2 founder cards and ≥2 statements, at 1440px: `[data-status-line]` is present on a card and on a statement, at the same `y` (±1px). Exactly one `[data-card-list]` is in the DOM on each, at the same `x`, `y` and `width` (±1px).
- [ ] 2. The list holds the same rows on a card and on a statement: equal counts of `[data-list-card]` and `[data-list-statement]`, plus one `[data-list-reflection]` divider between them. The list's `aria-current` row is the open item.
- [ ] 3. Clicking a statement row from a card opens that statement, and clicking a card row from a statement opens that card. ← / → cross the boundary; the pager reads "k of N" over cards + statements.
- [ ] 4. A run with one item total (one card, or one statement and no cards) shows no list and centres the item.

**Statement card**
- [ ] 5. No `[data-agent-owner]` row above the point. With `Their story` open, `[data-agent-view]` contains the AGENT byline and a `PositionBadge` matching the agent's position.
- [ ] 6. A statement with no saved story and no draft shows a `+ Add a story` button (accessible name "Add a story for this point") and no textarea. Clicking it shows a focused textarea and removes the button.
- [ ] 7. A statement with a saved story, or an unsaved draft, shows the textarea open on arrival and no button. Paging away and back to a statement whose box was opened and left empty shows the button again.
- [ ] 8. Read-only run: no button, no textarea; a saved story shows as text.

**Agent work**
- [ ] 9. The agent-work label appears exactly once on the page: `[data-agent-link]` count is 0, and the `AgentList` header is the only element whose text matches the label. Its number equals the list length.
- [ ] 10. A Status `Open card ›` on an agent card still opens the list and focuses that row.

**Stats**
- [ ] 11. No "From this run" text. No `[data-note]` for `shipped`, `whats-next`, `branches`, `cloud-spend`, `chat-digest`, even on a fixture run that still contains them. No `[data-reading="mentions"]`, no `[data-reading="help_requests"]`.
- [ ] 12. A run with `goals` shows a `Goals` section: one row per goal with its `Next:` line, in the order given. A run without `goals` shows `Goals` + "not collected yet". A weekly or monthly review note still renders folded.
- [ ] 13. `parseReport` keeps valid `goals` rows and drops malformed ones (counted in `droppedRows`). `day-render.ts` accepts and emits a `goals` section. `day-step.sh data goals` stores it; `day-step.sh data bogus` is still refused (exit non-zero, pasted).

**Producers**
- [ ] 14. `day-cp.md` Step 6 no longer lists or emits `shipped`, `whats-next`, `branches`, `cloud-spend`; Step 3 records `goals`. The dispatcher's Step 9d no longer writes `mentions`, `help_requests` or the `chat-digest` note. Step 8.5 files each digest help request as a reply finding (`--check disp.replies --fault-key reply:<chat key>`). Evidence: one real `/day` run whose report has `goals`, no dropped notes, and a reply card for a help request when the digest has one.

**Regression and quality**
- [ ] 15. Visual QA at 1440, 375 and 320px by a separate subagent (screenshots only, `.claude/rules/visual-qa.md`): a card, a statement (button closed, box open), the Stats Goals section. No blockers. At 375/320 the folded list toggle reads the same on a card and on a statement.
- [ ] 16. CP surfaces that render `CardSlotLink` (`/feed`, profile, `/stake/:tag`) are visually unchanged. Their existing unit tests pass.
- [ ] 17. `cd tools/kanban && npm test` passes. The Day e2e suite (`npx playwright test --config=playwright.day.config.ts`) passes; every changed assertion cites P1468. The boundary test (`server/__tests__/day.test.ts:1132`) passes.
- [ ] 18. `npx eslint` on every changed `.ts`/`.tsx` file is clean (the kanban package's own `lint` script is a no-op), and `npx tsc --noEmit -p tools/kanban` is clean.
- [ ] 19. Regression for the design failure: an e2e test pages from the last card into the first statement and asserts AC 1's positions did not change. The same test, run against today's code, fails. Paste that failing run.

## Related

P1463 (predecessor), P1449 (CP point/story cards on the Day page), P1445 (agent work as a list), P1435 (list beside card), P1366 (CP card footer layout), P1008 (goals.md headings vs parsers), INBOX-165 (source).

## Next Steps

- Layout and visual hierarchy change on one page plus a new report section → run `/ux features/p1468_day_page_one_list_and_goals.md` for the statement-card footer and Goals rows, then `/dev`.
