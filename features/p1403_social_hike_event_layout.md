---
status: week
type: story
rank: 23
workstream: events
created_date: '2026-10-04'
tags: [events, hikes, mobile, social-proof]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1403: Social Hike event layout — stats, route map, past-hike photos, reviews

## Problem

**Situation:** A Social Hike event page today is a banner, a title, a date, "Reserve a seat",
and ~330 words of markdown. Distance, climb, loop/one-way, time, the walk from the meeting cafe
to the trailhead, and what past hikes looked like are all buried in prose or absent.
**Complication:** AllTrails answers "is this for me?" in seconds on a phone: photos, a stats row
(11.7 km · 539 m · Loop · Moderate · 4–4.5 h), a map, reviews. Ours makes a visitor read to find
the distance. Past-hike photos (145 downloaded, 15 shortlisted, privately) and a first regular's
review now exist and have nowhere to live except one event's description.
**Question:** What hike-specific presentation lets a stranger decide on mobile in seconds,
while keeping what makes ours different (free, unguided, small group, coffee first)?

> Founder, 2026-10-04, verbatim: "if you look at all trails web page both desktop and mobile ...
> they have a very nice interface you know like pictures and there is like things and buttons and
> then it has the you know the information that it's a loop and it's like 11.7 kilometers ...
> should we customize a bit our hikes so this kind of information is presented also nicely"

> On reviews: "make sure that we can in the future add easily more reviews as well and they are
> visible nicely on mobile even so if they accumulate."

## Appetite

Blast radius: medium — the event detail page, but only for Social Hike events; every other event
renders unchanged. Reversibility: medium — additive schema + a conditional layout; removing it is
a revert plus leaving unused columns. Decision density: low — direction decided in conversation;
section labels are founder calls (below).

## Invariants

- **Non-hike events render byte-identically to today.** The layout is selected only for the
  Social Hike series; a Clarity Night, a run, or any other event sees no change.
- **The WhatsApp invite stays registration-gated** (`event_private_info`, P1194). No new section
  may render or fetch `group_chat_url` for a non-registered viewer.
- **No AllTrails, Mapbox or Maxar imagery or user photos are copied.** The route map is drawn from
  OpenStreetMap data with visible attribution; AllTrails is linked to, never embedded or scraped
  for media. AllTrails' terms: "You own any User Material that you submit" (verified 2026-10-04).
- **Banner credit stays visible** when a CC BY-SA photo is used (current hike: DerFussi).
- **Reviews and photos attach to the series, not to one event**, so they accumulate and appear on
  every future hike without being copied into each description.
- **A photo with an identifiable child never ships.** Identifiable adults only after the opt-out
  notice (now in every hike description) — see Risks.

## Solution

A hike layout for the event detail page, selected for Social Hike events, with four additions
above or alongside the existing description:

1. **Stats strip** — distance, elevation gain, route type, estimated walking time, difficulty,
   and the walk from meeting point to trailhead (minutes + link). From structured fields on the
   event, never parsed from description prose. Written by `/slava:events:publish-run`, which
   already extracts every value; the skill change is part of this spec. Decide in `/architect`
   whether this reuses `events.trail_url` (P1264) plus new fields, or a single structured field.
2. **Route map** — the trail line rendered from OpenStreetMap-based data with "© OpenStreetMap
   contributors" attribution, start and meeting-point markers. Static image or lightweight map is
   an `/architect` call; must work on mobile without a heavy map library if a static render
   suffices.
3. **"From past hikes" photo strip** — horizontally scrollable on mobile, grid or row on desktop.
   Series-level photos, ordered by founder pick. First load: the 4 face-free shortlist picks
   (#12–15 in the private shortlist); more added after the opt-out PS goes out.
4. **Reviews** — series-level, data-driven, first entry a regular attendee's (English, shortened, linked to
   her Clarity Pledge profile). Must stay compact as they accumulate: show 1–2 on mobile with
   "more", or a swipeable row. Adding a review is a data write, not a code change and not a
   description edit.

The existing description, terms line, group-chat block, banner (desktop + P1354 mobile) and
"Reserve a seat" stay. Once the reviews section ships, the "From a regular" block is removed from
the 2026-10-11 description so it does not show twice.

[FOUNDER DECISION: section labels. Defaults used until decided: "From past hikes" for photos,
"From people who came" for reviews.]
[FOUNDER DECISION: order on mobile — default: banner → title/date → stats strip → Reserve →
photos → description → map → reviews.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A past attendee finds themselves on a public page | MITIGATE | Face-free photos only until the opt-out PS has gone out; never the 30 Aug child photo; removal is a data delete |
| Reviewer did not agree to be quoted | ACCEPT | Founder confirmed the first review is for publishing (2026-10-04) |
| Stats on an old hike go stale when AllTrails changes | ACCEPT | Snapshot at publish time is the intent; it describes the hike as planned |
| OSM route data missing or wrong for a trail | MITIGATE | Section hides when no route data; never a broken map |
| Hike detection by title prefix drifts (renamed series) | MITIGATE | Same prefix-dependency the publish-run skill documents; select by series, test the selection |
| Heavy map library slows mobile page | MITIGATE | Prefer a static render; measure page weight before/after |

**Non-Goals**
- Do NOT change layout for any non-hike event.
- Do NOT build an upload or moderation UI for photos or reviews — writes are programmatic/founder-run.
- Do NOT embed AllTrails widgets, photos or map tiles.
- Do NOT touch registration, RSVP or the group-chat gate.
- Do NOT add user-submitted reviews (no public write path).

## Acceptance Criteria

- [ ] On the 2026-10-11 Social Hike page, a visitor on a 375 px phone sees distance, climb, route type, time, difficulty and the cafe-to-trailhead walk without scrolling past the first screen below the banner
- [ ] The same page shows a route map with OpenStreetMap attribution, on desktop and at 375 px
- [ ] A "From past hikes" strip shows the 4 face-free photos, swipeable at 375 px, no horizontal page scroll
- [ ] The first regular's review appears in the reviews section, linked to her profile; with 6 test reviews loaded the section stays compact at 375 px (no wall of text)
- [ ] Adding a review or a photo to the series makes it appear on every upcoming hike page without editing any description — shown by adding one on test
- [ ] A Clarity Night event page renders unchanged (visual diff or snapshot test)
- [ ] A non-registered visitor still cannot see the WhatsApp link; a registered one still can
- [ ] `/slava:events:publish-run` writes the structured hike fields on the next hike it creates
- [ ] Visual critique by three independent reviewers (Gemini, Codex, Opus) comparing desktop and 375 px against the AllTrails trail page, findings triaged and BLOCK items fixed

## UX Notes

- Happy path: all four sections present.
- Missing data: each section hides independently (no stats → no strip; no route → no map; no photos → no strip; no reviews → no section). An old hike with none renders today's page.
- Loading: photo strip and map reserve their height to avoid layout jump.
- Mobile first: 375 px and 320 px are the primary targets; desktop is the secondary layout.

## Related

- P1264 — `events.trail_url` column; not read by the client today (decisions.md 2026-09-11)
- P1354 — phone-specific banner (`banner_mobile_url`)
- P1194 — registration-gated group chat
- `docs/events/series/social-hike.md` — description base and series rules
