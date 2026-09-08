# Default organization for a new event

Every event this project creates belongs to a Clarity Organization (`events.org_id`,
P1060). An event with `org_id = NULL` is "loose": it never appears on any group's
Events tab and never counts toward that community's participation. That is a valid
state for a genuinely unaffiliated event, but it is **not** the default we want —
it happened once by omission (`social-hike-ban-mai-viewpoint-mon-cham-2026-09-13-945871`,
corrected 2026-09-07) because no creation path set the column at all.

## The rule

| Venue | Organization | slug |
|---|---|---|
| **Online** — a meeting link, or prose that says online | Clarity Practice Community · Online | `online` |
| **In person, within 150 km of Chiang Mai** | Communication Activism Community · Chiang Mai | `cm` |
| **In person, further than 150 km** | **nothing — stop and ask the founder** | — |
| **In person, position unknown** | **nothing — stop and ask the founder** | — |

Online is decided by the venue, not by geography: `classifyLocation(location).type === 'virtual'`
(the same classifier the event page renders with) **or** the location says so in words. The word
test is not redundant — `docs/events/series/lost-cofounders.md` stores
`default_location: "Online — Google Meet"`, which is prose, classifies as an *address*, and
without it would file an online series into Chiang Mai.

Everything else is in person and is decided by **distance from Chiang Mai city centre**
(18.7883, 98.9853), great-circle, threshold 150 km. Every hike, run and café this project has
used sits inside 30 km; Ko Phangan, the only other place events have actually run, is ~1,000 km.
So in practice nothing you run regularly ever asks.

### Coordinates come from the creator, never from geocoding a name

The radius test needs real coordinates, and the only trustworthy source is the creation path
itself — `/publish-run` already reads them off AllTrails, and `/re-create-event` inherits the
community from the occurrence it clones, so neither has to look anything up.

**Do not geocode the place name to recover them.** Measured against this project's own venues
on 2026-09-07 (Nominatim):

| Location | Result |
|---|---|
| `Ban Pa Nok Nook trailhead` | no result |
| `Inner Space Coworking Ko Phangan` | no result |
| `Zoo Cafe Ko Phangan` | no result |
| `YODDOI Coffee` | a café in Chiang **Rai** — 137 km out, inside the radius, **wrong place** |

Three of seven unresolvable, including both Ko Phangan venues — the exact rows the radius test
exists to catch. And the `YODDOI Coffee` row is the dangerous one: it returns a confident number
that would have passed the test on a wrong fact. A location string that carries literal
coordinates is read directly; a place name yields `null` and the path stops and asks.

### Why stopping is the right failure

An event filed into the wrong community is silent. It shows on the wrong group's page and
counts toward the wrong community's participation, and it is found weeks later by noticing a
page looks off — which is how the 2026-09-13 hike was found. A refusal at creation is found
immediately, by the one person who knows the answer.

## How each creation path applies it

| Path | Mechanism |
|---|---|
| `src/app/prototypes/events/org-defaults.ts` | The rule itself — `resolveOrg()` returns an org, `loose`, or `ask`. Covered by `src/tests/org-defaults.test.ts`. Everything below calls it; nothing re-implements it. |
| `scripts/create-event.ts` (used by `/re-create-event`) | Resolves it, prints `ORG=<slug>  # <why>`, and **exits 1 rather than guessing** when the answer is `ask`. Inputs: `"lat"`/`"lng"` for the venue; `"org_slug"` to override; `"org_slug": null` for deliberately unaffiliated. |
| `scripts/resolve-event-org.ts` | The same verdict for paths that write their own INSERT. Prints `ORG_SLUG=` / `ORG_ID=` / `WHY=`, exits 1 with `ASK:` when a human must choose. |
| `/slava:events:publish-run` | Calls the resolver with the trail coordinates it already has from AllTrails, and puts `ORG_ID` in its POST. |
| `/slava:events:re-create-event` | Inherits the community from the occurrence it clones — a series never needs the geography test. |
| `/slava:events:publish-event` | Opens `/events/new?org=<slug>` so the form carries the community forward. |
| `/events/new` typed by hand, no `?org=` | Stays loose. This is the public funnel for anyone with an account and must not acquire a default. |

## What enforces it

Nothing in the database. `events.org_id` is nullable on purpose, and the only DB rule
is `events_org_requires_organizer` (P1060 D4), which refuses an `org_id` naming an
organization the **host** does not organize. It never supplies one. So the default
lives in the creation paths above and nowhere else — a new creation path inherits
nothing automatically and must be added to this table.

## Verifying

Loose upcoming events on prod (expected: none, unless deliberate) — read-only, anon key,
same shape the event skills use for a prod read:

```
GET /rest/v1/events?org_id=is.null&status=eq.upcoming&select=slug,title,location
```

The two Ko Phangan events from 2026 are `NULL` **deliberately** — no organization existed
when they ran, and the P1060 migration asserts they stay that way.
