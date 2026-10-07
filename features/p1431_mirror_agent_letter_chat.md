---
status: week
type: story
rank: 22
created_date: '2026-10-06'
tags: [mirror-agent, letters, chat, navigation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1431: Mirror-agent letter chat — your agent turns a conversation into your letter

## Problem

**Situation:** At an event, two people talk for a round. The room's transcript exists (P1390), and the
disagreement pipeline already knows how to find where people split, predict positions and draft
stories — but only for absent public figures, run by hand. A participant leaves the round with
nothing filed: no points, no story, no letter.

**Complication:** Writing a letter by hand in a 10-minute break does not happen. The founder's
direction (2026-10-06): the pipeline should run on the live conversation automatically, and the
person should *review* what their agent drafted rather than write it — "it's a chat where an agent
says something and then embeds a story or a point … predicts my position and I can change my
position and confirm … and only one thing at a time". And it is the real feature, not a test:

> "if we launch the feature, we launch it properly. And if we need to retract it, we retract it
> properly, but proper launch … this is not a test, we are actually building this."

**Question:** What is the in-app surface where a person's mirror agent walks them, one step at a
time, from their conversation transcript to a sent letter — and where does it live in the app?

**Why it matters beyond the event night (2026-10-07, founder, `UNTESTED`).** The 2026-10-06 night
showed that teaching the method live does not scale: a demo planned for 5-8 minutes ran 28. If the
agent does the heavy lifting, people do not need to be taught first. They talk, the agent drafts the
letter, they answer it (which is where the numbers come in), talk again, and the loop repeats, within
a team as well as across a disagreement. A non-target listener explained the product back
unprompted (2026-10-05) as "each person has a mirror agent; it finds the gaps and builds a bridge
between them, step by step, as far as you want to follow." That is shorter than our own pitch and
maps onto points and positions. Agent-to-agent bridging stays a non-goal (below): pitch it as the
direction, never as built. Fast filing from any transcript also means the surface can sit behind
other transcription sources later, not only P1390.

**Relation to verify-first hackathons (2026-10-07, `UNTESTED`).** Being explored as a vehicle: teams
verify the user's problem and each other's understanding before building. For the founder's vision
this surface is **not optional**, because it removes the coaching bottleneck. For a first pilot
sprint it **is** optional: the sprint must work on the method alone, with this chat used by teams
that opt in. **Falsifier:** at a pilot sprint, opt-in teams using the chat reach a shared problem
statement (all members 8+) no more often, or no faster, than teams doing the check without it.

## Appetite

Blast radius: high — the navigation decision (whole app moves to a left sidebar) touches every page.
Reversibility: medium — the chat surface is additive; the navigation move is a reversible but wide
UI change. Decision density: medium — most UX decided in the 2026-10-06 session (below); a few open.

## Decisions already made (2026-10-06 session — do not re-ask)

1. **It is a chat with your mirror agent,** laid out like Claude/ChatGPT: agent messages left with its
   avatar and name, your messages right in blue bubbles with your avatar, a message box that grows to
   ~6 lines then scrolls, Enter sends on desktop (Shift+Enter new line), Enter is a new line on phones,
   voice input **appends** to typed text.
2. **One thing at a time.** The agent posts one card per step; nothing asks a question until the
   step before it is answered.
3. **Order follows the disagreement pipeline:**
   1. **Private or public** — first. If private: **for who** (the conversation partner preselected,
      add others). If public: no recipient list.
   2. **The points where you split,** one at a time, as the real point card. The agent's **predicted
      stance sits above the point exactly as a profile shows a person's stance** ("AGENT on <you> ·
      Agrees"), never pre-selected. You tap your own position on the card (clearing works as
      everywhere). **Confirm** is visible but inactive until a position is picked; tapping it early
      highlights the card and says to pick first. **Reword it** sends feedback; the agent rewords the
      point. Your corrections adjust its later predictions.
   3. **Your story** — drafted from what you said, shown as the real story card under **your** name
      ("Drafted by your agent"), linked to the points via the card's own "N points" toggle. **Rate
      this draft** opens a 0-10 question in place, using the shared rating row: *"How well does this
      draft represent your intended meaning?"* 8+ approves; below 8 the agent asks what's missing,
      you type or speak, it redrafts (new card, old one shown as "Earlier draft").
   4. **The letter** — the same story card with its linked points open, showing your positions;
      private/public shown as an icon, not text; one action: **Prepare to send**.
   5. **Prediction** — *"How well will <partner> understand your story?"* with the story quoted, on
      the shared 0-10 row; its confirm button **is** the send ("Send to <names>" / "Publish").
   6. **Sent** — the letter card turns "Sent"; the agent says it will message you in this same chat
      when the partner has read and rated it. The chat stays as the thread for that conversation.
4. **Draft / Approved / Ready to send / Sent** are shown as a small tag above each card.
5. **Answered questions collapse** to their answer ("You answered 7/10").
6. **One chat per real conversation,** listed like Claude's recents.
7. **Navigation — option B: the whole app moves into one left sidebar, like claude.ai.** Top to
   bottom: logo + collapse; app sections Home, Letters, Partners, Groups, My Profile; New chat;
   Recents (agent chats); you at the bottom. Letters keeps Drafts / Sent / Inbox inside the Letters
   section. Phone: no top or bottom app menu; a header with ☰ opens the same sidebar as a drawer. The
   founder rejected the split (chat sidebar + app menus elsewhere) as jarring.
8. **No site footer** (Terms/Privacy) on this surface.

## Solution

Build the chat surface and the navigation move as decided above, starting from the prototype on
`feature/p1390-letter-review-proto` (`/tree/letter-chat`), which already implements decisions 1-6 and
8 on mock data and reuses the real point card, story card, rating row and agent byline.

Real build, beyond the prototype:
- **Input:** one conversation's transcript (P1390) → the disagreement pipeline's stages (fork /
  points, position prediction, story draft) run for this person, server-side.
- **Persistence:** points, positions and the story are saved as the person's own, with the chosen
  visibility; nothing is visible to anyone before send.
- **Sending** reuses the existing letter delivery and reading flow (`/letters`, `/letter/:id`); the
  prediction is the letter's existing sender prediction, not a new metric.
- **Preview** before sending uses the existing letter preview page (`/letter/:docId/preview`) once
  the draft is saved.
- **Navigation move (B)** is its own step with its own rollback (see Alternatives / Risks).

Architecture (where transcripts are processed, how the agent's turns are generated, how the chat is
stored) is for `/architect`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Drafting is too slow for a 10-minute event break | MITIGATE | Time the pipeline on a real recording before building the live trigger |
| The agent's prediction anchors people (they accept it unread) | MITIGATE | Prediction never pre-selected; you pick your own (decided) |
| Moving the whole app to a sidebar disorients existing users | MITIGATE | Ship it as its own step with a rollback; measure navigation use after |
| "Mirror agent of X" vs the site-wide "AGENT on X" byline reads inconsistently | DEFER | Founder decision below |
| Avatars of the person and their agent look alike (both the person's initial) | DEFER | Founder decision below (robotic version of the person's photo) |
| The point card's intensity tutorial pops up mid-chat after 3 plain picks | ACCEPT | Product-wide, shows once; revisit if it disrupts real users |
| Reused story card shows "0 verified" / ear 0 on a draft | DEFER | Needs a draft mode on the shared card — founder decision below |

**Non-Goals**
- Do NOT build agent-to-agent talk, public agent profiles for present people, or Buzz/relay
  integration — deferred (agents publish only for absent subjects).
- Do NOT add a new rating scale; reuse the shared 0-10 row and the letter's existing prediction.
- Do NOT show the partner's side (their letter, the gap, round 3) in this chat yet — separate step.
- Do NOT change the disagreement pipeline's public-figure runs.

## Acceptance Criteria

- [ ] After a recorded conversation, the person can open a chat with their mirror agent built from that transcript
- [ ] The first question is private or public; private asks for whom, with the partner preselected
- [ ] Each split point appears alone, with the agent's predicted stance above it and no position selected
- [ ] Confirm cannot advance without a picked position, and says why when tapped early
- [ ] "Reword it" plus typed or spoken feedback returns the point reworded
- [ ] The story appears under the person's own name, linked to the points, tagged Draft
- [ ] A rating below 8 leads to a redraft; 8 or more marks it Approved
- [ ] The letter shows the story with its points and the person's positions, and one Prepare to send action
- [ ] The person predicts the partner's understanding 0-10 and that same step sends the letter
- [ ] The partner receives it through the existing letter flow
- [ ] Voice input adds to typed text and never replaces it
- [ ] On a phone there is no app top or bottom menu in the chat; ☰ opens the sidebar drawer
- [ ] Every app page uses the one left sidebar (Home, Letters, Partners, Groups, My Profile) on desktop and the drawer on phones
- [ ] Verified at 320px, 375px and desktop

## Alternatives Considered

- **A letter-review screen with all guesses on one page** (`/tree/letter-review`, built and reviewed
  2026-10-06) — rejected: "we need one focus at a time … it's a chat".
- **A drawer of questions above the composer, "on behalf of" the agent** — rejected: questions
  should be part of the chat, answered inside the agent's reply to its own draft.
- **Chats inside the existing app menus** (top menu desktop, bottom menu phone, chat as a Letters
  page) — recommended by the agent as lower-risk; rejected by the founder in favour of a proper move
  to one left sidebar: no halfway navigation.
- **Split navigation** (chat sidebar + app menus elsewhere) — rejected as jarring.

## Open Questions

1. [FOUNDER DECISION: naming] "Mirror agent of <name>" in the chat vs the site-wide "AGENT on
   <name>" byline on cards — rename for mirror agents everywhere, or keep "AGENT on" in the chat too?
2. [FOUNDER DECISION: avatar] A robotic version of the person's own photo (generated, as for other
   agents), so person and agent are distinguishable?
3. [FOUNDER DECISION: draft card] Add a draft mode to the shared story card that hides "0 verified",
   the ear count and share?
4. [FOUNDER DECISION: anti-point] Show each point's opposite (the partner's side) as the pipeline
   does, or only the person's own point? Agent recommendation: not yet.
5. [FOUNDER DECISION: approval bar] Is 8+ the right "good enough" for the story?
6. How the mirror-agent sense here relates to P1104's agent accounts for named speakers (decisions.md
   2026-08-19 notes the term is overloaded).

## Related

- [P1390](p1390_room_audio_fills_live_from_the_transcript.md) — the transcript this reads from.
- [P593](p593_post_session_clarity_pipeline.md) — post-session pipeline → mirror-agent letter by
  email; overlaps (sifter extraction, draft visibility). Reconcile before `/architect`.
- P1104 (done) — agent marker and avatar ruling.
- decisions.md 2026-08-19 — the mirror agent is a design, not a shipped surface; keep definitions.md accurate.
- Prototype: `/tree/letter-chat` on `feature/p1390-letter-review-proto`; demoed as presi4 slide 20
  (fictional Bob and Alice on the real ikigai1 points).
