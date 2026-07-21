---
status: today
type: story
rank: 1
created_date: '2026-07-20'
tags:
  - funnel
  - audit
  - cta
  - letter
  - report
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-07-20T07:49:46.440Z'
---

# P1003: 3-Minute Alignment Audit Funnel (replace the letter dead-end)

## Problem

**Situation:** `/founder` and `/coach` lead with "Try a Clarity Letter" → `/letter/ck`, a ~27-step letter. Meanwhile the `/` front door (P987) leads with "Book a free alignment audit" → the 15-min `/intro` booking. The two entry surfaces disagree about what the first ask is.
**Complication:** No cold co-founder-pair visitor finishes a 27-step letter on first click. When they stop partway, the flow lands them at "sign into platform" and the funnel then depends on the founder manually reaching out — it leaks at the finish. And the "alignment audit" we advertise on `/` is not actually the letter; it's conceptually a lighter, points-only diagnostic.
**Question:** What is the single, low-friction first action for a cold visitor, and how do we build a ~3-minute audit that captures data, returns a report, and offers the 15-min session — without a manual-outreach gap?

## Appetite

High blast radius (changes the primary CTA on `/founder` + `/coach`, adds a new savable-audit surface, touches the entry-page funnel that `/` and `/intro` already define). Medium reversibility (feature-flaggable; CTA swap is small, but report-generation + savable positions is real new surface). High decision density — several [FOUNDER DECISION] items: audit naming, which points, report content/shape, and when/how the 15-min offer appears.

## Solution / Approach

A points-only audit (conceptually like `/feed/misunderstanding`): a cold visitor sets positions on a small curated set of points (~5–7), **saves them**, receives a **generated report**, and is then offered the 15-min session as the report's CTA. This becomes the single first action for the entry pages, replacing "Try a Clarity Letter" as the cold-visitor path (the full 27-step letter remains a deeper, post-audit tool, not the front-door ask).

Investigate before building:
1. Whether `/feed/misunderstanding` (or the letter points engine) can supply the points-only interaction, or whether this is a new surface.
2. Whether positions can be saved for an unauthenticated visitor (anonymous save → claim on sign-in) or whether a light identity step is required before save.
3. What the report is: generated from the saved positions, and what makes it worth the 15-min offer.
4. How the 15-min offer connects to the existing `/intro` booking so there is no manual-outreach gap.

## Risks / Non-Goals

### Risks
- **Anonymous save**: if positions can't be saved without auth, the "3-min" promise breaks at the save step. Mitigation: resolve the anonymous-save/claim path in `/architect` before committing UX.
- **Naming drift**: `/` already advertises "alignment audit"; decisions.md (2026-07-16) named the audit for the *outcome* (alignment), not the mechanism (understanding/theory-of-mind). Reopening the name is a [FOUNDER DECISION], not an implementation default.
- **Report quality**: a thin report kills the 15-min conversion. The report content is a founder decision, not agent-filled.

### Non-Goals
- Do NOT delete or rewrite the existing 27-step letter (`/letter/ck`) — it stays as a deeper tool; this spec only changes the cold-visitor front-door ask.
- Do NOT build the video-embed work here — that ships in parallel and is decoupled (its soft CTA mirrors whichever CTA this spec lands on).
- Do NOT redesign `/intro` booking — reuse it as the 15-min offer destination.
- Do NOT fill audit naming, point selection, or report content without a [FOUNDER DECISION].

## Done-When

- [ ] A cold visitor can set positions on the curated points and save them in roughly 3 minutes
- [ ] Saving produces a generated report the visitor can view
- [ ] The report presents the 15-min session offer, wired to the existing `/intro` booking (no manual founder outreach required)
- [ ] `/founder` and `/coach` primary CTA reconciled with `/` (single, consistent first ask across entry pages)
- [ ] The 27-step letter remains reachable as a deeper tool (not deleted)

## UX Notes

- States to design: empty (no positions set), in-progress (some set), saved (report generating), report-ready, report-with-offer.
- Anonymous vs authenticated save path is the load-bearing UX fork — resolve first.

## Acceptance Criteria

- [ ] Cold visitor completes audit → report → sees 15-min offer without hitting a "sign in and wait for outreach" dead-end
- [ ] Entry-page CTAs (`/`, `/founder`, `/coach`) tell one consistent story about the first action
- [ ] Works on mobile and desktop
