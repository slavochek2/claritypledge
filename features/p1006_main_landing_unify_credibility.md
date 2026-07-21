---
status: qa
type: task
rank: 1000953.0
created_date: '2026-07-21'
tags: [founder, video, credibility, landing, p1005-followup]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
---

# P1006: Unify the main-landing credibility section with the shared `<FounderCredibility>` component

## Problem

**Situation:** P1005 extracted a shared `<FounderCredibility>` section (talk-clip facade + €398k credibility + YouTube link-out) and wired it into `/founder`, `/coach`, and the then-homepage `program-page`. **Complication:** P1004 shipped concurrently and re-homed `/` to a new page (`build-right-thing-landing.tsx`), which carried its own hand-rolled photo+text credibility block (`founder-photo.jpg`, no video). So the actual main page the user sees still showed the old section. **Question:** bring the rehomed main landing onto the same shared component so the credibility section is identical everywhere.

## Appetite

Small, reversible. One page swaps an inline block for the existing shared component; no new component, no schema, no infra (the GCS assets + CSP shipped with P1005).

## Solution

Replace the inline credibility `<section>` in `build-right-thing-landing.tsx` with `<FounderCredibility />` (same as P1005 did for the other three surfaces). Remove the now-orphaned `CRED_POINTS`, `CountUpMoney`, `CheckIcon`, and framer-motion helper imports. Also clean up a stale truncated comment left in `old-landing-2.tsx` during P1005 (code-review finding).

**Founder decision (this session):** the main landing's tailored headline ("shipped the wrong thing until it shut down") is dropped in favour of the shared component's line — full consistency chosen over the theme-specific wording.

## Risks / Non-Goals

- MITIGATE — orphaned imports after removing the inline block: verified with eslint.
- Non-Goal: `/tree/old-landing` (`clarity-pledge-landing.tsx`) — dev-gated route, uses `founder-photo.jpg` only as an avatar; untouched.
- Non-Goal: `program-page` (`/hiring`) — already on the shared component (P1005).

## Done-When

- [x] `/` (build-right-thing-landing) renders `<FounderCredibility />` — video facade + €398k text + YouTube link, identical to /founder, /coach
- [x] Old inline block + orphaned `CRED_POINTS`/`CountUpMoney`/`CheckIcon`/framer helper imports removed; eslint clean
- [x] Stale P1005 comment in `old-landing-2.tsx` removed
- [x] tsc clean · build succeeds · browser-verified poster loads from GCS + click-to-play streams

## Acceptance Criteria

- [x] Main page credibility section shows the talk-clip facade (not the static headshot); clicking plays inline
- [x] No visual/behavioural difference from the /founder and /coach credibility sections