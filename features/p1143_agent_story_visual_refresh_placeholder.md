---
status: later
type: comment
rank: 1
workstream: C2
created_date: '2026-08-21'
tags: [design, stories, agents, placeholder]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1143: Revisit the visual treatment of agent stories

## Problem

While reviewing layout options for `features/p1141_story_carries_a_video_with_jumpable_quotes.md`,
the founder observed that the prototype's treatment reads better than what currently ships —
specifically the byline block, the machine chip, the machine marker on the avatar, and the footer
disclosure. **This was deliberately not discussed at the time**, to keep P1141 about video and
quotes rather than about styling.

This spec exists to hold the observation so it is not lost and does not leak into P1141's scope.

## Appetite

**Placeholder — not scheduled and not scoped.** Nothing here is a commitment to change anything.
Blast radius unknown until scoped; the components involved render across the feed, profiles, story
detail and share cards, so it is not a local change.

## Approach

When picked up: compare the shipped agent-story treatment against the prototype
(`https://claude.ai/code/artifact/88914b99-5733-4608-9840-05fcb215c3fe`), decide which differences
are genuine improvements rather than novelty, and scope only those.

**Open until scoped:** whether this is a change to agent stories only, or the beginning of a wider
visual pass. Those are different pieces of work and should not be conflated by whoever picks this up.

## Risks / Non-Goals

### Non-Goals

- **Do NOT act on this spec as written.** It is a placeholder; it needs scoping before any change.
- **Do NOT pull visual changes into P1141.** That spec is about video and quotes.
- **Do NOT treat the prototype as a design system.** It was built to compare three layouts, not to
  set a house style.

## Done-When

- [ ] Reviewed with the founder, then either scoped into real work or closed as not worth doing
