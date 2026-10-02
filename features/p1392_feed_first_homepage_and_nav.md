---
status: week
type: story
rank: 18
workstream: growth
created_date: '2026-10-02'
tags: [landing, navigation, feed, cta]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1392: Feed-first homepage, discovery-call CTA, events back in the menu

## Problem

**Situation:** Anonymous "/" serves the build-the-right-thing landing whose single CTA is "Book a free alignment audit" (→ /intro). The public menu routes events only through Groups (P1193).
**Complication:** Nobody has ever booked an alignment audit. The founder reaches every event via Groups → group → event (3 clicks).
**Question:** Make the real content (stories) the front door, and make booking and events one click away.

> Founder, verbatim: "nobody ever booked a free alignment audit so far you know landing on this main page doesn't bring us much but what if we make feed stories view default"
> "I find myself always clicking on groups and then go in specific group and go in the event … maybe we should have events, feed, events, groups, pledgers and pricing is the last."

## Appetite

Blast radius: medium — the front door for every anonymous visitor, plus every nav surface. Reversibility: git revert. Decision density: all decided in conversation (2026-10-02).

## Solution

1. **CTA rename, system-wide:** "Book a free alignment audit" → **"Book a 15-min discovery call"** [FOUNDER DECISION: made 2026-10-02]. Still targets /intro (Google appointment schedule, already 15-min per decisions.md). Update tests asserting the old string.
2. **/feed defaults to the Stories tab**; `?tab=points` selects Points.
3. **Anonymous "/" → feed on Stories** [FOUNDER DECISION: made 2026-10-02, chose feed over groups]. The build-the-right-thing landing moves to its own path; "For builders" in Use cases points there. Signed-in behaviour unchanged (already → /feed).
4. **Public menu order: Feed · Events · Groups · Pledgers · Pricing** [FOUNDER DECISION: made 2026-10-02]. "Events" opens the upcoming-events list directly (reverses P1193's removal of the word from the menu). Pricing last. Use cases menu stays.

5. **Feed header, decluttered** [FOUNDER DECISION: approved 2026-10-02]: sort becomes a "Sort: Newest / Oldest" pill (the /topics pattern); tag cloud shows the top 5 with "More tags", internal/test tags (#test, #p…) hidden.
6. **Desktop right rail** [FOUNDER DECISION: approved 2026-10-02, instead of a LinkedIn 3-column]: next events + Explore groups. Phones unchanged.
7. **CTA consistency** [FOUNDER DECISION: 2026-10-02]: /coach and /founder book the same 15-min discovery call instead of "Try a Clarity Letter". /founder keeps its webinar CTA only while a Clarity Experiment is upcoming.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Feed on "/" is too inside-baseball for a stranger | ACCEPT | Old landing produced zero bookings; reversible by revert |
| Old string asserted in many e2e tests | MITIGATE | Update assertions to the new string; no other test edits |
| `/events` currently redirects to /groups/cm (one-group hardcode) | MITIGATE | Menu "Events" targets the unredirected list |
| SEO/meta on "/" changes | ACCEPT | Low organic traffic today |

**Non-Goals**
- Do NOT redesign the feed, landing or /intro page content.
- Do NOT build a LinkedIn-style left column or post composer.
- Do NOT build the video / playable-character landing (v2) or rework /tree/landing-first.
- Do NOT touch P1003's "diagnostic" naming.

## Acceptance Criteria

- [ ] Signed-out visitor opening "/" sees the feed with Stories selected, with site header (Use cases, Pricing) intact
- [ ] Old landing reachable at its new path and via Use cases → For builders
- [ ] /feed with no tab param shows Stories; Points still reachable
- [ ] No visible "alignment audit" button text remains; buttons read "Book a 15-min discovery call" and open the booking calendar
- [ ] Menu (desktop, mobile, footer) reads Feed · Events · Groups · Pledgers · Pricing; Events opens upcoming events in one click
- [ ] Feed sort reads "Sort: Newest" and switches to Oldest; at most 5 tags show plus "More tags"; no #test / #p… tags
- [ ] Desktop feed shows a right rail with next events and Explore groups; phone widths show no rail
- [ ] /coach and /founder (no upcoming experiment) show "Book a 15-min discovery call" in header and hero
- [ ] 375 / 320 / desktop screenshots pass visual QA

## Related

- decisions.md 2026-07-16 [product] front-door CTA; the audit-vs-diagnostic entry ruled a rename "system-wide, its own task" — this is that task.
- P1193 (Groups replaces Events in nav), P1004 (landing on "/"), P1003 (diagnostic naming reserved).
