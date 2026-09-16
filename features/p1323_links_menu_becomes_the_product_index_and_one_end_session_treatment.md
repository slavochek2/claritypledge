---
status: week
type: change-request
disclosure: public
drafted_by: opus
exec_model: sonnet
exec_effort: medium
rank: 1000095
changes: p1179
tags:
  - redesign
  - p1179
  - p1307
  - events
  - navigation
created_date: 2026-09-16
delivery_stage: challenge-prd
pipeline_ran: [change-request, challenge-prd]
pipeline_plan: [change-request, challenge-prd, architect, generate-tests, dev, verify]
pipeline_skipped: ["ux -- shape chosen by the founder at /tree/links-menu; the only open design item is letter label copy, which is a FOUNDER DECISION not a layout question", "decompose -- three concerns but they ship together; split specs could not land independently"]
---

# P1323: The Links menu becomes the product's index, and End Session gets one treatment

> **Redesign of:** [P1179: The event room "Links" menu and the locked stake surface](done/2026-06-10/p1179_event_room_links_menu_and_stake_surface.md)
> **Also corrects a placement decision from:** [P1307: Event transcription from the ready screen, across pages, into sessions](done/2026-06-10/p1307_event_transcription_from_ready_across_pages_into_sessions.md)
>
> **What was wrong:** P1179 scoped the menu to the room and the menu's contents outgrew that
> scope. Eight of its nine entries are identical at every event and on every no-event page;
> only the "This event" group is event-specific, and **0 of the 14 events readable on prod
> carry a single one** — that group has never rendered an entry in production. Meanwhile the
> menu is unreachable from a bare `/stake/:tag`, from `/transcribe`, from `/live` and from
> every other product surface, so the destinations it indexes are reachable only by typing a
> URL. Separately, P1307 D9 gave the room-capture bar an in-flow slot on `/transcribe/:code`
> itself, where the page header already carries "End Session" — producing two end-controls and
> an "Open" button that navigates to the page it is drawn on.

## Operating Mode

> This spec is an **incremental correction** to P1179 (plus one placement item from P1307), not
> a greenfield design. Both predecessor specs are **read-only shipped history** — do not
> recommend edits to them. Your job at every pipeline stage is to **implement the delta** below.
> Settled decisions from P1179 that are not named in the superseded table are not up for
> re-examination.

## Approved reference

**`/tree/links-menu`** (DEV-only, `src/app/pages/prototypes/links-menu-prototype.tsx`). It is the
approved reference for shape, grouping, the "This event" empty state, and the End Session
treatment. Where this spec and the prototype disagree, the prototype's *rendering* wins and this
spec's *rules* win; raise the conflict rather than picking silently.

## Problem Statement

P1179's problem — *"if I say go to the menu ... and then select the CMP7, that's much easier"* —
is still exactly right and is not superseded. What is superseded is its answer to **where**.

P1179 asked *"where does it live so it is reachable from every **room** screen"* and answered with
a room-scoped mount. Since then the menu's contents have become the product's standing index: five
point collections (six with `aisafety1`), three tools, and now nine public letters. None of that is
event-specific. The scope rule stayed room-shaped while the contents stopped being room-shaped, and
the founder hits the gap as a dead end:

> "in stakes, in stake, I think we don't [have links]... if I go to link and then I say transcribe,
> in the transcribe we don't have it... and also in slash understanding, for example, we don't have
> the links in the menu, which is weird."

The mechanism is exact: `linksMenuAppliesTo` (`src/app/data/event-links.ts`) returns true only for
`/ready`, `/meet`, `/events/:slug/{room,ready,meet}`, and `/stake/:tag` **carrying `?event=`**. A
`/stake/understanding` link shared without that query parameter renders the same page with no menu.

The second problem is a duplicated control, not a scope one. On `/transcribe/:code` the page's own
sticky header renders "End Session" and then mounts `RoomCaptureBarSlot` directly beneath it, which
renders the same action again plus "Open" → `/transcribe/{code}`, the current page.

## Jobs To Be Done

**Preserved from P1179**
- Give the host one voice-nameable control to point a room at, with nothing to advance or drive.
- Let an attendee reach any standing destination without hearing or memorising a URL.
- Let the host attach a per-event destination at publish time, with no UI form.
- Keep the stake surface a locked feed: no search, no tag cloud, no sort toggle, no Share a Story.

**Corrected**
- "Reachable from every room screen" becomes "reachable from every product surface". The room was
  never the boundary that mattered; it was the only place the control happened to be mounted.
- A person in a running transcription room needs **one** way to end it, not two.

**New**
- Read any of the nine public letters (`st1`–`st9`) from the menu.
- Reach `aisafety1` from the menu like any other standing collection. *(Adding a collection
  **without a code change or a deploy** was the original wording here; that job is DEFERRED with
  R4 — see Resolved Decisions 11 and `docs/process-learnings.md` INBOX-78. This spec does not
  deliver it, and nothing in it should be built as if it does.)*

## Current State

The menu is a `Links` button beside the avatar, mounted only where `linksMenuAppliesTo` is true. It
opens a bottom sheet below `lg` and an anchored dropdown at `lg` and up, both rendering ONE flat
list: the event's extras first under a "This event" heading, then the five standard tags, then a
separator, then three tools. **Eight** entries with no event extras configured (`buildLinksMenu`
with `extras = null` → 5 + 3); the "This event" heading renders above them only when the event has
links, which no prod event does.

`STANDARD_STAKE_TAGS` is a source constant: `['cmp7', 'cmp3', 'cmp10', 'understanding',
'misunderstanding']`. Adding a sixth requires a code change and a deploy.

**Before — `/events/:slug/room`, phone sheet:**

```
┌──────────────────────────────┐
│ Links                        │
│ THIS EVENT                   │   ← 0 of 14 prod events populate this
│  (nothing, always, today)    │
│ ──────────────────────────── │
│ [ cmp7                     ] │
│ [ cmp3                     ] │
│ [ cmp10                    ] │
│ [ understanding            ] │
│ [ misunderstanding         ] │
│ ──────────────────────────── │
│ [ Transcribe               ] │
│ [ Start a Clarity Session  ] │
│ [ Slides                  ↗] │
└──────────────────────────────┘

/stake/understanding          → no button at all
/stake/cmp7?event=clarity-night → button present
/transcribe/:code, /live      → no button (and the page's own header covers the nav)
/feed, /me, everywhere else   → no button
```

**Before — `/transcribe/:code`, running room:**

```
┌───────────────────────────────────────────────┐
│ ClarityPledge                  [→ End Session]│  ← page header
├───────────────────────────────────────────────┤
│ ● Transcribing for AI insights [Open][End session]│  ← capture bar, red at rest
├───────────────────────────────────────────────┤
│ ← Back                                        │
│ 1 in the room: …                              │
│ ● Listening — your words appear here …        │
└───────────────────────────────────────────────┘
        two ends; "Open" targets this page
```

## Root Cause

**1. Scope was defined by the trigger's original home, not by the contents.** `event-links.ts`
holds one predicate for two different questions — "does this location have an event?"
(`eventSlugFromLocation`) and "should the menu mount here?" (`linksMenuAppliesTo`). The second is
implemented in terms of the first, so a destination list that is event-independent inherits an
event-dependent mount rule. `/stake/:tag` shows this most sharply: the same page, same content,
menu present or absent purely on whether the URL carries `?event=`.

**2. The list is a compile-time constant.** `STANDARD_STAKE_TAGS` (`event-links.ts`) is a `const`
array. Its own comment already records that nothing enforces the list's length — *"A sixth standing
instrument is therefore a judgement call with no mechanical backstop: the design assumes a short
list under the thumb, and the only thing enforcing that is this comment."* Six standing collections
plus nine letters plus three tools is 18 entries; at eight entries the sheet already ran past the
top of a 320×568 phone and had to be capped (P1310). A flat list cannot hold this.

**3. The bar has one rule and the `/live` bar has a different one.** `clarity-landing-layout.tsx:146,150`
gates both `ActiveSessionBanner` and `RoomCaptureBarSlot` on `!isLivePage`, so neither renders on
`/live` or `/transcribe` from the layout. But `transcribe-room-page.tsx:337-339` mounts its own
`RoomCaptureBarSlot` inside the page. The implicit rule the `/live` bar follows — *a session bar is
a remote control for a session you are not looking at* — is not applied to the room's own page.

**4. The red is the odd one out, and the other two already agree.** Verified by reading all three:

| Where | Resting state | Hover | Height |
|---|---|---|---|
| `live-session-banner.tsx:80` (in `/live`) | `text-muted-foreground` | `text-destructive` + `bg-destructive/5` | `h-9` |
| `transcribe-room-page.tsx:326` (room header) | `text-muted-foreground` | `text-destructive` + `bg-destructive/5` | `h-9` |
| `session-bar.tsx:66` (the cross-page bar) | **`text-destructive`** | `underline` | `h-8` |

The bar is the only one red at rest, and it is the one that persists on every page for the whole
session, immediately beside a blue primary.

## Redesign

### R1 — One panel, three tabs

The menu opens as a single panel whose body is identical at every breakpoint: a segmented control
with **Points · Letters · Tools**, and the selected tab's entries below it. No drill-in, no back
button. The sheet-below-`lg` / dropdown-at-`lg` **chrome** split from P1179 is unchanged — that is
about how the panel is anchored, not what it contains.

Group names are the founder's, resolved in conversation 2026-09-16: *"instruments and tools sounds
similar, but actually instruments is a point collection... maybe we want to call it just points. So
we'll have points, letters, and tools."*

**After — any product surface, phone sheet:**

```
┌──────────────────────────────┐
│ Links                        │
│ ┌────────┬────────┬────────┐ │
│ │ Points │Letters │ Tools  │ │   ← segmented; Points selected by default
│ └────────┴────────┴────────┘ │
│ [ cmp7                     ] │
│ [ cmp3                     ] │
│ [ cmp10                    ] │
│ [ understanding            ] │
│ [ misunderstanding         ] │
│ [ aisafety1                ] │
└──────────────────────────────┘

Letters tab                      Tools tab
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ [ <letter 1 label>      st1] │ │ [ Transcribe               ] │
│ [ <letter 2 label>      st2] │ │ [ Start a Clarity Session  ] │
│ …nine, scrolls at 320px      │ │ [ Slides                  ↗] │
└──────────────────────────────┘ └──────────────────────────────┘
```

### R2 — Mounted on every product surface

The menu mounts wherever `SimpleNavigation` renders, **except** public marketing and landing pages.
It stays absent where there is no nav at all (immersive letter routes, `chromeFree`, `?embed=true`),
which needs no new rule — those routes render no nav to mount into.

`/transcribe/:code` and `/live` render their own sticky header over the nav, so the button must be
added to **those headers**, not only to the nav. This is an insertion point, not a config flag.

**The classification is compiler-enforced, not a list.** Founder, 2026-09-16: *"What I want is
minimizing future decisions or future mistakes when we create and modify pages... it needs to be
sustainable."* A deny-list and an allow-list both fail the same way — a route is added, the list is
not updated, and nothing says so.

One fact makes a better mechanism available. **`SimpleNavigation` has exactly one render site in the
codebase** — `clarity-landing-layout.tsx:140` (`grep -rn "<SimpleNavigation" src/ | grep -v tests`
→ one hit). The nav, and therefore the Links button, can only reach a page through
`ClarityLandingLayout`. So:

> `ClarityLandingLayout` takes a **required** prop `surface: 'product' | 'public'`. The menu mounts
> on `product` and not on `public`.

A new page cannot compile without answering. There is no list to update, nothing to remember, and
the decision sits in the same diff that creates the route — where whoever is writing it has the most
context. 69 existing call sites in `src/App.tsx` take the prop once, mechanically.

Values: `product` = anywhere someone is *using* the thing (feed, stake, sessions, letters, profile,
settings, event rooms). `public` = anywhere someone is *reading about* it (home, coach, founder,
hiring, manifesto, pricing, about, legal). Signed-out is not the test — an anonymous attendee on
`/stake/cmp7` is on a product surface.

**The prop is necessary and NOT sufficient — three exclusions it cannot express.** Found by two
independent adversarial passes, both verified by command:

1. **`/live` vs `/live/:code`.** Both routes render the *same component* inside a *bare*
   `<ClarityLandingLayout>` (`App.tsx:825, 837`). No prop distinguishes them, so `surface` cannot
   include one and exclude the other without writing `surface="public"` on a live two-party session
   — which is a lie about what that route is.
2. **The nav is not hidden on bespoke-header pages, only covered.** `SimpleNavigation`'s guard
   (`clarity-landing-layout.tsx:139`) is `!hasOwnNavigation && !isImmersiveLetterRoute` — `isLivePage`
   is **not** in it, and the file's own comment says the page's sticky bar *"overlaps this
   component's fixed SimpleNavigation"*. So on `/transcribe/:code` the nav still mounts a trigger.
   Adding a second one to the page header puts **two identical `data-testid="event-links-button"`
   nodes in the DOM** — the exact failure that broke `e2e/p1179-links-menu.spec.ts` with a
   strict-mode locator violation in 2026-08-28.
3. **A nested router asks nothing.** `/events/*` (`App.tsx:1014`) mounts `EventsPrototype`, whose own
   `<Routes>` carries **8** routes. They all inherit the one `surface` written at that call site; a
   ninth compiles silently. And they span both values — `/events/list` and `/events/:slug` are read-
   about-it pages, `/events/new` and `/events/:slug/edit` are authoring tools.

**Resolution — one owner, and pages opt out where they can see their own state.**

> **The Links trigger has exactly ONE owner: `SimpleNavigation`.** It renders when
> `surface === 'product'`. A page that draws its own chrome over the nav declares, from inside the
> page where its sub-state is visible, either **adopt** (the nav's trigger is portalled into that
> page's header — still one node) or **decline** (no trigger anywhere on that view).
>
> `/transcribe/:code` running-room view: **adopt**. `/live/:code`: **decline**. `/transcribe`'s join
> and ended views draw no bespoke header, so the nav serves them normally with no declaration.

This keeps the compiler asking the product/public question at page-creation time, and moves the
narrower call to the only place that can answer it. Precedent for the portal exists in this nav
already — `id="nav-center-slot"`, which `/terms` portals into (P1179 Invariant 2).

**Known gap, accepted and named:** the `/events/*` nested router still takes one `surface` for eight
routes. Either it threads its own per-route value or those eight are accepted as a block. Not
resolved here. *(`/architect` was skipped by founder decision, so `/dev` settles the mechanism —
this section is the contract it must satisfy, not a suggestion.)*

**`/live/:code` is excluded by founder decision, 2026-09-16.** Every menu entry except Slides is a
same-tab router navigation, and `/live`'s exit is deliberately singular: `live-session-banner.tsx:72-74`
— *"P779: Always route through `onExit()` so `terminate()` writes `sessionEnded=true`. The other
party's `subscribeToClaritySession` handler reads that write and navigates to `returnTo`"* — and
`clarity-live-page.tsx:530` records that there is no route-level guard (*"BrowserRouter doesn't
support `useBlocker`"*). A menu tap would leave the partner in a session that looks live and is not.
The `/live` lobby keeps the menu; `/live/:code` declines it.

layouts and want no menu.

### R3 — The nine letters

The Letters tab lists the nine sealed one-to-many letters that `resolve_letter_shortcode` serves.
Verified on prod 2026-09-16: `st1`–`st9` each resolve to a letter id; `st10` returns null. Entries
navigate to `/letter/<code>`, an internal path built in `event-links.ts`, never a URL from data.

**[FOUNDER DECISION: copy — nine labels]** `st1`–`st9` are internal taxonomy
([decisions.md](../docs/decisions.md): *"The `st1…st9` identifiers are an internal taxonomy; do not
surface them as primary labels on outward-facing surfaces"*), so each row leads with a phrase and
carries the code as a quiet suffix. The prototype's nine phrases were written by an agent from each
letter's own point statements and are **NOT approved copy**.

**Letters open in a NEW TAB, like Slides — this is not a style choice.** `/letter/<code>` matches
`IMMERSIVE_LETTER_PATH` (`immersive-letter-route.ts:17`), and two things follow that make a same-tab
navigation actively harmful:

1. **The nav is suppressed on immersive routes** (`clarity-landing-layout.tsx:139`), so the nine
   letters would be the only entries in the menu with **no way back into the menu** — a one-way trip
   out of the index, for exactly the person I-1 is written about.
2. **It silently pauses a running transcription.** `room-capture-context.tsx:679-688` computes
   `pauseLocation = shouldPauseForLocation(...) || isImmersiveLetterRoute(...)` and dispatches
   `PAUSE_REQUESTED` with `reason: 'location'`. The session bar renders only in
   `capturing`/`stalled`/`observing`, so it disappears too. **Failure sequence:** the host is running
   a room, taps Links → Letters → an entry; recording pauses, the bar vanishes, no nav, no menu, and
   the host believes the room is still recording.

That is the identical hazard class used to exclude `/live/:code` — *"a session that looks live and is
not"* — and R3 reproduced it on `/transcribe`. `newTab` is the pattern this repo already approved for
exactly this reason (`event-links.ts:93-97`, Slides: *"a same-document load would reach the deck but
tear down a live room to do it. The room stays running behind the new tab."*).

[FOUNDER DECISION: this changes letters from ordinary entries to new-tab entries. The alternative —
hiding Letters while a capture runs — makes the menu's contents depend on session state, which the
whole design avoids. Recommendation: new tab.]

**Measured constraint for that copy:** labels truncate at **both** phone widths, not only the
small one. Measured at `/tree/links-menu`: at 320×568 a label is cut at roughly 24–28 characters
("Shared belief vs common beli…", "Explain back without judgmen…") and the `stN` suffix is the first
thing lost; at 375×667 the cut is around 34 ("You cannot grade your own understa…"). Working budget
for the nine names: **~30 characters to stay whole on a normal phone, ~24 on a small one.**

### R4 — `aisafety1` joins the standing list; the data move is split out

`aisafety1` is added to `STANDARD_STAKE_TAGS` as one more literal. Verified on prod: 4 points and
8 stories, and it lives in the user `tags` column, not `system_tags` — `isSystemTag`
(`src/lib/feed-utils.ts:29-32`) matches only `^st\d+$`, `^v\d+$`, `understanding` and
`misunderstanding` — so the stake surface's existing branch already queries the right column and no
third code path is needed. That is the bar `event-links.ts`'s own comment set for adding a tag here.

**Moving the list out of source into founder-editable data is DEFERRED to its own spec**
(founder decision, 2026-09-16). Reasons, in order:

1. Adding the literal delivers the whole user-visible benefit today, at zero migration risk.
2. Everything else in P1323 is undoable by flipping one condition; a migration is not. Splitting
   keeps the reversible 90% of this spec off the irreversible 10%.
3. The deferred spec must own its own **write path**. "Editable without a deploy" is not delivered
   by a migration — a migration *is* a deploy. Whatever ships must give the founder a way to add a
   row that is not hand-written SQL against prod, and must hold I-4 by construction on that path.
4. The **letters** list has the same problem and is larger and growing (nine today, `st10` returns
   null). The deferred spec should cover both lists, not just the six tags — otherwise the shorter
   list gets the good ergonomics and the longer one keeps the friction.

**Not auto-derived from "tags the founder created", in this spec or the deferred one.** There is no
tags table and no author on a tag — a tag is a string a DB trigger extracts from any `#hashtag` in
content (`20260327084215_auto_extract_story_hashtags.sql`). "My tags" would resolve to every
incidental hashtag ever written. Curated, editable, explicit.

### R5 — "This event" is kept, and nothing is designed around it

The group renders above the segmented control when the event has links, exactly as today, and
**renders nothing at all — no heading, no separator — when it does not**, which is every event on
prod. P1179's "the event's own link goes FIRST" survives unchanged in that position: above the tabs
is first. The auto-hide-when-empty probe and its fail-open behaviour are untouched.

**It is kept because the capability may be wanted, not because it is free.** Keeping it is what
holds `eventSlugFromLocation`, the extras fetch, the emptiness probe, `PROBE_CAP`, the fail-open
branch, the separator logic and AC-6's two-event fixture alive, and it is why R1's panel has a
variable-height region above a fixed segmented control — which is the layout risk AC-3b tests.
[FOUNDER DECISION: keep the per-event group, or retire it and simplify all of the above?]

### R6 — The session bar hides on the page it points at

**Outcome required:** on `/transcribe/:code`'s running-room view, no session bar renders — not in
flow, not as an overlay. The page header keeps its "End Session". P1307 D9 ("capture never runs
with no indicator") is **satisfied, not weakened**: the room page carries its own
`transcribe-listening-indicator` and live transcript, which is a stronger indicator than the bar.
The bar is unchanged on every other page.

**[ARCHITECT DECISION — and read this before touching it.]** *Simply deleting the page's
`RoomCaptureBarSlot` (`transcribe-room-page.tsx:338`) does the opposite of what it looks like.*
`RoomCaptureBarFallback` is mounted app-wide at `src/App.tsx:318` and renders whenever
`barSlotCount === 0` (`room-capture-bar.tsx:60`). The layout's own slot is already gated off for
this route (`clarity-landing-layout.tsx:150`, `!isLivePage`, and `isLivePage` covers
`/transcribe/`), so the page's slot is the **only** one on this route. Remove it and the count
drops to zero, the fallback fires, and the same bar returns as a `sticky top-0 z-[45]` overlay —
the duplicate relocated, not removed, and AC-9 failing.

D9 was deliberately built as a rule rather than a route list (`room-capture-bar.tsx:53-58`), so the
fix should not introduce one. Preferred shape: let the page register a **claimed-but-silent** slot,
so `barSlotCount > 0` holds while nothing is drawn. Rejected: a route check inside the fallback —
it re-introduces exactly the list D9's own docstring rejects, and the next page with its own header
reproduces this bug. **AC-9 must be verified in a browser with a capture actually running**; jsdom
does not lay out `position: sticky`, so a unit test cannot see the failure mode this note describes.

**After — `/transcribe/:code`:**

```
┌───────────────────────────────────────────────┐
│ ClarityPledge      [Links] [→ End Session]    │
├───────────────────────────────────────────────┤
│ ← Back                                        │
│ 1 in the room: …                              │
│ ● Listening — your words appear here …        │
└───────────────────────────────────────────────┘
```

### R7 — One End Session treatment

`session-bar.tsx`'s secondary action adopts the treatment the other two already share: neutral at
rest, destructive on hover and focus. It also picks up the `LogOut` icon and `h-9` the other two
carry.

**`SessionBar` has TWO consumers, and this change reaches both** (`grep -rn "<SessionBar" src/`):
`room-capture-bar.tsx:31` (the transcription bar) and `live-session-bar.tsx:55`, which is
re-exported as **`ActiveSessionBanner`** (`active-session-banner.tsx:6`) and mounted at
`clarity-landing-layout.tsx:146` — the cross-page `/live` bar. That fourth control is therefore
**in scope, deliberately**: R7's own rationale (red is wrong as a resting state in a bar that
persists for a whole session beside a blue primary) applies to it verbatim, and the alternative —
parameterising `SessionBar` so only one consumer changes — would invent the fourth treatment this
requirement exists to remove. Four controls, one treatment.

**Rationale, since this reduces a warning colour:** destructive-red is right at the moment of
action and wrong as a resting state in a bar that persists for the entire session next to a blue
primary. The other two controls already made this call; this aligns the third with them rather than
inventing a fourth treatment.

## Predecessor Sections Superseded

| Section | P1179 said | Status | Replaced by |
|---|---|---|---|
| **Invariant 3** | *"The nav's right-hand group renders on every route. Any change to it is scoped to the room... it must not alter layout on any route outside `/events/:slug/*`."* | **Superseded — needs explicit founder sign-off** | R2. The scoping clause is deliberately removed. The layout-safety half is carried forward as Invariant **I-3** below. |
| Problem Statement | *"where does it live so it is reachable from every room screen"* | Partially superseded | Problem Statement above — room scope becomes product scope |
| UI Contract / Solution §2 | flat list: extras, then standard tags, separator, then tools | Superseded | R1 — three tabs |
| Resolved Decision 1 / 1b | the five standard entries and their flat grouping | Superseded in grouping, preserved in labelling | R1 + R4. Labels are still the tags themselves; the group they sit in is now named "Points" |
| AC "menu lists exactly `cmp7`, `cmp3`, Transcribe, Start a Clarity Session — `cmp10` is absent" | exact flat-list assertion | Already superseded before this spec | `cmp10`, `understanding`, `misunderstanding` were restored 2026-09-07; this spec adds `aisafety1`. Becomes per-tab assertions (AC-4) |
| AC "an event with one configured extra shows five entries; a second with none still shows exactly four" | count-based | Superseded | AC-6 — additivity and per-event isolation preserved, counts re-derived |
| AC "At phone width... a bottom sheet, not a dropdown" / "At desktop width... anchored panel" | two shapes | Partially superseded | R1 — the chrome split stands, the content-divergence premise does not |
| P1179 §"present on `/room`, `/ready`, `/meet` and the stake routes" | route-scoped mount | Superseded | R2 |
| **decisions.md 2026-08-28 [product]** + P1179 Resolved Decision 2 | *"a bare `/stake/:tag` is a usable, handable cut-down feed with **no button** and no event context"* | **Superseded — needs explicit founder sign-off** | AC-1. Read cold, that sentence describes the *consequence* of the chosen architecture (*"the button has no way to know it is in an event, so it disappears"*, Alternatives rejected (b)) rather than asserting the bare page should lack a menu — and decisions.md 2026-09-07 already moved toward *"scoped to a surface, not to an event"*. It is still a recorded decision being reversed, so it is named here rather than assumed. |
| **P1307 D9 implementation** | `transcribe-room-page.tsx` mounts its own `RoomCaptureBarSlot` | Superseded | R6. D9's *rule* is preserved; its application to the room's own page is not |

## Invariants

Carried forward from P1179 in full, additive-only. Nothing below may be dropped without founder
approval; two are restated with their scope corrected by this spec.

- **I-1. The Links control must be reachable at 320px, and may never be hidden at any width.**
  Unchanged from P1179. It is the only means of moving between destinations during a live event.
- **I-2. The nav centre slot stays absolutely positioned and is not touched.** Unchanged.
- **I-3. Adding to the nav's right-hand group must not alter layout on any route.** This is P1179's
  Invariant 3 with its "scoped to the room" clause removed by R2 and its layout-safety requirement
  *widened*: the button now appears on most of the routes where the nav renders, instead of 4 — so the geometry
  requirement applies to all of them rather than being satisfied by absence. **The exact number is
  not yet knowable**: `src/App.tsx` carries 97 `path=` entries including wildcards and 13 dev-only
  `/tree/*` prototypes, and the marketing set is not yet enumerated (R2). P1179 estimated "~30
  routes" for the same population. Do not quote a figure until R2's list exists.
- **I-4 (security). Menu entries resolve to internal paths only — never an arbitrary or external
  URL.** This is P1179's DW-3 and P1310 restated it for Slides. **In THIS spec the guarantee is unchanged** — a
  standard entry's path is still a literal in `event-links.ts` and an extra still carries a bare tag
  validated by `isSafeTag`, so `aisafety1` adds no new input path. **The stakes rise in the
  DEFERRED data spec** (R4), which adds a second operator-writable input to the same code path:
  there the guarantee must still hold by construction — a data row supplies a **tag**, never a path
  or URL. Recorded here so the deferred spec inherits it rather than rediscovering it.
- **I-5. Ordering on the stake surface is oldest-first, sorted at the database.** Unchanged.
- **I-6. A position click must not trigger a list refetch.** Unchanged.
- **I-7 (new). Capture never runs with no indicator on screen.** P1307 D9, carried forward. R6
  satisfies it via the room page's own listening indicator; any change that removes that indicator
  re-breaks D9 and must restore the bar.

## What Stays the Same

- The stake surface itself: locked feed, no search / tag cloud / sort toggle / Share a Story, Back
  button behaviour, tabs only when there is content, opted-out attendees can still stake.
- `?event=` continues to ride along on stake paths when there is an event. A bare `/stake/:tag`
  keeps its **content and behaviour** exactly as today — what changes, deliberately, is that it now
  carries the menu (see the superseded row above; its absence was the recorded property).
- The per-event extras data shape `{tag, label?}`, the auto-hide-when-empty probe, and its
  fail-open-on-error behaviour.
- The bar on every page other than `/transcribe/:code` — same text, same Open, same placement.
  Its End Session *styling* changes with R7; nothing else about it does.
- `/live`'s own in-session banner and `/transcribe`'s header End Session **behaviour**; only the
  bar's *styling* moves toward them.
- `/presi` opening in a new tab (P1310) — deliberate, keeps a live room running behind the deck.
- Mixpanel events `event_links_opened` / `event_links_entry_clicked`.

## Surfaces in Scope

**In scope**
- `src/app/data/event-links.ts` — mount predicate, group model, letters, `aisafety1` added as a
  literal (**not** a data-sourced list — that is deferred, R4)
- `src/app/components/layout/event-links-menu.tsx` — segmented panel
- `src/app/components/layout/simple-navigation.tsx` — mount rule
- `src/app/layouts/clarity-landing-layout.tsx` — the required `surface` prop
- `src/App.tsx` — 69 call sites take `surface`, once
- `src/app/pages/transcribe-room-page.tsx` — stop the bar rendering here **without** simply deleting
  the slot (R6 explains why that backfires); add the Links trigger to the header
- `src/app/components/session/room-capture-bar.tsx` — the claimed-but-silent slot shape R6 needs
  (`RoomCaptureBarSlot` and the fallback both live here)
- `src/app/components/session/session-bar.tsx` — secondary action treatment (**shared by two consumers**)
- `src/app/components/session/live-session-bar.tsx` / `active-session-banner.tsx` — the cross-page `/live` bar, which inherits R7's change
- `src/app/data/short-links.ts` or successor — letter shortcode → path mapping
- Tests: `src/tests/p1179-links-menu.test.tsx`, `p1179-nav-containment.test.tsx`,
  `p1179-entry-safety.test.ts`, `p1179-design-system-reuse.test.ts`,
  `src/tests/p1307-room-capture-bar.test.tsx`, `e2e/p1179-links-menu.spec.ts`,
  `e2e/p1179-links-navigation.spec.ts`
- `src/app/pages/prototypes/links-menu-prototype.tsx` + `/tree/links-menu` route (already created)

**Out of scope**
- Moving the standing list (or the letters list) into data, and any write path for it — deferred to its own spec per R4
- `/live/:code`'s in-session header — excluded per R2
- `src/app/pages/stake-page.tsx` — the destination is unchanged
- The feed, its filters, and `/feed/:tag`
- The event publish flow and any UI for editing `events.links`
- The letters themselves: content, sealing, reading page, `resolve_letter_shortcode`
- The bar's text, its Open action, and its behaviour on every page except `/transcribe/:code`
- The two P1310 follow-ups still open: the sheet is not a real dialog (no role, focus trap or
  Escape), and `buildLinksMenu` does not dedupe repeated custom tags. Both pre-date this spec.

## Acceptance Criteria

- [ ] AC-1: `/stake/understanding` with **no** `?event=` shows the Links button, and it opens the
      same panel as inside a room.
- [ ] AC-2: The button is present on `/transcribe/:code` (running room) inside that page's own
      sticky header, at 320px, 375px and desktop, overlapping neither the logo nor the End Session
      control — and appears **exactly once in the DOM** on that route (see R2's duplicate-trigger
      hole). `/live/:code` is excluded; see AC-11c.
- [ ] AC-3: The panel body is a segmented control labelled Points · Letters · Tools, with the same
      three tabs and the same entries at 320px, 375px and desktop.
- [ ] AC-3b: At **320×568, in a browser**, with an event configured so the "This event" group is
      also present, the **ninth** letter row is reachable and the panel title stays on screen.
      P1310 capped this sheet after the 8th entry ran to −83px, and recorded that *jsdom performs no
      layout* — so a unit test cannot close this one.
- [ ] AC-4: The Points tab lists exactly the configured standing collections — `cmp7`, `cmp3`,
      `cmp10`, `understanding`, `misunderstanding`, `aisafety1` — and nothing else.
- [ ] AC-5: The Letters tab lists nine entries; each opens its letter, and an **anonymous** visitor
      (no session) can read the one it opens.
- [ ] AC-6: An event configured with one extra shows it above the tabs under "This event"; a second
      event with none shows **no heading and no separator** — verified against both, so the
      assertion has teeth in each direction.
- [ ] AC-7: `aisafety1` appears in the Points tab and its entry opens a non-empty stake surface.
      *(The "no source-code change" criterion moves to the deferred data spec — see R4.)*
- [ ] AC-8 *(regression guard — I-4 already holds by construction; nothing in this spec adds an
      input to it, so this is a tripwire for the deferred data spec, not a test of new surface)*:
      An entry whose stored value is `https://evil.com`, `//evil.com` or `../../admin` never
      produces a navigable external destination (I-4). Includes a **known-good control** through
      the identical path, so a probe that rejects everything is distinguishable from one that works.
- [ ] AC-9: On `/transcribe/:code`, **with a capture actually running**, the running-room view shows
      exactly one End control, no "Open" button, and the listening indicator. Verified **in a
      browser** — jsdom does not lay out `position: sticky`, so a unit test cannot see the failure
      mode R6 describes.
- [ ] AC-9b: The same route's **join** sub-state, while a capture runs in another tab (phase
      `observing`), does not strand the person with a bar carrying Open + End and no indicator.
      R6's outcome is scoped to the running-room view; this names what happens either side of it.
- [ ] AC-10: On `/feed` while a capture runs, the bar still renders with its Open and End actions.
- [ ] AC-11: `ClarityLandingLayout` requires `surface`, proven by the failure path: removing the
      prop from one call site fails `npx tsc --noEmit` with a non-zero exit (paste it). Plus a
      render check in both directions — a `public` route has no button, a `product` route does.
- [ ] AC-11b: `grep -rn "<SimpleNavigation" src/ | grep -v tests` still returns exactly **one**
      render site, so the chokepoint has not been duplicated. *(The filter is load-bearing: without
      it the command returns 63 today, on unmodified code — a gate that fires on its own baseline
      is a gate that gets waived.)*
- [ ] AC-11c: `/live/:code` has **no** Links button; the `/live` lobby does.
- [ ] AC-12: **Four** controls render the same resting treatment and none is `text-destructive` at
      rest: the room-capture bar, the cross-page `/live` bar (`ActiveSessionBanner`), `/live`'s
      in-session banner, and `/transcribe`'s header.
- [ ] AC-13: Surfaces not in scope are visually unchanged — `/stake/:tag`'s body, `/feed`, the
      letter reading page. **The cross-page `/live` bar is excluded from this AC** — it is in scope
      per R7 and its resting treatment changes by design.
- [ ] AC-14: Every P1179 and P1307 test either still passes or has been **rewritten with its
      reasoning updated in the same commit**. Specifically, these encode behaviour this spec
      deliberately inverts and must not simply be deleted:
      `p1179-nav-containment.test.tsx` *"P1179 DW-1 — the button does not leak outside the room"*,
      `p1179-links-menu.test.tsx` *"renders NOTHING outside an event context — a bare /stake/:tag
      has no button"*, and *"lists the five approved labels verbatim, and nothing else"*.
      Baseline before any change: 57/57 green across
      `p1179-links-menu`, `p1179-nav-containment`, `p1307-room-capture-bar`.
- [ ] AC-14b: The **56 further green tests inside this change's blast radius** also pass or are
      rewritten with reasoning: `p1179-entry-safety`, `p1179-design-system-reuse`,
      `p1179-stake-surface`, and **`p1310-mobile-nav`** — which is in neither AC-14's scope nor the
      Surfaces list, yet reads `event-links-menu.tsx` as source text and asserts the sheet's
      structure (`:183-189`, `data-shape="sheet"` … `<nav className="…overflow-y-auto`). R1 inserts a
      segmented control between those two markers. Plus the two e2e specs.
- [ ] AC-15: Regression for the original defect — from a cold `/feed`, the founder can reach `cmp7`,
      a letter and `/transcribe` without typing a URL, **and after opening a letter the room is still
      recording and the menu is still reachable** (the second hop is the one R3's new-tab decision
      exists for; an AC that stops at the first hop is blind to it).

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|---|---|---|---|
| 1 | /challenge-prd | [BLOCK] R6's stated mechanism produces the opposite of AC-9 — deleting the page's slot drops `barSlotCount` to 0 and fires `RoomCaptureBarFallback` (`App.tsx:318`), relocating the bar to a sticky overlay | R6 rewritten: states the required outcome, names the trap, routes the mechanism to `/architect` with a preferred shape (claimed-but-silent slot) and a rejected one (route check in the fallback) | Verified independently: `App.tsx:318`, `room-capture-bar.tsx:60`, `clarity-landing-layout.tsx:150`, and only two `RoomCaptureBarSlot` mounts exist |
| 2 | /challenge-prd | [BLOCK] `session-bar.tsx` has **two** consumers, so AC-12 (three controls) and AC-13 (out-of-scope unchanged) contradicted each other on the cross-page `/live` bar | `ActiveSessionBanner` brought into scope deliberately; AC-12 now names four controls; AC-13 explicitly excludes it | R7's own rationale applies to it verbatim; the alternative (parameterise `SessionBar`) invents the fourth treatment R7 exists to remove |
| 3 | /challenge-prd | [BLOCK] AC-1 reverses a recorded decision (*"a bare `/stake/:tag` … with no button"*) not named in the superseded table | Supersession row added, with the cold reading of the original entry; flagged for founder sign-off | Verified verbatim in decisions.md 2026-08-28 [product], "the locked stake surface is a GLOBAL route, not a page nested under an event". Read cold it describes a consequence of the architecture, not a desirability claim — but it is still a reversal |
| 4 | /challenge-prd | [WARN] Current State said "nine entries"; `buildLinksMenu(null)` produces eight | Corrected to eight, with the arithmetic shown | The spec's own ASCII listed eight, and Root Cause 2 already said "at eight entries" |
| 5 | /challenge-prd | [WARN] I-3's "~60 routes" was an estimate presented as a measurement | Replaced with the 97-`path=` count, the P1179 "~30" prior, and an instruction not to quote a figure until R2's list exists | Neither number is derivable without the marketing set |
| 6 | /challenge-prd | [WARN] No AC tested I-1 (reachable at 320px) against the new worst case | AC-3b added: ninth letter reachable at 320×568 **in a browser**, with the event group present | P1310 recorded that jsdom performs no layout |
| 7 | /challenge-prd | [WARN] R5 justified keeping "This event" with "it costs nothing", which is untrue | Replaced with what keeping it actually holds alive, plus a FOUNDER DECISION marker | Six mechanisms and one layout risk depend on it |
| 9 | founder 2026-09-16 | [BLOCK-4] "every product surface" had no testable boundary and no artifact | `ClarityLandingLayout` gains a **required** `surface: 'product' \| 'public'` prop; no list anywhere | Founder asked for sustainability over a one-off review: *"minimizing future decisions or future mistakes when we create and modify pages."* `SimpleNavigation` has exactly one render site, so the layout is a real chokepoint and the compiler can ask the question at page-creation time |
| 10 | founder 2026-09-16 | [WARN-6] `/live/:code` would gain a menu whose entries navigate away without `onExit()`, stranding the partner | `/live/:code` excluded; the `/live` lobby keeps the menu | P779's exit path is deliberately singular and there is no route-level guard (`clarity-live-page.tsx:530`). The founder's own complaint named stake and transcribe, never `/live` |
| 11 | founder 2026-09-16 | [BLOCK-5 / WARN-4 / WARN-5] The data migration made the whole spec irreversible and its write path was unassigned | R4 reduced to adding `aisafety1` as a literal; the data move deferred to its own spec, which must cover the letters list too and own its write path | Keeps the reversible 90% off the irreversible 10%; the literal delivers the entire visible benefit today |
| 8 | /challenge-prd | [NOTE] I-4 already holds by construction — `isSafeTag` rejects all three AC-8 payloads and `stakePath` is the only tag→path constructor | No change; R4's "a data row supplies a tag, never a path" is the right constraint | Confirmed at `event-links.ts:42-46` |

| 12 | adversarial round 2 (Gemini 3.8 + Opus, 2/2 reported) | [BLOCK] `surface: 'product' \| 'public'` cannot express three exclusions: `/live` vs `/live/:code` (same component, same bare layout), the covered-but-mounted nav on bespoke-header pages (two identical triggers in the DOM), and a nested router whose 8 routes inherit one value | R2 rewritten: one owner (`SimpleNavigation`), pages with their own chrome **adopt** via portal or **decline** from inside the page. `/events/*`'s 8 routes named as an accepted gap | Both reviewers found it independently; verified by command — `App.tsx:825,837`, `clarity-landing-layout.tsx:139` (guard omits `isLivePage`), `prototypes/events/index.tsx` (8 routes) |
| 13 | adversarial round 2 (Opus) | [BLOCK] R3's nine letters open immersive routes that suppress the nav **and pause a running capture** — a one-way trip out of the menu, with the room silently no longer recording | Letters open in a new tab, the pattern already approved for Slides. Flagged FOUNDER DECISION | Verified: `immersive-letter-route.ts:17`, `clarity-landing-layout.tsx:139`, `room-capture-context.tsx:679-688`. Same hazard class the spec used to exclude `/live/:code`, reproduced on `/transcribe` |
| 14 | adversarial round 2 (both) | [BLOCK/WARN] Four leftovers from the round-1 rewrite: AC-2 still demanded the button on `/live/:code`; the JTBD and a scope line still promised the deferred data work; a scope line still said "remove the bar slot" that R6 proves backfires; I-4 described a migration no longer in the spec | All four corrected | Editing slips, not design errors — and exactly what a second pass on rewritten sections is for |
| 15 | adversarial round 2 (Opus) | [WARN] AC-11b's own command returns 63 on unmodified code; counts stated as 71 call sites and 13 `/tree` routes are 69 and 15; the superseded table pointed at I-2 where it meant I-3 | All corrected | `grep -rn "<SimpleNavigation" src/ \| wc -l` → 63; `grep -c "<ClarityLandingLayout" src/App.tsx` → 69; `grep -c 'path="/tree/' src/App.tsx` → 15 |
| 16 | adversarial round 2 (Opus) | [WARN] AC-9 passes vacuously with no capture running, and 56 green tests sit inside the blast radius owned by no AC | AC-9 now requires a running capture and a browser; AC-9b covers the join sub-state; AC-14b names the 56 | `p1310-mobile-nav` asserts `event-links-menu.tsx`'s sheet structure as source text, and R1 inserts a control between its two markers |
| 17 | adversarial round 2 (Opus) | [NOTE] AC-8 now tests shipped code this spec does not touch — R4's deferral removed the only new input | Kept, relabelled as a regression guard rather than a new-surface test | I-4 holds by construction today (`isSafeTag`); the criterion is a green light with nothing under it until the deferred spec lands |
| 18 | adversarial round 2 (Opus) | [NOTE] The approved-reference prototype is untracked, and `/dev` defaults to a worktree where it would not exist | Commit the prototype and its route before `/dev` | `git status --short` → `?? src/app/pages/prototypes/links-menu-prototype.tsx` |

**Verified additionally while resolving:** `aisafety1` lives in the user `tags` column (4 points,
8 stories on prod) and **not** `system_tags` — `isSystemTag` (`src/lib/feed-utils.ts:29-32`) matches
only `^st\d+$`, `^v\d+$`, `understanding` and `misunderstanding`. So the stake surface's existing
`isSystemTag` branch already queries the right column for it, and it needs no third code path — the
bar P1179's own comment set for adding a tag to this list.

## Open Questions

1. **The nine letter labels.** Founder copy required (R3). Blocks AC-5's final wording, not the build.
2. **Does a standing collection get an optional display label,** or do labels stay identical to the
   tag? P1179 Resolved Decision 1 says the spoken word and the rendered label must match; `aisafety1`
   is the first tag where that reads awkwardly. [FOUNDER DECISION]
3. ~~Allow-list or deny-list for the mount rule~~ — **resolved**, see Resolved Decisions 9: neither.
   A required `surface` prop on the layout.
4. **Does the per-event "This event" group stay?** (R5) It has never rendered an entry on prod and
   keeps six mechanisms alive. Keeping it is fine; the spec just no longer claims it is free.

## Next Steps

`/challenge-prd` has run once (verdict CHALLENGE, 5 BLOCK / 7 WARN) and all eleven items are
resolved in the table above — two by correcting the spec's model of the code, three by founder
decision, the rest by tightening criteria.

**Re-run `/challenge-prd` on the revised R2, R4, R6, R7 and Acceptance Criteria before
`/architect`.** The first pass found two mechanism errors by grep in under a minute; the revised
sections have not been through it. Then `/architect`, whose remaining questions are: the
claimed-but-silent slot shape for R6, and how `surface` threads to `EventLinksMenu`.
