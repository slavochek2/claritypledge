---
status: week
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: high
rank: 1000107
changes: p1468
chain_root: p1463
disclosure: public
workstream: infrastructure
tags:
  - redesign
  - p1468
  - day-page
  - kanban
created_date: 2026-10-13
delivery_stage: change-request
pipeline_ran: [change-request]
---

# P1471: Day page: one quiet footer, a card that doesn't answer for you, Save next to "Not saved"

> **Redesign of:** [P1468: Day page: one list for cards and stories, the agent's work said once, goals instead of "From this run"](p1468_day_page_one_list_and_goals.md)
> (When P1468 ships, `/ship` moves it to `features/done/<date>/`. Update this link then.)
> **What was wrong:** P1468 made the page one layout, but it explicitly left the bottom bar alone
> (its Out of scope: "That switch stays as it is in this spec"). The bar still carries counts that
> change with the state and explain nothing ("4 still yours", "0/4", "1 unsaved", "0 of 4 rated"
> plus a bar, "1 2 3 rate · ← → move"). On a phone, "4 still yours" sits under the list's "8 still
> need you", and the two counts read as a contradiction. An unanswered card shows the recommended
> option already checked, so it looks answered. "Not saved" has no save control beside it. Accept
> is tinted like a second primary. The Stats tab shows the Daily report's footer.

Code references are to `feature/p1468-day-page-one-list` at `294f92aa1` (worktree w1), the code that
is about to ship. `main` still has the pre-P1468 version.

## Operating Mode

> This spec is an **incremental correction** to P1468, not a greenfield design.
> The predecessor spec is **read-only shipped history**. Do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1468 (one list, one layout, agent work said once, Goals on Stats) are not
> up for re-examination.

## Problem Statement

The founder approved this second pass on 2026-10-13 ("sure lets do it"). It targets chrome that two
blind visual QA passes on P1468 flagged as the same kind of thing as the founder's complaint about
the old footer link:

> "Agent: 7 tasks. What's that? … what is this? why i need it? redundand?"

The founder's rule for the fix:

> "no custom things … follow components as we have, like points, cards"

The cost is **attention**. Every number in the bar asks to be decoded, and the decoding changes
between a card and a statement. The founder wants less to read. Six problems, each one verified in
code:

| # | Problem | One concrete example (P1468 visual-QA screenshots) |
|---|---------|------------------------------------------------------|
| 1 | The bar has counts that change with the state and say nothing about themselves | At 375 on a card, the list reads "8 still need you" and the bar under it reads "4 still yours". Which one is true? Both are. They count different things (below). At 375 on a statement the bar reads "0/4 1 unsaved". |
| 2 | An unanswered card shows the recommendation as an answer, three times | At 1440 on card 1: the state line says "Not answered yet · recommended: I'll reply today", the option "I'll reply today" has a filled radio and a blue border, and its chip says "Recommended · Fit not rated". |
| 3 | "Not saved" has no save control | At 1440 with a story typed: "Not saved" under the box. The only way to save is "Accept & next" in the bar, about 150px lower and 300px to the left. |
| 4 | "Accept & next" reads as a second primary | At 1440 the bar shows a tinted "Accept & next" and a blue "Start fixing", two filled buttons on one bar (P955: one primary). |
| 5 | Phone chrome eats the first screen | At 320×700, everything above the content ends at about y=172 and the bar starts at about y=597. That is about 275px, or 39% of the screen. The card's title never reaches the first screen: only its state line shows above the bar. The status line wraps to 4 rows ("10 worked" / "11 didn't work" / "3 new people" / "12 unpushed commits"). |
| 6 | Stats shows the Daily report's footer | At 1440 on Stats, the bar reads "1 unsaved" and "Start fixing". Stats has nothing to send and no story. |

## Jobs To Be Done

- **Preserved from P1468:** see each problem once. Every number on screen is backed by something
  visible. Go through cards and then statements in one pager. Reach any problem in ≤1 click. Move
  from cards into statements without the layout changing.
- **Corrected:** "every number on screen backed by something visible" (P1468 J2) now also covers
  the bar. The bar keeps **one** count, the pager's position. Know whether a card is answered from
  how it looks: a checked option means the founder answered it, never "the agent suggests this".
  Save a story where it is typed.
- **New:** none.

## Current State

What P1468 built (branch `feature/p1468-day-page-one-list`, verified):

**The bar** (`DayPage.tsx:932-1071`) renders whenever a run is loaded, **on every tab**
(`{ok && (<div className="d-gbar" data-bottom-bar>`, `:932-933`). It has three grid areas:
`nav` / `prog` / `act` (`day.css:259`).

- `nav`: Previous · "k of N" · Next (`:955-964`), plus Accept (`:965-978`) when `accepting ||
  reflAccepting`. The Accept label is "Accept & next" unless the item is last (`:975`). It carries
  `.d-accept`, which tints it `--blue-50` (`day.css:266`).
- `prog` holds four things, each conditional:
  - On a statement: "{rated} of {N} rated" (with " · {k} story only" when some have only a story) and a
    progress bar `.d-bline` (`DayPage.tsx:985-996`). At a container of 360px or less the text is
    replaced with `data-short` "0/4" (`day.css:439-444`).
  - On a card: "{N} still yours", a link to the first unanswered card (`DayPage.tsx:998-1002`).
    N is `stillYours(view)` minus locally queued answers (`:497`). Those are **cards only**: unanswered and not
    agent work (`lib/day.ts:1408-1410`).
  - On every tab: "{n} unsaved", a link to the first statement with an unsaved story
    (`DayPage.tsx:1003-1016`). This is not gated by tab.
  - A key hint: "1 2 3 rate · ← → move" or "← → move" (`:1017-1022`). It shows only at ≥900px with a
    pointer (`day.css:249-255`).
- `act`: Start fixing / "Send {N} changes" / "Sent to your terminal at HH:MM" / "Opening…", plus a
  copy icon (`DayPage.tsx:1024-1067`). Before a first send, Start fixing is **rendered disabled**
  when there is nothing to send (`:1049`). So is the copy icon (`:1060`).
- Layout: one row at a container ≥640px (`day.css:450-451`). At 360–639px it is two rows, nav+act
  and then the progress row (`day.css:259`). At ≤359px it is two rows, nav and then progress+act
  (`day.css:414-416`).

**The list summary** (narrow screens) is `listSummary(need + statements.open, total)`
(`DailyReport.tsx:146`, `statusWords.ts:53`). `need` counts every card not done, including the
`before` state. `statements.open` counts statements with no position and no story
(`lib/day.ts:1563`). **This is a different population from the bar's "still yours"**, which counts
cards only and leaves out queued answers. That is why "8 still need you" and "4 still yours" can
both be correct and still read as a contradiction.

**Pre-selection.** `selected()` returns `choice ?? decision ?? options[recommended_index]` on the
latest run (`DayPage.tsx:300-305`). So an unanswered card renders its recommended radio `checked`
(`DailyReport.tsx:505`), and `.d-opt:has(input:checked)` draws the blue border and fill
(`day.css:225`). The pre-selection is **visual only**: Start fixing never sends an unanswered
founder card (`collect` keeps only `written || isAgentWork`, `lib/day.ts:1446-1449`, and
`pendingPreselected` takes agent work only, `:1474-1479`). The state line adds
"`Not answered yet · recommended: {label}`" (`DailyReport.tsx:97`). The option's chip adds
"`Recommended · Fit {n}%`" or "`Recommended · Fit not rated`" (`:669-671`), and the meaning of "Fit"
lives only in that chip's `title`.

**"Not saved"** is a `<p className="d-unsaved">` under the story box with nothing beside it
(`ReflectionTab.tsx:145-150`). The code comment there says why: "Accept is right below in the bar".
Done is blocked with "Accept the edited story first: …" (`:156`). On a statement, Accept appears
only while the story is unsaved (`reflAccepting = isUnsaved`, `DayPage.tsx:591`). The QA report
that Accept shows "on a statement with nothing to accept" **did not reproduce**: shot
`1440-2-statement-button` (no draft) has no Accept. That point goes away anyway, because this spec
removes Accept from statements.

**Phone chrome.** `.d-topbar` is sticky (`day.css:48`) at every width and holds two rows: the tabs,
then the run switcher (`DayPage.tsx:770-799`). The status line's chips wrap as whole units
(`day.css:128-129`). "N new people" and "N unpushed commits" are chips beside the outcome
(`DailyReport.tsx:274-280`).

**Before (current, from the P1468 shots):**
```
1440, card (unanswered)
‹ Previous  1 of 8  Next ›  [Accept & next]  4 still yours  ← → move          [Start fixing] [⧉]

1440, statement (no draft)
‹ Previous  6 of 8  Next ›  0 of 4 rated ▬▬▬▬▬▬▬▬▬▬▬▬  1 2 3 rate · ← → move   [Start fixing] [⧉]

1440, statement (story typed)
‹ Previous  6 of 8  Next ›  [Accept & next]  0 of 4 rated  1 unsaved          [Start fixing] [⧉]

1440, Stats
1 unsaved                                                                      [Start fixing] [⧉]

375, card                          375, statement (story typed)
┌ 8 still need you ▸ ┐  (list)     │ Your story [ ... ]          │
│ ○ Not answered yet · recom-  │   │ Not saved                    │
│   mended: I'll reply today   │   ├──────────────────────────────┤
├──────────────────────────────┤   │   [‹]  6 of 8  [›]  [Accept] │
│   [‹]  1 of 8  [›]  [Accept] │   │ 0/4  1 unsaved  [Start fixing][⧉]
│ 4 still yours  [Start fixing][⧉]

card options (1440)
(●) I'll reply today  [Recommended · Fit not rated]   ← blue border, looks answered
( ) Agent drafts, you send
```

## Root Cause

1. **The bar was the place each feature reported its own progress.** P1432 added "still yours",
   P1440 added "unsaved" and the statement Accept, and P1449 moved the "1 2 3" key hint into the bar
   (`DayPage.tsx:1019`, "the reflection's 1 2 3 keys live here, not as a row under CP's buttons").
   Each count was right for its feature. Nobody owned the sum, and P1468 deferred it explicitly
   (P1468 Out of scope, line 271).
2. **Two counts of two populations, both worded "still".** The list summary counts cards not done
   plus statements with no answer (`DailyReport.tsx:146`). The bar counts unanswered founder cards
   that are not queued (`DayPage.tsx:497`). On a phone both are on screen at once.
   P1468's own UI Contract specifies both strings (line 287, the list summary; line 289, the bar's
   "still yours" at every width) and never reconciles them. This spec keeps the list summary and
   drops the bar's count.
3. **Pre-selection was a shortcut for Accept.** Showing the recommendation checked made "Accept =
   what is already selected" read naturally (`DayPage.tsx:300`, comment "the latest run preselects
   the recommendation"). Since P1432, a founder answer is written the moment it is picked, and an
   unopened founder card is never sent (`lib/day.ts:1446-1449`). So the checked radio claims an
   answer that does not exist anywhere. P1432 already named this exact cause and then fixed it only
   with a state line: "Answered and unanswered cards looked identical (both preselect the
   recommendation)" ([decisions.md](../docs/decisions.md) 2026-10-07 [product], from the founder's
   "when i come back next day not sure which answered and which not").
4. **Story saving was placed in the bar** (`ReflectionTab.tsx:146`, "Accept is right below in the
   bar"). On a wide screen the bar is far from the box. On a phone it is two rows below a box that
   may be scrolled off.
5. **The bar is not tab-aware** (`DayPage.tsx:932`). Only its pager and progress check `sec`. The
   unsaved link and the action area render on Stats and Monitoring as well.

## Redesign

### R1. One footer, one count (problem 1)

The bar has the same slots on a card and on a statement, on every width:

```
[pager: ‹ Previous  k of N  Next ›]  [Accept & next — only on an unanswered founder card]   …   [primary action] [⧉]
```

- **Removed from the bar:** "{N} still yours" (`DayPage.tsx:998-1002`), "{n} of {N} rated · k
  story only" and its bar and "0/4" (`:985-996`, `day.css:272-275, 434, 439-444`), "{n} unsaved"
  (`:1003-1016`), and the key hint (`:1017-1022`). Their CSS goes with them (`.d-still`,
  `.d-bprog`, `.d-tight`, `.d-bline`, `.d-hint`, the `[data-progress][data-short]` rule). `.d-plab`
  stays only if something else still uses it.
- **The one count is the pager's "k of N".** It explains itself: it sits between Previous and Next.
  The other numbers the founder needs are already where the items are. The list rows carry
  each item's state word, including "Unsaved" (`lib/day.ts:1555`). On a phone, the folded list's
  summary is the single "what still needs you" count (P1468 UI Contract, kept unchanged).
- **Kept as is:** "Send {N} changes" after a first send (P1468 AC 9b). Its number is part of the
  primary action's label, not a status count.
- **Where the reach of "still yours" goes:** that link jumped to the first unanswered card. The
  page already opens there (P1435 invariant). Accept & next walks forward, and the list reaches any
  card in one click (desktop), or a fold plus a click (phone, as today for every card but that one).
- **Where the key hints go:** Previous and Next already carry "(←)" and "(→)" in their `title`
  (`DayPage.tsx:956, 962`). Card options already show their number as a `.d-key` chip on desktop
  (`DailyReport.tsx:514-518`). The statement's position control gets `aria-keyshortcuts="1 2 3"`
  and a `title` of "Keys: 1 Disagree · 2 Unsure · 3 Agree". The keys keep working. Only the visible
  bar text goes.
- **Layout:** the `prog` grid area is removed. The bar is one row whenever its items fit. On a
  narrow container it wraps to a second row only when they don't, and the action stays
  right-aligned. Budgets are in ACs 4 and 5.

### R2. The card never answers for the founder (problem 2)

- On the latest run, an unanswered card shows **no option checked**. `selected()` drops its final
  fallback to `options[recommended_index]` (`DayPage.tsx:303`). It returns the optimistic click,
  else the written decision, else `''`. Earlier runs are unchanged: they already show only the
  decision.
- The state line reads **"Not answered yet"** (`DailyReport.tsx:97`, drop `· recommended: {label}`).
  The read-only and `agent` wordings are unchanged.
- The recommended option keeps its existing `.d-rec` chip (`day.css:232`).
  `[FOUNDER DECISION: what the chip says. Recommended: the chip reads only "Recommended". When the fit is rated, it moves into "More info" as one row in the existing .d-moreinfo list, right after "Why recommended" (DailyReport.tsx:614-618): dt "Fit", dd "{n}%: how likely this fixes the real cause without breaking something else", which is the chip's current title text (:670), moved to where a phone can read it. When the fit is not rated there is no row, and "Fit not rated" appears nowhere. This reverses part of decisions.md 2026-10-06 point (1), which put Fit on every recommended option and chose "Fit not rated" over a made-up number, so it is your call. The no-invented-number half still holds: an unrated card shows no number at all. Alternative: keep "Recommended · Fit {n}%" on the chip when rated, and show only "Recommended" when not rated.]`
  With either answer, the `dim` variant goes, because "Fit not rated" is no longer shown on the
  chip.
- **Nothing about writing changes.** Clicking an option writes it (P1432). Clicking the recommended
  option now fires a normal change event, because it is no longer pre-checked. Accept & next still
  writes `options[recommended_index]` (`DayPage.tsx:629-655`, which reads the recommendation and
  not the selection). Number keys still pick (`:717-729`). Start fixing still never sends an
  unopened founder card (`lib/day.ts:1446-1449`, unchanged).

```
After (1440, card 1)
Urgent · 2 days open
○ Not answered yet
Replies waiting on your event post
Point A … / Obstacle … / Point B …
▶ More info              (opens: Why recommended · Fit 72%: how likely … · First seen …)
( ) I'll reply today  [Recommended]        1
( ) Agent drafts, you send                 2
( ) Park: stop asking until I bring it back 3
( ) Your answer or question…               4
```

### R3. Save where the story is typed (problem 3)

- Under the story box, "Not saved" becomes a row: the existing `<p className="d-unsaved"
  data-story-unsaved>Not saved</p>` text, followed by a **Save** button. The button uses
  `className="d-link d-tap"`, the class the same card already uses for its story actions "Send again"
  and "Mark done" (`ReflectionTab.tsx:262, 269`). It has `data-story-save` and the accessible name
  "Save your story". It is not a new component.
- Save performs the write the statement Accept performs today (`acceptStatement`,
  `DayPage.tsx:663-694`): one `storyAnswer(id, posOf(id), story)` line, the same draft rebase and
  cleanup, and the same double-click guard. It **does not move** to the next item. The founder
  watches "Not saved" turn into the story-state chip.
- **Accept leaves statements entirely.** `reflAccepting` and the statement branch of the bar's
  Accept go (`DayPage.tsx:590-591, 971, 973`). Save is the only story write. Positions are
  still written the moment they are picked (unchanged).
- Done's blocked text becomes "Save the edited story first: Done would close the version saved
  before." (`ReflectionTab.tsx:156`, one word changed).
- **The bar's "1 unsaved" safety net, replaced by an existing pattern.** Today, Start fixing with a
  custom answer that has no text refuses, says why, and opens that card (`DayPage.tsx:505-511`).
  Start fixing with an unsaved story now does the same thing. It sends nothing, opens the first
  statement with an unsaved story (Daily report tab, statements half), and shows the toast "Save
  your story first, or clear it". The draft itself is never lost (P1440 O1: drafts persist in
  localStorage).

```
After (statement, story typed)
│ Your story                                         │
│ [ Invented story: the last event felt like … ]     │
│ Not saved   Save                                   │
```

### R4. One primary, no dead controls (problem 4, P955)

- Accept loses its tint. `.d-nbtn.d-accept { background: var(--blue-50) }` (`day.css:266`) is
  deleted, so Accept looks exactly like Next (`.d-nbtn`, outlined). The only filled button in
  the bar is Start fixing / Send N changes (`.d-btn.primary`).
- P955's other rule is "no dead controls". Before a first send, when there is nothing to send
  (`sendCount === 0`), Start fixing and the copy icon are **not rendered**. Today they render
  disabled (`DayPage.tsx:1049, 1060`). The transient `disabled={busy}` while a send is in flight
  stays (that is a live state, not decoration). This cannot strand the agent panel's header: P1468
  F4 already makes the header name a button only when the button is on screen
  (`statusWords.ts:40-47`). With nothing to send, every agent row is sent, so the header reads
  "Sent to the fixing agent · k".

### R5. Phone chrome (problem 5)

- **The bar** (R1) is one row at 375 on a statement and on an answered card. It is two rows only
  when Accept is shown on an unanswered card. At 320 it may still be two rows: the pager (≈140px) plus
  Start fixing and the copy icon (≈135px) do not fit in about 244px of content width. ACs 4 and 5
  hold the budget.
- **The state line** is one line instead of two at 320 and 375 (R2 drops "· recommended: …").
- **The status line** at a container below 420px:
  `[FOUNDER DECISION: on phones, the "N new people" and "N unpushed commits" chips leave the status line and appear inside the Status panel that "▶ N worked" opens, so the line is only "✓ N worked  ✕ N didn't work" (at most 2 rows instead of 4 at 320). Recommended: yes. They are not status (P1463 round 3 says so in DailyReport.tsx:251-254) and they cost two of the four rows. At ≥420px nothing changes.]`
  The people box still opens from its chip, so it is one extra tap on a phone only. Neither is a
  problem, so the ≤1-click invariant is not touched.
- **The sticky header** at a container below 420px:
  `[FOUNDER DECISION: on phones the Day header (tabs + run switcher) scrolls away with the page instead of staying pinned, so the only pinned Day chrome while working the queue is the bottom bar. Recommended: yes. Switching tabs or runs is rare mid-queue, and the header is ≈97px of a 700px screen. At ≥420px it stays sticky. This reverses P1399's "keep the sticky header … short" (day.css:424), which is why it is the founder's call.]`
- **Not promised:** the card's options reaching the first screen at 320×700. That would need the
  card content itself to shrink, which P1468 fences ("Card content (Point A / Obstacle / Point B /
  options)") and this spec does not reopen. Promised instead: the card's **title** reaches the
  first screen at 320 and 375, and the first option reaches it at 375 when it fits (AC 6).
- The board's own header ("Clarity Kanban", search) is the board shell, not the Day page. It is
  out of scope.

### R6. The bar belongs to the queue (problem 6)

- **Stats:** no bottom bar. Nothing on Stats writes, sends or pages.
- **Monitoring:** the bar keeps only its action area (Start fixing / Send N changes / Sent… / the
  copy icon). Monitoring's budget raises and connection fixes feed Start fixing ("Added to Start
  fixing", `DayPage.tsx:355`), so the action belongs there. There is no pager (already true:
  `nav` is `null` off the Daily report) and no unsaved link (removed by R1).
- **Toasts** move out of the bar's subtree, so they still show on every tab, Stats included
  (`DayPage.tsx:934-951` renders them inside `.d-gbar` today).

```
After (1440)
card, unanswered:   ‹ Previous  1 of 8  Next ›  [Accept & next]                    [Start fixing] [⧉]
card, answered:     ‹ Previous  2 of 8  Next ›                                     [Start fixing] [⧉]
statement, any:     ‹ Previous  6 of 8  Next ›                                     [Start fixing] [⧉]
Monitoring:                                                                        [Start fixing] [⧉]
Stats:              (no bar)

After (375, card unanswered)        After (375, statement)
│ [‹] 1 of 8 [›] [Accept]       │    │ [‹] 6 of 8 [›]  [Start fixing][⧉] │
│              [Start fixing][⧉]│
```

## Predecessor Sections Superseded

| Section | P1468 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| What Stays the Same (line 249) | "The bottom bar's pager, Accept, `N still yours`, `N unsaved` (only the agent link leaves)." | Superseded | R1, R3. The pager and the card Accept stay. Still yours, unsaved and the statement Accept go. |
| Surfaces / Out of scope (line 271) | "**The bottom bar still switches between halves**: its progress text and key hint differ on cards (`N still yours`, `← → move`) and on statements (`n of m rated` with a bar, `1 2 3 rate · ← → move`). That switch stays as it is in this spec." | Superseded | R1, ACs 1-3 |
| UI Contract (line 289) | "Bottom bar: `{N} still yours` at every width (review fix F12: no short `yours: {N}` on a phone)." | Superseded | R1. No "still yours" in the bar. |
| What Stays the Same (line 246) | "Card content (Point A / Obstacle / Point B / options), the card's state line, folded answered cards." | Partially superseded | R2: only the state line's wording, the option's checked state and the `.d-rec` chip text change. Card content stays. |
| What Stays the Same (line 247) | "The position control, the story's save-on-Accept rule, "Not saved", the story-state chip, Earlier stories." | Partially superseded | R3: a story is saved by Save, not by Accept. "Not saved", the chip and Earlier stories stay. |
| AC 7b (line 305) | "… → story box (labelled `Your story`) → "Not saved" → chip …" | Extended | The "Not saved" position gains a Save button in the same row. The order is unchanged. |
| Before-diagram footers | `‹ 13 of 14 ›  2 of 2 rated ▬▬` | Superseded | R1 diagrams |

Earlier specs whose decisions this reverses, cited via the code that records them (their spec
files are not edited): P1440's statement Accept ("on Reflection, Accept is offered when there is
something to save", `DayPage.tsx:586-591`). P1449's key hint in the bar (`DayPage.tsx:1019`). P1399's
sticky phone header (`day.css:424`), only if the founder takes the R5 header default.

## Requirements

1. The bar renders the same slots on a card and on a statement: pager, Accept (unanswered founder
   card only), and the action area. It renders no progress text, progress bar, "still yours",
   "unsaved" link or key hint. (R1)
2. An unanswered card on the latest run has no checked option. Its state line reads "Not answered
   yet". The recommended option keeps one `.d-rec` chip, worded per the Fit founder decision. (R2)
3. A statement with an unsaved story shows "Not saved" and a Save button in one row. Save writes
   the story without paging. Statements never show Accept. Start fixing refuses while a story is
   unsaved and opens it. (R3)
4. Accept is styled like Next. The only filled button is the primary action. No disabled primary
   or copy button is rendered when there is nothing to send. (R4)
5. Phone budgets per R5 and ACs 4-6, plus the two founder decisions.
6. No bar on Stats. Monitoring keeps the action area only. Toasts show on every tab. (R6)

## Invariants

Carried forward from P1468 in full:

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

New in P1468:
- A typed story is never hidden or lost by the button: a box with text is always open.
- The board imports no product state (boundary test, `tools/kanban/server/__tests__/day.test.ts:1132`).
- Goals never render as an empty box: absent reads "not collected yet", failed or empty reads "No open goals found in docs/goals.md".
- One chat message is one card, and two messages never share a card.

New:
- A checked option means a written (or in-flight) founder answer, never a recommendation.
- A typed story is saved as it is typed (debounced, and on blur); nothing typed is ever left
  out of what Start fixing sends. Replaces P1440's explicit-click rule, removed with the founder's
  approval 2026-10-14 (see Founder Feedback F2).
- What Start fixing sends is unchanged by this spec. `collect` and `pendingPreselected`
  (`lib/day.ts`) have an empty `git diff`.
- The bar shows at most one status count, the pager's "k of N".

## What Stays the Same

- P1468's one list, one layout, `Stories` divider, list geometry (P1468 ACs 1-4, F2), the agent
  panel and its header copy (ACs 9, 9b), `+ Add a story` and the box-open rule, and Goals and Review
  notes on Stats.
- The folded list summary string and its rules (P1468 UI Contract line 287, AC 15).
- Card content (Point A / Obstacle / Point B / options / Park / custom answer), folded answered
  cards, read-only runs, and the `agent` state line wording.
- Accept & next on cards: what it writes, the double-click guard, moving on, crossing into
  statements after the last card (`DayPage.tsx:622-655`).
- What Start fixing sends, the prompt, the ledger, the decisions file, the launch and the copy flow
  (only the empty-state rendering and the unsaved-story refusal change).
- Keyboard behaviour: ← →, 1–9 on cards, 1 2 3 on statements.

## Surfaces in Scope

**In scope:**
- `tools/kanban/src/components/day/DayPage.tsx`: bar slots (R1), `selected()` (R2), statement
  Accept removed, Save handler, Start-fixing unsaved refusal (R3), empty-state rendering (R4), the
  bar per tab, the toast outside the bar (R6).
- `tools/kanban/src/components/day/DailyReport.tsx`: state line wording, the `.d-rec` chip, the Fit
  row in More info (R2), and the status line chips on narrow widths (R5, if the founder takes the
  default).
- `tools/kanban/src/components/day/ReflectionTab.tsx`: the "Not saved · Save" row, Done's blocked
  text, the position control's `title` / `aria-keyshortcuts` (R1, R3).
- `tools/kanban/src/components/day/day.css`: remove the progress, still and hint rules and the
  `.d-accept` tint. Bar grid without `prog`. Narrow status line and header (R5 founder decisions).
- `tools/kanban/e2e-day/day-page.spec.ts`: assertions that encode the removed chrome change, each
  citing P1471. Known sites: `:70` (`acceptBtn`), `:149` (`stillYours`), `:395`, `:528`, `:1133`,
  `:1149`, `:1162`, `:1413-1418`, `:1680-1690`, `:1813-1896`, `:2070`, `:2391`, `:2470-2527`, `:2714-2717`.
  Find the full set by grep, not from this list.
- `tools/kanban/src/components/day/statusWords.ts`: only if a word moves there (none is planned).

**Out of scope:** the board shell header and sidebar. `lib/day.ts` `collect` / `pendingPreselected` /
`cardState` / `statementRows` (no change). Card content and the `/day` card writer. The agent
panel. The Stats body. Monitoring content. CP product components and their tests. The P955 gate's
own fixture (`src/tests/p955-fixture.tsx`).

## Risks / Non-Goals

| Risk | Handling |
|------|----------|
| The founder relied on "N still yours" to jump to the next unanswered card | ACCEPT. The page opens on it (P1435) and Accept & next walks forward. The list reaches any card. Watch for the founder asking for it back. |
| An unsaved story is forgotten without the bar's reminder | MITIGATE. The list row says "Unsaved", "Not saved · Save" sits under the box, Start fixing refuses and opens it, and the draft persists (P1440 O1). |
| Without the pre-check, a founder clicks "Accept & next" without knowing which option it takes | MITIGATE. The "Recommended" chip marks it, and the button's `title` reads "Save the recommended answer" (`DayPage.tsx:971`). |
| Hiding the empty Start fixing leaves the bar's right side empty | ACCEPT. That is the honest state: nothing to send. P955: no decoration controls. |
| The 320px bar stays two rows | ACCEPT. Stated as the budget, not hidden. The header decision (R5) is what frees phone height while scrolling. |
| Non-goal | Making the options reach the first screen at 320 (needs card content to shrink). Changing what Accept, Save or Start fixing write. |

## Acceptance Criteria

**One footer, one count**
- [ ] 1. On a card (unanswered and answered) and on a statement (no draft, and story typed), at
  1440, 375 and 320: `[data-bottom-bar]` contains none of `[data-still-yours]`,
  `[data-unsaved-stories]`, `[data-progress]`, `.d-bline`, `.d-hint`. Its text contains no
  "still", "rated", "unsaved" or "move". The only digits in it are the pager's "k of N", plus "Send
  {N} changes" or "Sent to your terminal at HH:MM" when that is the action shown.
- [ ] 2. `[data-accept]` count is 0 on every statement (any state, any width). On an unanswered
  founder card it is 1. On an answered card it is 0.
- [ ] 3. Paging from the last card to the first statement leaves the bar's pager and action area
  at the same `x` and `width` (±1px) at 1440. This is the regression test for the switch P1468
  deferred. Run against today's code it fails (the progress area appears). Paste that failing run.

**Phone budget**
- [ ] 4. At 375×812, `[data-bottom-bar]` height is ≤64px on a statement and on an answered card,
  and ≤112px on an unanswered card.
- [ ] 5. At 320×700, `[data-bottom-bar]` height is ≤112px on every item.
- [ ] 6. On the e2e fixture's first card, on first load with no scroll: at 320×700 and at 375×812
  the card's `h2` lies wholly between the bottom of the last pinned element above it and the top of
  `[data-bottom-bar]`. At 375×812 the first `[data-option]` does too. If the founder declines the
  status-line decision, re-measure and record the result here instead of loosening the threshold
  silently.
- [ ] 7. (If the founder takes the status-line default.) At a container below 420px, the status line
  contains no `[data-people-chip]` and no unpushed-commits chip. Both are inside the opened Status
  panel, and the people chip there still opens `[data-people-box]`. At 320 the line is at most 2
  rows. At 1440 the line is unchanged.
- [ ] 8. (If the founder takes the header default.) At 375×812 and 320×700, after scrolling the
  queue 400px, `.d-topbar` is not in the viewport. At 1440 it stays pinned.

**The card**
- [ ] 9. On the latest run, an unanswered founder card has no `input[type=radio]:checked`. Its
  `[data-state]` text is exactly "Not answered yet". The recommended option has exactly one `.d-rec`
  chip. "Fit not rated" and "recommended:" occur nowhere on the page.
- [ ] 10. (Recommended default of the Fit decision.) With `recommendation_confidence` = 72 on a
  fixture card, the chip reads "Recommended" and the opened More info contains a row `Fit` / "72%:
  how likely this fixes the real cause without breaking something else". With it unset, there is no
  `Fit` row. If the founder picks the alternative, this AC becomes: the chip reads
  "Recommended · Fit 72%" when rated and "Recommended" when not.
- [ ] 11. Clicking the recommended option on an unanswered card writes exactly one option line
  (decisions file). The card then shows that radio checked and the state "Your answer · saved …".
  Accept & next still writes the recommended option and moves on (existing test, unchanged). An
  earlier, read-only run still shows only its decision.
- [ ] 12. `git diff` of `collect`, `pendingPreselected` and `cardState` in `tools/kanban/src/lib/day.ts`
  is empty. The existing `day.test.ts` cases for them pass unchanged.

**Save next to "Not saved"**
- [ ] 13. A statement with an unsaved story shows `[data-story-unsaved]` "Not saved" and
  `[data-story-save]` (accessible name "Save your story") in the same row, below the box.
  Clicking Save writes exactly one reflection line holding the position and the story. "Not saved"
  disappears, the open item does not change, and the story-state chip appears. A double click
  writes one line.
- [ ] 14. Typing a story then paging away writes nothing (existing invariant test still passes).
  Done's blocked text reads "Save the edited story first: Done would close the version saved before."
- [ ] 15. With one story unsaved, clicking Start fixing sends nothing (no start request). It opens
  that statement on the Daily report and shows the toast "Save your story first, or clear it". With
  none unsaved, Start fixing behaves as before (existing tests pass).

**One primary, no dead controls (P955)**
- [ ] 16. At 1440, 375 and 320, on every item, `[data-bottom-bar]` holds exactly one visible
  `.d-btn.primary`. `[data-accept]`'s computed `background-color` equals Next's.
- [ ] 17. On a fixture with nothing to send and no previous send, the bar renders no Start fixing
  button and no copy button (count 0, not disabled). `bash scripts/test-p955-ui-gate.sh` passes.
  That gate covers CP surfaces through its own fixture, not the board, so the Day page's two P955
  rules are proven by ACs 16-17, not by the gate.

**Tabs**
- [ ] 18. On Stats, `[data-bottom-bar]` count is 0 at every width, including with a story unsaved
  and with something to send. On Monitoring the bar shows the action area only: no pager, no
  `[data-accept]`. A toast raised on Monitoring (a budget raise: "Added to Start fixing") is
  visible, and a toast is visible on Stats when one is raised before switching there.

**Regression and quality**
- [ ] 19. P1468's ACs 1-4 (one layout, list geometry), 9 / 9b (agent panel and button count) and
  15's summary-string assertion still pass unchanged.
- [ ] 20. Visual QA at 1440, 375 and 320px by a separate subagent (screenshots only,
  `.claude/rules/visual-qa.md`): an unanswered card, an answered card, a statement without a draft,
  a statement with "Not saved · Save", Stats and Monitoring. No blockers.
- [ ] 21. `cd tools/kanban && npm test` passes. The Day e2e suite (`npx playwright test
  --config=playwright.day.config.ts`) passes, and every changed assertion cites P1471. The boundary
  test (`server/__tests__/day.test.ts:1132`) passes.
- [ ] 22. `npx eslint` on every changed `.ts`/`.tsx` file is clean, and `npx tsc --noEmit -p
  tools/kanban` is clean.

## Founder Feedback 2026-10-14 (added evidence, not yet designed)

Three founder reports from the 2026-10-14 run, filed here rather than as a second spec because
P1471 owns this surface. Screenshots: founder's 2026-10-14 14:40 captures (private screenshots
folder).

**F1. A typed story was silently left out of what was sent (confirms R3, raises its priority).**
The founder typed a story on the group-chat statement; the box read "Not saved" and the bar read
"1 unsaved", while the action area read "Sent to your terminal at 14:38". The prompt the terminal
received carried the position (Agree) and no story text. Mechanism, read 2026-10-14: the sent
state renders when `ok.lastSentAt && sendCount === 0` (`DayPage.tsx:1033-1037`), so an unsaved
story does not stop the bar from claiming everything went. R3's "Start fixing refuses while a
story is unsaved" closes the send path; the **sent label** must also not render while a story is
unsaved.

> "why not saved!?"

**F2. Autosave or explicit Save is reopened by the founder.**

> "I think it should be automatically saved or not. I mean, or not. I don't know. Like, what is the kiss here?"

**DECIDED by the founder 2026-10-14 ("yes to all"): save as you type** (debounced, plus on blur),
because the only failure ever observed is a lost story, never an unwanted one; drafts already
persist in localStorage (P1440 O1). This replaces the explicit-Save invariant (founder-approved
removal, see Invariants) and supersedes R3's Save button and the unsaved refusal: with nothing ever
unsaved, the bar can never claim "Sent" over a story that did not go.

Also reported, UNVERIFIED: clicking `+ Add a story` did not open the input until `Their story` was
clicked. The code opens the box on `adding` (`ReflectionTab.tsx:102-109`), so reproduce before
designing.

**F3. "Open card" lands in the agent list with no meaning attached.**

> "when I click on open card it just lands on sent to fixing agent ... sent in the past or sent in the future is it something i approve ... should they be commenting on it should they not should they be approving right now it's just confusing"

`Open card ›` routes to the pager or the agent list (`DailyReport.tsx:194-196, 318-324`). On the
agent list the founder cannot tell whether an item is already sent or pending, whether any action
is expected of him, or why several Status rows land on the same list. Each item the link opens
must say in plain words which of these it is ("The agent will fix this, nothing for you" or "Needs
your yes"), and the link must land on that item, not the list's top.

**F4. Two collapse controls for one job.** The Status panel folds with a text link `Collapse`
(`DailyReport.tsx:330-334`); its groups fold with a disclosure triangle (`▶ Worked (23)`).

> "not consistnet!?!"

Use one control. The triangle is the pattern already used for groups.

## Next Steps

- Has layout and visual-hierarchy changes (bar slots, phone budgets, two founder decisions on phone
  chrome) → run `/ux features/p1471_day_page_footer_and_card_declutter.md` once P1468 has shipped,
  then `/dev`.
- Build on top of shipped P1468, not on `main` before it lands. Every line reference above is to
  `294f92aa1`.
