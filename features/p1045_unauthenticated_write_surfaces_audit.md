---
status: week
type: bug
rank: 1000965.0
severity: high
created_date: '2026-08-11'
tags: [security, rls, anonymous-writes]
driver: anomaly
feature_type: backend
---

# P1045: Tables writable by unauthenticated callers — decide intent, then close or document

## Problem

P1038's audit only asked whether INSERT binds an *owner column*. Two surfaces fell outside
that question entirely and are open to unauthenticated writers on production:

1. **A table with no owner column at all**, carrying two INSERT policies both checking
   nothing, one reaching the anon role. It has no ownership concept, so P1038's classifier
   correctly declined to flag it — and nothing else looks at it. Reads are locked down, so
   this is a write/pollution surface rather than a disclosure one. It may well be intentional
   for anonymous capture; nobody has decided.

2. **A table whose "tightened" UPDATE policy is itself unrestricted.** The migration that
   tightened it says so in its own comment: RLS cannot see session ownership for anonymous
   users, so the policy stays permissive and enforcement is app-layer only. That is a
   documented accepted risk — but it is accepted in a migration comment, not in any spec,
   decision log, or risk register, so it is invisible to every audit that does not happen to
   read that file.

Table names and policy text in `.private/docs/security-log.md` (2026-08-10).

The pattern connecting them: **an audit scoped to one bug class certifies nothing about the
classes beside it.** P1038 will end with a per-table BOUND/NOT-APPLICABLE table that a future
reader could easily mistake for "these tables are safe."

## Appetite

Mostly a decision, not a build. The founder call is whether anonymous writes to these
surfaces are wanted. If yes, the work is documenting the acceptance where an auditor will
find it. If no, it is rate limiting or an authenticated path — a real feature, and this spec
should split.

## Solution

1. Enumerate every table where an unauthenticated caller can write: cross `pg_policies` for
   permissive INSERT/UPDATE policies reaching `public`/`anon` against `role_table_grants`.
   Live query, both environments — files are not evidence (P1042).
2. For each, classify: intended anonymous surface / unintended / already-accepted-in-a-comment.
3. For intended ones, record the acceptance somewhere durable — `docs/decisions.md` with a
   falsifier, not a migration comment.
4. For unintended ones, close them, canary first (gate 7).
5. Add the "no owner column" case to P1038's findings table as an explicit status, so the
   audit cannot be read as certifying tables it never examined.

## Risks / Non-Goals

### Risks
- **Breaking anonymous product flows.** MITIGATE — enumerate callers before closing anything.
  Anonymous capture is a deliberate part of this product.
- **Treating a migration comment as sufficient documentation.** ACCEPT-then-fix — that is
  precisely how surface 2 stayed invisible.

### Non-Goals
- Do NOT fold in the ownership-binding forgery (P1043) — different class.
- Do NOT build rate limiting here; if that is the answer, split it out.

## Done-When

- [ ] Every unauthenticated write surface enumerated from live state, both environments
- [ ] Each classified intended / unintended, with the founder's call recorded
- [ ] Intended ones documented in `docs/decisions.md` with a falsifier
- [ ] Unintended ones closed, each with a canary observed failing first
- [ ] P1038's findings table carries an explicit "no owner column — not examined" status
