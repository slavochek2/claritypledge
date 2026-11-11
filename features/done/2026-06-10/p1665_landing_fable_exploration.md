---
status: all-done
type: task
rank: 1
workstream: landing
created_date: '2026-11-11'
tags: [landing, design-exploration, prototype]
disclosure: public
pipeline_ran: [dev, create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
completed_at: 2026-11-11
---

# P1665: Keep the /tree/landing-fable design exploration on main

## Problem

**Situation:** A visual redesign of the `/builders` landing was built on `feature/p1665-landing-redesign-exploration` as a dev-only prototype at `/tree/landing-fable`. It keeps the same copy and shared components and changes only the layout: a divergence hero graphic, numbered left-aligned sections, and dark bands for the stake and the promise.
**Complication:** The founder likes it, but one outside reader preferred the old style. They said it was "a bit less readable" and did not understand the hero animation (divergence and convergence of opinions). The founder also needed time to read it. The verdict is open, and the branch is stranded in a worktree.
**Question:** Preserve the prototype on main, still dev-only, while the founder asks more people. Do not adopt it.

> Founder, verbatim: "maybe merge to main? it will be in /tree anyway.. and i ask more people?"

This spec was filed retroactively. The build and its review happened before the spec existed.

## Appetite

Blast radius: low. The route is registered only under `import.meta.env.DEV` (`tree-routes.tsx`), and no production page changes. Reversibility: git revert. Decision density: zero for this spec. Adoption is a separate, later founder decision.

## Solution

Merge the existing branch (4 files under `src/app/tree/landing-lab/fable/` plus one route line) to main as is.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Readers do not understand the hero drawing | DEFER | Unblocked by more reader feedback plus `[FOUNDER DECISION: caption wording for the hero drawing, or remove it]` |
| Prototype drifts from /builders copy over time | ACCEPT | Dev-only exploration; re-sync only if adopted |

**Non-Goals**
- Do NOT change `/builders` or any use-case page (`/hospitals`, `/change-managers`).
- Do NOT expose the route in production.

**Carry-over if ever adopted (not this spec):** analytics and the `?referrer` / `?login` redirects (see the file header), restyle "How the platform works" (still centered cards), and the pledger avatar initials clipping at 375px.

## Done-When

- [x] `/tree/landing-fable` renders in dev. Verified 2026-11-11 at 375px: no horizontal overflow (scrollWidth 375 = innerWidth); all sections render once scrolled.
- [x] Route is DEV-guarded, so it is absent from the production route table (`import.meta.env.DEV &&` on the route line).
- [x] No diff to `src/app/pages/` on the branch (`git diff main...HEAD -- src/app/pages` empty).

## Related

- `/builders`: `src/app/pages/build-right-thing-landing.tsx`
