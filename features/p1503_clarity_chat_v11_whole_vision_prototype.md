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
and my profile are hard to find, preparation with the agent has no home ("where it lives, and how I find it"),
cards repeat as copies, and nothing shows how WhatsApp chats, groups, channels and events fit. Building those later
would bolt them onto a shape that does not hold them.
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

- **Blast radius:** one dev-only prototype route on the P1437 branch; production files change only by optional
  props that no production caller passes (the P1495 precedent). Mock data only; no network writes.
- **Reversibility:** git revert.
- **Decision density:** high but already spent: every decision below was made in the 2026-10-15/16 rounds and
  confirmed ("agreed to all lets proceed"). Remaining founder calls are listed as `[FOUNDER DECISION]`.
- **Viewports:** phone (375 wide, also checked at 320) and desktop (1440), built together.

## Decisions (founder, 2026-10-15/16)

Recorded so nobody re-asks them. Each number is referenced below as D-n.

| # | Decision |
|---|---|
| D1 | One prototype of the whole vision now. This **reverses** the 2026-10-12 ruling's "do not build the left menu, connection levels or imports before the loop is tested", for the prototype only (mock data). |
| D2 | Telegram is the base for the frame. Exactly two borrowings: threads (Slack/Buzz) and your agent reachable in every chat with @ (Buzz). |
| D3 | Home is the chat list. The logo returns to it. No separate "Chats" or "Home" menu item. |
| D4 | One inbox holds every direct message and group chat, including bridged WhatsApp/Telegram/LinkedIn chats (mock), each marked with its source network, filterable per network (Beeper model). Same person on two networks = two chats. |
| D5 | A group is a space that holds channels only; direct messages always live in the one inbox. Channel types: **Members** (every group member joins), **Event** (that event's attendees and host only, not all members), **Invite-only** (people chosen by name). A multi-person chat outside any group is a group chat in the inbox. |
| D6 | One drawer, opened from my avatar (top of the chat list, phone and desktop): My Profile, Explore (the real Feed and Events), Settings, About (legal inside). No Contacts: everything is a chat. |
| D7 | Tools stays one click at menu level, signed in and signed out, as today (2026-09-16 Links-menu ruling). |
| D8 | "+ New" above the chat list opens **New chat** (invite by email; later WhatsApp and others) and **New partner** (today's partner flow, which also works for someone without an account). |
| D9 | Partners: no connection levels in v11 (normal chat vs partner only). In a chat header: "Invite as partner" (secondary blue, next to ⋮); then "Partner invite pending"; then a "Partner" label under the name. A "Partners" filter in the inbox. No avatar badge. |
| D10 | Composer: **@** (people and my agent), **📎** (picker for my points, stories, letters and drafts, with search plus type tabs All / Points / Stories / Letters / Drafts), emoji, mic (dictation). No "+" menu. No one-tap transcribe button. |
| D11 | Reply (quoted above the composer) and Forward on every message and card. Forward on a point or story sends the same object, not a copy. The cards' existing share link stays unchanged. No separate "Share" button. |
| D12 | My agent always has a name and shows "managed by <owner>" as visible text (not hover-only). In v11 there is only my mirror agent: no Agents tab. In a shared chat, "@<agent>" opens a private conversation with my agent about that chat; the agent never posts into the shared chat. |
| D13 | Preparation lives in **threads inside my chat with my agent**. This **reverses** the 2026-10-12 ruling's "private thread inside the Bob-Alice DM". A thread starts with the quoted message it came from (author, and which chat or channel), no title; tapping the quote returns to that chat. In the person's chat, a private chip above the composer ("2 drafts for Alice") opens the thread. |
| D14 | Clarify starts from one action on any message. On a message that has a thread, Clarify brings the whole thread, **live** (the agent reads the current thread; each agent answer says "Read N replies"). Clarify on a channel or thread from its ⋮ menu is the same action. |
| D15 | Anything meant for a specific person starts with Clarify on one of their messages, so the thread's quote fixes the recipient. Free chat with my agent (outside threads) is mirror work: positions, stories for my profile; its results are general drafts. |
| D16 | Suggestion chips above the input, in agent conversations only, by context: in a Clarify thread "Suggest points", "Suggest a story"; under a point "Suggest a story for this point"; in the agent's main chat "Suggest a point", "Suggest a story", "Write a letter". A chip **fills the input** (e.g. "Suggest a story about ") and does not send. "Add a story" on a card stays manual (production). |
| D17 | Drafts: edit and delete (no "Reject"); the first use decides private or public: **Send to Alice** (thread with a known recipient) or **Publish to my profile**. The agent never publishes or sends on its own. Visibility is fixed at creation (product rule). |
| D18 | v11 loop = **point + my story + my guess of their position**. Before Alice answers, "Alice in Bob's eyes · <position> (your guess)" sits **above** the card; after she answers, her real position replaces it and Bob sees his guess next to her answer. "Their story" (reverse story) is P1497. |
| D19 | The Clarity Ledger merges into **Details**; no card flip. Per chat, ⋮ → "Clarity Ledger" lists that chat's items, each opening the same Details. Details in v11 shows current state plus guess-next-to-answer; the full history is P1496. |
| D20 | One item = one card per conversation. A later mention of the same item renders as a compact reference ("↗ Point: <statement>") that jumps to the card. Edits change the one card and add a small line ("<agent> updated the point"). In agent threads, the item in focus is **pinned** at the top and switches when the focus moves. |
| D21 | Actions per item type and state: the tables in Solution §6. Private items cannot be forwarded by anyone. A point can be edited **and deleted** only while its author is its only position holder (delete follows edit; the product has no point delete today). Positions exist only on points. |
| D22 | Cards keep the Feed's simple look. A draft shows a large pencil on hover (top right) and "Edit" in its ⋯ menu (phone has no hover). Story actions live in the card footer, never floating under the card. |
| D23 | Backwards compatibility (mock): a bridged chat holds the full network conversation; anything sent in Clarity Chat that the network cannot carry goes to the network as text plus a link ("open in Clarity Chat"). The other person's Clarity Chat messages stay in Clarity Chat (the bridge is the first person's account). |
| D24 | Entry points in the prototype: a bridged WhatsApp chat and an event channel table thread, both mock, feeding the identical loop. |
| D25 | No Library in v11 (📎 is the picker; a standalone private place is P1502). Nothing private ever appears on My Profile. |
| D26 | Reuse: anything that renders a point, story, position or rating is a production component (P1495 reuse map rows 1-4, 23, 26-28). The frame (inbox list, drawer, compose, composer buttons, threads, chips, pinned bar) may be built new, Telegram-styled. |
| D27 | Delivered on desktop and phone together. |

## Solution

Build on branch `feature/p1437-conversation-groups-v2` (worktree w7), evolving v10. `/tree/conversation-groups`
renders v11; v10 stays reachable under `?v=10` and v8 under `?v=8`. The private `?real=1` loader keeps working; in
real mode the agent is Mira. Fictional people: Alice, Bob, plus mock group members.

### 1. Frame (D2-D9)

- **Phone:** chat list is the first screen. Top: avatar (opens drawer), title, search, "+ New". Below: filter chips
  (All, Unread, Partners, WhatsApp, Telegram, LinkedIn, Groups). A chat opens full screen with back.
- **Desktop:** a narrow rail (spaces: my inbox, then each group, then "+"), the chat list, the open chat; side
  panels (thread, Details) on the right.
- **Inbox rows:** avatar, name, last message, time, unread count; a small network mark on bridged chats; "Partner"
  where applicable; my agent pinned first; an "Archived" row at the top (archive per chat).
- **Group space:** its channels (Members, Event, Invite-only) and upcoming events; joining an event adds its channel.
- **Drawer (D6), Tools (D7), "+ New" (D8), partner header controls (D9).**
- **Explore:** the real Feed and Events pages inside the frame, signed out (P1495 rule; strip labels it).
- **Date dividers** in every message list.

### 2. Chat (D10-D12, D23)

- Messages, reply (quoted), forward, emoji, @, 📎, mic. Hover (desktop) or long-press (phone) shows the message
  actions: Reply, Forward, Clarify.
- **Bridged chat (mock):** network mark in the header; an item Bob sends shows, in a preview of Alice's WhatsApp,
  as text plus "open in Clarity Chat" link. A banner states which account bridges the chat.
- **Event channel (mock):** a table thread with /transcribe lines; Clarify on its parent message brings the live
  thread (D14).

### 3. My agent (D12-D17, D20)

- The agent chat: free mirror work (D15) with chips (D16).
- Threads list inside the agent chat, each opening with the quoted source; pinned focus item; chips by context.
- The agent proposes the fitting format (point, story) from the material; Bob steers in plain words ("make this a
  story instead"). No mode picker.
- Draft endings per D17; linking a story to a point shows a system line ("Story linked to <point>") and the card's
  count updates.

### 4. The loop (D18)

Clarify on Alice's message → agent thread → agent proposes points (and a story where it has context) → Bob takes
his position, guesses Alice's, optionally adds his story (manual "Add a story" or chip "Suggest a story") → Send to
Alice → the item arrives in the Bob-Alice chat as a **reply quoting** the source message → Alice answers blind →
seals as in P1495 (Bob's story opens after her answer; his numbers after her matching answers) → Bob's chat shows his
guess next to her answer; Details shows both.

### 5. Details (D19)

One view per item (side panel on desktop, full screen on phone): the card, both positions, guess next to answer,
story ratings and predictions (P1495's CalibrationVerdict / RatingDotsPending). Opened from the card's Details or
from ⋮ → Clarity Ledger in a chat.

### 6. Actions (D21)

**Points**

| State | Edit | Delete | Position | Reply | Forward | Clarify | Details |
|---|---|---|---|---|---|---|---|
| My draft | ✓ | ✓ | ✓ mine + my guess of theirs | — | Send to / Publish | — | — |
| Private, in a chat | author, while sole holder | author, while sole holder | ✓ (equal holders) | ✓ | ✗ nobody | ✓ | ✓ |
| Public | author, while sole holder | author, while sole holder | ✓ | ✓ | ✓ | ✓ | ✓ |

**Stories**

| State | Edit | Delete | Reply | Forward | Clarify | Details |
|---|---|---|---|---|---|---|
| My draft | ✓ | ✓ | — | Send to / Publish | — | — |
| Private, in a chat | author (new version) | author | ✓ | ✗ nobody | ✓ | ✓ |
| Public | author (new version) | author | ✓ | ✓ | ✓ | ✓ |

## UX Notes

- **Main path (blind walk, both viewports):** as Bob, open Alice's bridged WhatsApp chat; Clarify her last message;
  in the agent thread take a suggested point, set your position, guess hers, add a story via a chip, Send to Alice;
  switch to Alice (strip): answer blind, read and rate the story; switch to Bob: see the guess next to her answer and
  open Details.
- **Second path:** as Bob in an event channel, Clarify a table thread; the agent says "Read N replies".
- **Empty states:** a new chat shows only the composer; an agent chat with no threads shows the chips; the
  Partners filter with none shows nothing but the filter.
- **Repeats (D20):** posting the same point twice shows one card and one reference.

## UI Contract

Strings decided in the rounds (D-numbers) or production. Anything else on the main path needs a founder yes.

| Where | Copy | Source |
|---|---|---|
| Compose | "+ New" · "New chat" · "New partner" | D8 |
| Chat header | "Invite as partner" · "Partner invite pending" · "Partner" | D9 |
| Inbox filters | "All" · "Unread" · "Partners" · network names · "Groups" | D4, D9 |
| Drawer | "My Profile" · "Explore" · "Settings" · "About" | D6 (production labels where they exist) |
| Agent chip | "Suggest points" · "Suggest a story" · "Suggest a story for this point" · "Suggest a point" · "Write a letter" | D16 |
| Draft actions | "Send to {name}" · "Publish to my profile" · "Edit" · "Delete" | D17 |
| Draft chip in a chat | "{n} drafts for {name}" | D13 |
| Guess line | "{name} in {me}'s eyes · {position} (your guess)" | D18; "in Bob's eyes" per the 2026-10-12 mental-model ruling |
| Thread status | "Read {n} replies" | D14 |
| Repeat reference | "↗ Point: {statement}" / "↗ Story: {first words}" | D20 |
| Update line | "{agent} updated the point" · "Story linked to {point}" | D20, D16 |
| Bridged link (Alice's WhatsApp preview) | `[FOUNDER DECISION: exact text]` e.g. "Bob shared a point with you: … open in Clarity Chat" | D23 |
| Agent identity | "{agent} · managed by {owner}" | D12, 2026-10-12 ruling |
| Mock agent name | `[FOUNDER DECISION: the fictional agent's name in mock mode]` (real mode: Mira) | D12 |
| Message actions | "Reply" · "Forward" · "Clarify" | D11, D14 |

## Acceptance Criteria

Checked at 375 (and 320) and 1440, fresh session, fictional data, not signed in to the app.

- [ ] 1. **Reuse gate (cards).** Every point, story, position and rating on screen is a production component (P1495
      reuse map rows 1-4, 23, 26-28); the gate script's known-bad control (v9 position picker) fails both parts;
      the raw-tag check uses the widened regex `([\s>/]|$)`.
- [ ] 2. **Frame.** The chat list is the first screen on phone and the logo returns to it on desktop; no "Chats" or
      "Home" item exists; the drawer opens from the avatar and holds exactly My Profile, Explore, Settings, About;
      Tools opens in one click from the top level.
- [ ] 3. **Inbox.** Bridged chats show their network mark; each network filter shows only that network's chats; the
      Partners filter shows only partners; my agent is pinned first.
- [ ] 4. **Groups.** A group shows channels only (no direct messages); an event channel lists only that event's
      attendees and host.
- [ ] 5. **Composer.** Exactly @, 📎, emoji and mic; 📎 finds an item by typing and by tab; Reply shows the quoted
      message above the input; Forward sends the same point (positions shared), not a copy.
- [ ] 6. **Agent threads.** Clarify on a message opens a thread in my agent chat starting with the quoted message;
      tapping the quote returns to the source chat; the source chat shows "{n} drafts for {name}"; nothing appears
      in the shared chat until Send.
- [ ] 7. **Live thread.** Clarify on an event table thread's parent shows "Read N replies"; a reply added afterwards
      raises N on the next agent answer.
- [ ] 8. **Chips.** Chips appear only in agent conversations, change with context, and fill the input without
      sending.
- [ ] 9. **Drafts.** A draft can be edited and deleted; "Send to {name}" appears only in a thread with a known
      recipient; nothing is sent or published without Bob's tap.
- [ ] 10. **Loop.** The sent item arrives in the Bob-Alice chat as a reply quoting the source; Alice cannot see Bob's
       story or guess before her answer; after it, Bob's chat shows his guess next to her answer (the v10 BLOCKED
       step).
- [ ] 11. **Repeats.** Sending the same point twice shows one card plus one reference; editing updates the one card
       and adds the update line.
- [ ] 12. **Details.** Opens from a card and from ⋮ → Clarity Ledger; shows both positions and the guess next to the
       answer; no card flips anywhere.
- [ ] 13. **Actions.** A private point and a private story offer no Forward to anyone; a point another person holds a
       position on offers no Edit or Delete.
- [ ] 14. **Partners.** "+ New" → New partner reaches today's partner flow for someone without an account; "Invite as
       partner" in a chat header moves through pending to the "Partner" label.
- [ ] 15. **Bridge (mock).** An item Bob sends in a bridged chat shows, in Alice's WhatsApp preview, as text plus a
       link; Alice's Clarity Chat reply does not appear in that preview.
- [ ] 16. **Mobile.** Every screen above works at 375 and 320 without horizontal scroll; hover-only actions have a
       long-press or ⋯ equivalent.
- [ ] 17. **Blind walk.** A first-time user, given the main path's one-sentence task, finishes all three parts on the
       phone viewport; every stop is recorded.

## Done-When

- [ ] Typecheck errors per file match the branch baseline; all P1495 and v8 tests still pass; new v11 tests cover
      AC 6, 7, 10, 11, 13.
- [ ] AC 1 output (with the known-bad control) and the reviews are attached with `<reports received> of <spawned>`:
      reuse audit, design consistency (Telegram for the frame, Buzz for @ and threads), blind walk, visual QA at
      both viewports.
- [ ] Superseded specs closed (Related).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Whole-vision scope overwhelms one build | MITIGATE | Build in slices on one branch: frame → inbox and groups → agent threads → loop and Details → bridge and event mocks; verify each slice before the next |
| A Telegram-like frame drifts from the product's cards | MITIGATE | D26 reuse gate on cards; design review checks frame against Telegram, cards against /feed |
| Reversing the 2026-10-12 rulings (D1, D13) without recording them | MITIGATE | Recorded here; `/kdd` after build writes them to decisions.md |
| Mock bridge suggests a real integration exists | ACCEPT | Strip label; the real bridge is P1457 |
| Real Feed/Events pages render the dev database inside the frame | ACCEPT | Signed out, labelled by the strip (P1495 precedent) |
| Too many draft actions confuse | MITIGATE | At most two primary actions on a draft (Send or Publish, then Edit) |

**Non-Goals**
- Do NOT build: their story (P1497), card history (P1496), rewind (P1499), other agents (P1498), Canvas from event
  threads (P1500), who-can-see (P1501), private library (P1502), connection levels, a real bridge, real
  transcription, account creation.
- Do NOT change production components, pages or copy, except optional props no production caller passes.
- Do NOT show anything private on My Profile.
- Do NOT let the agent post into a shared chat, publish, or send without the owner's tap.

## Invariants

- Positions are chosen only with production `PositionButtons`.
- Agents never score and never write for the other person; an agent's owner is always shown.
- Seals (P1495): Bob's story opens for Alice only after her answer on the point; Bob's guess and numbers only after
  her matching answer.
- A private item never reaches a person outside the chat it was sent to.
- No real person's content in any tracked file, test, commit or review prompt; never read a `.local` folder.

## Open Questions

1. `[FOUNDER DECISION]` The bridged-link text Alice sees in WhatsApp (UI Contract).
2. `[FOUNDER DECISION]` The fictional agent's name in mock mode.
3. Are Explore's Feed and Events enough for signed-in users, or does Groups (the real directory) also belong in
   Explore when groups are already spaces in the rail? Recommendation: groups only as spaces.

## Related

**Supersedes** (to close after this spec is accepted): P1495 (v10), P1485 (v8, branch only), P1484 (v7), P1469 (v6),
P1467 (v5), P1460 (connection levels), P1462 (left menu), P1431 (mirror-agent letter chat); P1459 → P1496.
**Update with this direction:** P1457 (real bridge: D4, D23), P1461 (D5), P1455 (D11, D13), P1456 (no connection
levels), P1458 (D18), P1465 (aim at the guess line).
**Follow-ups:** P1496 history in Details · P1497 their story · P1498 other agents · P1499 rewind · P1500 Canvas from
event threads · P1501 who can see a card · P1502 private library. **Keep:** P1466, P1470.
**Rulings:** 2026-10-12 [product] mental model and mirror-agent role ("Alice in Bob's eyes", owner always shown) ·
2026-10-12 [product] Clarity Chat letter thread (reversed by D13) · 2026-09-16 [product] Links menu on every
surface (D7) · P1495 Build Evidence (branch).
