---
status: backlog
type: task
rank: 1000091
severity: low
date_reported: '2026-09-05'
created_date: '2026-09-05'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [hardening, query-limits, pagination, follow-up]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1254: `boundedInList` guards 1 of 45 call sites, and `get_pledgers_page` has no offset ceiling

## Problem

**Situation:** P1229 removed an unbounded `.in()` list on `/pledgers` — the client was asking the
gateway for `witnesses?profile_id=in.(<~5.2k ids>)`, a URL it refuses with
`net::ERR_HTTP2_PROTOCOL_ERROR`. Two hardening items were found during that spec's review, both
verified by command, neither in that spec's scope.

**Complication:** each needs a decision rather than a patch, which is why they were not folded into
P1229's fix commit.

1. **`boundedInList` guards one call site out of 45.** `grep -rn '\.in(' src/app/data/*.ts` (test
   files excluded) returns **45** call sites passing a caller- or db-sized id list. `grep -rn
   'boundedInList' src/` returns exactly one non-test consumer: `api.ts:230`
   (`getFeaturedProfiles.witnesses`) — where the list is already bounded to 6 by construction, so
   the guard is a no-op at the only place it is installed. The class of bug it exists to catch is
   structurally reachable from any of the other 44 sites whose id source can grow unbounded.
2. **`get_pledgers_page` clamps `p_limit` but not `p_offset`.** `p_limit` is correctly clamped to
   1..100, which is what closes the original unbounded-fetch hole. `p_offset` is floored at 0 with
   no ceiling, so a caller could pass `p_offset = 999999999` and make Postgres walk that many rows
   before applying `LIMIT`. Not reachable from the shipped client — `getVerifiedProfilesPage` only
   ever sends bounded page-sized offsets — and the function is `anon`-executable on a public route.

**Question:** which of the 44 unguarded sites actually have an unbounded id source, and is an
offset ceiling worth a migration given the current pending-deploy backlog?

## Appetite

Small for (2), medium for (1) — the work in (1) is the audit, not the edit. Blast radius: (1) is
read-mostly with a one-line change per genuinely-unbounded site; (2) is one `CREATE OR REPLACE`.

## Solution / Approach

**For (1):** classify all 45 sites by whether the id list is bounded by construction (a fixed cap, a
page size, a single parent's children) or by data volume (every row a user owns, every member of an
org). Only the latter need the guard. Produce the classification first — a blanket wrap of all 45
would add a throw path to 44 places that cannot reach it.

**For (2):** `[FOUNDER DECISION]` — adding a ceiling means one more migration on top of the **37
already pending on prod** (measured 2026-09-05). Options: fold it into the next migration that
touches this function anyway; ship it standalone; or decline it as unreachable-by-construction and
record that. Recommend folding, not standalone.

## Risks / Non-Goals

- **Non-goal:** wrapping all 45 sites mechanically. The guard throws in dev; adding it where the
  list is bounded by construction adds a failure path that can never fire and obscures the ones
  that can.
- **Non-goal:** any change to `p_limit` clamping — that is correct and is the actual fix P1229
  shipped.
- **Risk:** the classification in (1) is the deliverable and is where the judgement is. A wrong
  "bounded by construction" call leaves the original bug reachable at that site.

## Done-When

- [ ] All 45 `.in()` call sites in `src/app/data/*.ts` classified bounded-by-construction vs
      bounded-by-data-volume, with the bound named for each
- [ ] `boundedInList` applied to every site in the second class, and to none in the first
- [ ] A test that the guard actually fires — an unbounded list at a real call site throws in dev
      (per epistemic gate 7: a gate not seen to fail is unproven)
- [ ] `p_offset` ceiling decided: applied, folded into another migration, or declined with the
      reason recorded here
- [ ] `npx vitest run` and `./scripts/pre-commit-checks.sh` green

## Provenance

Both items surfaced in the P1229 code and migration reviews (2026-09-05) and were verified by
command before filing: the 45-site count and the single `boundedInList` consumer by `grep`, the
`p_limit`/`p_offset` asymmetry by reading
`supabase/migrations/20260902000000_p1229_get_pledgers_page.sql`. Neither was a P1229 scope failure
— that spec targeted `/pledgers`.
