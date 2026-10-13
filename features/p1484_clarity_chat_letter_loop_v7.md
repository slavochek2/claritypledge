---
status: in-progress
type: story
rank: 27
workstream: clarity-chat
created_date: '2026-10-14'
tags:
  - clarity-chat
  - prototype
  - letters
  - mental-model
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
---

# P1484: Clarity Chat letter loop v7 — the chat finds it, a thread builds it, the letter page answers it

> **Where it is built.** As P1469: the P1437 prototype (route `/tree/conversation-groups`,
> dev-only, mock data, no network writes) on the P1437 branch, shipping with P1437. This spec
> supersedes [P1469](p1469_clarity_chat_letter_loop_v6.md) where they disagree; P1469 rules not
> named here still hold.

## Problem

**Situation:** v6 (P1469) put the whole loop in chat: Bob builds the letter as agent cards in his
agent chat; Alice answers it as cards in the Bob-Alice DM, optional parts through the composer.

**Complication:** On 2026-10-13 the founder walked v6 ("this is very very bad"; the old letter flow
"was clean, step next next next"), and two emulated first-time users who never saw that critique
walked it too (A as Bob, B as Alice). They converge:

- After "Clarify" the only button was "Edit"; "Approve draft" appeared only after Bob both voted
  and guessed, unannounced. A: a real user "would probably NOT have finished"; B reached Send "by
  guessing". (A1, B3, founder 9)
- Seven gates, no counter; each approval re-posted a near-identical card, three on screen, old
  copies with live "Edit". (A3, founder 4, 7, 12)
- The agent wrote Bob's first-person story with a fact he never gave ("leave at four"). (A2)
- Alice was told she "joined by accepting the Clarity Partner Agreement" before accepting anything;
  her answers went through a composer whose placeholder flipped; a message she typed afterwards
  vanished. (B1, B2, founder 19, 21)
- Bob's result called her rating of his picture "Alice's confidence"; nothing told him she had
  answered. (B4, A9, A10, founder 18)

Both blind users found Alice's *sequence* clear; the *container* failed (chat shell, composer,
agreement line).

**Question:** Keep chat for finding the stuck moment and for the talk after the reveal; build Bob's
letter in one focused thread on the flagged card; give Alice the letter page, one step at a time,
from email or from the DM.

> Founder framing, verbatim (2026-10-13, spoken review of v6): *"It opens the thread and I'm now inside the thread and I can go back to the original conversation with my agent."*
>
> *"before it was like clean step next next next and here why do i need to chat with the agent when i receive the letter"*
>
> *"we need to reflect if we are in the right space"*

## The hypothesis v7 tests

**H-chat is retired.** P1469's H-chat assumed Alice answers in chat. The founder walk and both
blind walks show the chat container failed her (agreement line, composer answers, lost message)
while the step sequence worked. In v7 she answers nowhere in chat.

**H-thread (primary):** a result that lands in the Bob-Alice DM with "Reply to Alice" gets a reply
within 48 hours more often than an emailed result. Prototype check: does a blind Bob tap "Reply to
Alice" unprompted? Production check (later): DM replies vs "Start a clarity session". It applies
to Alice with an account; for email-Alice the reply reaches her as an email (decision 19).

**H-reason (secondary):** an optional box on the reveal that cites her number ("You gave 3. What
did Bob miss?") is answered more often than v6's separate optional step. Check: emulated walks of
v6 and v7, same persona.

## Appetite

- **Blast radius:** one prototype route, plus optional props on six production components, each
  defaulting to unchanged behaviour. No database, no network, no production layout change.
- **Reversibility:** git revert.
- **Decision density:** settled by the founder walk, the judge's synthesis and the orchestrator's
  amendments. Calls taken on the founder's behalf are marked **[TAKEN FOR FOUNDER — review]**; none
  blocks the build.

## Decisions

Copy for every decision is in the UI Contract; decisions state behaviour.

### Bob: start (agent chat)

1. **Agent identity.** "<name>, <Bob>'s mirror agent", or "<Bob>'s agent" unnamed (the fictional
   default); "Ask Mira" for the Ask action. No AGENT chip in the label, no name above each message,
   avatar on a run's first message only. "Name your agent" leaves the header (stays on Agents).
2. **Avatar = production's agent account:** `GravatarAvatar` `isAgent` (square, no ring, initials
   of the label's name; `gravatar-avatar.tsx:118`), no robot. P1483's navy is for banners only. The
   `icon` prop stays in production (tested) but v7 does not pass it.
3. **Flagged card:** source icon + conversation title (opens the source chat at the quote), the
   highlighted quote with its author, "2 more quotes" expanding in place, primary "Create a clarity
   letter" [TAKEN FOR FOUNDER — review], text button "Dismiss". The "From WhatsApp import" and "If
   you don't mean the same thing" lines go.
4. **Dismiss** folds the card in place ("Dismissed · Undo") until Bob leaves the agent chat; after
   that it lives in one row at the end, "Dismissed (n) ›", which expands. Nothing is pinned.
   Dismissed cards do not reopen by themselves in v7 [TAKEN FOR FOUNDER — review: "reopen on new
   messages" cut for tonight]; v6's dismiss reasons are cut [TAKEN FOR FOUNDER — review].
5. **The agent chat stays clean:** a build adds no message to it. The card becomes a status line
   updated in place (Draft · Step n of 4 / Sent / Alice answered / Completed / Not finished); tapping
   it opens the thread.

### Bob: build (the thread)

6. **One thread per letter, on its card** [TAKEN FOR FOUNDER — review: thread, not a page]: full
   screen on phone, right pane on desktop (the v6 channel-thread frame); `LetterProgressBar` with
   `label="Step n of 4"`; no composer.
7. **One live step.** Finished steps fold to one line with "Change", later steps are hidden.
   "Change" reopens a step with its answers; committing it returns to the first unfinished step.
   Blue only on the one primary and the live step's left edge. Leaving keeps the draft.
   `ComprehensionRatingCard` is uncontrolled after mount, so its React `key` includes its value:
   reopening a step or clearing a number remounts it with the current value (or none).
8. **The sticky button always names the next move and does something when tapped** (never
   `disabled`), for Bob and Alice alike: while an input is missing it names it and scrolls to it;
   when the step is complete it commits it.
9. **Position controls:** the presentational core (`shared/presentational/position-buttons.tsx`),
   not the CP wrapper, with a prototype in-memory `IntensityAdapter` (no localStorage, no `onEvent`,
   no `renderTutorial`, so no analytics and no tutorial mid-walk), `size="lg"`, and the new
   `alwaysLabelled`, whose labels wrap rather than overflow at 320.
10. **Step 1 · Point.** Agent question, the point in `LetterPointCard` (no `framingQuestion`: the
    agent already asks it) with a pencil, then the position row; then the agent asks for his guess
    with the same row, captioned, empty (P1469 decision 4). Sticky "n of 2 answered" bar, then "Use
    this point" (replaces "Approve draft").
11. **Sharpen is a link, not a gate.** Shown when the guess is within one step of his position;
    accepting replaces the point with `sharpenedPoint` and clears vote and guess. Ignoring keeps
    the point. Gone once step 1 is committed.
12. **Step 2 · Alice in your eyes.** Written when step 1 commits. Third person under "Alice in
    Bob's eyes · <guess>" via v6 `StakeQuoted`; the "Not quite her?" link opens the same inline
    editor as the pencil; the 0-10. One tap ("This is how I see Alice") approves and seals.
13. **Step 3 · Your story, only from his words** [TAKEN FOR FOUNDER — review]. One sentence per
    line. A sourced sentence is a light paraphrase of one of his messages; tapping its mark shows
    the exact line it came from [TAKEN FOR FOUNDER — review: paraphrase, not verbatim]. An inferred
    sentence is a dashed "My guess" he must Keep or Delete before the step commits. Then the 0-10
    and "This is my story".
14. **Editing clears the number** it affects. Pencil on hover or focus (desktop), always visible
    with a 40px target (phone), opens an inline editor (Save / Cancel). Saving a story clears its
    own number; Bob's typed text carries no mark. No "Edit" buttons anywhere. Messages keep the
    standard hover toolbar (as in channels and DMs).
15. **A point edit or sharpen** clears vote, guess and both numbers. Step 2 keeps Bob's eyes text
    (the agent never overwrites it) and is marked "Check again", with the agent's link "Rewrite for
    the new point" [TAKEN FOR FOUNDER — review]. **Changing the guess** clears step 2's number and
    marks it "Check again" (P1469 decision 23).
16. **Step 4 · Check and send.** Folded rows with "Change"; her quote, included by default, with
    Remove / Add back [TAKEN FOR FOUNDER — review]; the four-line "What Alice sees, and when"; the
    link "See it as Alice will ›" opens her page under `LetterPreviewBanner` with "Close preview",
    playable on a throwaway copy. Primary "Send to Alice" with a delivery sub-line (decision 19).
    An open letter to her shows v6's open-letter line and "Open existing letter" instead (one open
    letter per pair, P1469).

### Send

17. **Sent.** The thread shows the sent line and folds to its result area; the card line becomes
    Sent with `LetterStatusBadge`.
18. **The letter is one message in the Bob-Alice DM timeline**, inserted at send time, so anything
    either person types later renders after it as a bubble for both (fixes B1). The "joined by
    accepting the Clarity Partner Agreement" line leaves the Bob-Alice DM; group channels keep it.
19. **Alice's account sets Bob's delivery copy** [TAKEN FOR FOUNDER — review]. The strip's two
    Alice views are lenses on one letter; Bob's copy follows the last one chosen (default "Alice
    (email)" = no account): sub-line "By email", v6's sent line, and "Alice gets an email that you
    replied." under "Reply to Alice". With an account: "In your chat with Alice", "Sent. It's in
    your chat with Alice.", no reply sub-line.

### Alice

20. **From email: the letter page, no chat** — no sidebar, chat, composer, agent, agreement line or
    agent offer [TAKEN FOR FOUNDER — review: no upsell]. Compact `LetterCover` with v6's privacy
    line and "Open the Letter". `LetterProgressBar` `label="Step n of 3"` on each of the three
    steps, matching the cover's "3 steps"; the send screen reads "Ready to send" instead
    [TAKEN FOR FOUNDER — review].
21. **Step 1:** her own quote (name, day, time) under "From your chat with Bob" if Bob kept it;
    the point; the position row (decision 9); sticky "Pick your position ↑", then "Lock in your
    position"; `LetterRevealOrdinal` (her and Bob only; no guess before her lock); sticky "Continue".
22. **Step 2:** "Alice in Bob's eyes · <guess>" with P1469's neutral line; the 0-10 with sticky
    "Pick a number ↑", then "Continue". After the commit the rating row is replaced by a one-line
    receipt "You gave N" [TAKEN FOR FOUNDER — review], then `CalibrationVerdict` (`isReverseStory`)
    + `LetterRevealNumeric`, then the note box "You gave N. What did Bob miss?" with "Only visible
    to you". Sticky reads "Skip and continue" while empty, "Save and continue" once typed. Replaces
    "No thanks". Typing only: no mic on either box in v7 [TAKEN FOR FOUNDER — review]. (H-reason)
23. **Step 3:** Bob's story (`LiveStoryCardExpanded`, `hideEarsBadge`), 0-10 (same sticky), receipt,
    `CalibrationVerdict` + `LetterRevealNumeric`, the optional explain-back box with its one-line
    reason. Same sticky rule.
24. **Reveals stay per step**, as production does; a revealed rating is final [TAKEN FOR FOUNDER —
    review].
25. **Send screen** ("Ready to send"): what Bob will see (variant when both notes were skipped); her
    position and two ratings locked, each note with "Change"; "Send to Bob". Nothing reaches Bob
    before it.
26. **Ending:** `LetterCompletionSummary` with `actions` = the sent line. No agent offer.
27. **Already a user** [TAKEN FOR FOUNDER — review: H-chat → H-thread]: her DM holds ONE message
    from Bob (compact cover; then a "Step n of 3" line; then a Completed badge). It opens the same
    page full-frame with "‹ Bob". Her composer is plain chat.

### Bob: result and after

28. **Signals, live:** unread dot on the DM row and the agent-chat row, card line "Alice answered",
    DM badge "Completed". Opening clears the dot.
29. **The result opens in the thread:** one of four headlines (her distance from Bob vs his
    guess's); rows You / Your guess / Alice in production's short labels (`POSITION_SHORT_LABELS`,
    e.g. "Somewhat Disagree"); per story `CalibrationVerdict` `perspective="sender"`; her notes under
    their story, or the no-notes line; never "confidence". "Reply to Alice" opens the DM with the
    letter quoted above the composer (with decision 19's sub-line); "Full result ›" opens My card ·
    Alice at the letter's Journey entry.
30. **After:** the agent chat keeps one Completed line; the DM keeps one letter message that opens
    the same result; My card's Journey entry (P1469 decision 16) is relabelled via the new
    `JourneyToUnderstanding` label props.
31. **Not finished (amendment 1):** "Skip 14 days" turns every sent or opened, uncompleted letter
    into "Not finished" [TAKEN FOR FOUNDER — review: v6 did opened only]: her answers discarded
    unshared, pair lock released, Bob's card line and DM badge say so, his thread offers "Start a
    new letter", her page says the letter is closed.

### Shell

32. **Prototype strip:** a grey "PROTOTYPE" band above the app frame, text labels at every width
    (wrapping at 320): View as (radios "Bob", "Alice (email)", "Alice (in app)"), Skip 14 days,
    Reset (clears the run in place), in S5 Signed in / Signed out. Every header loses `ViewAs`.
33. **No rail** [TAKEN FOR FOUNDER — review]. `SpacesRail` goes; a filter row tops Bob's chat list
    (All / ClarityPledge / WhatsApp / Telegram; "All" marks network chats with their icon). Chips
    keep the rail's accessible names ("WhatsApp via Beeper", …). Alice has no row.
34. **Menu (amendment 4, S5, the last slice and droppable if time runs out)** [TAKEN FOR FOUNDER —
    review: droppable]: above the filter row, production's signed-in items in `bottom-nav.tsx`
    order. Letters opens a prototype Letters page with production's tab labels [TAKEN FOR FOUNDER —
    review: the amendment said Sent / Received] and `LetterStatusBadge` rows that open Bob's thread
    or Alice's page; other items open a quiet frame naming their route. Signed out:
    `PUBLIC_NAV_GROUPS` and the three account actions, main pane on the Feed frame. P1462 owns the
    real menu.
35. **One 0-10 control:** `ComprehensionRatingCard` with the new `hideSubmit` (the sticky commits)
    and its existing `highLabel` set to "Complete understanding" (the reveal's own end label)
    [TAKEN FOR FOUNDER — review]. One row of 11, 44px tall, 10 rightmost, at every width.
    `WrapRatings` is deleted.
36. **Real mode** (`?real=1`, amendment 2): same loader, agent "Mira". New optional `RealCase.ownParts`
    (text + index of the founder's own line); without it `ownStory` is split into sentences, each a
    "My guess". No real content in any tracked file, test, commit or review prompt.
37. **Privacy (P1469, binding):** "Only visible to you" until "Send to Bob"; Bob sees status only
    until then; Alice never sees Bob's agent chat, his imported history beyond the one quote he
    sends, his WhatsApp space or his My card.

## UI Contract

### Production strings reused verbatim

| Where | Copy | Source |
|---|---|---|
| Bob step 1, Alice step 1 | "To what extent do you agree?" | `letter-flow-content.tsx:720` |
| Alice step 1 | "Lock in your position" · "Where you each stand" | `letter-flow-content.tsx:758`; `letter-reveal-ordinal.tsx` |
| Bob step 3 | "How well do you believe Alice understands your intended meaning behind your story?" | `letter-prediction-walk.tsx:116` |
| Alice step 2 | "How well do you believe this story represents your intended meaning?" | `letter-flow-content.tsx:927` |
| Alice step 3 | "How well do you believe you understand Bob's intended meaning behind their story?" | `letter-flow-content.tsx:928` |
| Alice, sticky after a pick | "Continue" | `letter-flow-content.tsx:938` |
| Scale ends | "Not at all" / "Complete understanding" | `letter-reveal-numeric.tsx:215` |
| Reveals | "Before you answered, Bob estimated you would rate their capture of your meaning at a N." · "…you understood their intended meaning at a N." · "N-point gap" · "Perfectly calibrated" | `calibration-verdict.tsx` |
| Alice step 3 | "Explain back what you understood" | `letter-flow-content.tsx:1059` |
| Cover | "Open the Letter" · "2 chapters · 3 steps · ~3 minutes" | `letter-cover.tsx:143` |
| Ending | "Your answers are on their way to Bob." | `letter-completion-summary.tsx` |
| Preview | "THIS IS A PREVIEW — The receiver will see this" | `letter-preview-banner.tsx` |
| Badges | "Sent" · "Opened" · "Completed" | `letter-status-badge.tsx` |
| Position labels | "Agree", "Somewhat Disagree", … | `utils/position-labels.ts` (`POSITION_SHORT_LABELS`) |
| Letters tabs (S5) | "Inbox" · "Drafts" · "Published" | `letters-page.tsx` |
| Menu (S5) | Home, Letters, Partners, Groups, My Profile; Use cases / Product / Learn; "Take the Pledge", "Log In", "Create Account" | `bottom-nav.tsx`, `nav-links.ts`, `navigation-menu-items.tsx` |

Kept from v6 (`letter.tsx` LETTER_LINES, `mock-data.ts` AGENT_LINES, `ui.tsx`): "Your answers stay
private until you send them to Bob." · "Bob's guess before you answered, and why he thought so." ·
"Send to Bob" · "Bob will see your position, your two ratings and your answers." · "This letter is
closed." · "Alice didn't finish. You can send a new letter." · "Sent to Alice by email. It's in your
chat with Alice." · "I found 2 stuck conversations" · "Only visible to you" / "Shared with Bob" ·
"Alice has an open letter." · "Open existing letter".

### New copy, per screen (all [NEW COPY])

**Agent chat:** "<name>, Bob's mirror agent" / "Bob's agent" · "Ask Mira" / "Ask Bob's agent" ·
"2 more quotes ▾" · "Create a clarity letter" · "Dismiss" · "Dismissed · Undo" · "Dismissed (n) ›"
· card lines "Letter to Alice · Draft · Step n of 4 ›", "· Sent ›", "· Alice answered ›",
"· Completed ›", "· Not finished ›".

**Thread:** "Letter to Alice" · "Step n of 4" · "You two seem stuck on this." · "Where do you think
Alice stands?" · "Your guess" · "n of 2 answered" · "Answer the next one ↓" · "Use this point" ·
"Alice may be close to you here. Sharpen the point?" · "Here's how I think Alice sees it, from her
messages. Fix anything that's off." · "Not quite her? Tell us what to change" · "How well will Alice
say this captures her meaning?" · "Pick a number ↑" · "This is how I see Alice" · "Check again" ·
"Rewrite for the new point" · "Your side, only from what you wrote. Is this you?" · "You wrote:
'<exact line>'" · "My guess" · "Keep" · "Delete" · "n guesses to check ↑" / "1 guess to check ↑" ·
"This is my story" · "Save" · "Cancel" · "Finish editing ↑" · "Change" · "Point · You: <label>" ·
"Alice in your eyes · N" · "Your story · N" · "From your chat: '<line>'" · "Remove" · "Her message
is not included" · "Add back" · "What Alice sees, and when" · the four lines: "1 The point. She
answers first." "2 Where you each stand." "3 Your guess and Alice in your eyes. She rates it, then
sees your N." "4 Your story. She rates it, then sees your N." · "See it as Alice will ›" · "Close
preview" · "Send to Alice" · sub-line "By email" / "In your chat with Alice" · "Sent. It's in your
chat with Alice." · "Start a new letter".

**Result (thread):** headlines "Alice stands further from you than you guessed." / "You guessed
where Alice stands." / "Alice stands closer to you than you guessed." / "Alice stands as far from
you as you guessed, on the other side." · "You" · "Your guess" · "Alice in your eyes" · "Your story"
· "You predicted N · Alice rated M" · "Alice added no notes." · "Reply to Alice" · "Alice gets an
email that you replied." · "Full result ›".

**Alice's page:** "Step n of 3" · "Ready to send" · "From your chat with Bob" · "Bob's point" ·
"Pick your position ↑" · "Pick a number ↑" · "You gave N" · "You gave N. What did Bob miss?" ·
"Explain back what you understood (optional)" · "Bob learns which parts landed." · "Skip and
continue" · "Save and continue" · "Bob will see your position and your two ratings. You added no
notes." · row labels "Your position", "Alice in Bob's eyes · you gave N", "What Bob missed", "Bob's
story · you gave N", "Your explanation" · "Sent. Bob sees your answers now." · in-app: "Letter from
Bob · Step n of 3 ›" · "‹ Bob".

**Strip and frames:** "PROTOTYPE" · "View as:" · "Bob" · "Alice (email)" · "Alice (in app)" · "Skip
14 days" · "14 days later." · "14 days later. No open letters." · "Reset" · "Back to the start" ·
"Signed in" · "Signed out" · "No letter from Bob yet. Send one as Bob first." · filter "All ·
ClarityPledge · WhatsApp · Telegram" · quiet frame "In the app this is <route>." · "Letter to
<name>" / "Letter from <name>".

### Phone wireframes (375)

```
1 AGENT CHAT
┌──────────────────────────────────────┐
│ ☰ (BA) Bob's agent                   │
│ (BA) I found 2 stuck conversations   │
│ ┌──────────────────────────────────┐ │
│ │ [WA] Mum's birthday ›            │ │
│ │ ▌Alice: "You always try."        │ │
│ │ 2 more quotes ▾                  │ │
│ │ [Create a clarity letter] Dismiss│ │
│ └──────────────────────────────────┘ │
│ #launch · Letter to Priya ·          │
│   Draft · Step 2 of 4 ›              │
│ Dismissed (1) ›                      │
└──────────────────────────────────────┘
2 THREAD · STEP 1
┌──────────────────────────────────────┐
│ ‹  Letter to Alice              [WA] │
│ ▰▱▱▱ Step 1 of 4                     │
│ (BA) You two seem stuck on this.     │
│      To what extent do you agree?    │
│ │ Showing up briefly counts as     ✎ │
│ │ being there for family.            │
│ [ Disagree ][ Unsure ][ ● Agree    ] │
│ (BA) Where do you think Alice stands?│
│ Your guess                           │
│ [ Disagree ][ Unsure ][   Agree    ] │
├──────────────────────────────────────┤
│ 1 of 2 answered                      │
│ [     Answer the next one ↓      ]   │
└──────────────────────────────────────┘
3 THREAD · STEP 4
┌──────────────────────────────────────┐
│ ‹  Letter to Alice              [WA] │
│ ▰▰▰▰ Step 4 of 4                     │
│ ✓ Point · You: Agree         Change  │
│ ✓ Alice in your eyes · 7     Change  │
│ ✓ Your story · 6             Change  │
│ From your chat: "You always try."    │
│                              Remove  │
│ WHAT ALICE SEES, AND WHEN            │
│ 1 The point. She answers first.      │
│ 2 Where you each stand.              │
│ 3 Your guess and Alice in your eyes. │
│   She rates it, then sees your 7.    │
│ 4 Your story. She rates it, then     │
│   sees your 6.                       │
│ See it as Alice will ›               │
├──────────────────────────────────────┤
│ [          Send to Alice         ]   │
│               By email               │
└──────────────────────────────────────┘
4 ALICE · STEP 2, AFTER HER RATING (page, no chat)
┌──────────────────────────────────────┐
│ Letter from Bob    Step 2 of 3 ▰▰▱   │
│ ALICE IN BOB'S EYES · Somewhat dis.  │
│ "In Bob's eyes, Alice watches how    │
│  he leaves, not how long he stays."  │
│ You gave 3                           │
│ 4-point gap                          │
│ Before you answered, Bob estimated   │
│ you would rate ... at a 7.           │
│ You 3 ━━━━━━━━━━━━ Bob 7             │
│ You gave 3. What did Bob miss?       │
│ [ optional                         ] │
│ Only visible to you                  │
├──────────────────────────────────────┤
│ [       Skip and continue        ]   │
└──────────────────────────────────────┘
5 BOB · RESULT (thread; Alice has no account)
┌──────────────────────────────────────┐
│ ‹  Letter to Alice       Completed   │
│ Alice stands further from you than   │
│ you guessed.                         │
│ WHERE YOU EACH STAND                 │
│ You · Agree                          │
│ Your guess · Somewhat Disagree       │
│ Alice · Disagree                     │
│ Alice in your eyes       4-point gap │
│ You predicted 7 · Alice rated 3      │
│ "It's the train time that decides…"  │
│ Your story               2-point gap │
│ You predicted 6 · Alice rated 8      │
├──────────────────────────────────────┤
│ [         Reply to Alice         ]   │
│ Alice gets an email that you replied.│
│            Full result ›             │
└──────────────────────────────────────┘
```

## What is reused, added, new and removed

**Production, reused as is** (`src/app/components/` unless noted): `letters/` letter-cover,
-point-card, -progress-bar, -reveal-card, -reveal-ordinal, -reveal-numeric, -primary-cta,
-preview-banner, -status-badge; `shared/presentational/position-buttons` (the core, with a prototype
`IntensityAdapter`; the CP wrapper `shared/PositionButton` is not used, see decision 9);
`shared/fixed-bottom-bar` (the thread passes `className="sticky"`, which tailwind-merge puts in
place of `fixed`); `src/components/ui/gravatar-avatar`; `layout/nav-links.ts`.

**Optional props (absent = today's behaviour, each with a default-unchanged test):**

| Component | Prop | Default |
|---|---|---|
| `shared/presentational/position-buttons.tsx` (core only) | `alwaysLabelled?: boolean` — ignore `ICON_ONLY_THRESHOLD`, let labels wrap | `false` |
| `shared/comprehension-rating-card.tsx` | `hideSubmit?: boolean` — no Continue button; `onSelectionChange` drives the host | `false` |
| `letters/calibration-verdict.tsx` | `perspective?: 'reader' \| 'sender'`, `readerName?`, `readerRating?` — sender line "You predicted N · <name> rated M" under the same badge | `'reader'` |
| `letters/letter-completion-summary.tsx` | `actions?: ReactNode` — replaces the two links | the two links |
| `partners/live-story-card-expanded.tsx` | `hideEarsBadge?: boolean` | `false` |
| `partners/live-mode-view.tsx` `JourneyToUnderstanding` | `checkerLabel?`, `responderLabel?` | "Your belief", "<name>'s confidence" |

**Prototype code, new** (`src/app/prototypes/conversation-groups/`): `prototype-strip.tsx`
(`PrototypeBar`), `proto-intensity.ts` (the in-memory `IntensityAdapter`), `letter-thread.tsx`
(`LetterThread`, folded row, live step, sticky step button, inline editor, `SourcedStory`,
when-list, result), `alice-letter-page.tsx` (`AliceLetterPage`, email and in-app, preview mode),
`space-filter.tsx`, and in S5 `app-menu.tsx` and `letters-page.tsx` (prototype).
`letter-review/chat-kit.tsx`: `ChatShell` gains optional `strip?: ReactNode` (default unchanged).
The v6 channel-thread `<section aria-label="Thread">` frame moves to `ui.tsx` as `SidePanel`, used
by channel threads and `LetterThread`.

**State** (`letter-state.ts`): Draft gains `ownParts: {text, sourceLineId | null, kept: boolean |
null}[]`, `includeQuote`, `eyesCheckAgain`, `reopened: 1|2|3|null`; approvals merge into the commit
actions; sharpen no longer blocks; letter gains `quote` and `notes` editable until send;
`skip14Days` covers `sent`. Shared state: `unread` per row; `Who` grows to `'me' | 'herEmail' |
'herApp'`, plus `aliceMode` (the last Alice lens, decision 19); the sessionStorage key becomes
`p1484-v7-prototype` (`-real` in real mode) so a v6 run never loads into v7. Fixtures
(`mock-data.ts`): `ownParts` per case. Alice: three paraphrased sentences sourced from f2 ("Work is
insane"), f4 ("I came at Easter") and f6 ("The train was at 4!"), and two "My guess" sentences; the
v6 `ownStory` line "it isn't the train", which contradicts f6, is dropped. Alice's flag `lineIds`
are reordered so the highlighted quote is hers ("You always try.").

**v6, deleted:** in `mirror.tsx` `PointStep`, `SharpenStep`, `StoryStep`, `PreviewStep`,
`SealBlock`, `Sealed`, `PrivateLabel` and the editing composer; in `letter.tsx` `AliceLetter`,
`QuestionStep`, `SendStep`, `AgentOffer`, `BobResults` and the composer-answers path
(`pendingQuestion`, `answerQuestion`, `draftKey`); `SpacesRail`; `ViewAs`, `ResetData`, `SkipDays`,
`WrapRatings`; `DISMISS_REASONS`; `AGENT_LINES.sealNote`, `.exposure`, `.ifNotSame`; the header's
"Name your agent"; the pair-DM agreement line. Kept: shell, sidebar, WhatsApp skin, Ask, channel
threads, My card, real-case loader, `?variants=` pages.

## Build slices

Each slice ends green (new tests, surviving v6 suites, production tests importing a touched
production file) and is its own commit. **Rule: a v6 test that asserts behaviour a v7 decision
replaces, or that drives the v6 build helpers (`clarify`, `toEyesStep`, `toPreview`,
`sendByEmail`, `railNames`, the `Preview as` radios, the v6 store key or Draft shape), is deleted or
rewritten in that slice and named in the commit message.** The lists below were made by grepping
every v6 suite (line numbers at w7 `c25f12d97`).

**S1 · Strip, identity, filter.** `prototype-strip.tsx`, `chat-kit.tsx` (`strip`), `ui.tsx`,
`shared.ts` (`agentLabel`, `agentShort`, `Who`), `space-filter.tsx`, and `ViewAs` removed from
`mirror.tsx`, `ConversationGroupsPrototype.tsx`, `agents.tsx:84`, `my-card.tsx:163`, `spaces.tsx:93`.
Tests `p1437-v7-shell.test.tsx`: strip above the frame, text labels at every width; no `ViewAs` in
any header; label named / unnamed / real shape; avatar has `data-agent` and initials, no robot;
filter row and "All"; Alice has no row; Reset in place with toast.
- Rewrite: the `asAlice`/`asBob` helpers in v6-alice, -bob, -fixes, -my-card, -spaces (strip radios
  "Alice (in app)" / "Bob"); "Ask Agent" → "Ask Bob's agent" in v6-bob 117, 181, 193, 219 and
  v6-spaces 100, 125; v6-spaces 166 (no `railNames`: assert Alice has no filter row).
- Delete: v6-bob 94, 562; v6-review-fixes 162; v6-spaces 41, 72, 153.

**S2 · Bob's thread, steps 1-4, send (state only).** `letter-thread.tsx`, `proto-intensity.ts`,
`letter-state.ts`, `flow.ts`, `mirror.tsx` (card, dismiss, status line), `mock-data.ts`; props
`alwaysLabelled`, `hideSubmit`. Tests `p1437-v7-thread.test.tsx`: no agent-chat message during a
build; one live step, folded rows, "Change" (remounted rating shows the current value); a sticky
label for every missing input, every button acting when tapped; empty guess; non-blocking sharpen;
story marks show the exact source line, Keep/Delete; story edit clears its number; point edit and
guess change mark step 2 "Check again" and keep its text; quote Remove/Add back; send adds one item
to `letters[herId]` (the DM message is S3); "Dismissed (n)"; reload mid-typing still delivers.
`p1437-v7-letter-state.test.ts` replaces `p1437-v6-letter-state.test.ts` whole (its `ready`/`sent`
helpers call the removed approvals), porting the letter rules at v6 lines 173-276 (not 287, which v7 reverses).
- Rewrite: all surviving suites read the store key via `PROTO_STORE` instead of the literal
  `'p1469-v6-prototype'` (v6-alice, -bob, -fixes, -my-card, -review-fixes); v6-bob 219 ("Clarify" →
  "Create a clarity letter"); v6-my-card 99, 108 (`unsent()` builds a v7 Draft); letter fields new in v7 are optional so v6 seeds still load.
- Delete: v6-alice 163, 399 (Bob's v6 preview step); v6-bob 129, 155, 251, 286, 322, 349, 376, 391, 413, 443, 466, 475, 501, 517, 541
  (`sendByEmail`; Alice's sidebar is re-asserted in v7-alice); v6-fixes 91; v6-review-fixes 47, 62,
  76 (ported to v7-thread), 175; `p1437-v6-letter-state.test.ts`.

**S3 · Alice's page, email and in-app; the DM message.** `alice-letter-page.tsx`, `letter.tsx` (DM
message), `ConversationGroupsPrototype.tsx` (viewer modes, DM timeline, agreement line), the
preview link of step 4; props `hideEarsBadge`, `actions`. Tests `p1437-v7-alice.test.tsx`: email
mode has no sidebar, composer, agent or agreement text; table-driven check of every reused UI
Contract string; "Step n of 3", then "Ready to send"; her quote above the point; Bob's guess absent
from the DOM before the lock; Alice's sticky labels before each pick; receipt "You gave N"; Skip ↔
Save; both send-line variants; notes editable, ratings locked; Bob sees status only until "Send to
Bob"; send puts one message in the DM timeline; in-app DM holds one letter message and her typed
message is a bubble for both; the preview sends nothing; no tutorial modal after 6 position picks.
- Rewrite: v6-fixes 47 (no agreement line in the pair DM, a channel keeps it); v6-review-fixes 128
  (seed a completed letter instead of tapping "No thanks"); v6-my-card 161 (complete through
  `AliceLetterPage`).
- Delete: `p1437-v6-alice.test.tsx` whole; v6-fixes 85; v6-review-fixes 151.

**S4 · Result, signals, after, Not finished.** `letter-thread.tsx` (result), sidebar unread,
`my-card.tsx`, `letter-state.ts` (`skip14Days`); props `perspective`, Journey labels. Tests
`p1437-v7-result.test.tsx`: dots appear on her Send and clear on open; "Alice answered"; all four
headlines from fixtures; short position labels; "You predicted N · Alice rated M"; no "confidence"
on Bob's side; no-notes line; "Reply to Alice" opens the DM with the quote, and its sub-line shows
only in the email lens; "Full result ›" opens My card at the entry; Skip 14 days on sent and on
opened letters, then "Start a new letter"; a completed letter untouched.
- Rewrite: v6-my-card 134 (new labels).

**S5 · Menu in the prototype (last; droppable if time runs out).** `app-menu.tsx`, prototype
`letters-page.tsx`, sidebar, strip switch. Tests `p1437-v7-menu.test.tsx`: signed-in items in
`bottom-nav` order above the filter; Letters tabs and badges; other items open frames naming their
route; signed out shows `PUBLIC_NAV_GROUPS`, the three account actions and no chats; no menu item
shows the "Not part of this prototype" toast (other mocks, e.g. v6-review-fixes 119's Search and New
channel, keep theirs). Retires nothing.

## Risks

| Risk | Label | Note |
|---|---|---|
| On phone the thread is a page in chat clothes | ACCEPT | The founder asked for a thread; on desktop it is a pane |
| Sourced-only stories run thin | MITIGATE | "My guess" sentences Bob keeps; his own edits |
| A paraphrased "sourced" sentence drifts from what Bob meant | MITIGATE | The mark shows the exact line; the pencil edits |
| One tap approves and seals: Bob may rate unread | ACCEPT | The number sits directly under the text it rates; editing clears it |
| Her own quote breaks "Alice never sees Bob's imports" | MITIGATE | Only her own line, listed with Remove before Bob sends |
| "My guess" checks add a tap each | ACCEPT | Measured; the alternative is signing words he never wrote (A2) |
| Real-mode stories have no sources | MITIGATE | Every unsourced sentence is "My guess" (decision 36) |
| Email-Alice cannot read a DM reply | MITIGATE | Bob is told she gets an email (decision 19); building that email is P1456 |
| No mic on the note boxes: H-reason is tested by typing only | DEFER | The box, not the voice, is the variable; voice returns when H-reason is measured |
| Prototype position control lacks the intensity tutorial | ACCEPT | Production behaviour unchanged; the prototype avoids a modal mid-walk (decision 9) |
| Confetti on Alice's ending (production behaviour) | ACCEPT | Production fidelity; P1469's no-confetti rule was about Bob's record |

## Non-Goals

- Do NOT change any production page layout, route or default; production components get only the
  optional props listed above.
- Do NOT add network calls, writes, analytics events or storage beyond the prototype's sessionStorage
  (hence the prototype `IntensityAdapter`, decision 9).
- Do NOT show email-Alice a chat, a composer, an agent, an agreement line or an upsell.
- Do NOT pre-fill Bob's guess, and do NOT show it to Alice before her position is locked.
- Do NOT let any answer of hers reach Bob before "Send to Bob".
- Do NOT add messages to the agent chat during a build.
- Do NOT build detection, imports, Beeper sending, WhatsApp or reply-email delivery, a mic on the
  note boxes, dismissed-card reopening, or the real menu.
- Do NOT put real-case content in any tracked file, test, commit or review prompt, and do NOT read
  `.local/` in any test or review.

## Acceptance Criteria

- [ ] The agent chat card shows a source icon, one quote with its author, "2 more quotes" (expands)
      and "Create a clarity letter", and no other sentence; Dismiss folds it to "Dismissed · Undo",
      and after leaving and returning it sits under "Dismissed (1)", where Undo restores it.
- [ ] The agent reads "Bob's agent" with a square avatar showing initials; its name is not repeated
      above each message.
- [ ] "Create a clarity letter" opens a full-screen thread at 375 and a right pane at 1440; the
      agent chat gains no message while Bob builds.
- [ ] Every build screen shows "Step n of 4" and one primary button, and every button on it does
      something visible when tapped.
- [ ] After Bob's position, the agent asks "Where do you think Alice stands?" with the same
      three-button control, empty, labels readable without overflow at 320 and 375; a close guess
      adds "Sharpen the point?" as a link, and "Use this point" works without it.
- [ ] No "Edit" button exists; a pencil shows on hover at 1440 and as a visible icon at 375.
- [ ] A finished step is one line with "Change", which reopens it showing the earlier answer and number.
- [ ] Editing a story empties its 0-10 row; editing the point or changing the guess marks "Alice in
      your eyes" "Check again", keeps its text and empties its number.
- [ ] Each sentence of Bob's story either shows the exact line it came from on tap or is a "My guess"
      that must be kept or deleted before "This is my story" commits.
- [ ] Every 0-10 is one row, 10 at the right end, buttons at least 40px tall, at 320, 375 and 1440.
- [ ] Step 4 lists what Alice sees and when, with her guess-reveal on line 3; "See it as Alice will"
      shows her page under the preview banner and sends nothing.
- [ ] As "Alice (email)", no sidebar, chat, composer, agent or agreement text appears at any step,
      and no tutorial pops up.
- [ ] Alice's first step shows her own message (name, day, time) above Bob's point; her three steps
      show "Step n of 3", matching the cover's "3 steps", and the send screen shows "Ready to send".
- [ ] Before each of Alice's picks the sticky button says what to pick ("Pick your position ↑",
      "Pick a number ↑") and scrolls to it; after her rating the row is replaced by "You gave N".
- [ ] "What did Bob miss?" is a visible box citing her number; the button reads "Skip and continue"
      until she types, then "Save and continue".
- [ ] The send screen says what Bob will see, including "You added no notes." when she skipped both;
      after "Send to Bob" the ending appears.
- [ ] Bob sees none of her answers before she sends; then, without a reload, an unread dot and
      "Alice answered" appear.
- [ ] Bob's result shows a headline, his guess beside her position in the app's labels and "You
      predicted N · Alice rated M" per story; the word "confidence" appears nowhere on his side.
- [ ] "Reply to Alice" opens the DM with the letter quoted; in the email lens it reads "Alice gets an
      email that you replied." "Full result ›" opens My card · Alice at this letter's entry.
- [ ] As "Alice (in app)", her DM holds one letter message that opens the same page, with "‹ Bob",
      and a message either person types in that DM shows as a bubble for both.
- [ ] "Skip 14 days" on a sent or an opened letter shows "Not finished" to Bob and "This letter is
      closed." to Alice; "Start a new letter" starts a new draft.
- [ ] The prototype strip sits above the app with text labels at 320, 375 and 1440, and no
      prototype control is in a product header; the space rail is gone and the filter row works.
- [ ] (S5, if built) The sidebar shows Home, Letters, Partners, Groups, My Profile above the chats;
      "Signed out" shows the public menu; every menu item opens a page or a quiet frame.
- [ ] No horizontal scroll and no console error at 320, 375 or 1440 on any screen above.
- [ ] Existing production tests stay green.
- [ ] Real mode (`?real=1`) still loads, with the agent named Mira ("Mira, <user>'s mirror agent").

## Measurement

Taps: P1469's method, a Playwright walk at 1440 (fresh session, fictional data), every click
counted, strip controls excluded; typing is not a tap, sending or saving it is.

| Side | Path | v6 (P1469) | v7 target |
|---|---|---|---|
| Bob | card → sent | **12** | **9** + 1 per "My guess" (fixture has 2 → **11**): Create, position, guess, Use this point, rate, This is how I see Alice, Keep/Delete ×2, rate, This is my story, Send to Alice |
| Bob | guess close | +1 / +4 | +0 ignored, +3 sharpened |
| Alice | open → sent, notes skipped | **10** | **11**: Open, position, Lock in, Continue, rate, Continue, Skip, rate, Continue, Skip, Send to Bob |
| Alice | both notes answered | **12** (by voice) | **11** (typed; Save replaces Skip; no mic in v7) |

Words: counted per **screen state** (what is on screen between two taps), including headers,
folded rows, agent lines, questions, scale ends and helper lines; excluding quotes, point and story
bodies and button or link labels. P1469 counted per step on a different split, so the script also
re-measures v6 (`c25f12d97`) by this method and reports both. Estimates from this spec's copy, as
targets:

| Screen state | Estimate | Target |
|---|---|---|
| Bob: agent chat with card · step 1 · sent · result | 12 · 30 · 12 · 50 | each ≤ 50 |
| Bob: step 2 · step 3 | 47 · 49 | ≤ 50 |
| Bob: step 4 (rows, quote, when-list, sub-line) | 67 | ≤ 70 |
| Alice: cover · step 1 · after lock · step 2 before rating · step 3 before rating · send · ending | 25 · 20 · 26 · 37 · 26 · 30 · 14 | each ≤ 50 |
| Alice: step 2 after reveal (receipt, verdict, scale, box) · step 3 after reveal | 64 · 50 | ≤ 65 · ≤ 50 |

Cut on sight: any line that repeats what the same screen already shows. Already cut here: the point
card's own framing question in Bob's step 1 (the agent asks it), v6's seal note, the exposure
notice, the agent offer. Kept deliberately: "You gave N" in the note prompt, because citing her
number is what H-reason tests.

The build writes measured numbers here, beside the re-measured v6, at 1440, 375 and 320.

## Open questions for the founder

1. CTA: "Create a clarity letter" or "Write a clarity letter"?
2. Two "My guess" sentences put Bob at 11 taps. Fine, or fewer guesses?
3. Letters tabs: production's "Inbox · Drafts · Published", or the amendment's "Sent / Received"?
4. Should an unopened letter expire after 14 days too (decision 31)?
5. Keep P1469's neutral line on Alice's step 2? It is 9 of the 64 words in her busiest state.
6. What does email-Alice actually receive when Bob replies (decision 19 promises an email)?

## Related

[P1469](p1469_clarity_chat_letter_loop_v6.md) (v6), [P1437](p1437_conversation_groups_agents_check_understanding.md);
follow-ups P1462, P1456, P1470.
