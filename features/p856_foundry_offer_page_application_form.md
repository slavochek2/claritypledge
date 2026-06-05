---
status: today
type: story
rank: 250196.25
created_date: '2026-05-27'
tags:
  - foundry
  - offer
  - application
  - funnel
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-06-04T17:00:18.735Z'
---

# P856: Clarity Org Foundry offer page + application form

## Problem

**Situation:** The Chiang Mai event's deliverable is a recorded authority asset for positioning toward accelerators + co-founder pairs (see EVENT-STRATEGY). There is currently no landing page to point that recording at, and no gated application for the pairs workshop.

**Complication:** The funnel `talk → recording → offer page → workshop application` has no destination. The recording converts nothing without a page that hosts positioning + (later) the event video + a qualifying application that applies the audience-precondition filter (does the applicant have a partner in active misalignment?).

**Question:** Build the offer page (hero = recording slot, positioning, links to a9/blog) and the application form (qualifying questions from the facilitator guide) so the recording has a conversion destination.

## Appetite

Medium blast radius (new public page + form; no change to existing flows). Fully reversible (unpublish). Medium decision density — copy/positioning and pricing are `[FOUNDER DECISION]`; the qualifying questions are mostly settled (facilitator-guide).

## Solution

Two coupled surfaces (may decompose):
1. **Offer page** — Clarity Org Foundry positioning. Hero placeholder for the event recording (enriched post-event). Sections: the problem (link a9), who it's for (pairs), what the workshop delivers, proof (links: two-founder-skills blog, manifesto). CTA → application form.
2. **Application form** — the qualifying gate. Includes the facilitator-guide questions, crucially the audience-precondition filter ("do you have a co-founder / partner / team you need to align with?") and the value question. Min 6 qualified applicants before go/no-go (per project brief).

## Risks / Non-Goals

### Risks
- Page positioning leaks the solution mechanics CP keeps for the workshop. Mitigation: problem-forward copy; tease, don't teach.

### Non-Goals
- Do NOT finalize pricing or hero copy without founder sign-off (`[FOUNDER DECISION]`).
- Do NOT block on the event recording — ship with a placeholder, enrich later.
- Do NOT wire the application to any pledge/agreement product change (independent of P855).
- Do NOT build a general CMS — one page + one form.

## UX Notes

- Application is the audience-precondition filter in practice — solo applicants without a partner get redirected to lighter content (a9 / Letter), not the workshop.

## Acceptance Criteria

- [ ] Offer page live with recording placeholder + problem/who/what/proof sections + CTA
- [ ] Application form captures the facilitator qualifying questions incl. the partner-precondition
- [ ] Solo (no-partner) applicants are routed to lighter content, not the workshop
- [ ] Founder-approved positioning copy + pricing

## Related

- EVENT-STRATEGY.md (funnel) · facilitator-guide.md (qualifying questions) · a6 (two-founder-skills) · a9 · manifesto
- Foundry SKU = pp 2026-05-18 decision
