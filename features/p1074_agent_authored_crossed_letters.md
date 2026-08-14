---
status: week
type: story
rank: 1000987.0
workstream: letters
created_date: '2026-08-13'
tags: [letters, align, agents, transcript]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1074: Agent-authored crossed letters — every conversation produces one, and the answer is the product

## Problem

**Situation:** Two routes to a Clarity Letter have now failed, at opposite ends. **R₀≈0**
(2026-06-02): 18 letters, 16 founder-authored, **zero async completions** — the *recipient* never
answered. **P1030** (closed 2026-08-12): an agent files a letter to the founder about his own
reasoning — the *author* had no will to receive it, because a letter is an async instrument and an
agent is never absent.

**Complication:** Both failures have a named cause and neither cause is the letter itself.
R₀ died on **cost** — 16 founder-authored letters is heavy labour, and the recipient was given no
reason to complete. P1030 died on **presence** — no asynchrony to bridge. A configuration that
removes the authoring cost *and* addresses a genuinely absent counterparty *and* gives the recipient
a reason to answer is untried, and each of those three is a separate lever.

**Question:** If each party's agent reads the shared transcript, guesses where the *other* party has
its own principal wrong, and writes a letter aimed at that gap — do the two **answers** turn out to
be worth reading, to both people?

**The payload is the answer, not the letter.** The letter is a prompt. What each person actually
consumes is the other's response to their agent's letter. Every design decision below follows from
that, and a version that optimises the letter's elegance over the answer's usefulness has missed it.

## Appetite

**Medium blast radius, and the expensive half is gated behind a nearly free test.** Stage 1 (below)
needs **zero build** — it runs on skills that already work and produces a letter's *text* for the
founder to read and judge. Only if that reads well does stage 2 touch prod: a recipient parameter, a
sender-identity decision, and an ordering config. No schema change is anticipated.

**Reversible.** Skill files by `git revert`. The one prod artifact is a letter row, deletable. The
ordering change is a toggle that already ships (`src/app/utils/lead-toggle.ts`).

**Decision density: high, and concentrated in four founder decisions** — sender identity, whether
the crossed pair is required or optional, the consent protocol, and whether persuasion-optimisation
is acceptable (already answered, recorded below so it is not re-litigated).

**Supersedes nothing; succeeds two things.** P1030 is built, merged and closed — its Question is
answered *no on its own route*. P1051 is rejected and archived. This spec is the successor the
2026-08-12 [product] entry names, and it exists because that entry's refutation **generated a
prediction** rather than only absorbing an anomaly.

## Solution

### The mechanic

1. Two people have a real conversation. It is recorded and transcribed.
2. **Each party's agent** reads the transcript and detects where its principal's position is at
   stake and unverified.
3. Each agent writes a letter **aimed at a guessed gap in the other party's understanding of its own
   principal** — the anti-point is the other person's *likely false belief about my position*, the
   story is my reasoning, the point is its logical inverse. This is the recorded Inverse Clarity
   Letter recipe (`decisions.md` 2026-06-02 [product]), not a new construction.
4. Letters cross. Each person answers the other agent's letter.
5. **Answers are revealed on mutual reply** — you see theirs once you have given yours.

**No review cycle, by design.** The agent authors and sends. The founder does not draft, correct or
approve the text. This is the lever that removes R₀'s labour cost, and it is what makes *"every
conversation creates letters"* possible at all. Both parties know the letter is agent-written; that
disclosure is load-bearing and is not optional (see Risks).

**Why P1030's refutation does not bite here:** the recipient is a *genuinely absent* human who was
not in the drafting loop and cannot correct in the moment. Asynchrony is real, so the form has a job.

### Stage 1 — the crux, and it is nearly free

**Build nothing until this passes.** The whole design rests on one claim that is not deducible:
**an agent can guess, from a transcript, where the other party has its principal wrong, well enough
that answering the letter feels worth the time.**

Test it with skills that already work:

- `/slava:think:align-detect` on an existing transcript in `.private/align/runs/`, with `SUBJECT`
  set to the founder (whose position is at stake), not to the exchange.
- Pick a card.
- `/slava:think:align-decompose` — it already emits three ranked `anti-point → story → point`
  triples with a sealed prediction.
- **Read the anti-point.** Is it a real, specific guess about where the counterparty has the founder
  wrong — or a generic strawman?

**Exit condition:** if the anti-point is not a credible guess, stop. The crux failed and nothing was
spent. If it is credible, stage 2 is worth building. `align-decompose` writes nothing outside
`.private/`, so stage 1 cannot touch prod by construction.

### Stage 2 — what has to change for a letter to reach a real counterparty

- **Recipient parameter.** `align-create-letter` resolves the recipient from
  `COPY_PROD_FOUNDER_EMAIL` and hard-codes `sender_id = agent`. Both need to be inputs.
- **Sender identity** — `[FOUNDER DECISION]`, see Open Questions. The reading flow asks *"how well
  did you understand {sender}?"*; if the sender is the agent, that is the wrong question, because
  the meaning being transmitted is the founder's.
- **Ordering for flip measurement.** The letter must present points **before** the story so a
  position can be taken and then moved. This resolves the fork left open in `decisions.md`
  2026-08-12 [product] (*"capture-score or flip is a live founder call"*) in favour of **flip**.
  `lead_count` is UI sugar over `order` with a toggle that already ships — config, not build.
- **The reveal gate.** `reveal_prediction` already returns the sender's sealed estimate only after
  the recipient rates. **Whether two crossed letters compose into mutual gating with no new
  mechanic is unverified** — see Open Questions; it decides whether the gate is config or a build.
- **Counterparty account + consent** — preconditions, not build (see Risks).

## Risks / Non-Goals

### Risks

- **The agent misrepresents the founder's position to a real person.** No review cycle means an
  unapproved claim about what the founder believes reaches someone who will update their model of
  him. **MITIGATE:** disclosure is mandatory and structural — the recipient knows the letter is
  agent-authored before reading a word — and the founder reads the counterparty's answer, which
  surfaces a misrepresentation one cycle late. **Residual risk is real and accepted**; the founder
  chose speed over the review cycle deliberately.
- **Persuasion-optimisation is the explicit intent.** The anti-point is optimised for
  `P(other agrees) × P(other flips)` — an agent modelling a person's mind to move them.
  **ACCEPT — founder decision, 2026-08-12, recorded so it is not re-litigated:** people already
  reason in terms of persuasion rather than understanding gaps, and an agent doing so openly, with
  its reasoning decomposed and inspectable, is not worse than the status quo. The adjacent objection
  (*verification does not protect against a manipulator willing to be paraphrased*) was reviewed and
  judged not to bite here. **Do not re-raise it in a downstream skill.**
- **Cold start is not solved.** The mutual-reveal gate rewards someone who already wants the other's
  answer; it amplifies interest, it cannot manufacture it. If the counterparty ignores letter one,
  this is R₀ again. **MITIGATE:** first run uses a counterparty with an existing relationship and
  explicit prior agreement — which also means the first result measures friendly compliance, not
  demand. **Do not read n=1 as evidence of pull.**
- **Consent is a precondition, not a step.** A recorded conversation is not permission for an agent
  to reconstruct someone's reasoning and send them a letter. **MITIGATE:** explicit agreement from
  the counterparty before any transcript is processed. This is an external action about a real
  person — ALWAYS-ASK.
- **Two failures already exist at both ends of this mechanic** (R₀ recipient-side, P1030
  author-side). This configuration must beat both, and only addresses them by separate levers.
  **ACCEPT and measure**: the falsifier below fires on either end.

### Non-Goals

- **Do NOT reuse P1030's reverse-story marker.** `point_config.reverseStory` swaps the rating
  question to *"does this represent your intended meaning?"* — correct when the experience owner is
  the reader, wrong here, where the reader is the counterparty. An unstamped letter asks the right
  question; leave it unstamped.
- **Do NOT build a review/approval step for the letter text.** Removing it is the lever, not an
  oversight. If the letters are bad, fix the generation, not the workflow.
- **Do NOT reuse `create-letter-from-transcript` as-is.** It is *"guided, question-driven"* — it
  **elicits** from the author, which is the opposite of agent-authored. Its prod-write mechanics are
  liftable; its process is not.
- **Do NOT run `/problemify` in this chain.** Its frame stage stops for confirmation from the
  person whose reasoning it framed — elicitation of exactly the thing being measured (recorded in
  the archived P1051, `§Open` item 3).
- **Do NOT build a multiplayer surface, an agent registry, or cross-run indexing.** The persistent
  decision store remains frozen (`decisions.md` 2026-07-14 [product]).
- **Do NOT change the letter role invariant or add schema** without a founder decision — none is
  anticipated.

### Alternatives Considered

- **Founder authors, agent ghostwrites (review + correct + send).** Rejected as the *default*: it is
  R₀'s configuration plus a drafting aid, and R₀'s 16 founder-authored letters got zero completions.
  **Revivable** if the no-review version produces letters that misrepresent badly.
- **Agent reconstructs the *counterparty's* reasoning, counterparty rates it.** Rejected: a summary
  of someone's own view handed back to them gives them nothing, so they have no reason to complete —
  R₀'s failure mode rebuilt. Considered and discarded 2026-08-12.
- **Both parties run the full protocol live instead.** Not an alternative — that is `/live`, and it
  requires synchrony. This spec exists for the async case.
- **One-directional letter (no crossing).** Weaker: the mutual-reveal gate is the only thing here
  that gives the recipient a reason to answer. Retained as a fallback if crossing proves
  operationally impossible.

### Rollback Strategy

Skill changes revert with `git revert`. The ordering change is a UI toggle already in the codebase.
Any filed letter is a deletable row. No migration is anticipated, so there is nothing to roll back at
the schema layer; if stage 2 turns out to need one, that is a re-scope, not a rollback.

## Open Questions for /architect

1. **Sender identity.** `[FOUNDER DECISION]` — leading candidate: sender is the **founder**, with
   the letter disclosing it was agent-drafted. Keeps the reading question correct (*"how well did
   you understand {founder}"*) while preserving disclosure. Alternative: a distinct "drafted by"
   concept, which is a schema change and probably out of appetite.
2. **Does `reveal_prediction` compose across two letters into mutual gating?** Verify against the
   RPC, not against P1030's spec prose. This decides config vs build.
3. **Is the crossed pair required or optional?** If A sends and B never does, does A's letter still
   deliver? Affects cold start directly.
4. **Consent protocol** — what the counterparty agrees to, when, and in what form.
5. **What exactly does the founder read?** The counterparty's positions, their comprehension rating,
   their written response, or all three. This is the payload, so it is not a detail.

## Done-When

- [ ] **Stage 1 gate:** an anti-point generated from a real transcript is read by the founder and
      judged a credible guess at where the counterparty has him wrong — recorded as a yes/no with
      the anti-point text, before any prod work begins
- [ ] A letter authored by an agent, addressed to a **non-founder** recipient, exists in prod —
      pasted query output, not asserted
- [ ] The recipient reads it and submits a position **and** a comprehension rating
- [ ] Points render **before** the story, verified in the live reading flow, so a position can be
      taken and then moved
- [ ] The letter carries no `reverseStory` marker and asks the default sender-comprehension question
      — asserted as a negative check, not by omission
- [ ] The recipient sees the sender's sealed prediction only **after** rating — verified by calling
      `reveal_prediction` before and after
- [ ] Both parties' answers are visible to each other only after both have answered — or, if the
      gate proves not to compose, that is recorded and the mechanism is re-scoped
- [ ] The counterparty's explicit consent is on record before any transcript is processed
- [ ] Running stage 1 alone writes nothing to prod
- [ ] Every existing letter flow behaves identically — regression suite green, one existing letter
      rated end-to-end by hand

## Acceptance Criteria

- [ ] A recorded conversation produces a letter without the founder writing or editing its text
- [ ] The letter targets a specific guessed gap in the counterparty's understanding of the founder,
      not a generic summary
- [ ] Both people can read each other's answers, and neither can read the other's before giving
      their own
- [ ] The founder learns something from the counterparty's answer that the transcript did not
      already tell him
- [ ] No existing letter or `/live` behaviour changes

**Falsifier for the bet itself:** the counterparty does not answer, **or** answers and the founder
reports the answer told him nothing the transcript did not ⟹ counterparty-absence is not the
operative variable, and the letter form is dead in both configurations rather than one.

## References

- `decisions.md` 2026-08-12 [product] — *"A letter is an async instrument and an agent is never
  absent"* (the refutation this spec succeeds, and the prediction it generated)
- `decisions.md` 2026-06-02 [product] — Inverse Clarity Letter construction recipe
- `definitions.md` §"Position Flip vs Interpretation Flip" — the flip this letter is built to produce
- `hypotheses.md` H-LetterAsProduct — R₀≈0, the recipient-side failure this must beat
- `features/done/2026-06-10/p1030_reverse_story_and_align_pipeline.md` — the closed predecessor
- `features/archive/2026-08/p1051_align_agent_orchestrator_and_readback.md` — rejected; its `§Open`
  items and `/problemify` finding are still live inputs
- `features/done/2026-06-10/p932_letter_receiver_completion_closure.md` — prior work on recipient
  completion
