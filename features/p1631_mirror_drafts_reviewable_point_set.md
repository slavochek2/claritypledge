---
status: week
type: story
rank: 101
workstream: clarity-chat
created_date: '2026-11-05'
tags: [clarity-chat, mirror-agent, points, drafting, transcription, live]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
spec_review_hash: 5356641baae1ea4ef20edf4041037c743996abe7d0c9942dff02820a76e55b3f
spec_review_vendors: [gemini]
---

# P1631: Make a point during a live conversation, and share it

## Intention

**At any moment in a real conversation, online or in person, you can pin down what's being discussed, see where each person stands, and ask from there.** (Founder confirmed, 2026-11-05.)

## Problem

> Founder, 2026-11-05: "Strongly agree, slightly agree with what? With exactly the words that I have said that maybe it is changing while we talk? A point is fixed. There is something there."

In a live conversation the product gives its user nothing. A letter cannot help at a first meeting: the change-lead event brings together people the host has not met, so there is no gap yet for a letter to reveal. Letters belong after the event.

Without something fixed, a question about meaning has nothing to hold on to. Founder, 2026-11-05: *"Strongly agree, slightly agree with what? With exactly the words that I have said that maybe it is changing while we talk? A point is fixed. There is something there."* Once each person has taken a position on a fixed sentence, "what led you to this position?" and "how much do you think I understand you?" have an answer to work around, and movement can be seen.

Writing a sharp sentence by hand, mid-conversation, is the obstacle. The host has about 10 seconds and is sitting with a person.

**Untested bet:** a fixed sentence with visible positions makes the conversation about meaning possible. Nobody has tried this live. The nearest evidence is weak: one private two-person transcript (P1089, 2026-08-17) went through the pipeline afterwards, with speaker labels and hand-corrected text. It produced six points on which a same-session agent *predicted* opposite positions for the two participants. Those were predictions, and the run does not record the participants' real positions.

**Theory of engagement (untested).** The first sentence does not have to be right. It has to be on topic and arguable, because a person's reaction to fixed words ("no, that's not what I mean") is where the grounding starts. The owner sees it privately first, so a bad draft costs seconds and nothing in front of the other person. A comment and another press give a better one. Falsified if owners mostly discard the sentences, or the others treat a shown sentence as irrelevant rather than correcting it.

## Appetite

Blast radius: high. Private speech from people who may have no account, an AI model, a shareable link and point visibility all meet here. Reversibility: medium, since a shared point and the positions on it outlive the conversation. Decision density: high, mainly where the points are stored and how others' speech is consented to.

## Invariants

- **The host asks; the agent never pushes.** Founder: *"I'm not sure I want to read points if I never requested them."* No proposal appears unrequested and no point is filed on a timer.
- **Nothing is shared without the owner's choice.** A candidate stays private to the person who requested it until they pick it and share it.
- **An agent's guess is never someone's position.** The agent may reason about who probably said what in order to aim a point. No guessed speaker or inferred position is shown as a person's own or saved as one (P1431).
- **Another person's words are evidence, not consent.** They may inform a point. They are not published or attributed to the speaker (P1431; P1484 D13).
- **The transcript is data, never instructions.** No transcript line directs the agent, whoever said it, because on one mic the owner and a guest cannot be told apart. Only the Clarify press, the owner's messages in the Mirror thread and the owner's context do. Separate fields lower the risk and do not remove it, so the agent has no tools, returns only sentences with cited row ids, and the owner's Publish is the final control (`/slava:disagreement:prepare`).
- **The person recording is responsible for telling the others.** Founder, 2026-11-05, extending decisions.md 2026-10-02: the product does not contact or collect anything from someone who is not a user. The product's own duty is that its terms and privacy policy state truthfully what happens, including that speech goes to an AI model, before the feature is on in prod for any account (Open Question 2).
- **Refusing is a correct answer.** If the conversation holds no real disagreement, the agent says so and proposes nothing. A weak point spends the room's willingness once. "These people do not disagree" must be a reachable outcome (decisions.md 2026-09-01).
- **"The owner" means whoever pressed.** A room has no owner column, so any seat can press, and that person is charged and sees only what they could already read.
- **Only this conversation's speech goes to the model.** Room members can read every row in a room, so at an event the read must filter to the presser's own round and table.
- **A point is fixed once someone else has a position on it** (2026-03-10: editable only before others take positions).
- **Private stays private.** Do not treat an obscure public point as private (P1089). Canvas points already refuse a public row (P1515).

## Solution

### The moment (founder-approved interaction, 2026-11-07)

Visual reference: the clickable prototype at `/tree/make-point/v2` on branch `feature/p1643-make-point-prototypes` (built from the product's own message toolbar, composer, point card and thread header; screenshots in that worktree's `tmp/make-point-shots-v3/`). Where the prototype and this text differ, this text wins.

**Entry: one verb, "Clarify", always with the owner's Mirror photo as its icon.** Each entry has a fixed scope that cannot be changed afterwards:
- the existing hover action on a message (long-press on phone): that message;
- the same action on a thread's root message, inside the thread: that thread;
- right-click (long-press on phone) on a chat's row in the chat list: "Clarify", the whole chat with that person or channel;
- the existing live transcribe banner at the top of the chat: a "Clarify" button styled like its pause and stop buttons. Scope: the running recording up to that moment, a snapshot labelled with its time.

There is no "Clarify chat" header button, no Mark, and no scope selector.

**This changes today's Clarify.** Today Clarify stages the message above the main Mirror chat's composer and waits for a note (`use-message-actions.tsx`). It now opens a new Mirror thread and starts a point at once. Right-click on a chat row already opens a menu (`ChatList.tsx`); long-press on phone is new.

**Drafting happens in a new thread in the owner's Mirror chat, never in the shared chat.** The item arrives attached, and making a point starts at once, with no extra Send. Desktop: the Mirror opens as the right panel and the source stays visible on the left. From a thread, the thread slides to the left slot with "← Chat" at its top left (this also closes the thread). The Mirror panel has × only, which restores the previous layout exactly and keeps the draft in the Mirror. Below 1280 px, and on phone, the Mirror is full screen with the existing Back, a distinct tint, and the header "Your Mirror · Only you see this". A banner reads "From chat with {name}". [FOUNDER DECISION: copy]

**One point at a time.** The Mirror proposes one point as the product's own point card with a "Draft" pill. The owner can:
- edit its text directly while it is a draft (the same behaviour as canvas drafts, P1614);
- refine it by chatting ("sharper", "about pricing instead"). This revises the current draft and never adds a new point;
- set their own position (no hint that it is optional);
- press **Publish** (the one primary button) or **Another point** (secondary) for the next draft.

Clarify always starts an attempt at once. If that attempt finds no real disagreement and the owner gave no instruction, it returns two or three tap choices of what to test in place of a draft; tapping one drafts that. An explicit instruction always drafts.

**Every point is private and stored from its first draft.** A draft is a private point row owned by the owner, so × keeps it, editing changes it, and nobody else can read it. Visibility is fixed at creation, so there is no toggle. Editing a draft's text needs its own owner-only write: P1614's `canvas_draft_edit_point` works only inside a canvas draft, so either reuse it by making the chat's set a canvas (Open Question 1) or add an equivalent. Failures appear in the Mirror thread with Retry. Cited lines show only in the Mirror draft, marked as possibly wrong, never on the shared card.

**Publish posts that one point into the source chat or thread** as the product's point card, with the same header, actions ("…" menu, Details, Add story) and position buttons as on a person's profile. There is no "Asked by" line. For each viewer, the header shows the other person's position the way a profile does (`point-owner-header.tsx`): before the viewer has a position, "{name} took a position · set yours to see it"; after, "{name} · Disagrees"; if they have none, the existing "No position". The viewer's own position is on the buttons. Hiding until the viewer answers is new: today the profile shows it to everyone, and the hiding must happen on the server, not only in the page. In a group: before, "{n} took a position · set yours to see them"; after, the card's existing spread row plus Details for who said what. The "…" menu adds "Copy link" for someone who is not a user yet. [FOUNDER DECISION: copy]

**Artifacts.** A new first item in the chat's three-dot menu lists what has been shared in this chat: "Points in this chat (N)", canvases sent here, and rounds (the existing "My rounds" moves here). Points open a `/stake`-like page with the real point cards in published order. Right-hand panels push the chat aside, never cover it. Media is a later idea, not this spec.

### How the agent writes a point

The aim is a sentence the people in this conversation would land on at opposite ends. Founder: *"it's about creating such a point that it gets us polarized. For example, I would strongly agree and they would strongly disagree."*

**Reuse the disagreement pipeline almost as it is.** `/slava:disagreement:prepare` and the point definition in `docs/story-point-model.md` are the source; do not write a new method. The skill already allows the room to be "the two people who had the conversation", and a private two-person transcript has been through it (P1089). Keep one source of truth for the rules rather than a drifting copy; how is decided at build.

Only what cannot apply live changes:

- **Skip:** acquiring video, the approved run file and its seals, the sealed predicted split, the audience floor, and the loss ranking that takes more than seconds.
- **Who is arguing:** the skill receives approved opposed arguers from `/slava:disagreement:select`. Here nobody has chosen them, so the sides come from the conversation and the owner's context. Its own rule applies: where attribution is ambiguous, mark the quote unattributed rather than guess.
- **Is there a disagreement:** the skill runs after `select` has proved the topic contested. Here that proof has not happened, so it is the refusal test below.

**The refusal test uses the skill's own rule:** *"If you cannot write the chain, you have a guess, not a synthesis."* For each candidate the agent writes what would commit one side to agree and the other to disagree, from the conversation or the owner's context. If it cannot write both, it refuses. The skill also finds points where nobody voiced a disagreement, so a voiced clash is not required.

The pipeline's record is mixed, and a live unnamed transcript is new for it. On 2026-09-01 a run shipped five points the founder agreed with entirely, and the later `ai-ikigai` run needed several founder rounds and a hostile review. So this reuse has to pass the Done-When run before build. On an unnamed transcript, one person weighing both sides can look like two people, and 30% word error can drop a "not".

**Related, not invented.** Founder, 2026-11-05: a polarizing point on something related is better than an exact point nobody would argue about. So a point may go beyond what was said, as `prepare` already intends. It must stay on the conversation's topic, and what was said or the owner's context must give a reason each side would land where they do. A sentence that splits people only because it raises a new, unrelated fight fails this: it finds a difference they already had, not one about what they are discussing.

**A split is the aim, not the score.** Tuning a sentence until it splits people will always appear to work, and looks the same when people do not actually disagree (decisions.md 2026-09-01). So nothing retries until a split appears.

**Who said what.** The first version usually has one mic, and live rows carry the mic holder's name, not the speaker's. So passages show no names at all, and quote text is fetched from the cited transcript lines, never from model output. Live text is also rough: about 30% word error against the whole-file transcript even at 13 s slices (`slice-recorder.ts`), so passages are marked as possibly wrong. The cleaned, per-speaker text from P1596/P1604 exists only after a round or after Stop, so it is not available mid-conversation. Speaker splitting from one mic is P1601. It is not a prerequisite unless the Done-When run shows points need it. Its own benchmark decides whether it ships: earlier measurements credited the minority speaker 0 of 10 times. Linked stories (P1632) need better attribution and own that problem.

### Where the points live

All points published in one chat form that chat's private set, shown under Artifacts. Store them reusing Clarity Canvas access (direct sharing with the chat's people first, a link only for someone who is not a user yet), as Open Question 1 decides. A signed-out link holder sees counts, not names. `get_canvas` returns names to any token holder today, so it must change for anonymous callers.

### Later parts of this spec

- **Part 2, after the live part: upload.** An upload control in the main Mirror chat for a transcript or document, using the same point drafting. The `+` menu gets a point entry and the paperclip still means attach an existing artifact. Founder order, 2026-11-05: live first, then upload and share. Until then, a letter after a meeting is built by hand.
- **P1632 and P1431 follow** for stories and letters. Neither is needed for the live experience.
- **If the Done-When run shows points need better text:** clean continuously in the background, in pieces of a few minutes, and draft from cleaned text plus the rough last minutes. Existing cleanup transcribes 60 s pieces per mic but runs only after a round or Stop, so this is a change to when it runs. It needs its own numbers: extra cost per hour, unless the end-of-session clean reuses its work.

## Risks / Non-Goals

| Risk | Label | Response |
|---|---|---|
| Others on a call are not heard: wearing headphones, the owner's device hears only the owner | MITIGATE | State the capture requirement before the meeting and test it. Online capture needs speakers until something better exists |
| One device cannot run a call and capture at once (phones especially) | ACCEPT | Use a second device. Not verified on any device yet; the founder recalls it failing on his Samsung |
| Newest speech is missing when the button is pressed (live slices are 13 s, with processing on top) | MITIGATE | Sending the unsent slice on press is possible, but short slices transcribe much worse and the next slice would duplicate it. Measure first; only the presser's device can do this |
| A forwarded link shows who holds which position on a sentence built to split people, and nothing expires it | MITIGATE | Open Question 5. `get_canvas` returns names to anyone with the token |
| The agent takes far more than 10 seconds | MITIGATE | Measure. The conversation continues while it runs. A failure must never interrupt capture |
| Points are weak or lean to one side, and that happens in front of the people the host wants to win | MITIGATE | The owner picks before anything is shared. Run the Done-When test first |
| A point built to polarize feels like a trap to the other person | ACCEPT | The host chooses when to use it. Watch for it in the first conversations |
| The policy says no previously transcribed text is sent with room transcription, and this feature sends exactly that | MITIGATE | Update the terms and policy, with a notice, before the feature is on in prod (Open Question 2) |
| The agent refuses too often, or never | MITIGATE | The Done-When evaluation includes conversations with no real disagreement, and sets the threshold from them |
| Signed-out positions are invisible to the owner | ACCEPT | Founder: they can say it. Do not build an anonymous write path here |

**Non-Goals:** points written for people to agree on (founder, 2026-11-05: if we already agree, why would we need a point?), collecting anything from non-users, unrequested proposals, floating bullet points on a timeline, Google Meet or Zoom integration, paid meeting bots, our own video platform, speaker-label correction, recognising the owner's voice, stories, letters, filing spoken numbers, group-scoped public points (P1089), and a new visibility class on `points`.

## Acceptance Criteria

**Entry and drafting**
- [ ] Clarify on a message, a thread root, a chat row (right-click or long-press) and the live banner each opens a new thread in the owner's Mirror with that item attached, and the first draft starts without another tap. Every entry is labelled "Clarify" with the Mirror's photo.
- [ ] Desktop: the Mirror opens on the right and the source stays visible on the left. From a thread, the thread moves left with "← Chat". × restores the previous layout exactly. Phone and below 1280 px: full screen with Back, tinted, "Your Mirror · Only you see this".
- [ ] The Mirror shows one draft point at a time as the product's point card with a "Draft" pill. The owner can edit its text directly, refine it by chatting (which revises the same draft), set a position, Publish it, or ask for Another point.
- [ ] On a conversation with no real disagreement and no instruction, the Mirror proposes nothing and offers two or three tap choices of what to test. An explicit instruction always produces a draft.
- [ ] Each draft cites the transcript or chat lines it came from, with no names, and quote text is read from those rows, not from the model.
- [ ] Every point is created private and stays private. A draft survives × and reload, and only its owner can read or edit it.
- [ ] Before a viewer has a position, the server returns only whether each other person has a position and how many do, never which position. A test asserts this at the database read, not only on screen.

**In the chat**
- [ ] Publish posts one point card into the source chat or thread, with the profile card's header, actions and position buttons, and no "Asked by" line.
- [ ] A group chat's card shows "{n} took a position · set yours to see them" before, and the spread row after. A publisher with no position shows "No position".
- [ ] Before the viewer has a position, the header reads "{name} took a position · set yours to see it". After, it reads "{name} · {position}". Both people see the other's position this way.
- [ ] Artifacts is the first item in the three-dot menu. It lists "Points in this chat (N)", canvases sent here and rounds, and "My rounds" no longer appears separately. Points open a list of the real cards in published order. Panels push the chat aside.

**Safety and limits**
- [ ] Across at least 20 adversarial transcripts run against the real model, no draft follows an instruction spoken in the room, and at most 1 in 10 embedded claims becomes a draft [FOUNDER DECISION: bar; agent-proposed]. A stubbed model does not count.
- [ ] At an event, Clarify on the live banner reads only the presser's own round and table. A test seeds another table's speech and asserts it never reaches the model.
- [ ] A failed generation shows a message, keeps recording, and charges no more than the spend rule allows.
- [ ] The time from Clarify to the first draft is measured on a phone and recorded here.
- [ ] A person outside the chat cannot read the points. A not-yet-user receives a link, and sees counts, not names, until signed in.

## Done-When

- [ ] **First, run the pipeline on stored material, before building.** An agent runs the near-unchanged skill on real transcripts and on public videos it finds, whole and cut to the first 10 minutes: at least one conversation with real disagreement, one friendly conversation with none, and one where a single speaker argues both sides. It runs each on the rough live text and on cleaned text, and with speaker labels and without. This shows whether a press needs a better transcription of recent minutes first, and whether speaker splitting (P1601) has to come first. **Return to the founder before building if** it invents points on the no-disagreement cases or the points on real disagreements are not ones he would use. The founder's part is reading a short result.
- [ ] **Build the whole flow in this spec, in this order:** Open Question 1; a Mirror draft from one message, owner-only, with no Publish; Publish into the chat; the hidden-until-you-answer header; Clarify from a thread root and the chat list; Artifacts; Clarify from the live banner last. The terms and policy update is announced before it is switched on in prod for any account.
- [ ] **Then 3 real conversations on prod with the real flow,** at least one with someone the host has not met. Founder, 2026-11-05: it runs on prod because random people cannot use test or localhost. **Pass, set before the first run:** in at least 2 of 3, someone points at a specific word without being prompted, the sentence was usable without a rewrite (founder accepted, 2026-11-05), and at least two people took different sides (added because pointing at a word alone can pass on a merely confusing sentence). Record delay, cost per point and capture quality here. One group event rehearsal follows.

## Open Questions

1. **Where do the chat's points live? (decide first; blocks Publish.)** Verified from code: a canvas point must carry a box tag (`_canvas_point_in`), readers see only published versions, and a version shows exactly the points tagged with it (P1515, P1536). A new version per share is rejected: a reader stays on the version in their address and misses new points. Recommendation: one canvas per conversation, shared directly with the chat's people, with one version that grows and a reserved tag accepted only by the access functions. Drafts are private point rows of the owner, tagged only on Publish. A private point is unreadable to chat members without this sharing path, so nothing in "In the chat" can pass until this is built. This is a stated exception to "a published version never changes", and each list that shows canvases needs a filter. Rival from review: one private point with its own small share record, and no canvas. Decide at build with the code open.
2. **Consent. Answered by the founder, 2026-11-05: the person recording tells the others and follows the law; the product collects nothing from non-users.** The app already says so at the record control (`capture-controls.tsx`: "you're the one recording, so let the people around you know"). Still owed by the product: (a) update the terms and privacy policy wording, announced as a notice before this is on in prod, because the 2026-11-04 rule says a new purpose is announced before it starts; (b) founder decision, 2026-11-05: no separate legal check for this spec. P1276 stays open separately.
3. **Who pays:** the presser, under the existing Mirror spend caps (settled in Invariants).
4. `point_position_history` is written by a trigger and the owner can read rows on their own points, so it likely gives movement without a new table. `get_canvas` does not return it. Confirm at build.
5. **Sharing defaults, following the founder's rule that private means only the people I share with (2026-11-05).** Reuse Clarity Canvas sharing: share directly with a known person, event or group first, and use a link only for someone who is not a user yet. A signed-out link holder sees counts, not names. The owner closes the link; it does not expire by itself, because closing a link hides the positions of people the link alone admitted (`canvas_link_contributors`). Closing it leaves direct shares working.
6. **Which component is "the live banner"?** The chat's capture bar (`room-capture-bar.tsx`) and the chat's transcribe line (`ChatTranscribe.tsx`) both qualify. Use the one shown at the top of an open chat while recording; confirm in code before building.

## Pre-deploy Checklist

- [ ] Secrets and the prod switch for the new model call (same fail-closed pricing as P1536).
- [ ] Deploy the edge function, then smoke test on prod with a consenting account.
- [ ] Privacy policy updated and any required notice given before the feature is switched on.
- [ ] Check Sentry for new errors in the first 10 minutes.

## Related

- [P1431](p1431_mirror_agent_letter_chat.md) and [P1632](p1632_mirror_drafts_linked_owner_stories.md) — letters and stories, after this.
- [P1536](done/2026-06-10/p1536_canvas_first_draft_from_owner_material.md) — owner-review drafting and spend rules; its boxes are not reusable as they are.
- [P1089](p1089_audience_scoped_point_list.md) — the parked group-audience problem and the evidence above.
- [P1596](done/2026-06-10/p1596_event_transcripts_one_speaker_per_sentence.md), [P1604](done/2026-06-10/p1604_transcription_belongs_to_a_chat.md), [P1601](p1601_one_phone_several_speakers.md) — capture and attribution.
- [P1390](p1390_room_audio_fills_live_from_the_transcript.md) — numbers from speech, not needed here.
- [P1457](p1457_clarity_chat_data_import.md) — later source integrations.

## Cost Budget

Before release, measure input and output tokens on representative consented transcripts, including rejected candidates. Each request sends the whole conversation so far, so cost grows with length: report cost per point at 10, 30 and 60 minutes, using verified provider prices. Do not reuse P1536's canvas estimate.
