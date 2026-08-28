---
status: week
type: story
rank: 79
workstream: events
created_date: '2026-08-28'
tags: [events, room, navigation, cmp]
delivery_stage: create-spec
pipeline_ran: [create-spec]
pipeline_plan: [create-spec, generate-tests, dev, verify]
pipeline_skipped: [challenge-prd -- founder declined 2026-08-28, see Pipeline note, ux -- settled by the 2026-08-28 prototype pass, architect -- placement + schema shape decided in spec, decompose -- 3 concerns, under the 5-file trigger]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1179: The event room "Links" menu and the locked stake surface

## Problem

**Situation:** The event room ships as three routes — `/events/:slug/room`, `/ready`, `/meet`
(`src/App.tsx:954-956`). The instrument it exists to run is ten Points tagged `cmp10` plus `cmp7`
or `cmp3` ([P1055](p1055_norm_measurement_instrument.md)), reachable today only at
`/feed?tag=cmp7&sort=oldest`. `/transcribe` shipped separately
([P1149](done/2026-06-10/p1149_live_room_transcription_chat.md)) and is reachable only by its own URL.

**Complication:** [P1161](p1161_first_physical_event_chiang_mai.md)'s run-of-show sends the room to a
different destination at blocks 5, 7 and 8, and the host does not know in advance which. Today that
means saying a URL out loud to a room of strangers. Founder, verbatim:

> "I don't know at which point I want them to click, but I want to tell them, oh, now go here and
> click, right? And there are many options that I wish to guide them to, for example, CMP7, CMP3,
> CMP10... if I say go to the menu or the short links thing and then select the CMP7, that's much
> easier."

Separately, `/feed` is the wrong surface to send them to: it carries a search box, a tag cloud, a
sort toggle and a Share a Story button, none of which belong in a room being run to a script.

**Question:** What does the host point at with their voice, where does it live so it is reachable
from every room screen, and what does it open onto?

## Appetite

**Blast radius: medium-high.** The menu mounts into the shared navigation component that ~30 routes
render (`decisions.md` 2026-07-01, `:7124`), and the work adds a column to `events`, which every
event reads. The stake surface itself is additive — a new route touching no existing one.

**Reversibility: medium.** Code reverts; the column needs a migration to drop but is nullable with a
default and harms nothing if orphaned.

**Decision density: low — the founder decisions were taken in the filing conversation** and are
recorded below. What remains is entry copy.

## Invariants

- **The Links control must be reachable at 320px. It may never be hidden at any width.** It is the
  only means of moving between destinations during a live event, so the mitigation available to
  decorative nav content is not available here. This is not hypothetical: `simple-navigation.tsx:397-405`
  records that `/terms`' level track, portalled into the nav centre slot, could not fit at 320px once
  logo and avatar clearance was reserved — *"their min-content width alone exceeds the slot's total
  available space"* — and was fixed **on the consumer side by hiding the portal below 375px**
  (`EventRoomMeet.tsx`). Found during the P1179 prototype pass, 2026-08-28; it is why placement B
  below was chosen over the centre slot this spec originally proposed.
- **The nav centre slot stays absolutely positioned, and this work does not touch it.**
  `SimpleNavigation` renders a permanent `id="nav-center-slot"` (`simple-navigation.tsx:178`, `:407`)
  whose absolute positioning is load-bearing, not styling — it takes no part in the nav row's flex
  layout, so the ~30 routes that portal nothing cannot have their logo or right-hand group shifted. A
  `flex-1` slot was explicitly rejected ([decisions.md](../docs/decisions.md) 2026-07-01). The Links
  button lands in the right-hand group instead; the slot must be left exactly as it is.
- **The nav's right-hand group renders on every route. Any change to it is scoped to the room.**
  Adding a sibling to that group is the one part of this work with reach beyond the event, and it must
  not alter layout on any route outside `/events/:slug/*`.
- **Menu entries resolve to internal paths only.** Never an arbitrary or external URL. This mirrors
  the guard already in `short-link-redirect.tsx` ("only allow relative paths (prevent open
  redirects)") — a per-event, operator-writable destination list is exactly the shape that turns
  into an open redirect if the constraint is dropped.
- **Ordering on the stake surface is oldest-first, sorted at the database.** The instrument's
  ordering is load-bearing and must not be reordered ([P1055](p1055_norm_measurement_instrument.md));
  the sort happens at DB level, never as a client-side array reversal
  ([decisions.md](../docs/decisions.md) 2026-03-13, `:20353`).
- **A position click must not trigger a list refetch.** `onPositionChange={fetchData}` was
  deliberately removed from the feed because optimistic state in the card already adjusts counts and
  the refetch caused a loading flash on every click ([decisions.md](../docs/decisions.md), `:20377`).
  The stake surface must not reintroduce it.

## Solution

### 1. A "Links" button, in the same place on every room screen

A button labelled **Links** rendered as a sibling of the avatar in the nav's existing **right-hand
group**, on the event room routes only. It opens a list of destinations. It is **static for the
entire event** — the host never advances or changes anything during the room.

That is the whole point of the design, and it is why an earlier "host advances the current block"
proposal was rejected in conversation: the founder does not want to drive, they want a stable thing
to point at with their voice — *"go to the menu and select the CMP7."*

Present on `/events/:slug/room`, `/ready`, `/meet` and the stake routes below.

**Placement decided 2026-08-28 (founder), after a prototype pass at literal widths.** The right-hand
group is a normal flex row, so the button and the avatar negotiate space with each other; nothing
overlaps at 320px. Two alternatives were built and rejected:

- **The nav centre slot** — this spec's original proposal. Rejected: it is centred on the viewport
  rather than on the gap, so at 320px the button drifts under the avatar. This is the documented
  `/terms` collision, and the fix used there (hide below 375px) is forbidden by the invariant above.
- **Centre slot on wide, right group on narrow** — rejected: the control would move depending on
  which phone the attendee brought, which defeats the one property the design exists to provide.
  It also carries both placements' code.

**The button must be built from the existing design system**, not styled ad hoc — founder,
verbatim: *"needs to follow our design please."* The room already has the tokens it should use:
`PRIMARY_BUTTON_CLASS` and `ANSWER_BUTTON_CLASS` (`meeting-terms-page.tsx:96`, `:145`) carry the
navy `#002B5C` treatment and the 44px minimum target the room's other controls use, and the shared
`Button` component is what every other control in `EventRoomGate`/`Meet` is built from. Do not
introduce a new colour, radius or height for this control.

Room routes mount `compact`, not `logoOnly` — verified against `simple-navigation.tsx:340` (the
`logoOnly` early return) versus `:360` (the branch `compact` takes), so the right-hand group is
present and rendered on these routes. `EventRoomMeet` portals nothing into the nav today (checked:
no `createPortal` or `NAV_CENTER_SLOT_ID` reference in that file), so there is no existing occupant
to displace.

### 2. Entries: four standard, plus optional per-event extras

Every event gets the same four with zero setup, because they are global content identical at every
Clarity Practice event: **Transcribe** (`/transcribe`), **`cmp7`**, **`cmp3`**, **`cmp10`**.

Scope is **all events, no organization gating**. Founder, verbatim: *"right now I would say all
events it doesn't really matter."* Org-scoping was raised and explicitly deferred — *"once we have
organizations we might say only in my organizations, or maybe not."*

Extras are **optional and added programmatically at publish time**, not through a UI form. Founder:
*"for some we might add additional ones programmatically when we publish the event, I could say add
one more link... not every event will add new links, so per default the event has only standard
links."* `/slava:events:publish-event` already writes the event row via the REST API, so that is the
insertion point.

**VERIFIED — this needs a schema change.** `supabase/migrations/20260118_create_events.sql:7-31`
defines `events` with id, slug, title, description, datetime, duration_minutes, timezone, location,
host_id, max_attendees, created_at, status; `20260223140000_p416_event_banner_url.sql` adds
`banner_url`. There is **no** field that could hold a link list. An earlier claim in this session
that adding a per-event link was free was **wrong and was corrected to the founder before filing.**

Proposed shape: a nullable JSONB column defaulting to `[]`, holding `{label, tag}` entries. A tag
rather than a path is what keeps the open-redirect invariant enforceable by construction.

### 3. The stake surface — the feed with things removed

A new route inside the event, so the Links button persists on it and the room can move to the next
destination without going back first. Founder confirmed the reading directly: *"Is it like feed but
already one tag selected and I cannot search, and I cannot change the sorting and I cannot share a
story? It's basically this."*

**Removed:** search box, tag cloud, sort toggle, Share a Story button, the "Home" title.
**Kept:** the point cards with their position buttons, fixed oldest-first.
**Tabs:** a tab renders only if it has content. `cmp7`/`cmp3` are Points only, so no tabs appear
there; a per-event topic tag may carry both. Founder: *"a tab is only visible if stories are there."*
Both services already accept a tag — `getPublicStoriesFeed(limit, offset, tag?, ascending?)`
(`stories-service.interface.ts:75`) — so this is answerable by query, not inference.

**No progress counter and no done screen.** Explicitly deferred. The host asks "everyone done?" out
loud, and `/meet`'s roster already shows who has answered.

Because exactly one tag is always active here, this hits the server-side filtered path that
[P1075](done/2026-06-10/p1075_feed_tag_filter_client_side_only.md) wired up, not the client-side
fallback that only handles multi-tag URLs.

### 4. Who can stake

Everyone in the room, including people who opted **out** of the Clarity Meeting Principle at `/meet`.
Founder, verbatim: *"everybody can stake, exactly like in feed."* Opting out of the principle is not
opting out of being measured; opt-in status is already recorded per person, so the two groups can be
separated in analysis afterwards.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Adding a sibling to the nav's right-hand group shifts layout on the ~30 routes that render it | MITIGATE | Scope the addition to `/events/:slug/*`; assert unchanged nav geometry on a route outside the room |
| The button is unreachable or overlapping at 320px — the failure the centre slot already had | MITIGATE | Placement B was chosen for this reason; verify at literal 320px, and remember `resize_window` can silently no-op (`.claude/rules/browser.md`) — confirm `window.innerWidth` before trusting the screenshot |
| The stake surface forks `feed-page.tsx` and the two diverge | MITIGATE | Reuse the same card components and the same services; do not copy the page |
| Opted-out attendees staking mixes two populations in the instrument's data | ACCEPT | Founder decision. Opt-in status is recorded per person and the groups are separable after the fact; an idle observer damages the event more than mixed data damages the reading |
| Transcribe in the menu pulls attention during the fishbowl | ACCEPT | Founder decision — the entry is present but **not announced out loud at event #1**; whether anyone reaches for it unprompted is itself the finding |
| A per-event tag with no Points yet renders an empty surface mid-event | MITIGATE | Reuse the feed's existing empty state; the operator sees it when setting the link, before the event |
| `P1161:204-207` and `docs/events/clarity-practice-event.md` currently call `/feed/cmp7` "the room's URL" — that stops being true | MITIGATE | Update both in this spec's scope; do not leave a stale pointer |
| The extra-links column is never populated because nothing prompts the operator | ACCEPT | Default `[]` is the correct behaviour for most events by design |

**Non-Goals**
- Do NOT add any host control that advances, changes or reveals blocks during the event. The list is
  static. This was proposed and rejected.
- Do NOT add a progress counter or a completion screen to the stake surface.
- Do NOT add organization-level or per-event gating of whether the menu appears. All events.
- Do NOT modify `/feed` itself, its search, its tag cloud, or its sort toggle.
- Do NOT build a UI form for editing per-event links. Programmatic at publish time only.
- Do NOT allow an entry to hold an arbitrary or external URL.
- Do NOT add per-block short codes to `src/app/data/short-links.ts` — that map requires a deploy per
  code, which is part of why this menu exists.

## UX Notes

- **Happy path:** attendee is on `/meet`. Host says "open Links, tap `cmp7`." They tap the button in
  the header, tap the entry, land on the locked list, stake seven positions, tap Links again for the
  next destination.
- **Empty:** the chosen tag has no matching content — the feed's existing empty-state copy.
- **Loading:** the feed's existing skeleton.
- **Error:** the feed's existing error + Retry.
- **Not registered / signed out:** the room gate already handles this
  (`EventRoomGate.tsx`); the stake routes sit inside the event and inherit it.

## Approved Visual Reference

**https://claude.ai/code/artifact/25645360-69cb-49e0-9c68-38d6c3bd6c5b** — the 2026-08-28 prototype
pass, approved by the founder in the same session. It is the reference a blind reviewer compares
renders against, and it is authoritative for three things:

- **Placement** — the button beside the avatar in the nav's right-hand group ("B"), drawn at literal
  320px and 375px. Options A (centre slot) and C (swap by width) appear there **as rejected**; do not
  build from them.
- **Open shape** — the bottom sheet, shown beside the rejected dropdown at 375px.
- **Density and structure of the sheet** — grouped entries with the tag shown alongside the label,
  a separator before Transcribe, and the per-event extra under its own quiet "This event" heading.

**It is NOT authoritative for copy.** The entry labels in the artifact are placeholders the agent
wrote; see the founder decision below. Nor for exact colour — the artifact approximates the product's
navy, while the implementation must take the real values from the existing components named in
Solution §1. Founder, verbatim: *"needs to follow our design please."*

## UI Contract

- Button label: **`Links`** — founder-approved verbatim (*"links is fine as a name"*). Alternatives
  "Go to" and the event's own name were considered and rejected.
- **Placement: the nav's right-hand group, as a sibling of the avatar.** Same position at every
  width. Decided 2026-08-28 — see Solution §1 for the two rejected alternatives.
- **The menu opens as a bottom sheet**, not a dropdown. Decided 2026-08-28 after both were
  prototyped side by side at 375px. Reason: it gets tapped repeatedly by standing people holding a
  phone one-handed during a live event — the sheet puts every entry in thumb reach and gives each a
  44px target, where a top-anchored dropdown is a stretch on a large phone. Accepted cost: the sheet
  covers the page and needs a dismiss affordance.
- **Built from the existing design system** — the shared `Button` and the room's existing navy/44px
  treatment (`meeting-terms-page.tsx:96`, `:145`). No new colour, radius or control height.
- [FOUNDER DECISION: the five entry labels. "Transcribe" is the existing product name; `cmp7` /
  `cmp3` / `cmp10` are tags, not labels. "Seven dimensions", "The triad" and "All ten" were used as
  placeholders in the 2026-08-28 prototype — these are the agent's words, not the founder's, and are
  **not approved**. They are what the host says out loud in the room.]

## Acceptance Criteria

- [ ] A signed-in registered attendee sees the **Links** button beside the avatar, in the same header
      position, on `/events/:slug/room`, `/events/:slug/ready`, `/events/:slug/meet`, and on a stake page
- [ ] The button is visible and tappable at **320px**, with nothing overlapping the logo or the
      avatar — the width at which the centre-slot approach fails
- [ ] Tapping it opens a bottom sheet, not a dropdown, and every entry is at least 44px tall
- [ ] Opening it lists Transcribe, `cmp7`, `cmp3`, `cmp10` on an event with no extras configured
- [ ] An event with one configured extra shows five entries; a second event created afterwards with
      none still shows exactly four
- [ ] Tapping the `cmp7` entry lands on a page showing the seven Points oldest-first, with no search
      box, no tag cloud, no sort toggle and no Share a Story button
- [ ] That page shows no tabs, because `cmp7` carries Points only
- [ ] A tag carrying both Points and Stories shows both tabs on the same surface
- [ ] Staking a position on that page updates the count with no full-list reload or loading flash
- [ ] An attendee who opted **out** at `/meet` can reach the stake surface and record positions
- [ ] Tapping Transcribe from the menu reaches the working transcription room

## Done-When

- [ ] A route outside `/events/:slug/*` renders its nav with unchanged logo and right-hand group
      geometry, verified by an assertion that would fail if the Links button leaked outside the room
- [ ] The nav centre slot is untouched by this change — still absolutely positioned, `/terms` unaffected
- [ ] A menu entry configured with an external URL is rejected or ignored, verified by attempting one
- [ ] `P1161` and `docs/events/clarity-practice-event.md` no longer describe `/feed/cmp7` as the
      room's URL
- [ ] The migration applies to test and the column defaults to `[]` on every existing event row

## Rollback Strategy

Code reverts cleanly — the menu and the stake route are both additive, and no existing route changes
behaviour. The column is nullable with a default; leaving it in place after a code revert is inert.
Drop it only if the approach is abandoned outright.

## Open Questions

1. Does the per-event extra want a free label, or should the label be derived from the tag? Not
   decided; the founder described the mechanism (*"add one more link"*) but not the copy.
2. Should the physical short code on the table tent point at `/room` (the gate) or straight at
   `/meet`? The gate is the safer recovery target but adds a hop for someone already signed in.

## Pipeline note — `/challenge-prd` was deliberately skipped

Recommended on 2026-08-28 and **declined by the founder**. Recorded because the reason it was
recommended still stands: `/challenge-prd` on the neighbouring [P1161](p1161_first_physical_event_chiang_mai.md)
returned 6 BLOCK / 7 WARN, and *"five of six BLOCKs were the same defect — a real file cited for a
conclusion it does not support."* This spec cites roughly a dozen files, and its citations were
verified by the same agent that wrote them.

**One such defect was in fact present and was caught by the prototype pass instead** — the original
Solution proposed the nav centre slot without reading the comment, in that same file, recording that
the slot cannot fit content at 320px. That is one hit from an unsystematic check. Treat remaining
file citations here as unaudited.

## Related

- [P1161](p1161_first_physical_event_chiang_mai.md) — the driver. Unblocks run-of-show blocks 5, 7, 8.
- [P1055](p1055_norm_measurement_instrument.md) — the instrument and its ordering requirement.
- [P1114](done/2026-06-10/p1114_event_room_presence_and_cmp_opt_in.md) — the room routes and opt-in this builds on.
- [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md) — `/transcribe`, one menu entry.
- [P1075](done/2026-06-10/p1075_feed_tag_filter_client_side_only.md) — the server-side single-tag path.
- `decisions.md` 2026-07-01 (nav centre slot), 2026-03-13 (DB-level sort).
