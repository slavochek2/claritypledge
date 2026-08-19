---
status: week
type: story
rank: 43
created_date: '2026-08-13'
tags: [organizations, events, schema, membership]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1060: Events belong to an organization — and the second organization that needs it

> **[WIDENED 2026-08-19 — founder decision.]** Filed 2026-08-13 as a schema placeholder (`events.org_id`, column + backfill, *"Do NOT change event visibility or access rules here"*). That Non-Goal is **retired, deliberately**, because the condition it was waiting for arrived: the founder wants a **second Clarity Organization for online events**. The column alone does not make two organizations usable — see Problem — so shipping it without the surfaces that read it leaves the visible defect in place on the day org #2 appears. The original narrow scope is preserved at the bottom under *Superseded scope*.

## Problem

**Situation:** `events` has `host_id → profiles` and no organization reference. [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) shipped `organization` + `membership`, so multiple organizations are already structurally supported — the only missing edge is from an event to the org that holds it. `organization.has_events` is a *display toggle* for whether the Events tab renders (`org-page.tsx:285`), not a filter; the embedded list calls `eventsService.getUpcomingEvents()` / `getPastEvents()` with no org argument (`EventsList.tsx:41-43`).

**Complication:** the founder is creating a second organization — **Clarity Practice Community · Online** — to host online events, alongside the existing **· Chiang Mai**. On the day it exists, both pages list the same events: Chiang Mai shows the online sessions, Online shows the Chiang Mai ones. The "Past (9)" visible on the org page today is not Chiang Mai's nine; it is every event on the platform. Two organizations is therefore *worse* than one until this edge exists.

**Second complication (2026-08-19):** the funnel ladder in [goals.md](../docs/goals.md) puts a **paid rung** after the free events. The founder's resolution is that the paid rung is **not a third community** — it is a **membership level inside an existing one**, expressed as events only paid members can join, visible to everyone as the upgrade path. That requires an event to know which org it belongs to (this spec) and a membership to know its level.

**Question:** what does an event belong to, who may host into it, who may attend it, and what does a free member see when the answer is "not you"?

## Appetite

**Blast radius: high** — one nullable column is low, but the surfaces reading it are the org page, the events list, event creation, and the join flow; a membership level touches the acceptance record that IS the terms acceptance. **Reversibility: medium** — the column and the seed are revertible; a membership level written onto real rows is not, once anyone has paid. **Decision density: several open** — nullability, the level's shape, and the gated-event presentation are all unsettled and marked below.

## Solution

**1 — the edge.** `org_id UUID REFERENCES public.organization(id)` on `public.events`, indexed, existing rows backfilled to the Chiang Mai org. **`[FOUNDER DECISION: nullable, or required?]`** — nullable admits events belonging to no organization (the current webinar/experiment series may be exactly that); required forces every event into one and makes the backfill a claim about history. Record the answer in this spec *before* the migration runs.

**2 — the second organization.** Seed **Clarity Practice Community · Online**, `visibility: public`, `has_events: true`, following the existing seed pattern (`20260724120000_p1010_organizations_membership.sql:163`) plus its organizer membership row. **`[FOUNDER DECISION: slug]`** — proposed `online`, giving `/org/online` alongside `/org/cm`. No routing change is needed; `/org/:slug` is already dynamic and p1010 records the slug as a lookup key, not a creation surface.

**3 — each org's Events tab lists only its own events.** `EventsList` takes an optional org scope; the org page passes its own. The standalone `/events` list is unaffected.

**4 — hosting into an organization.** Today an org page shows "Host Event" / "Co-create" to any logged-in visitor (`EventsList.tsx:88-101`), which reads as an invitation to host into a community you may not even belong to, and files an event that belongs to nothing. **`[FOUNDER DECISION: who may host into an org — organizers only, any member, or anyone?]`** Whatever the answer, an event created from an org page must carry that org.

**5 — membership levels, and events only some members may join.** Add a level to `membership` (today `role` is `member | organizer` with no notion of paying — `20260724120000_p1010_organizations_membership.sql:64`). A gated event appears on the org page for everyone and is **joinable only at the required level**; for a free member it renders as the visible upgrade, not as an absence. **`[FOUNDER DECISION: the level's name — the paid rung must no longer be called "Clarity Practice Community", which is now the name of the communities themselves.]`** See *Naming, resolved* below.

**6 — the empty-Upcoming display decision, deferred here on purpose.** With zero upcoming and nine past events, the org reads as dead to an invited stranger. **`[FOUNDER DECISION: show past events when upcoming is empty?]`** Held until this spec lands, because until events are org-scoped the "9" is the wrong number and any rule would be tuned against it. Raised by the founder 2026-08-18; carried here from [p1110](p1110_org_invite_landing_and_cta_competition.md).

## Naming, resolved (2026-08-19, founder decision)

The collision: `goals.md:15` and `lean-canvas.md:590` name the **€295/month paid rung** *"Clarity Practice Community"*, while the free organization seeded 2026-07-24 is *"Clarity Practice Community · Chiang Mai"* — one name, one free thing and one paid thing. Resolution, three layers:

| Layer | What it is | Value |
|---|---|---|
| **Kind** | the container type; what the terms are called; what the schema calls it | **Clarity Organization** — unchanged |
| **Instance** | the communities themselves | **Clarity Practice Community · Chiang Mai**, **Clarity Practice Community · Online** |
| **Level** | what a member has inside an instance | free (today's `member`) and paid — **`[FOUNDER DECISION: name]`** |

The paid rung stops being a separately-named product. `goals.md` and `lean-canvas.md` both need this applied — `lean-canvas.md` §Revenue via `/slava:maintain:docs-strategy-update`, since it may move a canvas slot.

**Consequence to hold, not solve here:** the ladder describes the paid rung as *3–10 people, weekly* — a cohort. Under this model that property comes from the size of the paid roster, not from a wall, so it holds while paid members number 3–10 and stops holding at 30. Cap or split then; nothing to build now.

**Consequence with no owner yet:** the paid rung's month-3 milestone is *"they are running it in their own Clarity Organization"* ([goals.md](../docs/goals.md)), but no create-org capability exists for anyone — p1010 made `/org/:slug` a lookup, never a creation surface, on purpose. The milestone currently requires the founder to hand-seed an organization per member. Fine for member one; **needs its own spec before member three.** Not in scope here.

## Risks / Non-Goals

### Risks

- **MITIGATE — RLS drift.** An org edge invites org-scoped visibility rules the current events policies do not anticipate, and item 5 makes that concrete rather than hypothetical: a gated event must be *readable* by everyone and *joinable* by some. Mitigation: state that split explicitly in the policy, and prove both halves — a free member can see the event and cannot RSVP to it — rather than testing only the denial.
- **MITIGATE — a membership level sits on the terms-acceptance record.** The `membership` row IS the acceptance record (`accepted_at`, `terms_version`), and leaving deletes it (`org-header.tsx` leave flow). A paid member who leaves would destroy their own payment linkage. Mitigation: decide before building whether level lives on `membership` or beside it, and what leaving means for someone who is paying.
- **MITIGATE — backfill is a historical claim.** Trivially correct today (one org); the moment org #2 exists it is a judgment about which community each past event belonged to. Mitigation: backfill **before** seeding the second org, so every existing row is unambiguously Chiang Mai's.
- **ACCEPT — the standalone `/events` list keeps showing everything.** That is its job.

### Non-Goals

- **Do NOT build payment collection, subscriptions, or billing.** Item 5 is the *level* and what it gates. How someone becomes paid is out of scope.
- **Do NOT build a create-organization flow.** Named above as a gap with no owner; it needs its own spec.
- **Do NOT change the standalone `/events` route's behavior.**
- **Do NOT run the migration before the nullability decision is written into this spec.**
- **Do NOT edit [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) or [p1076](done/2026-06-10/p1076_org_invite_link.md).** Both `all-done`; shipped specs are records.
- **Do NOT take the [p1110](p1110_org_invite_landing_and_cta_competition.md) fixes into this spec.** They ship independently and first.

## Done-When

- [ ] Nullability decision recorded in this spec before the migration runs
- [ ] `events.org_id` exists with a foreign key to `organization`, indexed
- [ ] Existing event rows carry the Chiang Mai organization, backfilled before org #2 is seeded
- [ ] **Clarity Practice Community · Online** exists and is reachable at its own address
- [ ] Chiang Mai's Events tab lists only Chiang Mai's events; Online's lists only Online's — verified with at least one event in each
- [ ] An event created from an org page carries that organization
- [ ] Events RLS reviewed and explicitly confirmed unchanged, or changed with its own review
- [ ] A membership carries a level, and a gated event is visible to a free member and not joinable by them
- [ ] The empty-Upcoming display decision is recorded (either implemented or explicitly declined)

## Superseded scope (original filing, 2026-08-13)

Filed as: add `org_id`, index it, backfill to the single existing org, review RLS — with Non-Goals *"Do NOT change event visibility or access rules here. Column and backfill only"* and *"Do NOT build the org-scoped position overview."* The second of those still stands (that is [p1055](p1055_norm_measurement_instrument.md) plus a view spec). The first is retired by the widening above. Original rationale: *"Not urgent while one organization exists, which is why this is backlog and not week. It becomes blocking the moment a second one does."* — which is exactly what happened.

## References

Origin: session 2026-08-13 while scoping [p1055](p1055_norm_measurement_instrument.md) — the founder's question *"show me all points that members or guests of a given Clarity organization engaged with"* has no path in the schema. Widened 2026-08-19 from a founder screenshot review of `/org/cm`; sibling fixes in [p1110](p1110_org_invite_landing_and_cta_competition.md). Ladder + naming context: [goals.md](../docs/goals.md), [lean-canvas.md](../docs/lean-canvas.md) §Revenue.
