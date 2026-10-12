---
status: today
type: story
disclosure: public
rank: 1000090
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - prototype
  - mirror-agent
  - mental-model
  - letters
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1467: Clarity Chat letter loop v5 — find the moment, show the gap, in chat

> Founder framing, verbatim (2026-10-12): *"he first hopefully finds those different problems that could be illusion of understandings ... and then I can review them and I can take something from there or I can just forward the message and start talking"*

> **Where it is built.** This rebuilds the P1437 prototype (route `/tree/conversation-groups`,
> dev-only, mock data, no network writes). It is implemented on the P1437 prototype branch, which
> already holds v4, and ships together with P1437. P1437 is the exploration record (v1-v4 and the
> reasoning); this spec holds only what to build now. When this spec and P1437 disagree, this one
> wins.

## Problem

v4 (P1437, commit `36c9c0c56`) proved that stake's own point and story cards work inside a chat.
Walking it, the founder found the journey wrong in ways that matter for the product, not polish:

- It starts in the wrong place. "Talk to my agent" on one message is really *forwarding* to my
  own agent, and the value starts earlier: the agent should already have **flagged the moments
  worth checking** from my imported conversations.
- Who is who is unclear. "AGENT on Bob" is how *others* would label an agent; my own agent is my
  **mirror agent**. And my guess of the other person's view was signed by me, which left her
  predicted position with no holder.
- The order and the delivery were wrong. Two separate requests ("guess first, own story later")
  and a neutral check card became one **letter**, carried by my mirror agent into a **private
  thread** inside our DM, where she answers step by step and can talk.
- Drafting was clumsy: Adopt after already voting, Details on a draft, the Draft label far from
  the title, a model picker nobody needs.

**Question:** does the full loop, *agent flags a moment → I approve it as worth checking → agent
drafts the point and "Alice in Bob's eyes" → I approve and seal my numbers → one letter → Alice
answers in a private thread → both see the gap*, read as one clear, simple flow to both people?

## Appetite

One build-review-fix loop on the prototype, the same orchestration as v4: build, then component
fidelity review, visual QA, and Codex adversarial review, then fix, then a final visual pass.
No backend, no real AI calls, no production component behaviour changes (optional props only).

## Decisions this spec builds on (2026-10-12, founder) — do not re-ask

Each is decided; the reasoning lives in the linked spec or in P1437.

1. **Mirror agent.** Each person has one mirror agent: it acts (drafts, flags, talks) for its owner
   and never starts anything toward others on its own. It may have a user-chosen name; its role is
   always shown: "<Name> · Bob's mirror agent", or "Bob's mirror agent" when unnamed. Agents are
   marked by the app (AGENT tag + agent avatar), never by a symbol typed into the name.
2. **"Alice in Bob's eyes"** is Bob's mental model of Alice: a visible entity that holds her
   predicted position and a story in her voice; every word is Bob's claim. It is **not an agent**
   (it cannot act). Not "AGENT on Alice", not "Bob's Alice", not a label on a story by Bob, not a
   nested story. See P1458 "Decided 2026-10-12".
3. **No "assumed" tag.** The name says it. Draft = the mirror agent suggested it; approved = it
   belongs to "Alice in Bob's eyes"; Alice's number appears once she answers, in the chat only.
4. **Visibility.** Bob's drafts are his alone. Every prediction about a person is either a private
   note or addressed to that person. Bob's "Alice in Bob's eyes" page is Bob's only; Alice sees
   only what is sent to her. Sharing beyond Alice is P1466 (not built).
5. **Picture: round-2 variant #9** (`?variants=eyes2`): Alice's photo in a graphite pencil tint with
   a dashed ring; Bob's face in colour with his pledge ring at the bottom-right (~44%); the
   predicted stance pill is graphite and dashed, never the blue of a stated position; below 24px
   the tint alone carries it. Ranked first by the designer and by Codex; founder agreed.
6. **One letter, both directions.** Order: point (my position + her predicted position) → her view
   as I see it ("Alice in Bob's eyes" story) + my sealed number "How well do I understand Alice
   here?" → my own story + my sealed number "How well will Alice understand this?" → send.
7. **Delivery: a private thread inside the Bob-Alice DM.** Bob's mirror agent posts the letter card
   in the DM and runs the private thread with Alice. Bob sees only status until Alice sends.
   This **reverses** the morning decision "neutral card, not Bob's agent" (P1437): the agent now
   carries the letter, with a stated role: it delivers and answers questions, it never argues
   Bob's case.
8. **Numbers.** Each side seals before seeing the other. The lower of the two numbers on a story is
   the one shown. Alice's explain-back is optional, in text or voice, through the normal composer
   mic. No separate "request explain-back in voice" setting.
9. **Names in the mock.** The fictional pair is **Alice and Bob** (the v4 counterparty "Mira" is
   renamed). No mock person or agent is named Mira.

## Solution — what appears on screen

Mock data, one scenario (Bob and Alice, mum's birthday, imported WhatsApp thread). Every step has
one primary action. Every number and every story says whose it is.

### S0 Shell (all views)

- Keep the Slack/Buzz-like shell, Preview as Bob / Alice, and the Reset button.
- **Tips on hover** for every icon-only control (as Buzz/Slack: dark tooltip, short verb phrase).
  Message hover actions: "Reply in thread", "Forward to my mirror agent".
- Remove the model picker ("Default model") everywhere.
- "Jump to latest": a small pill above the composer that never covers an action row.

### S1 Bob's mirror agent DM

- Sidebar and header: agent avatar (square, the existing agent style) + "Juno" + AGENT tag +
  "Bob's mirror agent". Every agent message shows the avatar (v4 bubbles had none).
- Composer as in v4, mic included, no model picker.

### S2 Flags digest (start of the journey)

- At the top of the agent DM, a pinned "This week" message from Juno: "I looked through your
  imported chats. 2 moments where you and someone may think you understand each other and don't."
- Each flag is one compact card: who, the quoted messages (2-3 lines, attributed), one line on why
  it may be a hidden disagreement, and how high the stakes look. Actions: **Explore** (primary),
  Not now, Not an issue. Older weeks are one collapsed line.
- The data source is shown honestly: "From WhatsApp import · Mum's birthday" (mocked import).

### S3 Forward to my mirror agent (second entry)

- Hover a message in any chat → "Forward to my mirror agent" (forward icon + tip).
- It lands in the agent DM as a forwarded-message card, as Slack does: bordered quote with the
  author's avatar, name, "Direct message with Alice", time, text. The agent then asks what bothers
  Bob about it.

### S4 Explore (the agent finds the real problem with Bob)

- Juno asks at most two short questions, reflecting Bob's words back, then says in one line what
  the disagreement seems to be, then asks: **"Worth checking with Alice?"** → Yes, check it
  (primary) / Not now. Juno never decides this for Bob.
- The mock replies must use Bob's own words (as v4 did) and never contradict him.

### S5 Point draft

- The point renders with stake's `FeedPointCard`, as in v4.
- **Draft chip inline, right after the lock icon and before the statement text**, more visible
  than v4's floating outline label.
- A draft has **no Details button and no stories footer**.
- **Voting approves.** Bob taps his position (Disagree/Unsure/Agree, with the existing strength
  tap). That makes the point his; there is no separate Adopt button. "Edit" stays, and so does
  "tell Juno what to change" via the composer.
- Under the vote row, Juno's prediction of Alice's position as a comparison row: "Bob: Disagrees ·
  Alice in Bob's eyes: Agrees", with the #9 mark and the graphite dashed pill. Bob can change the
  prediction by tapping it (it is his claim).

### S6 "Alice in Bob's eyes" story (her view as Bob sees it)

- Story card (`FeedStoryCard`, as v4) whose author is "Alice in Bob's eyes" with the #9 mark,
  written in her voice, linked to the point the same way stake links stories.
- While a draft: "Drafted by Juno" and Draft chip; actions **Approve** (primary) and Edit.
  After approval: "By Bob, in her voice".
- Then Bob seals: **"How well do you understand Alice here?"** 0-10 (existing Scale), with a lock
  and "Alice won't see this until she answers."
- The first time Bob creates one, a short line explains: "This is your picture of Alice. Only you
  see it until you send it to her."

### S7 Bob's own story

- `FeedStoryCard` authored by Bob (his photo, pledge ring), drafted by Juno, Approve / Edit.
- Bob seals: **"How well will Alice understand this?"** 0-10.

### S8 Letter preview and send

- One compact preview: the point with its two linked stories (the stake expander, as v4), and the
  two sealed numbers shown as locks, not values.
- Primary: **"Send to Alice"**. Copy under it: "Juno delivers it in your DM with Alice. Only you
  two see it." One open letter per pair; a second is blocked with "Alice has an open letter".

### S9 Bob's view of the Bob-Alice DM

- A letter card posted by Juno: "Letter to Alice · private thread", with a status chip that moves
  Sent → Opened → In progress (step n of 4) → Completed. Before completion Bob sees none of her
  answers. No separate DM from Juno to Bob when she finishes: the card update is the notification.

### S10 Alice's side

- In the DM: "Bob sent you a letter" card from Juno → **Open**. It opens a **private thread**
  labelled "Only you and Juno see this until you send." Alice can type or speak in the composer at
  any time; Juno answers questions and never argues Bob's case.
- **First-encounter card** (P1465, one-card version), the first time she meets "Alice in Bob's
  eyes": picture first (her photo becoming the graphite sketch inside Bob's frame), at most ~25
  words: "This is how Bob sees you. It's not you and it can't act. Only you two see it. Rate it."
  Dismiss with "Got it".
- Steps, one per message, "n of 4":
  1. **Your position** on the point (FeedPointCard vote row). Then the comparison reveals:
     Alice (blue, solid) · Alice in Bob's eyes (graphite, dashed) · Bob.
  2. **Bob's picture of you**: the "Alice in Bob's eyes" story. Question: **"Would you say this?"**
     0-10, then "What did he miss?" (text, or the mic; a "Say it" button opens the same composer
     mic). Then the reveal: Bob's sealed number next to hers; the lower one is shown.
  3. **Bob's story.** "How well do you understand Bob here?" 0-10, sealed.
  4. **Explain it back** (optional): "In your words, what is Bob saying?" text or voice. Skip is
     allowed and shown as "Skipped".
  Then **Send to Bob** (primary). Decline is a secondary button with one confirm, available on
  every step.

### S11 Result (both sides, in the DM)

- The letter card becomes the result: the point with both real positions and the prediction; the
  "Alice in Bob's eyes" story with "Bob's confidence 7 · Alice: 3 → 3"; Bob's story with "Alice's
  understanding 6 · Bob's expectation 8 → 6"; Alice's "what he missed" as a story by Alice (one
  FeedStoryCard, shown once), and her explain-back if given.
- Missing steps show "Skipped" or "Declined", never a number. Bob is offered nothing further here
  (reply threads are P1455).

### S12 Variants page

- Keep `?variants=eyes` and `?variants=eyes2` reachable as design references; the chosen #9 mark
  becomes one shared component used by S5, S6, S10 and S11 (not a copy per screen).

## Build contract from adversarial review (Codex falsify, 2026-10-12, claims checked against code) — binding

These close the gaps a builder would otherwise guess. Where they refine an S-item above, they win.

**Component reuse (optional props only, defaults keep production identical):**
- `FeedPointCard`: add `statementPrefix?: ReactNode` (rendered right after the visibility icon;
  drafts pass the Draft chip) and `hideFooter?: boolean = false` (drafts hide stories/Details).
  Today the lock and statement are joined directly and the footer is always rendered.
- `FeedStoryCard`: add `authorOverride?: ReactNode` replacing the visible author block (avatar,
  profile link, ear badge), keeping accessible authorship. The mental model uses a distinct
  non-agent fixture id and author name "Alice in Bob's eyes"; "By Bob, in her voice" is a
  subtitle, never a replacement author. Today the avatar is a hardcoded GravatarAvatar with an
  EarBadge.
- Expanded linked stories inside FeedPointCard render via `QuotedStory`; add
  `renderLinkedStory?: (story) => ReactNode` so the prototype can supply FeedStoryCard with the
  #9 identity. The #9 mark appears in every representation of the model, expanded or not.
- Run the existing feed-card tests after each prop; they must stay green.

**State and privacy rules:**
- **Reveals:** Bob's confidence is revealed only after Alice *confirms* her "Would you say this?"
  rating; Bob's expectation only after she confirms her understanding rating. A selection alone
  reveals nothing.
- **Edits invalidate:** editing a story clears its approval and seal; editing the point clears
  both stories' approvals and seals. A sent letter is immutable.
- **Decline:** confirming Decline closes the letter, shows Bob only "Declined", discards Alice's
  unsent answers, keeps comparisons sealed and releases the pair lock. Cancel returns to the same
  step. (v4's `isDone` treats decline as completion; the publication boundary is new.)
- **Skip:** only "What did he miss?" and explain-back are skippable; skipping creates no story and
  keeps completed ratings.
- **Second letter:** completed or declined letters release the lock; a blocked Send keeps the
  draft and offers a secondary "Open existing letter". New letters get new ids; history stays in
  order.
- **Preview switching** keeps each person's draft, active step and scroll; Bob's view shows status
  only until Alice sends (no ratings, correction, transcript or recording). **Reset** clears
  letters, drafts and the first-encounter dismissal.
- **First-encounter card:** once per pair per session.

**One primary action per view:**
- In the digest, selecting a flag reveals its single primary **Explore**; other flags show only
  secondary actions.
- Completed messages become read-only with a secondary Edit; sealing appears only after approval.
  Only the active step has a primary action; earlier controls cannot advance the flow.
- Step 2 is: confirm rating → reveal → "What did he miss?" or Skip → next. Step 4 (explain-back
  or Skip) leads to an unnumbered "Review and send". Count every tap (select, confirm, dismiss,
  skip, send) for goal criterion 3, separately from the 4 numbered steps.

**Mock content (literal fixtures, written once in mock-data):**
- Flag 1: Bob and Alice, mum's birthday (the existing imported thread: "Are you coming or should I
  tell her you're busy again?" / "You always try." / "You came for lunch and left before
  coffee."); why: "You may mean 'I showed up', Alice may mean 'you were present'"; stakes: high.
- Flag 2: the existing launch-docs exchange with Priya; stakes: medium.
- Juno's questions, replies and every answer to Alice are written as fixtures; free text from Bob
  is quoted back, never contradicted; free text from Alice gets a neutral reply that restates the
  current step.

**320 px:** sidebar collapses; "Alice in Bob's eyes" wraps (never truncated, "Bob's" always
visible); comparison labels share one height so pills align; action rows stack; message actions
are reachable by tap; composer and "Jump to latest" never cover the active action.

## Goal criteria (every reviewer checks these; measure v4 first, v5 must not be worse on any)

1. **Same parts.** Points, stories, scales and letter steps use the same components as stake and
   letter-chat. A reviewer lists each surface and the component it uses; any look-alike is a
   blocker.
2. **Who is speaking.** Every number and every story on screen names its owner (Bob, Alice,
   "Alice in Bob's eyes", Juno while drafting). A reviewer finds none unattributed.
3. **Steps and words.** Count taps for Bob (flag → sent) and for Alice (open → sent), and the words
   of instruction per step (target at most ~25). Report the counts for v4 and v5.
4. **10-second test.** A reviewer who sees only the first-encounter card and one comparison row
   can say who said what within 10 seconds. Codex is asked to answer cold.
5. **No leaks.** Neither side sees the other's sealed number before answering; Bob sees no answer
   before Alice sends.
6. **Visual QA.** 320, 375 and 1440 px; one primary action per view; no dead controls; the
   `.claude/rules/visual-qa.md` checklist.

## Risks / Non-Goals

- **Non-goals:** real import, real AI, persistence beyond sessionStorage, reply threads (P1455),
  non-members (P1456), connection levels (P1460), left menu (P1462), sharing beyond Alice (P1466),
  the full first-encounter animation (P1465).
- **MITIGATE — Risk: too many steps for Alice.** Four steps plus a first-encounter card. If the step count
  grows over v4's, flag it; do not silently cut a step.
- **MITIGATE — Risk: the agent carrying the letter reads as Bob's advocate.** Copy must state its role; the
  adversarial reviewer checks every Juno line on Alice's side for advocacy.
- **MITIGATE — Risk: graphite reads as "disabled".** Visual QA checks the #9 mark next to disabled controls.
- **MITIGATE — Privacy:** the public prototype uses fictional data only. Any private real-data mode stays
  outside the repository and is never committed.

## Considered and rejected (do not rebuild)

| Rejected | Why |
|---|---|
| Neutral "Clarity check" card (v4) | superseded by the letter in a private thread (decision 7) |
| Two requests: guess first, own story later | one letter is simpler for Alice; her view is still shown before Bob's |
| "Adopt" after voting; Details on drafts | voting approves; a draft has no details |
| "AGENT on Alice · operated by Bob" | it is not an agent; lets Bob hide behind a machine |
| Guess as a story by Bob with a label | no holder for the predicted position; one story per author per point |
| Nested story-in-story | needs a holder anyway; cropped screenshots lose attribution |
| "Bob's Alice" | reads as ownership |
| An "assumed" tag | the name already says it |
| Symbols in agent names ($, *, %) | anyone can type them; the app marks agents instead |
| Eye-shaped badge for Bob; Alice in Bob's iris | Bob's face blurs below 40px; reverses accountability |
| Sepia tint | close to banned amber/orange; graphite stays in the system |
| Generated portraits of private people | consent; adds nothing the tint doesn't say |
| Model picker in the agent DM | founder: not needed |
| Juno DMing Bob when Alice finishes | the DM card update already notifies; duplicate |
| Live AI on real conversations now | deferred; prototype is mocked |

## Done-When

- [ ] v4 baseline measured against the 6 goal criteria and written into this spec before building.
- [ ] S0-S12 built as described; each S-item ticked below with file:line evidence.
- [ ] Reviews: component fidelity, visual QA (screenshots only, no diff), Codex adversarial;
      `<reports received> of <spawned>` stated; every blocker fixed; final visual pass clean.
- [ ] v5 measured against the goal criteria, with the v4 vs v5 table in this spec.
- [ ] Tests for the prototype updated (one per S-step that has logic) and green; tsc clean on
      touched files; letter-chat regression check passes.
- [ ] Founder walks the loop as Bob and as Alice.

## Acceptance Criteria

- [ ] S0 tips on every icon-only control; no model picker anywhere.
- [ ] S1 agent DM shows "Juno · Bob's mirror agent" with agent avatar on every agent message.
- [ ] S2 flags digest with Explore / Not now / Not an issue.
- [ ] S3 forward lands as a forwarded-message card.
- [ ] S4 "Worth checking with Alice?" asked before any drafting.
- [ ] S5 Draft chip inline after the lock; no Details/footer on drafts; voting approves; predicted
      position shown with the #9 mark and graphite dashed pill.
- [ ] S6 "Alice in Bob's eyes" story: Drafted by Juno → Approve → By Bob, in her voice; sealed
      number.
- [ ] S7 Bob's own story with sealed "How well will Alice understand this?".
- [ ] S8 one letter; second blocked while one is open.
- [ ] S9 Bob sees status only until Alice sends.
- [ ] S10 private thread, first-encounter card, steps 1-4, Send to Bob, Decline with confirm.
- [ ] S11 result for both with lower numbers shown; Skipped/Declined never shows a number.
- [ ] S12 one shared #9 mark component.
- [ ] No mock person or agent named Mira; counterparty is Alice.
- [ ] Build contract from adversarial review: every rule implemented, each with a test or a
      screenshot.

## Related

- P1437 (exploration record, v1-v4), P1458 (the entity, visibility, legal), P1465 (first
  encounter), P1455 (reply threads, next), P1456, P1457, P1459-P1462, P1466.
