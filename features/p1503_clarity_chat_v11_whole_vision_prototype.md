---
status: week
type: story
rank: 40
workstream: clarity-chat
created_date: '2026-10-16'
tags: [clarity-chat, prototype, navigation, mobile]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1503: Clarity Chat v11, one prototype of the whole vision, mobile and desktop

## Problem

**Situation:** v10 (P1495, branch `feature/p1437-conversation-groups-v2`) built the Clarify loop from reused
components inside a Slack-like shell, desktop only. A blind first-time user finished sharing and answering but was
BLOCKED on the last step: Bob never saw his guess next to Alice's answer. Four reviewers and Codex agreed the cards
were right and the frame around them was not.
**Complication:** Walking v10, the founder found the frame incoherent: "Chats" duplicates the chat list, partners
and my profile are hard to find, preparation with the agent has no home, cards repeat as copies, and nothing shows how
WhatsApp chats, groups, channels and events fit. Building those later would bolt them onto a shape that cannot hold
them.
**Question:** What does one prototype of the whole Clarity Chat look like, on phone and desktop, so the Clarify loop
is tested inside the product it will live in?

> Founder, 2026-10-16: "It doesn't make sense to just build something half-baked, a small thing. It's a bigger vision if we are thinking of us as mainly clarity chat with the rest of it"
>
> Founder, 2026-10-16: "it's not understandable where it lives, and how I find it, and how I use it, and how I see what I use"
>
> Founder, 2026-10-16: "it will take less time if you start already optimizing for mobile everything and reflect and have a mobile version directly"
>
> Founder, 2026-10-16: "I just think that Telegram interface is like the most clean somehow. This is where it gravitate there."

## Appetite

- **Blast radius:** one dev-only prototype route on the P1437 branch; production files change only by optional props
  that no production caller passes (the P1495 precedent). Mock data only; no network writes.
- **Reversibility:** git revert.
- **Decision density:** high, mostly spent: D1-D27 were made in the 2026-10-15/16 rounds and confirmed. The build
  starts after the open founder decisions F1-F9 (below) are answered.
- **Viewports:** phone (375, also checked at 320) and desktop (1440), built together.

## Decisions (founder, 2026-10-15/16)

Recorded so nobody re-asks them. Referenced below as D-n.

| # | Decision |
|---|---|
| D1 | One prototype of the whole vision now. **Reverses** the 2026-10-12 ruling's "do not build the left menu, connection levels or imports before the loop is tested", for the prototype only (mock data). |
| D2 | Telegram is the base for the frame. Exactly two borrowings: threads (Slack/Buzz) and my agent reachable with @ in every chat (Buzz). |
| D3 | Home is the chat list. The logo returns to it. No separate "Chats" or "Home" item. |
| D4 | One inbox holds every direct message and group chat, including bridged WhatsApp/Telegram/LinkedIn chats (mock), each marked with its source network and filterable per network (Beeper model). Same person on two networks = two chats. |
| D5 | A group is a space that holds channels only; direct messages always live in the one inbox. Channel types: **Members** (every group member joins), **Event** (that event's attendees and host only), **Invite-only** (people chosen by name). A multi-person chat outside any group is a group chat in the inbox. |
| D6 | One drawer, opened from my avatar: My Profile, Explore (the real Feed and Events), Settings, About (legal inside). No Contacts: everything is a chat. |
| D7 | Tools stays one click at the top level, signed in and signed out (2026-09-16 Links-menu ruling). |
| D8 | "+ New" opens **New chat** (invite by email; later other networks) and **New partner** (today's partner flow, which also works for someone without an account). |
| D9 | Partners: only normal chat vs partner (no connection levels). Chat header: "Invite as partner" (secondary blue, next to ⋮) → "Partner invite pending" → a "Partner" label under the name. A "Partners" inbox filter. No avatar badge. |
| D10 | Composer: **@** (people and my agent), **📎** (picker over my items, search plus type tabs), emoji, mic (dictation). No "+" menu. No one-tap transcribe. |
| D11 | Reply (quoted above the composer) on every message and every sent card; Forward on every message and every public card. Forward on a point or story sends the same object, not a copy. The cards' existing share link stays. No separate "Share" button. |
| D12 | My agent always has a name and its owner is always shown as visible text. Only my mirror agent exists in v11 (no Agents tab). In a shared chat, a message starting with "@<agent>" is never posted there: it opens my agent thread about that chat with the typed text as its first message. |
| D13 | Preparation lives in **threads inside my chat with my agent**. **Reverses** the 2026-10-12 ruling's "private thread inside the Bob-Alice DM". A thread starts with the quoted source message (author, and which chat or channel), no title; tapping the quote returns there. In the source chat, a chip only I see ("{n} drafts for {name}") opens the thread. |
| D14 | Clarify is one action on any message. On a message that has a thread, Clarify brings the whole thread **live**: each agent answer says "Read {n} replies"; a draft made earlier shows "{n} new replies since this draft" when replies arrive. |
| D15 | Anything meant for a specific person starts with Clarify on one of their messages; the quoted author is the recipient. Free chat with my agent (outside threads) is mirror work; its results are general drafts. |
| D16 | Suggestion chips above the input, in agent conversations only, by context; a chip **fills the input** and never sends. "Add a story" on a card stays manual. |
| D17 | Drafts: edit and delete. A draft becomes a real item, with its visibility fixed, at its first use: **Send to {name}** (private to that chat) or **Publish to my profile** (public). The agent never sends or publishes. |
| D18 | v11 loop = **point + my story + my guess of their position**. "Their story" is P1497. |
| D19 | The Clarity Ledger merges into **Details**; no card flip. ⋮ → "Clarity Ledger" in a chat lists that chat's items, each opening Details. Full history is P1496. |
| D20 | One item = one card per conversation. A later mention renders as a compact reference that jumps to the card. In agent threads, the item in focus is pinned at the top. |
| D21 | Actions per item type and state: §6. Private items cannot be forwarded by anyone. A point can be edited and deleted only while its author is its only position holder (the product has no point delete today). Positions exist only on points. |
| D22 | Cards keep the Feed's simple look. A draft shows a large pencil on hover and "Edit" in its ⋯ menu. Story actions live in the card footer. |
| D23 | Backwards compatibility (mock): a bridged chat holds the full network conversation; a Clarity item sent there reaches the network as a notice plus a link. The other person's Clarity Chat messages stay in Clarity Chat. |
| D24 | Entry points: a bridged WhatsApp chat (main path) and an event channel table thread (second path), both mock. |
| D25 | No Library in v11 (P1502). Nothing private ever appears on My Profile. |
| D26 | Reuse: anything that renders a point, story, position, guess or rating is a production or P1495 component (P1495 reuse map rows 1-4, 20, 23, 26-28). The frame may be built new, Telegram-styled. |
| D27 | Phone and desktop together. |

## Open founder decisions (answer before the build)

Each has a recommendation; reviewers (Opus, Gemini 4 Argon, Codex, 2026-10-16) surfaced them.

| # | Question | Recommendation |
|---|---|---|
| F1 | On the main path, is Alice a Clarity Chat member? | Yes. Bob clarifies in his bridged WhatsApp chat with Alice; "Send to Alice" delivers into the **Bob-Alice Clarity chat**, where she answers and where Bob sees the result; the WhatsApp chat gets the notice plus link, which opens that chat for her. A non-member answering by link is P1456. |
| F2 | Do Alice's answers reach Bob as she taps, or when she sends? | When she sends (P1484 D25): her answers are marked "Only visible to you" until she taps "Send to Bob". |
| F3 | Does Bob predict, 0-10, how well Alice will understand his story? | Yes: it is what the story's gap is made of (P1495 step 6; `CalibrationVerdict` needs it). |
| F4 | Can Bob edit his story after Alice has rated it? | No: like a point, a sent story locks once the other person has rated it. Before that, an edit makes a new version and clears Bob's own prediction for it. |
| F5 | Agent label: "Mira · Bob's mirror agent" (2026-10-12 ruling), "managed by Bob" (Buzz), or "Operated by Bob" (production)? | The ruling's wording, already decided: "{agent} · {owner}'s mirror agent". |
| F6 | Letters in v11? | 📎 has a Letters tab that attaches a link to an existing letter; no "Write a letter" chip and no new letter flow. |
| F7 | Bridged notice text in WhatsApp (point statement only, never story text, guess or numbers). | `[FOUNDER DECISION: copy]` e.g. "Bob shared a point with you in Clarity Chat: '{statement}'. {link}". Bridged group chats get no Clarity items in v11. |
| F8 | The fictional agent's name in mock mode (real mode: Mira). | `[FOUNDER DECISION: name]` |
| F9 | Move P1462 (production menu move) and P1431 (real transcript-to-letter) from "supersede" to "update"? | Yes: v11 is a prototype; both own production work. |

## Solution

Build on branch `feature/p1437-conversation-groups-v2` (worktree w7), evolving v10. `/tree/conversation-groups`
renders v11; v10 stays under `?v=10`, v8 under `?v=8`. The private `?real=1` loader keeps working; in real mode the
agent is Mira. Fictional people: Alice, Bob, plus mock group members. Signed out goes to the real `/feed` (P1495).

### 1. Frame (D2-D9)

- **Phone:** the chat list is the first screen. Header: avatar (opens the drawer), a space switcher title ("Inbox ▾",
  listing Inbox and each group space), search, Tools, "+ New". Filter chips: All, Unread, Partners, WhatsApp,
  Telegram, LinkedIn, Group chats. A chat opens full screen with Back; Back from an agent thread returns to the chat
  it was opened from; from Details, to the card.
- **Desktop:** a narrow rail (Inbox, each group, "+", Tools at the bottom of the rail, my avatar at the top), the
  chat list, the open chat. One right side panel at a time: an agent thread or Details; opening Details from inside
  a thread stacks over it with Back.
- **Inbox rows:** avatar, name, last message, time, unread count; network mark on bridged chats; "Partner" where
  applicable; my agent pinned first; an "Archived" row at the top.
- **Group space:** its channels (Members, Event, Invite-only) and upcoming events; joining an event adds its channel.
- **Drawer (D6), Tools (D7), "+ New" (D8), partner header controls (D9).** "Invite as partner" opens the
  partner certificate prefilled with the chat's person (P1495 row 29) with a send control; sending sets "Partner
  invite pending"; accepting in Alice's lens (strip) sets "Partner".
- **Explore:** the real Feed and Events pages inside the frame, signed out (P1495 rule; strip labels it).
- **Date dividers** in every message list.

### 2. Chat (D10-D12, D23)

- Message actions: hover (desktop) or long-press on the message row outside any card (phone): Reply, Forward, Clarify.
  On a card, the same actions sit in its ⋯ menu so long-press never fights the position buttons.
- **📎 picker:** search plus tabs All / Points / Stories / Letters / Drafts. Eligible to attach in this chat: my public
  items, items already in this chat, general drafts, and drafts made for this chat's person. Other items show as
  disabled with the chat they belong to. Choosing a draft runs the same Send step as in its thread.
- **Bridged chat (mock):** network mark in the header; a banner says whose account bridges it; a strip lens shows
  Alice's WhatsApp, where a sent item appears as the F7 notice plus link; tapping the link opens the Bob-Alice
  Clarity chat in Alice's lens (F1).
- **Event channel (mock):** a table thread with /transcribe lines; the strip has "Add a reply (mock)" to grow it.

### 3. My agent (D12-D17, D20)

- The agent chat holds free mirror work with chips: "Suggest a point", "Suggest a story".
- A "Threads ({n})" bar at the top of the agent chat lists its threads; each opens with the quoted source and pins
  the item in focus (D20); chips by context: "Suggest points", "Suggest a story", "Suggest a story for this point".
- The agent proposes the fitting format (point or story) from the material; Bob steers in plain words. No mode picker.
- **Bob's own story, only from his words** (P1484 D13): an agent draft of Bob's story uses only what Bob wrote in the
  source; any sentence the agent inferred is marked and must be kept or deleted by Bob before Send.
- Draft endings (D17): a draft that carries a guess of a person's position offers only **Send to {name}** (2026-10-12
  ruling: a prediction about a person is private or addressed to that person). **Publish to my profile** exists only
  for drafts without a guess. Linking a story to a point shows "Story linked to {point}" and the card count updates.

### 4. The loop (D18, F1-F4)

1. Bob taps Clarify on Alice's message in the bridged WhatsApp chat → his agent thread opens (side panel on desktop
   with Alice's chat still visible; full screen on phone).
2. The agent proposes 1-3 points; Bob takes his position with `PositionButtons` and guesses Alice's with `GuessMenu`.
3. Bob adds his story (required on the main path; a point alone may also be sent): "Add a story" (manual) or the chip
   "Suggest a story".
4. Bob predicts how well Alice will understand his story (F3, `ComprehensionRatingCard`, P1495 sentence).
5. Before Send, the preview tells Bob that after Alice answers she will see his guess and his prediction
   (P1469 D14) `[FOUNDER DECISION: copy]`.
6. Send to Alice → the item arrives in the Bob-Alice Clarity chat as a **reply quoting** the source message.
7. Alice answers blind: her position, then the story opens, she reads and rates it. Her answers are marked "Only
   visible to you" until "Send to Bob" (F2).
8. After she sends: both see the guess line rendered as below; Bob sees his prediction next to her rating
   (`CalibrationVerdict perspective="sender"`), Alice sees `perspective="reader"`.

**One exchange per point per person:** a point is sent to a person once; stories added later join that exchange,
each with its own prediction and seal. A second mention of the point in that chat is a reference (D20).

**Guess line renderings** (above the card, `EyesHeader` + `GuessMenu`, P1495 row 20):
- Bob, before Alice sends: "Alice in Bob's eyes · {guess} (your guess)".
- Bob, after: "Alice in Bob's eyes · {guess}" next to "Alice · {her position}".
- Alice, before she sends: nothing. After: "Alice in Bob's eyes · {guess}" next to her own position.

### 5. Details (D19)

One view per item (side panel on desktop, full screen on phone): the card, the guess line, story ratings and
predictions (`CalibrationVerdict` / `RatingDotsPending`). **Details and the Clarity Ledger apply the same seals per
viewer as the chat:** before Alice sends her answer, her Details shows the point only; no story, guess or numbers.

### 6. Actions (D11, D21, F4)

**Points**

| State | Edit | Delete | Position | Reply | Forward | Clarify | Details |
|---|---|---|---|---|---|---|---|
| My draft | ✓ | ✓ | ✓ mine + guess of theirs | — (not sent yet) | — | — | — |
| Private, in a chat | author, while sole holder | author, while sole holder | ✓ (equal holders) | ✓ | ✗ nobody | ✓ | ✓ (sealed per viewer) |
| Public | author, while sole holder | author, while sole holder | ✓ | ✓ | ✓ | ✓ | ✓ |

**Stories**

| State | Edit | Delete | Reply | Forward | Clarify | Details |
|---|---|---|---|---|---|---|
| My draft | ✓ | ✓ | — | — | — | — |
| Private, in a chat | author, until rated (F4) | author, until rated | ✓ | ✗ nobody | ✓ | ✓ (sealed per viewer) |
| Public | author (new version) | author | ✓ | ✓ | ✓ | ✓ |

**Letters (F6):** a letter link in a chat offers Reply and opens the letter page; nothing else.
An item edit in a shared chat shows "{author} updated the point" (the author, never the agent; D12).

### 7. Second path: event channel (D14, D24)

Clarify on a table thread's parent message opens an agent thread quoting it plus "Read {n} replies". "Send to" goes
to the **quoted author's direct chat**, never into the channel. Clarify from a channel's or thread's ⋮ menu produces
general drafts only (no recipient, no guess).

## UX Notes

- **Blind-walk task (verbatim, both viewports):** "You are Bob: Alice's last WhatsApp message confused you, so use the
  app to work out and share what you think she meant, then become Alice and respond to what Bob shared, then become
  Bob again and find out how well you two understood each other."
- **Empty states:** a new chat shows only the composer; an agent chat with no threads shows the chips; 📎 or search
  with no results shows "No results" (production string where it exists); an empty Clarity Ledger lists nothing
  under its title; Bob's chat while Alice has not sent shows the guess line in its "(your guess)" form.
- **Repeats (D20):** posting the same point twice shows one card and one reference.

## UI Contract

Strings decided in the rounds or production. Anything else on the main path needs a founder yes.

| Where | Copy | Source |
|---|---|---|
| Compose | "+ New" · "New chat" · "New partner" | D8 |
| Chat header | "Invite as partner" · "Partner invite pending" · "Partner" | D9 |
| Inbox filters | "All" · "Unread" · "Partners" · network names · "Group chats" | D4, D9 |
| Space switcher | "Inbox" · group names | Solution §1 |
| Drawer | "My Profile" · "Explore" · "Settings" · "About" | D6 |
| Agent chips | "Suggest points" · "Suggest a story" · "Suggest a story for this point" · "Suggest a point" | D16 |
| Draft actions | "Send to {name}" · "Publish to my profile" · "Edit" · "Delete" | D17 |
| Draft chip | "{n} drafts for {name}" | D13 |
| Agent threads bar | "Threads ({n})" | Solution §3 |
| Guess line | per §4 renderings | D18; 2026-10-12 mental-model ruling |
| Thread status | "Read {n} replies" · "{n} new replies since this draft" | D14 |
| Repeat reference | "↗ Point: {statement}" · "↗ Story: {first words}" | D20 |
| Update lines | "{author} updated the point" · "Story linked to {point}" | D20, D16 |
| Alice's pending answers | "Only visible to you" · "Send to Bob" | F2 (P1484 / v8 strings) |
| Agent identity | F5 | F5 |
| Pre-send exposure notice | `[FOUNDER DECISION: copy]` | §4 step 5 |
| Bridged notice | F7 | F7 |
| Mock agent name | F8 | F8 |
| Message actions | "Reply" · "Forward" · "Clarify" | D11, D14 |
| Strip | "Add a reply (mock)" · Alice's WhatsApp lens label | prototype only |

## Acceptance Criteria

Checked at 375 (and 320) and 1440, fresh session, fictional data, not signed in to the app.

- [ ] 1. **Reuse gate (cards).** The P1495 reuse-gate script is committed under `scripts/prototype/` with its
      known-bad control (v9 position picker) and the widened raw-tag regex `([\s>/]|$)`; run over the v11 card and
      loop files (frame files exempt, listed by name), it passes, and the control fails both parts. Mock points carry
      tags so "same tag pills" is not vacuous.
- [ ] 2. **Frame.** The chat list is the first screen on phone and the logo returns to it on desktop; no "Chats" or
      "Home" item; the drawer opens from the avatar and holds exactly My Profile, Explore, Settings, About; Tools
      opens in one click from the header (phone) or rail (desktop); the space switcher reaches each group on phone.
- [ ] 3. **Inbox.** Bridged chats show their network mark; each network filter shows only that network's chats;
      Partners shows only partners; my agent is pinned first.
- [ ] 4. **Groups.** A group space shows channels only; an event channel lists only its attendees and host.
- [ ] 5. **Composer.** Exactly @, 📎, emoji and mic; 📎 finds an item by typing and by tab and refuses a private item
      from another chat; Reply quotes the message above the input; Forward of a public point sends the same point
      (a position taken in one chat shows in the other).
- [ ] 6. **Agent threads.** Clarify opens a thread in my agent chat starting with the quoted message; the quote
      returns to the source chat; the source chat shows "{n} drafts for {name}" to Bob and not to Alice; nothing
      appears in the shared chat until Send; "@<agent> …" typed in the shared chat is not posted there.
- [ ] 7. **Live thread.** On the event path, "Read {n} replies" rises after "Add a reply (mock)"; an earlier draft shows
      "{n} new replies since this draft"; "Send to" targets the quoted author's direct chat.
- [ ] 8. **Chips.** Only in agent conversations, change with context, fill the input without sending.
- [ ] 9. **Drafts.** Edit and delete work; a draft with a guess offers "Send to {name}" and no Publish; tapping Send
      is the only way the item reaches Alice.
- [ ] 10. **Loop and seals.** The item arrives in the Bob-Alice Clarity chat as a reply quoting the source; before
       Alice sends, neither her chat nor her Details shows Bob's story, guess or prediction; after she sends, Bob's
       chat shows his guess next to her position and his prediction next to her rating (the v10 BLOCKED step).
- [ ] 11. **Repeats.** Sending the same point twice in one chat shows one card plus one reference; an edit updates the
       one card with "{author} updated the point".
- [ ] 12. **Details.** Opens from a card and from ⋮ → Clarity Ledger; no card flips anywhere.
- [ ] 13. **Actions.** Private items offer no Forward; a point another person holds a position on offers no Edit or
       Delete; a story Alice has rated offers Bob no Edit (F4).
- [ ] 14. **Partners.** "+ New" → New partner reaches today's partner flow for someone without an account; "Invite as
       partner" → send → "Partner invite pending" → accepted in Alice's lens → "Partner".
- [ ] 15. **Bridge (mock).** Alice's WhatsApp lens shows only the notice (point statement, no story, guess or numbers)
       plus a link; the link opens the Bob-Alice Clarity chat in Alice's lens; her Clarity reply does not appear in
       the WhatsApp lens.
- [ ] 16. **Mobile.** Every screen works at 375 and 320 without horizontal scroll; every hover action has a long-press
       or ⋯ equivalent.
- [ ] 17. **Blind walk.** A first-time user given the UX Notes task finishes all three parts on the phone viewport with
       zero BLOCKED steps; every stop is recorded.

## Done-When

- [ ] F1-F9 answered and written into this spec.
- [ ] Typecheck errors per file match the branch baseline; all P1495 and v8 tests pass; new v11 tests cover AC 5, 6,
      9, 10, 11, 13.
- [ ] AC 1 output with its control and the reviews attached with `<reports received> of <spawned>`: reuse audit,
      design consistency (Telegram for the frame, Buzz for @ and threads, /feed for cards), blind walk, visual QA at
      both viewports.
- [ ] Superseded specs closed and "update" specs updated (Related).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Whole-vision scope overwhelms one build | MITIGATE | Slices on one branch, each verified before the next: frame → inbox and groups → agent threads → loop, seals and Details → bridge and event mocks |
| Shared state across live threads, versions and seals breaks | MITIGATE | One exchange per point per person; stories lock once rated (F4); live thread changes never edit a draft, they only show "{n} new replies since this draft" |
| The bridge leaks sealed or private content | MITIGATE | Notice carries the point statement only; the link opens only for the named recipient; no Clarity items into bridged group chats |
| The agent invents Bob's first-person story | MITIGATE | Only-from-his-words rule (§3) |
| Reversed rulings go unrecorded | MITIGATE | Recorded below; `/kdd` after the build writes them to decisions.md |
| Mock bridge suggests a real integration exists | ACCEPT | Strip label; the real bridge is P1457 |
| Real Feed/Events pages render the dev database inside the frame | ACCEPT | Signed out, labelled by the strip (P1495 precedent) |

**Reversals this spec makes (to record):** 2026-10-12 left-menu/imports order (D1) and the private thread inside the
Bob-Alice DM (D13); P1469 D18 "Letters, checks and threads exist only in the ClarityPledge space" (D4/D23) and D19
"None in the letter loop or in agent chats" (threads, D13); P1484 "In v7 she answers nowhere in chat" (Alice answers
in chat, §4).

**Non-Goals**
- Do NOT build: their story (P1497), card history (P1496), rewind (P1499), other agents (P1498), Canvas from event
  threads (P1500), who-can-see lists (P1501), private library (P1502), connection levels, agent-flagged moments in
  imported chats (P1470), a real bridge, real transcription, account creation, a non-member answer path (P1456),
  new letters.
- Do NOT change production components, pages or copy, except optional props no production caller passes.
- Do NOT show anything private on My Profile.
- Do NOT let the agent post into a shared chat, publish, or send.

## Invariants

- My own position is set only with production `PositionButtons`; a guess of another person's position only with
  P1495's `GuessMenu`.
- Agents never score and never write for the other person; an agent's owner is always shown.
- Seals apply on every surface (chat, Details, Clarity Ledger, previews, bridged notice): Bob's story opens for Alice
  only after her answer on the point; Bob's guess and numbers only after her matching answer is sent.
- A prediction about a person is private or addressed to that person; it is never published.
- A private item never reaches a person outside the chat it was sent to, including through 📎.
- Bob's own story contains only his words unless he kept an inferred sentence explicitly.
- No real person's content in any tracked file, test, commit or review prompt; never read a `.local` folder.

## Related

**Supersedes** (close after F-answers): P1495 (v10), P1485 (v8, branch only), P1484 (v7), P1469 (v6), P1467 (v5),
P1460 (connection levels); P1459 → P1496. P1462 and P1431 per F9.
**Update with this direction:** P1457 (real bridge: D4, D23, F1, F7), P1461 (D5), P1455 (D11, D13), P1456 (no
connection levels; the non-member path), P1458 (guess line §4), P1465 (aim at the guess line), P1470 (deferred: no
agent flags in v11).
**Follow-ups:** P1496 history in Details · P1497 their story · P1498 other agents · P1499 rewind · P1500 Canvas from
event threads · P1501 who can see a card · P1502 private library. **Keep:** P1466.
**Rulings:** 2026-10-12 [product] mental model and mirror-agent role ("Alice in Bob's eyes"; "<Name> · Bob's mirror
agent"; predictions private or addressed) · 2026-10-12 [product] Clarity Chat letter thread (reversed by D13) ·
2026-09-16 [product] Links menu on every surface (D7) · P1495 Build Evidence (branch).
**Reviews of this spec (2026-10-16):** 3 of 3 reported — Opus, Gemini 4 Argon (served model verified), Codex
(gpt-6.1-sol, high). Their blockers are resolved above or listed as F1-F9.
