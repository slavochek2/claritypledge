---
status: week
type: story
rank: 27
workstream: clarity-chat
created_date: '2026-10-13'
tags:
  - clarity-chat
  - prototype
  - letters
  - mental-model
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1469: Clarity Chat letter loop v6 — the letter arrives in chat, built from the letter's own parts

> **Where it is built.** Same as P1467: the P1437 prototype (route `/tree/conversation-groups`,
> dev-only, mock data, no network writes), on the P1437 prototype branch, shipping with P1437.
> This spec holds only what changes from v5 (P1467). Where they disagree, this one wins.

## Problem

**Situation:** v5 (P1467) built the full loop in chat: Bob's mirror agent flags moments, drafts
the point, "Alice in Bob's eyes" and Bob's story, and carries one letter into a private thread
inside the Bob-Alice DM. All reviews passed.

**Complication:** The founder walked v5 as Bob and as Alice on 2026-10-13 and found the receiving
side reinvented what letters already do (its own questions, reveals and wording, an extra "Review
and send", a Decline, a three-column comparison, an explainer graphic), while the parts that
belong in a chat (correcting Bob's picture of her, explaining back) were still click-through steps.
On Bob's side, the agent asked open questions instead of offering its guess; imported WhatsApp
chats looked like native ClarityPledge chats; the predicted position sat in a row below the point
instead of the existing stance header.

**Question:** Rebuild the loop so that Alice receives the letter *in chat*, assembled from the
existing letter's parts and wording, with the optional parts asked as optional questions; and
fix Bob's side per the walk-through decisions below.

> Founder framing, verbatim (2026-10-13): *"If we want them to correct what we call the reverse
> story … and if we want them to explain back and so on, this is the things that I think are better
> done in chat. … With the chat interface, it's always optional. You answer in chat on things that
> you need to answer."*
>
> *"Let's reuse what we have in letters … use exactly the same wording, same buttons, same text …
> don't reinvent stuff."*

## The hypothesis v6 tests

**H-chat:** a letter received in chat, built from the letter's own parts, gets its optional parts
(correcting Bob's picture of her, saying what he missed, explaining back) answered more often and
with fewer taps than the letter flow. The letter flow is the comparison. The prototype cannot
measure completion; it lets the founder judge the experience and counts taps and words per step
against v5 and against the letter flow.

**H-card (recorded for P1458, not tested here):** *people keep notes on others all the time, but
never ones the other person can grade.* A private card per person that holds your predictions about
them, each of which they can check, gives a reason to come back: your picture of people gets better.

## Appetite

- **Blast radius:** one prototype route plus optional props on production cards (defaults
  unchanged, as in P1467). No database, no production behaviour change.
- **Reversibility:** git revert.
- **Decision density:** settled. Nineteen decisions were made with the founder on 2026-10-13
  (below). Remaining copy choices are marked `[FOUNDER DECISION]`.

## Decisions (2026-10-13, founder walk-through; do not re-ask)

Reviews behind them: Opus, Codex and Gemini reviewed an anonymised brief (3 of 3 reported); a
code fact-finder mapped the letters flow (1 of 1).

1. **Entry 1 — "Ask <agent name>" on any message** ("Ask Mira" in the founder's mode). A dedicated action with the agent icon, separate from
   Forward. One tap switches to the agent's chat with the quoted message (author photo + text)
   above the composer, Telegram-style, and a back arrow to return. The user may add a note.
2. **Entry 2 — scan on import.** When a source is imported the agent posts one message, "I found
   N stuck conversations", as cards; after that it speaks only when it finds one. No weekly digest.
   Detection is **assumed** in the prototype; building it is P1470.
3. **Flagged-moment card:** one highlighted quote (more behind "▸ N more"), one optional line
   "If you don't mean the same thing: …", and two actions: **Clarify** (starts the draft) and
   **Dismiss** (optional one-tap reason). No title, no "you may mean / she may mean", no Reply
   (the user can always type). Replaces v5's two open questions and "Worth checking?".
4. **Bob sets his own guess of her position** before the agent drafts her story. The guess chip
   starts empty. The agent never pre-fills it (otherwise calibration measures the agent).
5. **The point aims at a predicted disagreement.** If Bob's guess is close to his own position,
   the agent offers once to sharpen the point so her predicted position sits further from his;
   accepting makes a new revision. Bob may decline and keep any point.
6. **Explicit "Approve draft".** Voting is not approving (reverses P1467 "voting approves the
   point"). The point stays a Draft until Bob taps Approve draft.
7. **The guess sits on the story's header**, in the feed's existing stance-header format: the point
   on top, and under it, expanded, "Alice in Bob's eyes · Somewhat disagrees ▾" heading her story.
   The stance chip becomes a dropdown for Bob only (new optional prop; production chip unchanged).
   No comparison row. Draft tag inside the card. No Share in the draft menu.
8. **Third person.** "Alice in Bob's eyes" is written in the third person ("In Bob's eyes, Alice
   …"); no "By Bob, in her voice". The agent drafts her *reasons* as she would endorse them, never
   motives. Reverses the 2026-10-12 "story … in her voice" ruling.
9. **Always private.** A letter carrying "Alice in Bob's eyes" is private; shown as a label from the
   first step ("Private letter to Alice"). No public option in this flow.
10. **Delivery: Bob sends it.** No agent appears in Alice's path. Prototype sends by email (the
    existing invite). WhatsApp delivery with a WhatsApp code to verify her number is designed in
    P1456, not built here.
11. **Alice receives it in the Bob-Alice chat** (not a thread, not a separate page): a message from
    Bob opens the letter (the letter cover, "Open the Letter"), then each step arrives as a card in
    that chat, built from the letter's own components and wording. The optional parts are asked
    by the letter itself as one optional question each, answerable by text, voice or "No thanks".
    Reverses 2026-10-12 "private thread carried by the mirror agent".
12. **Her own agent comes at the end.** On her last card: an offer to write "Bob in Alice's eyes"
    with her own agent (the registration hook, a reply, and a two-sided record in one).
13. **What Alice sees of Bob's guess:** never before she votes. After her vote, the letters' existing
    "Where you each stand" (her and Bob only). The next card is Bob's story of her, whose header
    carries his guess. The letter adds one neutral line, never on Bob's behalf:
    `[FOUNDER DECISION: copy]` proposed "Bob's guess before you answered, and why he thought so."
    Shown always, whether the guess was close or far; only the wording may differ.
14. **Bob agrees to that exposure before sending.** His preview says that after Alice answers she
    will see his guess and his story of her. `[FOUNDER DECISION: copy]`
15. **No Decline, no "Review and send".** Every answer is saved for her as she goes and marked "Only
    visible to you" until she finishes; then Bob sees them in the same chat. Leaving is the "no";
    Bob sees "Opened".
16. **The record is the Journey card.** Each finished check adds one entry, reusing the live
    session's "Journey to Understanding" card (his sealed numbers vs her ratings), on Bob's private
    card for Alice ("History with Alice"). No confetti for this letter. Results appear in the
    Bob-Alice chat, where the conversation continues; **no separate agent message on completion**
    (the 2026-10-12 ruling rejected it as a duplicate).
17. **Bob's private card on a person** ("My card"): the existing profile page reused, with a
    "Private · only you" banner at the top; sent items tagged "Shared with Alice", unsent items keep
    the Draft tag. For a contact who is a user, hovering offers **Profile** or **My card**; each
    links to the other. A contact who is not a user has only My card. v6 shows Alice's card as a
    mock reachable from her name.
18. **Spaces.** A left rail of spaces: ClarityPledge, WhatsApp (via Beeper), Telegram (via Beeper),
    each separate. A network space wears a light skin (network colour, icon, header "WhatsApp via
    Beeper"), never a WhatsApp look-alike. Composer: "Message on WhatsApp" when Beeper is connected,
    "Read-only · imported <date>" otherwise. Letters, checks and threads exist only in the
    ClarityPledge space. Alice never sees Bob's imported history.
19. **Threads stay in group channels only.** None in the letter loop or in agent chats.
20. **Agent identity.** In the founder's real-data mode the agent is **Mira**. In the fictional mode
    Bob's agent shows the default state every new user starts in: "Agent", robot avatar, "Name
    your agent". The DM list shows "AGENT <name>" without a "mirror agent" subtitle (owner's own
    view; Alice never meets Bob's agent in v6).


### Codex review fixes (2026-10-13, verdict REVISE, 5 of 5 accepted)

21. **Abandoned letters release the pair.** A letter opened and not finished for 14 days becomes
    "Not finished": the one-open-letter lock is released, her saved answers are discarded unshared,
    and Bob may send a new letter. `[FOUNDER DECISION: the period]`
22. **The sharing boundary is stated before it is crossed.** Her first card says her answers stay
    private until she sends them; the last card has one explicit button, "Send to Bob", saying what
    he will see. Skipping a question never sends. (Refines decision 15: finishing is an act, not a
    side effect of "No thanks".)
23. **Changing the guess invalidates what depends on it.** A change to Bob's guess clears the
    approval and seal of "Alice in Bob's eyes". Sharpening the point is a point edit: it clears the
    vote, the guess, both approvals and both seals, and Bob confirms his position again.
24. **Bob's seal on her story predicts her rating.** For "Alice in Bob's eyes" Bob is asked how
    well Alice will say the story captures her meaning (0-10), matching the reveal's measurement,
    not "How well do you understand Alice here?". `[FOUNDER DECISION: copy]`

## Solution

### Bob

- **Spaces rail** (decision 18) with a mock WhatsApp space holding the Alice chat (imported,
  light skin). A settings toggle switches "Beeper connected" on/off to show both composer states.
- **Entry:** "Ask <agent name>" on a message (decision 1), or the import-scan message with cards
  (decisions 2-3). **Clarify** opens the draft.
- **Draft:** the agent proposes the point; Bob votes; Bob picks his guess of Alice (empty chip
  first); the agent offers to sharpen if the guess is close (decision 5); "Approve draft"
  (decision 6). Then "Alice in Bob's eyes" (third person, decision 8) under the guess header
  (decision 7), approve or edit, seal "How well do you understand Alice here?"; Bob's own story,
  approve or edit, seal his expectation. The sealing questions and scales reuse the letters'
  sender wording.
- **Preview:** the existing letter-preview pattern ("THIS IS A PREVIEW — The receiver will see
  this"), plus the exposure notice (decision 14). **Send** by email (decision 10), "Private letter
  to Alice" shown throughout (decision 9).
- **After:** status in the Bob-Alice chat ("Sent", "Opened", "Completed"); on completion her
  answers appear there and an entry is added to "History with Alice" on My card (decisions 16-17).

### Alice

In the Bob-Alice chat (ClarityPledge space), from a message by Bob:

1. Letter cover → "Open the Letter".
2. Point card: "To what extent do you agree?" → "Lock in your position" → "Where you each stand"
   (her and Bob).
3. Bob's story of her, header "Alice in Bob's eyes · <guess>", with the neutral line (decision 13).
   Rating with the letters' existing reverse-story question ("How well do you believe this story
   represents your intended meaning?") → "Continue" → the letters' existing reveal ("Before you
   answered, Bob estimated you would rate their capture of your meaning at a N.").
4. One optional question: what did he miss? Text, voice or "No thanks".
   `[FOUNDER DECISION: copy]`
5. Bob's own story → the letters' understanding question ("How well do you believe you understand
   Bob's intended meaning behind their story?") → "Continue" → the letters' reveal.
6. One optional question: explain back. Reuses "Explain back what you understood" (voice or text)
   or "No thanks".
7. Done: answers become visible to Bob; the offer of her own agent (decision 12).

Every in-progress card is marked "Only visible to you" (decision 15). No progress-bar page, no
Decline, no "Review and send", no Details buttons on her cards, no explainer graphic, no
three-column comparison. When she expands the point she sees her own position on it.

### Real-data mode

The P1467 loader (`?real=1` + the gitignored local file) keeps working; new fields are optional.
No real content enters any tracked file, test, spec, commit or review prompt.

## UI Contract

Reused verbatim from production letters (verified 2026-10-13):

| Element | Copy |
|---|---|
| Point question | "To what extent do you agree?" |
| Position commit | "Lock in your position" |
| Position reveal | "Where you each stand" |
| Reverse-story rating | "How well do you believe this story represents your intended meaning?" |
| Story rating | "How well do you believe you understand {First}'s intended meaning behind their story?" |
| Rating commit | "Continue" |
| Scale ends | "Not at all" / "Complete cognitive understanding" |
| Reveal (reverse story) | "Before you answered, {First} estimated you would rate their capture of your meaning at a {N}." |
| Reveal (story) | "Before you answered, {First} estimated you understood their intended meaning at a {N}." |
| Explain back | "Explain back what you understood" |
| Cover button | "Open the Letter" |
| Preview banner | "THIS IS A PREVIEW — The receiver will see this" |

New copy, all `[FOUNDER DECISION: copy]`, proposed: "Ask <agent name>" · "Clarify" / "Dismiss" · "If you
don't mean the same thing: …" · "I found N stuck conversations" · "Approve draft" · "Private letter
to Alice" · "Only visible to you" · "Private · only you" · "Shared with Alice" · "History with
Alice" · "Name your agent" · "Message on WhatsApp" / "Read-only · imported <date>" · the neutral
line (decision 13) · the preview exposure notice (decision 14) · the two optional questions · the
end-of-letter agent offer.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Alice reads Bob's story of her as an accusation | MITIGATE | Third person, reasons not motives (decision 8); her rating and "what did he miss" come right after |
| Bob feels exposed when a wrong guess is shown | MITIGATE | He agrees in the preview (decision 14); the letter never speaks for him |
| Alice messages Bob before rating, so the rating reflects his answer | ACCEPT | Good for the relationship; noisier measurement; noted for H-chat |
| Answers saved but visible to Bob mid-way | MITIGATE | "Only visible to you" until she finishes (decision 15); test that Bob's view shows status only |
| Chat cards drift from letter wording | MITIGATE | UI Contract above; a test asserts the reused strings |
| Bob's taps rise (own guess, Approve draft) | ACCEPT | Calibration must be Bob's; measured and reported against v5 |
| A WhatsApp-like skin confuses which features work | MITIGATE | Light skin only; letters exist only in the ClarityPledge space |
| Detection quality unknown | DEFER | P1470 |

**Non-Goals**
- Do NOT build detection, imports, Beeper sending, WhatsApp delivery or verification.
- Do NOT change the production letter flow or any production default; production cards get
  optional props only, existing tests stay green.
- Do NOT add threads to the letter loop or agent chats.
- Do NOT add an agent to Alice's path before her last card.
- Do NOT show Bob's guess to Alice before her position is locked.
- Do NOT put any real-case content in a tracked file, test, commit or review prompt.

## Acceptance Criteria

- [ ] "Ask <agent name>" on a message opens the agent chat with the quote above the composer; the import
      scan shows cards with Clarify / Dismiss only.
- [ ] Bob's guess chip starts empty; the agent's story of Alice appears only after Bob sets it.
- [ ] The point stays "Draft" after Bob votes, until "Approve draft".
- [ ] The guess shows as the stance header of "Alice in Bob's eyes", in the third person, with no
      comparison row and no Share in the draft menu.
- [ ] Alice receives the letter in the Bob-Alice chat; every reused string matches the UI Contract.
- [ ] Alice never sees Bob's guess before her position is locked; she never sees three positions
      side by side.
- [ ] Each optional part can be answered by text or voice, or skipped with one tap.
- [ ] Bob sees only status until Alice finishes; then her answers appear in the same chat and a
      Journey entry appears on Bob's private card for Alice.
- [ ] No Decline, no "Review and send", no explainer graphic, no Details on Alice's cards.
- [ ] Spaces rail with ClarityPledge and WhatsApp; both composer states reachable; imported chats
      never show to Alice.
- [ ] Taps and words per step for Bob and Alice measured against v5 and written into this spec.
- [ ] Reviews: component fidelity (vs letters and the feed), visual QA at 320 / 375 / 1440 from
      screenshots only, Codex adversarial; `<reports received> of <spawned>` stated; blockers fixed.
- [ ] An abandoned letter releases the pair after the set period without sharing her answers.
- [ ] Her answers reach Bob only through "Send to Bob"; skipping never sends.
- [ ] Changing the guess clears the eyes story's approval and seal; sharpening clears the point's vote, guess, approvals and seals.
- [ ] Founder walks the loop as Bob and as Alice.

## Related

- Predecessor: [P1467](p1467_clarity_chat_letter_loop_v5.md) (v5), [P1437](p1437_conversation_groups_agents_check_understanding.md).
- Follow-ups updated 2026-10-13: [P1455](p1455_clarity_chat_reply_threads_close_the_gap.md) ·
  [P1456](p1456_clarity_chat_no_account_path.md) · [P1457](p1457_clarity_chat_data_import.md) ·
  [P1458](p1458_clarity_chat_agents_on_other_people.md) · [P1459](p1459_clarity_chat_clarity_ledger.md) ·
  [P1460](p1460_clarity_chat_connection_levels.md) · [P1462](p1462_clarity_chat_left_menu.md) ·
  [P1465](p1465_clarity_chat_first_encounter_explainer.md); new: P1470 (detecting stuck conversations).
- Rulings: decisions.md 2026-10-12 (mental model; one letter in a private thread) — decisions 6, 8,
  11 and 16 above revise parts of them; 2026-09-30 (explain-back opt-in in letters; in chat it is
  one optional question, so no sender setting is added).

## Open Questions

1. Mobile: the cover and cards in a phone-width chat — verified only in visual QA.
2. Does "Only visible to you" need a different look from Slack's to avoid implying Bob can never see it?
