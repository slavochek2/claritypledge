---
status: in-progress
type: story
rank: 357
workstream: clarity-chat
created_date: '2026-11-25'
tags: [clarify, mirror, visibility, share]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
spec_review_hash: f0bcba82e5fd7623ddc0f63e8016920ec15e98528717a4162c9a32a0c4ca2387
spec_review_vendors: [codex, gemini, openrouter]
---

# P1722: Make a point alone with the Mirror, private or public, using the screens we already have

## Problem

**Situation:** Clarify (P1631) drafts a point in the owner's Mirror from a message in a chat with other people, then posts it back with "Publish to chat". Every Clarify point is private. The Mirror chat itself has no Clarify and no Transcribe, so a person alone cannot talk or type an idea and make a point from it.
**Complication:** The founder wants to make points alone and to make some of them public, so other people can take a position. A prototype at `/tree/solo-clarify` answered this with new UI (a visibility picker, a tag input, a new Share button, many Clarify chips). The founder rejected it on 2026-11-25:

> "what you build is like huge overcomplication and UX UI mess... you invented a completely new share button despite the fact that we already have share button on many points we just need to bring it in where it was not... Just redo it properly with minimum changes."

> "I think private public should be changed right here. Now I just click and select something else or not... I just click if it's a draft and maybe it is blue... so that I understand that I can change it, that it's a button."

> "hashtag is just edit with a hashtag on edit, right? And then we just need to add this functionality to mirror agent... transcribe and clarify on messages and clarify on hover on messages in chat and clarify when transcribing is not available with Mirror Agent, but it should."

On the button in the Mirror chat: "Practically, it goes to the chat, right? ... is it not the same?" It is: Publish to chat posts the card into the Mirror chat, where the owner finds it. The founder's original request also asked for a warning about sensitive content before a point that came from a chat goes public, and for one microphone shared by two people, one of them not a user.

**Question:** What is the smallest set of changes to existing screens that lets a person make a point alone, choose private or public on the draft, tag it by typing `#tag`, and share a public point?

## Appetite

Blast radius: medium-high. It touches the Clarify publish path, point visibility and position rules (privacy), and the Mirror chat for everyone who has Clarify. Reversibility: medium. The migrations change Clarify functions and one position rule, and a point published public cannot be made private without breaking the share links already given out. Decision density: low. The founder decided the list and the open questions on 2026-11-25 (Resolved Decisions).

## Invariants

- **No existing point's visibility ever changes (P586, `trg_point_visibility_immutable`).** The trigger stays as it is. A draft's point is created private and stays private. A Public choice is applied by creating the public point at Publish (Solution 1). So the point that becomes public was never readable by anyone but its owner before that moment.
- **Visibility is chosen only on a draft that was never published.** The draft records its first publish on its own `clarify_drafts` row, and that record never clears. Share rows are not enough, because they cascade away when a message or chat is hard-deleted. A deleted card does not reopen the choice. Reason: the 2026-11-13 ruling "A private point lives in the one chat it was published to" says positions belong to the point and a private point is never re-shared. Republishing a point that chat members already answered as Public would show their positions to everyone.
- **Default is private, on every card.** Every new card starts Private, including a refine and "Another point", as today. Only the owner's own switch on a card makes it Public.
- **A refused publish changes nothing.** If any step of a Public publish is refused, no public point and no card exist afterwards. The private draft point, the owner's position and the draft pointer are as they were.
- **Tags come only from text the owner typed.** This is this spec's rule, stricter than `.claude/rules/src.md`, which limits agent-authored system tags. The server enforces it, not just the client.
- **A private point never shows on a profile or feed** (2026-04-03 ruling, P634).
- **A private Clarify point keeps every P1631 rule unchanged:**
  - who reads its card, and the chat-scoped position rule
  - stories bound to its card
  - erasure
  - its exclusion from letters
  - its publish routing in chats other than the Mirror

## Solution

Every change lands on a screen that exists today. Nothing new is designed except the warning dialog the founder asked for.

1. **Private/Public on the draft.**
   - **The control.** The visibility mark on the Clarify draft card (today a grey lock with a tooltip) becomes a control on the latest card of a never-published draft. It is labelled "Private" or "Public", styled with the product's blue bordered action (design-system rule 2), and switches between the two on click or keypress.
   - **Where it reads as a badge.** On an earlier version, and on a card of a draft that was ever published, it stays a read-only badge.
   - **Where the choice is stored.** On the owner-only `clarify_drafts` row of that card. The server refuses a change on a draft that was ever published or is not the latest card.
   - **At Publish with Public chosen.** In the one publish transaction, `clarify_publish` creates a new `public` point with the same statement and tags, gives the owner the same position on it, points the draft at it, posts that point's card, and removes the private draft point. If any step is refused, the whole transaction rolls back (Invariants).
   - **Nothing a draft is linked to blocks the switch.** Before publish only the owner can reach the draft point, so the only things that can hold it are the owner's own links: a private story or a canvas draft. P586 runs one way. A public story may not hold a private point, but a private story may hold a public point. So going public is always allowed, and those links move to the new public point instead of being lost when the private one is removed. Each table referencing `points(id)` has a fixed rule:
     - **Move to the public point:** `story_points`, `story_point_history`, `canvas_draft_points`, `canvas_added_stories`, and the draft's own `clarify_drafts` row (moved before the private point is removed).
     - **Do not move:** `point_positions` and `point_position_history` on the private point. They go with it. The public point starts with one fresh owner position, so the owner's private changes of mind before publish never appear on the public point.
     - **Refuse the publish if any exist:** `point_chat_shares`, `point_chat_stories`, `letter_point_responses`, `event_round_tables`, `badge_points`. None can exist on a never-published draft.
     - /dev re-runs the `REFERENCES points(id)` grep at build time and assigns any table not listed here before building.
   - **Retry and re-post.** `clarify_publish` accepts the draft's point whether it is private or public. A retry after a lost success response returns `already` with the same card. If the owner deletes a public card, Publish to chat may post the same public point again, the same way P1631 handles a deleted private card today.
2. **Tags by typing.**
   - **Model text.** Model-written draft text never contains `#`: the server removes it before a draft is stored. So every `#tag` in a draft's text was typed by the owner.
   - **Saving.** On each save of an edit, the client reads the hashtags in the saved text with the shared rule (`extractHashtags`, P1660). `clarify_draft_edit` stores only tags that appear as `#tag` in the saved text, and refuses any other. Removing a `#tag` removes the tag. The `#tag` stays in the text, as on other points.
   - **Display.** The draft card shows tags the way point cards already show them. Today `ClarifyDraftCard` renders none.
   - **No tag box.** There is no tag input.
3. **Clarify in the Mirror chat.**
   - **Where it's offered.** Clarify on a message (hover bar, message menu, long press) and the Mirror's chat-row Clarify work in the Mirror chat as in other chats. In the Mirror, Clarify is offered only on the owner's own messages: typed messages, voice notes, and transcribed lines. It is not offered on:
     - Clarify roots
     - forwarded copies
     - shared point or story cards
     - Mirror agent replies
     - replies inside Clarify or canvas-draft threads
   - **Server checks.** The client gate (`useClarifyAvailable`) and the refusal in `clarify_start_chat` both lift for the Mirror. For a Mirror source, `clarify_start` refuses a pressed row in the list above. `clarify_start_chat` leaves those rows out when it chooses its anchor, rather than refusing, so a recent card or forward in the Mirror never blocks the chat-row Clarify. The chat-row Clarify in the Mirror leaves forwarded copies and shared cards out of the rows it sends to the model.
   - **New point in the Mirror's + menu.** In other chats, the composer's + offers "New point". The Mirror's + (`CanvasPlusMenu`) offers only "New canvas" and "Clone a version" today, and its own header says "points join this menu in their own specs". It gains the same "New point" item, which opens the same New point thread, and its server path (`clarify_start_chat` with `p_draft = false`) lifts for the Mirror.
     - **An empty Mirror.** Today that path returns `empty` when the chat has no message to hang the thread on. In the Mirror, New point works in a chat with no eligible messages, because making a point alone from nothing is the case this spec is for. /dev picks how the thread root is made without an anchor.
     - **When the + shows.** Today the Mirror's + renders only while canvas drafting is available. It renders when Clarify or canvas drafting is available, showing "New point" when Clarify is available and the two canvas items when canvas drafting is. Founder, 2026-11-25: "should we not add this new point functionality also to the mirror agent plus button".
   - **"Another point" waits for a first draft.** Today a New point thread shows "Another point" before anything was drafted (`mayAddAnother` is true for an empty thread). Founder, 2026-11-25: "I just clicked on new points... why does it say another point". In a New point thread, "Another point" shows only once the owner has replied in the thread. A New point draft is made only by that reply, so the reply marks "had a draft" even after every draft is deleted. The composer's "Say what the point is about" is the action until then. This fixes every chat, not just the Mirror. A thread whose drafts were all deleted keeps "Another point" as its way to start again.
   - **"Clone a version" says what it does.** It starts a new version of one of the owner's canvases. Founder, 2026-11-25: "clone a version is not clear... It's probably modify a canvas". The + menu item is renamed "Modify a canvas", the founder's own words, and its dialog title follows, since the dialog takes the item's label. The canvas page's own "Clone" button is not renamed here. P1536 tests asserting "Clone a version" (`p1536-x3-plus-menu`, `p1536-x3-clone-a-version`) are updated to the new label.
   - **A point made alone.** The draft model refuses when it finds no disagreement ("One person weighing both sides is not a disagreement", `clarify-adapter.md`), and offers the existing "Make one anyway", which then must draft. This spec keeps that behaviour (founder, 2026-11-25, Resolved Decisions).
4. **Transcribe in the Mirror chat, and Clarify while recording.**
   - **What works.** The existing Transcribe, and its Clarify button during recording, work in the Mirror chat. This covers one microphone shared by two people, one of them not a user, as P1631 already allows in other chats (decisions.md: "P1631 is built for one mic").
   - **What changes.** The client check (`ChatTranscribe.canTranscribe`) and the server refusals for Mirror rooms lift. /dev lists each refusing site it lifts. Tests that pin the old Mirror refusal are replaced by the new behaviour, and the non-Mirror regressions stay.
   - **Transcribed lines start no Mirror reply.** Today both `isAskable` (client) and `mirror_request_reply` (server) would answer every transcribed line in the Mirror. Both now refuse `is_transcription` rows. Voice notes keep their P1576 trigger.
5. **Publish in the Mirror chat** (button label "Publish" there, founder UAT 2026-11-26).
   - **The button.** Same button and position prerequisite; in the Mirror its label is "Publish" (founder UAT 2026-11-26).
   - **Where the card lands.** For a draft whose source is the Mirror, the card always posts into the Mirror's main chat, never into a thread, and the owner sees it at once and after reload. Other chats keep their thread routing unchanged. This matters because the Mirror agent replies inside a message's thread, which would otherwise route the card into that thread. A refused publish of a Mirror source shows the existing failure toast.
   - **What's lifted.** Today the button is hidden and the server refuses `needs_target`. P1631 deferred this for want of a target-chat picker (spec line 66). Posting back into the same Mirror chat needs no picker, and private re-share stays off.
6. **Share and the warning.**
   - **Share on the point page.** It already shows for public points (`PointDetailFooter` hides it only for private chat-published points), so nothing changes there.
   - **Share on chat cards.** A public point in a chat already renders as the feed card (`FeedPointCard`), whose Share sits in its ⋯ menu. `HIDE_CARD_CHROME` hides that menu on every attachment card.
     - **What shows.** On a public point card in a chat, the existing Share action shows, and only Share. Edit, Delete and Add a point to this story stay hidden.
     - **How.** The card gets a prop. A CSS selector cannot do this, because the menu items render in a portal outside the card.
     - **Scope.** This covers every public point card in chats, which is the founder's "bring it in where it was not".
   - **No Share.** A private card shows no Share, including a quoted (compact) private card, which also renders as `FeedPointCard`. A story card in a chat shows no Share either.
   - **When the warning shows.** Switching a draft to Public skips the warning only when all of these hold. The server derives the answer when it chooses the rows, and stores it on the draft:
     - the source is the owner's Mirror
     - every row sent to the model was the owner's own typed message or voice note
     - none was a transcribed line, a forwarded copy or a shared card
     - the only other rows were Mirror agent replies

     Every other draft shows the warning, including drafts made before this spec and any draft whose provenance is unknown. Clarify on a transcribed line in the Mirror, and the Mirror's chat-row Clarify over a recording, both show the warning.
   - **Keep private.** "Keep private" leaves the draft private.
7. **Public Clarify points behave like other public points.**
   - **Positions and stories.** `_point_position_write_ok` answers true first for a point whose visibility is public. So anyone signed in can take a position on a public Clarify point wherever they see it, including after its card is deleted. A story is added through the point page's existing "+ Add a story", with the normal story audience rules. The card-bound story path stays private-only, as today.
   - **Erasure.** A public Clarify point follows public-point erasure: kept, with its author detached (founder decision 2026-11-14, option A). When the person whose words it came from is erased, the public point is kept and the owner's draft and its source copies are erased as today. The warning is the control for words that came from someone else.

## UI Contract

- Visibility control: "Private" / "Public".
- Warning dialog:
  - title: "Make this point public?"
  - body: "It came from {chat name | a recording}. Anyone will be able to read it and take a position, and it can't be made private again. Check it doesn't share anything said in confidence."
  - buttons: "Make public" (filled) and "Keep private" (ghost)
  - The chat name is the chat's own title (a DM's other person, a group or event title). For a source in the Mirror the phrase is "a recording", since a Mirror draft warns only when it holds recorded or someone else's words.
- Mirror + menu items: "New point", "New canvas", "Modify a canvas".

## Resolved Decisions

Founder, 2026-11-25 ("yes to your recommendations"):
1. A point drafted from a one-mic recording that holds a non-user's words may go public, behind the warning. The alternative, private-only, was declined.
2. A thought typed alone in the Mirror keeps the refusal ("no disagreement") plus "Make one anyway". A point exists to be disagreed with (2026-11-05). Drafting directly for Mirror sources was declined.
3. The warning copy and labels in UI Contract are approved as proposed.

Also from the founder, 2026-11-25:
- New point joins the Mirror's + menu.
- "Clone a version" is renamed "Modify a canvas", the founder's own words.
- "Another point" before any draft is a bug to fix.

## Risks / Non-Goals

- **Known limitation (ACCEPT):** a private Clarify card posted before P1722 whose message was then hard-deleted leaves no trace that it was ever posted (share rows cascade, and the draft had no publish column). Its owner can switch it to Public. Only the owner's own private point and positions are replaced: other people's answers refuse it (`answered`), and letter, story and badge links refuse it (`point_linked`).

| Risk | Label | Note |
|---|---|---|
| A public draft carries someone else's words from a chat or a one-mic recording | MITIGATE | The server-decided warning (Solution 6). Citations and source lines stay Mirror-only (P1631), so a public point exposes its statement, tags, positions and owner, not its sources |
| A chat member's position on a public card is public and appears on their profile (P634 lists points by positions held) | ACCEPT | Same as a public point forwarded into a chat today. The card shows the globe instead of the lock |
| Every public point card in every chat gains Share | ACCEPT | This is the founder's request ("bring it in where it was not"). Authoring actions stay hidden |
| A public Clarify point paraphrasing another person's words survives that person's erasure | ACCEPT | Public-point erasure rule (2026-11-14). The warning says anyone can read it and it can't be made private again |
| After the owner's erasure, the share rows and drafts are gone, so their detached public point can travel through a letter like any public point | ACCEPT | It is already public. Letters exclude every Clarify point while its owner exists |
| A Public choice does not carry to a refine or "Another point" | ACCEPT | Every new card starts Private, so the owner switches again on the latest card, where the control is. That keeps the warning on every card that goes public |
| Removing `#` from model output changes a model draft that quoted a hashtag | ACCEPT | The owner can retype it. That is the only way a tag can exist |
| A refine loses tags the owner typed on the earlier card | ACCEPT | The model's text carries no `#`. The owner retypes. Known limitation |
| The Mirror-beside-Mirror layout reads oddly when Clarify starts in the Mirror chat | MITIGATE | P1631 AC 137 covers opening a Clarify thread rooted in the Mirror, not starting one from a Mirror message. /dev verifies the layout on screen at 1440, 375 and 320 px |
| Opening the Mirror chat now runs Transcribe's existing room-state poll | ACCEPT | Two calls per 15 s, visible tab only (`startVisiblePoll`). Counted in Cost Budget |

**Non-Goals**
- Do NOT add a visibility picker, a tag input, tag chips, a new Share button or new Clarify buttons. Reuse what exists.
- Do NOT change visibility after publish. Do NOT add "make public" to posted cards or the point page.
- Do NOT relax the P586 visibility trigger.
- Do NOT change who reads a private point in a chat, or how stories bind to a card (2026-11-13 ruling).
- Do NOT let a Clarify point, public or private, travel through a letter (P1631 guard, unchanged).
- Do NOT show private points on the profile (P634).
- Do NOT add a target-chat picker.
- Delete the `/tree/solo-clarify` prototype on this branch. Do not build on it.

## Acceptance Criteria

- [ ] On the latest card of a never-published Clarify draft, the visibility control reads "Private", has the blue bordered action style and a button role, and switches to "Public" and back by click and by keyboard. Checked on phone and desktop. On an earlier version and on a card of a draft that was ever published it is a read-only badge. A refine and "Another point" card both start Private.
- [ ] Before Publish, a draft switched to Public cannot be read by another account and is on neither the profile nor the feed.
- [ ] Published as Public (with the owner's position), the point is readable by a signed-out visitor at its point page, appears on the owner's profile, and holds exactly one owner position. Published untouched, it is private: not on the owner's profile even in the owner's own view, and a signed-out visitor cannot open it.
- [ ] A Public publish forced to refuse after it starts leaves the private draft point, the owner's position and the draft pointer unchanged, with no public point and no card.
- [ ] A retry of a successful Public publish returns `already` with the same card: one public point, one owner position, one card.
- [ ] A draft point the owner linked into their own private story and a canvas draft, published as Public: the story and the canvas draft now hold the new public point, and no link was lost. The public point's position history holds only the owner's position at publish.
- [ ] Publish private, then delete the card: the visibility control is not offered again, and the server refuses a visibility change for that draft. The same holds after the card's message is hard-deleted.
- [ ] A signed-in account outside the chat takes a position on a public Clarify point published (a) into the Mirror and (b) into a DM, including after the card is deleted. It adds a story to it from the point page. The same account is refused a position on a private Clarify point.
- [ ] Editing a draft to "Pricing is the real blocker #sales" and saving gives tag `sales`, shown on the draft card and on the published point, and kept after reload. Removing `#sales` and saving removes the tag. A direct call to `clarify_draft_edit` with a tag not in the text is refused. A model draft never contains `#`.
- [ ] In the Mirror chat, Clarify is offered by hover and message menu (desktop) and long press (phone) on the owner's typed message, voice note and transcribed line, and on the Mirror's chat row. It is not offered on a Clarify root, a forwarded copy, a shared card, a Mirror agent reply, or a reply inside a Clarify or canvas-draft thread. The server refuses each of those when called directly.
- [ ] The Mirror's + menu lists "New point", "New canvas" and "Modify a canvas". "New point" there opens a New point thread, and saying what the point is about drafts it. This also works in a Mirror chat with no messages. With canvas drafting off and Clarify on, the + shows "New point" only.
- [ ] A New point thread, in the Mirror and in a DM, shows no "Another point" until the owner has replied and a draft exists, then shows it under the latest card. A New point thread whose drafts were all deleted after a reply still shows "Another point", and so does any other Clarify thread whose drafts were all deleted.
- [ ] Clarify on the typed Mirror message "Remote work makes junior engineers learn slower" yields a draft, either at once or after "Make one anyway".
- [ ] In the Mirror chat, Transcribe starts a recording, and its Clarify button drafts from the recording.
- [ ] A point Clarified in the Mirror chat, with the owner's position set, shows "Publish" (founder UAT 2026-11-26; other chats keep "Publish to chat"). Pressing it posts exactly one card into the Mirror's main chat, visible at once and after reload. This holds when the source is a top-level message, a message the Mirror agent replied to, and a transcribed line. In a DM, a reply's point still posts into its thread.
- [ ] A public point card in a chat offers the existing Share action, which opens the existing share flow with the point's URL. It does not show Edit, Delete or Add a point to this story. A private card, a quoted private card and a story card in a chat offer no Share. The point page shows Share for the public point.
- [ ] Switching to Public shows the warning first for a draft from:
  - a chat with another person, even one where only the owner's messages were sent
  - a recording
  - a transcribed line in the Mirror
  - the Mirror chat-row Clarify over a recording

  "Keep private" leaves it private. A draft from the owner's own typed Mirror messages, with Mirror agent replies around them, switches with no warning. In the Mirror the dialog says "a recording".
- [ ] When the person whose DM words a public Clarify point came from is erased, the public point stays readable and the owner's draft shows as erased. When the owner is erased, the public point stays with its author detached.
- [ ] Within 60 s of a transcribed line or a posted card in the Mirror chat, no Mirror agent message appears, and no Mirror reply job exists for either.
- [ ] Existing Clarify from a chat with other people works unchanged: drafts private, publishes into that chat, label "Publish to chat". The P1631 tests still pass, except the assertions this spec deliberately replaces.
- [ ] `/tree/solo-clarify` is gone: its DEV route, tree index entry, lazy import and source files.

## Cost Budget

Clarify and transcription are metered (Gemini), and the Mirror chat gains Transcribe's existing room-state poll. No new call type is added.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Metered requests | Clarify: 1 draft call per press, plus 1 if the owner taps "Make one anyway", as P1631. Transcription: billed per audio minute, as today | Bounded by the owner's own presses and recording minutes. 0 Mirror replies per transcribed line (Solution 4) | 3 Clarify calls + 1 recording of 1 min = 3 draft calls + 1 audio minute |
| Supabase calls | Room-state poll in the Mirror chat: 2 calls per 15 s while it is open and visible, plus one read on mount and on each capture or room change | 3600 s / 15 s x 2 = 480 calls per hour of visible Mirror chat | about 2 min open x 8 calls/min = 16 calls, plus 1 read on mount x 2 RPCs = 18 calls |
| Cost | A 10-minute solo recording: 10 min x ($0.003 audio + $0.002 text per min) = $0.05 per pass, at the `gemini-3.5-transcribe` rate in metered-services.md (the configured model, confirmed in review). Capture transcribes twice (live slices, then the saved archive), so 2 x $0.05 = $0.10 per 10-minute recording before slice overlap and retries | — | Browser UAT: 1 min x $0.005 x 2 passes = $0.01 transcription; fixture tests hand-write worker results, so $0 + 3 draft calls under the existing Clarify budget |

Rules: the existing Clarify, Mirror and transcription caps and the budget-capped keys apply unchanged. The poll makes no periodic calls in a hidden tab, and neither do the read on mount and the reads on capture or room change (rule 3).

- **Why a poll (rule 2).** This spec adds no new poll. It opens Transcribe's existing room-state poll (`startVisiblePoll`, P1604, two RPCs every 15 s) to one more chat, the Mirror. P1604 records no reason for polling over push or realtime. `[FOUNDER DECISION: accept the P1604 poll in the Mirror unchanged, or require a Realtime replacement before ship]`
- **Requests.** Visible Mirror with Transcribe available: `2 RPCs x 3600 / 15 = 480 per visible hour`, plus `2 x (mounts + capture/room changes + tab-shown resumes)`. Hidden tab: 0.
- **Egress.** `240 poll pairs per visible hour (3600 / 15) x visible Mirror hours x bytes per poll pair`, plus the event-triggered reads above,, where bytes per pair is the two small JSON answers (no live session: under 1 KB together).
- **Log lines.** The new refusals (`answered`, `visibility_changed`, `needs_warning`, `earlier_version`) return a JSON status, not an error, so they add no error log lines.
- **Test runs (rule 6).** The three P1722 integration files create 21 test accounts per run (2 in `e2e/integration/p1722-solo-clarify.spec.ts`, 5 in `src/tests/integration/p1722-solo-clarify.test.ts`, 14 in `src/tests/integration/p1722-fix-round-1.test.ts`) and delete them after (one batch delete call per file). Fixtures are written with the admin client, a few dozen requests per test. The draft model is never called: the tests write worker results by hand.
- **Fits the plan.** Monthly requests: `480 x visible Mirror hours per month + (21 accounts x (create + sign-in) = 42 auth calls + about 60 fixture reads and writes + 3 batch deletes, about 105 requests) x P1722 test runs per month`. Monthly egress: `240 x visible Mirror hours per month x bytes per poll pair`. The verdict for today and for 10x is the reviewer's, read from the registry row's "Where usage is read"; the values stay out of this file.

## Related

- P1631 (done): Clarify in the Mirror, Publish to chat, `needs_target`, letters guard, erasure.
- Rulings this spec carries or relies on:
  - 2026-11-13 "A private point lives in the one chat it was published to"
  - 2026-11-12 "A private point published to a chat is readable by exactly the people who can read its card"
  - 2026-11-14 public points kept on erasure (option A)
  - 2026-11-05 "if we already agree, why would we need a point?"
  - P586 (point visibility set at creation, immutable)
  - P634 / 2026-04-03 (private points never on the profile)
- P1660: the shared hashtag rule. Known gap: non-ASCII tags (`#café`) read wrongly. Separate bug, not in scope.
- P1576: Mirror reply trigger for voice notes.
- For /kdd: `docs/technical/database.md` says a chat-published Clarify point "stays private (no tags, no link)". It needs updating, along with the P1631 decisions this amends.

## UAT decisions (founder, 2026-11-26)

- Visibility control is a small pill next to Draft with a Private/Public menu; Public still asks once on first publication.
- In the Mirror the publish button says "Publish"; other chats keep "Publish to chat".
- The transcription explanation box is removed in every chat (Mirror and group): the person tapping knows which chat they are in, and consent is recorded server-side on start.
- Accepted: the P1604 15 s room poll in the Mirror; the new error and toast copy as written; Delete hidden on drafts that were ever published.
- Long-input issue list moved to its own spec, P1733.
