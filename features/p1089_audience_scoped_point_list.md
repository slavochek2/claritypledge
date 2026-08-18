---
status: backlog
type: story
rank: 94
workstream: events
created_date: '2026-08-17'
tags: [points, events, visibility, artifact]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1089: Audience-scoped point list — the artifact a private conversation needs

**Parked on purpose.** Filed to preserve the reasoning, not to be built. Nothing planned for the next month requires it; see Non-Goals. Revisit only after one event has actually run.

## Problem

**Situation:** `/slava:content:points-prepare` turns a conversation into polarizing points. Two delivery paths exist today and neither needs new work: points from a **public** source can be filed public and browsed by tag; points from a **private** conversation can reach exactly one other person as a sealed letter.

**Complication:** A point's statement is only answerable relative to a retrievable context. In a 2026-08-17 run over a private 2h20m two-person transcript, six points were sharp enough for both participants to take ±3 positions — **because both had been in the room**. Published to strangers, the same sentences lose their referents ("the protocol", "the mess", "the measure"), and the author reported he would have to hedge them heavily before committing to any strong position. Hedging weakens the statement; the alternative is re-filing repeatedly until it is answerable. **The blocker is not privacy — it is whether the audience can retrieve the context.** A public video supplies it by link. A private conversation cannot, to anyone who was not there.

**Question:** When points come from a private conversation and the audience is a **group** rather than one person — event attendees, a team, a cohort — what artifact carries them, given that a point today is either fully public or visible only to its creator, and that visibility is fixed at creation?

## Appetite

**High blast radius** — this is a new visibility state, and the product deliberately has only two. Point visibility is immutable after creation and enforced by trigger; a cross-visibility constraint also binds story-to-point links. Any third state touches every read path that currently assumes public-or-mine.

**Reversibility: poor.** Content filed under a new scope cannot be trivially re-scoped, for the same immutability reason.

**Decision density: high, and mostly unasked.** Who defines an audience, whether membership can change after filing, and what happens to positions taken by someone who later leaves the audience — none has a founder decision behind it.

## Solution

Deliberately not designed. What is recorded here is the **shape of the need**, so a future session does not re-derive it:

- The unit is a **list of points sharing one source**, not a single point.
- Its audience is a **named set of people** — the participants in the conversation, the attendees of an event — not "everyone" and not "only me".
- Members must be able to take positions, which today requires the content to be readable by them at read time, not merely delivered to them once.
- The letter path already solves the **one-recipient** case by freezing a copy at send time. The open case is **many recipients**, where a frozen per-recipient copy is the wrong shape.

## Risks / Non-Goals

### Risks

- **Building it before an event has run means designing for an imagined room.** **MITIGATE:** the parked status is the mitigation. Run a public-source event first; the real friction observed there defines the requirement.
- **A third visibility state is a privacy surface.** Every existing read path assumes two states, and the failure mode is silent over-exposure rather than an error. **MITIGATE:** whoever builds this enumerates the read paths first, and treats the existing immutability trigger as a constraint to satisfy rather than to relax.
- **Audience membership changing after positions exist** has no answer today. **DEFER** — needs a founder decision, not an implementation.

### Non-Goals

- **Do NOT build this until an event has run on public-source points.** That run is the evidence this spec is waiting on.
- **Do NOT relax point-visibility immutability** to fake a third state.
- **Do NOT re-architect letters** to carry points as first-class entities. A letter always carries a story (the link table requires one); changing that is separate work with its own spec, and nothing currently planned needs it.
- **Do NOT build point refinement, forking, or user-initiated superseding here.** A supersede link and a version-history walk already exist, but no user can set them — points have no update permission at all. Whether anyone should is a separate, unrequested question.
- **Do NOT use this to hold points from public sources.** Those are public, and the source link is what makes them answerable.

### Alternatives Considered

- **All points public, always.** Works for public sources. Fails the private-conversation case for exactly the reason in Problem — the statement must be hedged into uselessness before a stranger can rate it.
- **Sealed letters to each member of the group.** Works mechanically for small groups and needs no build, but the per-recipient frozen copy means members answer against separate copies rather than a shared list.
- **Public points under an obscure tag.** Not privacy, and cannot be claimed as such.

### Rollback Strategy

Not applicable while parked. If built, rollback requires deciding what happens to already-filed content under the new scope — which is itself a reason to defer.

## Done-When

*(Deliberately thin — this spec is parked. Completion criteria get written when the requirement is evidence-backed rather than anticipated.)*

- [ ] An event has run on public-source points, and the friction observed there is recorded here
- [ ] The founder decisions above (audience definition, membership change, orphaned positions) have answers
- [ ] Only then: acceptance criteria written

## References

- `features/p1088_video_selector_for_point_extraction.md` — selects the conversations
- `.claude/commands/slava/content/points-prepare.md` — produces the points
- The 2026-08-17 private-transcript run that produced this reasoning is in `.private/points-runs/`
