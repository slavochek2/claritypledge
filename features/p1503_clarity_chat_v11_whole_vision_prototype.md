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

## Run This

Type this from anywhere in the repo. The main checkout is fine. There is nothing to `cd` into and nothing
to rebase: the worktree on this branch already exists and already carries this spec with the pinned contract.

    /goal "Work in the worktree on branch feature/p1437-conversation-groups-v2. Then: ./scripts/goal-gate.sh p1503 exits 0, output pasted. Stop after 60 turns."

`/goal` is native Claude Code, not a repo skill. The founder types it, because no agent can invoke it for
them. The condition names an exit code on purpose: the evaluator reads the transcript and runs nothing, so
the only condition it can trust names something the agent cannot write.

**Why the worktree clause is not decoration.** The gate hard-refuses to run on the shared main checkout,
so a loop started there cannot reach exit 0. Naming the branch rather than a slot keeps this line correct
if the work ever moves. **Recovery (P1479):** if a run is killed mid-gate, the branch can be left pointing
at its merge-base. Restore it with `git reset --soft <sha of backup/p1503-start>` inside the worktree.

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
  F1-F9 were answered 2026-10-16 (below); message choices C1-C4 default to their recommendation.
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
| D13 | Preparation lives in **threads inside my chat with my agent**. **Reverses** the 2026-10-12 ruling's "private thread inside the Bob-Alice DM". A thread starts with the quoted source message (author, and which chat or channel), no title; tapping the quote returns there. In the source chat, a badge only I see (Mira's avatar + "{n} drafts") opens the thread. |
| D14 | Clarify is one action on any message. On a message that has a thread, Clarify brings the whole thread **live**: the thread header shows "💬 {n} replies"; a draft made earlier shows "↻ {n} new replies" when replies arrive. |
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

## Founder answers to the review questions (2026-10-16)

| # | Question | Answer |
|---|---|---|
| F1 | Is Alice a Clarity Chat member on the main path? | **Yes.** "Send to Alice" delivers into the Bob-Alice Clarity chat; the bridged WhatsApp chat gets the notice plus a link to it. How someone becomes a member from a WhatsApp invitation is P1456. |
| F2 | Do Alice's answers reach Bob as she taps? | **Yes, as everywhere else in the product:** a tapped position is submitted and can be changed later. Her **first** position on a received point is recorded as her blind answer (it opens the story); later changes show as changes. A story rating keeps its own Submit (production rating card). |
| F3 | Predictions? | **Two, with different audiences.** Bob's guess of Alice's position on the point is **private to Bob** (it shapes the point; see §3). Bob's 0-10 prediction of how well Alice will understand his story is revealed to both after her rating (as in letters). |
| F4 | Can Bob edit his story after Alice rated it? | **Not in v11:** once Alice has rated it, Bob can no longer edit its text (its visibility does not change; a public story stays public). Whether rated stories should instead be kept as snapshots while the live story moves on is P1504. |
| F5 | Agent label | "{agent} · {owner}'s mirror agent" (2026-10-12 ruling). |
| F6 | Letters | 📎 attaches a link to an existing letter. Writing letters in chat is P1431. |
| F7 | What reaches WhatsApp | The per-action translation table lives in P1457 (the bridge spec); v11 mocks its first rows (§2). |
| F8 | Mock agent name | **Mira** (as in real mode). |
| F9 | Older specs | Production work stays open and is updated; only the prototype rounds v5-v10 (P1467, P1469, P1484, P1485, P1495) and the separate ledger (P1459) are closed. |

## Solution

Build on branch `feature/p1437-conversation-groups-v2` (worktree w7). v11 lives in its own folder and **reuses** v10/v8
components; v10's own files and tests stay frozen under `?v=10` (v10 shows the guess to Alice, which v11 forbids).
`/tree/conversation-groups` renders v11; v10 stays under `?v=10`, v8 under `?v=8`. The private `?real=1` loader keeps working; in real mode the
agent is Mira. Fictional people: Alice, Bob, plus mock group members. Signed out goes to the real `/feed` (P1495).

### 0. Existing parts to reuse, not rebuild (reuse before invent)

| v11 element | Existing part (branch or production) |
|---|---|
| Agent thread panel | v8 `AskThreadPanel` (`ask-thread.tsx`) |
| Sharpen chip trigger | v7 `isClose` / `sharpenAvailable` (`letter-state.ts`): "close" = at most one step apart |
| Inferred sentence keep/delete | v7 `SourcedStory` "Keep as mine" / "Delete" (`letter-thread.tsx`) |
| Network filter | v8 `SpaceFilter` |
| "via your WhatsApp" subtext | v8 `ViaLine` |
| Reply quote above the composer | v8 `Composer` `quote` |
| Date dividers | v8 `Divider` |
| Mic | v8 `useVoiceInput` |
| Guess line | v8 `EyesHeader` + read-only `GuessMenu` (dashed graphite, 2026-10-12 ruling) |
| Bob's result after her answer | v7 `WhereYouStand` (his own, his guess, hers; `letter-result.tsx`) |
| Point edited | production point version chain (`supersededBy`, `PointVersionHistory`, "Earlier wording") |
| Details | production `point-detail-page` layout (positions by stance, versions, stories), seals applied |
| Partner pending / invite | production `AgreementRow` ("Pending"), create-agreement send control |
| Only-you mark | v8 `OnlyYou` "Only visible to you" |

### 1. Frame (D2-D9)

- **Phone:** the chat list is the first screen. Header: avatar (opens the drawer), a space switcher title ("Inbox ▾",
  listing Inbox and each group space), search, Tools, "+ New". Filter chips: All, Unread, Partners, WhatsApp,
  Telegram, LinkedIn, Group chats. A chat opens full screen with Back; Back from an agent thread returns to the chat
  it was opened from; from Details, to the card.
- **Desktop:** a narrow rail (Inbox, each group, "+", Tools at the bottom of the rail, my avatar at the top), the
  chat list, the open chat. One right side panel at a time: an agent thread or Details; opening Details from inside
  a thread stacks over it with Back.
- **Inbox rows:** avatar, name, last message, time, unread count; network mark on bridged chats; "Partner" where
  applicable; order: an "Archived" row, then my agent pinned, then chats by recency.
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
- **Bridged chat (mock):** network mark in the header; the header subtext says "via your WhatsApp"; a strip lens shows
  Alice's WhatsApp, where Clarity actions appear per the translation table in P1457 (v11 mocks every row of the
  Messages WhatsApp table; nothing sealed ever); tapping the link opens the Bob-Alice
  Clarity chat in Alice's lens (F1).
- **Event channel (mock):** a table thread with /transcribe lines; the strip has "Add a reply (mock)" to grow it.

### 3. My agent (D12-D17, D20)

- The agent chat holds free mirror work with chips: "Suggest a point", "Suggest a story".
- A "Threads ({n})" bar at the top of the agent chat lists its threads; each opens with the quoted source and pins
  the item in focus (D20); chips by context: "Suggest points", "Suggest a story", "Suggest a story for this point".
- The agent proposes the fitting format (point or story) from the material; Bob steers in plain words. No mode picker.
- **The private guess sharpens the point:** when Bob's guess of Alice's position sits close to his own, the chip
  "≈ Same as yours · Sharpen" appears (no agent narration); tapping it asks Mira to sharpen the point so the two
  positions would differ most.
- **Bob's own story, only from his words** (P1484 D13): an agent draft of Bob's story uses only what Bob wrote in the
  source; any sentence the agent inferred is marked and must be kept or deleted by Bob before Send.
- Draft endings (D17): a draft that carries a guess of a person's position offers only **Send to {name}** (2026-10-12
  ruling: a prediction about a person is private or addressed to that person). **Publish to my profile** exists only
  for drafts without a guess. Linking a story to a point updates the card's story count (no message).

### 4. The loop (D18, F1-F4)

1. Bob taps Clarify on Alice's message in the bridged WhatsApp chat → his agent thread opens (side panel on desktop
   with Alice's chat still visible; full screen on phone).
2. The agent proposes 1-3 points. On the draft, Bob takes his position with `PositionButtons` and guesses Alice's with
   `GuessMenu`. Positions on a draft are private until Send (a draft is his alone).
3. Bob adds his story (required on the main path; a point alone may also be sent): "Add a story" (manual) or the chip
   "Suggest a story".
4. Bob predicts how well Alice will understand his story (`ComprehensionRatingCard`, P1495 sentence).
5. Before Send, the preview labels each item with the C2 label family (Messages): point "Visible now", story
   "Visible after their answer", prediction "Visible after their rating", guess "Only visible to you".
6. Send to Alice → the item arrives in the Bob-Alice Clarity chat as a **reply quoting** the source message.
7. Before her first position Alice sees only the point statement and the position buttons: no Bob position, no
   position counts, no story footer (as v10 and production letters do). She taps her position (submitted at once, as
   everywhere; her first position is her blind answer). That opens Bob's story; she reads it and rates it with the
   rating card's Submit. Withdrawing her position never re-seals what she has seen.
8. After her rating, both see the story result: Bob `CalibrationVerdict perspective="sender"`, Alice
   `perspective="reader"`. Bob also sees, privately, his guess next to her position (the v10 BLOCKED step).

**One exchange per point per person:** a point is sent to a person once; stories added later join that exchange,
each with its own prediction and seal. A second mention of the point in that chat is a reference (D20).

**Guess line** (above the card: v8 `EyesHeader` + read-only `GuessMenu`, the existing pattern for a predicted stance,
dashed graphite per the 2026-10-12 ruling, never the blue of a stated position), **shown to Bob only:**
- before Alice answers: "Alice in Bob's eyes · {guess} (your guess)";
- after her first position: v7 `WhereYouStand` (his own, his guess, hers); hers is her **current** position, with "↺"
  opening her first (blind) one.
Alice never sees Bob's guess in v11; showing her how Bob sees her belongs with "their story" (P1497).

### 5. Details (D19)

One view per item (side panel on desktop, full screen on phone), built from the production `point-detail-page` layout
(positions by stance, versions, stories) plus the guess line for Bob and story ratings and predictions
(`CalibrationVerdict` / `RatingDotsPending`). **Details and the Clarity Ledger apply the same seals per
viewer as the chat:** before Alice takes a position, her Details shows the point only; Bob's guess never appears in
her Details; his story prediction appears only after her rating.

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
| Public | author, until rated (F4) | author, until rated | ✓ | ✓ | ✓ | ✓ |

**Letters (F6):** a letter link in a chat offers Reply and opens the letter page; nothing else.
An edited point shows the production version chain ("Earlier wording"); edits are always by the author, never the
agent (D12).

### 7. Second path: event channel (D14, D24)

Clarify on a table thread's parent message opens an agent thread quoting it, with "💬 {n} replies" in its header. "Send to" goes
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
| Draft badge | Mira's avatar + "{n} drafts" | D13, Messages |
| Agent threads bar | "Threads ({n})" | Solution §3 |
| Guess line | per §4 renderings | D18; 2026-10-12 mental-model ruling |
| Thread status | "💬 {n} replies" · "↻ {n} new replies" | D14, Messages |
| Repeat reference | "↗ {statement or first words}" | D20, Messages |
| Edit mark | production point version chain | D20, Messages |
| Agent identity | "{agent} · {owner}'s mirror agent" | F5, 2026-10-12 ruling |
| Pre-send labels, sharpen chip, bridged lines, every other message | see Messages | C1-C4 |
| Mock agent name | "Mira" | F8 |
| Message actions | "Reply" · "Forward" · "Clarify" | D11, D14 |
| Strip | "Add a reply (mock)" · Alice's WhatsApp lens label | prototype only |

## Messages (shortest set; drafted by a UX writer, critiqued by Gemini 4 Argon, 2026-10-16)

Rules: Mira never narrates what the screen already shows, and speaks only to ask or to warn. Write only what breaks an
assumption. The 🔒 icon keeps its product meaning only: a **private item**. "Only you see this" states use the existing "Only
visible to you" mark (eye-off icon, v8 `OnlyYou`), never inside Bob's own agent chat. A repeat is a badge or a mark, never a new line. Choices C1-C4 below default to the recommendation.

| Where | Treatment | Copy or visual |
|---|---|---|
| Mira introducing suggestions | none | 0 words; the cards speak |
| Sharpen the point (§3) | chip only | "≈ Same as yours · Sharpen" |
| Drafts in a person's chat (D13) | badge by the composer | Mira's avatar + "2 drafts" (only Bob sees it) |
| Live thread (D14) | stamp on the thread header | "💬 12 replies", updating in place |
| Stale draft (D14) | badge on the draft | "↻ 3 new replies" |
| Point edited (D20) | production edited-point marking | the point version chain ("Earlier wording"), as on /feed |
| Story linked to a point | none | the card's story count changes |
| Same item mentioned again (D20) | compact chip | "↗ {statement or first words}" |
| Guess line, Bob only (§4) | `EyesHeader` + read-only `GuessMenu` (C1) | "Alice in Bob's eyes" + dashed graphite guess, "(your guess)"; after her answer, `WhereYouStand` (§4) |
| Inferred sentence in Bob's story (§3) | dashed highlight + keep/delete | first time only: "Mira inferred this · keep or delete" |
| Agent identity (F5) | chat header and inbox subtext | "Mira · Bob's mirror agent" |
| Bridged chat | header subtext, no banner | network icon + "via your WhatsApp" |
| Story sealed for Alice | on the sealed card, every time | "Visible after your answer" (same label family as C2); a story added after she answered is not sealed |
| Alice changed her position | mark beside it | "↺" (tap: earlier position) |
| Partner pending (D9) | header status | "Partner invite pending" |
| 📎 item from another chat | subtext on the disabled row | "🔒 In {name}'s chat" |
| Draft with a guess | subtext by Send | "Has your guess · Send only" |
| Story after Alice rated it | Edit disabled in ⋯ | "Rated · can't edit" |
| Before sending (§4 step 5) | one consistent label per item, every time (C2) | point "Visible now" · story "Visible after their answer" (a public story: "Visible now") · prediction "Visible after their rating" · guess "Only visible to you" (`OnlyYou`; the preview is the one place it appears inside the agent thread) |
| Bob's story prediction (§4 step 4) | rating card question | production sentence (P1495) |

**WhatsApp (bridged), one Send = at most one message, written as Bob, short readable start plus link (C3). This table
is the only source; no line ever carries story text (v8 `waLine`'s story branch must not be reused as is):**

| Bob's action | What Alice's WhatsApp shows |
|---|---|
| Shares a point (with or without a story) | "{statement}" {link} |
| Shares a story alone | "A story for you: {link}" |
| Shares a letter link | "A letter for you: {link}" |
| Rates Alice's story (only when Alice shared a story; not on the v11 main path) | "Read your story: {link}" |
| Invites Alice as a partner | "Partners on Clarity? {link}" |
| Takes a position on Alice's point | nothing (C4) |

**Founder choices (defaults applied):**
- C1. Guess line: **reuse the existing guess pattern** (`EyesHeader` + read-only `GuessMenu`, dashed graphite), and
  `WhereYouStand` after her answer (founder 2026-10-16: reuse what the app already does; the profile's blue badge
  would make a guess look like a real position, against the 2026-10-12 ruling).
- C2. **One label family everywhere:** "Visible now" · "Visible after their answer" · "Visible after their rating" ·
  "Only visible to you" (the existing v8 mark) (founder 2026-10-16: consistent format; no "she"; no lock icon, which
  means a private item).
- C3. WhatsApp lines start with 2-4 readable words before the link, rather than a bare link relying on the preview:
  **readable start** (previews often fail; a bare link looks like phishing). Exact wording `[FOUNDER DECISION]`.
- C4. No WhatsApp line when Bob takes a position on Alice's point: **none**.

## Acceptance Criteria

Checked at 375 (and 320) and 1440, fresh session, fictional data, not signed in to the app.

- [ ] 1. **Reuse gate (cards).** The P1495 reuse-gate script is committed under `scripts/prototype/` with its
      known-bad control (v9 position picker) and the widened raw-tag regex `([\s>/]|$)`; run over the v11 card and
      loop files (only files under the v11 `frame/` folder are exempt from the raw-tag check, and the gate fails if any
      frame file imports a card, position, guess or rating component), it passes, and the control fails both parts. Mock points carry
      tags so "same tag pills" is not vacuous.
- [ ] 2. **Frame.** The chat list is the first screen on phone and the logo returns to it on desktop; no "Chats" or
      "Home" item; the drawer opens from the avatar and holds exactly My Profile, Explore, Settings, About; Tools
      opens in one click from the header (phone) or rail (desktop); the space switcher reaches each group on phone.
- [ ] 3. **Inbox.** Bridged chats show their network mark; each network filter shows only that network's chats;
      Partners shows only partners; the list order is the "Archived" row, then my agent pinned, then chats by recency.
- [ ] 4. **Groups.** A group space shows channels only; an event channel lists only its attendees and host.
- [ ] 5. **Composer.** Exactly @, 📎, emoji and mic; 📎 finds an item by typing and by tab and refuses a private item
      from another chat; Reply quotes the message above the input; Forward of a public point sends the same point
      (a position taken in one chat shows in the other).
- [ ] 6. **Agent threads.** Clarify opens a thread in my agent chat starting with the quoted message; the quote
      returns to the source chat; the source chat shows Mira's avatar + "{n} drafts" to Bob and not to Alice; nothing
      appears in the shared chat until Send; "@<agent> …" typed in the shared chat is not posted there.
- [ ] 7. **Live thread.** On the event path, "💬 {n} replies" rises after "Add a reply (mock)"; an earlier draft shows
      "↻ {n} new replies"; "Send to" targets the quoted author's direct chat.
- [ ] 8. **Chips.** Only in agent conversations, change with context, fill the input without sending.
- [ ] 9. **Drafts.** Edit and delete work; a draft with a guess offers "Send to {name}" and no Publish; tapping Send
      is the only way the item reaches Alice.
- [ ] 10. **Loop and seals.** The item arrives in the Bob-Alice Clarity chat as a reply quoting the source; before
       Alice taps a position, her chat and her Details show neither Bob's position, the position counts, his story
       nor his prediction; after her position and before her rating she sees the story but no prediction; Bob's guess
       never appears in Alice's view, before or after her rating; after her position Bob sees `WhereYouStand`; after her
       rating both see the story result (the v10 BLOCKED step).
- [ ] 11. **Repeats.** Sending the same point twice in one chat shows one card plus one reference; an edit shows the
       production version chain on the one card.
- [ ] 12. **Details.** Opens from a card and from ⋮ → Clarity Ledger; no card flips anywhere.
- [ ] 13. **Actions.** Private items offer no Forward; a point another person holds a position on offers no Edit or
       Delete; a story Alice has rated offers Bob no Edit (F4).
- [ ] 14. **Partners.** "+ New" → New partner reaches today's partner flow for someone without an account; "Invite as
       partner" → send → "Partner invite pending" → accepted in Alice's lens → "Partner".
- [ ] 15. **Bridge (mock).** Alice's WhatsApp lens shows only the P1457 notices for the mocked actions (never story
       text, a guess or a number) plus a link; the link opens the Bob-Alice Clarity chat in Alice's lens; her Clarity reply does not appear in
       the WhatsApp lens.
- [ ] 16. **Mobile.** Every screen works at 375 and 320 without horizontal scroll; every hover action has a long-press
       or ⋯ equivalent.
- [ ] 17. **Blind walk.** A first-time user given the UX Notes task finishes all three parts on the phone viewport with
       zero BLOCKED steps; every stop is recorded.

## Done-When

- [x] F1-F9 answered and written into this spec (2026-10-16).
- [ ] Typecheck errors per file match the branch baseline; all P1495 tests (run against the frozen v10 under `?v=10`) and
      v8 tests pass; new v11 tests cover AC 5, 6, 9, 10 (including the guess hidden from Alice after her position and
      after her rating), 11, 13.
- [ ] AC 1 output with its control and the reviews attached with `<reports received> of <spawned>`: reuse audit,
      design consistency (Telegram for the frame, Buzz for @ and threads, /feed for cards), blind walk, visual QA at
      both viewports.
- [ ] Superseded specs closed and "update" specs updated (Related).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Whole-vision scope overwhelms one build | MITIGATE | Slices on one branch, each verified before the next: frame → inbox and groups → agent threads → loop, seals and Details → bridge and event mocks |
| Shared state across live threads, versions and seals breaks | MITIGATE | One exchange per point per person; a story's text can no longer be edited once rated (F4); live thread changes never edit a draft, they only show "↻ {n} new replies" |
| The bridge leaks sealed or private content | MITIGATE | WhatsApp lines carry only what the Messages table lists (point statement at most); the link opens only for the named recipient; no Clarity items into bridged group chats |
| The agent invents Bob's first-person story | MITIGATE | Only-from-his-words rule (§3) |
| Reversed rulings go unrecorded | MITIGATE | Recorded below; `/kdd` after the build writes them to decisions.md |
| Mock bridge suggests a real integration exists | ACCEPT | Strip label; the real bridge is P1457 |
| Real Feed/Events pages render the dev database inside the frame | ACCEPT | Signed out, labelled by the strip (P1495 precedent) |

**Reversals this spec makes (to record):** 2026-10-12 left-menu/imports order (D1) and the private thread inside the
Bob-Alice DM (D13); P1469 D18 "Letters, checks and threads exist only in the ClarityPledge space" (D4/D23) and D19
"None in the letter loop or in agent chats" (threads, D13); P1484 "In v7 she answers nowhere in chat" (Alice answers
in chat, §4) and P1484 D25 "Nothing reaches Bob before" she sends (positions submit on tap, F2); P1469 D14 "Bob agrees
to that exposure" now covers only the story prediction (the guess stays private, F3).

**Non-Goals**
- Do NOT build: their story (P1497), card history (P1496), rewind (P1499), other agents (P1498), Canvas from event
  threads (P1500), who-can-see lists (P1501), private library (P1502), connection levels, agent-flagged moments in
  imported chats (P1470), a real bridge, real transcription, account creation, a non-member answer path (P1456),
  new letters.
- Do NOT change production components, pages or copy, except optional props no production caller passes.
- Do NOT show anything private on My Profile.
- Do NOT let the agent post into a shared chat, publish, or send.

## Invariants

- **Reuse before inventing** (founder, 2026-10-16): for every element, first check whether the app already solves the
  same problem somewhere (feed, /stake, profiles, letters, compare) and reuse that component and pattern. New design
  only for problems that are actually new; each new one is named in the build report.

- My own position is set only with production `PositionButtons`; a guess of another person's position only with
  P1495's `GuessMenu`.
- Agents never score and never write for the other person; an agent's owner is always shown.
- Seals apply on every surface (chat, Details, Clarity Ledger, previews, bridged lines) to **private** items: before
  Alice's first position she sees no Bob position, no counts and no story; Bob's story opens after her first
  position; his story prediction only after her rating; his guess of her position never, in v11. A public story, or
  a story sent on its own, is readable on delivery (only its prediction waits for her rating). Withdrawing a
  position never re-seals.
- A prediction about a person is private or addressed to that person; it is never published.
- A private item never reaches a person outside the chat it was sent to, including through 📎.
- Bob's own story contains only his words unless he kept an inferred sentence explicitly.
- No real person's content in any tracked file, test, commit or review prompt; never read a `.local` folder.

## Related

**Closes** (prototype rounds; closed on the prototype branch, they reach main when it ships): P1467 (v5), P1469 (v6),
P1484 (v7), P1485 (v8), P1495 (v10). **Closed on main:** P1459 → merged into P1496.
**Update with this direction (production work, kept open):** P1457 (real bridge + the translation table), P1460
(partners: D8, D9), P1461 (D5), P1462 (production menu, after v11), P1431 (letters written in chat), P1455 (D11,
D13), P1456 (non-member path, including becoming a member from a WhatsApp invitation), P1458 (guess private to Bob),
P1465 (aim at the guess line), P1470 (deferred: no agent flags in v11).
**Follow-ups:** P1496 history in Details · P1497 their story · P1498 other agents · P1499 rewind · P1500 Canvas from
event threads · P1501 who can see a card · P1502 private library · P1504 story versions and snapshots. **Keep:** P1466.
**Rulings:** 2026-10-12 [product] mental model and mirror-agent role ("Alice in Bob's eyes"; "<Name> · Bob's mirror
agent"; predictions private or addressed) · 2026-10-12 [product] Clarity Chat letter thread (reversed by D13) ·
2026-09-16 [product] Links menu on every surface (D7) · P1495 Build Evidence (branch).
**Reviews of this spec (2026-10-16):** 3 of 3 reported — Opus, Gemini 4 Argon (served model verified), Codex
(gpt-6.1-sol, high). Their blockers are resolved above; F1-F9 answered by the founder.

## Resolved Decisions

From `/goalify p1503`, 2026-10-16. These are appended and rewrite nothing above.

| # | Question | Answer |
|---|---|---|
| RD-1 | C3: the exact wording of the WhatsApp lines | **The Messages table lines, verbatim** (founder). AC 15's test asserts those five strings. |
| RD-2 | The blind reviewers' visual reference | **The named products plus this spec** (founder): Telegram for the frame, Buzz for @ and threads, the real `/feed` for cards, plus the UI Contract and Messages. There is no separate mock-approval round. |
| RD-3 | What a review round contains | **All four lenses, every round** (founder): reuse audit, design consistency, visual QA, blind walk. Each round uses fresh agents and one fresh aggregator. The confirming round re-runs all four. |
| RD-4 | Who does the blind walk (AC 17) | **A fresh agent** (founder) that has seen no prototype version and not this spec. It gets only the UX Notes task and the phone-viewport page. |
| RD-5 | The "update specs updated" half of the last Done-When line | **Already satisfied on main** (verified by grep at goalify: all ten update specs mention P1503). The branch copies are 198 commits stale. **The loop must not edit P1457, P1460-P1462, P1431, P1455, P1456, P1458, P1465 or P1470 on the branch**, because that would only make merge conflicts. The closure half is already on the branch: P1467, P1469, P1484, P1485 and P1495 are in `features/archive/` with `status: rejected`. |
| RD-6 | Anything the build needs that this spec does not decide | **Not invented** (founder brief). The loop takes the nearest spec-traceable option, or leaves the element out, and logs it in `assumptions.md` under `## For the founder`. It does not stop. Each NEW element is named in the build report. |
| RD-7 | Turn budget | 60, not goalify's default 30. The run is five build slices plus at least two full review rounds and a Codex pass. `feedback.md` records the turns actually consumed. |
| RD-8 | Where v11 gets P1503 from | Only the spec file is copied from main onto the branch. Main is **not** merged in (198 commits, and unrelated to this work). |
| RD-9 | Final reviews | **Codex and Gemini 4 Argon both review at the end** (founder, 2026-10-16, a standing request), each on technical correctness, code quality, and UX/UI from the user's perspective. A fifth blind lens (ux) removes or simplifies unnecessary text, turns text into visuals, and catches confusing or broken things before the founder sees them. The reuse lens and both reviewers also check design-system consistency and, for every new element, whether an existing component already solves it (founder, 2026-10-16). |

## Verification Contract

**28 rows: 22 MECHANICAL, 5 COMPARABLE, 1 HUMAN-ONLY (4%).** CHECK 1 recomputes these numbers and does not trust this sentence.
Every row's test resolves this spec by glob (`features/**/p1503_*.md`), never by literal path, because `/ship`
moves the file. No command contains a pipe, because the gate splits rows on `|`. A filter matching no test
files must fail its row, so every vitest row names explicit files, except R-2, whose four prefixes each match
frozen files.

**Facts these rows rest on, measured at goalify (2026-10-16):** the branch tip before this run is `495748c29`.
`backup/p1503-start` is goalify's setup commit on top of it, which carries this spec and the baseline. At `495748c29`, `tsc -p tsconfig.app.json` reports 1167 errors in 266 files. This
matches the P1495 build evidence and is the baseline in `features/verification/p1503/typecheck-baseline.tsv`,
pinned by goalify and not written by the loop. The v9 known-bad control is `src/app/prototypes/v9/shared/position-picker.tsx`
at `52e27cd47^`, the parent of the commit that deleted v9.

| line | class | decided by | artifact |
|---|---|---|---|
| AC-1 reuse gate committed under scripts/prototype/ with raw-tag regex ([\s>/]or end); passes on the v11 card and loop files; frame/ is the only raw-tag exemption; fails if a frame file imports a card, position, guess or rating component; the v9 picker control fails both parts; mock points carry tags | MECHANICAL | `npx vitest run src/tests/p1503-reuse-gate.test.ts` | scripts/prototype/reuse-gate.sh |
| AC-2 frame: chat list first on phone, logo returns to it on desktop, no Chats or Home item, drawer holds exactly My Profile, Explore, Settings, About, Tools one click, space switcher reaches each group | MECHANICAL | `npx vitest run src/tests/p1503-v11-frame.test.tsx` | src/tests/p1503-v11-frame.test.tsx |
| AC-3 inbox: network marks, each network filter shows only its chats, Partners filter, order is Archived row, then agent pinned, then recency | MECHANICAL | `npx vitest run src/tests/p1503-v11-inbox.test.tsx` | src/tests/p1503-v11-inbox.test.tsx |
| AC-4 groups: a space shows channels only, an event channel lists only its attendees and host | MECHANICAL | `npx vitest run src/tests/p1503-v11-groups.test.tsx` | src/tests/p1503-v11-groups.test.tsx |
| AC-5 composer: exactly @, paperclip, emoji, mic; the picker finds by typing and by tab and refuses a private item from another chat; Reply quotes; Forward of a public point sends the same point and a position in one chat shows in the other | MECHANICAL | `npx vitest run src/tests/p1503-v11-composer.test.tsx` | src/tests/p1503-v11-composer.test.tsx |
| AC-6 agent threads: Clarify opens a thread starting with the quote; the quote returns to the source; the drafts badge shows to Bob and not to Alice; nothing reaches the shared chat before Send; an @agent message is not posted in the shared chat | MECHANICAL | `npx vitest run src/tests/p1503-v11-threads.test.tsx` | src/tests/p1503-v11-threads.test.tsx |
| AC-7 live thread: the replies count rises after Add a reply (mock); an earlier draft shows the new-replies badge; Send to targets the quoted author's direct chat | MECHANICAL | `npx vitest run src/tests/p1503-v11-live-thread.test.tsx` | src/tests/p1503-v11-live-thread.test.tsx |
| AC-8 chips: only in agent conversations, change with context, fill the input without sending | MECHANICAL | `npx vitest run src/tests/p1503-v11-chips.test.tsx` | src/tests/p1503-v11-chips.test.tsx |
| AC-9 drafts: edit and delete work; a draft with a guess offers Send to and no Publish; Send is the only way an item reaches Alice | MECHANICAL | `npx vitest run src/tests/p1503-v11-drafts.test.tsx` | src/tests/p1503-v11-drafts.test.tsx |
| AC-10 loop and seals in chat and Details: arrives as a reply quoting the source; before her position Alice sees no Bob position, counts, story or prediction; between position and rating, story but no prediction; Bob's guess absent from Alice's DOM before her position, after it, and after her rating; WhereYouStand for Bob after her position; both see the result after her rating | MECHANICAL | `npx vitest run src/tests/p1503-v11-seals.test.tsx` | src/tests/p1503-v11-seals.test.tsx |
| AC-11 repeats: the same point twice gives one card plus one reference; an edit shows the production version chain on the one card | MECHANICAL | `npx vitest run src/tests/p1503-v11-repeats.test.tsx` | src/tests/p1503-v11-repeats.test.tsx |
| AC-12 Details opens from a card and from the Clarity Ledger menu; no card flip anywhere | MECHANICAL | `npx vitest run src/tests/p1503-v11-details.test.tsx` | src/tests/p1503-v11-details.test.tsx |
| AC-13 actions: private items offer no Forward; a point another person holds a position on offers no Edit or Delete; a story Alice rated offers Bob no Edit | MECHANICAL | `npx vitest run src/tests/p1503-v11-actions.test.tsx` | src/tests/p1503-v11-actions.test.tsx |
| AC-14 partners: New partner reaches today's partner flow for someone without an account; Invite as partner, send, pending, accepted in Alice's lens, Partner | MECHANICAL | `npx vitest run src/tests/p1503-v11-partners.test.tsx` | src/tests/p1503-v11-partners.test.tsx |
| AC-15 bridge (mock): Alice's WhatsApp lens shows only the RD-1 lines for the mocked actions, never story text, a guess or a number; the link opens the Bob-Alice Clarity chat in Alice's lens; her Clarity reply is absent from the WhatsApp lens | MECHANICAL | `npx vitest run src/tests/p1503-v11-bridge.test.tsx` | src/tests/p1503-v11-bridge.test.tsx |
| AC-16 mobile: every screen at 375 and 320 has document scrollWidth no larger than innerWidth; every hover action has a long-press or menu equivalent | MECHANICAL | `npx playwright test e2e/p1503-v11-mobile.spec.ts --project=chromium` | e2e/p1503-v11-mobile.spec.ts |
| AC-17 blind walk: a fresh agent given only the UX Notes task finishes all three parts on the phone viewport with zero BLOCKED steps, every stop recorded with its screenshot | COMPARABLE | blind-reviewer (lens: walk) | features/verification/p1503/review-round-*.md |
| R-1 typecheck: zero errors in any file under v11/; every other file's error count is no higher than in the pinned baseline | MECHANICAL | `npx vitest run src/tests/p1503-typecheck-baseline.test.ts` | features/verification/p1503/typecheck-baseline.tsv |
| R-2 every existing prototype test still passes (v6, v7, v8, v10) | MECHANICAL | `npx vitest run src/tests/p1437-v6 src/tests/p1437-v7 src/tests/p1485-v8 src/tests/p1495-v10` | src/tests/p1495-v10-review.test.tsx |
| R-3 v10 is frozen: its folder and its four tests are byte-identical to the pre-run tip | MECHANICAL | `git diff --quiet 495748c29 -- src/app/prototypes/conversation-groups/v10 src/tests/p1495-v10-alice.test.tsx src/tests/p1495-v10-bob.test.tsx src/tests/p1495-v10-ledger.test.tsx src/tests/p1495-v10-review.test.tsx` | src/app/prototypes/conversation-groups/v10 |
| R-4 routing and real mode: the route renders v11 by default, v10 under ?v=10, v8 under ?v=8; with the real loader mocked, the ?real=1 path still loads and the agent is named Mira; no v11 file imports from a .local path except through the existing real-case loader | MECHANICAL | `npx vitest run src/tests/p1503-v11-routing.test.tsx` | src/tests/p1503-v11-routing.test.tsx |
| R-5 build report: per-AC evidence, every NEW element named, reports received of spawned for all five lenses; codex-review.md (via codex-review) and gemini-review.md (via delegate-gemini, served model Gemini 4 Argon verified) both exist, each covering four headings (technical correctness, code quality, UX and UI from the user's perspective, design-system and component reuse with an existing analog named for any reinvented part), run after the last code change, every finding marked FIXED or FOUNDER | MECHANICAL | `npx vitest run src/tests/p1503-evidence.test.ts` | features/verification/p1503/build-report.md |
| R-6 superseded prototype specs closed on the branch (P1467, P1469, P1484, P1485, P1495 archived, status rejected); update specs untouched on the branch (RD-5) | MECHANICAL | `npx vitest run src/tests/p1503-related-specs.test.ts` | src/tests/p1503-related-specs.test.ts |
| C-1 reuse audit, screen half: every rendered element on every main-path state at 375 and 1440 traces to a section 0 row, a P1495 reuse-map row, or a NEW element named in the build report; every element matches the design system (tokens, type, spacing, buttons); for every NEW element the reviewer searches the app for an existing component or pattern solving the same problem, and any analog found fails the row until it is reused | COMPARABLE | blind-reviewer (lens: reuse) | features/verification/p1503/review-round-*.md |
| C-2 design consistency: frame against Telegram, @ and threads against Buzz, cards against the real /feed; each mismatch fixed or listed in assumptions.md under For the founder | COMPARABLE | blind-reviewer (lens: design) | features/verification/p1503/review-round-*.md |
| C-3 visual QA at 375, 320 and 1440 plus the empty states in UX Notes, against .claude/rules/visual-qa.md | COMPARABLE | blind-reviewer (lens: visual) | features/verification/p1503/review-round-*.md |
| C-4 UX simplification from the user's perspective: no text the screen already shows, wordy text cut or turned into a visual, nothing that does not work or confuses a first-time user; each finding fixed or listed under For the founder | COMPARABLE | blind-reviewer (lens: ux) | features/verification/p1503/review-round-*.md |
| H-1 Codex and Gemini findings the loop did not fix | HUMAN-ONLY | founder, AT /ship | features/verification/p1503/gemini-review.md |

**Reviewer roster.** Each lens is a fresh agent per round, never the agent that built or fixed the code.

| lens | given | forbidden | guaranteed renders |
|---|---|---|---|
| walk | the dev page at 375x812 (mock data, never `?real=1`) and the UX Notes task, verbatim | the spec, the diff, earlier rounds, any prototype version | its own screenshots of every stop |
| reuse | renders, section 0, the P1495 reuse map, the build report's NEW list, read access to src/app/components and src/app/pages to find analogs | the diff, the intent | 375 and 1440 for every main-path state |
| design | renders, the three named references (RD-2), the UI Contract and Messages tables | the diff, the intent, the Decisions rationale | 375, 1440 |
| visual | renders, `.claude/rules/visual-qa.md` | the diff, the intent | 375, 320, 1440, every UX Notes empty state |
| ux | renders of every main-path state and the UX Notes task | the spec, the diff, the intent | 375 and 1440 |

Renders show only the fictional Alice, Bob and mock group members. A review prompt never carries real
content. Each lens writes `features/verification/p1503/lens/round-N-<lens>.md` (outside CHECK 5's glob)
with its own verdict. A fifth fresh agent, the aggregator, reads the five lens files and writes
`review-round-N.md` directly: `VERDICT: PASS` only if all five lenses PASS, then one `SCREENSHOT: <sha256>  <path>`
line for every image any lens judged. CHECK 5 needs the last two rounds to PASS back to back.

**Evidence lives in `features/verification/p1503/`:** `contract.sha256` (the pin, on main),
`typecheck-baseline.tsv`, `review-round-N.md`, `lens/`, `build-report.md`, `codex-review.md`, `gemini-review.md`, `assumptions.md`
(every call the loop made alone, with a For-the-founder section per RD-6), and `feedback.md` (`corrections given`
and `turns consumed`, written at the moment they happen). The UAT scorecard is `features/uat/p1503.md`, one
row per AC with a result.
