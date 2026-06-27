---
status: qa
type: bug
rank: 1000939
severity: medium
workstream: C1
date_reported: '2026-06-27'
created_date: '2026-06-27'
date_resolved: '2026-06-27'
root_cause: "Nav CTA (LoggedOutPrimaryCta) rendered the static WEBINAR_CTA_LABEL unconditionally; never fetched getUpcomingEvents, so it could not degrade to the letter CTA in a no-event window like the hero did."
resolution: "Added shared useNextWebinar hook (module-level cached getUpcomingEvents); nav CTA now shows 'Try a Clarity Letter' → /letter/ck when no upcoming event, mirroring the hero. program-page repointed at the same hook so hero + nav share one fetch."
tags: [webinar, nav, cta, events, p958]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p969-reproduce.test.tsx
  root_cause: "LoggedOutPrimaryCta (simple-navigation.tsx:37-88) renders the static WEBINAR_CTA_LABEL → WEBINAR_REGISTER_URL unconditionally for all non-/coach routes; it never fetches getUpcomingEvents, so the header cannot degrade to the letter CTA when no event exists (unlike the hero, which uses hasEvent)."
  confidence: high
  surfaces_in_scope: [nav-header-desktop, nav-header-mobile]
  surfaces_deferred: []
  reproduced_at: 2026-06-27
---

# P969: Header nav CTA "Join the next Clarity Experiment" is not event-aware

## Summary

On every public page the nav header shows a static blue CTA "Join the next Clarity
Experiment" → `/events/experiment`. When the events DB has no upcoming webinar, the
landing hero correctly degrades to "Try a Clarity Letter" but the nav header keeps
promising a "next Clarity Experiment" that does not exist — clicking lands on an empty
events list. P958 made the hero DB-driven but left the nav header on the old hardcoded path.

## Root Cause

`simple-navigation.tsx` `PublicCTAButton` (~L67–88) renders the static constant
`WEBINAR_CTA_LABEL` from `src/app/content/webinar.ts` unconditionally — it never consults
the events DB. The landing hero (`program-page.tsx` `WebinarCTA`) receives a `hasEvent`
prop derived from `eventsService.getUpcomingEvents()` (program-page.tsx:248–252) and swaps
to "Try a Clarity Letter" → `/letter/ck` when `hasEvent === false`. The nav header has no
equivalent fetch, so the two surfaces disagree during any no-event window: hero says "no
event", header says "there is one". The header's destination `/events/experiment`
(`NextWebinarRedirect`) finds nothing and bounces to `/events/list?series=lost-cofounders`
(an empty list) — a broken promise the hero specifically avoids.

The only existing route-specific override in the nav is the `pathname === "/coach"` branch
(simple-navigation.tsx:50), which already routes to "Try a Clarity Letter" → `/letter/ck`.
That is exactly the fallback the no-event case needs.

## Reproduction Steps

1. Ensure the events DB has NO upcoming webinar event (current prod state — confirmed by
   the absence of the "Live ·" date line on the landing).
2. Open `claritypledge.com/` (or any public page) as a logged-out visitor.
3. Observe the hero CTA reads "Try a Clarity Letter" (hero is correctly in no-event state).
4. Observe the header (top-right) CTA still reads "Join the next Clarity Experiment".
5. Click the header CTA → routed via `/events/experiment` to
   `/events/list?series=lost-cofounders`, which shows no upcoming event.

**Reproduction rate:** 100% (whenever no upcoming event exists)

## Expected Behavior

When no upcoming event exists, the nav header CTA mirrors the hero: relabel to "Try a
Clarity Letter" → `/letter/ck`. When an upcoming event exists, both show "Join the next
Clarity Experiment" → `/events/experiment`. Hero and header never disagree.

## Actual Behavior

Header CTA is hardcoded to "Join the next Clarity Experiment" → `/events/experiment`
regardless of DB state, while the hero degrades correctly. Visitor is invited to an
experiment that does not exist and lands on an empty events list.

## Affected Files

- `src/app/components/layout/simple-navigation.tsx` — `PublicCTAButton` (~L67–88), desktop
  + mobile nav CTA; renders `WEBINAR_CTA_LABEL` unconditionally. The `/coach` branch (L50)
  is the existing correct override pattern to mirror.
- `src/app/pages/program-page.tsx` — `WebinarCTA` + the `getUpcomingEvents()` fetch
  (L248–252) that should become the shared source.
- `src/app/content/webinar.ts` — `WEBINAR_CTA_LABEL` / `WEBINAR_REGISTER_URL` constants.
- New (proposed): a shared `useNextWebinar()` hook — single cached fetch consumed by both
  hero and nav.

## Severity

**Medium** — no crash, but a broken-promise CTA on every public page during any no-event
window; undermines the credibility the P958 hero fix was meant to protect.

## Fix Approach

Make the nav CTA event-aware, mirroring the hero (founder approved):

1. Introduce a shared `useNextWebinar()` hook backed by a module-level cached promise, so
   `eventsService.getUpcomingEvents()` fires once and both hero (`program-page.tsx`) and nav
   (`simple-navigation.tsx`) resolve from the same result — one network hop instead of two
   independent fetches, and no mid-load disagreement.
2. In `PublicCTAButton`, when the hook reports no upcoming event, render "Try a Clarity
   Letter" → `/letter/ck` (identical to the existing `/coach` branch); otherwise keep
   `WEBINAR_CTA_LABEL` → `WEBINAR_REGISTER_URL`.
3. Repoint `program-page.tsx`'s inline fetch at the shared hook so both surfaces share one
   source of truth.

While loading (event state unknown), pick the same default the hero uses so the two never
diverge visibly — confirm the hero's loading default during `/reproduce`.

## Acceptance Criteria

- [x] With no upcoming event in the DB, the header nav CTA reads "Try a Clarity Letter" and
      links to `/letter/ck` (desktop and mobile). — canary `src/tests/p969-reproduce.test.tsx`
- [x] With an upcoming event in the DB, the header nav CTA reads "Join the next Clarity
      Experiment" and links to `/events/experiment`. — `navigation-acceptance-full.test.tsx`
      (event mocked, async CTA awaited)
- [x] On the landing page, hero CTA and header CTA always show the same event-state
      (both webinar, or both letter) — never one of each. — both read the shared
      `useNextWebinar` hook; nav default is `!nextEvent` → letter, identical to the hero's
      `hasEvent={nextEvent !== null}`.
- [x] The `/coach` branch still routes to "Try a Clarity Letter" → `/letter/ck` (unchanged).
      — `navigation-acceptance-full.test.tsx` /coach test still green.
- [x] No duplicate `getUpcomingEvents()` network call when the landing renders (hero + nav
      share one fetch). — module-level cached promise in `useNextWebinar`.
- [x] Regression test passes: `src/tests/p969-reproduce.test.tsx` (2/2).
- [x] No console errors during the affected flow. — component renders clean in jsdom across
      the full suite (2491 passed). [live browser confirmation deferred to /verify]
