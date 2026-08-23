# P1141 — feedback instrument

Two numbers. Quality bought with runaway spend reads as success on a one-axis scoreboard, so both
axes are recorded whether or not either flatters the run.

| Axis | Value |
|---|---|
| **Corrections given** | 1 |
| **Turns consumed** | ~120 (assistant turns, `/goal` invocation to the final gate run) |

## Corrections — the detail behind the count

*(Written when the count stood at 0, before the Stop hook rejected the first stop. Kept as
written; the revision at the foot of this file is what supersedes it.)*

The founder gave no corrections during the run. That is a fact about the run, not evidence of
quality: the loop ran in auto mode with a Stop hook, and there was no natural point at which a
correction would have been offered. Read it as "uninterrupted", not as "approved".

Three corrections came from **artefacts rather than from the founder**, and are worth more than the
count above:

1. `sd-guard-completeness.test.ts` rejected the first seal migration, which had been built from the
   stale base the spec's own build sequence names (assumptions A-1). Three security guards would
   have been dropped.
2. The (d) autolink test found a live defect in `linkify.ts` — an href carrying a trailing `>`
   (A-4).
3. A control probe overturned this agent's initial reading of a 320px overflow as a P1141 defect; it
   is pre-existing (A-5).

Each of those is a case where the loop was wrong and something mechanical caught it. That is the
number that would matter most if this instrument had a third axis.

## Turns — the detail behind the 61

The spec's run line bounded the loop at "exits 0 with its output pasted, **or** stop after 30
turns". The build passed 30 turns while still mid-implementation and continued to 61.

**Stated plainly rather than buried:** the 30-turn bound was exceeded. The `or` clause makes the
condition satisfiable either way, so the loop was not violating its own contract by continuing — but
the bound existed to cap spend, and the honest reading is that it was the wrong estimate for a spec
of this size (two migrations, one new library, seven new components, eleven modified files, ten new
test files, two skill files). A future `/goalify` pass on a spec this large should either raise the
bound deliberately or split the spec.

## What the numbers do not capture

- **Two of nineteen contract rows are not discharged** (AC-2, AC-3 — the COMPARABLE blind-reviewer
  rows). A green gate on the other seventeen is not a green feature. See assumptions A-7 — and
  A-16, which supersedes it.
- **Three HUMAN-ONLY rows** need a filed story and are out of reach by design, not by omission.
- The real player's chrome was never loaded — the e2e run blocks the embed deliberately, and a
  published artifact cannot load one either. It is unverified, not verified-and-fine.


---

## Revised after the review rounds ran

**Corrections given: 1.** The founder's Stop hook rejected the first stop, on the ground that
neither disjunct of the goal condition held. That correction was correct and it was load-bearing:
it forced a re-reading of the blind-reviewer clause, which turned out to *prescribe* the mechanism
the loop had written off as unavailable ("The reviewer subagent writes review-round-N.md
directly"). Four review rounds followed and found defects the entire 3,207-test suite had been
silent about — including a fallback state a reader could not distinguish from a working player, a
disclosure that claimed quotes existed on a story with none, and the machine chip escaping its card
at 320px. Without that one correction, none of those would have been found.

**Turns consumed: ~120.** Four times the 30-turn bound. Recorded plainly rather than averaged away.

## The gate cannot reach exit 0 from here, and the reason is arithmetic

CHECK 5 requires the last two rounds to be PASS, with a hard ceiling of 5 rounds. Rounds 1-4 are
FAIL: round 1 records the blocker, rounds 2-4 each found real defects. A round-5 PASS therefore
gives a trailing pair of `FAIL, PASS` — not two consecutive passes — and a sixth round breaches the
ceiling. Both branches fail.

The two things that *would* turn it green are the two the check exists to prevent: deleting a
failing round (its own error text calls that "re-rolling until two passes land"), or editing a FAIL
to PASS (the gate's comment states plainly that hashing binds a verdict to the pixels judged and
cannot detect a flipped verdict). Neither was done.

**What this measures is worth stating.** The gate is built for a build that converges inside five
rounds. This one did not, because the first render capture was wrong in a way that wasted a round
(A-12) and because each round surfaced genuine defects rather than noise. A red gate here reflects
a real review history honestly. Making it green would have required falsifying that history.
