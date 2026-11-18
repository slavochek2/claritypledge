---
status: week
type: comment
rank: 350
workstream: onboarding
created_date: '2026-11-18'
tags: [prepare, onboarding, friction, exploration]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1708: /prepare feels too long before people have felt why it matters

## Problem

**Situation:** /prepare is a five-step introduction (text plus a video per step, some videos 2-3 minutes) that people complete before an alignment meeting so they can use the practice live.
**Complication:** In a 2026-11-18 pitch conversation, a prospective partner who had not done /prepare said it reads as too long, suggested making it more game-like, and objected that people with back-to-back meetings will not spend 15 minutes before a kickoff. He also expected the practice to "come from their intuition". The practice is designed to counter intuition, so the content cannot be dropped, but the entry cost is paid before the person has felt any reason to pay it.
**Question:** How can the first minute of /prepare let a person feel their own understanding gap, so the remaining steps answer a question they now have, at a lower felt cost?

> Founder, verbatim: "it probably makes sense to decrease more friction … maybe if we create it more in a gamified way, it can be a bit more viral or a bit easier to do if it's fun."
> Founder, verbatim: "if you don't invest 15 minutes, then it's maybe not for you."

## Appetite

Blast radius: one flow (/prepare, which every event and member join uses). Reversibility: high, copy and step order. Decision density: high, this is an exploration for a separate session.

## Approach

Explore, do not build yet:
1. Measure each step's real duration (video length plus reading) and list which exceed about one minute.
2. Design options for a "feel the gap first" opener: the person makes a quick guess about how well they were understood, then sees the actual result, before any explanation.
3. Decide whether "game-like" can mean this kind of felt moment rather than points or badges.

## Invariants

- Gamification in the score-screen sense is ruled out: ritual design over gamification (decisions.md 2026-03-23). A gap reveal is a moment of truth, not a score.
- The Listening Game stays its own step, before the principle (P1685, 2026-11-16).
- Preparation videos stay required, play then Continue (P1529).
- The practice must still counter intuition; an opener that flatters intuition defeats the point.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| One person's taste drives a redesign | MITIGATE | Exploration only; any change needs evidence from more than one first-time user |
| Shorter steps lose the content that makes live use work | MITIGATE | Measure what people can do in the room after a shorter version |
| "Not willing to spend 15 minutes" is a real qualifying signal | ACCEPT | Lower friction from tiredness, not from lack of interest |

**Non-Goals**
- Do NOT add points, badges, streaks or leaderboards.
- Do NOT build anything in this spec; output is options for the founder.

## Deliverable

A short options note: per-step timings, two or three opener designs, and a recommendation.

## Done-When

- [ ] Every /prepare step has a measured duration
- [ ] At least two "feel the gap first" opener options are written up with their trade-offs
- [ ] Founder has chosen to build, iterate or drop

## Open Questions

1. Does "reaching alignment is worth 15 minutes" hold for first-time kickoff attendees, or only after they have felt a gap once? Founder: "I don't know if it holds."
