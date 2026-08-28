---
status: week
type: story
rank: 43
created_date: '2026-08-13'
tags: [organizations, events, schema, membership]
delivery_stage: create-spec
pipeline_ran: [create-spec, grill-me]
driver: heuristic
---

# P1060: Events belong to an organization — and the second organization that needs it

> **[WIDENED 2026-08-19 — founder decision.]** Filed 2026-08-13 as a schema placeholder (`events.org_id`, column + backfill, *"Do NOT change event visibility or access rules here"*). That Non-Goal is **retired, deliberately**, because the condition it was waiting for arrived: the founder wants a **second Clarity Organization for online events**. The column alone does not make two organizations usable — see Problem — so shipping it without the surfaces that read it leaves the visible defect in place on the day org #2 appears. The original narrow scope is preserved at the bottom under *Superseded scope*.
>
> **[FINALIZED 2026-08-28 — eight founder decisions recorded below; spec is ready for development.]** Two changes to the widened scope. **(a) The paid membership level and gated events are split out to [p1183](p1183_membership_levels_and_gated_events.md)** — different blast radius (it writes onto the terms-acceptance record, irreversible once anyone pays), nothing to attach to (zero paid members, no payment collection), and it was gating the four items that unblock org #2 this week. **(b) `/org` — a directory of all organizations — is added**, closing the follow-up that [decisions.md](../docs/decisions.md) 2026-07-23 [product] deferred by name (*"Deferred to followups: user-facing org creation, discovery index (`/org`)…"*). The condition that deferral was waiting for is the same one that widened this spec: a second organization.

## Problem

**Situation:** `events` has `host_id → profiles` and no organization reference. [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) shipped `organization` + `membership`, so multiple organizations are already structurally supported — the only missing edge is from an event to the org that holds it. `organization.has_events` is a *display toggle* for whether the Events tab renders (`org-page.tsx:285`), not a filter; the embedded list calls `eventsService.getUpcomingEvents()` / `getPastEvents()` with no org argument (`EventsList.tsx:41-43`).

**Complication:** the founder is creating a second organization — **Clarity Practice Community · Online** — to host online events, alongside the existing **· Chiang Mai**. On the day it exists, both pages list the same events: Chiang Mai shows the online sessions, Online shows the Chiang Mai ones. The "Past" count visible on the org page today is not Chiang Mai's; it is every event on the platform. Two organizations is therefore *worse* than one until this edge exists.

**Third complication (2026-08-28, measured):** the backfill this spec originally prescribed — *"existing rows backfilled to the Chiang Mai org"* — is **factually wrong**. Prod holds **10 events, and 2 of them are on Ko Phangan**, not in Chiang Mai. Backfilling all ten to `· Chiang Mai` would write a false historical claim into the very column this spec exists to make trustworthy. **Zero online events exist** — all ten are physical — so `· Online` launches empty, which is what makes the empty-state decision (D6) blocking rather than deferrable. Verified 2026-08-28 by read-only query against **prod** (`/rest/v1/events`, anon key); the full classification is in Solution item 2.

**Fourth complication:** the founder's stated end-state includes *"people go to `/org` and see all organizations, then go into one of them."* **That surface does not exist** — `src/App.tsx:963-965` defines `/org/:slug` and `/org/:slug/join` and nothing else. With two organizations and no directory, the second one is reachable only by knowing its URL.

**Question:** what does an event belong to, who may host into it, and how does anyone find the second organization at all?

## Appetite

**Blast radius: medium** — one nullable column is low, but the surfaces reading it are the org page, the events list, event creation, and a new public route. Reduced from *high* by the p1183 split: nothing here touches the acceptance record. **Reversibility: high** — the column, the seed, the directory route and the scoping are all revertible; no financial or terms state is written. **Decision density: none open** — all eight are recorded below.

## Decisions (recorded 2026-08-28, founder)

| # | Decision | Value | Why |
|---|---|---|---|
| D1 | `events.org_id` nullability | **Nullable** | The 3 Ko Phangan rows genuinely belonged to no organization, because none existed. `/events/new` is open to any logged-in user with no org context; `NOT NULL` would need an org picker before anything could save, and would force every future ad-hoc event into a community it isn't part of. |
| D2 | What the backfill writes | **The 8 Chiang Mai events only; the 2 Ko Phangan events stay NULL** | Keeps the column honest, which is the entire point of adding it. Backfilling all ten would overstate that community's history permanently. Exact slug list in Solution item 2. |
| D3 | Org #2 slug | **`online`** → `/org/online` | Pairs with the existing `/org/cm`; reads as the instance name. |
| D4 | Who may host into an org | **Organizers of that org only, from the org page** | Standalone `/events/new` stays open to any logged-in user and creates an orgless event. Matches the founder's end-state (leader of · Online posts events under it) and stops the org page inviting strangers to host into a community they may not belong to. **Note:** `membership_insert` lets any authenticated user join a public org in one click, so "any member" would be close to "anyone" in practice — that is why the line is drawn at organizer. |
| D5 | `/org` directory | **In this spec** | One route, one query, one list page. Closes the [decisions.md](../docs/decisions.md) 2026-07-23 deferral by name. Explicitly a listing, never a creation surface. |
| D6 | Empty Upcoming | **Fall through to Past, explicitly labelled** | · Online launches with zero events and · Chiang Mai has past events but none upcoming; without this both read as dead to an invited stranger. An org with neither shows one honest line, not an empty list. |
| D7 | · Online blurb | **Mirror Chiang Mai's factual form** | Chiang Mai's is *"Calibrated communication practice in Chiang Mai."* Online's is the same sentence with the location swapped — no new positioning claim. Exact string: **`[FOUNDER APPROVAL: "Calibrated communication practice online."]`** — implement with this value; replace on request. |
| D8 | Membership levels + gated events | **Split to [p1183](p1183_membership_levels_and_gated_events.md)** | See the FINALIZED callout above. |

## Solution

**1 — the edge.** `org_id UUID REFERENCES public.organization(id)` on `public.events`, **nullable** (D1), indexed.

**2 — the backfill, before org #2 is seeded (D2).** The migration **enumerates slugs explicitly**. It must NOT match on a `location LIKE '%Chiang Mai%'` heuristic: 3 of the 10 rows store a Google Maps URL instead of an address, one stores a Thai-script street address, and one Chiang Mai row resolves only by following a shortened link — a substring match silently misclassifies four of the eight.

**Classified 2026-08-28 against prod (`/rest/v1/events`, anon key, read-only).** Set `org_id = (SELECT id FROM organization WHERE slug='cm')` for exactly these 8:

| Event slug | Location evidence |
|---|---|
| `clarity-dinner-1-exploring-coordination-understanding-2026-02-12-ld5e` | Thai-script address, Mueang Chiang Mai District |
| `ai-run-1` | Fernpresso at Lake, Chiang Mai |
| `ai-running-club-chiang-mai-2-sun-may-24-2026-05-17-b0rc` | Fernpresso at Lake, Chiang Mai |
| `ai-running-club-chiang-mai-3-sun-may-31-2026-05-24-gfmi` | Fernpresso at Lake, Chiang Mai |
| `how-well-do-your-ai-clients-and-partners-understand-your-business-model-2026-06-08-bpl3` | short URL → Zuzalu Library, 18.7959, 98.9663 — Chiang Mai |
| `clarity-hike-doi-pui-peak-double-loop-2026-06-21-w4k2mj` | maps URL → 18.82555, 98.89449 — Doi Pui, Chiang Mai |
| `clarity-hike-buddha-footprint-doi-pui-peak-2026-07-05-76dde6` | Doi Suthep–Pui National Park, Chiang Mai |
| `social-hike-buddhas-footprint-trail-2026-08-30-9099c3` | maps URL → Hmong Doi Pui Family Coffee, Doi Pui, Chiang Mai |

**Left NULL — deliberately, these belonged to no organization because none existed:**

| Event slug | Location evidence |
|---|---|
| `clarity-run-phaeng-noi-waterfall-loop-2026-02-25-jizou5` | Zoo Cafe, Ko Phangan |
| `clarity-lab-koh-phangan-2026-03-12-ad3385` | Inner Space Coworking, Ko Phangan |

**Re-verify before running.** This list is a snapshot of prod on 2026-08-28. Re-run the query and reconcile if any event was created or edited since — the migration should also assert it touched exactly 8 rows and fail loudly if not, rather than silently backfilling a different set. State the count in the migration comment.

**3 — the second organization.** Seed **Clarity Practice Community · Online**, slug `online` (D3), `visibility: public`, `has_events: true`, blurb per D7, following the existing seed pattern (`20260724120000_p1010_organizations_membership.sql:163`) plus its organizer membership row for profile slug `slava`. Idempotent `ON CONFLICT (slug) DO NOTHING`, matching the p1010 seed. No routing change is needed — `/org/:slug` is already dynamic.

**4 — each org's Events tab lists only its own events.** `EventsList` takes an optional org scope; the org page passes its own. `eventsService.getUpcomingEvents()` / `getPastEvents()` gain an optional org filter. The standalone `/events` list is unaffected and keeps showing everything.

**5 — the `/org` directory (D5).** A public route listing every `visibility='public'` organization — name, blurb, member count, and whether it has upcoming events — each linking to `/org/:slug`. Readable signed-out, like the org pages themselves. **Not** a creation surface: no "create organization" affordance appears on it (p1010 Decision 7 stands; the create-org gap is named below and owned by nobody yet).

**6 — hosting into an organization (D4).** Today the org page shows "Host Event" / "Co-create" to any logged-in visitor (`EventsList.tsx:88-101`), and files an event that belongs to nothing. In the embedded (org-page) context those actions render **only for an organizer of that org**, and the event created from there carries that org. The standalone `/events` context is unchanged.

**7 — the empty-Upcoming display (D6).** When an org's Upcoming list is empty, its Events tab shows Past under an explicit heading rather than an empty state. When both are empty, one honest line — not a bare empty list, and not an invitation to host for a visitor who may not host (D4).

## Naming — settled layers

Two of three layers are settled and used by this spec. The third moved to p1183 with the paid rung.

| Layer | What it is | Value | Owner |
|---|---|---|---|
| **Kind** | the container type; what the terms are called; what the schema calls it | **Clarity Organization** — unchanged, never marketed | settled |
| **Instance** | the communities themselves | **Clarity Practice Community · Chiang Mai**, **Clarity Practice Community · Online** | **this spec** |
| **Level** | what a member has inside an instance | free, and a paid level — name still open | **[p1183](p1183_membership_levels_and_gated_events.md)** |

The collision this resolved: `goals.md:15` and `lean-canvas.md:590` name the **€295/month paid rung** *"Clarity Practice Community"*, which is also the name of the free organizations. Applying the resolution to `lean-canvas.md` §Revenue runs through `/slava:maintain:docs-strategy-update` and belongs to p1183, since it is the *Level* row that renames the rung.

**Consequence with no owner yet:** the paid rung's month-3 milestone is *"they are running it in their own Clarity Organization"* ([goals.md](../docs/goals.md)), but no create-org capability exists for anyone — p1010 made `/org/:slug` a lookup, never a creation surface, on purpose. The milestone currently requires the founder to hand-seed an organization per member. Fine for member one; **needs its own spec before member three.** The `/org` directory in item 5 does not change this: it lists, it does not create.

## Risks / Non-Goals

### Risks

- **MITIGATE — the backfill is a historical claim, and the naive version of it is wrong.** Measured above: 2 of 10 prod events are not Chiang Mai's, and a `location` substring match would misclassify 4 of the 8 that are. Mitigation: D2 — the explicit slug list in Solution item 2, a row-count assertion in the migration, and no substring matching. Run the backfill **before** seeding org #2, so every touched row is unambiguously Chiang Mai's.
- **MITIGATE — a new public route with no prod health coverage.** [decisions.md](../docs/decisions.md) 2026-06-06 records the standing rule: *"a new public route joins `PROD_HEALTH_ROUTES` in the same diff that ships it"*, and notes that nothing mechanical enforces it. `/org` is a new public route. Mitigation: add it to `PROD_HEALTH_ROUTES` in this diff.
- **MITIGATE — RLS drift.** An org edge invites org-scoped visibility rules the current events policies do not anticipate (`SELECT USING (true)`, `20260118_create_events.sql:41`). This spec deliberately does **not** change them: an org-scoped event stays world-readable and the scoping is a query filter, not a policy. Mitigation: confirm this explicitly in the review and say so in the migration comment — the *readable-by-all / joinable-by-some* split arrives with [p1183](p1183_membership_levels_and_gated_events.md), not here.
- **MITIGATE — the D4 hosting change is a new refusal, and new refusals block work that was previously fine.** Hiding the org-page host CTA from non-organizers must not hide it from the standalone `/events` list, where any logged-in user may still host. Mitigation: [epistemic.md](../.claude/rules/epistemic.md) gate 7c — test the *allowed* path, not only the refused one: an organizer sees it on the org page, a non-organizer does not, and any logged-in user still sees it on `/events`.
- **ACCEPT — the standalone `/events` list keeps showing everything.** That is its job.
- **ACCEPT — orgless events are invisible on every org page.** The 3 Ko Phangan events, and any future ad-hoc one, appear only on `/events`. Correct under D1; if those ever need a home it is a third organization, not a change here.

### Non-Goals

- **Do NOT build payment collection, subscriptions, or billing.** No rung of the ladder is purchasable and none becomes purchasable here.
- **Do NOT build membership levels or gated events.** Split to [p1183](p1183_membership_levels_and_gated_events.md).
- **Do NOT build a create-organization flow.** `/org` lists; it never creates. Named above as a gap with no owner.
- **Do NOT change the standalone `/events` route's behavior.**
- **Do NOT change `events` RLS.** If the implementation appears to need it, stop — that is p1183's territory arriving early.
- **Do NOT backfill with a `location` substring match.** See D2.
- **Do NOT edit [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) or [p1076](done/2026-06-10/p1076_org_invite_link.md).** Both `all-done`; shipped specs are records.
- **Do NOT take the [p1110](p1110_org_invite_landing_and_cta_competition.md) fixes into this spec.** They ship independently and first.

## Done-When

- [ ] `events.org_id` exists, nullable, with a foreign key to `organization`, indexed
- [ ] The 8 listed Chiang Mai events carry the Chiang Mai organization; the 2 Ko Phangan events are NULL — backfilled before org #2 is seeded, by the explicit slug list in Solution item 2, with a row-count assertion that fails if it did not touch exactly 8
- [ ] **Clarity Practice Community · Online** exists, is reachable at `/org/online`, and has an organizer membership row
- [ ] Chiang Mai's Events tab lists only Chiang Mai's events; Online's lists only Online's — verified with at least one event in each
- [ ] `/org` lists every public organization and links to each; readable signed-out; carries no create-organization affordance
- [ ] `/org` is in `PROD_HEALTH_ROUTES` in the same diff
- [ ] An event created from an org page carries that organization
- [ ] The org-page Host Event / Co-create actions render for an organizer of that org and not for a non-organizer — **and still render for any logged-in user on the standalone `/events` list** (both halves asserted)
- [ ] An org with no upcoming events shows its past events under an explicit heading; an org with neither shows one honest line
- [ ] Events RLS explicitly confirmed unchanged, stated in the migration comment

## Superseded scope (original filing, 2026-08-13)

Filed as: add `org_id`, index it, backfill to the single existing org, review RLS — with Non-Goals *"Do NOT change event visibility or access rules here. Column and backfill only"* and *"Do NOT build the org-scoped position overview."* The second of those still stands (that is [p1055](p1055_norm_measurement_instrument.md) plus a view spec). The first is retired by the 2026-08-19 widening. Original rationale: *"Not urgent while one organization exists, which is why this is backlog and not week. It becomes blocking the moment a second one does."* — which is exactly what happened.

## References

Origin: session 2026-08-13 while scoping [p1055](p1055_norm_measurement_instrument.md) — the founder's question *"show me all points that members or guests of a given Clarity organization engaged with"* has no path in the schema. Widened 2026-08-19 from a founder screenshot review of `/org/cm`; sibling fixes in [p1110](p1110_org_invite_landing_and_cta_competition.md). Finalized 2026-08-28 via `/grill-me` — eight decisions recorded, item 5 split to [p1183](p1183_membership_levels_and_gated_events.md), `/org` directory added. `/org` deferral being closed: [decisions.md](../docs/decisions.md) 2026-07-23 [product]. New-public-route health-coverage rule: [decisions.md](../docs/decisions.md) 2026-06-06. Ladder + naming context: [goals.md](../docs/goals.md), [lean-canvas.md](../docs/lean-canvas.md) §Revenue.
