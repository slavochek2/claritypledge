---
status: today
type: story
rank: 977.33
created_date: '2026-06-10'
tags:
  - program-page
  - conversion
  - value-prop
  - accelerator-distribution
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P916: Program / delivery page (founder-facing, accelerator-distributed)

## Problem

**Situation:** The 2026-06-02 coach-distribution pivot produces a co-delivered **paid program** (a coach co-runs it; sold via accelerators/angels as distributors — goals.md "Core Loop" + step 6). The coach landing page (`coach-partnership-page.tsx`, P856, reframed by P915) recruits *coaches*. The 2026-06-09 conversation produced the most complete value articulation to date (now in lean-canvas §UVP "Value map — gains × pains") and a strong, easy CTA — the Clarity Letter **risk score** ("cool for cta on landing! easy to implement"; now its own spec, **P918**).

**Complication:** There is **no founder-facing surface** an accelerator/angel can forward to sell the program to founder pairs. The value map lives in a strategy doc, not on a page. Without this page, goals.md step 6 ("program/delivery page + joint positioning + accelerator/angel outreach") has nothing to point at.

**Question:** What does the founder-facing program/delivery page present — pain, value, CTA, program structure, credibility transfer — so an accelerator can forward it and a founder pair can self-qualify and book?

**Distinct from P915/P856 (read first, do not merge):** P915/P856 = the **coach** landing (`/`, audience: coaches recruiting as collaborators). P916 = the **founder/buyer** program page (audience: founder pairs arriving via an accelerator/angel). Different audience, different hook, different CTA. Cross-link; do not duplicate.

## Appetite

**Blast radius — medium.** New page + route; no existing flow changes. Founder-facing, distributed through accelerators/angels (credibility transfer), not cold traffic.
**Reversibility — high.** New page, git-revertable; no schema, no data migration.
**Decision density — HIGH.** Multiple FOUNDER DECISIONs unresolved (program name, pricing, tagline/CTA copy). Do not invent any — mark and ask. (Brand/domain + buyer model resolved 2026-06-10.)

## Solution

**Buyer model (resolved 2026-06-10): the founder pair self-buys after a warm forward** — so this is a **sales + booking** surface (the CTA leads through the P918 self-diagnostic into a book/buy action), NOT an onboarding page for an accelerator-procured cohort.

A founder-facing program/delivery page that presents, top to bottom:

1. **Hook = one wedge pain, audience-specific.** Per the 2026-06-04 frozen positioning: founder-facing hook = **the split** ("verify before you commit"). Lead with the catastrophic-split pain (lean-canvas value map pain #3), supported by daily dissatisfaction + truth-hiding. Do **not** lead with the category ("coordination tooling" is demo-revealed, not a headline — categories don't sell, pains do).
2. **Value map (gains × pains).** Render the lean-canvas §UVP "Value map" — 8 gains sorted affective → cognitive → validity; the 7 avoided-cost pains. Avoided-cost figures are **illustrative, not measured** — label them so on the page. Pitch one wedge pain; the rest is supporting, not a feature wall.
3. **Primary CTA = the P918 misunderstanding-risk self-diagnostic.** A short solo self-diagnostic that returns a misunderstanding-risk score ("How much misunderstanding risk are you carrying into your next big decision?"). **This instrument is its own spec — P918** (verified 2026-06-10: no risk-score instrument exists in the codebase — `grep -rniE "risk[ _-]?score" src/` is empty; the existing letter system measures a *two-party* gap, not a solo score). p916 **wires to P918, does not build it.** Honest-scope (P918's hard constraint + the 2026-06-10 "the letter sells the /live session" decision): the score is a **self-rated, uncalibrated** number that hands off into the program — never presented as a measured/verified gap.
4. **Program structure + co-delivery framing.** What the paid program is and that it is co-delivered with a credentialed coach (the collaborator). Keep the honest scope (the page sells the program; the demo reveals the category).
5. **Two distinct credibility transfers — keep them separate.** (a) *Distributor endorsement* — arrival is a warm forward from an accelerator/angel, not cold SEO traffic; the distributor's vouch gets the pair to the page. (b) *Co-deliverer credential* — the credentialed coach named on the page (the collaborator who co-runs the program) is what makes the program itself trustworthy once the reader is there. The accelerator delivers the audience; the coach's credential delivers the trust.
6. **Tagline — a to-test field, FOUNDER DECISION (not filled in).** Principle locked: the verb must be **verify/check**, never "listen" ("listen" is the active-listening category CP differentiates from). Candidate lines to A/B test (see UI Contract). Do not hard-pick.

## Risks / Non-Goals

### Risks
- **Positioning re-cut risk.** The page must present the *already-settled* hook, not reopen it. *Mitigation (MITIGATE):* lift the founder-facing cut verbatim from lean-canvas 2026-06-04 "Positioning — frozen until tested"; the next positioning rewrite is earned by the first real co-delivery, not this page.
- **Sequencing — page ahead of the funnel.** Goals.md step 6 activates "when a collaborator commits to co-running." No collaborator has committed yet (2026-06-10: two coach candidates assessed, neither fit; search active). *Mitigation (ACCEPT):* build the page now; **launch/promote waits** on a committed collaborator + the coach-distribution falsifier clock. Building ahead is fine; shipping it live to accelerators is gated.
- **Pricing/value congruence.** €500 (floated 2026-06-09) is "almost too cheap" for "prevents company death" — too-cheap signals low value. *Mitigation (FOUNDER DECISION):* price is a founder decision — either frame the program modestly or as an explicit founding-cohort rate; the page must match claim to provable scope. Buyer model = self-buying pair (2026-06-10) → price is **per-pair**, not accelerator cohort procurement.

### Non-Goals
- Do NOT invent the program name, pricing, or final tagline/CTA copy — FOUNDER DECISIONs. (Brand/domain resolved 2026-06-10: claritypledge.com/program — see UI Contract.)
- Do NOT build the risk-score instrument inside this spec — it is **P918**; wire to it. (And do NOT build a two-party letter engine for it — P918 is solo by design.)
- Do NOT re-cut the positioning hook in copy — present the frozen 2026-06-04 cut.
- Do NOT merge into or restyle the coach landing (P915/P856) — separate audience, separate page.
- Do NOT add a server endpoint, schema change, or new DB table for the value-map/CTA render.
- Do NOT launch/promote to accelerators before a collaborator commits to co-running (sequencing gate).

## Done-When

- [ ] A founder arriving from an accelerator forward sees one wedge pain (the split) above the fold — not an abstract category.
- [ ] The gains × pains value map renders (gains sorted affective/cognitive/validity; pains labeled illustrative), on desktop and 320/375px.
- [ ] Primary CTA is the P918 misunderstanding-risk self-diagnostic, wired in (not built here); the score is presented as self-rated, never as a measured gap.
- [ ] Program structure + co-delivery framing present; credibility-transfer (accelerator/angel) framing present.
- [ ] Tagline rendered from a single to-test field; no tagline hard-coded as final (FOUNDER DECISION placeholder visible).
- [ ] Page is distinct from `/` (coach landing); cross-link present, no duplicated hero.
- [ ] No surface regresses on mobile-narrow (320px).

## UX Notes

- **Audience is warm, not cold:** arrival is via a trusted distributor (accelerator/angel) or a coach's network — copy can assume a forwarded, pre-warmed reader, unlike the coach landing's cold hero.
- **Buyer = the founder pair (self-buy):** a sales+booking surface for a self-purchasing pair on a warm forward, not an onboarding surface for an accelerator-procured cohort. CTA = the P918 self-diagnostic → book/buy.
- **One wedge, not seven:** the value map is a *supporting* inventory, not the hero. The hero is the single split-pain; the map appears below for the reader who wants the full picture.
- **States to cover:** risk-score CTA before/after completion; value map at desktop + 320/375px; tagline placeholder visible until FOUNDER DECISION resolves.

## Acceptance Criteria

- [ ] A founder pair forwarded by an accelerator can self-qualify (recognize the split-pain as theirs), reach the P918 CTA without reading any abstract theory, and self-purchase (sales+booking surface, not cohort onboarding).
- [ ] The page wires its primary CTA to P918 (verified: the instrument is P918, not built inside p916).
- [ ] Every remaining FOUNDER DECISION (name, price, tagline/CTA copy) is surfaced as an explicit placeholder, not silently filled.
- [ ] The page does not re-cut positioning — the founder-facing hook matches the frozen 2026-06-04 lean-canvas cut.

## UI Contract

| Element | Value | Context |
|---|---|---|
| Program name | `[FOUNDER DECISION: program name]` | hero / title |
| Hero pain (wedge) | the catastrophic split — "verify before you commit" (frozen founder-facing cut) | above the fold |
| Value map — gains | 8 gains, sorted affective → cognitive → validity (lean-canvas §UVP) | below hero |
| Value map — pains | 7 avoided-cost pains, labeled "illustrative, not measured" | below hero |
| Primary CTA | **P918** misunderstanding-risk self-diagnostic — `[FOUNDER DECISION: exact CTA copy]` (self-rated score → book/buy) | hero + repeat |
| Tagline (to test, do not hard-pick) | Candidate A: `We all crave being understood. Let's commit to verify we are.` · Candidate B: `We all crave being understood. Let's make it safe to find out we didn't.` · Candidate C: `The safety to be honest when it matters — a mutual promise to surface what we haven't yet understood.` — verb MUST be verify/check, never "listen" | hero subhead |
| Price | `[FOUNDER DECISION: pricing]` (€500 founding-cohort floated 2026-06-09) | offer block |
| Brand / domain | **claritypledge.com/program** (resolved 2026-06-10; coach landing stays at `/`, cross-linked) | route |

## Open Questions for /architect

1. How does p916 surface the **P918** self-diagnostic as its primary CTA — shared shell, embedded component, or a route the page links to? (Risk-score build questions live in P918, not here.)
2. Does `partner-template-page.tsx` provide a reusable shell for the `/program` route, or is this a fresh page?

*(Resolved, removed: brand/domain → claritypledge.com/program; "which letter component renders a risk score" → P918, which establishes the instrument does not yet exist.)*

## Dependency

- **P918 (misunderstanding-risk self-diagnostic)** — the primary CTA. p916 wires to it; P918 owns the scoring model, copy, and honest-scope framing. Cross-linked.
- **Launch gate (unchanged):** build-ahead is fine; do NOT promote to accelerators before a co-delivery coach commits (goals.md step 6; 2026-06-10 — still searching, two candidates assessed, neither fit).
