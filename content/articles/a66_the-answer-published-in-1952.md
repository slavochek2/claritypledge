---
status: idea
title: "The Answer Was Published in 1952 — Why the Open Problem Is Adoption, Not Invention"
rank: 1
tags:
  - prior-art
  - norms
  - epistemics
  - research-agenda
created_at: 2026-08-11T00:00:00.000Z
source_conversation: 2026-08-11 Pluralistic ignorance and help-seeking norms
---

# The Answer Was Published in 1952

> Working title — `[FOUNDER DECISION: title]`. Alternatives: "Seventy-Four Years of a Solution Nobody Adopted" · "The Problem Is Documented. The Cure Is Documented. Neither Is the Open Question."

## Arc

**ARC-7 (The Solution That Was Already Published)** — a problem presented as unsolved → the solution turns out to have been published decades ago → it never spread → the open problem relocates from *invention* to *adoption* → the adoption blocker is named and made testable.

**Why this is publishable rather than an admission of defeat:** the author gives up a discovery claim and gets a sharper, more defensible one in exchange. Same costly-signal move as a63 and a65.

## The correction that produces the article

The working assumption, stated across the project's own docs for months, is that verification-of-comprehension has no voluntary instrument — that the practices which work (teach-back in medicine, read-back in aviation, surgical time-outs, structured handoffs) all require an institution with authority to *mandate* them.

Then the prior-art check returns Rogers & Roethlisberger, **"Barriers and Gateways to Communication," *Harvard Business Review*, 1952**:

> Before speaking, each person must first restate the previous speaker's ideas and feelings accurately, and to that speaker's satisfaction.

They also noted it sounds trivially simple and is one of the hardest things you will ever attempt, and claimed it lowers defensiveness and produces mutual communication over time.

That is the mechanic. In *HBR*. Seventy-four years ago. Not obscure — it has been assigned reading in the project's own event series since June.

**So the honest claim is not "no solution exists."** It is:

> A known, cheap, effective move has failed to become a norm for seven decades, and nobody has systematically tried to fix the *adoption* problem.

## Why this reframe is worth more than the claim it replaces

The discovery claim ("nobody built this") is a universal negative — unprovable, and one citation kills it. The adoption claim is:

1. **True on the face of it** — you can verify in one afternoon that paraphrase-before-proceeding is not standard practice in any ordinary meeting.
2. **Falsifiable in the right direction** — someone must produce a population where the voluntary version *did* become normal.
3. **A different research question**, with almost nobody in it. Every existing intervention either mandates the behavior (institutions) or teaches the skill (training). The question of why a skill that everyone can already perform does not get performed is the one left open.

## The candidate blocker — and this part is the author's, not Rogers's

Standard explanations for why good practices don't spread: too costly, too slow, no incentive. The project's own hypothesis file already runs a two-way fork on this (`docs/hypotheses.md` H-LegibilityVsCost): **legibility-binding** (people can't see the failure) versus **cost-binding** (they see it and the cure is too expensive).

The conversation produced a third branch, and it is the one that fits Rogers's seventy-four years best:

> People don't adopt it because they assume nobody else will reciprocate — and going first alone looks slow.

That is **pluralistic ignorance**, and it has a canonical result behind it. Miller & McFarland (1987): participants were handed a deliberately incomprehensible text, given a real opportunity to ask for help, and then asked to estimate how many *others* would ask. They badly overestimated everyone else's willingness to stay silent — each person concluded they were the only one who didn't get it.

The two halves fit together exactly:

- Rogers supplies a working move that nobody runs.
- Miller & McFarland supply a reason that predicts precisely this: the move requires being the first to admit non-comprehension, and everyone privately believes they'd be alone in doing it.

**Neither author drew the connection**, because they were answering different questions in different decades. Drawing it is the article.

## The test, and it costs one question

The cheapest experiment in the whole project falls out of this:

1. Before the exercise, privately: *"Out of 10 people you work with, how many would say 'I don't follow' if they didn't understand something?"*
2. Run the exercise. Count who actually admits a gap.
3. Show the room both numbers.

They predicted 3. The room did 8. Everyone in that room has been assuming worse of everyone else, and the numbers are their own.

**The methodological point that makes this a real test rather than a survey:** the *predicted* side is a questionnaire item; the *actual* side is behavior, and behavior has to be produced, not asked about. Self-report on both sides yields nothing — everyone says they'd admit it. Miller & McFarland ran behavior first and predictions after, for a reason worth stating in the piece: asking "how many others would admit confusion?" *tells people others might be confused too.* The question is itself the intervention. Ask it first and you have contaminated the thing you were about to measure.

## Guards — what this article must not claim

- **Do not claim the mechanic as a discovery.** This is the entire point of the piece. The project's standing rule already says so for Gottman-Rapoport and closed-loop readback (`docs/lean-canvas.md` §Current Alternatives — *"Cite both; never pitch paraphrase-before-proceeding as a discovery"*). Rogers 1952 is the third and oldest instance, and it strengthens the rule rather than embarrassing it.
- **Do not claim the misperception blocker is established.** It is a candidate explanation with one supporting classical result, in a 1987 classroom, in a population that is not this project's. Whether the gap exists in professional dyads is unmeasured.
- **Do not import "70% of sentinel events" as a startup statistic.** The only hard numbers on the cost of communication failure come from healthcare (Joint Commission sentinel-event reviews; ISMP intimidation surveys). Nothing comparable exists for startups or co-founders. The author's own company history is a *case*, not evidence — and it must not become a statistic in a pitch.
- **Do not say "the problem exists" needs proving.** People staying silent when they don't understand is *known*. What is unknown is the size of the misperception gap in this population, and whether it behaves the same when the counterpart is an AI.

## The AI half — genuinely unstudied

There is real evidence that people accept an LLM's first answer on hard tasks without further inquiry. Nobody has framed non-admission *toward a model* as a norm question. One honest caution to carry: a model is not a reference network. There is no audience, so the conditionality machinery that makes something a norm may not apply at all — which makes "does the face cost persist with no observer?" a more interesting question than the norm framing that produced it.

## The closing turn

The project spent months looking for the missing instrument. The instrument was in *HBR* in 1952, and the author had already assigned it as pre-reading without noticing what its survival implied.

What is actually missing is not a technique. It is the reason a technique this cheap loses to silence for seventy-four years — and the answer proposed here is that everyone is waiting for someone else to go first, in a room where going first costs almost nothing and everybody believes it costs a lot.

## Sources — and what is NOT verified

Cite: Rogers & Roethlisberger 1952 (*HBR*, "Barriers and Gateways to Communication") · Miller & McFarland 1987 · Prentice & Miller 1993 · Schroeder & Prentice 1998 · Joint Commission sentinel-event communication findings · Bicchieri (norm structure) · teach-back / read-back / TeamSTEPPS as the mandated-solution class.

**Unverified at filing — resolve before drafting:**

- **Nothing here was read in primary.** The Rogers quote and the Miller & McFarland design both come from a conversation, not from the papers. Read both before publishing — the standing lesson from `docs/decisions.md` 2026-08-03 is that a caveat is not a substitute for reading the source.
- **"Nobody has systematically tried to fix the adoption problem"** is a universal negative and the most attackable sentence in the piece. Bound it: name the fields searched (norms interventions, social-norms marketing, communication training, patient-safety implementation science) and say what was and was not found.
- **The healthcare percentages** are agent-reported and second-hand. Either source them to the primary review or drop the numbers and keep the qualitative claim.

## Relationship to other articles

- **a54** (sanitation, not eradication) — holds the H-LegibilityVsCost fork this article adds a third branch to. Cross-link; a54 owns the two-branch version, a66 owns the third branch and the 1952 datum.
- **a57** (a pledge is not a norm) — the Bicchieri machinery this article's blocker depends on. a57 owns the pledge critique; a66 owns the adoption-history argument.
- **a32 / a59** (the humiliation barrier · who pays the face cost) — own the *cost* of admitting a gap. a66 owns the *misperception of others' willingness* to pay it, which is a different variable.
- **a65** (three gaps, not eighteen) — same posture: give up an over-claim, keep the defensible remainder.
