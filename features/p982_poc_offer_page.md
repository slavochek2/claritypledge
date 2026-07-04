---
status: today
type: task
rank: 312789.063
created_date: '2026-07-04'
tags:
  - gtm
  - offer
  - founder-wedge
  - landing
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P982: $99 PoC Offer Page (founder-direct pilot, interview-week artifact)

## Problem

**Situation:** The founder-direct pilot (H-FounderWince, customer-development-clarity domain) runs interview → letter-commitment → **first paid PoC group of 4** (~$99: each fills a Clarity Letter → answers the others' → discuss live via /live). The interview questions and the positioning bet are recorded (`discovery-questions.md`, lean-canvas §UVP), and the offer *timing* is decided.
**Complication:** There is no written offer to point a qualified interviewee at. The current site sells the dormant €950 co-founder-pair program (Posture 1) — a curious interviewee lands on the wrong strategy.
**Question:** What is the minimum written offer that (a) an interviewee can be pointed to after the wince lands, and (b) does not front-run wince-validation with a build project?

## Appetite

Small. Low blast radius (a new standalone page/doc; does NOT touch the existing landing or `/pricing`). Fully reversible (it's a page). **Decision density: medium** — several `[FOUNDER DECISION]`s open (community name, exact copy, page-vs-doc). **Validate-before-build constraint:** this must not become a build project that runs ahead of the wince test — a written doc is an acceptable v1.

## Solution / Approach

**Start as a written offer (v1), graduate to a coded page (v2) only if the first interviews show pull.**

- **v1 (this week):** a plain written offer (doc / simple page) the founder sends or shows a qualified interviewee. Content = headline, who it's for, the format, the price, the commitment mechanic. Enough to make the offer concrete and consistent across interviews. No engineering.
- **v2 (only after pull confirmed):** a lightweight standalone route (its own page, NOT a rewrite of the home landing) reusing the existing design system. Trigger to build v2 = the first interviews produce real pull + a formed group; do not build v2 before then.

Content spine (all copy `[FOUNDER DECISION]`, draft below):
- **Headline:** "Get to PMF faster" (approved).
- **Sub:** for entrepreneurs / builders with AI; in the AI age execution is cheap — the edge is clarity (problem formulation).
- **The bet (positioning):** the #1 way customer development fails is you hear what you want to hear and believe you understood the customer. This room fixes that.
- **The format:** 4 founders · fill a Clarity Letter · answer each other's · discuss live. ~$99.
- **Commitment mechanic:** spot held by writing your letter; $99 + deadline attaches to group formation (see `discovery-questions.md` §Offer timing).

## Risks / Non-Goals

### Risks
- **Scope creep into a full community landing.** Mitigation: this page sells the *first experience only*; the community landing is a separate, later artifact (a room must exist first).
- **Building v2 before pull is proven** (violates validate-before-build). Mitigation: v1 is a doc; v2 is gated on interview pull.
- **Contradicting the live site** (€950 pair program still on `/pricing`). Mitigation: standalone route; do not wire into the main funnel until the pilot decides.

### Non-Goals
- Do NOT modify the existing home landing or `/pricing` (Posture-1 surfaces stay until the pilot resolves).
- Do NOT position or name the ongoing *community/membership* here — only the first PoC experience.
- Do NOT build the coded page (v2) before the first interviews show pull.
- Do NOT invent the community name, price beyond ~$99, or final copy — those are `[FOUNDER DECISION]`.
- Do NOT add payment/Stripe wiring in v1 (the $99 is collected manually at group formation).

## Done-When

- [ ] A written offer (v1) exists that states headline, audience, format (4 people · fill/answer/discuss-live), ~$99, and the commitment mechanic — consistent enough to use across all pilot interviews.
- [ ] It is self-contained and does NOT alter the current landing or `/pricing`.
- [ ] Every `[FOUNDER DECISION]` (community name, exact copy, page-vs-doc, v2 trigger) is marked, not silently filled.
- [ ] v2 (coded page) is explicitly gated: a note records "build only after interview pull confirmed."

## UI / Content Contract (draft — all `[FOUNDER DECISION]`)

| Element | Draft value | Note |
|---|---|---|
| Headline | "Get to PMF faster" | Approved |
| Sub | "For founders building with AI. Execution is cheap now — clarity wins." | Copy TBD |
| Format line | "4 founders · a Clarity Letter each · answer each other's · discuss live" | Confirmed mechanic |
| Price | "~$99" | Confirmed anchor 2026-07-04 |
| CTA | "Hold your spot — write your letter" | Commitment ≠ cash-at-interview |
| Community name | — | `[FOUNDER DECISION]` |

## Related

- `.private/docs/business/discovery-questions.md` — Phase-1 pre-screen, Phase-2 interview, §Offer timing, Phase-3 testimonial
- `docs/goals.md` §Active — the rung ladder this page's offer sits at (rung 3)
- `docs/decisions.md` 2026-07-04 [product] — the positioning bet + domain
- `features/p918_misunderstanding_risk_self_diagnostic.md` — the `/letter/ck` diagnostic that feeds the funnel (verify it renders a measured gap on prod before leaning on it)
