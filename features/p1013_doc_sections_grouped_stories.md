---
status: week
type: story
rank: 1000953.0
workstream: letters
created_date: '2026-07-30'
tags:
  - docs
  - letters
  - stories
  - structure
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1013: Doc Sections — group stories under a shared matter

> **PLACEHOLDER spec — Solution deliberately deferred.** The Problem is stable and
> independent of any pending work. The *shape* of the solution depends on evidence that
> does not exist yet (see "Solution — deferred"). Do NOT design the build until that
> evidence lands.

## Problem

**Situation:** A Clarity Doc is a flat, sequential collection of stories — `doc_stories`
carries `(doc_id, story_id, position)` and nothing else. Order is the only structure
available.

**Complication:** Real content arrives clustered, not flat. Deconstructing a conversation
into points and positions produces a small number of **high-stakes matters**, each carrying
several related stories and linked points. A flat list forces that structure to be encoded
in title prose or story ordering, where it is invisible to the reader and unusable by
anything downstream. The reader cannot see that four stories all bear on one contested
question.

**Question:** How should a doc express that a group of stories belongs to one matter — and
does the reading experience need it, or is ordering plus good titles enough?

## Appetite

**Medium blast radius** — `doc_stories` gains structure, and both the doc compose surface
and the letter reading experience must render it. **Reversible** — additive; a doc with no
sections behaves exactly as today. **Decision density unknown** until the evidence below
exists — that is precisely why the Solution is deferred.

## Solution — deferred

**Not designed. Blocked on evidence, not on effort.**

What the design depends on:

1. **How many clusters actually fall out** of a real deconstruction. If a two-hour
   conversation yields three high-stakes matters, sections are ceremony and ordering is
   sufficient. If it yields twelve, they are load-bearing.
2. **Whether clusters nest.** Flat grouping and a hierarchy are different builds with
   different migrations.
3. **Whether the reader needs them at read time or only the author at compose time.** These
   have very different surfaces — the second is nearly free, the first touches the sealed
   letter snapshot.

**Unblocking evidence — retargeted 2026-08-01.** Originally: the first manual two-party
deconstruction run. That run was abandoned at stage 1 (little to gain from that particular
subject), so it will not produce the cluster count.

**New trigger:** the first paid pilot that produces a real multi-story doc — either from a
team letter (P1025) or from a facilitated install. Until a doc exists with enough stories that
ordering visibly fails a reader, there is nothing to measure and no reason to design.

This spec stays open rather than closed: the problem is real and stable, only its evidence
source moved.

## Risks / Non-Goals

### Risks

- **Designing before the evidence.** The whole failure mode this spec guards against is
  building a nesting model for a cluster count nobody has measured. *Mitigation:* the
  deferred-Solution gate above; do not lift it without the count.
- **Letter immutability.** Letters snapshot doc content via `story_versions`. Section
  structure added later must be captured in the snapshot or sent letters will render
  differently from how they were composed. *Mitigation:* treat section membership as
  versioned content, not as live doc metadata read at render time.

### Non-Goals

- Do NOT design or build the section model before the cluster-count evidence exists
- Do NOT introduce co-ownership or co-editing — a doc stays author-owned (`definitions.md`,
  Clarity Doc: "What it is NOT")
- Do NOT change the existing flat-doc behaviour for docs without sections
- Do NOT couple this to the deconstruction pipeline — sections are a doc capability, not a
  feature of one workflow

## Done-When

- [ ] Cluster count and nesting shape observed from at least one real deconstruction, and
      recorded in this spec
- [ ] A decision is recorded: sections are needed, or ordering is sufficient and this spec
      is closed as rejected
- [ ] *(Only if needed)* Remaining Done-When items written at that point — not before
