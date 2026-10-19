---
status: in-progress
type: story
rank: 43
workstream: clarity-chat
created_date: '2026-10-19'
tags: [clarity-chat, navigation, realtime, rls]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, architect, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1512: Clarity Chat v1, real and released: chats become Home, live pages reused, real messages

## Problem

**Situation:** P1509 v16 (branch `feature/p1509-clarity-chat-v12`, unshipped, route `/tree/clarity-chat-v16`,
dev-only) shows the chat home on real test-project data. Its chat itself is mock: no chat tables exist, so
every message, 1:1, channel post, thread, unread count and mirror reply is scripted. Around the chat it
hand-rebuilt pages the live app already has (Letters, Groups, group page, Join, Event, Events, Partners,
Invite partner, a profile card, Settings, Tools: about 1,000 lines in `ClarityChatV16.tsx`) and fed them real
data. Every function the copies did not reproduce went missing: new letter, Resend and Revoke on a partner
invite, host tools, the full profile (P1509 `build-report-v16.md` §E3 lists 11 losses).

**Complication:** The founder had asked for reuse twice before: P1495 (*"we don't want new build, we want to
reuse"*) and the v16 framing (*"if we are rebuilding then functionality has to stay ... or at least I need to
know about that"*). The rebuild still happened and was found only on click-through. Founder, 2026-10-19:

> "why are we building, rebuilding things that are already working? ... just replace with normal version that works"
> "the coming soon things just delete them!? why we need them?"
> "make the full version that we discussed, like working, remove the unworking stuff"

**Question:** Turn the prototype into the released product: the chat home on real tables with
database-enforced access, every other screen the live page itself, nothing fake and nothing "Coming soon".

## Appetite

Blast radius: high. The signed-in home changes for every user, and private messages are the first
person-to-person private data the product stores. Reversibility: medium (new tables plus a route change;
the old redirect can be restored, a leaked message cannot be recalled). Decision density: decided on
2026-10-19 except the calls marked `[FOUNDER DECISION]`, each with a recommended default.

## Founder decisions already made (2026-10-19)

1. Delete every prototype screen that copies a live page; the live page shows **unchanged** in the new shell.
   Ideas from the copies become separate proposals for the live pages, one at a time.
2. Delete every "Coming soon" item: Transcribe in chat headers, Invite to Clarity Live, topic vote, New Draft
   placeholder, voice-note placeholder.
3. Navigation: **Home** = the chat list; today's Home is renamed **Feed**. Menu: Home, Feed, Groups, Letters,
   Events, plus My Profile on desktop (on phone behind the avatar).
4. Remove the sidebar Search (the chat-list search covers it). Invite partner becomes a **+** next to the
   chat-list search and opens the live invite flow unchanged.
5. Collapsed sidebar works like ChatGPT: only the logo shows; hovering the logo turns it into the expand icon.
6. ~~Groups opens on Browse when the user has no groups~~ — dropped 2026-10-19: a user's groups already show as
   General channels in the chat list, so the live Groups page stays the directory, unchanged.
7. Starting a 1:1 needs a shared connection (below); a conversation that exists stays open after that ends.
8. No notifications or email about messages in v1; unread counts in the app only.
9. ~~The mirror is answered by Gemini 3.8~~ — revised 2026-10-19: **no AI in v1.** Clarify forwards the message (with
   its thread) into the owner's mirror chat; helping turn it into a point or story is the next spec.
10. Rollout: everyone at once.

## Open decisions (recommended default in bold; the build uses the default unless the founder changes it)

- [FOUNDER DECISION: D1 — what counts as a shared connection for starting a 1:1. **Same group, same event
  RSVP, or an accepted Clarity Partner.** Partners are added because otherwise a user cannot message their own
  partner (review finding).]
- [FOUNDER DECISION: D2 — protection from unwanted 1:1s. Joining a public group or RSVPing is self-service,
  so "shared group" does not stop a stranger. **Block ships in v1**: a blocked person cannot send, cannot
  start a new 1:1, and does not see the blocker in search; plus a per-user limit on new 1:1s per day.
  Report and message requests stay out.]
- [FOUNDER DECISION: D3 — channel history for new members. **A member sees General messages from the
  moment they joined**, not earlier history; event channels likewise from their RSVP.]
- D4 (decided 2026-10-19) — event channel window: **reuse the app's existing event grace window** (an event counts
  as ongoing until 12 hours after it starts, `EVENT_GRACE_HOURS`). RSVPs made later do not get the channel. The RSVP
  insert itself has no date check in the database today, so the channel rule enforces the window on its own.
- [FOUNDER DECISION: D5 — forwarding. **A forward is a copy (snapshot) of text the forwarder can read,
  shown as "Forwarded from <author>"**; it does not reveal anything else from the source chat, and the
  link back only works for people who can read the source.]
- D6 (decided 2026-10-19) — no change to the live Groups page (decision 6 dropped).
- [FOUNDER DECISION: D7 — events already have an external group-chat link for RSVPs. **Keep it unchanged**;
  the event channel is added alongside.]
- D8 (decided 2026-10-19) — Clarify is a forward to the owner's mirror chat (message plus its thread); the mirror
  does not reply in v1.
- [FOUNDER DECISION: D9 — home URL. **`/home` for signed-in users**; signed-out visitors keep `/` → `/feed`
  (P1392). `/chat` is taken (redirects to `/create`, used by the auth callback).]
- [FOUNDER DECISION: D10 — read state. **Own devices only**; the other person never sees "read".]
- [FOUNDER DECISION: D11 — Home for a user with no chats. **Shows their mirror and their groups' General
  channels (backfilled), plus a one-line hint "Message someone from your groups or events"** — no placeholder.]

## Solution

### A. The shell: a signed-in mode of the existing layout, live pages inside

Every product route is wrapped in `ClarityLandingLayout` (top nav, bottom nav, active-session banner,
room-capture bar). The shell is a **signed-in mode of that layout**, not a second layout around it, so a
page never shows two navigations. Signed-out chrome, and the compact / chrome-free / `/live` / `/transcribe`
routes, keep today's chrome.

Every function today's navigation carries moves into the shell, none is dropped:

| Today (top nav / bottom nav) | In the shell |
|---|---|
| Home → `/feed` | Feed |
| Today's event (when there is one) | Kept, above the menu (desktop) and in the bottom bar (phone) |
| Groups, Letters (+ unread badge) | Menu entries with their badges |
| Partners (+ pending-invite badge) | Menu entry with badge |
| Links / Tools menu (Transcribe and others) | Tools entry opening the same menu |
| Avatar menu, My Profile | Avatar (phone sheet); My Profile also in the desktop menu |
| Events | `/events/list` (the bare `/events` redirects to a group) |

Menu entries open the live routes (`/feed`, `/groups`, `/letters`, `/events/list`, `/p/:id`,
`/p/:id/partners`, `/settings`). Profile and member rows open the live profile; the v16 profile card goes.
The page content and behaviour of every live page stay unchanged.

### B. Remove the prototype

Built on the P1509 branch (or after P1509 is closed): delete the v12 to v16 prototype code and routes, its
tests, the persona sign-in plugin in `vite.config.ts`, `scripts/p1509-*`, the mock data and
`?real=` / `?state=` overrides. The seeded test personas may be kept as the canary's accounts; otherwise the
seed reset removes them and the password file outside the repo is deleted.

### C. Real chat

Keeps from the prototype: chat list with tabs (All, Unread, Partners, Channels), 1:1s, group General
channels, event channels, threads (channels only; 1:1s have quote-reply), forward (D5), attach a point or
story, edit and delete own messages, mark as unread, archive, search over own chats and over people with a
shared connection (D1).

Tables for conversations, members and messages and a per-member read marker; shape is `/architect`'s call.

**Access lifecycle** (enforced in the database on REST and Realtime):

| Event | Effect |
|---|---|
| Join group | General channel from join time (D3) |
| Leave group | General access ends; existing 1:1s stay |
| RSVP (up to 12 h after the event starts) | Event channel from RSVP time (D3, D4) |
| Cancel RSVP | Event channel access ends |
| Host | Has the event channel (one host per event; group organizers who are not the host do not) |
| Event deleted | Its channel and messages are deleted with it (must not add a second event-delete blocker like INBOX-189) |
| Block (D2) | Blocked person cannot send to or start a 1:1 with the blocker, nor find them |
| Message deleted | Body removed on the server (not just flagged); forwards keep their copy (D5) |
| Account erased | Their messages show as "Deleted user" with the body removed; 1:1s stay for the other side; their mirror and its copies are erased; chat tables added to `erase_my_account` and its test |
| Existing groups and events at release | General and event channels and one mirror per user backfilled by migration |

Attachments store only the point or story id and render through the reader's own access; an item the reader
cannot see shows "Not available to you". Read state goes to the owner's own devices only (D10).

### D. Mirror chat (no AI in v1)

- One mirror chat per user, owner-only; Rename kept; its role always shows ("<Name> · <First>'s mirror").
- Clarify on any message forwards it, with its thread, into the owner's mirror chat as a copy (same rules as
  forward, D5), linking back to the source for people who can read it. Nothing is posted into the source chat.
- The mirror does not answer. Turning a clarified message into a point or story (using the understanding
  chain's detect logic) is the next spec, filed after this one ships.

## Invariants

- **A screen with a live equivalent mounts the live screen.** A copy needs the founder's explicit OK for that
  one page, written in the spec. Reviewers check every screen against "does a live version exist?" (P1495,
  P1509 v16).
- **No chat content is readable by a non-member through any path**: REST, RPC, Realtime `postgres_changes`,
  broadcast, views, search, forward, attach or Clarify. Every server path that takes a message,
  conversation or thread id checks membership as the caller (a service-role function does its own check).
- **No one can write what they do not own**: insert themselves into a conversation, post as someone else,
  edit or delete another's message, or point a reply or thread at a message in another conversation.
- Chat uses no public broadcast channel; any Realtime topic is private with policies. Deletes are modelled so
  Realtime cannot deliver a removed body to anyone.
- No "Coming soon", placeholder or mock surface ships. A control that does nothing is deleted.
- Existing live flows (RSVP, partner invite, letters, profile) are reused unchanged.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Realtime leaks a message | MITIGATE | Invariants plus the canary below |
| Realtime on the test project has an open problem (`.private/docs/decisions.md` 2026-10-16) | MITIGATE | Step 0: confirm Realtime works on test; fix first if not |
| Unwanted contact via self-service group join or RSVP | MITIGATE | D2 Block + daily limit, D3, D4 |
| Signed-in users land on Feed before session restores | MITIGATE | Home redirect waits for the session; tested |
| Users lose the old home without warning | ACCEPT | Founder chose everyone-at-once; Feed is one tap away |
| Transcribe leaves chat headers | ACCEPT | Stays in Tools |
| Event delete fails with a linked transcription room (INBOX-189) | ACCEPT | Separate bug |

**Non-Goals**
- Do NOT change any live page's content or behaviour. Moving its navigation into the shell is not a content change.
- Do NOT add AI replies to the mirror or point/story suggestions (next spec).
- Do NOT build Transcribe from chat, Clarity Live invites, topic vote, voice notes, notifications, email,
  report, message requests, typing indicators or read receipts to others.
- Do NOT build the letter loop, mental models or agents on other people (P1431, P1458).
- Do NOT import WhatsApp/Telegram/LinkedIn chats (P1457), emoji reactions, channel settings (P1461).

## Acceptance Criteria

- [x] Signed in, opening the app (and the installed app) lands on Home, the chat list; Feed shows today's feed unchanged — *Evidence:* `/` waits for the session then sends signed-in users to `/home` (`src/app/routes/home-redirect.tsx`, `home-readiness.ts`; p1512-shell tests; e2e p491 UAT-7); sign-in default is `/home`; PWA start_url is `/`; `/feed` page unchanged.
- [x] Each of the 11 losses in P1509 `build-report-v16.md` §E3 is restored by the live page, or listed as a founder-approved loss — *Evidence:* All prototype copies deleted; every menu entry and profile/member link opens the live route, so the live page (with its full function) is what shows.
- [x] Per route: exactly one navigation; Today's event, Tools, Partners and the letter/partner badges are present as before — *Evidence:* p1512-shell tests; e2e p1351, p888, p885, p1323, p1421 updated with a pre-P1512 control. Collapsed desktop sidebar shows only the logo by founder decision 5, so badges are hidden while collapsed (flagged to founder).
- [x] No "Coming soon", placeholder or mock text anywhere in the shell or chat — *Evidence:* Unit test scans rendered chat/shell for coming soon/placeholder/prototype/mock; Opus review found none; grep of shell + chat clean.
- [x] Two accounts with a shared connection (D1) start a 1:1 and see each other's messages live without reload — *Evidence:* e2e p1512-chat-live (two browsers: search, start 1:1, live delivery without reload, unread badge).
- [x] An account with no shared connection cannot start a 1:1 or find the other in search — *Evidence:* write canary (start_dm refused, search excludes; late RSVP after the 12 h window gives no connection).
- [x] A blocked account cannot send, start a 1:1 or find the blocker — *Evidence:* write canary (send, start, search) + UI blocked state.
- [x] After the shared group ends, the existing 1:1 still works — *Evidence:* write canary (dm still sends after leaving the org).
- [x] General and event channels follow the access lifecycle table, including history from join time — *Evidence:* read canary (join/leave/rejoin history from join; RSVP inside/outside 12 h window; cancel; host; server-stamped join/RSVP times).
- [x] Two-user canary per path: a non-member gets nothing via REST, Realtime, search, forward, attach or Clarify using a real id — *Evidence:* read canary (REST, RPC, Realtime with a member control, search, forward, attach, clarify, thread stats, member_state DELETE payloads).
- [x] Write canary: self-insert into a conversation, posting as another user, editing or deleting another's message, and a cross-conversation reply all fail — *Evidence:* write canary (no client write grants; author is always the caller; foreign edit/delete; cross-conversation reply/thread; idempotent replay rules).
- [x] A deleted message's body is gone over REST and Realtime; an erased account's messages show "Deleted user"; account erase still succeeds — *Evidence:* read canary (REST + Realtime UPDATE payload), erase canary (Deleted user, words gone from third-party forwards and clarify copies), p520 account-deletion 15/15.
- [x] Deleting an event with a channel succeeds — *Evidence:* read canary (host deletes an event with channel, messages and read state).
- [x] Unread is correct across two devices of one user; mark-as-unread and archive persist — *Evidence:* read canary (two clients, member_state Realtime), mark-read through message id (µs-exact), unit tests for mark-unread/archive.
- [x] Threads, quote-reply, forward (D5), attach, edit and delete work and persist — *Evidence:* e2e p1512-chat-live (thread, forward, attach point + story, edit, delete live) + unit tests.
- [x] Clarify puts the message and its thread into the owner's mirror chat only; Rename persists; role always shows — *Evidence:* e2e (copy only in the clarifier's mirror, checked by admin query) + unit (rename persists; role segment never truncated).
- [x] Desktop sidebar collapses to the logo with hover-to-expand; no sidebar Search; + opens the live invite — *Evidence:* p1512-shell tests + screenshots (collapsed, logo hover); `+` in the chat list opens `/agreements/new/create`.
- [x] Existing users see their groups' General channels and their mirror on first open — *Evidence:* migration backfill (one General per org, one channel per event, one mirror per profile; counts equal sources in the first-run proof) + e2e new-user list.
- [ ] Phone (375, 320) and desktop pass the visual QA checklist
- [x] No prototype route, persona plugin or mock code remains in the build — *Evidence:* v12–v16 code, tests, routes, `scripts/p1509-*` and the vite persona plugin deleted; grep clean.

## Known Limitations (recorded at /dev, 2026-10-19)

Reviewed by Gemini review model, Codex and Opus in two full rounds plus two freshness passes; these were judged exotic or product calls, not fixed:

- Forwarding a forward keeps only the original snapshot (the middle forwarder's note is not carried).
- A deleted message still moves its chat up the list ("Message deleted" preview), as in WhatsApp.
- Clients subscribe to chat tables unfiltered; Realtime evaluates access per subscriber per change. Fine at current scale; revisit with conversation filters or private broadcast when traffic grows.
- A blocked person can infer the block (sends are refused).
- A host editing an event's date moves the 12 h RSVP window.
- A profile deleted outside `erase_my_account` keeps its message bodies (shown as "Deleted user").
- Attachment visibility mirrors the points/stories SELECT policies by hand; a future change to those policies must update `_chat_can_attach`.
- A forward retried after its source was deleted now returns the stored copy; if the reply to the first attempt is lost and the user never retries, the UI settles via the Realtime echo.
- The live lost-reply e2e proves one stored row; its Retry-button branch is covered by unit tests only (the Realtime echo settled it first in every live run).
- Live pages keep pre-existing phone defects (INBOX-194); out of scope by founder decision 1.
- Collapsed desktop sidebar shows only the logo (founder decision 5), so menu badges are hidden while collapsed.
- After a slow author-name lookup falls back to a cached name or "Unknown member", a later successful lookup shows the real name, but the internal "missing" set is not cleared and a failed retry can schedule another fallback timer (final Gemini pass, MEDIUM; no visible effect found).

## Pre-deploy Checklist

- [x] Realtime confirmed working on test (step 0)
- [ ] Chat migrations (tables, policies, backfill, `erase_my_account` update) applied on test, both canaries green, then prod via `/push`
- [x] Chat tables in the Realtime publication only with canary-passing policies
- [ ] Privacy policy section on chat messages published — [FOUNDER DECISION: wording of the privacy-policy section on chat messages; not drafted by the agent]

## Related

- P1509 (prototype v12 to v16, build report on its branch), P1495, P1431, P1458, P1461, P1502, P1457
- P1048, P1114, P1138 (chat table, Realtime and RLS history); P1392 (`/` → `/feed`); P520 (account erase); P1193 (event group-chat link)
- Spec review 2026-10-19: Codex, Gemini 4 Argon, Opus — 3 of 3 reported; findings folded in above

## Technical Architecture

**Base commit:** `4021a945f` · **Branch/worktree:** `feature/p1509-clarity-chat-v12` in `w5` (P1512 builds on the P1509 branch).

### Technical Analysis

- Step 0 (2026-10-19): Realtime `postgres_changes` delivers on the test project (`p1114`/`p1057` canaries: 2 passed, 1 passed on retry — the first subscription can miss early events). The chat client therefore never trusts Realtime alone: it refetches on subscribe, on reconnect and on tab focus.
- Name clash: `clarity_chat_messages` already exists (live-session chat). New tables use the `chat_` prefix: `chat_conversations`, `chat_messages`, `chat_member_state`, `chat_blocks`.
- `membership` and `event_rsvps` INSERT grants are full-row: a client can supply `accepted_at` / `rsvped_at`. Those timestamps gate chat history (D3, D4), so a BEFORE INSERT trigger stamps `now()` for non-service-role callers.
- Supabase Realtime applies RLS to INSERT/UPDATE `postgres_changes` (P1057) but not to DELETE (DELETE carries only the primary key under the default replica identity). So: replica identity stays DEFAULT; user deletes are an UPDATE that nulls the body; only cascades (event deleted, conversation removed) hard-delete, leaking at most a row id.

### Architecture Decisions

- **Access is computed, not copied.** `chat_access_since(conversation, uid)` returns the time from which a user may read (NULL = no access): 1:1 → its two people; mirror → owner; group General → `membership.accepted_at`; event channel → host from the start, else `event_rsvps.rsvped_at` if the RSVP was made no later than `events.datetime + 12 h` (`EVENT_GRACE_HOURS`). Leave / cancel removes access the moment the row goes; rejoin restarts history at the new time. No membership table to keep in sync.
- **All writes through SECURITY DEFINER RPCs** that check `auth.uid()`; the tables grant authenticated SELECT only (RLS: `created_at >= chat_access_since(...)`). No client INSERT/UPDATE/DELETE grants at all, which makes the write canary structural.
- **Conversations exist ahead of time**: migration backfills one General channel per organization, one channel per event, one mirror per profile; `get_my_chats()` idempotently ensures the caller's mirror, and new orgs/events get theirs on first `get_my_chats()` by any member (ON CONFLICT DO NOTHING).
- **Forward / Clarify are snapshots** (`forward_snapshot jsonb`: author name, body, time, and for Clarify the thread replies), plus `forwarded_from_message_id` (ON DELETE SET NULL) for the link back, which the client resolves through the reader's own access.
- **Threads** are channel-only (`thread_root_id`); 1:1s use `reply_to_id` (quote-reply). Both must point into the same conversation (checked in the RPC).
- **Shared connection (D1)**: same organization membership, both on the same event (RSVP or host), or a `clarity_agreements` row with `status = 'active'` between them. **Block (D2)**: `chat_blocks(blocker, blocked)`; daily limit 20 new 1:1s per user.
- **Read state (D10)** lives in `chat_member_state` (owner-only RLS): `last_read_at`, `manual_unread`, `archived`. It is in the Realtime publication so a second device of the same user updates.
- **Shell**: a signed-in mode inside `ClarityLandingLayout` (desktop left sidebar, phone bottom bar), replacing the top nav for signed-in users on product routes; signed-out, compact, logo-only, chrome-free, `/live`, `/transcribe` and immersive routes keep today's chrome.
- **Home**: `/home` = chat list for signed-in users; `/` sends signed-in users to `/home` once the session has restored and everyone else to `/feed`.

### Security Review

- Invariants from the spec are the test plan: `e2e/integration/p1512-chat-read-canary.spec.ts` (non-member gets nothing via REST, RPC, Realtime, search, forward, attach, Clarify with a real id; control: the member DOES receive, so silence cannot pass) and `p1512-chat-write-canary.spec.ts` (direct table writes, posting as another, editing/deleting another's message, cross-conversation reply/thread, self-insert into a 1:1, blocked sender, no-connection DM start, daily limit).
- All functions: `SET search_path = ''`, schema-qualified, `REVOKE ALL ... FROM PUBLIC, anon` then `GRANT EXECUTE ... TO authenticated` (P877/P904 grant order).
- `erase_my_account` gains a call that nulls the user's chat bodies and author, deletes their mirror (and its copies), their member state and blocks, and renames forward snapshots of their messages to "Deleted user".

### Implementation Approach

#### Build Sequence

1. DB migration + service layer + integration canaries (applied on test).
2. Shell (sidebar / bottom bar / `/home` / Feed rename) — parallel with 1.
3. Chat UI on the real service (port the v16 visual kit, no mock state).
4. Remove the v12–v16 prototype, persona plugin, `scripts/p1509-*`.
5. Two-browser E2E (live delivery), visual QA at 1280 / 375 / 320, reviews (Gemini review model, Opus, Codex).

## Implementation Tasks

- [x] Complete — T1 DB: `supabase/migrations/<ts>_p1512_clarity_chat.sql`, `src/app/data/chat-service.ts`, integration canaries
- [x] Complete — T2 Shell: signed-in sidebar + bottom bar in `ClarityLandingLayout`, `/home`, Feed rename, redirect after session restore
- [x] Complete — T3 Chat UI: `src/app/pages/chat/*` on the real service
- [x] Complete — T4 Remove prototype code, routes, tests, persona plugin, scripts
- [x] Complete — T5 Two-browser E2E + visual QA + reviews

Can parallelize: T1 and T2.
