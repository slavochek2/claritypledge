---
status: week
type: task
rank: 51
workstream: infrastructure
created_date: '2026-10-21'
tags: [performance, supabase, egress, feed]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1527: One /feed load fetches the same tables several times

## Problem

**Situation:** One fresh `/feed` load makes 27 Supabase requests: `stories` 6 times, `events` 8 times
(measured during P1522 with `scripts/measure-idle-requests.mjs`).
**Complication:** The Supabase free plan is over its egress quota. Every duplicate request is paid on
every page load, by every fresh browser (users, e2e contexts, crawlers).
**Question:** Why is the same data fetched several times (StrictMode double effects, several components
each fetching, re-renders resetting effects), and how do we collapse it without changing what renders?

> Founder framing: "Find why the same data is fetched several times … and collapse it without changing what the page shows."

Promoted from the task inbox, 2026-10-21.

## Appetite

Blast radius: medium (feed and any shared hook it uses, e.g. `useTonightsEvent`, which every Back
control reads). Reversibility: high (code only, git revert). Decision density: zero.

## Solution

1. Baseline: `node scripts/measure-idle-requests.mjs --paths /feed --minutes 1 --settle 0 --from-navigation`
   against localhost; record per-table counts and which call sites issue them.
2. Attribute each duplicate to its cause (StrictMode dev-only double effect vs. real production
   duplication from several consumers or re-render loops). StrictMode-only duplicates do not ship to prod;
   say which ones they are rather than "fixing" them away.
3. Collapse real duplicates with the repo's existing data-fetching pattern (`.claude/rules/src.md`):
   share one fetch across consumers / dedupe in-flight requests, stabilise effect dependencies.
4. Re-measure with the same command.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A shared cache serves stale data after a mutation (new story, RSVP) | MITIGATE | Invalidate on the same writes that refetch today; check feed after posting |
| Dev count includes StrictMode doubles that prod never makes | MITIGATE | Report dev count and attribute StrictMode-only calls separately |
| `useTonightsEvent` change affects Back controls site-wide | MITIGATE | Keep its contract; it must still tolerate a missing AuthProvider |

**Non-Goals**
- Do NOT touch the offline pack (`src/lib/offline-pack.ts`, `offline-pack-preloader.tsx`) — P1522 just changed it.
- Do NOT change what the feed renders, its ordering, or pagination.
- Do NOT add a new data-fetching library.

## Invariants

- Measurement is navigation-inclusive with the same command before and after (decisions.md 2026-10-21, P1522).

## Done-When

- [ ] Baseline per-table counts for one `/feed` load recorded in this spec, with the command used
- [ ] After the change, `stories` and `events` are each requested at most twice per `/feed` load, same command
- [ ] Each remaining duplicate is attributed (StrictMode-only or a named reason)
- [ ] Feed renders the same content before and after (screenshot comparison, signed-in and signed-out)
- [ ] Existing unit/e2e tests touching feed pass

## Related

- p1522 (egress: offline pack, measurement method)
