---
status: week
type: story
rank: 32
workstream: letters
created_date: '2026-08-14'
tags: [letters, crux, align, agents]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1084: The crux letter — one neutral agent files the disagreement that actually matters, evidenced only by what each person said

**Successor to P1074** (archived 2026-08-14, `features/archive/2026-08/`). Read its `### REFUTED` section before this one — it holds the three defects this design exists to avoid, and the scope correction that says the letter itself was never the problem.

## Problem

**Situation:** P1074 filed one agent-authored reverse-story letter and the founder read it. The agent wrote his reasoning in first person, guessing at his motives. His reaction: *"somewhat offensive… it paraphrased in a way I wouldn't"*, and on the anti-point, *"I don't understand the context… I'm lost reading these things."*

**Complication:** Three defects, all from one cause — a story invented by an agent about a person's interiority. (1) No comprehension question is coherent: *"how well did you understand the sender"* asks about a machine with no intent; *"does this represent your meaning"* asks about a meaning belonging to someone absent. (2) A guessed story needs two validators — only its subject can confirm it is theirs — and the product has one rating slot. (3) The agent held the positions: `point_positions` was written with `user_id = the agent`, so the reader took a position against a machine's stance. **But the same run showed the letter itself is fine.** The founder's own repair: *"if the story is quoted and linked to a crux point… then we can actually set our positions and it would help us."*

**Question:** If one neutral agent finds the **single disagreement that is load-bearing for both people**, states it as a point they would answer at opposite ends, and evidences it with nothing but each person's own quoted words — do the two of them end up with clearer positions than the conversation left them with?

**The payload is the clarified position, not the letter.** A version that optimises for elegant prose over two people knowing exactly where they differ has missed it.

## Appetite

**Medium blast radius, and no schema change is anticipated.** A sealed letter is private, owner-held, and readable by its named recipient — **the delivery already is the two-person access mechanism**, so the ACL table considered and rejected during P1074's post-mortem is unnecessary. The work is agent-side: a new skill that produces a crux + two quote-bundles, reusing the existing filing mechanics.

**Reversible.** Skill files by `git revert`. Filed letters are deletable rows.

**Decision density: moderate**, concentrated in three founder decisions — whether this revives H-LetterAsProduct or is new work, what the incentive to answer is, and the consent protocol.

**Prerequisite that is not optional:** `docs/hypotheses.md` still carries the disproven completions figure. See Risks.

## Solution

### The mechanic

1. Two people have a real conversation. It is recorded and transcribed.
2. **One neutral agent** — not one per party — reads the transcript and finds the **crux**.
3. The crux is a **double crux** in the standard sense: a point whose resolution would move *both* parties' conclusions, in opposite directions. Its defining test is *"is there anything I could say that would move your position?"* The agent's prediction is that one answers **+3** and the other **−3**.
4. For each party, the agent files a **story built only from that person's verbatim quotes** — never mixed — plus its reasoning on how those quotes relate and why they evidence that position.
5. Each party receives a letter containing **the crux point first**, then **the other person's quote-story**.
6. Each rates how well they understand **that person's** position, then takes their own position on the crux.

**What the agent optimises for — three axes, all required:**
- **Load-bearing** — the crux sits on a genuinely high-stakes matter. This is why `align-detect` remains essential upstream; it already ranks by unguarded stake.
- **Evidence-grounded** — every claim traces to a quotable line, and the quotes are shown.
- **Polarisation-predicting** — the more genuinely opposed the two predicted positions, the better the agent did.

**Why each P1074 defect dissolves:** the comprehension question is answerable because a real person's real words carry the meaning; no guess needs a second validator because nothing is guessed about anyone's interiority; positions come from the two humans, never the agent.

### What carries over unchanged

`align-detect` (five candidates with verified quotes, ranked by unguarded stake — undisputed in the P1074 run), the point/anti-point construction discipline in `align-decompose`, and the prod-write mechanics in `align-create-letter`.

## Risks / Non-Goals

### Risks

- **There is no incentive to answer, and the predecessor had one.** P1074's crossing + mutual-reveal gate (*"you see theirs once you have given yours"*) was its only **designed** answer to the recipient-completion problem. This spec has none yet. **MITIGATE:** decide the incentive explicitly before the first send — reuse the reveal gate, or state what replaces it. **Do not assume a session invitation is easier to accept than a letter; that is untested.**
- **The crux may find only the disagreements they already know about.** Position disagreements self-surface — people voice them out loud, for free. The valuable crux is one where both currently believe they agree. **MITIGATE:** score each filed crux on whether either party reports being surprised by it; a crux nobody was surprised by is a cheap find.
- **The agent picks the wrong crux and it is unfalsifiable from inside.** Its own prediction (+3/−3) is the check. **MITIGATE:** seal the predicted pair before either party answers, and report predicted-vs-actual every run. A run without a sealed prediction produces no evidence about the agent.
- **The quotes can misrepresent by selection.** Real quotes, honestly attributed, can still be cherry-picked to manufacture a crux. **MITIGATE:** carry `align-detect`'s existing rule — where a party said something nearby that cuts against the quote, it appears too.
- **Consent is a precondition, not a step.** A recorded conversation is not permission to file a person's quotes into a letter to someone else. **MITIGATE:** explicit agreement from both parties before any transcript is processed. ALWAYS-ASK.
- **A hypothesis this depends on still carries a disproven number.** `docs/hypotheses.md` H-LetterAsProduct records *"0 async completions"*; prod shows 12 completions of 28 real external deliveries. Corrected in `decisions.md` 2026-08-14, filed as deferred work, **not yet propagated**. **MITIGATE:** run `/slava:maintain:docs-strategy-update` before this spec's Problem section is cited anywhere downstream.

### Non-Goals

- **Do NOT let the agent author a story.** A story's content is its owner's interiority; only its owner can write it. The agent bundles quotes and reasons about how they relate — it never writes in anyone's first person. This is the single lesson P1074 cost a letter to learn.
- **Do NOT mix quotes between parties in one story.** One story, one speaker.
- **Do NOT set `point_positions` as the agent.** Positions belong to the two humans. The agent's stance is expressed as a sealed prediction, nothing else.
- **Do NOT reuse the `reverseStory` marker.** It swaps the question to *"does this represent your intended meaning?"* — correct when the reader owns the experience, wrong here, where the reader is judging someone else's position. Leave letters unstamped and assert that as a negative check.
- **Do NOT build an ACL table, a share surface, or a new visibility state.** Sealed-letter delivery already provides two-person access.
- **Do NOT build a multiplayer surface, an agent registry, or cross-run indexing.** The persistent decision store remains frozen (`decisions.md` 2026-07-14 [product]).

### Alternatives Considered

- **Two partisan agents, one per party (P1074's design).** Rejected — refuted on three structural defects, and it made *"From Clarity Agent"* ambiguous about whose agent was writing.
- **Points filed alone, no story.** Rejected on structure: `doc_stories.story_id` is `NOT NULL`, so a letter always carries a story slot. The quote-bundle fills it honestly rather than leaving it empty.
- **A flat one-line context stub in the story slot.** Weaker than the quote-bundle and considered first — it gives the reader nothing to check the crux against, which is exactly what made P1074's anti-point unevaluable.
- **Skip the letter, feed a `/live` session directly.** Retained as a fallback. It drops the async case entirely, which is the case this exists for.

### Rollback Strategy

Skill changes revert with `git revert`. Filed letters are deletable rows (deliveries and snapshots cascade). No migration is anticipated; if stage work turns out to need one, that is a re-scope, not a rollback.

## Open Questions for /architect

1. **Does this revive H-LetterAsProduct, or is it new work?** `[FOUNDER DECISION]` — both legs of that bet's kill-criterion have flipped since 2026-06-02 (12 completions, and one recipient who later became a sender). The retirement was legitimate when made; the grounds no longer hold. Revival changes what this spec is measuring.
2. **What is the incentive to answer?** `[FOUNDER DECISION]` — reuse P1074's mutual-reveal gate, or name a replacement. See Risks.
3. **`story_points_author_point_unique UNIQUE (author_id, point_id)`** means one agent-authored story per point. Two quote-bundles on one crux therefore need two letters, two points, or a relaxed constraint. Verify against the migration, not this prose.
4. **Consent protocol** — what both parties agree to, when, and in what form.
5. **Does `align-decompose` get extended or replaced?** Its point/anti-point construction is reusable; its story authoring is exactly what this spec forbids.

## Done-When

- [ ] A crux point exists in prod, filed by the agent, whose statement passes the load-bearing test — it sits on a matter either party can name a real cost for
- [ ] Two stories exist, each containing **only** its own speaker's verbatim quotes — asserted by checking every quote against the transcript, not by inspection
- [ ] The agent's predicted position pair is **sealed before either party answers** — verified by reading the prediction row, with its timestamp preceding both responses
- [ ] Both parties take a position on the crux, and the predicted-vs-actual gap is recorded whether or not it was a hit
- [ ] Each party rates how well they understand the other's position, and the letter carries **no** `reverseStory` marker — asserted as a negative check, not by omission
- [ ] The agent holds **no** `point_positions` row for either point — asserted as a negative check
- [ ] Both parties' explicit consent is on record before any transcript is processed
- [ ] Every existing letter flow behaves identically — regression suite green, one existing letter rated end-to-end by hand

## Acceptance Criteria

- [ ] A recorded conversation produces a crux and two quote-bundles without the founder writing or editing any of the text
- [ ] Each person can see, from the quotes alone, why the agent believes this is the crux
- [ ] Neither person is asked to rate anything an agent invented about their own reasoning
- [ ] At least one party reports learning where they actually differ, beyond what the conversation already told them
- [ ] No existing letter or `/live` behaviour changes

**Falsifier for the bet itself:** the filed crux is one both parties say they already knew they disagreed about, **or** the predicted +3/−3 pair misses on the first three runs ⟹ the agent is finding self-surfacing disagreement rather than load-bearing cruxes, and the value is in `align-detect` alone rather than in this construction.

## References

- `features/archive/2026-08/p1074_agent_authored_crossed_letters.md` — the refuted predecessor; its `### REFUTED` section is required reading
- `docs/decisions.md` 2026-08-14 [product] — both entries: the R₀ correction (and its self-correction), and *an agent may author a point but never a story*
- `docs/definitions.md` §"Position Flip vs Interpretation Flip" — canonical anti-point home
- `docs/story-point-model.md` — story, point, the two axes, recount-vs-reveal
- `features/done/2026-06-10/p1030_reverse_story_and_align_pipeline.md` — where the `reverseStory` marker comes from, and why it is not reused here
- `features/p851_minimum_clarity_letter_field_experiment.md` — unread at filing; check for overlap before `/architect`
- `.private/align/runs/founder-coreties-2026-07-29.md` — the P1074 stage-1 run: five candidates, verified quotes, the decomposition, and the filing notes
