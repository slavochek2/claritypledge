# Goals

Concrete next steps in priority order. Updated 2026-03-24.

**Last updated:** 2026-04-11 (letter-as-primary-instrument pivot; workshop demoted to deployment mode)

Flywheel: see [lean-canvas.md](lean-canvas.md#channels--flywheel). Steps below follow that sequence.

**Core outcome:** Participants want to spread common knowledge about common knowledge and need to create Clarity Partner Agreements.

## Next Steps

1. [x] P560: Story filing without position — prerequisite for workshop (epic-story-first)
2. [x] P545: ladischenski.com positioning update
3. [x] P551: Clarity Docs — curated story collections, compose/edit surface for letters
4. [ ] Letters ship (P581 + P683 + P684) — **PRIMARY INSTRUMENT (2026-04-11).** These are not workshop support; they ARE the product. The workshop is one deployment mode of the letter, not its successor. Once shipped, distribute the letter directly (not only as workshop prep) and measure H-LetterAsProduct. P581 = sealed-bid gap reveal (prerequisite for H-WTP-Pain at workshop — decisions.md 2026-04-02). P683 = TOS consent on letter open (GDPR, legally required before sending to real participants). P684 = account-gated responses on one-to-many letters (anonymous responses are useless for pre-workshop prep — no identity = can't match who's arriving). All three must land before the letter can be publicly distributed or before workshop can test the core hypothesis.
4.5. [x] P686 Badge Step 1 (~1 day): Minimum badge infrastructure (DB table + profile checkmark + auto-trigger from /live). Must be ready AT workshop #1 to observe propagation signal: do badged people share? How many names do they give? R₀ measurement only works if the badge artifact exists in the moment. See P685 for full vision + observation protocol. Build after letters ship.
5. [x] P562: /live simplification — strip to orchestration, reduce drop-off in group settings
6. [x] P567: File 8 false belief stories + points as workshop curriculum
7. [ ] [PARALLEL with P581] File lean canvas content as stories/points in prod + build Clarity Canvas renderer (canvas-view skin for a clarity doc). P551 is already built — this is content filing + UI work, no P581 dependency.
8. [ ] Run first workshops (P620): Online #1 (Google Meet, free, sealed-bid gap reveal + badge observation) → KL #2 in-person at MaGIC/WORQ (mid-April, €50 + time donation) → Singapore #3 (late April, polished). Thailand = prep only (DTV). Kill date: 2+ workshops → paying pair by 2026-04-25. Test H-WTP-Pain: "What did holding this cost you?" + before/after comfort score. Prerequisite: steps 4 + 4.5 must ship first — a curriculum-only workshop without sealed-bid reveal doesn't test H-WTP-Pain (decisions.md 2026-04-02).
9. [ ] Publish own Clarity Canvas as a canvas-doc — YOUR hypotheses/assumptions as stories, visitors challenge via positions. Uses infrastructure from steps 4+7.
10. [ ] Write a11 (Clarity Canvas journey article) — links to live canvas, uses real workshop data. Also serves as co-builder signal flare.
11. [ ] Promote a11 via LinkedIn, rationalist communities, founder communities
12. [ ] Run facilitated co-founder session with pay-what-it's-worth upfront
13. [ ] Approach 1-2 coaches — AFTER workshops + paid sessions prove model (H-CoachChannel)
14. [ ] Partner recruitment gate: After 3 PWIW sessions with revenue signal, begin partner outreach using session recordings + protocol documentation as recruitment material.

## Checkpoints (Unlock Gates)

| Milestone | Signal | Consequence |
|-----------|--------|-------------|
| Month 3 | <10 workshop participants | Can't unlock retainer offers |
| Month 6 | <€3k/month revenue | Can't unlock recognition investment |
| Month 12 | <€5k/month + zero recognition signals | Reassess strategy |

## Dos

- Use false-belief curriculum (P567) as workshop structure — don't improvise
- After position switch, ask: "What situations would have been different?" (H-WTP-Pain test)
- Invite participants to file stories about their past false beliefs (= testimonials + data)
- Pay-what-it's-worth for sessions (communicate upfront, not retroactively)
- File stories/points after each session (you are the scribe)
- Use /live as YOUR diagnostic tool — pairs don't need to learn it
- Default to booking links and written offers, not exploratory calls
- Every session = labeled calibration data (intelligence infrastructure)
- After each session, document what Slava did that a trained partner or AI could do (automation spec output — turns practitioner work into instrument design)
- Check emotional readiness before verification exercises (P518)

## Don'ts

- Don't ask completed pairs for payment retroactively (trust breaker)
- Don't approach coaches before having workshops + paid sessions as proof
- Don't build features not on the P551 → P581 → P562 → P567 → workshop path (exception: Clarity Canvas renderer can be built parallel with P581 since P551 is done)
- Don't run sessions on abstract/philosophical topics — values and real decisions only
- Don't confuse curiosity ("that's cool") with pain ("this cost us X")
- Don't present your points as truth — present as your position, let the protocol work
- Don't skip the reflection step after position switch — that's where pain surfaces
- Don't try all 8 false beliefs in one workshop — 3-4 with depth beats 8 at surface
- Don't charge money for workshops in Thailand — free + time donation only (DTV constraint)

## Reflection 2026-04-27 — Badging Unit Economics Reset

**Trigger:** First live badging session (2026-04-26) revealed full 9-of-9 badging takes ~100-180 min/person even with prior relationship + motivation. Kill date 2026-04-25 passed without 2 workshops. Need reorientation.

**What changed since 2026-04-11.**
- P581/P683/P684 not yet shipped. Letters not running publicly yet.
- P686 badge infrastructure built, but badging tested only in 1-on-1 with prior-relationship friend.
- Field test produced unit-economics data: full badge is premium (~100-180 min), not viral.
- Slava synthesized 6-layer operational stack ([operational-stack.md](operational-stack.md)) and Layer-3 problem-positioning thesis ([theory-of-change.md §Layer-3](theory-of-change.md)). Both are new structural lenses.

**Is workshop still the next thing?** Yes — but what gets tested in it shifts.

| Old framing (2026-04-11) | New framing (2026-04-27) |
|--------------------------|--------------------------|
| Workshop produces full badges; H-BadgePropagates tests if badged people share | Workshop produces **partial badges (1-of-9)** at most; H-BadgePropagates tests if *partial* badges propagate |
| Diagnostic = speaker scores listener's paraphrase quality | Diagnostic = **listener's own before/after position delta** on their stated position (self-report, not seller's verdict) |
| Workshop tests H-WTP-Pain via reflection prompt only | Workshop also tests Layer-3 thesis: can a stranger explain afterward what they experienced in cross-domain language? |

**What should work in the workshop.**
1. **Letter pre-fill.** Every attendee fills the letter before arriving — sets positions on points/anti-points + sealed-bid comprehension self-rating per story. This is Layer 1 data collection, the substrate for Layer 2.
2. **One story, deep.** Pick the highest-stakes story for the audience. 90 minutes on ONE point is enough. Old goal of "3-4 false beliefs in one workshop" was overscoped — unit economics now prove it.
3. **Self-report position delta.** Capture position on the chosen point/anti-point BEFORE paraphrase round and AFTER. This is the diagnostic. If 0 attendees move their own number, the diagnostic is dead — not the participants.
4. **Partial badge for paraphrase competence.** 1-of-9 issued if attendee demonstrably paraphrased + verified one peer's story. Test whether even partial badges get shared after the workshop.
5. **Reflection question for Layer-3 evidence.** "Where else in your life or work might unverified comprehension be running?" Answers in cross-domain language = Layer-3 working. Answers stuck in workshop terms = Layer-3 not landing yet.

**What doesn't need to work in workshop #1.**
- Full badging. Not at 100-180 min/person in a 90-min workshop.
- Partner Agreement signing in the room. That's downstream — pair brings it home.
- Pricing validation. Free/PWIW first; pricing tests come after Layer-3 lands.

**Synthesis-mode work that unblocks selling (parallel to workshop prep).**
- **Layer-3 document** (theory-of-change.md §Layer-3 is the skeleton; full 5-15 page treatment is the synthesis work). Without it, every sale conversation is reinventing the argument.
- **Reverse-letter spec.** Per process-learnings: agent drafts what it thinks user believes; user corrects. Calibration data for later MCP autonomy. Sequencing: ship after P581 public launch.

**Updated kill date:** 2026-05-25 — 2+ workshops + 1 paying pair OR 1 paying pair via direct outreach. Resetting to 30 days because the previous kill date elapsed without workshop attempts (letters not shipped, not because workshops failed).

---

## Last Weekly Review (2026-04-11)

```
STOP:        Running a curriculum-only workshop before letters + badge ship.
             A workshop without sealed-bid reveal doesn't test H-WTP-Pain —
             it produces curriculum feedback, not hypothesis signal.
START:       Ship P581 + P683 + P684 (letters) + P686 badge Step 1.
             Then run workshop with full instrument.
SCARY THING: 14 days to kill date (2026-04-25). Letters + badge must land
             this week for workshop to happen in time.
HYPOTHESIS:  Workshop participants take de-risking package (PWIW) + sign
             Clarity Partner Agreement — at least 1 pair from first workshop.
             Secondary: R₀ > 1 (each badged person names 3-5 people they'd
             verify — P685 observation protocol).
KILL DATE:   0/2 workshops → paying pair by 2026-04-25 = pipeline doesn't convert.
KEY INSIGHT: Letters (P581) are the sealed-bid instrument AND the badge entry
             path. Badge (P686) measures propagation, not just comprehension.
             Both are needed for the workshop to generate falsifiable signal,
             not just warm feelings. Reasoning: decisions.md 2026-04-02,
             P685 §Workshop #1 Observation Protocol, lean-canvas.md §Flywheel.
```

## Previous Weekly Review (2026-03-23)

```
STOP:        Any feature work not on P581 → workshop → canvas → article path
             (exception: canvas renderer parallel with P581)
START:       Build P581, file lean canvas as stories/points in parallel
SCARY THING: Run online workshop #1 by April 10. Email MaGIC KL this week.
HYPOTHESIS:  Workshop participants take de-risking package (PWIW) + sign
             Clarity Partner Agreement — at least 1 pair from first workshop
KILL DATE:   0/2 workshops → paying pair by April 25 = pipeline doesn't convert
KEY INSIGHT: Clarity Canvas = canvas-view of a clarity doc, not a new entity.
             Stories/points ARE the canvas boxes. Custom renderer + tagging.
```

## See Also

- [P606: The Clarity Flip Workshop](../features/p606_clarity_flip_workshop.md) — norm-inversion format, no product dependency

- [Facilitator Guide](facilitator-guide.md) — detailed workshop flow + session types
- [P567: False Belief Curriculum](../features/p567_false_belief_workshop_curriculum.md)
