---
status: backlog
type: bug
disclosure: public
rank: 254
severity: low
workstream: infra
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: opus
exec_model: sonnet
exec_effort: low
tags: [security, rls, privacy, events, witnesses, decision]
delivery_stage: create-bug
pipeline_ran: [create-bug, inline]
---

# P1226: Public SELECT on `event_rsvps` and `witnesses` — record the intent or scope it

## Summary

Both tables carry a `SELECT … USING (true)` policy on prod. `event_rsvps` exposes which
profile RSVP'd to which event plus mail-provider message ids; `witnesses` exposes witness names
and LinkedIn URLs. Attendee lists and public endorsements are plausibly by design
(`.claude/rules/database.md` documents the `witnesses` INSERT rule but not its read scope), yet
`grep -n "event_rsvps" docs/decisions.md` finds no ruling on RSVP visibility. Found as G7 of the
2026-09-01 general security sweep (`.private/docs/security-log.md`, that date). **This spec is a
decision, not necessarily a code change.**

## Root Cause

Read scope was never decided explicitly; the policies were created open at table creation.

## Reproduction Steps

Prod policy snapshot (read-only, `pg_policies`), 2026-09-01. Not re-exercised.

## Expected Behavior

One of: (a) a `docs/decisions.md` entry stating that attendee lists and witness endorsements are
public by design (then close this spec with no code change), or (b) RSVP reads scoped to
`authenticated` and/or the `mailgun_message_ids` column revoked from `anon`/`authenticated`.

## Actual Behavior

Anyone holding the anon key can list every RSVP and every witness row.

## Affected Files

- migrations defining the `event_rsvps` and `witnesses` SELECT policies
- `docs/decisions.md` (the missing ruling)
- `src/app/data/api.ts` / event pages, if reads are narrowed (attendee avatars on event pages)

## Severity

**Low** — data already shown on public pages; the operational column (`mailgun_message_ids`)
is the only piece with no product reason to be readable.

## Fix Approach

`[FOUNDER DECISION: are RSVP lists public?]` Recommend: keep `witnesses` public (it is the
product's public signature wall, P877 pattern), keep RSVP *presence* public, and column-revoke
`mailgun_message_ids` from client roles regardless — no page reads it.

## Acceptance Criteria

- [x] Decision recorded in `docs/decisions.md` with the date and the reasoning —
      [decisions.md](../docs/decisions.md) 2026-10-14 [security] "RSVP lists and witness
      endorsements are public by design; email bookkeeping is not" (founder decision 2026-10-14,
      Status: accepted, with falsifier)
- [x] If narrowed: anon GET on the affected column/table returns 42501 or an empty set, and event pages still render attendees for the audience the decision names
      — narrowed at the column level only, by `20261008220000_p1321_event_rsvps_column_grants.sql`
      (in `origin/main`'s deploy manifest `[prod].migrations`). Prod 2026-10-14: an anonymous REST
      GET selecting `mailgun_message_ids` (or a scheduling column) returns **42501**, while the same
      GET selecting the attendee columns with the profile embed returns **200** with rows; the
      catalog agrees column by column (the four attendee columns readable by `anon` and
      `authenticated`, the six bookkeeping columns readable by neither; control: `service_role`
      reads all ten). Row visibility on both tables is unchanged, as decided

## Closure (2026-10-14)

Founder decision 2026-10-14: RSVP lists are public by design; witness rows, including the LinkedIn
URL, are deliberately public (a public attestation, the opposite contract from a member's own
LinkedIn field). The one code change this spec recommended regardless — withholding the
mail-provider ids from client roles — had already shipped under P1321. This spec records no
implementation of its own: `inline` in `pipeline_ran` records the closure verification done inline
on 2026-10-14, not code.
