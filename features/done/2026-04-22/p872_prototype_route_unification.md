---
status: all-done
type: task
rank: 1000900
workstream: C1
tags: [prototype-routes, dev-gating, refactor, security]
created_date: '2026-06-01'
pipeline_ran: [dev, finish]
completed_at: 2026-06-01
---

# P872: Unify prototype routes under dev-gated /tree

**Type:** task (route convention + tooling)
**Branch:** feature/p872-prototype-route-unification

## Problem

Three conflicting conventions for prototype/harness routes coexisted, and one leaked to production: the `/tree/*` gallery (11 routes + hub) shipped **ungated** and was publicly reachable on the live domain; `/view` used `/_proto/{feature}`; P852 used a one-off `/_preview/letter-redesign`. Agents picked a prefix at random, and unfinished design + naming shipped to the live site.

## Solution

One prefix `/tree/*`, dev-gated by default via a single-line `{import.meta.env.DEV && <Route/>}` per route. Retire the `/_proto` and `/_preview` route prefixes (the `components/_proto/` *folder* stays).

**Bundle reality (corrected from the original plan, verified by build):** route-gating controls **reachability**, not bundling. In prod the route is unregistered (404s) and its path string leaves the always-loaded index chunk, but a `lazy(() => import())` component chunk still deploys as dead, never-fetched code. Only explicit import removal strips a chunk (re-confirms decisions.md "DEV guard only prevents rendering"). Accepted for the persistent gallery: unreachable, mock-free, no secrets.

## Acceptance Criteria

- [x] 11 `/tree/*` routes dev-gated single-line in `App.tsx`; 0 ungated
- [x] `/_preview/letter-redesign` route + import removed
- [x] Orphaned `letter-redesign-preview-page.tsx` (915 lines) deleted (proven orphan: single export, only importer was the removed route)
- [x] `/events` left ungated + marked `// PROD-REACHABLE` (live nav-linked production feature, not a prototype)
- [x] `TreePage` dev hub includes `/tree/loading-demo`
- [x] `.claude/rules/src.md`: Prototype Routes convention added (claude-md gate run first)
- [x] `docs/decisions.md`: superseding [process] entry + falsification record
- [x] `view.md` / `dev.md`: `/_proto` route refs → `/tree` (folder/import refs unchanged; step 9.6 route-path only)
- [x] `pre-commit-checks.sh`: ungated-prototype-route warning guard added
- [x] Verified end-to-end (see below)

## Verification

- `npm run build` — `/tree` route paths stripped from the always-loaded `index.js`
- Browser (production preview): `/tree` and `/tree/landing-v4` render the 404 page; `/` renders the landing page (prod app intact)
- `npm test` — 2226 passed, 0 failed
- `pre-commit-checks.sh` — green (1 expected `.claude`-on-branch warning)
- §7 guard unit-tested: fires on ungated `/tree`/`/_proto`; silent on gated, `/events`, and `PROD-REACHABLE`-marked routes

## Notes

Residual (accepted): the mechanical guard is heuristic (single-line, `App.tsx` diff only); the `src.md` convention is the backstop. Fully stripping the persistent gallery chunks would need a separate dev-only build entry — deferred; the unreachable dead chunks (no secrets) do not justify it.
