---
status: backlog
type: story
rank: 44
created_date: '2026-08-28'
tags: [organizations, membership, events, pricing, schema]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: founder
---

# P1183: A membership carries a level, and some events only paid members may join

> **Split out of [p1060](p1060_link_events_to_organizations.md) on 2026-08-28 (founder decision).** P1060 was widened 2026-08-19 to carry both the org↔event edge *and* the paid membership level. They have different blast radii and different readiness: the edge is reversible schema-and-UI work that unblocks the second organization this week; the level writes onto the row that **is** the Clarity Organization Terms acceptance record, is irreversible once anyone has paid, and has nothing to attach to — **zero paid members exist and no payment collection is built**. P1060 keeps items 1–4 plus the `/org` directory. This spec owns item 5.

## Problem

**Situation:** `membership.role` is `member | organizer` with no notion of paying (`20260724120000_p1010_organizations_membership.sql:64`). The funnel ladder in [goals.md](../docs/goals.md) puts a **paid rung** after the free events, and the 2026-08-19 naming resolution settled that this rung is **not a third community** — it is a **level inside an existing instance**, expressed as events only paid members may join, visible to everyone as the upgrade path.

**Complication:** the `membership` row IS the terms-acceptance record — it carries `accepted_at` and `terms_version`, and the leave flow **deletes** it (`org-header.tsx`). A paid member who leaves would destroy their own payment linkage. A level written naively onto that row inherits every one of its lifecycle rules, including deletion.

**Second complication:** the level's whole product purpose is a *visible* lock — a free member must **see** the paid event sitting there and be unable to join it. That is a deliberate split in the RLS: readable by everyone, joinable by some. The current events policies know nothing of it (`SELECT USING (true)`, `20260118_create_events.sql:41`).

**Question:** where does the level live so that leaving does not erase it, what is it called, and what does a free member see when the answer to "can I join" is no?

## Appetite

**Blast radius: high** — touches the acceptance record, adds the first non-trivial RLS split on `events`, and changes what an org page shows to a logged-in non-payer. **Reversibility: low once anyone has paid** — a level on a real membership row is a financial record from that moment. **Decision density: two open** — the level's storage shape and its name, both marked below.

## Solution

**1 — the level's storage shape. `[FOUNDER DECISION: on `membership`, or beside it?]`** Two candidates, decide before the migration:

| Option | Shape | Leaving means | Cost |
|---|---|---|---|
| **On `membership`** | `level TEXT NOT NULL DEFAULT 'free'` on the existing row | the level dies with the acceptance record | one column; but leaving destroys payment linkage — needs the leave flow changed to a soft state, which changes what "acceptance" means |
| **Beside it** | new `membership_level` row keyed on `(org_id, user_id)` | the acceptance record goes; the level row survives and can be re-attached | one more table; keeps the acceptance record's meaning untouched |

**Recommendation to argue against first:** the current state may already suffice for member one — a single paid member can be tracked out-of-band while payment collection does not exist. The reason to build anyway is that the *visible lock* is the upgrade path (goals.md falsifier), and that cannot be faked out-of-band.

**2 — the level's name. `[FOUNDER DECISION: name]`** The paid rung must no longer be called "Clarity Practice Community" — that is now the name of the communities themselves. Three-layer resolution, from [goals.md](../docs/goals.md) and carried in p1060:

| Layer | What it is | Value |
|---|---|---|
| **Kind** | the container type; what the terms are called; what the schema calls it | **Clarity Organization** — settled |
| **Instance** | the communities themselves | **Clarity Practice Community · Chiang Mai**, **· Online** — settled (p1060) |
| **Level** | what a member has inside an instance | free (today's `member`) and paid — **open** |

**3 — an event may require a level.** A column on `events` naming the level required to RSVP (NULL = open to all). Set at creation from the org page.

**4 — the RLS split, proven in both directions.** A gated event is **readable by everyone** and **RSVP-able only at the required level**. The policy change lands on `event_rsvps`, not on `events` — `events` stays world-readable, which is what makes the lock visible.

**5 — the free member's view.** A gated event renders on the org page as the visible upgrade, not as an absence: shown, labelled, with the join action replaced by the upgrade path. **`[FOUNDER DECISION: the upgrade CTA's wording and destination]`** — there is no checkout to point at.

## Risks / Non-Goals

### Risks

- **MITIGATE — the level sits on the terms-acceptance record.** Decided by item 1 before any migration runs. Whichever shape wins, state explicitly what leaving does to a paying member.
- **MITIGATE — testing only the denial.** The product value is the *visible* half. Prove both: a free member **can see** the gated event, and **cannot RSVP** to it. A suite containing only rejections leaves the visible half unverified ([epistemic.md](../.claude/rules/epistemic.md) gate 7c).
- **MITIGATE — a level with no way to reach it.** Until payment collection exists, the only path from free to paid is the founder setting a column by hand. That is fine for member one and misleading on the page if the CTA implies self-serve. Item 5's wording carries this.
- **ACCEPT — the cohort property drifts.** The ladder describes the paid rung as *3–10 people, weekly*. Under a level-inside-an-instance model that comes from the size of the paid roster, not from a wall. Holds at 3–10, stops holding at 30; cap or split then.

### Non-Goals

- **Do NOT build payment collection, subscriptions, checkout, or billing.** This spec is the *level* and what it gates. How someone becomes paid is out of scope and has no spec yet.
- **Do NOT build a create-organization flow.** Named in p1060 as a gap with no owner; still needs its own spec before paid member three (the rung's month-3 milestone requires it).
- **Do NOT start before [p1060](p1060_link_events_to_organizations.md) has shipped.** Without `events.org_id` there is no organization for a level to be scoped to.
- **Do NOT rename the organizations or the container kind.** Those two layers are settled; only the Level row is open.

## Done-When

- [ ] The level's storage shape is decided and recorded in this spec before the migration runs
- [ ] The level's name is decided and recorded, and applied to [goals.md](../docs/goals.md) and [lean-canvas.md](../docs/lean-canvas.md) §Revenue via `/slava:maintain:docs-strategy-update`
- [ ] A membership carries a level; every existing membership is `free`
- [ ] What leaving does to a paying member is stated in the migration comment and proven by a test
- [ ] An event can require a level; events with no requirement behave exactly as today
- [ ] A free member **sees** a gated event on the org page — asserted, not assumed
- [ ] A free member **cannot** RSVP to a gated event — asserted at the RLS level, not only in the UI
- [ ] The upgrade CTA's wording and destination are recorded (either implemented or explicitly declined)

## References

Split from [p1060](p1060_link_events_to_organizations.md) 2026-08-28. Ladder + naming resolution: [goals.md](../docs/goals.md) §NAMING + TIER RESOLUTION 2026-08-19 (falsifier: if free members who have seen locked paid events for ~3 months convert no better than event attendees who never joined an org, in-page visibility is not an upgrade path and the level should be sold from stage instead). Container + membership schema: [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md). Membership-as-acceptance-record: [decisions.md](../docs/decisions.md) 2026-07-23 [product].
