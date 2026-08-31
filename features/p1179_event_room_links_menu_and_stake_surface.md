---
status: today
type: story
rank: 3
workstream: events
created_date: '2026-08-28'
tags: [events, room, navigation, cmp]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
pipeline_plan: [create-spec, generate-tests, dev, verify]
pipeline_skipped: ["challenge-prd -- founder declined 2026-08-28, see Pipeline note", "ux -- settled by the 2026-08-28 prototype pass", "architect -- placement + schema shape decided in spec", "decompose -- 3 concerns, under the 5-file trigger"]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1179: The event room "Links" menu and the locked stake surface

## Run This

Type this from anywhere in the repo — the main checkout is fine. Nothing to `cd` into, nothing to
rebase; the worktree is already claimed for this spec and already carries the pinned contract.

    /goal "Work in the worktree on branch feature/p1179-links-menu. Then: ./scripts/goal-gate.sh p1179 exits 0, output pasted. Stop after 30 turns."

`/goal` is native Claude Code, not a repo skill — the founder types it; no agent can invoke it for
them. The condition names an exit code on purpose: the loop's evaluator reads the transcript and
runs nothing, so the only trustworthy condition is one naming an artifact the agent cannot author.

**Why the worktree clause is there and is not decoration.** The gate hard-refuses to run on the
shared main checkout — `CHECK 3` exits non-zero with *"refusing to soft-reset outside a worktree
(main's index and HEAD are shared)"* — so a loop started on main cannot reach exit 0 no matter what
it builds. Naming the **branch** rather than a slot number is deliberate: the slot is resolved from
`git worktree list` at run time, so this line stays correct if the work is ever moved.

**What this does and does not guarantee.** The loop still stops on the agent's *paste* of the exit
code, and nothing here changes that. What the pinned contract buys is that forgery and decay are
caught at the merge boundary by CI, before anything reaches `main`. Expect a walk-back that is
usually-but-not-always green — not a self-proven branch.

**The loop stops at a committed branch.** Merging, migrating prod, deploying and pushing are all
ALWAYS-ASK and none of them are pre-approvable.


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
- **Open shape** — the bottom sheet, shown beside the dropdown at 375px. (The dropdown was rejected
  *at that width*; since 2026-08-31 it is the desktop shape — see Resolved Decisions.)
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
- **The menu opens as a bottom sheet on phones and an anchored dropdown on desktop.**
  REVISED 2026-08-31 — this read "a bottom sheet, not a dropdown" until the founder saw it on a
  monitor: *"it's really weird on desktop it just like slides up ... it should be like we have the
  use cases you know at the top and then I click"*. The phone half is unchanged and keeps its
  original 2026-08-28 reasoning: the menu gets tapped repeatedly by standing people holding a phone
  one-handed during a live event, so the sheet puts every entry in thumb reach and gives each a 44px
  target, where a top-anchored dropdown is a stretch on a large phone. Accepted cost: the sheet
  covers the page and needs a dismiss affordance. On desktop none of that reasoning applies — there
  is no thumb — and a full-width panel rising from the bottom of a large viewport for five links
  reads as a phone control on a monitor. The desktop shape uses the nav's own dropdown primitive and
  alignment so it reads as part of the nav rather than as a second menu system.
- **A configured per-event link with nothing behind it is not rendered.** Added 2026-08-31, founder:
  *"I don't think we need to include the link to tonight or whatever if ... we don't have points
  with tags that ... need to appear in a given event."* He opened the menu during an event, tapped
  "Tonight", and landed on an empty surface — the tag was configured, nothing had been staked under
  it. The emptiness test is the stake surface's OWN query, so the menu and its destination cannot
  disagree. Scoped to the "This event" group only: `cmp7`/`cmp3` are the framework's
  permanent surfaces, and a room where nobody has staked yet must not render a menu holding only
  Transcribe and Start a Clarity Session, which reads as broken rather than as empty. Fails OPEN —
  a probe that errors keeps the entry, because a failed probe is not evidence of emptiness.
  A per-event auto-generated tag was considered and NOT built: nothing tags points to an event
  today, so the generated entry would be exactly as empty as "Tonight" was.
- **`cmp10` is out of the menu, and the event's own link goes FIRST.** Added 2026-08-31, founder:
  *"I would suggest to delete CMP10. Let's keep it simple"*, and *"tonight should be the first link
  if the event has it."* Four standard entries remain (`cmp7`, `cmp3`, Transcribe, Start a Clarity
  Session). This is a MENU change only — `/stake/cmp10` still resolves and the tag keeps working for
  anyone holding the link; what stops is the room offering a third instrument mid-event. The order
  follows from the same reasoning as the auto-hide above: the per-event tag is why this attendee is
  in this room tonight, the standing instruments are identical at every event, so the event's own
  destination takes the first position. A separator now closes the "This event" group as well as
  opening the tools group, so the heading's scope is visible rather than inferred.
- **The stake surface carries a Back button.** Added 2026-08-31, founder: *"if I go to CMP7, I'm
  there, but it doesn't have the back button to the previous page."* The Links button already
  carries an attendee SIDEWAYS to the next destination without a back hop — that property is
  unchanged. What was missing is the way out: someone who opened `cmp7` to look at it had no route
  back to the room except browser chrome, which a phone in a live room half-hides. A first history
  entry (typed URL, bookmark, shared link) has nothing behind it, so those arrivals go to `/feed`
  rather than out of the app. **`/live` deliberately gets no Back**: it is a session with its own
  end-session control, and a second exit beside it mid-session is the "Leave makes no sense"
  confusion in reverse.
- **The stake page's own nav offset is removed.** Added 2026-08-31 from a founder screenshot
  (*"why so much whitespace? cut?"*). `ClarityLandingLayout`'s `<main>` already carries the fixed
  nav's offset; the page also carried `pt-20`, so it was applied twice and the first card sat ~5rem
  low at every width. A page inside that layout must not add its own nav offset.
- **Built from the existing design system** — the shared `Button` and the room's existing navy/44px
  treatment (`meeting-terms-page.tsx:96`, `:145`). No new colour, radius or control height.
- [FOUNDER DECISION: the five entry labels. "Transcribe" is the existing product name; `cmp7` /
  `cmp3` / `cmp10` are tags, not labels. "Seven dimensions", "The triad" and "All ten" were used as
  placeholders in the 2026-08-28 prototype — these are the agent's words, not the founder's, and are
  **not approved**. They are what the host says out loud in the room.]

## Acceptance Criteria

- [x] A signed-in registered attendee sees the **Links** button beside the avatar, in the same header
      position, on `/events/:slug/room`, `/events/:slug/ready`, `/events/:slug/meet`, and on a stake page
- [x] The button is visible and tappable at **320px**, with nothing overlapping the logo or the
      avatar — the width at which the centre-slot approach fails
- [x] At phone width, tapping it opens a bottom sheet, not a dropdown, and every entry is at least 44px tall
- [x] At desktop width, clicking it opens a narrow panel anchored under the trigger — not the sheet
- [x] A configured per-event link whose tag has no points and no stories is not shown at all
- [x] The menu lists exactly `cmp7`, `cmp3`, Transcribe, Start a Clarity Session — `cmp10` is absent
- [x] When the event has a per-event link with content, it is the FIRST entry in the menu
- [x] The stake surface renders a Back button that pops history, and goes to `/feed` instead when
      the page is the first history entry
- [x] The stake surface applies the nav offset once, not twice — no page-level `pt-20` under a
      layout that already offsets
- [x] Opening it lists `cmp7`, `cmp3`, Transcribe, Start a Clarity Session on an event with no extras
      configured — SUPERSEDES the earlier "…`cmp10`…" wording above: `cmp10` was removed from the
      menu 2026-08-31 (founder: "I would suggest to delete CMP10. Let's keep it simple")
- [x] An event with one configured extra shows five entries; a second event created afterwards with
      none still shows exactly four
- [x] Tapping the `cmp7` entry lands on a page showing the seven Points oldest-first, with no search
      box, no tag cloud, no sort toggle and no Share a Story button
- [x] That page shows no tabs, because `cmp7` carries Points only
- [x] A tag carrying both Points and Stories shows both tabs on the same surface
- [x] Staking a position on that page updates the count with no full-list reload or loading flash
- [x] An attendee who opted **out** at `/meet` can reach the stake surface and record positions
- [x] Tapping Transcribe from the menu reaches the working transcription room

## Done-When

- [x] A route outside `/events/:slug/*` renders its nav with unchanged logo and right-hand group
      geometry, verified by an assertion that would fail if the Links button leaked outside the room
- [x] The nav centre slot is untouched by this change — still absolutely positioned, `/terms` unaffected
- [x] A menu entry configured with an external URL is rejected or ignored, verified by attempting one
- [x] `P1161` and `docs/events/clarity-practice-event.md` no longer describe `/feed/cmp7` as the
      room's URL
- [x] The migration applies to test and the column defaults to `[]` on every existing event row

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

## Resolved Decisions

Recorded 2026-08-28 by `/goalify` Phase 1. Append-only — nothing above this line was rewritten.

**1. The entry labels are the tags themselves.** `cmp7`, `cmp3`, `cmp10`, plus `Transcribe` and
`Start a Clarity Session`.
This closes the `[FOUNDER DECISION: the five entry labels]` marker in the UI Contract. The
prototype's "Seven dimensions" / "The triad" / "All ten" are the agent's words and are **not
approved**; they must not appear. Rationale, founder's own verbatim: *"if I say go to the menu
and then select the CMP7"* — the spoken word and the rendered label are now the same token, and
no unapproved copy reaches the screen. The approved reference's label-alongside-tag pairing
collapses to a single token for the three standard entries; the separator before `Transcribe`
and the quiet "This event" heading for extras are unchanged and still authoritative.

**1b. A fifth standard entry: `Start a Clarity Session` → `/live`.** Founder, 2026-08-28, added
after the labels were settled. This raises the standard set from four to **five**, and Solution §2's
"every event gets the same four" is superseded. The label is **not new copy** — `Start a Clarity
Session` is verbatim the existing nav CTA's own wording (`simple-navigation.tsx`), so nothing
agent-authored reaches the screen here either. `/live` is an internal path and satisfies the
open-redirect invariant unchanged.

**Recorded consequence, not a blocker:** the nav hides its Start-a-Session CTA whenever it mounts
`compact` and on event detail pages, because there it competes with the page's primary action
(P844). Putting `/live` in the sheet reinstates that destination inside the room. Inside a menu it
is one entry among five rather than a competing primary, so P844's reason does not carry over — but
the two decisions now point in opposite directions on the same route and that is deliberate.

**2. The stake surface is a GLOBAL route, with the event carried alongside.**
`/stake/:tag`, optionally `?event=<slug>`. This **overrides Solution §3's "a new route inside the
event"** and it is the founder's call, made 2026-08-28 after reading what the surface actually is:

> "I don't know if it should live under an event, should it? Because it's a general thing. It's
> just like a feed… so it's probably not under event, right? Because it's for all events."

Correct — the content is global; `cmp7` is the same seven Points at every event. The only reason
the spec nested it was the Links button, which renders on room routes. The query param resolves
both: the Links menu writes `?event=<slug>` onto every entry it generates, so the button persists
across destinations without a Back hop, and a bare `/stake/cmp7` is a usable, handable cut-down
feed with no button and no event context. A signed-out visitor reaching `/stake/:tag` directly
sees public content, exactly as `/feed` does today — so the room gate does **not** extend here,
and the UX Notes line "the stake routes sit inside the event and inherit it" no longer applies.

**3. The per-event extra carries an optional name.** JSONB shape `{tag, label?}`; render `label ?? tag`.
One column, one render path with a fallback, no field required of the operator at publish time.
Closes Open Question 1. Consistent with decision 1: an extra with no label shows its tag.

**4. Open Question 2 (short code → `/room` or `/meet`) is NOT in this spec's contract.** It is not
named by any Done-When or Acceptance-Criteria line and nothing here depends on it. Left open.

### Phase-0 citation corrections

The spec's own Pipeline note says *"treat remaining file citations here as unaudited."* Three were
checked while confirming the contract rows are decidable. The corrections are recorded here rather
than by editing Problem / Solution / Invariants / Risks, which `/goalify` does not rewrite.

1. **`docs/events/clarity-practice-event.md` does not call `/feed/cmp7` "the room's URL."** It
   contains no route pointer at all — `grep -n 'feed'` returns 17 hits, every one the English word
   "feedback". The Risks row and Done-When line naming it have no referent. **Contract decision:**
   DW-4 binds `P1161` only, and the practice-event doc is left untouched. Taken by the agent —
   the question was put to the founder twice and not answered; logged in `assumptions.md`.
2. **`EventRoomMeet.tsx` does not "hide its portal below 375px."** It portals nothing and contains
   no `createPortal` or `NAV_CENTER_SLOT_ID` reference; its header records that the level track was
   **removed outright** by founder call (2026-08-21 round 3), not hidden at a breakpoint. The claim
   originates in `simple-navigation.tsx`'s own comment, which the Invariant copied. **The
   load-bearing half survives:** that comment's finding — the track's min-content width alone
   exceeds the centre slot's available space at 320px once logo and avatar clearance is reserved —
   is real, and remains the reason placement B beat the centre slot. Only the stated *mechanism* of
   the historical fix was wrong.
3. **The open-redirect guard is `src/app/data/short-links.ts:40-42`**, not `short-link-redirect.tsx`.
   The quoted comment (*"only allow relative paths (prevent open redirects)"*) is verbatim correct;
   only the file is misnamed. The invariant it supports is unaffected.

Verified and correct as cited: `stories-service.interface.ts:75` (exact signature), the `events`
table having no column that could hold a link list (`20260118_create_events.sql:6-31`), the three
room routes mounting `compact` (`App.tsx`), and `EventRoomMeet` portaling nothing.

## Verification Contract

**Pinned to main.** The gate reads this section from `main`, never from the branch it is judging —
otherwise a loop can delete the row it is about to fail. Adding a heading inside this section breaks
the digest; put new prose above it.

**16 spec lines (11 Acceptance Criteria, 5 Done-When) plus 3 UI-Contract bindings and one
regression baseline, grouped into 15 rows: 12 MECHANICAL, 2 COMPARABLE, 1 HUMAN-ONLY.** HUMAN-ONLY
is 6% — well under goalify's 25% refusal bar. These are the gate's own figures, read off
`goal-gate.sh p1179 --tier ci`, not a hand count: the threshold is mechanized precisely because an
agent grading its own spec can round it.

The gate also requires a UAT scorecard at `features/uat/p1179.md` with every row carrying a result
(CHECK 4) and `assumptions.md` + `feedback.md` present with both axes (CHECK 6). Those are the
loop's to produce; they are not contract rows.

| line | class | decided by | artifact |
|---|---|---|---|
| AC-1 the Links button renders beside the avatar in the nav's right-hand group on /room, /ready, /meet and the stake surface; AC-4 an event with no extras lists exactly Start a Clarity Session, Transcribe, cmp7, cmp3, cmp10 with those labels verbatim; AC-5 one configured extra yields six entries and a second event with none still yields exactly five | MECHANICAL | `npx vitest run src/tests/p1179-links-menu.test.tsx` | src/tests/p1179-links-menu.test.tsx |
| DW-1 a route outside the room renders its nav with unchanged logo and right-hand-group geometry — the assertion fails if the button leaks outside an event context; DW-2 the nav centre slot is untouched and still absolutely positioned, and /terms still portals into it | MECHANICAL | `npx vitest run src/tests/p1179-nav-containment.test.tsx` | src/tests/p1179-nav-containment.test.tsx |
| UI-1 the control is built from the existing design system — the shared Button or the room's PRIMARY_BUTTON_CLASS/ANSWER_BUTTON_CLASS treatment and the existing ui/drawer sheet primitive; no new colour, radius or control height is introduced | MECHANICAL | `npx vitest run src/tests/p1179-design-system-reuse.test.ts` | src/tests/p1179-design-system-reuse.test.ts |
| DW-3 an entry configured with an external or protocol-relative URL is rejected or ignored, verified by attempting one; entries resolve to internal paths only | MECHANICAL | `npx vitest run src/tests/p1179-entry-safety.test.ts` | src/tests/p1179-entry-safety.test.ts |
| AC-6 the stake surface renders its tag's Points oldest-first with no search box, no tag cloud, no sort toggle and no Share a Story button; AC-7 a Points-only tag shows no tabs; AC-8 a tag carrying both Points and Stories shows both tabs; the oldest-first ordering is requested from the database, never reversed client-side | MECHANICAL | `npx vitest run src/tests/p1179-stake-surface.test.tsx` | src/tests/p1179-stake-surface.test.tsx |
| AC-9 no refetch is wired to a position change — the guard that keeps optimistic counts from causing a loading flash is not reintroduced | MECHANICAL | `npx vitest run src/tests/p1179-no-refetch-on-position.test.tsx` | src/tests/p1179-no-refetch-on-position.test.tsx |
| DW-4 P1161 no longer calls /feed/cmp7 the room's URL anywhere, and names the Links menu instead | MECHANICAL | `bash -c 'f=$(find features -name "p1161_*.md" -not -path "*/archive/*" -print -quit); test -n "$f" && ! /usr/bin/grep -q "feed/cmp" "$f" && /usr/bin/grep -q "Links" "$f"'` | features/p1161_first_physical_event_chiang_mai.md |
| the whole unit suite stays green — the regression baseline for every row above | MECHANICAL | `npx vitest run` | package.json |
| AC-2 the button is visible and tappable at a literal 320px with nothing overlapping the logo or the avatar, asserted on measured bounding boxes after confirming window.innerWidth actually took the resize; AC-3 tapping it opens a bottom sheet rather than a top-anchored dropdown and every entry measures at least 44px tall | MECHANICAL | `npx playwright test e2e/p1179-links-menu.spec.ts` | e2e/p1179-links-menu.spec.ts |
| AC-11 the Transcribe entry reaches the working transcription room and the Start a Clarity Session entry reaches /live; the Links button persists across destinations without a Back hop when the event is carried on the URL; a bare /stake/:tag renders the cut-down feed with no button and no event context | MECHANICAL | `npx playwright test e2e/p1179-links-navigation.spec.ts` | e2e/p1179-links-navigation.spec.ts |
| AC-9 staking a position updates the count with no full-list reload and no loading flash, asserted on the feed request count observed across the click; AC-10 an attendee who opted out at /meet can reach the stake surface and record positions | MECHANICAL | `npx playwright test e2e/p1179-stake-surface.spec.ts` | e2e/p1179-stake-surface.spec.ts |
| DW-5 the migration applies to test and the new column defaults to an empty list on every pre-existing event row; the column holds the {tag, label?} shape and nothing else | MECHANICAL | `npx playwright test e2e/integration/p1179-events-links-column.spec.ts` | e2e/integration/p1179-events-links-column.spec.ts |
| UI-2 the open sheet matches the approved reference in density and structure — grouped entries, the separator before Transcribe, and the per-event extra under its own quiet "This event" heading | COMPARABLE | blind-reviewer | features/verification/p1179/review-round-*.md |
| UI-3 the four room screens still read as the same product with the button added, at 320px, 375px and desktop, including the stake surface's empty state | COMPARABLE | blind-reviewer | features/verification/p1179/review-round-*.md |
| HUM-1 the entry labels are the right words to say out loud to a room of strangers | HUMAN-ONLY | founder | — |

### The blind reviewer

**It must not be the agent that built the thing.** That is the one durable constraint here: the
repo's evidence is P1083 — four review rounds, every defect found by a reviewer given renders and
nothing else, every rejected version having already passed its own implementer's review.

**Given:** the named reference (the approved 2026-08-28 prototype artifact linked under *Approved
Visual Reference*), and renders of `/events/:slug/room`, `/ready`, `/meet` and `/stake/cmp7?event=…`
at **320px, 375px and desktop**, each with the Links sheet closed and open, plus the stake
surface's **empty state**. The reference is authoritative for placement, open shape, and sheet
density — and explicitly **not** for copy or for exact colour.

**Forbidden:** the diff, the spec, the rationale, this contract, and any statement of what the build
was trying to do.

**Writes** `features/verification/p1179/review-round-N.md` itself: `VERDICT: PASS|FAIL`, then one
`SCREENSHOT: <sha256>  <path>` line per image judged. The gate re-hashes every image itself and
never trusts a hash it is handed. Hashing binds the verdict to the pixels judged; it cannot
establish who authored the verdict — the defence against that is independence, not arithmetic.

**Screenshots must reach the real gated states.** The room routes are behind auth plus registration;
`getTestAuthContext()` in `e2e/helpers/auth-context.ts` mints a real user JWT. A component fed mock
props certifies a screen the user never sees. Reach the real state or say plainly that you did not.
`resize_window` can silently no-op below some minimum — confirm `window.innerWidth` before trusting
any 320px render (`.claude/rules/browser.md`).

### Evidence

| file | holds |
|---|---|
| `contract.sha256` | the pin |
| `review-round-N.md` | the verdict and the image hashes |
| `assumptions.md` | every call the loop made alone. There is no escalation clause — the agent decides, logs, continues |
| `feedback.md` | **two numbers**: corrections given, and turns consumed. Quality bought with runaway spend reads as success on a one-axis scoreboard |

### Red-first (run 2026-08-28, before the loop existed)

| command | result | strength |
|---|---|---|
| the DW-4 grep row | **exit 1** — P1161 still says `feed/cmp` at four places (`:205`, `:246`, `:256`) | **real red.** The assertion ran against live content and failed for the reason it exists to catch |
| `npx vitest run` (whole suite) | **exit 0** — 289 files / 3266 tests passed, 2 files and 19 tests skipped | **the baseline.** This row must stay green throughout; it is the only row that is green at pin time |
| the six `src/tests/p1179-*` rows | **exit 1** each — `No test files found` | **unproven-by-absence.** These prove only that the command fails when its file is missing, not that any assertion binds. Do not count them as evidence |
| the four `e2e/p1179-*` rows | **not run** — the files do not exist, and the DB-backed and browser rows additionally need a seeded fixture event and a running dev server | **unproven.** Flagged rather than counted |

**Stated plainly: eleven of the eighteen MECHANICAL rows are unproven at pin time.** A check nobody
has seen fail for the right reason is not a check, and saying so here is cheaper than discovering it
at the merge boundary. The loop's first job on each of those rows is to write the assertion, watch it
fail against the unbuilt behaviour, and only then build — CHECK 1 of the gate refuses a contract whose
test artifacts do not exist at all, and CHECK 3 refuses an empty index, but neither can tell a
load-bearing assertion from a vacuous one.

**No `it.fails` markers are pre-authorised for this spec.** P1114 committed red tests under that
convention to keep `npm test` green while its build was outstanding; the cost was rows that exited 0
over assertions nobody had satisfied. This contract's baseline row (`npx vitest run`) is green today
and the loop works in a worktree, so there is no green-suite pressure to relieve — if a `p1179-*`
test is committed, it must be committed passing.
