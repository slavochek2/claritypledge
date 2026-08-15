---
status: backlog
type: task
rank: 90
created_date: '2026-08-13'
tags: [organizations, events, schema]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1060: Link events to organizations (`events.org_id`)

## Problem

`events` has `host_id → profiles` and no organization reference. [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) shipped `organization` + `membership`, so multiple organizations are already structurally supported — the only missing piece is the edge from an event to the org that holds it.

**Consequence today:** there is no query for *"everything that happened under organization X"* — which events it ran, who attended, and (once [p1062](./archive/2026-08/p1062_cmp_position_battery.md) exists) what positions its members and guests staked. Every such question currently has to be answered by hand.

Not urgent while one organization exists, which is why this is backlog and not week. It becomes blocking the moment a second one does.

## Appetite

**Blast radius: low.** One nullable column, one index, one RLS review.
**Reversibility: high** for the column; **low** for backfill decisions once rows carry an org.
**Decision density: one** — whether `org_id` is nullable (events with no org) or required with a default org.

## Approach

Add `org_id UUID REFERENCES public.organization(id)` to `public.events`, index it, backfill existing rows to the single existing organization, and review the events RLS policies for whether org membership should gate anything.

Filed as a placeholder — the schema decision above is the real content and it is not settled.

## Risks / Non-Goals

### Risks

- **MITIGATE — RLS drift.** Adding an org edge invites org-scoped visibility rules that the current policies do not anticipate. Mitigation: this spec changes the schema only; any visibility change is a separate spec with its own review.
- **ACCEPT — backfill is trivially correct today** (one org) and will not be later.

### Non-Goals

- **Do NOT change event visibility or access rules here.** Column and backfill only.
- **Do NOT build the org-scoped position overview** — that is [p1062](./archive/2026-08/p1062_cmp_position_battery.md) plus a view spec.
- **Do NOT edit [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md).** It is `all-done`; shipped specs are records.

## Done-When

- [ ] `events.org_id` exists with a foreign key to `organization`
- [ ] Existing event rows carry the current organization
- [ ] Nullability decision recorded in the spec before the migration runs
- [ ] Events RLS reviewed and explicitly confirmed unchanged, or changed in a separate spec

## References

Origin: session 2026-08-13 while scoping [p1055](p1055_norm_measurement_instrument.md) — the founder's question *"show me all points that members or guests of a given Clarity organization engaged with"* has no path in the schema.
