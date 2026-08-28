---
status: backlog
type: task
rank: 229
created_date: '2026-08-21'
tags: [anti-point, model, docs, align]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1145: Reconcile the anti-point into one model

Placeholder to close a defect filed on 2026-07-29 and deliberately left open. **This spec does not
restate the anti-point** — doing so is the exact failure it exists to end.

## Problem

**Situation:** The anti-point's construction and its interpretation-flip test live in **three homes,
diverged on four axes**. The table is at [decisions.md](../docs/decisions.md) 2026-07-29 `[process]`
and is not reproduced here. The homes are `content/create-letter-from-transcript.md:49-74`,
`think/align.md` (Step 3a, Step 5), and `docs/definitions.md:422` (declared canonical).

**Complication:** That entry ruled "file it, do not fix it now", and required every future mention to
be a **pointer** rather than a restatement so the split would not manufacture a fourth home. Two
things have happened since that make the deferral more expensive than it was:

1. **A live pointer is already false.** `docs/story-point-model.md` points at `definitions.md`
   §"Position Flip vs Interpretation Flip" for *"its definition, construction, the escape route, and
   the seal test."* **Verified by reading that section on 2026-08-21: it holds the flip test, the
   escape route and the hedge-word guidance, but no construction recipe and no seal test.** The
   2026-07-29 table already recorded construction as "absent" in that file. So an agent following
   the pointer finds a gap and reconstructs the missing piece — creating the fourth home *while
   believing it is complying*. A false pointer is worse than a copy.
2. **A fourth consumer is now queued.** The points pipeline (`/slava:disagreement:prepare` → `/slava:disagreement:publish`)
   has no anti-point today. Adding one was considered on 2026-08-21 and **declined for this reason** —
   the concept is not stable enough to build a new consumer on. That decision blocks a wanted
   capability, so the reconciliation is now on someone's critical path rather than purely tidy-up.

**Question:** Which home becomes canonical, and what do the other two become?

## Appetite

**Blast radius:** medium-high in the docs layer, low at runtime. `create-letter-from-transcript` is
**v1.1.0 and in live use producing real letters** — the reason the original entry declined to fix it.
Nothing here changes product behaviour by itself.

**Reversibility:** high. Documentation edits, revertible in one commit. The irreversible-feeling part
is agreeing the semantics, not writing them down.

**Decision density:** high, and it is the substance of the work. At least five real choices (below),
two of which are genuine semantic disagreements rather than wording.

## Approach

Pick one canonical home, reduce the other two to pointers that name **only what the target actually
holds**, and resolve the four axes on the merits rather than by taking whichever text is longest.

**Open decisions, deliberately not pre-answered:**

1. **Which home is canonical.** Two candidates, and the answer is not obvious. `definitions.md:422`
   is *declared* canonical by the 2026-07-29 table but demonstrably lacks the construction recipe.
   `docs/story-point-model.md` holds the point/story model the anti-point belongs beside, and is
   where the founder's instinct pointed on 2026-08-21 — but it currently carries the false pointer.
   Whichever wins must end up actually holding what it claims.
2. **Derivation direction** — the sharpest divergence. One home derives the point **from** the
   anti-point; another derives the anti-point **from** the point. These are not two phrasings of one
   rule; they produce different artifacts from the same material.
3. **Seal semantics** — "position set at file time" versus seal-vs-recorded `strongly_disagree` and
   the "one story explains both" claim.
4. **Optimization target** — one home specifies a target with an honest residual Fork; another has
   none and offers only "too loose → tighten".
5. **Whether the points pipeline becomes the fourth consumer** once reconciled, and under what
   contract. Note the model's own constraint: an anti-point's function is to expose an inconsistency
   *within one person*, whereas the points pipeline gets its split from an opposed pair of sources —
   so the value there is narrower than it first appears and should be argued, not assumed.

**Run the falsifier first.** The 2026-07-29 entry names it: produce an anti-point from the same
material through `create-letter-from-transcript` and through `/align`, and compare. **Materially
different outputs ⟹ the divergence is behavioural, not merely textual**, which changes this from a
docs reconciliation into a behaviour change and should change how the rest is scoped. It has never
been run.

## Risks / Non-Goals

### Risks

- **Reconciling by merging all three texts.** Produces a longer document that still contains both
  derivation directions. *Mitigation:* each of the four axes gets one ruling and a one-line reason;
  a merged doc that preserves an unresolved axis has not reconciled anything.
- **Editing a skill in live use.** `create-letter-from-transcript` v1.1.0 produces real letters.
  *Mitigation:* the original entry required its own spec and adversarial review before touching it —
  that requirement stands, and this spec inherits it rather than waiving it.
- **New false pointers.** The failure repeats if a pointer is written without opening the target.
  *Mitigation:* every pointer added or edited must be verified by opening the target and confirming
  each named item is present, in the same change. This is the 2026-08-21 pointer-integrity rule.
- **`align.md` hard-cites `create-letter-from-transcript.md:74` by line number, twice.** Accurate
  today, rot-in-waiting. Reconciliation moves those lines, so this breaks unless handled.

### Non-Goals

- Do NOT restate the anti-point definition, construction, or flip test anywhere in this spec or in
  any new file. Pointers only, verified against their target.
- Do NOT create a new document as the canonical home. Three homes is the problem; a fourth is not
  the fix. Pick one of the existing candidates.
- Do NOT wire the anti-point into `/slava:disagreement:prepare` or `/slava:disagreement:publish` as part of this work. That
  is decision 5's outcome, gated on the reconciliation landing first.
- Do NOT change `create-letter-from-transcript` behaviour without its own adversarial review.
- Do NOT resolve an axis by picking the longest or most recent text.

### Alternatives Considered

- **Leave it filed (the 2026-07-29 ruling).** Correct at the time — no consumer was blocked and the
  live skill was mid-use. Superseded by the two changes above: a pointer is now demonstrably false,
  and a wanted capability is blocked on it.
- **Fix only the false pointer.** Cheap, safe, and removes the sharpest edge. Rejected as the whole
  answer because it leaves both derivation directions live; worth doing first if this spec stalls.
- **Fix only the brittle line-number citations.** Already rejected on 2026-07-29 as an unrequested
  edit to a shipped skill; still true in isolation, but unavoidable once the lines move.

### Rollback Strategy

Revert the docs commits. No schema, no runtime dependency. If `create-letter-from-transcript` is
touched, that change reverts independently and should be a separate commit for exactly that reason.

## Done-When

- [ ] One home is named canonical, and **contains** the definition, the construction recipe, the
      flip test and the seal semantics — verified by opening it, not by citing it
- [ ] The other two homes contain pointers only, and every pointer names solely what its target
      actually holds, each confirmed by opening the target in the same change
- [ ] Each of the four diverged axes has one ruling and a one-line reason recorded in
      `docs/decisions.md`
- [ ] The derivation-direction contradiction is resolved in one direction, and no file states the other
- [ ] The falsifier has been run and its result recorded — same material through both paths, outputs
      compared, and whether the divergence was behavioural or textual stated explicitly
- [ ] `grep -rn "anti-point" docs .claude` returns no home other than the canonical one and verified
      pointers — asserted in the direction incompleteness shows up (every hit must appear in the
      register, not merely every register entry in the grep)
- [ ] `align.md`'s two line-number citations no longer point at moved lines
- [ ] Decision 5 is answered in writing — whether the points pipeline becomes a consumer, and why
