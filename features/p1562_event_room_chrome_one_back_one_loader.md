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

**Situation:** Since P1542 round 3 the event room (`/events/:slug/room`, `/meet`, and the learning opened from the room) sits inside the signed-in shell: sidebar on desktop, tabs on a phone. Every other shell page puts its Back in the shell's top bar as "← Back …". Loading follows P1539: one 64px icon at the viewport centre, inside the shell.

**Complication.** The founder hand-tested a Social Hike on 2026-10-24. Everything below was measured on the w4 dev server with a verified test user:

- **Two Backs.**
  - The room draws its own arrow-only Back (`FocusHeader compact`, 44px, foreground colour) inline with the step bar (`EventRoomMeet.tsx:551-557`).
  - The registration and feedback thank-yous use the shell bar's "← Back to the event".
- **Back walks the room's history instead of leaving it.**
  - The room's Back pops one history entry (`useGoBack`, `EventRoomMeet.tsx:264`).
  - The learning's Back pushes a new room entry (`EventPrepPage.tsx:210, 399-404`).
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
  - Hypothesis: a stale document. UNVERIFIED: the founder hard-reloads that tab to disprove it.
  - One real residual path: an account with `is_verified=false` never gets the shell (`use-nav-auth-state.ts:64-65`, `clarity-landing-layout.tsx:116,212`).

**Scope after P1542 round 6 (2026-10-24, on `feature/p1542-series-recipes`, not yet shipped).** Round 6 already gives **hike** rooms the shell's "← Back to the event" in the top bar, no Transcribe bar, replace-history between room steps, Back always to the event page, and removes the learning plan's link that went to the room. This spec carries the same header and Back rule to every other recipe (Clarity Night today), moves Clarity Night's transcription into the top bar, and sets the one-loader standard across pages. `/dev` starts by reading what P1542 round 6 shipped and reuses it rather than re-implementing it.

**Question:** What is the one header, the one Back rule and the one loader every event-room view (and every page that loads) uses, so a person always knows where they are and where Back goes?

> **Founder framing, verbatim (voice note, 2026-10-24, line breaks as transcribed):**
> "it's weird the back button within event room probably should lead me always"
> "lot of white space so event room is not optimized for once we moved our menu to"
> "review and reuse our standard loading because sometimes it says loading events"
> "Sometimes it's at the top, it's weird, it's weirdly jumping this clarity pledge loading"

## Appetite

- **Blast radius: medium.**
  - The room header affects every event's room. Clarity Night's five-step bar and its Ready → Meet path must keep working.
  - The loader change touches about 10 page loading branches.
- **Reversibility: high.** Code only, no migration.
- **Decision density:** low. Transcription on a hike was decided in P1542 round 6 (none, the recommended default; the founder may still overturn it). The Clarity Night top-bar control is the one remaining call, marked below.

## Invariants

- The room stays one entry in the tab's history while a person moves between its own steps (Learn, Opt in, Give feedback, Clarity Night's Ready, Table and Compare, and the learning's screens).
- Back from any room view lands on `/events/:slug`, never on another room step.
- A page that has nothing to show yet renders `ClarityPageLoader` and nothing else.

- The table's own Transcribe tap stays the transcription consent (decisions.md 2026-10-07, P1433). Moving the control into the top bar must not add, skip or pre-answer that consent.
- `ClarityPageLoader` keeps its 300ms anti-flash delay (decisions.md 2026-04-11), and `LazyRoute` keeps its key on the outermost boundary (decisions.md 2026-06-16, P938).

## Solution

### 1. One room header

The header is the same on `/meet` (every step) and the learning opened from the room.

- **Row 1 is the shell top bar** (`shell-top-bar.tsx`, h-14):
  - Left: the shell's non-compact `FocusHeader` with `onBack` = the room's Back (§2) and `label="Back to the event"`. This is the same pattern as the hike's registration thank-you (`RsvpConfirm.tsx:102`) and its feedback thank-you (`EventClosePage.tsx:562`). It renders into the shell bar's left slot with the same size and colour as every shell page. Not `fallback` + `parentName`: that names the parent only on a cold arrival and otherwise pops (`focus-header.tsx`).
  - Right: transcription as a compact control in the bar's right slot. That is "Transcribe" (outline, `h-9`) plus the existing info button. "Not transcribing" is dropped. While capture runs, the existing running capture bar takes over as today.
  - Where capture is paused by route (the learning, `/close`), the right slot is empty. It is never an invisible spacer.
- **Row 2 is the step bar** (`RoomSteps`), directly under the top bar. The inline compact back arrow is removed. This supersedes P1337 walkthrough 8's "small arrow beside the step bar", which predates the shell.
- **Delete** the invisible Transcribe placeholder on the learning page (`EventPrepPage.tsx:554-567`). Both rows are the same on every room view, so the step bar sits at the same y without it.
- **Signed out,** the room keeps its compact gate (P1542 round 3).
- Hikes: no transcription control (built in P1542 round 6).
- [FOUNDER DECISION: Clarity Night's idle transcription becomes a compact "Transcribe" control in the top bar's right slot, and the "Not transcribing" row is dropped. Recommended; the alternative is to keep today's full-width row above the step bar.]

### 2. One Back rule for the room

- The room's Back uses `useReturnToParent(`/events/${slug}`, cameFromEvent)`: pop when the event page is the entry directly below, else `replace` with the event page.
- `cameFromEvent` is set by the event page's room link as route state, as `RsvpConfirm` already does with `fromEvent`.
- **Moving between room steps replaces instead of pushing:**
  - `RoomSteps` `onSelect`;
  - the Learn step's open (`EventRoomMeet.tsx:565`);
  - the learning's `toRoom` and `finishInRoom` (`EventPrepPage.tsx:210-214`);
  - the learning plan's and end's Back (`leavePlan`).
  The room therefore occupies one history entry, so neither the in-app Back nor the browser Back can loop through Learn.
- The learning's **step** Back (previous learning screen) stays an in-flow step back.
- The feedback flow (`/close`) keeps its wizard step-back. From its first question, its Back returns to the room's Give feedback view with `replace`. The thank-you keeps "Back to the event" (already correct, measured).
- Remove the learning plan's "Back to the event" link that goes to the room (`EventPrepPage.tsx:699`). The header Back replaces it.
- Clarity Night: `/ready` → `/meet` keeps its pop-to-Ready behaviour (`useReturnToParent(.../ready, fromReady)`), because Ready is the parent there. Only views with no Ready (hikes, a return visit) change. `/dev` confirms with the p1114/p1337 e2e.

### 3. One loader

1. **Page level** ("nothing of this page can be shown yet"): `ClarityPageLoader` only. In the shell it is the viewport-centred content loader (P1539), so the splash, the Suspense fallback and the page loader hand off without moving. Migrate:
   - `org-page.tsx:327`, `org-join-page.tsx:180`, `org-directory-page.tsx:101`: bare `ClarityLoader` in `flex min-h-screen justify-center py-20`;
   - `EventDetail.tsx:395-399`, `CreateEvent.tsx:98-101`: the text "Loading...";
   - `EventRoomGate.tsx:89-99`, `EventRoomMeet.tsx:430`, `EventRoomReady.tsx:104,117`, `EventArrivingPage.tsx:37`: `return null`. These render `ClarityPageLoader` while they wait. Where the next step is a `<Navigate>`, the loader keeps showing until it lands.
2. **Section level** (the page's own header is already drawn): a skeleton of the section's shape, never text and never a second large icon.
   - `EventsList.tsx:231-234`: "Loading events..." becomes 3 skeleton event cards.
   - `EventRoomMeet.tsx:712`: "Loading who is here…" becomes skeleton roster rows.
   - `EventHostPage.tsx:1280` becomes `ClarityPageLoader`, because it is page-level.
3. **`EventsList` waits for one `isUserRsvpd` call per event** before it clears its loading state (`EventsList.tsx:77-82`). Show the list when the events arrive, and fill the "registered" marks when the RSVP reads land. `/dev` decides whether one batched read replaces the N calls.
4. **A guard test** (`src/tests/`) scans routed page components with the TypeScript AST, as `p1364-back-drift-guard.test.ts` does. It fails on:
   - a JSX text node matching `/^Loading/` inside a loading branch;
   - `ClarityLoader` inside a `min-h-screen` wrapper outside `clarity-loader.tsx`;
   - `return null` guarded by a `loading`-named condition in a routed page.
   It has an allowlist with reasons and a known-bad and a known-good fixture, so it proves it can fail (epistemic gate 7).
5. **Record the standard** in `docs/ux-patterns.md`, a short "Loading" section. It points to `clarity-loader.tsx`. There is no decisions.md entry for P1539 yet, so `/kdd` records this one.

### 4. H: the old top bar

- No code change is assumed. The first `/dev` step is the founder's hard reload of the stale tab.
- If the old bar returns on a fresh load with the founder's own account, reproduce it with that account's state (verified flag, profile) before changing anything.
- Separately, decide whether an unverified signed-in attendee should get the shell in the room. Today they get the compact top nav on every page (the P1421/P1512 rule), which is outside this spec. This spec records the path and does not change it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Replacing history between room steps breaks Clarity Night's Ready ↔ Meet back | MITIGATE | Ready stays the parent of Meet for Clarity Night; p1114 and p1337 e2e must pass unchanged |
| The shell top bar plus step bar is taller on a phone than today's single row | MITIGATE | Measure at 320/375. The room's sticky head offset (`room-head-offset.ts`, `index.css` 222-239) follows the bar; no content may hide under it |
| The guard test flags legitimate inline "Loading…" (button labels such as "Joining…") | MITIGATE | Scope it to page loading branches; allowlist with reasons |
| The founder's stale-tab hypothesis is wrong | ACCEPT | Cheap disproof first; the spec's other parts stand either way |
| Skeletons for every section | DEFER | Only the two sections named above. Others when touched |

**Non-Goals**

- Do NOT change the room's steps, their labels or their default step (P1542).
- Do NOT change the boot splash, P1539's anti-flash or its loader chain.
- Do NOT add a Back to the bottom tabs or change Browse vs Focus routing (`bottom-nav.tsx`).
- Do NOT change transcription behaviour (consent, capture, pausing rules, P1307). Only where its idle control sits.
- Do NOT touch `/host` (stays compact).

## Done-When

Every visual item is measured at 1440, 375 and 320, with outputs pasted (the screen-review brief v2 alignment snippet).

- [ ] On `/meet` (each step) and on the learning opened from the room, a signed-in person sees:
  - one top bar with "← Back to the event" on the left (the same element and classes as the registration thank-you's Back);
  - the step bar directly under it;
  - no other back control;
  - no invisible spacer row;
  - the step bar's top at the same y (±2px) on every room view.
- [ ] Back from every room view lands on `/events/:slug`:
  - room → Learn → Back → event;
  - room → Learn → Opt in (step bar) → Back → event;
  - room → Give feedback → first question → Back → room, Back → event;
  - after each of these, the browser Back never shows a room step or the learning.
  The e2e records each URL.
- [ ] Clarity Night: Ready → Meet → Back → Ready, and Ready's Back → event (p1114/p1337 e2e unchanged and green).
- [ ] Clarity Night, per the founder decision above: a compact "Transcribe" control in the top bar's right slot on `/meet` views, absent on the learning and `/close`, and no "Not transcribing" row. A hike room still shows no transcription control anywhere (P1542 round 6 stays green).
- [ ] Cold loads of `/groups/cm`, `/events`, `/groups/cm/join`, `/events/:slug`, `/events/:slug/meet` and `/events/:slug/room`, 100ms frames for 3s:
  - only the brand icon ever shows;
  - its centre moves at most 8px across all frames;
  - no frame shows "Loading" text;
  - no frame shows an empty content area between two loaders.
- [ ] The events list under a group's tabs shows skeleton cards, not text, while loading, and it renders before the per-event RSVP marks arrive.
- [ ] The loader guard test fails on a seeded known-bad file (pasted non-zero exit), passes on the known-good one, and passes on `src/`.
- [ ] The founder's stale-tab check is reported (hard reload of the tab; the bar after reload). If the old bar persists, this item turns into a reproduction with the founder's account.

## Related

P1542 (round 3 put the room in the shell; round 6 built this header and Back rule for hikes) · P1337 (walkthrough 8 back arrow, superseded here) · P1539 (signed-in loading) · P1364 (Back is declared) · P1307 (room transcription) · P1549 (join path uses the same in-room learning)
