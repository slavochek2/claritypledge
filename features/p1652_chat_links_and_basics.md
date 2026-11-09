---
status: qa
type: story
rank: 116
workstream: clarity-chat
created_date: '2026-11-09'
tags: [chat, links, reactions, clarity-chat]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
spec_review_hash: 9f52221a715c5b89277f9dcc2324bc4b0f4f3bee0fed8e46557c2f3b1d4b3c4c
spec_review_vendors: [codex, gemini, openrouter]
---

# P1652: Chat links and basics

## Problem

Every word in chat renders as plain text. A link someone pastes cannot be tapped, a shared letter or story looks like a raw address, the text of a message cannot be copied with one action, and a person cannot acknowledge a message without writing a reply.

> Founder, verbatim: "links don't get rendered ... generally links should be clickable, right? ... I think we can do it all in one go instead of many different things. But the links in specific place should be working."

The founder chose this scope on 2026-11-09 from a wider list reviewed against the code and by Gemini Argon: links, own-app cards, copy text and reactions in one build.

## Appetite

Blast radius: medium. It touches every chat message row and adds one table with its access rules, and a wrong access rule would expose who reacted to a message. Reversibility: medium, a code revert plus a table drop that loses only reactions. Decision density: low, with one founder call (the emoji set) defaulted below.

## Invariants

- Chat text is untrusted: anyone holding a person's personal code can open a 1:1. A link's visible text is always its real destination. No message can show one address or a prose label and lead elsewhere.
- A card shows only what the reader's own access returns. Recognising an address never widens access, and a reader without access still sees the link they were sent.
- Only `http` and `https` links are ever emitted (`.claude/rules/src.md`, User-Controlled URL Sinks).
- Displaying a message never changes what is stored. Links and cards are worked out when drawing, so editing a message updates them and stored text stays as written.
- Story, point and profile text outside chat keeps its link behaviour, with one deliberate exception: the lookalike-host refusal is added for full addresses in the shared parser, because the hole is the same everywhere.

## Solution

### 1. Links everywhere message words show in chat

The set, each by name: typed messages (main chat and threads), mirror agent messages, system posts, transcriptions, voice note transcripts, the words of a forwarded or clarified copy, and the thread carried by a Clarify copy.

Excluded because they are one tap target already: chat list previews, search hits, and reply quotes. These stay plain words.

- Reuse the existing parser (decisions.md, P540: one link system, new text surfaces use it) through a chat mode, not a second parser.
- Chat mode links only addresses visible in full. markdown link syntax (square-bracket label, then address in parentheses) stays as typed with no link anywhere in it, for people and the mirror agent alike, including in a message with chips.
- A visible address never links if its parsed host differs from what a reader sees: any internationalized host (the existing check refuses them all, so `école.fr` stays plain too: accepted), and any address with embedded credentials (a trusted-looking name, then an at sign, then the real host). A bare domain glued to a non-ASCII letter does not link its tail (`аpple.com` must not link `pple.com`).
- Own-app recognition uses the parsed origin, never a text match.
- `www.` addresses link whole, not just the part after `www.` (the parser cannot do this today; chat mode adds it).
- **Typed words:** full addresses, `www.`, and bare domains on the parser's existing list (`google.com`).
- **Spoken words (transcriptions and voice transcripts):** bare domains link only on the app's own domain; otherwise `https://`, `http://` or `www.` is required, because speech-to-text produces strings such as `let.me`.
- **Own-app links** (`claritypledge.com`, `www.` form, and the current origin) navigate in the same tab with the app's router, so Back returns to the chat. Any other link opens a new tab.
- Tapping a link opens it and does not open the message toolbar. Text around it keeps the existing tap behaviour.
- A message with `boxRefs` or the mirror's "Updated:" sentence keeps its chips; words outside chips still link. Chips are never links and a link never sits inside a chip; a markdown link syntax (square-bracket label, then address in parentheses) token stays plain whichever order the code processes them.
- **Forwarded and clarified copies:** that block is one big button today when an original exists, and a link cannot sit inside a button. Make the jump a separate "Go to original" control beside the block's label, at least 40px tall, so the words can hold links. Tapping the words no longer jumps: this is the accepted cost. Reply quotes stay one button.

### 2. Own-app cards

When a message's text holds a full address on the app's own domain to a letter, story or point (query, hash and trailing slash ignored; the id must be a valid id), draw the existing attachment card for it below the words.

- At most one card per message: the first recognised link. Others stay links.
- No card when the message already has an attachment, or in the excluded places above, or inside a forwarded or clarified copy (they stay links).
- Story and point links (`/story/:id`, `/point/:id`) use the existing reader-judged cards.
- **Letters:** only `/letter/:id/overview` gets a card, because it holds a letter id and the existing card lookup takes that. `/letter/:id` holds a *delivery* id, which that lookup cannot resolve, so recipient links stay links. No new lookup is built.
- A pasted-link card has a quiet mode: nothing is drawn while loading, on error, or when unavailable, so none of the cards' existing skeleton or "Not available" states appear and no space is reserved. The link stays in every case.
- **Clarity Live links are clickable with no card** (decisions.md 2026-11-05, P1644: chat delivery of live invites is shelved). Event and profile links likewise stay links: no suitable card exists to reuse.
- Cards load only when near the viewport, because the list mounts every loaded message. A loaded result is cached per link for the open chat, so re-renders do not read again, and a late answer for a link since edited away is ignored. A reader pinned to the bottom stays there when a card appears.

### 3. Copy text

A "Copy text" item in the message menu, for any live message with words: its own words if it has any, otherwise a forward's copied words, or a voice note's transcript once ready. Absent otherwise. It copies those words exactly, confirms with a toast, and reports failure if the browser refuses. It includes the mirror chat. Private mirror rows shown inside a channel carry no menu and stay out of scope.

### 4. Reactions

Any member of a chat who can read a message can react to it, including the agent's, and in threads. Excluded: the mirror chat, and private mirror rows shown inside a channel, decided from the message's actual chat, on the server as well as the screen.

[FOUNDER DECISION: the emoji set. Default built: 👍 ❤️ 😂 😮 😢 🙏, one constant to change. No free emoji picker.]

- One person may hold several different reactions on a message (one row per message, person and emoji). Tapping a pill removes only that reaction.
- Under the message: a pill per emoji with its count, highlighted when the viewer's own. Tapping a pill toggles it. Hover or long press on a pill shows who reacted, and releasing that long press does not toggle. People with no loaded profile show as "Unknown member".
- Reached from a Reaction icon on the toolbar and an item in the long-press menu. Six buttons do not fit one row at 320px, so where the row does not fit (about 400px) Forward moves into the ⋯ menu.
- Live: other open sessions see changes without reloading, including removals.
- Writes follow the chat schema's rule of no direct client writes: separate add and remove database functions that take the person from the session, are safe to repeat (never a toggle), and refuse a deleted message, an excluded chat, a message the person cannot read, or someone who can no longer post. A failed tap rolls back and shows an error.
- Reading mirrors message access exactly, including the rule that a late joiner cannot see earlier messages.
- The client keeps each reaction's id with its message and emoji so a removal can be applied. A removal with an unknown id is ignored, because it cannot match anything drawn. Every reconnect re-reads the reactions from the server, one read at a time and only while the tab is visible.
- The table's primary key is a meaningless generated id with a separate uniqueness rule. Live delivery does not apply access rules to removals and sends the removed row's key to every subscriber (P1512 migration notes), so a natural key would leak who reacted to what.
- Deleting a message removes its reaction rows, even though the message row itself stays. A deleted message shows no reactions. Copies (forward, clarify) do not carry them. They do not change unread counts, reorder the chat list, or notify anyone. Existing reactions stay after a block; a person who can no longer post in a chat cannot add one.
- An erased account's reactions are removed with the account.
- Mirror agent context does not read reactions.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A reaction reveals membership or message existence to a non-member | MITIGATE | Read rule mirrors message access; tested with a non-member, a removed member and a late joiner |
| Live updates leak reactions across chats, or removals do not arrive | MITIGATE | Generated-id key; a test asserts a removal's live payload to a non-member holds only that id |
| Pasted-link cards cause many reads in long chats | MITIGATE | One card per message; only drawn rows load |
| Any person can generate reaction removals seen by all online clients, with no rate limit | ACCEPT | Delivery of an opaque id only and no reads; revisit with per-conversation delivery if traffic grows |
| A reaction removal in the moments right after subscribing can be missed live (seen in 2 of 6 test runs), leaving a stale pill | ACCEPT | Corrected by the re-read on the next reconnect or chat open; a person who sees it can reopen the chat |
| Typed `let.me` becomes a link | ACCEPT | Matches other messengers on typed text; spoken words are stricter |
| A prose-labelled link typed in markdown no longer links in chat | ACCEPT | It never linked here; this is the anti-disguise rule |
| Agent output using markdown links shows raw markdown with no link | ACCEPT | Readable and honest about the destination; revisit only if real output does this often |

**Non-Goals**
- Do NOT build notifications, push, email or mute. Filed to the task inbox for a later founder decision.
- Do NOT build read receipts or typing indicators. Rejected for this product, not deferred: they turn a reflection tool into surveillance.
- Do NOT build photo upload, pinned messages, report, message requests, or previews of outside websites.
- Do NOT add a Clarity Live invite card, or store cards as attachments at send time.

## Cost Budget

M = messages loaded in an open chat (a page holds at most a few hundred), V = chat opens per user per hour, R = reactions a user adds or removes per hour, C = own-app cards near the viewport per open.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | Open or reconnect: `ceil(M / 80)` reads. Cards: `C x 1` (30s cache). Taps: `1 RPC x R` | `V x (ceil(M / 80) + C) + R` | `10 tests x about 5 RPCs = about 50`, plus `5 users created and deleted x the existing helper's calls` |
| Realtime messages | One subscription; each reaction change reaches subscribers: `1 x subscribers` | `reaction changes per hour x online clients` | `about 4` |
| Egress (bytes) | `about 150 bytes per row x rows read` | same formula as requests x row size | negligible |
| Log lines | One per failed read, at most 3 retries per reconnect: `3 x reconnects` | `3 x reconnects per hour` | `0 expected` |
| Service unit x price | None: no paid API | none | none |

1. **Fits the plan limit today?** Fits, on the Supabase row (realtime messages, egress). Monthly: `reaction changes per hour x online clients x 730`, and `reads per hour x active users x 730`. A foreign removal causes no read, so a burst costs delivery only.
2. **Fits at 10x?** Fits on reads. Realtime grows with `changes x online clients`, because removals reach every subscriber; the Supabase row's cap is the first limit to watch.
3. **If either answer is no:** the Supabase Pro row in the registry, from $25/month. Before that, per-conversation delivery would remove the fan-out.

## Acceptance Criteria

- [x] A person sends `https://example.com/a`, `www.example.com` and `google.com`: all three are tappable, open in a new tab, and the row's toolbar does not open
- [x] A person sends full own-app addresses for `/live/CODE`, `/events/x` and `/p/x`: each opens in the same tab, Back returns to the chat, and none shows a card
- [x] The markdown form of "click here" pointing at `https://example.com` shows as typed, with no link, including in a message with chips
- [x] A full address with a lookalike host (Cyrillic `а`) or embedded credentials (a trusted-looking name, then an at sign, then the real host) is not a link, in chat and on a story, and `аpple.com` links no part of itself
- [x] Links work in a thread, a mirror agent message, a voice transcript, a transcription, a forwarded copy and a Clarify copy; the forwarded copy still reaches its original through its own control
- [x] A spoken `let.me think` is not a link; a spoken `https://example.com` is
- [x] A story, a point and a letter overview link each show the right card to a reader with access, and two such links in a message show one card; a recipient `/letter/:id` link shows only the link
- [x] A reader without access sees the plain link, with no skeleton, notice or reserved gap
- [x] Editing a message's link updates its link and card
- [x] Copy text shows an error if the browser refuses; otherwise it puts the exact words on the clipboard and confirms, for a typed message, a pure forward, a ready voice transcript and a mirror message
- [x] Reacting shows the pill and count in a second open session without a reload, and removing it clears there too; deleting the message removes its reactions there too; long press on a pill shows who reacted and does not toggle
- [x] A non-member cannot read or write a reaction (tested against the database, not only the screen), a removal's live payload to a non-member holds only a meaningless id, and a person cannot remove someone else's
- [x] A late joiner cannot read or add a reaction on an earlier message, and a person who can no longer post cannot add one (database test)
- [x] Repeating an add or a remove changes nothing further; one person can hold two emoji on a message; a session that was offline during a removal shows the right count after reconnecting; an erased account's reactions disappear
- [x] No reaction control appears in the mirror chat or on private rows; a deleted message shows no reactions; reacting changes no unread count, list order or notification
- [x] Message rows pass `.claude/rules/visual-qa.md` at 320px, 375px and desktop, with the toolbar on one row at 320px
- [x] Migration applied to the active TEST server; existing chat tests pass

**Evidence and limits, 2026-11-09:** 12,207 unit tests, 10 database tests on TEST, and 13 browser tests in `e2e/p1652-chat-links.spec.ts` pass. Lookalike rules on a story and links in a chip message are proved by unit tests, not in a browser. The toolbar and long press ran with a mouse and emulated touch, not on a real phone. A card for the author's own just-sent story link failed to draw in about 2 of 22 runs in the build's browser tests, cause unknown.

## Related

- P1512 (chat v1): excluded reactions; this reverses that part on the founder's decision of 2026-11-09. Its other exclusions stand.
- P1521 (mentions): open, and touches the same message words. Whichever ships second keeps both working.
- P1644 and decisions.md 2026-11-05: live invites in chat shelved.
- P1141: link labels must not lie.
- P540: one link system.
- P1201: outside-crawler link previews are a different feature, and are not touched.
