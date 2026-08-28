---
status: backlog
type: story
rank: 45
created_date: '2026-08-28'
tags: [organizations, events, roster, privacy]
blocked_by: [p1060]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: founder
---

# P1192: The people who showed up have no page

**Blocked by [P1060](p1060_link_events_to_organizations.md).** A participant is defined by an RSVP to an event *belonging to an organization*; that edge does not exist until P1060 ships. P1060 also ships the **count** — this spec is only the browsable list behind it.

## Problem

**Situation:** an organization's page has a Members tab. Membership means one thing: this person accepted the Clarity Organization Terms. Measured on prod 2026-08-28, · Chiang Mai has **1 member**. It also has **45 distinct people who RSVP'd to its events** across 8 events — none of whom appear anywhere on its page.

**Complication:** P1060 puts the *number* 45 on the card and in the header, next to a row of overlapping avatars. A number with faces beside it reads as clickable, and there is nothing to click. The count makes the absence of the list visible in a way the current page does not.

**Why it is not simply the members roster with a wider query:** the two groups mean different things and must not merge. A member made a commitment; a participant turned up. Collapsing them would inflate the membership number — which is the acceptance record for a set of terms — with people who never accepted anything.

**Question:** what does a participant roster show, and what does it withhold?

## Appetite

**Blast radius: medium** — one new read accessor over profile rows, one tab, no writes and no schema change. **Reversibility: high** — nothing is recorded; it is a view over data that already exists. **Decision density: two open** — ordering and the self-visibility question, both marked below.

## Solution

**1 — a participant roster accessor**, mirroring `get_organization_members` (`20260724120000_p1010_organizations_membership.sql`): `SECURITY DEFINER`, `SET search_path = ''`, schema-qualified, `REVOKE`-then-`GRANT`. Returns distinct profiles with an RSVP to an event whose `org_id` is the requested organization, for public organizations only.

**2 — per-row PII gating, the P877 pattern, not a blanket filter.** `reason` and `linkedin_url` are returned only for profiles that are verified **and** pledged; everyone else appears on the roster without them. The members RPC's comment is explicit that this must not become a `WHERE` that drops unverified people from the list — the same rule applies here, and the population is larger and less verified, so the temptation is stronger. **No email is ever serialized.**

**3 — a Participants tab** on the organization page, beside Members, reusing `PledgerGrid` as the Members tab does.

**4 — `[FOUNDER DECISION: ordering]`** — most-recent RSVP first, most events attended first, or organizer-style pinning. The members roster sorts organizers first then by `accepted_at`; there is no equivalent rank here.

**5 — `[FOUNDER DECISION: does a participant see themselves listed, and can they opt out?]`** RSVPs are already world-readable, so this exposes nothing the database does not already publish — but a *roster page* is a different act of publication from a row an API will return if asked. Someone who RSVP'd to a hike in February did not thereby ask to be listed as a community participant in August. Decide before building, not after someone asks.

## Risks / Non-Goals

### Risks

- **MITIGATE — the roster is a new act of publication over old data.** Item 5 owns it. Do not treat "the RLS already allows it" as the answer; that argument would justify publishing anything world-readable.
- **MITIGATE — blanket-filtering the roster to verified+pledged.** The failure the members RPC was written to avoid. Prove an unverified participant still appears, without PII — assert the *presence*, not only the redaction ([epistemic.md](../.claude/rules/epistemic.md) gate 7c).
- **MITIGATE — participants silently becoming members.** The two counts must stay separately derived. A test should assert · Chiang Mai reads 1 member and 45 participants, not 46 of anything.
- **ACCEPT — RSVP is not attendance.** Inherited from P1060; the label carries it, the data cannot.

### Non-Goals

- **Do NOT change `event_rsvps` RLS.** It is already `SELECT USING (true)`; this spec reads, it does not widen.
- **Do NOT merge participants into the member count**, or into `membership`. A participant has accepted no terms.
- **Do NOT add attendance tracking.** A separate capability nobody has requested.
- **Do NOT start before [P1060](p1060_link_events_to_organizations.md) ships.**

## Done-When

- [ ] The ordering decision and the self-visibility decision are recorded in this spec before building
- [ ] A participant roster accessor exists, gated per-row on verified+pledged, serializing no email
- [ ] An unverified participant **appears** on the roster without PII — asserted, not assumed
- [ ] A Participants tab renders it, distinct from Members
- [ ] · Chiang Mai reads 1 member and 45 participants, derived separately — asserted
- [ ] A private organization's participant roster is not readable by anyone outside it

## References

Split from [P1060](p1060_link_events_to_organizations.md) 2026-08-28 (D11) — that spec ships the count and the avatar row, this one the browsable list. Roster + PII-gating pattern to mirror: [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) and its `get_organization_members` RPC. Per-row gating rationale: P877. Prod measurement (45 participants / 1 member, read-only anon query): 2026-08-28.
