---
status: week
type: story
rank: 70
workstream: events
created_date: '2026-10-24'
tags: [events, event-room, navigation, back, loading, shell]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1562: Event room chrome, one Back to the event, one loader

## Problem

**Situation:** Since P1542 round 3 the event room (`/events/:slug/room`, `/ready`, `/meet`, and the learning opened from the room) sits inside the signed-in shell: sidebar on desktop, tabs on a phone. Every other shell page puts its Back in the shell's top bar as "← Back …". Loading follows P1539: one 64px icon at the viewport centre, inside the shell (decisions.md 2026-10-22, P1539).

**Complication.** The founder hand-tested a Social Hike on 2026-10-24. Everything below was measured on the w4 dev server with a verified test user. Code citations in this section are on `feature/p1542-series-recipes` at `38d5d3e64` (round 5), the code that was measured.

- **Two Backs.**
  - The room draws its own arrow-only Back (`FocusHeader compact`, 44px, foreground colour) inline with the step bar (`EventRoomMeet.tsx:553-557`).
  - The registration and feedback thank-yous use the shell bar's "← Back to the event".
- **Back walks the room's history instead of leaving it.**
  - The room's Back pops one history entry (`useGoBack`, `EventRoomMeet.tsx:264`).
  - The learning's Back pushes a new room entry (`EventPrepPage.tsx:210, 397-403`).
  - Measured: room → Learn → ← → room → ← lands back on `/prepare?from=room`. That is a loop.
  - The learning plan's "Back to the event" link goes to the room (`EventPrepPage.tsx:699`).
- **White space and an inconsistent Transcribe bar.**
  - On `/meet` the idle "Not transcribing · Transcribe" bar is a full-width row above the step bar (`EventRoomMeet.tsx:536-542`).
  - On the learning page an *invisible* copy of it reserves about 50px of empty band (`EventPrepPage.tsx:554-567`).
  - On the feedback flow there is nothing.
  - The founder asks whether the back arrow belongs on the bar's row.
- **The loader jumps and changes kind.** Cold loads at 1440×900, icon centres in px:
  - `/groups/cm` and `/events` (which redirects there): (713,450), then (837,112), then the text "Loading events...".
  - `/groups/cm/join`: (837,112) for about 2s.
  - `/events/:slug`: the icon, then the text "Loading...".
  - `/meet`: the icon, then a blank content area. After a browser Back it was still blank at 3s.
- **The founder saw the old top bar in the room** (logo, Tools, avatar, two-step "Principle · Feedback").
  - A fresh load of the same URL renders the shell and "Learn · Opt in · Give feedback" (measured).
  - The screenshot matches only the code from 2026-10-23 13:25–15:34. Chrome history shows the tab was reached by Back, and that URL was typed once at 2026-10-23 15:08.
  - Hypothesis: a stale document. UNVERIFIED: the founder hard-reloads that tab to disprove it (see Diagnostics).
  - One real residual path: an account with `is_verified=false` never gets the shell (`use-nav-auth-state.ts:64-65`, `clarity-landing-layout.tsx:116,212`).

**Question:** What is the one header, the one Back rule and the one loader every event-room view (and every page that loads) uses, so a person always knows where they are and where Back goes?

> **Founder framing, verbatim (voice note, 2026-10-24, line breaks as transcribed):**
> "it's weird the back button within event room probably should lead me always"
> "lot of white space so event room is not optimized for once we moved our menu to"
> "review and reuse our standard loading because sometimes it says loading events"
> "Sometimes it's at the top, it's weird, it's weirdly jumping this clarity pledge loading"

## Prerequisite: P1542 round 6 commit (SHA to be filled in when committed)

P1542 round 6 is not on `feature/p1542-series-recipes` HEAD yet. It is in the w4 working tree and still being fixed (round 6b). `/dev` starts from that commit, reads it, and reuses it rather than re-implementing it. **Commit:** `<SHA, fill in when P1542 round 6 is committed>`. Until then, everything in this list is a pending dependency, not shipped behaviour.

Round 6 gives **hike** rooms (recipe flag `room.backToEvent`, `series-recipes.ts`):

- the shell top bar's "← Back to the event" on every room view, and no inline compact arrow;
- no Transcribe bar (recipe flag `room.transcribe: false`);
- replace-history between room steps: the Learn step's open, the learning's `toRoom` and `finishInRoom`, and the plan's Back, each carrying `fromEvent`;
- Back to the event by pop-if-parent-else-replace (`useReturnToParent(`/events/${slug}`, fromEvent)`);
- removal of the learning plan's link that went to the room;
- round 6b, feedback (`/close`) history: the room's "Start now" pushes `/close` with `fromRoom`; the first question's Back returns to the room (pop if `fromRoom`, else replace); the thank-you's "Back to the event" pops only onto an event page below it, else replaces (`EventClosePage.tsx` `backToRoom`, `backToEventPage`).

Line numbers after this point refer to that round 6 working tree. `/dev` re-derives them against the committed SHA.

## Appetite

- **Blast radius: medium.**
  - The room header changes for Clarity Night (hikes are done by round 6). Clarity Night's five-step bar and its Ready → Meet path must keep working.
  - The loader change touches about 9 page loading branches and 2 section loading states.
- **Reversibility: high.** Code only, no migration.
- **Decision density:** low. Transcription on a hike was decided in P1542 round 6 (none). The Clarity Night top-bar control runs on its recommended default (marked below). One label is a copy call.

## Invariants

- **Back goes to the view's parent, named truthfully.** The parent of every room view is the event page, except Clarity Night's `/meet`, whose parent is `/ready` (the Back table below). A label names the place Back goes.
- **No room-internal history.** Moving between a room's own steps (Learn, Opt in, Give feedback; Clarity Night's Table, Compare, Principle) never adds a history entry. Inside `/meet` the steps are component state (`onStep`, `EventRoomMeet.tsx:511-517`); moves between routes inside the room (`/meet` ↔ the in-room learning, `/room` → `/ready` or `/meet`) replace. The two pushes allowed are Ready → Meet (Clarity Night) and the room → `/close` (the feedback wizard). Each of them has a Back that pops it.
- **Provenance is one named field per parent.** Route state carries `fromEvent` (the event page opened the room), `fromReady` (Ready opened Meet) and `fromRoom` (the room opened `/close`). Every replace and every gate redirect copies `fromEvent` forward. A reload keeps it (it is history state). A cold entry has none, and Back then replaces with the parent.
- A page that has nothing to show yet renders `ClarityPageLoader` and nothing else.
- The table's own Transcribe tap stays the transcription consent (decisions.md 2026-10-07, P1433). Moving the control into the top bar must not add, skip or pre-answer that consent.
- `ClarityPageLoader` keeps its 300ms anti-flash delay (decisions.md 2026-04-11, and 2026-06-16 P938), and `LazyRoute` keeps its key on the outermost boundary (decisions.md 2026-06-16, P938).

## Solution

### 1. One room header (Clarity Night; hikes per round 6)

Applies where the layout's `signedInShell` is true (a verified profile, or a pending one with a verified hint, `clarity-landing-layout.tsx:116,212`). Other states are in "Chrome by viewer state" below.

- **Row 1 is the shell top bar** (`shell-top-bar.tsx`, h-14, in flow: it scrolls with the page like on every shell page).
  - Left: the shell's non-compact `FocusHeader` with `onBack` = the view's Back from the table in §2, and its label. This is the pattern of `RsvpConfirm.tsx:102` and the hike room. It renders into the shell bar's left slot with the same size and colour as every shell page. Not `fallback` + `parentName`: that names the parent only on a cold arrival and otherwise pops (`focus-header.tsx`).
  - Right (Clarity Night `/meet` only): the idle transcription control (§1a).
- **Row 2 is the step bar** (`RoomSteps`), the room's sticky head (`room-sticky-head`). The inline compact back arrow is removed. This supersedes P1337 walkthrough 8's "small arrow beside the step bar", which predates the shell.
- **Sticky offset.** The shell bar scrolls away; the step bar pins to the screen's top edge plus the offline strip and the running capture bar (`roomHeadOffset`, `room-head-offset.ts:15-16`, and the P1512 rule in `index.css:233-235`, which drops the old nav height inside the shell). This is today's in-shell behaviour and it stays. At scroll 0 the step bar sits directly under the 56px shell bar. Nothing may hide under the pinned step bar.
- **Clarity Night `/ready`** gets the same Row 1 (its compact `FocusHeader fallback`, `EventRoomReady.tsx:141`, moves to the shell bar as "Back to the event").
- **The learning opened from the room** exists only for hikes (`inRoom = fromRoom && !!words`, `EventPrepPage.tsx`). Round 6 already gives it this header. The learning opened by the feedback thank-you's Join (`then=join`) keeps its own join context header (P1542 round 5d) and is out of scope here.
- **Signed out,** the room keeps its compact gate (P1542 round 3).

#### 1a. Clarity Night's idle transcription in the top bar

[FOUNDER DECISION: Clarity Night's idle transcription becomes a compact "Transcribe" control in the top bar's right slot, and the "Not transcribing" row is dropped. Recommended, and built as the default unless the founder overturns it before `/dev`. The alternative is to keep today's full-width row above the step bar.]

The control is the existing `RoomTranscribeIdleBar` (`room-capture-bar.tsx:240-276`) in a compact form, not a new control:

- the same start action (`capture.startCapture({ eventId, displayName })`) and the same `onFailed` (the existing "transcription failed" notice);
- the same disclosure: the description stays as the button's `title` and `aria-describedby` text (`session-bar.tsx:123-136`), and the same `CaptureInfoButton` sits beside it;
- the same guards: nothing renders while offline, while capture is starting or ending, while this event is already being captured, when the room is frozen or the evening is over (`EventRoomMeet.tsx:549`);
- the same "Starting…" disabled state during the start.
- "Transcribe" (outline, `h-9`) is the only text. "Not transcribing" is dropped.
- While capture runs, the right slot is empty and the running capture bar (`RoomCaptureBarSlot`) takes its slot as today.
- Where capture is paused by route (`/close`), the right slot is empty. It is never an invisible spacer.
- The tap is the consent. Nothing is pre-selected and nothing starts without it.

#### Chrome by viewer state

| Viewer | What they see on `/room`, `/ready`, `/meet` |
|---|---|
| Signed out | The compact room gate screen (`EventRoomGateScreen`), unchanged |
| Signed in, not registered (non-attendee) | The gate screen, unchanged |
| Signed in, unverified or profile failed (no shell) | No shell (the P1421/P1512 rule, unchanged). The same `FocusHeader` renders in place above the step bar (it falls back in place outside the shell, `shell-top-bar.tsx` `ShellBarPortal`), with the same label and destination. Clarity Night keeps today's full-width Transcribe row, since there is no right slot |
| Verified attendee | §1 and §1a |
| Host on `/meet` | Same as a verified attendee. `/host` keeps its compact chrome (Non-Goals) |

### 2. One Back rule for the room

| View | Control | Goes to | History | Label |
|---|---|---|---|---|
| Hike room (`/meet`, any step) and hike in-room learning | top bar Back | `/events/:slug` | pop if `fromEvent`, else replace | "Back to the event" (round 6) |
| In-room learning, a step screen | the learning's own step Back | the previous learning screen | in the page, no entry | arrow only, inside the learning (permitted: it is a step, not a page Back) |
| Clarity Night `/ready` | top bar Back | `/events/:slug` | pop if `fromEvent`, else replace | "Back to the event" |
| Clarity Night `/meet`, opened by Ready | top bar Back | `/events/:slug/ready` | pop (`fromReady`) | [FOUNDER DECISION: copy, proposed "Back to readiness", today's accessible name] |
| Clarity Night `/meet`, return visit (no Ready below) | top bar Back | `/events/:slug/ready` | replace | same as above |
| Clarity Night `/meet`, frozen (evening over) | top bar Back | `/events/:slug` | pop if `fromEvent`, else replace | "Back to the event" |
| `/close`, a later question | wizard step Back | the previous question | in the page (search-param replace) | as today |
| `/close`, first question | Back | the room | pop if `fromRoom`, else replace with the room | as today |
| `/close`, thank-you | "Back to the event" | `/events/:slug` | see below | "Back to the event" |

- **`fromEvent` travels.** The event page's room links set it. `EventRoomGate`'s redirect passes it on (`EventRoomGate.tsx:110`, already). Ready → Meet adds `fromReady` and keeps `fromEvent` (`EventRoomReady.tsx:101`, today it sends only `fromReady`). The room's links to `/close` (both branches, `EventRoomMeet.tsx` about :651 and :666; the Clarity Night branch sends no state today) carry `fromRoom` and the room's `fromEvent`.
- **The thank-you leaves no room entry above the event.** With room → `/close` pushed, the stack is `[event, room, close]`. A plain replace of the thank-you leaves `[event, room, event]`, and browser Back then reopens the room. Rule: when `fromRoom` and the room's `fromEvent` are both set, the thank-you's Back returns past both entries to the event page below them. When only `fromEvent` is set (the event page opened `/close`), it pops. Otherwise it replaces with the event. `/dev` picks the mechanism (for example, a two-step pop guarded like `useGoBack`'s dead-back watch).
- Clarity Night's thank-you today uses a generic history Back (`FocusHeader fallback`, `EventClosePage.tsx:580`). It takes the same rule.
- Clarity Night: `/ready` → `/meet` keeps its pop-to-Ready behaviour (`useReturnToParent(.../ready, fromReady)`), because Ready is the parent there. `/dev` confirms with the p1114/p1337 e2e.

### 3. One loader

1. **Page level** ("nothing of this page can be shown yet"): `ClarityPageLoader` only. In the shell it is the viewport-centred content loader (P1539), so the splash, the Suspense fallback and the page loader hand off without moving. Migrate:
   - `org-page.tsx:326-331`, `org-join-page.tsx:178-184`, `org-directory-page.tsx:99-104`: bare `ClarityLoader` in `flex min-h-screen justify-center py-20`;
   - `EventDetail.tsx` (the `Loading...` branch, about :404-407 on the round 6 tree), `CreateEvent.tsx:97-101`: the text "Loading...";
   - `EventRoomGate.tsx:89, 93, 95, 99`, `EventRoomMeet.tsx:442`, `EventRoomReady.tsx:104, 117`, `EventArrivingPage.tsx:37`: `return null`. These render `ClarityPageLoader` while they wait. Where the next step is a `<Navigate>` or a `navigate(..., { replace })`, the loader keeps showing until it lands. (These lines are on the P1542 branch. On `main` they are `EventRoomReady.tsx:103, 115` and `EventArrivingPage.tsx:35`.)
2. **Section level** (the page's own header is already drawn): a skeleton of the section's shape, never text and never a second large icon. P1539 rejected per-page skeletons as the page loader; these two are section states under a drawn page, which P1539 does not cover.
   - **`EventsList.tsx:231-234`:** "Loading events..." becomes 3 skeleton event cards while the events read is pending. If the events read fails, a readable line replaces the skeleton, never an endless skeleton. [FOUNDER DECISION: copy, the failure line.]
   - **The room roster (`EventRoomMeet.tsx:738-750`):** skeleton rows only while the **first** roster read is pending. The read must report failure apart from empty: `getRoomRoster` collapses a failure to `[]` (`event-room-service.ts:198-200`), and `fetchRoomRoster` already returns `null` on failure. A failed first read shows a quiet readable line, not an alarm (P1114's rule: "never an error state or an empty wall"), and the next poll retries. A later failure keeps the last good rows (as the realtime path does today). A successful empty read uses the existing per-group display. [FOUNDER DECISION: copy, the unavailable line; today's "Loading who is here…" is wrong for a failure.]
3. **`EventsList` shows the list when the events arrive.** Today it waits for one `isUserRsvpd` call per event before clearing its loading state (`EventsList.tsx:69-93`). The cards' "Going" mark then fills as each RSVP read lands. Rules:
   - an RSVP not yet known shows no mark (unknown is not "not going"); the card has no other RSVP-dependent control (`EventCard.tsx:51-64`);
   - a response for an older user or group is dropped (a cancellation guard on the effect, keyed on user id and group id);
   - marks are cleared when the user signs out or changes;
   - a failed RSVP read leaves that mark absent and never blocks the list.
4. **Record the standard** in `docs/ux-patterns.md`, a short "Loading" section that points to `clarity-loader.tsx` and links the existing decision (decisions.md 2026-10-22, P1539). `/kdd` adds a decision entry only for what is new here: the section-skeleton rule and the RSVP-after-list rule.

### 4. Old top bar (diagnostic only)

- No code change is assumed. The Diagnostics item below is reported, not built.
- If the old bar returns on a fresh load with the founder's own account, `/dev` reproduces it with that account's state (verified flag, profile) before changing anything, and reports back. It does not widen this spec.
- Whether an unverified signed-in attendee should get the shell in the room is outside this spec (the P1421/P1512 rule). The table above records what they see.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Replacing history between room steps breaks Clarity Night's Ready ↔ Meet back | MITIGATE | Ready stays the parent of Meet for Clarity Night; p1114 and p1337 e2e must pass unchanged |
| The shell top bar plus step bar is taller on a phone than today's single row | MITIGATE | The shell bar scrolls away and the step bar pins (§1). Measure at 320/375 at scroll 0 and after scrolling; no content may hide under the pinned bar |
| Moving Transcribe drops a guard or the disclosure | MITIGATE | The compact control is the same component's start action, guards and description (§1a); the p1337 idle-bar test keeps passing |
| P1542 round 6 changes again before it is committed | MITIGATE | The prerequisite SHA is filled in first; `/dev` reconciles citations against it |
| The founder's stale-tab hypothesis is wrong | ACCEPT | Cheap disproof first (Diagnostics); the spec's other parts stand either way |
| Skeletons for every section | DEFER | Only the two sections named above. Others when touched |
| A repo-wide AST guard test for loaders (text `Loading…`, `ClarityLoader` in `min-h-screen`, `return null` on loading) | DEFER | Its own task. This spec keeps focused regression tests on the migrated branches |
| One batched RSVP read replacing the N `isUserRsvpd` calls | DEFER | Its own task. It must keep the existing authorization boundary |
| `/host`'s page loader (`EventHostPage.tsx:1280`, the text "Loading…") | DEFER | `/host` is not touched here (Non-Goals) |

**Non-Goals**

- Do NOT change the room's steps, their labels or their default step (P1542).
- Do NOT change the boot splash, P1539's anti-flash or its loader chain.
- Do NOT add a Back to the bottom tabs or change Browse vs Focus routing (`bottom-nav.tsx`).
- Do NOT change transcription behaviour (consent, capture, pausing rules, P1307). Only where its idle control sits.
- Do NOT touch `/host` (chrome or loader).
- Do NOT change the `then=join` learning's header or flow (P1542, P1549).
- Do NOT change who gets the shell (the P1421/P1512 rule).

## Done-When

Every visual item is measured at 1440, 375 and 320, with outputs pasted (the screen-review brief v2 alignment snippet). Header and geometry items are for a verified signed-in attendee unless the item names another viewer.

- [ ] On Clarity Night `/meet` (each step) and `/ready`, and on a hike `/meet` and its in-room learning, the viewer sees:
  - one top bar with the table's Back and label on the left (the same element and classes as the registration thank-you's Back);
  - the step bar directly under it at scroll 0;
  - no inline compact back arrow; the only other back control is the in-room learning's step Back;
  - no invisible spacer row;
  - the step bar's top at the same y (±2px) on every room view, compared between views with the same offline and capture state, at scroll 0 and after a 400px scroll.
- [ ] Back, with every URL and `history.length` recorded by the e2e:
  - hike: room → Learn → Back → event;
  - hike: room → Learn → Opt in (step bar) → Back → event;
  - room → Give feedback → first question → Back → room, Back → event;
  - room → Give feedback → finish → thank-you "Back to the event" → event;
  - after each of these, the browser Back from the event never shows a room view, the learning or `/close`, and the browser Forward after it never lands on a room step the person left by Back;
  - the same sequences with a reload in the middle, and from a cold entry (typed `/events/:slug/room` and `/events/:slug/close`), end on the event with no room entry above it.
- [ ] Clarity Night: event → room → Ready → Meet → Back → Ready, and Ready's Back → event. A return visit's Meet → Back → Ready (replace) → Back → event. Frozen Meet → Back → event. p1114/p1337 e2e unchanged and green.
- [ ] Clarity Night `/meet`, per §1a: a compact "Transcribe" in the top bar's right slot, with the info button, and no "Not transcribing" row. It is absent on `/close`, while offline, while starting or ending, while capturing (the running bar shows), when frozen and when the evening is over. A failed start shows the existing failure notice. The tap starts capture and nothing else does. A hike room shows no transcription control anywhere (round 6 stays green).
- [ ] Viewer states: signed out and non-attendee see the gate screen unchanged; an unverified signed-in attendee sees the in-place Back with the same label and destination, and Clarity Night's full-width Transcribe row; the host on `/meet` sees the attendee header.
- [ ] Cold loads of `/groups/cm`, `/events`, `/groups/cm/join`, `/events/:slug`, `/events/:slug/room` and `/events/:slug/meet`, with the page's data requests held by a controlled delay (Playwright route delay), 100ms frames from navigation until the page resolves (content, redirect, gate screen or error):
  - allowed while pending: the shell chrome, the anti-flash blank before the loader appears, the one brand icon, and the two section skeletons once the page header is drawn;
  - the icon's centre moves at most 8px across the frames where it is visible;
  - no frame shows "Loading" text;
  - no frame shows a blank content area after the icon has been visible and before the page resolves.
- [ ] The events list under a group's tabs shows skeleton cards, not text, while loading. With RSVP reads delayed, the list renders before the marks arrive. Signed out shows no marks. An account switch and a group switch never show the previous account's or group's marks (the stale response is dropped). A rejected RSVP read leaves the list showing. A failed events read shows the failure line, not an endless skeleton.
- [ ] Room roster: skeleton rows while the first read is pending (delayed request); a failed first read shows the readable unavailable line, not skeletons; a failed later poll keeps the last rows; a successful empty read shows the existing empty display.
- [ ] Each migrated `return null` and text loader has a focused test that fails on the old branch (pasted non-zero exit) and passes on the new one.

**Diagnostics to report (not completion boxes):**

- The founder's stale-tab check: the founder hard-reloads that tab and reports which bar shows after the reload. If the old bar persists, `/dev` reproduces it with the founder's account state and reports. Neither outcome blocks this spec's completion.

## Related

P1542 (round 3 put the room in the shell; round 6 built this header and Back rule for hikes; prerequisite commit above) · P1337 (walkthrough 8 back arrow, superseded here; the idle Transcribe bar) · P1539 (signed-in loading; decisions.md 2026-10-22) · P1364 (Back is declared) · P1307 (room transcription) · P1433 (Transcribe tap is the consent) · P1114 (room roster degrade rule) · P1549 (join path; it moves the same `org-join-page` loader, whichever lands second reuses it)
