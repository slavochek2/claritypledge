---
status: week
type: story
rank: 356
workstream: events
created_date: '2026-11-24'
tags: [calls, listening-game, role-card, events]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
related:
  - p1711
  - p1688
  - p1706
  - p1685
  - p1631
  - p1337
spec_review_hash: e18454250a81682ef19af20e76a685ceccae09eb2ba1edb0947111c424be21ce
spec_review_vendors: [gemini, openrouter]
---

# P1725: The Listening Game inside our own call

## Problem

> Founder framing, verbatim, 2026-11-24: *"It needs each person's card on their own video tile (orange "I am speaker" / blue "I am listener" with each side's job wording from docs/events/badges/), flipped by the person with one tap and seen by the partner, a pause state, and the live transcript and points in the same call."*

> Founder direction, verbatim, 2026-11-19 (recorded in P1711): *"our goal is having video calls like a mixture of how Telegram calls video calls ... and then parallel develop our idea that to integrate listening game"*

**Situation:** P1711 is building audio and video calls inside chat rooms, event chats included,
on its branch. It states the Listening Game is out of its scope and "needs its own spec". The
game exists today as a printed two-sided lanyard card (orange "I am speaker", blue "I am
listener", each side's job written for the partner, a pause band), as its rules and card on
`/game` (P1706); the game's step is in preparation (P1685), which does not show the cards yet
(decisions.md 2026-11-18). Nothing shows a role inside a call.

**Complication:** The change-lead group session is the product demo, and it runs online as a
fishbowl with no breakout rooms (decisions.md 2026-11-17 [product]). Sending the invitations waits
for this build: *"Sending waits until the group session can run on our own call with the Listening
Game inside it: P1711 (calls in the room), plus a game-in-the-call build that is not specced yet"*
(decisions.md 2026-11-24 [product], item 4). Every workaround (roles said aloud, a card held to
the camera, Meet backgrounds, only the founder wearing a card, a Meet add-on) was rejected on the
founder's principle that the session shows an experience the lead will have to run with their own
team, so they will feel every friction point (2026-11-17 item 4). The demo film that the invitation
carries (private film brief, version 4.7) already shows cards on call tiles, a ring, and the 0 to
10 question answered hidden and then revealed, none of which is built.

**Question:** What does a person in a call see and press so that the pair in the middle of a
fishbowl plays the Listening Game exactly as they would with the lanyard card, while everyone
watching sees the roles, and the transcript and points run in the same call?

## Appetite

Blast radius: medium to high. It adds shared state to every call that plays the game, state that
must be enforced on the server (only the wearer flips), and it decides where a call's transcript
comes from, which touches consent and a metered service. The call engine stays P1711's; two
decisions below (transcript source, call duration) need a change there, routed to P1711.
Reversibility: high for the card, flip, pause and bell (additive); medium for the transcript
source. Decision density: two founder decisions (1 and 3). The rest are settled below with a
recorded recommendation, following P1711's precedent: the founder delegated design to the agent on
2026-11-24 (*"it would be good if i am not in the loop"*) and approves the wording page before
calls open.

## Resolved Decisions

Rulings already made that this spec carries, newest first:

- **The call does what the demo film shows** (founder, 2026-11-24, on this spec: *"does it take
  into account what we learned from V4.6 ... where the card is and so on ... the bell ... take into
  account all of that"*). The film's rulings live in the private film briefs (versions 4.3 to 4.7,
  2026-11-19 to 2026-11-24); the ones this spec carries, each quoted from its brief:
  - **Cards only for people who opted in.** "Tessa, Elif and Oskar opt in, and each gets a card.
    Sofie and Noor take none: for them, it's a normal meeting." "No 'opted out' label anywhere"
    (DECIDED: "this is like blaming … No card, normal meeting for them"; brief 4.6 item 3). The
    brief left tying cards to opt-in in the product open (its O5); this spec takes the film's rule.
  - **The speaker starts the round and the listener accepts.** "Elif claims the speaker role
    (sliding the card up is the request); Tessa accepts and takes the listener role" (brief 4.3,
    founder corrections round 2); Tessa "must accept, or decline with a reason".
  - **The app asks the question, so nobody has to.** "The app prompts the numbers, so the speaker
    is never in the awkward position of asking" (brief 4.3). "Now the app asks both of them the
    question they opted in to answer … Neither sees the other's number until both have answered"
    (brief 4.6 item 4), each on their own screen, equal size: "How well do you think Tessa
    understands you?" and "How well do you think you understand Elif?"; both show "Answered ·
    hidden" until the reveal. Numbers are entered, never spoken (brief 4.5 item 4).
  - **Verified shared understanding is the lower number**, shown in the round history with both
    numbers: "Verified shared understanding 3 · 5 points gap · the lower of 8 and 3" (brief 4.4,
    decided 3 and 4); the product shows the gap in blue, not amber (brief 4.4, Fable finding).
  - **The explain-back is optional and not prompted by the app**: the speaker names the gap and
    asks whether it is worth bridging (brief 4.3 round 2; 4.5 item 2 "Tessa, is this gap worth
    bridging?").
  - **After each explain-back, both answer again**, hidden then revealed, and every pair of numbers
    stays in the round's history (brief 4.7 item 6: 8 · 3, then 9 · 6, then 9 · 9).
  - **The ring.** "During a listening round every tile in the meeting has a ring button; pressing
    it shows on the presser's tile and reaches the two people in the round, with a soft ring sound.
    It never names or marks anyone who opted out." Nobody says why they rang: "he doesn't say it.
    He just presses the ring … Tessa herself knows what the ring means"; "anyone in the meeting
    can press": yes (brief 4.7 item 5, DECIDED). The film rang the full bell sound, about 2.2 s
    (as-built 4.7, review finding 7: cutting it at 1.3 s was a defect).
  - **The round ends.** "Elif ends the listening round. The roles, and their rules, end with it,
    and they talk normally again", over the app's "End round" button and both cards going down
    (brief 4.6 item 5); name "listening round" (its O4).
  - **The result stays on the point.** After the call, the round's result is kept on the point
    card in the chat (brief 4.4, "After the call").
  - **Clarify is anyone's.** The person who feels something is off presses Clarify; their Mirror
    agent drafts the point privately; they must set their own position before they share it
    "with the meeting participants" (brief 4.7 item 3; brief 4.5 item 1: "Your Mirror · Only you
    see this", "Set your position first").
- **Sending waits for this build and P1711** (decisions.md 2026-11-24 [product], item 4).
- **The film shows interactions as the product does them**; the 0 to 10 question rises as a drawer
  in the person's own screen, never as an overlay on someone's video; both people are asked, hidden
  from each other, and the lower number is shown as their verified shared understanding
  (decisions.md 2026-11-19 [product]). The invitation carries the film, so the session must do what
  the film shows (settled in S2 below).
- **The card on `/game`** pictures the printed card, both sides, with the printed wording; its
  orange is allowed because it pictures the physical card (decisions.md 2026-11-18 [product],
  P1706). Wording lives in the print files and in `ROLE_CARDS` plus `RoleCards.tsx` (which draws
  "I AM" and "Your job:"); a change must update both.
- **The online session needs our own call with the game inside it**: each person's card on their
  own video tile, flipped by them, a pause, and the live transcript and points, all behind one
  link. The card works because it is always visible, the partner acknowledges it, the wearer flips
  it, and anyone can pause. A guest needs one device and records nothing (decisions.md 2026-11-17
  [product], items 3 and 4).
- **Card layout** (decisions.md 2026-11-09 [product]): "I am speaker" on top, "Your job" below, job
  text addressed to the partner; the pause band is parked at the top in play and pushed down over
  the instructions in pause.
- **Online events run a fishbowl with an observer and no breakouts** (decisions.md 2026-09-28
  [product]); the round rule of 2026-09-17 (no disagreeing while the lower number is under 8,
  numbers only if the listener opted in) stays in force inside a round.
- **The observer rings the bell** when the listener steps out of their role, or when one person
  takes most of the speaking time (the game's rules as written for preparation,
  `src/app/prototypes/events/prep/listening-game.ts`; copy, not code). The film widens who may
  ring to anyone in the meeting (above).
- **P1711 (branch, 2026-11-24 founder answers):** calls hold at most 8 people and end after 60
  minutes, enforced by the server; no call on iPhone or iPad; consent reuses the transcribe banner;
  calls stay founder-only until its privacy requirement (9) is done; the design is delegated to the
  agent and the founder approves the wording page.
- **Clarify drafts mid-conversation:** pressing Clarify during a recording drafts from the
  conversation so far, and pressing again adds a draft to the same thread (P1631, shipped).

## Solution

Built on P1711's call in an **event chat** (first release), on its tiles. The **host** is the
event's host. Calls in direct and group chats get no game in this spec. **Dependency:** P1711's room
tiles (`CallPanel`, `call-tile`) are not yet committed on its branch, so `/dev` on this spec starts
after P1711 is on main. This spec may change the order and size of P1711's tiles for the pair.

1. **A card on your own tile, if you opted in.** Everyone who opted in to the Clarity Meeting
   Principle for this event (preparation's Opt in answer, already stored per person and event)
   carries the card on their own video tile. Outside a round it is **down**: small, at the tile's
   edge, not covering the face. In a round it is **up**: the printed card's face, orange speaker
   or blue listener, "I AM", the role, "Your job:" and the job text for the partner (UI Contract),
   drawn by the `/game` card (`RoleCard`, which scales to its container), not the small S/L
   `RoleBadge` of event rounds. Everyone in the call sees it. A person who opted out or did not
   answer carries nothing: no card, no label, no mark. The tile's blue "speaking" ring must stay
   distinguishable from a blue listener card. Opting in from inside the call is possible (the
   event room's Opt in step), so nobody is stuck without a card for having skipped preparation.
2. **The speaker starts a listening round; the listener accepts.** A person with a card starts a
   listening round as the speaker by choosing a partner who also has a card; their card goes up,
   orange. The partner sees the request on their own screen and accepts (their card goes up, blue)
   or declines with a reason (the round rule of 2026-09-17 and the film's "decline with a reason").
   Starting is the request: there is no separate invite step. One round runs at a time in a call.
   When a round starts, both pair tiles become the largest tiles on every screen, visible without
   scrolling; when it ends, the grid returns. In the fishbowl the host says aloud who goes next;
   the host has no control to set a pair, and can end any round (item 7).
3. **The app asks both of them at once.** When the listener accepts, the app asks both, each on
   their own screen, never over anyone's video, in the person's own wording (UI Contract): the
   speaker "How well do you think {listener} understands you?", the listener "How well do you think
   you understand {speaker}?". Each enters a number from 0 to 10. Both see "Answered · hidden"
   until both have answered, then both numbers are revealed together into the round's history,
   which everyone in the call can see, with the lower number labelled as verified shared
   understanding and the gap shown in blue. Nobody is asked to say a number aloud. The app does
   not prompt an explain-back: whether a gap is worth bridging is the speaker's question, aloud.
4. **Ask again after an explain-back.** Either person in the round can press "Ask again" after an
   explain-back; the app asks both again, hidden then revealed as in item 3, and the new pair of
   numbers is added to the round's history (8 · 3, then 9 · 6, then 9 · 9 in the film). (S6)
5. **Flip with one tap.** Only the wearer can flip their own card. One tap turns it to the other
   side. Everyone in the call sees the new side within 2 seconds. The two cards are independent, as
   physical cards are: flipping one never flips the other. The partner acknowledges aloud, as with
   the lanyard; there is no acknowledge tap.
6. **The ring.** During a listening round every tile in the call has a ring button, including the
   tiles of people without a card. Pressing it shows the ring on the presser's own tile, seen by
   everyone, and plays the bell to the two people in the round through their own speakers, in
   full (about 2 seconds; the film's cut-off bell was a defect). Nobody types or says why. The
   sound reuses the projector's synthesized bell (`host-screen-parts.tsx`) unless it sounds clipped
   in a call; the 2026-10-02 "no sound anywhere" ruling (P1337) was for phones in a loud room. Ring
   buttons exist only during a round. (S2)
7. **The round ends.** The speaker presses "End round" (the host can too). Both cards go down, the
   roles and their rules end, the grid returns, and a pause ends with it. The round's history is
   kept.
8. **Pause.** During a round anyone in the call can pause and anyone can resume (the lanyard rule:
   anyone can pause). In pause, the band covers the job text on both pair cards and every person in
   the call sees that the round is paused. This pause is the game's, not the recording's:
   transcription goes on, and its label differs from the capture bar's Pause, which the consent
   model rests on (decisions.md 2026-10-02 [product], P1388).
9. **Transcript and points in the same call.** The call's transcript runs. Anyone in the call can
   press Clarify (P1631); their Mirror agent drafts a point from the conversation so far, visible
   only to them; they set their own position first, then share it to the event chat. Everyone in
   the call sees the point and sets a position on it without leaving the call. On a phone, points
   and positions open in a drawer from the bottom that leaves the two pair tiles visible. Where the
   transcript comes from is decision 1.
10. **The result stays on the point.** A round can be started from a point in the event chat
    ("Start a listening round" on the point, by someone who set a position on it). Its history, and
    the last verified shared understanding, is then kept on that point card after the call. A round
    started without a point keeps its history in the call only. (S7)

**State.** Rounds (who is speaker and listener, accepted or not, ended or not), card sides,
pause, rings and each round's answers are stored on the server, readable by everyone in the call
and read on joining, so a person who joins late or reloads sees the current cards and history.
Writes are checked on the server: only a person who opted in can start, be asked into, or accept a
round; only the wearer sets their own side; a person's own number is hidden from everyone,
including the host, until both have answered; only the speaker or the host ends a round; and only
people in the call pause, resume or ring. Card side, pause and bell must reach everyone within 2
seconds, so they cannot ride on event rounds, which poll every 4 seconds; and not on the call
engine's data messages, which P1711's token closes (`canPublishData: false`). The chat's realtime
channel, which already carries P1711's call state, is the expected path. The exact table and
function are `/dev`'s call.

`[FOUNDER DECISION 1: where the transcript comes from. Options: (a) the 2026-11-17 plan: the
founder's phone beside the laptop's speaker captures the whole call, a second device outside the
call, so in-tab echo cancellation does not touch it; untested on call audio, and every row carries
the founder's name; (b) each person's own tab transcribes their own microphone: the chat's
multi-mic room already exists ("is transcribing · Join", P1604), each row carries its speaker's
name, and the call's echo cancellation helps attribution; it asks each guest to press Join, so a
guest no longer "records nothing" (2026-11-17 item 3); (c) the host's laptop microphone only, in
the call's tab, where echo cancellation is expected to remove the other callers (UNVERIFIED; P1688
Decision Criteria 4 measures bleed but sets no pass mark); (d) the host's tab transcribes every
caller's received audio: banned by P1688's Non-Goal "do NOT route other people's call audio into
capture in software", and a consent change for P1711, so only if the founder lifts that ban.
Recommended: (b), because it is built, consented per person and names speakers; (a) as the
fallback that keeps "a guest records nothing" literally. Clarify's passages stay without names
either way, as P1631 decided.]`

`[FOUNDER DECISION 3: the call's duration. P1711 ends every call at 60 minutes; the change-lead
session is planned at 90 minutes (founder brief, 2026-11-24). Options: (a) the session is 60
minutes; (b) a call in an event chat may run to the event's scheduled end, up to 120 minutes, a
P1711 change that spends more of the monthly allowance; (c) a second call at minute 60.
Recommended: (b), because (c) drops everyone mid-session in a demo of friction and (a) leaves about
two short rounds. If (b), the change is made in P1711, not here.]`

**Settled by the agent (S1 to S7), overturnable at the wording review:**
- **S1** (revised 2026-11-24 to match the film) The speaker starts the round and the listener
  accepts; the host has no pair control and can only end a round. Why: the film's rule (brief 4.3);
  the first draft had the host set the pair, which the film contradicts.
- **S2** The ring and the 0 to 10 drawer are built. Why: the invitation's film shows both, and the
  2026-11-19 ruling says the film shows what the product does.
- **S3** Anyone pauses and anyone resumes. Why: the lanyard rule is that anyone can pause. The film
  shows no pause; the founder's 2026-11-24 framing asks for one.
- **S4** (revised 2026-11-24) Cards follow the per-event opt-in, not membership of the pair. Why:
  the film's rule (brief 4.6 item 3); the first draft gave a card to anyone the host put in the
  pair.
- **S5** New labels (flip, pause, resume, paused, ring, start a listening round, accept, decline,
  ask again, end round) are drafted in the site's style and listed on P1711's wording page.
- **S6** "Ask again" is pressed by either person in the round, not by the app. Why: the film has
  both answer again after each explain-back but never shows who triggers it; the app must not
  prompt an explain-back (brief 4.3), so it cannot time the question itself.
- **S7** A round links to a point only when started from that point. Why: the film keeps the
  result on the point card (brief 4.4) but never shows how the round knew its point; starting from
  the point is the one way that needs no guess.

## Invariants

- The card face reuses what `/game` draws (`RoleCards.tsx` with `ROLE_CARDS`), which the print
  files match; the tile adds no third copy of the wording.
- Only the wearer changes their own card's side; nobody else can, the host included. Enforced on
  the server, not only hidden in the interface.
- A person who opted out or did not answer carries no card, no label and no mark, anywhere in the
  call, including when they ring.
- A guest needs one device. Nothing here asks a guest to install, download, upload or print
  anything, or to open a second tab.
- The 0 to 10 question appears in the person's own screen, never over someone's video.
- The app asks the question; no flow requires a person to ask it aloud or to say a number. Neither
  number is visible to anyone, the host included, until both have answered.
- The app never prompts an explain-back.
- The game's pause never pauses or stops transcription, and is never labelled like the capture
  bar's Pause.
- P1711's invariants hold: one microphone opening per tab; no call on iPhone or iPad; no one's
  media reaches the engine except the founder's own accounts until P1711's requirement 9 is done.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A guest arrives on an iPhone or iPad and cannot join | MITIGATE | P1711 offers no call there; the invitation names the devices that work (desktop Chrome, Android Chrome) and preparation checks the device before the day |
| Calls stay founder-only until P1711's requirement 9 is done, so no guest can join | DEFER | Rehearsal uses the founder's own test accounts, which P1711's founder-only list allows; real guests wait for requirement 9 |
| Echo cancellation removes other voices from the host's microphone | MITIGATE | Decision 1; P1688 Decision Criteria 4 measures it |
| A guest presses the game's Pause expecting the recording to stop | MITIGATE | Distinct label; transcription state stays visible (Invariant) |
| Option 1(d) records guests who pressed nothing | MITIGATE | Not recommended; needs the founder to lift P1688's ban and a P1711 consent change |
| Per-person transcription multiplies a metered cost | MITIGATE | Cost Budget, filled before go-live |
| Card text is unreadable on a phone's tile | MITIGATE | Pair tiles are the largest; checked at 375 and 320 pixel viewports |
| A guest skipped preparation, so has no card and cannot be in a round | MITIGATE | The event room's Opt in step works from inside the call (item 1) |
| Nobody presses "Ask again", so the history shows only the first numbers | ACCEPT | The film's rule is that the app never prompts; the host can remind aloud |
| Orange on a tile the wearer taps goes beyond the "pictures the card" exceptions (RoleBadge 2026-10-04, P1706) | ACCEPT | It is still the card's face and colour; flagged on the wording page for the founder to overturn |
| The session runs past the call's 60-minute limit | MITIGATE | Decision 3 |

**Non-Goals**
- Do NOT change the call engine, its limits, its consent or its headers in this spec. Where
  decisions 1 or 3 need such a change, it is made in P1711.
- Do NOT add the game to direct or group chat calls.
- Do NOT add breakout rooms or tables (2026-09-28, 2026-11-17).
- Do NOT add a timer that swaps roles.
- Do NOT build the parked ideas from 2026-11-17 item 7 (a bot that posts points, a shared canvas,
  badges outside our call, breakouts the host observes).
- Do NOT build the observer's own 0 to 10 calibration (2026-09-28); observers give feedback aloud.
- Do NOT change the printed card or its wording.

## Acceptance Criteria

- [ ] In an event chat call with 4 people (desktop Chrome and Android Chrome), three opted in and
      one opted out: the three show a card down on their tiles; the fourth shows nothing, no label
      and no mark.
- [ ] One opted-in person starts a listening round as speaker with a second as partner; the second
      accepts; both cards go up (orange speaker, blue listener) with "I AM", the role, "Your job:"
      and the job text, seen by all four; both pair tiles become the largest. Choosing the
      opted-out person as partner is not offered. Declining with a reason leaves no round.
- [ ] On acceptance both are asked at once on their own screens in their own wording; each sees
      "Answered · hidden" until both have answered; then both numbers appear together in the round
      history, seen by all four, with the lower one labelled as verified shared understanding.
- [ ] A direct read (not through the interface) by the host's account of one person's number
      before both have answered returns nothing.
- [ ] Either pair member presses "Ask again"; both are asked again, and the history now shows two
      pairs of numbers.
- [ ] A pair member taps once and their card turns to the other side; the other three see it
      within 2 seconds; the partner's card does not change.
- [ ] A direct write (not through the interface) from the host's account and from a watcher's
      account to change a pair member's side is refused by the server.
- [ ] A person who joins or reloads mid-round sees the current round, sides, pause state and
      history.
- [ ] A watcher pauses: the band covers the job text on both pair cards and every screen shows the
      pause, while transcription goes on; a different person resumes.
- [ ] During a round, the opted-out person presses the ring on their tile: everyone sees the ring
      on that tile, both pair members hear the full bell, and nothing names or marks the presser
      as opted out. Outside a round there is no ring button.
- [ ] The speaker presses "End round": both cards go down, the grid returns, the history stays.
      The host can end a round the same way.
- [ ] A round started from a point in the event chat leaves its history and last verified number
      on that point card after the call.
- [ ] With 6 people in the call, at 375 and 320 pixel viewports on Android Chrome, both pair tiles
      are visible without scrolling, the card text on them is not clipped or cut off, and points
      and positions open without covering the pair's tiles.
- [ ] During the call a person who is not the host presses Clarify; the draft is visible only to
      them; they set their position, share it to the event chat, and each person in the call sets
      a position on it while the pair's tiles stay on their screen.
- [ ] The transcript, from the source chosen in decision 1, contains what at least two different
      people said.

## Done-When

- [ ] Decisions 1 and 3 are answered and recorded here and in decisions.md; S1 to S7 are on the
      wording page and not overturned.
- [ ] A rehearsal with the founder and two of the founder's test accounts on other networks and
      devices passes this bar (agent-proposed in the 2026-11-16 journey note, unconfirmed): a
      watcher can say at any moment who is speaking, who is listening and whether the pair is
      paused; a flip takes under 5 seconds; nobody asks "which one am I?". `[post-deploy]` the
      same bar with real guests once P1711 requirement 9 is done.
- [ ] Decision 3's choice is in P1711 (this spec does not change call limits).
- [ ] The Cost Budget table is filled with arithmetic.

## UI Contract

The card face is the printed card's (`docs/events/badges/single.html`), drawn by `RoleCards.tsx`
from `ROLE_CARDS`:

| Side | Header | Role | Label | Job (addressed to the partner) | Colour |
|---|---|---|---|---|---|
| Speaker | I AM | SPEAKER | Your job: | Explain back what I mean. / Ask me open questions. | #C2410C |
| Listener | I AM | LISTENER | Your job: | Ask me, “How well do you think you understand me, from 0 to 10?” | #1864AB |

The quotation marks are typographic, as in `ROLE_CARDS`. The listener card still says "Ask me…"
because the printed card does (Non-Goal); in the call the app asks for them.

From the film, used as written:

| Where | Text |
|---|---|
| Speaker's question | How well do you think {listener} understands you? |
| Listener's question | How well do you think you understand {speaker}? |
| Status of an answer before the reveal | Answered · hidden |
| Round's result | Verified shared understanding {lower} · {gap} points gap · the lower of {a} and {b} |
| End button | End round |
| Name of the mode | listening round |

Every other label follows S5.

## Cost Budget

Metered services touched: Supabase realtime and database (rounds, sides, pause, rings, answers),
transcription (decision 1) and the call engine's minutes (P1711, through decision 3). Filled in
the registry form of `docs/technical/metered-services.md` once decisions 1 and 3 are made. Working
arithmetic for one session with 6 people: about 3 rounds x 2 people x about 6 flips = about 36 state
changes, each delivered to 6 people = about 216 deliveries, plus a few pauses, bells and ratings,
which is small next to the rest. Transcription: one microphone = 60 or 90 stream-minutes per
session; under 1(a) or 1(b) with everyone transcribed, 6 x 60 = 360 or 6 x 90 = 540. Call minutes:
6 people x 60 = 360 participant-minutes, or 540 at 90 minutes, counted against P1711's monthly
allowance (the allowance itself is kept private).

## Related

- P1711 (calls in the room; excludes the game; its limits, invariants and wording page)
- P1688 (step one; Decision Criteria 4, echo and bleed)
- P1706 (the card on `/game`; `ROLE_CARDS`, `RoleCards.tsx`)
- P1685 (the game in preparation)
- P1631 (Clarify drafts points from a transcript, also mid-recording)
- P1337 (event rounds: roles on each person's own screen, host panel)
- decisions.md 2026-11-24, 2026-11-19, 2026-11-18, 2026-11-17, 2026-11-09, 2026-09-28 [product]
