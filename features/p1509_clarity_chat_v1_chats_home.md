---
status: in-progress
type: story
rank: 42
workstream: clarity-chat
created_date: '2026-10-16'
tags: [clarity-chat, messaging, navigation, events]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev, dev.2]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1509: Clarity Chat v12 prototype — chats as the home, groups with event channels, 1:1 messages

## Problem

**Situation:** P1503 built a v11 prototype of the whole Clarity Chat vision (mock data,
`src/app/prototypes/conversation-groups/v11/`). It carries many almost-done extras (emoji,
@Mira, Edit/Delete/Details, a + "New chat / New partner" button, threads with an agent) and
none of it runs on real data. There is no live chat backend: the old chat table was locked
down as dead in P1048.

**Complication:** The next event needs a real place where attendees talk in one channel, so
that the event loop (P1500: transcript in the channel, the agent drafts points, the Clarity
Canvas P1508 updates) has somewhere to run. Building on WhatsApp first depends on people
changing a daily habit unprompted; an event puts everyone in one channel on one date.

**Question:** What is the smallest real messenger that every later step (agent chat, event
loop, Clarify) can sit on?

> Founder framing, verbatim (2026-10-16): *"I guess we need to first launch the first
> interaction where there are like just chats and channels and then make sure that we can run
> the thing that updates the clarity canvas."*

> *"if you're in the same group as member or in the same event otherwise you cannot message them"*

## Appetite

Blast radius: medium for this prototype (mock data only; it sets the shape of the logged-in home and
navigation, and the backend spec after it carries the private-message risk). Reversibility: high (a new prototype route).
Decision density: a few (listed as FOUNDER DECISION below); most of the structure was decided
in conversation on 2026-10-16.

## Invariants

- Everything that works today keeps working: partners, the invite / new-partner flow,
  letters, profiles, events, groups. v12 changes the logged-in landing; it removes no page.

## Solution

**This spec is the prototype only (front end, mock data).** Copy v11 to v12 and strip out
everything not in the scope below. v11 stays untouched as the vision sketch. The founder clicks
through v12 and approves it. **The backend is a separate spec, filed after that approval**, because
only the approved screens say exactly what the backend must support.

**Where it sits:** the public home page stays as it is. After logging in, a person lands in Chats;
every other page (feed, letters, partners, events) is reached through the ☰ menu. Today the
logged-in app has no single place a person returns to, and Chats becomes that place.

**Scope:**

| Area | What it is |
|---|---|
| Layout | Mobile: the chat list fills the screen; opening a chat replaces it (back returns). Desktop: two panes, chat list left, open chat right, like Telegram Desktop. |
| Top bar | ☰ on the left opens the side menu. A search finds chats and people. |
| Folder tabs | Telegram-style tabs above one chat list: **All** (every 1:1 and every channel), **Unread**, and one tab per group. 1:1 chats are always in All. |
| Side menu | Feed, Letters, Partners, Groups, Tools, today's event, Invite partner. Profile sits at the bottom. |
| Groups and events | A group is a workspace. An event belongs to one group and has one channel in it. A group member sees all its channels. An event attendee who is not a member sees only the channel of the event they attended. Only the founder/admin creates channels. |
| Channel | Any member or attendee can post. Each post can have a comment thread (Telegram channel comments, people only, no agent). Input field, plus a picker to post one of my existing points or stories. |
| Transcript placeholder | The mock event channel holds one post "Transcript posted" (a collapsed long text). Nothing acts on it yet; it marks where P1500 lands. |
| 1:1 chats | Between two people who may message each other (rule below). Reply in a 1:1 quotes the message. |
| Message menu | One menu, the same on hover and on tap: **Reply** (quote in a 1:1, opens the comment thread in a channel), **Forward**. |
| Forward | Opens a picker of chats I belong to. The forwarded message shows "Forwarded from <name>", and tapping the name opens that profile. |
| Unread | Unread counts on chats and tabs. |
| Archive | Swipe (mobile) or right-click (desktop) a chat to archive it. An "Archived chats" row at the top of the list opens them. A new message un-archives the chat. |
| Search | Matches chat names and people by name or nickname, and by email only on an exact full match. People results include only those I share a group or event with. Message text is not searched. |
| Messaging rule | I can message someone only if we share a group (as members) or an event. |
| Profile | Shows a **Message** button when the rule allows, and none otherwise. Tapping a person anywhere opens their profile. |
| Channel header | Channel name and member count; tapping it shows the member list. |
| Invite partner | For someone outside my groups and events: the existing new-partner flow, unchanged, reached from the side menu and from an empty search. |
| Mock personas | The prototype strip switches the viewer: **Bob** (group member and attendee), **Dana** (attended the event, not a group member). The mock data includes one stranger (shares nothing with Bob), reachable as the "Forwarded from" author in one forwarded message. |
| Mock states | `?state=empty`, `?state=loading` and `?state=fail` show the empty list, the loading skeleton and a failed send with Retry. |

**Strip list (v11 → v12):**

| v11 feature | v12 |
|---|---|
| Chat list, 1:1 chats, event channel, unread, archive filter | Keep (reshaped as above) |
| Bridged WhatsApp, Telegram and LinkedIn chats, network filters, source marks | Cut |
| Ad-hoc group chats ("Trip planning", kind `groupchat`) | Cut |
| Members-only and invite-only channels | Cut; only event channels |
| Agent chat with Mira, agent threads, "Ask" panels, @Mira | Cut |
| Clarify, cards (points with positions, guesses, sealed stories, ratings) | Cut; the picker posts an existing point or story as a plain link card |
| Ledger and Details panels, Edit, Delete, emoji reactions | Cut |
| The "Alice in Clarity Chat" and "Alice's WhatsApp" lenses | Cut; replaced by the persona switch above |
| Partner control inside a chat, letter links | Cut |
| + "New chat / New partner" button | Cut; Invite partner lives in the side menu |
| Drawer pages Explore, Settings, About | Cut; the side menu lists the real app pages |

[FOUNDER DECISION: the drawer opens from ☰ at the top left, with profile at the bottom. This
replaces P1503's "one drawer from the avatar" (decisions.md 2026-10-16). Confirm.]

[FOUNDER DECISION: exact labels: "Chats", "Inbox", "Invite partner", "Message".]

[FOUNDER DECISION: is a 1:1 chat still allowed after the shared group or event ends? Recommended: yes.]

[FOUNDER DECISION: the date of the next event. It sets whether the backend and P1500 must land before it.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The prototype promises something the backend cannot do safely | MITIGATE | Each v12 screen names the existing code or data it would use; anything new is listed for the backend spec |
| Search becomes a way to harvest emails | MITIGATE | The prototype shows search returning only people you share a group or event with; the backend spec enforces it in the database |
| Leftover v11 extras confuse the approval | MITIGATE | A strip list in the build report names every v11 feature removed |
| Changing the logged-in home disorients existing users | DEFER | Decided when the backend spec ships |

**Non-Goals**
- Do NOT build any backend, table, migration or real data. Mock data only.
- Do NOT build WhatsApp, Telegram or LinkedIn import (P1457), spaces, emoji reactions, @Mira
  or any agent in messages, Edit, Delete, Details, or Clarify.
- Do NOT build connection levels (P1460). The shared-group-or-event rule replaces it for now.
- Do NOT change the public home page or any existing flow.
- Do NOT modify v11.

## Acceptance Criteria

- [x] On mobile width v12 opens on the chat list with ☰, search and the folder tabs; opening a chat replaces the list and back returns. On desktop the list and the open chat sit side by side
- [x] The side menu lists Feed, Letters, Partners, Groups, Tools, today's event and Invite partner, with profile at the bottom
- [x] As Bob, the group's tab shows all its channels; as Dana, it shows only the event channel
- [x] In the event channel, both Bob and Dana can post, comment under a post, forward a post, and post one of their own points or stories from the picker
- [x] The event channel shows the "Transcript posted" placeholder
- [x] Tapping or hovering a message shows the same menu, Reply and Forward; Reply quotes in a 1:1 and opens comments in a channel
- [x] A forwarded message shows "Forwarded from <name>"; tapping the stranger's name opens a profile with no Message button
- [x] Searching a shared person's name finds them; searching the stranger's name finds no one; their exact email finds no one either
- [x] A shared person's profile shows Message, and tapping it opens the 1:1 chat
- [x] Unread counts show on chats and tabs; archiving a chat moves it under "Archived chats", and a new mock message brings it back
- [x] `?state=empty`, `?state=loading` and `?state=fail` each show their state
- [x] Nothing in the strip list's "Cut" rows appears anywhere in v12
- [x] The build report includes a table mapping each v12 screen to the existing code or data it would use, and lists what is new for the backend spec
- [ ] The founder has clicked through v12 and approved it

## UX Notes

- **Empty states:** no chats yet (show "Invite partner"); a group with no event channel yet;
  a search that finds no shared people (show "Invite partner").
- **Error:** a message that fails to send stays visible with a retry.
- **Loading:** the chat list and channel show a skeleton, never a blank page.

## Follow-ups (in order, separate specs)

0. **Backend for v12**, filed after approval: tables, realtime delivery, unread state. It carries
   these invariants: a person reads or receives a message only as a member of that chat or channel,
   enforced in the database on REST and Realtime with a two-user canary (decisions.md 2026-08-20
   P1114; 2026-08-13 P1048: every delivery surface enumerated); every new policy names its role,
   none defaults to PUBLIC (P1138).
1. **Agent chat:** a plain chat with an agent that knows the public ClarityPledge repo, like Mira. New spec.
2. **Event loop: P1500.** The transcript goes into the event channel, the agent drafts points,
   people confirm their own, and the Clarity Canvas (P1508) updates.
3. **Clarify → suggest a point**, then stories (by hand first, suggested from context later).

## Related

- P1503: v11 whole-vision prototype (starting point for v12, left untouched)
- P1462: left menu (superseded: its idea of the full menu in one place is folded in here, as a ☰ drawer)
- P1461: channel members and settings (v12 takes only the channel header and member list above; the rest stays in P1461)
- P1460: connection levels (parked)
- P1500, P1508: event loop and Clarity Canvas (next after agent chat)
- P1048: the dead chat table; P1114: Realtime + RLS measurement; P1138: policies without a role

## v13 (founder review of v12, 2026-10-17)

Route: `/tree/clarity-chat-v13` (v12 stays at `/tree/clarity-chat` for comparison). Each line is a decision taken by the
agent on the founder's open question; every one is **revisitable**.

1. **Me, bottom-left (ChatGPT).** My avatar + name sits at the foot of the folder rail (desktop) and the drawer; it opens
   a small menu: My profile, Settings (placeholder), Tools. Tools leaves the page list and sits at the bottom of the drawer.
2. **Composer:** 📎 on the LEFT of the field, 🎤 on the right when the field is empty (Send replaces it once there is text,
   WhatsApp/Telegram). The mic records a mock voice message (timer, stop = post a voice row). 📎 works in every chat.
3. **Hover toolbar:** Reply, Thread, Forward. Reply always quotes in place and stays in the chat (also in channels);
   Thread opens the side thread. Replies-count link still opens the thread.
4. **Forward:** pick a chat → confirm sheet with a preview of the message and an optional note → Send jumps to the target chat.
5. **One "Groups" folder** replaces one folder per group. Inside, each group is a section; every group has `# general`
   (members only) plus one closed channel per event (members + that event's attendees). No public channels yet.
6. **Channel header:** member count; ⋯ menu = Members, Group page (opens `/groups`), Leave (mock). Clicking the title
   opens a Telegram-style group info sheet (name, members count, buttons Members / Group page / Leave).
7. **Partners:** the duplicate is removed from the drawer (the rail folder stays and becomes Contacts later). A partner
   1:1 header shows "Agreement" which opens the agreement page. With no partners the Partners folder shows an invite empty state.
8. **New person from search:** opens an empty 1:1 with "No messages yet — say hello to <name>, you both attend <event>".
9. **@handles dropped:** production profiles have a `slug`, no nickname (docs/technical/database.md). Rows show the role.
10. **Mock new message** removed from the strip (not a product feature; Reset + viewer stay).
11. **Event channel fills from Transcribe:** the event channel carries a "Transcribing · live" banner; each speaker's
    lines post as their own messages (marked 🎙 transcribed); a table conversation is a thread under a "Table 2 · round 1" post.
12. **Members → real profile:** members list rows open production's CompactProfileCard (unchanged from v12).
13. **📎 opens a dialog** with a search field (text and #tags, multi-tag), filter All/Points/Stories, and previews drawn in
    production's own frames (`PointCardShell`, `QuotedStoryShell`). A posted item renders inside the same frame in the chat.
14. **Navigation:** drawer pages (Home, Letters, Groups) open in the app; each app page's Chats entry returns here
    (production bottom nav). Prototype opens them in a new tab so the chat state survives.

**Spec review (Gemini 3.8 flash, 2026-10-17)** changed: Thread is offered only in channels (a 1:1 has quote-reply only, so the two
never compete); the mic has Cancel and drops a recording under 1 s. Kept against the review, with reason: forward jumps
to the target (founder asked for it); ⋯ and the title both open group actions (Telegram has both); pages open in a new tab
(prototype harness only, production navigates in-frame). Deferred: "new messages ↓" pill while a live transcript appends;
a deleted point/story placeholder card.

Tests: `src/tests/p1509-v13-*.test.ts(x)`.

---

## v16 iteration — real data, and the founder's v15 review (added 2026-10-17)

**Why:** v15 rebuilt Home, the Share picker, the people list and "New partner" around mock data,
so each felt invented. Founder framing, verbatim: *"maybe if we wire directly the actual points and
stories from the database, that would be better ... it's not a prototype anymore"* and
*"if we are rebuilding then functionality has to stay ... or at least I need to know about that."*
v16 stops mocking what the database already holds. Built on the same branch and route family
(`/tree/clarity-chat-v16`); v15 stays as it is.

**Data source (founder decision 2026-10-17: "local database").** Localhost reads the Supabase
**test project** (`.env.local`), never prod. v16 reads, through the app's existing data hooks and
RPCs, everything that already has tables: profiles, points with positions, stories, letters, groups,
events + RSVPs, partners and partner invites, `is_admin`. A small set of named test personas is seeded
in the test project so screens have content; the seed is a script, re-runnable, and removes only
rows it created. **Chat messages, channels, threads, unread, archive and the mirror stay mock**
(no tables exist; the backend is follow-up 0) and every mock surface is labelled as such in the build
report.

**Supersedes (v16 only):** the Non-Goal "Do NOT build any backend, table, migration or real data. Mock
data only" becomes *no new tables/migrations; read existing tables*; "Clarify" is removed from the Non-Goal
and strip-list "Cut" rows (v15 already shipped it on the mirror); "Do NOT change any existing flow" stands —
real flows (RSVP, invite) are **reused unchanged**, never modified.

**Where the data comes from:** existing services in `src/app/data/` — points `points-service*`, stories
`stories-service*`, letters `letters-service.ts`, groups `organizations-service*`, events + RSVP
`events-service*` (`rsvpToEvent`), partners `agreements-service-real.ts` (+ suggested terms in
`create-agreement-page.tsx`), profiles `api.ts`. Do not build a new hook layer.

**Breakpoints:** desktop (≥1024px) = the collapsible sidebar below, no ☰; mobile = bottom bar + profile sheet.

**States for every real-data surface:** skeleton while loading; inline error with Retry if the query fails;
an explicit empty state (0 points, 0 letters, 0 groups) — never a blank panel.

**Step 0:** rebase the branch onto main (40 commits behind on 2026-10-17, incl. P1506 /hospitals). v15's
own tests may be adapted only where the rebase breaks them, each change named in the build report.

### Decisions (founder, 2026-10-17)

| Area | Decision |
|---|---|
| First tab | **Chats first.** Mobile bottom bar: Chats · Home · Groups · Letters · Profile. "Home" keeps its name for the feed. |
| Desktop sidebar | Modelled on Claude / ChatGPT (founder screenshots): small Clarity Pledge logo + collapse button top-left (logo click = Home, as today); Search; **Invite partner**; places Chats · Home · Groups · Letters · Events. Bottom-left row: profile picture (opens the profile menu) and, on the same line to its right, a small **Tools** icon with its label, always visible, quiet styling. No "More" item: Use cases and Learn live in the profile menu next to Settings. |
| Mobile profile menu | A bottom sheet that closes on swipe-down or outside tap, not a full page. |
| Partner wording | One verb everywhere: **Invite partner** (sidebar, 1:1 chat header, profile). States: Invite partner → Invite sent → Partner. Accepts a name (picks a person in the app and uses their profile email) or an email, reusing the existing new-partner flow and its suggested terms. An invited email with no account shows "Invite sent" and no chat until accepted. "+ New" and "New chat" are removed: search already finds anyone you may message. |
| Transcribe | A **Transcribe** button at the top right of **every** chat header; one press starts capture immediately (like play / joining a voice channel), and the existing compact live bar shows it running with Stop. Each capture mints a new room through the existing create path (rooms are per code and end; `transcribe_rooms` has no chat link), and the link back to the chat lives only in the client, since chats are mock. If that cannot be wired without a schema change, the button says "Coming soon" everywhere rather than faking it. |
| Clarity Live | Not a header button. "Invite to Clarity Live" in the ⋯ menu of a **1:1** chat only. |
| General channel | Keeps the name "General"; shows a lock and the description "Members only". Event channels = that event's RSVPs. |
| Thread forward | Forwarding a message that has a thread arrives as one card "Thread · N replies" that opens the full thread; same when sent to the mirror. |
| Mirror | Clarify appears on every message, including in the mirror chat. No "Back to <chat>" bar: the forwarded card links to its source. ⋯ menu on the mirror chat with **Rename**. Role always shown: "<Name> · <First>'s mirror" (decisions.md 2026-10-12 ruling). |

### Fixes (agreed, no decision needed)

- Share picker / story card inside chat: no "+ Add point", no ⋯; keep expand and Details. **Share** is
  the one solid primary button, on hover (desktop) and always visible (touch).
- Letters cards: the card body is not clickable; only its buttons act (Edit, Prepare, Results…).
  Actions on hover on desktop, always visible on touch. Published letters keep expand.
- "Browse groups" is a quiet outline button below your groups, not a list row.
- No "Group info" entry in the chat list; it lives in the channel ⋯ → Group page.
- Admin entry visible only when `is_admin`; a test proves a non-admin never sees it.
- Message menu gains **Mark as unread** (right-click desktop, long-press touch).
- Desktop Home restores the production widgets (Events, Groups, Search).
- Groups sorted by latest activity; "Your groups" first, then Browse.
- Design-system pass: buttons, colours and type checked against the design system.

### Parity and navigation audit (founder: "at least I need to know")

Every page reachable from v16 **and** every route in `src/App.tsx` outside `/tree/*` (closed list,
derived at build time, not typed by hand) gets one row in the build report: reached from where · back works · forward
works · bottom bar shown or deliberately hidden · anything lost vs production. Anything lost is
either restored or listed for the founder — never dropped silently. Known losses to restore first:
suggested partner terms.

### v16 Invariants (additive)

- Prod is never read or written by the prototype. Test-project writes come only from the seed script
  and from user actions on real flows (RSVP, invite), all against test users.
- No new tables, columns or migrations in v16.
- Mirror shows its role whenever its name shows.
- **No real email leaves the test project.** `send-agreement-emails` sends through Mailgun and its
  `APP_URL` falls back to the prod site, so the client refuses any invite recipient outside the seeded
  persona domain, and the test project's function secrets are checked before the first invite.
- The seed script aborts unless the Supabase URL is the test project, tags every row it creates, and its
  reset deletes only tagged rows (dependent rows such as RSVPs first).

### v16 Risks

| Risk | Label | Note |
|---|---|---|
| Test project is shared with e2e suites; seeded personas collide | MITIGATE | Distinct persona prefix; seed removes only its own rows |
| Real flows (invite) send real email from test | MITIGATE | Invite only to the seeded persona addresses; check the mail path before the first run |
| Mixing mock chat with real people confuses review | MITIGATE | Build report labels each surface real / mock |
| Transcribe-from-any-chat needs room ownership rules not yet designed | DEFER | "Coming soon" where not wireable; backend spec decides |

### v16 Acceptance Criteria

- [ ] Branch rebased onto main; full test suite and pre-commit checks pass
- [ ] Home, Share picker, profiles, letters, groups, events and partners each show a named seeded record, and the build report pairs each with the test-project query that returns it
- [ ] Each real-data surface shows its skeleton, error-with-Retry and empty state (screenshots in the build report)
- [ ] An invite to an address outside the seeded domain is refused in the UI; no email is sent
- [ ] Design-system check: every button and colour in v16 maps to a design-system token or variant; exceptions listed
- [ ] Mobile opens on Chats; bottom bar order Chats · Home · Groups · Letters · Profile
- [ ] Desktop sidebar matches the decision row above; collapse works; logo goes Home
- [ ] Profile menu on mobile is a sheet that closes on swipe-down and outside tap
- [ ] "Invite partner" is the only partner verb anywhere; works with a name and with an email; suggested terms present
- [ ] No "+ New" and no "New chat" anywhere
- [ ] Transcribe button top-right in every chat header starts capture in one press, live bar shows it; Live invite only in 1:1 ⋯ menu
- [ ] Tools icon+label sits right of the profile picture on desktop, always visible; no "More"; Use cases and Learn are in the profile menu
- [ ] General shows lock + "Members only"
- [ ] Thread forward shows "Thread · N replies" and opens the thread
- [ ] Mirror: Clarify on all messages; Rename works; role always shown; no back bar
- [ ] Share picker card has no Add point / ⋯; Share is the single primary button
- [ ] Letters cards act only through their buttons
- [ ] Non-admin persona never sees Admin (test)
- [ ] Mark as unread works on desktop and touch
- [ ] Parity/navigation table in the build report covers every page named above, with no unexplained loss
- [ ] Separate visual-QA subagent passes at desktop, 375 and 320; each Gemini UX finding marked fixed or listed with a reason
- [ ] The founder has clicked through v16 and approved it
