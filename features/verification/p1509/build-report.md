# P1509 build report — Clarity Chat v12 prototype

Route: `/tree/clarity-chat` (dev only). Code: `src/app/prototypes/clarity-chat-v12/`.
Mock personas in the strip: **Bob (member)**, **Dana (attendee)**. Mock states: `?state=empty`,
`?state=loading`, `?state=fail`. "Mock new message" delivers a message into your most recently
archived chat (or your first 1:1).

## Why v12 is self-contained, not a copy of v11

v11 lives only on the unshipped `feature/p1437-conversation-groups-v2` branch, and it imports v10,
v8 and about twenty sibling modules from that branch. Copying the folder would have tied P1509 to
roughly 98 unshipped commits. Instead, v12 is built on `main` and imports only shared UI that main
already has. It carries v11's visual language (Telegram frame, row and bubble shapes, prototype
strip). v11 is untouched. It sits on a branch this one never reads.

## Screen → existing code or data it would use

| v12 screen / element | Existing code or data | New for the backend spec |
|---|---|---|
| Logged-in landing = chat list | Signed-in routing in `src/App.tsx`, `bottom-nav.tsx` | The landing switch itself (deferred by the spec) |
| ☰ side menu: Feed, Letters, Partners, Groups | `/feed`, `/letters`, `/p/:slug/partners`, `/groups` (bottom-nav targets) | none |
| Side menu: Tools | `EventLinksMenu` / `EventLinksButton` (`layout/event-links-menu.tsx`) | Mounting it inside the drawer (it needs the nav context) |
| Side menu: today's event | `events` (start time), `event_rsvps` | Event → channel lookup |
| Invite partner | Existing new-partner flow on the Partners page | none |
| Profile + Message button | `profiles`, `profile-page-v2.tsx` | `can_message(a, b)` check |
| Group tabs | `organization`, `membership` (P1010) | none |
| Event belongs to a group | `events.org_id` (P1060) | none |
| Attendee of an event | `event_rsvps` (and `event_arrivals` if "attended" means arrived) | **Decision needed:** does RSVP count, or only arrival? |
| Event channel + posts | none (`clarity_chat_messages` is the dead table locked by P1048) | `chats` (dm \| channel, event_id), `messages` |
| Comment thread under a post | none | `messages.parent_id` (or a `comments` table) |
| Point / story picker | `points`, `stories` (author's own) | `messages.share_kind` + `share_id` |
| Transcript placeholder | none (P1500 lands here) | message kind `transcript` |
| 1:1 chat, Reply quote | none | `messages.reply_to_id` |
| Forward + "Forwarded from" | none | `messages.forwarded_from_profile_id` (original author, kept through re-forwards) |
| Unread counts | none | per-member `last_read_at` (or read cursor) |
| Archive / auto-unarchive | none | per-member `archived_at`, cleared on a new message |
| Search: people | `profiles` (name, slug as nickname) | Server-side search scoped to shared group or event; email exact-match only |
| Channel header member list | `membership` ∪ `event_rsvps` for that event | none (derived) |
| Failed send + Retry | none | Client-side outbox state only |

## Rules the prototype encodes (in `state.ts`, under test)

- **See a channel:** member of the event's group, or attendee of that one event.
- **See a 1:1:** one of its two people.
- **Message someone:** we share a group as members, or we share an event.
- **Search people:** only people I may message. Matches on name or nickname, and on email only as an
  exact full match. Message text is not searched.
- **Forward:** only into a chat I can see. The copy names the original author.

## Strip list (v11 → v12): confirmed absent

The bridged networks (WhatsApp, Telegram, LinkedIn), ad-hoc group chats, members-only and invite-only
channels, the agent (Mira, threads, Ask, @Mira), Clarify and cards, Ledger, Details, Edit, Delete,
emoji, the Alice lenses, the partner control, letter links, "+ New", and Explore, Settings and About.
`src/tests/p1509-v12-ui.test.tsx` "AC12" asserts that none of these words render.

## Open founder decisions surfaced by review

Each of these follows today's spec rule but showed up as a question during the click-through. The
backend spec has to settle them.

1. **Does a shared channel count as "sharing an event"?** As Dana, open tonight's channel and read
   Carol's comment. Carol is a group member who did not attend, so Dana cannot message her, and
   Carol's profile says "You share no group or event". Yet Dana sees Carol in the channel and its
   member list. [FOUNDER DECISION: either let channel co-membership allow messaging, or hide
   non-attendee members from an attendee's member list.]
2. **Can a transcript be forwarded?** A transcript can be forwarded out of the channel today,
   including to someone who was not at the event, and it quotes what people said there.
   [FOUNDER DECISION: allow it, or block forwarding of transcript posts.]
3. **Does "attended" mean RSVP or arrival?** See the attendee row in the table above.

## Review record

| Reviewer | Result |
|---|---|
| Visual QA (Sonnet subagent, screenshots only) | FAIL, 4 items. Three fixed (40px tap targets, the tab fade covering the badge, the selected-bubble ring). One not acted on: a one-word orphan at 320px. |
| Gemini (review model, served model verified) | 2 HIGH, 3 MEDIUM. All fixed. |
| Codex | 1 HIGH, 6 MEDIUM. All fixed. Focus trapping in the hand-rolled dialogs is reduced to Escape plus autofocus. |
| Opus (hostile) | 2 HIGH, 7 MEDIUM. All fixed, except two raised as founder decisions above. |

Fixed: forward and comment now check that the viewer can read the source (an IDOR shape the backend
must not copy), and send checks the target chat. Message can now start a new 1:1 (Fay), and a new 1:1
gets one id per pair. A send or forward reaches the other persona (unread, out of the archive) through
one delivery path. A failed send reaches nobody until Retry. Pressing a name or "Show all" inside a
bubble no longer opens its menu. Profile, Members and Invite keep Back on desktop. Invite now opens
`/agreements/new`. The Archived view closes when it is empty. A diagonal scroll no longer archives a
chat. Escape closes the dialogs. The share card is a link. A mock message arriving in the open chat
counts as read. Today's event in the menu is checked against what the viewer can see.

Known limitations (prototype only): the dialogs do not trap focus, and the share-card links point at
mock ids.

## Round 3: consistency pass (founder feedback)

The founder's asks, and what changed:
- Messages, the hover toolbar (Reply, Forward; a tap on a phone), threads and the composer are now v11's, ported into
  `kit.tsx` (v11 itself is still untouched). "Comment" is gone: a channel post has "N replies", and Reply opens its thread
  beside the channel.
- Desktop gets Telegram's dark folder rail (All chats, Unread, Partners, one per group, every one a line icon).
  ☰ opens a Telegram drawer over everything: my profile on top, then Home, Letters, Partners, Groups and Tools with the
  bottom nav's own labels and icons, then today's event. There is no ✕: the scrim or Escape closes it.
- Profiles are production's `CompactProfileCard`. Avatars are production's `GravatarAvatar` (the ring only for pledgers).
- Invite partner moved out of the menu into a 1:1's header ("Invite as partner", or "Partner" once they are one). Empty
  states still offer it. There is a new Partners folder.

Reviews: Gemini (2 HIGH, 2 MEDIUM, then the fix diff), Opus design critique (7 HIGH, 8 MEDIUM), Codex on the final content
(3 rounds). Fixed: thread replies now reach unread and the archive; a mouse click no longer selects a row; rail icons;
the drawer focus ring; the selected-row channel mark; failed sends are shown and retryable only by their author, can't be
forwarded by anyone else and never reorder another person's list; an IME Enter never sends; forward fails under
`?state=fail`; there is no thread under an unsent post; an unsent message offers Retry only; a thread scrolls to a new reply.
Rejected with reasons (in the session): the pledge ring and the production card's empty pledge band (production behaviour),
the phone toolbar shown under the tapped row (v11's deliberate choice), Invite in the header (founder's call), the paperclip
in channels only (only channels have the picker).

Open for the founder:
4. **Thread replies and list order.** A reply in a thread badges the channel but does not move it up or change its
   preview (Telegram's channel comments behave this way). Codex flagged it twice. [FOUNDER DECISION]
5. **The drawer repeats the bottom nav** (Home, Letters, Partners), and "Partners" is both a folder and a page.
   [FOUNDER DECISION: is the drawer the navigation on chat routes, and is the folder name right?]
6. **Partners in the drawer opens /me**, which lands on the profile and not on `/p/<slug>/partners`. The mock has no real slug.
   It needs the signed-in slug in production.

Known limitations (prototype only): the dialogs do not trap focus; there is no mic in the composer (v11's dictation hook is
not on main).
