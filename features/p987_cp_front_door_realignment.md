---
status: week
type: story
rank: 1000942.0
created_date: '2026-07-13'
tags: [landing, gtm, mission-slogan, front-door]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd, challenge-prd.2]
---

# P987: CP Front-Door Realignment — mission-slogan homepage + retire co-founder surfaces + land outro slogan

## Problem

**Situation:** The 2026-07-13 outro decision (`docs/decisions.md`) pinned the public slogan to the **durable mission layer** — *"Alignment isn't agreement, it's verified understanding. No AI can be aligned without it."* — with a **free alignment audit** as the only CTA and a `claritypledge.com` pill. §UVP is now reconciled to this single lead (Gate 8, 2026-07-13).
**Complication:** There are **two** stale co-founder surfaces on the live cp front door, both the exact posture the 2026-07-01 founder-wedge pivot made dormant, both contradicting the freshest asset:
- **`/` (anonymous)** renders `ProgramPage` — the *"I've lost co-founders. I help you keep yours."* pitch + the `€100k–€1M+` split stat. It renders via `HomeRedirect` (`src/App.tsx`) and has **no dedicated route of its own**.
- **`/program`** is a **distinct route** → `OffersPage` — the **€950-per-pair co-founder program offer page**, still linked in the top nav as *"Co-founder Program"* (`simple-navigation.tsx`).

(The first draft conflated these two as one "ProgramPage / /program" — corrected here after codebase verification.) Separately, `outro.html` still hardcodes the same stale hook, so the video branding lane (Stage 5, **not yet built** — no video shipped with it) is blocked.
**Question:** How do we make `claritypledge.com`'s front door carry the mission slogan + free-audit CTA, retire both contradicting co-founder surfaces without deleting them, and unblock video branding — while keeping coaching disclosed at the pre-qual layer, never on the hero?

## Appetite

**High blast radius** — the live public homepage (the `/` route for every anonymous visitor and the destination the video outro will advertise). **Reversibility: code is git-revertable, but there is a behavioral cost** — `/` currently runs a live, Mixpanel-instrumented funnel; running the new hero carries a traffic/conversion cost a revert does not undo, and reversing mid-flight risks a `landing_page_viewed` discontinuity. Both co-founder surfaces are kept dormant (unlisted, not deleted), so the posture is revivable. **GTM posture — supersedes "cp untouched":** goals.md's earlier *"cp untouched before outreach"* is superseded on the record (decisions.md 2026-07-13) — removing a stale, mission-contradicting asset is cleanup, not building new cp funnel. **Decision density: medium** — the mission slogan is locked (2026-07-13, may refine); the audit-CTA destination resolves to **`/intro` (book-a-call) as the interim, swapping to a Tally pre-screen form later**. Open `[FOUNDER DECISION]`s: CTA label + hero sub-copy.

## Solution / Approach

Three connected changes, one branch:

1. **Homepage redo (`/`).** Replace `ProgramPage` as the anonymous `/` surface with a mission-layer landing: the locked slogan as hero + a single **free alignment audit** CTA. No coach info on the hero (coaching is disclosed later, at the pre-qual layer). Reuse the existing design system / `ClarityLandingLayout`; copy + routing, not a new design language.
   - **CTA destination:** point at the existing **`/intro`** book-a-call page as the interim (a real destination — the actual next funnel step). Swap to a **Tally pre-screen form** (the discovery Gates 1–4, built later — see Resolved Decisions) when ready.
   - **Port forward** the `?referrer`/`?login` auto-redirect **and** the `landing_page_viewed` Mixpanel event that currently live on `/` (`program-page.tsx`) — P916 built these deliberately; dropping them breaks invite links and creates a landing-metric cliff.
2. **Retire both co-founder surfaces (dormant, not deleted).**
   - (a) `ProgramPage` stops being the `/` surface — remove its import/usage from `HomeRedirect`. Keep the component in the tree, revivable.
   - (b) `/program` (`OffersPage`, €950) comes **out of the top nav** (`simple-navigation.tsx` "Co-founder Program") and footer — unlist it, keep the route reachable by direct URL, add `noindex`. Verify `/` stays indexable.
3. **Land the mission slogan into `outro.html`.** Replace the hardcoded co-founder hook + stat in `.claude/commands/slava/util/video-brand-pass/assets/outro.html` with the locked copy (body + CTA + `claritypledge.com` pill), unblocking the branding stage. Per the skill: after editing, re-run `brand.sh` and run the visual-QA pass on the new render before calling it done. **This step is independently shippable** — it has zero live-traffic risk and can land ahead of the homepage change if desired.

**Locked slogan copy (from `docs/decisions.md` 2026-07-13, `[FOUNDER DECISION]`, may refine):**
> Misalignment costs you: rework, mistrust, turnover.
> Alignment isn't agreement, it's verified understanding.
> No AI can be aligned without it.
> Get your free alignment audit.

## Risks / Non-Goals

### Risks
- **Live front door goes dark or off-brand mid-change.** MITIGATE: branch + UAT gate; multi-viewport visual-QA (375/320/desktop) before `/ship`; both co-founder surfaces stay intact behind their routes so nothing is destroyed.
- **Invite links + landing metric break** if the `?referrer`/`?login` redirect and `landing_page_viewed` event are not ported to the new `/`. MITIGATE: port both (Done-When item).
- **`noindex` on `/program` accidentally leaks to `/`.** MITIGATE: scope the meta directive to the `/program` route only; verify `/` remains indexable.
- **Unvalidated hero, read qualitatively.** ACCEPT: the mission slogan is self-labeled UNTESTED. At this stage the read is qualitative — audit-form fills + the appointment conversations (founder-direct, small n), not a formal landing A/B. A before/after directional note against the prior funnel is welcome but not required.

### Non-Goals
- **Do NOT put coach info, "work with me", or Slava-as-coach content on the hero.** Coaching is disclosed at the pre-qual/audit-invitation layer (separate `.private` edit) and via the existing quiet `/about → "Work with Slava"` door. The hero stays mission + free audit only.
- **Do NOT add pricing to the homepage hero.** (`/program`/`OffersPage` **keeps** its existing €950 pricing — it is unlisted + `noindex`ed, not price-stripped. Editing `OffersPage` pricing is out of scope.)
- **Do NOT delete `ProgramPage` or `OffersPage`** — unlist + `noindex` only. Both must stay revivable.
- **Do NOT modify `/about`** — its "Work with Slava → ladischenski.com" link is the intended quiet door; leave as-is. (Verified: reachable from the persistent hamburger nav, independent of the homepage swap.)
- **Do NOT touch the `ladischenski-com` repo** (price stripping / redirect is separate, cross-repo work).
- **Do NOT edit `discovery-questions.md`** — the pre-screen questions stay in `.private`; the public Tally form (later) uses plain question wording only, never the private strategy notes.
- **Do NOT build the Tally form in this spec.** The CTA points at `/intro` for now; the form is a later follow-up.
- **Do NOT redesign the landing visual language** — reuse the existing design system; this is copy + routing.

### Rollback Strategy
`git revert` the branch merge. Both co-founder surfaces are untouched behind their routes, so re-listing them (restore the `ProgramPage` render at `/`, restore the `/program` nav entry, remove `noindex`) fully restores the prior front door. `outro.html` reverts with the same commit.

## Done-When

- [ ] Anonymous `/` renders the mission-slogan hero + a single free-alignment-audit CTA — no coach info, no pricing on the hero, no co-founder copy
- [ ] The audit CTA points at `/intro` (interim) — a working destination, no dead link
- [ ] The `?referrer`/`?login` redirect **and** `landing_page_viewed` event are ported to the new `/` (invite links + landing metric intact)
- [ ] `/program` (`OffersPage`) is absent from nav/footer and returns `noindex`; the route stays reachable by direct URL; `/` remains indexable
- [ ] `outro.html` carries the locked mission slogan (co-founder hook + `€100k–€1M+` stat gone); `brand.sh` re-run and the outro render passes visual-QA
- [ ] Visual-QA pass (separate subagent) clears the hero at 375px, 320px, and desktop against `.claude/rules/visual-qa.md`
- [ ] `/about`, `OffersPage` pricing, and the `ladischenski-com` repo are unchanged (verified by diff scope)

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd.2 | [BLOCK] Spec conflated `ProgramPage` (renders at `/`) with `/program` (serves `OffersPage`, €950, nav-linked) — two different surfaces; the "no prices on /program" non-goal was already false in live code | Named both surfaces precisely: `/` → mission hero (drop `ProgramPage`); `/program`/`OffersPage` → out of nav + `noindex`, price kept | Founder intent was both stale co-founder surfaces off the front door; it was a wording bug, verified against `src/App.tsx` + `simple-navigation.tsx` |
| 2 | /challenge-prd.2 | [BLOCK] Silently overrode goals.md's active "cp untouched before outreach" directive | Supersede "cp untouched" **on the record** (goals.md updated + decisions.md 2026-07-13 entry) | "cp untouched" meant *don't build new cp funnel before outreach* — it never licensed leaving stale, mission-contradicting €950 pricing live on the homepage. Removing a wrong asset is cleanup, not new-feature-building (founder decision) |
| 3 | /challenge-prd.2 | [BLOCK] Ships a self-labeled UNTESTED hero with no way to run its stated A/B falsifier | Measurement = audit-form fills + appointment conversations (qualitative, founder-direct); CTA destination = `/intro` interim → Tally pre-screen form later | At founder-direct small-n stage the qualitative read is the appropriate test; a formal landing A/B is unbudgeted and premature |
| 4 | /challenge-prd.2 | [WARN] Dropped `?referrer`/`?login` redirect + `landing_page_viewed` that P916 built | Port both to the new `/` (Done-When item) | Silent drop = broken invite links + Mixpanel landing cliff |

## UX Notes

- **Hero states:** happy path only (static marketing hero). The blur→clarity reveal beat already used on `ProgramPage`/`/coach` is reusable for the slogan's key line if desired (`[FOUNDER DECISION]`).
- **Single primary action** (P955): exactly one full-width primary CTA on the hero — the free alignment audit. No competing primaries.
- **Empty/edge:** the interim CTA (`/intro`) is a static booking page — no events-gated empty state to handle. If the later Tally form is ever events-gated, mirror the existing `WebinarCTA` `hasEvent` pattern then rather than rendering a dead button.

## Acceptance Criteria

- [ ] A cold visitor landing on `claritypledge.com` sees the mission and one clear way to act (the free audit), with no mention of coaching, price, or co-founders
- [ ] A visitor who deliberately seeks "can I hire him" can still reach `/about → Work with Slava` (quiet door intact)
- [ ] The video outro's `claritypledge.com` pill now lands on a page whose message matches the outro's message

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Hero body | Locked slogan copy (above) — exact wording `[FOUNDER DECISION]`, may refine | `/` anonymous |
| Primary CTA label | `[FOUNDER DECISION]` (e.g. "Get your free alignment audit") | Hero, single primary |
| CTA destination | `/intro` (book-a-call) interim → Tally pre-screen form later | Hero CTA target |
| Prices | none on hero | `/program`/`OffersPage` keeps €950 (unlisted + `noindex`) |
| `/program` meta | `noindex`, out of nav/footer | Dormant route only |
| Coach info on hero | none | Disclosed at pre-qual layer instead |
