---
status: qa
type: story
rank: 0.25
created_date: '2026-07-20'
tags:
  - landing
  - positioning
  - routing
  - nav
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
locked_at: '2026-07-20T09:06:44.871Z'
---

# P1004: Build-the-right-thing main landing + re-home key-hire page to /hiring

## Problem

**Situation:** The anon home (`/`) renders `ProgramPage` — the **key-hire** landing ("Keep the hire you can't afford to lose"). As of 2026-07-20 the active wedge flipped from key-hire to **H-BuildRightThing** (a growing seed–A team keeps building the wrong things because they never verify they understood each other before agreeing/disagreeing). See `docs/lean-canvas.md` §UVP page-lead (2026-07-20), `docs/hypotheses.md` H-BuildRightThing, `docs/decisions.md` 2026-07-20 (wedge-flip + three-mechanism entries).
**Complication:** The front door now contradicts the active strategy — it sells the dormant wedge. The key-hire page is kept **dormant-revivable** (not deleted), so it needs a home, not a grave.
**Question:** Stand up the build-the-right-thing landing as the new `/`, re-home the existing key-hire page to `/hiring`, and surface it in the nav next to "For coaches" — without breaking inbound links or rebuilding the audit funnel that sits behind the CTA.

## Appetite

High blast radius (changes the primary anon front door for all cold traffic; touches `HomeRedirect` in `src/App.tsx`, adds a route, edits the shared nav). Medium reversibility (route swap is a small change and feature-flaggable; the new landing component is real new surface but reuses existing sections). Medium–high decision density — several open `[FOUNDER DECISION]` items (stat block content, menu label for `/hiring`, eyebrow register).

## Solution / Approach

**Mutation of the old page, mostly reuse.** The key-hire `ProgramPage` is **frozen and re-routed to `/hiring` intact** (not mutated in place) — so the new landing is a *new component* that starts from ProgramPage's structure as a parts bin and changes only the key-hire-specific surfaces. Thesis is **(a) building the WRONG thing / wrong direction** (team agreed without verifying understanding) — NOT (b) slop-as-messy-AI-code (that is the adjacent code-quality lane; do not drift there). Every block earns its place by serving thesis (a); the spine (assume → why-nobody-verifies → illusion/Venn → how-it-works) is wedge-agnostic and carries over untouched.

**Block reuse/change map** (6 reuse, 3 change-copy, 1 drop, 1 new block, 1 audit):

| Old-page block | Action | How |
|---|---|---|
| Hero (eyebrow/H1/subhead/CTA) | **CHANGE copy** | Locked copy (see UI Contract); CTA → P1003 funnel |
| *(after hero)* | **NEW block** | Reframe: "nobody wants it" → internal cause ("a team that agreed without verifying"). Anti-custdev-drift block; not in old page |
| Stat "46% / attitude²" + "Small gaps compound." | **CHANGE stat / keep line** | Delete folklore 46%/new-hire number; keep "Small understanding gaps compound"; new stat = placeholder pending sweep |
| Seam chat (`HardTruthChat`, Katie/new hire) | **REUSE component, NEW content** | Rewrite dialogue: a **teammate** held a doubt about the direction, didn't send it, built on the guess. "half the roadmap built on a guess" fits |
| `KeyHireCalculator` (2× salary) | **DROP** (or replace) | Salary-multiple is key-hire-only. Cut, or `[FOUNDER DECISION]` swap for a wasted-months calc |
| "Everybody assumes they understand" + stat cards | **REUSE, verify numbers** | Heading on-thesis; audit ref'd card numbers for folklore |
| "Why almost nobody verifies" (ego/fear/futility) | **REUSE as-is** | Maps to buckets + capability≠practice. Verify refs |
| "Illusion of shared understanding" + `MisunderstandingVenn` | **REUSE as-is** | Core construct, unchanged |
| `HowPlatformWorks` (five moves) | **REUSE as-is** | Wedge-agnostic |
| "Protect the relationship… diverge" + `AgreementCertificate` | **REUSE component, NEW copy** | Reframe heading from *protect-a-relationship* to *verify-a-decision*; artifact stays |
| Founder credibility (photo/€398K/shut down) | **REUSE, light tweak** | Optional: "shipped the wrong thing, shut it down" |
| Final CTA + mission | **REUSE mechanism, NEW copy** | CTA → P1003; mission line to new wedge |
| References | **AUDIT** | Drop folklore ref² (Leadership IQ) + orphaned refs |

1. **New landing component** (new `src/app/pages/` page) rendered at `/` for anon visitors. Hero copy locked this session:
   - Eyebrow pill: `Epistemic infrastructure for high-stakes decisions`
   - Headline: `AI helps you build the wrong features faster.`
   - Sub-line: `The #1 startup killer is building something nobody wants.`
   - The section **immediately below** the hero must redirect "nobody wants it" to the **internal** cause (team never verified understanding) — the bare sub-line must not be left claiming the custdev pie. See `decisions.md` 2026-07-20 three-mechanism entry (calibration-not-accuracy boundary; buckets a/b ours, c custdev).
   - **Stat block** (the slot the current page fills with "46% / 9-of-10 attitude"): placeholder `[STAT — VERIFY: requirements-rework slice]` pending the research sweep (`pp/campaigns/build-right-thing/research/02-stat-sweep-brief.md`, next session). Ship the page with the placeholder or a mechanism-only line + specific felt cost; do NOT ship a folklore percentage.
2. **Re-home:** the existing `ProgramPage` (key-hire) serves at `/hiring`, intact. `HomeRedirect`'s anon target changes from `ProgramPage` to the new landing.
3. **Nav:** add a `/hiring` link in `src/app/components/layout/nav-links.ts` adjacent to the existing `{ to: "/coach", label: "For coaches" }` (line ~17). Label is a `[FOUNDER DECISION]`.
4. **CTA:** the new landing's primary CTA feeds the **P1003** 3-minute alignment-audit funnel — reference it, do not rebuild. P1003 owns post-click mechanics.

Investigate in `/architect`: whether any inbound links / SEO / analytics events point at the old `/` key-hire content and need a redirect or event-name reconciliation when it moves to `/hiring`.

## Risks / Non-Goals

### Risks
- **Broken inbound links / lost SEO** to the old `/` key-hire content. Mitigation: `/hiring` route + verify no hard redirect breaks; check analytics event names tied to the old home.
- **Shipping a folklore stat** to fill the empty block before the sweep returns. Mitigation: placeholder is explicit; the Leadership IQ "46% / attitude" number is blacklisted and must not carry over.
- **Custdev drift** — the sub-line's "nobody wants it" reading the page as a custdev tool. Mitigation: the below-hero section redirects to internal cause (spec'd above; guardrail in decisions.md).
- **Nav regression** — `navigation-menu-items.tsx` already has key-hire-era logic ("on /founder it showed For coaches"); adding `/hiring` may interact. Mitigation: cover in `/architect` + the nav acceptance test (`src/tests/navigation-acceptance-full.test.tsx`).

### Non-Goals
- Do NOT delete or rewrite the key-hire `ProgramPage` — it moves to `/hiring` intact (dormant-revivable).
- Do NOT rebuild the audit funnel — P1003 owns it; this spec only wires the CTA to it.
- Do NOT fill the stat block, the `/hiring` menu label, or any positioning copy not locked above — each is a `[FOUNDER DECISION]`.
- Do NOT redesign the reused sections (`MisunderstandingVenn`, `HowPlatformWorks`, founder-credibility) — reskin copy only where key-hire-specific.
- Do NOT touch `/coach` or `/founder` positioning here (P1003 reconciles their CTA separately).
- Do NOT drift the thesis to **slop-as-messy-AI-code** (code churn/quality — the Qodo/CodeRabbit lane). The page is about building the **wrong thing / wrong direction** via unverified team understanding (thesis (a)). "Slop" may be a hook word; the construct is misalignment, not code quality.
- Do NOT mutate the key-hire `ProgramPage` — it is frozen at `/hiring`. The new landing is a separate component; changes happen there, never in the re-routed page.

## Done-When

- [x] Anon visitor to `/` sees the build-the-right-thing landing (locked hero copy present verbatim) — verified via screenshot; eyebrow/H1/sub-line render verbatim per UI Contract
- [x] The section below the hero names the internal cause (team never verified), not the market outcome — reframe section renders (copy drafted, FOUNDER DECISION for UAT)
- [x] Stat block shows the placeholder or a mechanism+felt-cost line — no folklore percentage present — dashed placeholder renders intentionally; Leadership IQ 46% dropped
- [x] `/hiring` serves the intact key-hire `ProgramPage` — route added, ProgramPage unmutated
- [ ] Old `/` key-hire content is reachable at `/hiring` with no broken inbound-link/redirect regression — content reachable, BUT SEO canonical regression open: ProgramPage's `SEO url="/"` now self-canonicalizes `/hiring` back to `/`. Fix (`url="/hiring"`) needs a founder call since ProgramPage is frozen. FOUNDER DECISION.
- [x] Nav shows a `/hiring` link adjacent to "For coaches"; nav acceptance test passes — 52/52 nav acceptance tests pass
- [x] Primary CTA routes into the P1003 audit funnel (no rebuilt funnel) — reuses AuditCTA → /intro (P1003 not yet built; /intro is the current audit entry it will reconcile)
- [x] Reused sections render unchanged except key-hire-specific copy — verified via full-page screenshot

## UX Notes

- **States to cover:** the hero's blur-reveal payoff (matches current page pattern), the below-hero redirect section, empty/placeholder stat block (must look intentional, not broken, while pending the sweep).
- **Mobile:** the current hero is tuned to stay two lines at 320px — the new headline "AI helps you build the wrong features faster." must be re-checked at 320/375px per `.claude/rules/visual-qa.md` (multi-viewport before "ready").
- **Nav:** `/hiring` link visible at the same breakpoints as "For coaches".

## Acceptance Criteria

- [x] Cold visitor lands on build-the-right-thing positioning at `/`, not key-hire
- [x] Key-hire audience/inbound reaches the same content at `/hiring`
- [x] No custdev overclaim on the page (internal-cause framing verified) — below-hero reframe redirects to internal cause
- [x] No unsourced statistic shipped — placeholder only; folklore refs dropped

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Eyebrow pill | `Epistemic infrastructure for high-stakes decisions` | New `/` hero |
| Headline | `AI helps you build the wrong features faster.` | New `/` hero |
| Sub-line | `The #1 startup killer is building something nobody wants.` | New `/` hero |
| Stat block | `[STAT — VERIFY: requirements-rework slice]` (placeholder) | Below hero; pending sweep |
| Nav label | `[FOUNDER DECISION]` (e.g. "For hiring teams") | `nav-links.ts`, adjacent to "For coaches" |
| Route | `/hiring` → key-hire `ProgramPage` | `src/App.tsx` |