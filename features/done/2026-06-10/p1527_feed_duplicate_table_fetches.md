---
status: all-done
type: task
rank: 51
workstream: infrastructure
created_date: '2026-10-21'
tags: [performance, supabase, egress, feed]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
completed_at: 2026-10-21
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

- [x] Baseline per-table counts for one `/feed` load recorded in this spec, with the command used — see Measurements
- [x] After the change, `stories` and `events` are each requested at most twice per `/feed` load, same command — stories 2 ✅; events 4 (prod-equivalent), accepted by founder decision 2026-10-21: the 4 are distinct queries totalling ~4 KiB, and reaching 2 needs a cross-query cache whose write invalidation is the stale-data class review kept finding
- [x] Each remaining duplicate is attributed (StrictMode-only or a named reason) — see Measurements
- [x] Feed renders the same content before and after (screenshot comparison, signed-in and signed-out) — 0 differing pixels vs merge-base at 1280 and 390, signed-out and signed-in (TEST user in 2 groups); noise control 0 px, positive control 11,683 px
- [x] Existing unit/e2e tests touching feed pass — `npm test`: 586 files / 6460 tests passed, 0 failed; `tsc --noEmit` clean (e2e lane not run)

## Measurements

Command: `node scripts/measure-idle-requests.mjs --base http://localhost:<port> --paths /feed --minutes 1 --settle 0 --from-navigation`, warm dev server. "Prod-equivalent" = same build with `<React.StrictMode>` removed temporarily (StrictMode doubles every mount effect in dev only).

| | dev before | dev after | prod-equiv before | prod-equiv after |
|---|---|---|---|---|
| total | 27 | 23 | 17 | 15 |
| `events` | 8 | 6 | 5 | 4 |
| `stories` | 6 | 4 | 3 | 2 |
| `event_rsvps` | 3 | 3 | 2 | 2 |

Most of the 27 was StrictMode doubling, which production never makes. Real cuts: the pinned story loads by slug in one request (was `resolveStorySlug` + `getStory`); the home side rail reads all groups' upcoming events in one `.in('org_id')` query plus one RSVP batch (was one pair per group). Remaining prod `events` reads are four distinct queries: public-window candidates (`useTonightsEvent`), the nav's unscoped upcoming list (`useNextWebinar`), topic tags, and the side rail.

## Known Limitations

- An in-flight request dedupe was built and then removed: it saved only StrictMode dev doubles, and every write path (including a background banner update and account erasure) had to invalidate it or it served pre-write data (Codex/Gemini review).
- The combined side-rail query shares PostgREST's 1000-row response cap across groups instead of per group. ACCEPT: far below current volume.
- No test covers the error path of `getUpcomingEventsByOrg`; behaviour is unchanged from the per-group read (errors yield empty lists).

## Related

- p1522 (egress: offline pack, measurement method)
