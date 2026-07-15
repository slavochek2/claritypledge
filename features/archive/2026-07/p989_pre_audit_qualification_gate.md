---
status: rejected
type: story
rank: 1000944.0
created_date: '2026-07-15'
completed_at: '2026-07-15'
tags: [gtm, key-hire, funnel, qualification, rejected]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P989: Pre-Audit Qualification Gate — REJECTED

> **Rejected 2026-07-15, same day it was filed. Never built.** The problem was real; the solution was not. What shipped instead: a one-string calendar swap (`0c2d449b`) plus self-select copy in the Google Calendar description. No route, no form, no email capture. This file is kept as the reasoning record — read the rejection before re-proposing a pre-screen form.

## What was proposed

A native cp route between the `/` key-hire CTA and the `/intro` booking: a self-select header, Q1 (count of key hires that didn't work out), Q2 (hiring state) — routing three of four Q2 answers to `/intro` and the fourth to a soft decline with email capture.

## Why it was rejected

**1. It was a gate in front of a gate.** `discovery-questions.md` designs the Phase-1 pre-screen as *"Gates 1–4 as an async form **+ a 15-min call** BEFORE the interview"* — the form's job is to stop you burning the 15-min call on a non-fit. But `/intro` **is** that 15-min call. The form wouldn't have protected the 90-min audit; it would have protected a 15-minute call, at ~5 bookings/month.

**2. The failure costs are wildly asymmetric.** A non-fit who books costs 15 minutes and teaches you something — cheap and recoverable. A fit who bounces off the form costs one of the nine paid clients the M1–M3 walk-back depends on — unrecoverable and *invisible*, since you never learn it happened. When over-filtering is that much worse than under-filtering, let people through.

**3. Q1 was a self-report screen on a wedge whose thesis is that self-report is unreliable.** The run card bans exactly this: *"Do NOT screen on self-reported uncertainty — a confident founder certain he understands his customers is the illusion signature."* The spec defended Q1 as capture-not-gate, but the founder answering it doesn't know that — they read it as qualifying, answer zero, feel judged, and leave. The filter fires in their head regardless of what the code does.

**4. Its one legitimate question was already answered.** Q2 (hiring state) is factual, not self-assessed — the only defensible gate in the spec. But the channel is warm DMs (goals.md rung 1). You send the DM *because* you know they're hiring. The gate's only real question is one you know the answer to before you hit send.

**5. Instrumentation buys nothing at this n.** The spec required measuring book-through so the friction tax stays visible. At ~5 bookings in M1 you cannot distinguish a 60% pass rate from 80%. Five is countable by hand — you know every one of them by name. (This also moots the Tally-vs-native question: Tally breaks the Mixpanel funnel exactly where the drop-off would need measuring, but there's nothing measurable there yet either way.)

## What shipped instead

- **Self-select copy → the Google Calendar description**, not a page or a form: *"You'll get the most out of these 15 minutes if you own what gets built and who it's for, and you're hiring — or just hired — somebody for a key position."* Zero build, zero drop-off mechanics. Note it renders below the fold on mobile (the DM-driven majority) — it's honest signage, not a working filter.
- **No job title in the copy.** "Own what gets built and who it's for" carries the Gate-1 owner check directly, which sidesteps founder-vs-C-level entirely. Dropping the "and who it's for" half would admit the CTO — the execution owner that gate exists to exclude.
- **New appointment schedule on a separate Google account** — bookings surface the organizer address in the calendar invite (verified: the *booking page* exposes name + photo only, no email; the post-booking invite is unverified inference). Commit `0c2d449b` swaps `CALENDAR_URL` in `intro-page.tsx`.

## Rejected scope expansions (surfaced during the discussion)

- **"Anybody hiring for key roles", not just founders.** Rejected. Exposure / job complexity / emotional stakes / quit cost all measure *stakes*, and stakes aren't the constraint. What founders have that a Series C VP doesn't is an unproven bet that isn't written down, can't be checked for months, and exists only in their head — that's what makes "did they actually get it?" both unanswerable and expensive. The VP's hire can misunderstand the job, but the job is documented and HR exists. Both `discovery-questions.md` gates already encode this (the Gate-1 owner check excludes the execution owner; Gate 3 caps the window at seed–A because "late = HR exists"). Findability too: you can DM founders; "anybody hiring" is a category, not a segment.
- **Widening ICP to C-level.** Same failure, entering through vocabulary.

## Revisit trigger

**When the 15-min calls become the actual constraint** — roughly 10+/week eating delivery time. Then an async pre-screen earns its place. Until then the call is cheaper than the form it would replace.

If **H-FounderWince falsifies on the wince**, widening past founders becomes a real branch — but that's a wedge decision, not a form decision.

## Related

- **P987** — key-hire front-door reframe; owns `program-page.tsx` and the `<Link to="/intro">` CTA. Never needed retargeting.
- **P982** — parked `/pmf` form. Same family of rejection.
- goals.md rung 2 (updated 2026-07-15 — the pre-screen *is* the call) · `.private/docs/business/discovery-questions.md` Phase 1 · hypotheses.md **H-FounderWince**.
- **Open reconciliation:** `discovery-questions.md` Phase 1 still reads *"async form + a 15-min call"* — the async-form half is now rejected. Not yet updated.
