---
id: p620
title: 'Online workshop #1 — universal pitch + three-track payment + parallel channels'
type: task
status: all-done
priority: high
rank: 531668.032
tags:
  - workshop
  - outreach
  - h-workshop-format
  - h-wtp-pain
created_date: 2026-04-02T00:00:00.000Z
locked_at: '2026-06-17T09:21:38.292Z'
---

# P620 — Online Workshop #1: Universal Pitch + Three-Track Payment + Parallel Channels

## Problem

First workshop is imminent (kill date: April 25 — 0/2 workshops = pipeline doesn't convert). The session on 2026-04-11 reframed the experiment from "test curriculum" to a compound falsification test:

1. **Does the universal positioning copy convert with a founder-filtered audience?** The universal pitch (`docs/lean-canvas.md:128`) has never been tested live with accelerator-sent founders. Risk: founders arrive expecting tactical co-founder advice and the frame snaps. Counter-hypothesis: founders map the universal protocol to their own co-founder relationship themselves, with the cover email doing the translation work.
2. **Does the three-track value-anchored payment model produce real contribution?** See `docs/facilitator-guide.md#workshop-pricing`. Track 3 (critical feedback only) is elevated as the highest-value track for learning velocity — the workshop needs to produce Track 3 signal, not just Track 1 cash, to count as successful.
3. **Which outreach channel produces what kind of attendee?** Accelerator-distributed founders vs. practice-community attendees — same event, two doors, comparison is the learning.

Decision rationale (Path 3 over narrow-founder Path 1 and community-only Path 2): `docs/decisions.md` 2026-04-11 [product] entries.

## Scope

### Online Workshop Prep (this week)
- [ ] Create event listing (Luma or direct Google Meet link) — pick date before April 25 kill date
- [ ] Use **universal positioning copy** from `docs/lean-canvas.md:128` as event description (NOT V3-final founder-narrow copy)
- [ ] Add the 13-word pitch hook as the headline: "How do you know you understood someone — if they don't know you did?" (`docs/lean-canvas.md:112`)
- [ ] Strip any founder-workshop category anchors ($300–800) from the event-facing copy — those are internal reference only (see decisions.md 2026-04-11)
- [ ] Select 3-4 false beliefs from P567 curriculum for the session
- [ ] Prepare before/after measurement questions (both the personal-comfort delta AND the new leadership-accountability norm question from `docs/facilitator-guide.md#workshop-metrics`)
- [ ] **Build private post-event Google Form** (three-track model, see `docs/facilitator-guide.md#workshop-pricing`):
  - Q1: What landed (3 specific moments)
  - Q2: What didn't land (3 specific items, required)
  - Q3: Self-assessed value — "What is this experience worth to you?"
  - Q4: Track selection (presented only after Q1–Q3)
  - Track 3 explicitly framed in the form as "the most valuable contribution to me"
- [ ] Draft value-anchor statement to open and close with (comparable category + concrete outcomes + facilitator cost)

### Parallel Channel Outreach (this week) — NEW
**Both channels invite to the same event; the cover email does the channel-specific translation work. Event copy stays universal.**

**Channel A: Accelerators + warm network**
- [ ] Draft story-led cover email: lead with 14-co-founder/bankruptcy story, explain why co-founders specifically need this, link to *The Two Skills That Will Define the Next Generation of Founders* (`content/articles/a6_two-skills-next-generation-founders.md`) as optional proof at the bottom, close with universal event invite
- [ ] Pick 2–3 accelerators directly (no shortlist doc, founder picks)
- [ ] Send cover email to each accelerator point-of-contact — ask for named intro, not a forwarded email (forwarded converts ~1%, named intro 10x)
- [ ] Invite 5–10 warm-network founders directly as host comps for social proof in the room

**Channel B: One practice community**
- [ ] Pick one practice community (NVC circle / relational-practice group / ops community / similar) where the universal pitch already has native language
- [ ] Draft community-native outreach (no founder translation needed — the pitch matches the community's existing frame)
- [ ] Send outreach to the community organizer

### Workshop Pricing

**See `docs/facilitator-guide.md#workshop-pricing`** — value-anchored three-track pay-what-it's-worth is the single source of truth. Do not duplicate the model here.

**Thailand exception:** if the event is run under DTV constraint, Track 1 cash is replaced by time-donation-only; Tracks 2 and 3 unchanged.

## Success Criteria

Not "workshop ran" — learning-velocity signals instead:

- Online workshop #1 runs before April 25 (kill date holds)
- **Track distribution captured:** what % selected each of the three tracks (form data)
- **Track 3 signal:** at least 1 attendee selected Track 3 AND produced 3 specific feedback items. **A workshop where 0 attendees chose Track 3 is a warning signal (social pressure wasn't inverted), not a success.**
- **Frame-snap check:** from post-event form free-text, can we tell whether accelerator-sent founders experienced the universal pitch as landing or frame-snapping? (Qualitative, but name the signal.)
- **Channel comparison:** compare Channel A vs. Channel B attendees on Track distribution, Track 3 feedback quality, and whether the frame landed differently. Write the comparison up in a follow-up decisions.md entry.

## Out of Scope

- Singapore (comes later — separate planning)
- KL in-person venue outreach (deferred to a follow-up spec; will be picked up after online #1 runs and produces data — see `docs/decisions.md` 2026-04-11 [product] Path 3 entry)
- Bangkok, Taipei, or other cities
- Second online workshop iteration (happens after this one produces data)
- Pricing experimentation beyond the three-track model (the model itself is under test)
- `.private/` accelerator shortlist doc (founder picks directly, no doc needed)

## Related

- [Facilitator Guide §Workshop Pricing](../../../docs/facilitator-guide.md#workshop-pricing) — three-track model, form structure, facilitator rules (single source of truth)
- [Decisions Log — 2026-04-11 [product] entries](../docs/decisions.md) — Path 3 GTM, private form, Track 3 elevation
- [Hypotheses — H-WorkshopFormat, H-WTP-Pain](../docs/hypotheses.md) — 2026-04-11 updates reference this spec
- [Lean Canvas §Universal positioning copy](../docs/lean-canvas.md) — the event copy source (line 128)
- [Blog — The Two Skills That Will Define the Next Generation of Founders](../../../content/articles/a6_two-skills-next-generation-founders.md) — accelerator cover email's optional-proof link
- [P567: False Belief Curriculum](../24_mar_26/p567_false_belief_workshop_curriculum.md) — session content
- [P606: Clarity Flip Workshop](../22_mar_26/p606_clarity_flip_workshop.md) — format design
- [P599: ladischenski.com value prop](../22_mar_26/p599_ladischenski_derisking_value_prop.md) — coaching value prop (separate from workshop three-track pricing)
