---
status: week
type: task
rank: 9
created_date: '2026-08-06'
tags:
  - cta
  - events
  - landing
  - refactor
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-08-17T07:29:26.803Z'
---

# P1028: Reusable event CTA across landing pages

> **Demotion reversed 2026-08-07, same day.** A board review demoted this on the grounds
> that the event-led channel was frozen at `PROPOSED-PENDING-CONTACT` (decisions.md
> 2026-08-05). That was wrong: [goals.md](../docs/goals.md) records **"[ACTIVE 2026-08-07 —
> applied] Event-led funnel. Supersedes the 2026-07-20 direct-first channel"** and voids
> that freeze explicitly. The review read `lean-canvas.md` §active-channel, which still
> says direct-first and is **stale**. **Open doc conflict:** the `active-channel`
> SINGLE-VALUE slot and goals.md now disagree — a `/docs-strategy-update` job.
>
> **Why this now matters more, not less:** the plan is **12 weekly events**
> (goals.md — "12 events @ ~20 each"). Every landing page that does not point at the next
> event is a leak on the primary funnel, twelve times over.





## Problem

The front door moved to a free 1-to-many event (`decisions.md` 2026-08-05), so every landing page should point at the next event when one exists. A `WebinarCTA` component that does exactly this already exists — but it is a **local function inside `src/app/pages/old-landing-2.tsx`** (serving `/founder`), not exported, so `/`, `/hiring` and `/coach` cannot use it.

The data layer is **already shared and needs no work**: `useNextWebinar` (`src/app/hooks/useNextWebinar.ts`) is consumed by both `simple-navigation.tsx` and `old-landing-2.tsx`, consolidated under P969 to a single `getUpcomingEvents` fetch.

So this is an extraction, not a build.

## Appetite

**Medium blast radius** — touches the hero CTA on every public landing page, including the `SINGLE-VALUE: page-lead` slot. **High reversibility** — pure component extraction; revert is one commit. **Low decision density** — the CTA hierarchy is already decided (below); the only open item is copy.

## Solution

Extract `WebinarCTA` into a shared component and mount it on `/`, `/hiring`, `/coach` alongside its existing use on `/founder`.

**CTA hierarchy — decided 2026-08-06, same on every page:**

1. **Webinar** when an upcoming event exists (`useNextWebinar` returns non-null)
2. **Booking** (`/intro`) as the fallback when no event exists
3. The **letter CTA drops out of the primary slot** — it is the artifact with R₀≈0 and it competes with two CTAs that lead somewhere **[R₀≈0's completions figure is FALSE — prod 2026-08-14: 28 deliveries / 12 completed (43%). The retirement itself stands (the OR's *zero forwards* leg was true on 2026-06-02), but both legs are false now ⇒ grounds to revisit. Re-check this decision: docs/hypotheses.md#corrected-the-completions-figure H-LetterAsProduct §CORRECTED, decisions.md 2026-08-27.]**

**No `/events` page is needed.** `/org/:slug` already exists in `App.tsx` and `/org/cm` serves that purpose.

Registration stays on the event platform (Luma / Eventbrite) — the `promote-luma` and `promote-eventbrite` skills already exist, and platform-supplied audience is the hedge if cold email underperforms.

## Risks / Non-Goals

### Risks

- **A hero CTA change touches the `SINGLE-VALUE: page-lead` slot**, which the pre-commit `check-single-value-slots.py` canary and `/slava:maintain:docs-strategy-update` Gate 8 both police. **Mitigation:** route the page-lead change through that gate; do not hand-edit `lean-canvas.md` §UVP.
- **Silent site-wide CTA loss.** `getNextUpcomingWebinar` (`src/app/data/webinar-series.ts`) identifies "the webinar" by a hardcoded **title-prefix + hostId + future-datetime** match, so a typo in an event title kills the CTA on *every* page at once and nothing reports it. Fanning the component out **multiplies the blast radius of that existing bug** without touching it. **Mitigation:** confirm the fallback path renders correctly when `useNextWebinar` returns null, so a matcher miss degrades to the booking CTA rather than to nothing.
- Four landing variants exist (`build-right-thing-landing`, `clarity-pledge-landing`, `landing-v2/v3/v4`, `old-landing-2`). **Mitigation:** confirm which are routed live before editing; do not update unrouted variants.

### Non-Goals

- **Do NOT fix the event matcher in v1.** Title-prefix + hostId matching is real debt and is covered by tests (`navigation-acceptance-full.test.tsx`), but it is independent of fanning out existing behaviour. Separate spec.
- Do NOT build an `/events` page — `/org/cm` serves it.
- Do NOT build in-app event registration — the platform handles it.
- Do NOT modify `useNextWebinar` or `getUpcomingEvents`. The data layer is already correct and shared.
- Do NOT touch unrouted landing variants or `old-landing-2`'s existing behaviour beyond the extraction.
- Do NOT write CTA copy without approval — `[FOUNDER DECISION]`.

### Alternatives Considered

- **Duplicate the CTA per page** — rejected: four copies drift, which is the defect being removed.
- **Build `/events` with in-app registration** — rejected: `/org/cm` already exists, and platform registration is the audience hedge, not just a shortcut.
- **Fix the matcher first** — rejected as a v1 blocker: it gates a behaviour-preserving extraction behind a test-covered change to event identification.

### Rollback Strategy

Revert the commit. `WebinarCTA` returns to being local to `old-landing-2.tsx`; the other pages return to their prior CTA. No data or schema involvement.

## Done-When

- [ ] `WebinarCTA` lives in a shared component file and is imported by `/`, `/hiring`, `/coach`, and `/founder`
- [ ] `old-landing-2.tsx` no longer defines it locally and renders identically to before
- [ ] With an upcoming event present, all four pages show the webinar CTA
- [ ] With no upcoming event, all four pages fall back to the `/intro` booking CTA — verified by forcing the null case, not inferred
- [ ] The letter CTA no longer occupies the primary slot on any of the four pages
- [ ] Screenshots at 375px, 320px and desktop for each page, in both event and no-event states
- [ ] `page-lead` change routed through `/slava:maintain:docs-strategy-update`; Gate 8 exit code quoted
- [ ] `npm test` passes, including `navigation-acceptance-full.test.tsx` and `p969-reproduce.test.tsx`
