---
status: week
type: task
rank: 91
workstream: infrastructure
created_date: '2026-08-31'
tags: [disagreement, skills, content, quality]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1202: The pipeline's stories are unreadable, and the run that proved it exposed five other defects

## Problem

**Situation:** The disagreement pipeline ran end-to-end for the first time on `ai-power-remedies`
(run B, four arguers, five points). Stages 1–4 completed; 20 quotes cleared `grep -F` against the
cleaned transcripts and four stories were drafted. **Only 15 of the 20 are audio-confirmed** — five
remain caption-only and block publication. The stories are correct and nobody wants to read them.

**Complication:** The founder read the drafts and could not get through them. Two defects sit
underneath that, and only one is style. The drafts **never state the reasoning behind the position**
— they summarise each speaker's argument instead — although `publish.md:260` says in as many words
that *"the inference chain belongs in the agent's story."* And when the drafting agent was asked for
a punchier opening it produced a factual error: *"Argentina has decided an AI can hold a bank
account"*, where the transcript says *"the government of Argentina announced that it is going to
grant legal personhood to AIs."* Two true fragments fused into a false composite. No check in the
pipeline looks at story prose — `grep -F` verifies quotes and says nothing about the sentences
around them.

**Question:** What rules make a story short, readable and accurate, where do those rules live, and
what else found in this run must be fixed before the pipeline is re-run?

> Founder framing, verbatim: *"right now it's too dry and it's not interesting to read, you know.
> Good posts must catch attention from the first sentence. And here, it's just like bullshit. Well,
> I don't know if it's bullshit, but I cannot read that."*

> On accuracy, verbatim: *"we cannot synthesize it in that way because Argentina has not decided
> that and if you read again then you will see they it's a proposal or something like that otherwise
> we create slop."*

> On the position staying out of the text, verbatim: *"the story is linked to the point, and I think
> it just explains the story, but it doesn't need to say that... The position is read through the
> link on the point. It doesn't need to explicitly name the position, and especially position
> itself, technically speaking, can be changed. And we don't want to remember to change the story."*

> On isolation, verbatim: *"I guess we cannot poison story creation by the rest of the session."*

> On the trade-off, verbatim: *"I don't think token efficiency is that important. If we are finding
> a shitty story, then people might not want to read it. So there is no point on doing that. So we
> have to do it good or we don't do it."*

## Appetite

**Blast radius: medium-high.** Story text is the reader-facing surface of the whole pipeline and
publishes under machine accounts bearing real people's names. **Reversibility: high** for the skill
edits (revert the file); **irreversible** for anything already published, which is why no story from
this run has been filed. **Decision density: low, with one reversal awaiting ratification** — the
founder settled every open call in the 2026-08-31 session EXCEPT one, which this spec reverses on
`CHARTER.md` grounds: **the founder explicitly agreed to a new shared craft document** (*"Yes makes
sense. I agree with decision A"*) and the duplicate gate then found a doc-routing rule that forbids
it. The reversal was disclosed in chat but **has not been ratified by the founder on record**. An
implementer reading this spec alone must treat the no-new-document decision as gate-imposed, not
founder-chosen. See Alternatives Considered.

## Invariants

- **A story MUST NOT state, name or imply the arguer's position on any point.** The position lives
  in the `point_positions` link. A story naming it cannot be linked to a second point, breaks any
  future anti-point pairing, and silently goes stale when a position changes. This is also a
  category error against `docs/story-point-model.md`, which defines a Story as something that can
  only be *comprehended* — never agreed or disagreed with.
- **Every factual claim about the world in story prose MUST be attributed to the speaker or trace to
  a verified quote.** Not *"Argentina decided X"* but *"Harari says Argentina has announced X."* The
  claim then stays true regardless of what Argentina actually did.
- **The agent that checks a story MUST NOT be the agent that wrote it.** Independence from the
  author is the property the session's evidence actually supports, and it is the invariant.
  **The checker DOES receive the transcript** (founder decision, 2026-08-31). An earlier draft made
  it transcript-blind; adversarial review showed that over-extrapolated the evidence — the three
  incidents prove an author cannot check itself, not that transcript access causes rationalisation —
  and that blindness removes the only oracle able to catch the central slop class: prose that reuses
  the quote set's own vocabulary while inverting modality, chronology, causal direction or scope.
- **`turn-inferred` remains a hard STOP at filing.** Unchanged; restated because this spec touches
  the skill that carries it.

## Solution

### 1. Story rules — where they live

**Not a new document, and not a new skill.** `docs/CHARTER.md` rule 10 routes *how one step runs* to
that step's own SKILL file, and rule 2's exception admits a concept-model doc only for a model with
an evolving operational layer. The charter's own precedent (`arbiter-failure-model.md`, extracted
2026-08-28) extracted a shared doc **when a third consumer appeared** — story craft has exactly one
consumer today. Premature extraction is what produced the five-copy drift this repo already records.

So the rules split across files that already exist:

| Layer | Home | Action |
|---|---|---|
| What makes something a story at all (recount vs reveal, the why must be present) | `docs/story-point-model.md` | **Already there. Do NOT duplicate** — point at it. |
| Craft procedure (length, opening line, sentence style, banned throat-clearing) | **new shared craft doc** | Reusable by any skill that writes stories. Placement confirmed with the founder per `CHARTER.md:47`. |
| Machine-writes-about-a-real-person safety (position, attribution, accuracy, full-name) | `story-draft.md` | Extend what is already there. |

`story-draft.md` points at the craft doc and never restates it.
**Location: `docs/story-craft.md`** — public, the direct sibling of `docs/story-point-model.md`,
which defines *what a story is* while this defines *how to write a good one*. Skills already read the
model doc by reference; the craft doc is read the same way. It holds writing rules only — no customer
data, no strategy, no figures — so nothing about it wants `.private/`, and a gitignored file would be
invisible to the public repo's own skill documentation that cites it.

### 2. Story craft rules to add

- **1,500 characters hard ceiling per story, quotes included** (≈900 of prose). Current drafts run
  2,416–3,604. The existing 10,000 DB limit is a ceiling, not a target.
- **The first sentence must earn the second.** No story may open by announcing what it is about.
- **Ban the throat-clearing patterns the current drafts are saturated with**: *"The argument X makes
  in this talk is…"*, *"is described as"*, *"the claim made is"*, *"the remedy X describes follows
  from…"*. Attribute once at the top; the page already establishes the frame with the account name,
  embedded video and quote list beneath, so the prose need not re-hedge every sentence. **This was
  the direct cause of the dryness.**
- **The story's job is the connective tissue the quotes cannot carry** — why the fragments hang
  together. A story that paraphrases its own quotes has no reason to exist.
- Short sentences. Concrete nouns and active verbs over nominalisation.

*Provenance note: the diagnosis above (metadiscourse as the disease) is the drafting agent's own
knowledge of classic-style prose advice, **not verified against a source this session**. If the first
rewrite still reads flat, that is when a research pass earns its cost.*

### 3. The three-tier accuracy rule

Every sentence in a story is one of:

1. **What the person said** — must map to a verified quote in the run file.
2. **How it connects** — the agent's reconstruction of reasoning. Allowed; this is the story's job.
3. **A fact about the world** — proper nouns, dates, numbers, named institutions, named events.
   **Banned unless attributed to the speaker.**

**Do NOT add a "this part is speculation" hedge.** Rejected by the founder in-session: it is weak
writing and duplicates the existing inference-strength label, giving two homes for one fact. If the
reasoning is not in the source, do not write it — a two-hour transcript always holds more real
reasoning than 1,500 characters can carry.

### 4. Writer / blind-checker shape

- **One writer per ARGUER — not per point, and not per story-point pair.** The unit is the person,
  so multi-point linking survives with nothing to consolidate afterwards. This dissolves the
  founder's stated worry about losing the one-story-to-many-points link.
- **The writer receives:** that arguer's full transcript, their verified quotes, every point they
  hold a position on, and those positions. **The position steers which strand of reasoning to
  surface and MUST NOT appear in the output.**
- **The writer receives nothing about the other arguers and nothing from the orchestrating session.**
  A writer that has read all four transcripts writes comparatively without meaning to — the four
  current drafts all sound like one narrator because they were.
- **A separate checker per story receives the finished story text, that arguer's verified quote
  list, the full transcript, and the point statements** — but NOT the writer's reasoning, and not the
  other arguers. The transcript lets it catch distorted paraphrase; the point statements let it judge
  whether the prose implies a position, which it could not do without them. It answers: does every
  factual claim hold against the transcript, not merely against the quote set; does the prose invert
  modality, timing, scope or causal direction anywhere; does it state or imply a position; are there
  proper nouns, dates or numbers with no source.
- **Findings go back to the original writer to fix**, never to the checker to rewrite — a rewriting
  checker flattens the prose it was meant to protect.

### 4b. Readability is measured by a blind reader test, not by the founder

The founder asked to be taken out of the loop (*"take me out of the loop"*, *"next time we run it, I
don't want to repeat myself"*). A Done-When reading *"the founder confirms they are readable"* puts
them straight back in, and the blind accuracy checker does **not** substitute — it checks claims
against quotes and says nothing about whether anyone would read the thing.

**Add a reader test.** The first draft's design was confounded — different agents, different
stories, no rubric, no tie handling — so a "win" would have measured agent variance, not writing.
Corrected design:

- **One evaluator sees BOTH versions of the SAME story**, randomised order, unlabelled. Same subject,
  same evaluator: the only variable is the writing.
- **Three fixed questions:** *(1) after the opening sentence ALONE, would you read on — yes/no;
  (2) what does this person think; (3) why do they think it?* Q1 is answered on the opening sentence
  shown by itself, before the rest — otherwise it is answered retrospectively, having already read
  the whole thing, which measures nothing.
- **Anchors, so the scale means something:** include one deliberately bad story (throat-clearing
  opener, quotes paraphrased) and one deliberately good one. An evaluator that does not rank the
  anchors correctly is not measuring — discard that run.
- **A tie is a failure to improve, not a pass.** The rewrite must win outright on Q1 across a
  majority of stories.

### 4c. Corrections forced by adversarial review — read before implementing

An independent review (different model family, spec-only, 2026-08-31) returned **DO NOT SHIP** on the
first draft. Four findings were verified against source and change the work:

- **The cast-collapse fix below is a MISDIAGNOSIS as originally written.** The first draft claimed
  `positions` is the first stage that reads what anyone said, and proposed adding a quote-pull to
  `select`. False: `select.md:614-647` **already** gives its isolated judge every candidate
  transcript, **already** requires the same-side trap checked *pairwise across all N*, and **already**
  carries a negative control (a known same-side pair the judge must fire on). Gate 2 **already**
  shows a supporting quote per arguer. **The check exists, ran, and returned a false clean verdict.**
  Adding a weaker duplicate would reproduce it. **The real question — unanswered, and the first thing
  implementation must establish — is why a transcript-complete, negative-controlled pairwise check
  concluded "No other pair collapses" when two arguers were the same voice.**
- **`prepare` cannot print the room-vs-arguer gap.** It seals the prediction *before* positions exist
  and is explicitly forbidden from reading a run file carrying positions, because that would destroy
  the isolation the seal exists to guarantee (`prepare.md:29,301-331`). The comparison belongs
  downstream of `positions`, and must not reopen the sealed block.
- **The blind checker cannot enforce two of its own invariants.** Without the point statements it
  cannot judge whether prose *implies* a position; without the transcript it cannot catch the central
  slop class — prose that reuses only vocabulary from the quote set while inverting modality,
  chronology, causal direction or scope. *"Harari says Argentina's announcement means AI bank
  accounts are now legally available"* introduces no new proper noun and passes every check proposed.
  **RESOLVED (founder, 2026-08-31): the checker gets the transcript, and the point statements.**
  Independence from the author is kept; blindness is dropped as an over-extrapolation.
- **Attribution alone does not repair a distorted paraphrase.** *"Harari says X"* is not safe if X
  changes modality or scope, which is exactly what the Argentina sentence did. The invariant claiming
  attribution keeps a claim "true regardless" is overstated and must be narrowed.

### 5. Five other defects found in the same run

- **The cast collapsed to two voices and nothing noticed.** LeCun and Andreessen never diverge on any
  point where both hold a position (P2 +3/+2, P3 +2/+2, P4 +2/+3). The sealed `judge_dissent` had
  asserted *"No other pair collapses"*.
  **The first draft proposed adding a quote-pull to `select`. That was a misdiagnosis and is
  WITHDRAWN** — see §4c: `select` already runs a transcript-complete, negative-controlled pairwise
  same-side check, and it returned a clean false verdict anyway.
  **Fix: diagnose before prescribing.** Implementation must first establish WHY the existing judge
  passed. Two candidate explanations, both testable against this run's artefacts; say which holds
  before changing any rule:
  **(a) The judge tested the wrong thing.** It looks for two arguers on the same *stated position*.
  LeCun and Andreessen occupy genuinely *different* positions (release the weights vs accelerate) and
  merely never disagree on any actual point. A same-position check cannot catch a same-vote pair.
  **(b) The judge had the inputs and did not use them** — a reasoning failure, which more prose will
  not fix and which needs a mechanical check instead.
  **The sealed dissent's own wording points at (a)** — it reasoned about positions, not about how
  each source would vote. **If (a) holds, the fix is a DIFFERENT check, not a louder one:** after
  positions are set, flag any two arguers whose position signs match on every point where both hold
  one. Mechanical, needs no judgement, and would have caught this run.
- **An unfilled position silently removes an axis.** Position 3 (halt development) was the only voice
  opposing both camps; with it unfilled the spread became one axis and no stage re-checked.
  **Fix: when a position goes UNFILLED, re-run the spectrum check on the survivors before points are
  generated.**
- **Predicted room split and arguer split are never compared.** Both numbers already exist. On this
  run all four arguers agreed on P2 while the sealed prediction says 20% room agreement — the most
  interesting point in the set, which the run reported as a consensus risk. **Fix in `prepare.md`:
  print the gap.**
- **A silent subagent is indistinguishable from one that found nothing, and the pipeline has no
  report count.** All seven subagents in this run showed `idle` in the agent listing while their
  reports had not been delivered; they arrived ~6 minutes later. Acting on the listing, the
  orchestrator announced *"0 of 7 subagents reported"* and, following the skill's own rule that a
  silent verification agent is a DROP, **discarded three correctly-verified quotes**. Both the count
  and the drop had to be retracted when the reports landed. `epistemic.md` gate 9b already requires
  reporting `<received> of <spawned>` — it does not say that `idle` is not a delivery signal.
  **Fix: no pipeline stage may treat an agent listing's status as evidence a report will not arrive.
  A drop-on-silence rule must be triggered by an explicit deadline the stage itself sets and states,
  never by an agent appearing finished.** This matters more once stories are written by 8 agents per
  run — the same trap would silently drop a story.
- **A verification harness passed a semantically inverted control.** The first caption-vs-audio
  comparison scored *"closed weights … total defense"* against *"open weights … no defense"* at 0.88
  and reported CONFIRMED. Caught only because a known-bad control had been planted. **Fix: any
  comparison harness in this pipeline must ship with a known-bad AND a near-miss control, and print
  their results beside the passes.**

## Alternatives Considered

| Option | Rejected because |
|---|---|
| ~~A new shared craft document~~ | **This row was the error, not the alternative.** Rejected in an earlier draft on two misreadings (precedent stated backwards; charter treated as binding over the founder). **Retracted** — the shared document is the chosen approach. Kept visible rather than deleted, because the failure mode was an agent using a routing rule to overturn a founder decision in favour of its own conclusion. |
| A separate "sense of style" skill that rewrites stories afterwards | Two skills authoring one artifact is how rules drift apart — this repo already records a contract living in five copies that went out of sync for five days. Also: craft constraints must be held *while* writing; a strong opening cannot be bolted on afterwards. |
| One agent writes and self-checks | Reproduces the exact failure this session measured three times: a comparison harness the author built and trusted was blind; the blind speaker-check the author could not influence worked; the Argentina error survived the author's own review and was caught by the founder. **The thing that catches an author's error is a reader with no stake in the text.** |
| Story opens by naming the position (*"This account reads Harari as strongly agreeing…"*) | Proposed by the drafting agent, rejected by the founder with a stronger reason than offered: it makes the Story a Point, which `story-point-model.md` forbids. Also breaks multi-point linking, future anti-points, and goes stale on any position change. |
| Mark agent interpretation as speculation in the prose | Weak writing, and duplicates the existing inference-strength label. |
| Verify world-facts against an external source and link it (founder: *"if we say something happened, then we need to double check it and put the source and link a source"*) | Not adopted, and recorded here rather than dropped silently. The three-tier rule attributes the claim to the speaker instead, which the founder then preferred (*"I really, really like the formulation of this person says"*). Attribution is checkable inside the run file; external verification adds a network dependency and a second source of truth per story. **Revisit if attribution proves insufficient for a claim a reader would act on.** |
| Benchmark `/create-spec` by writing this spec twice, with and without the skill | **Contaminated control.** The drafting agent read the pipeline's skill files all session; a "without skill" arm would reproduce the skill's sections from memory and the null result would be false. Filed separately — see Open Questions. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| 1,500 chars proves too tight to carry reasoning + quotes | MITIGATE | Founder reviews the first rewritten story and may raise the ceiling; the number is a stated assumption, not a measured one |
| Two agents per arguer (8 for a four-arguer run) is a large fan-out | ACCEPT | Founder explicitly traded token cost for quality twice in-session; the isolation is structural, not redundancy |
| The blind checker cannot catch a *plausible* invention that happens to be true | ACCEPT | It catches unattributed world-claims, which is the measured failure. A checker cannot verify the world |
| Craft rules written into the skill will need extracting later | ACCEPT | Extraction trigger recorded in the skill; a move is cheaper than un-drifting two copies |
| `select.md` quote-pull adds cost to a stage that already gates twice | MITIGATE | 1–2 quotes per arguer, not a full extraction pass |

**Non-Goals**

- Do NOT create a new skill. Do NOT create a new document.
- Do NOT restate the story/point model — `story-draft.md` points at `docs/story-point-model.md`.
- Do NOT weaken or bypass any existing publish precondition, including the audio-at-timecode check.
- Do NOT change the `stories.content` 10,000-character DB constraint; the 1,500 target is a build-time
  rule inside the skill.
- Do NOT re-run `select` or `prepare` for `ai-power-remedies` — the approvals and prediction seals
  are intact and the founder ruled the run ships on its existing five points.
- Do NOT edit the four existing story drafts in place; they are regenerated by the improved skill.

## Done-When

- [ ] `story-draft.md` carries the craft section, the three-tier accuracy rule, and the extraction trigger note
- [ ] `story-draft.md` carries the writer/blind-checker shape, including what the checker must NOT receive
- [ ] A story regenerated under the new rules is ≤1,500 characters including quotes, verified by character count
- [ ] The checker is run against **four** seeded bad cases and flags all four — gate proven by watching it fail, not pass. One per distortion class, because the session's known-bad case exercises only the crudest: (1) *invented fact* — "Argentina has decided an AI can hold a bank account"; (2) *modality shift* — an announced intention rendered as a completed fact; (3) *causal inversion* — "X because Y" where the source says Y because X; (4) *scope creep* — a claim about one country rendered as a claim about all
- [ ] The checker is run against **one known-GOOD story and passes it** — a gate with no false-positive case has an unmeasured false-positive rate
- [ ] `select.md` pulls quotes per arguer and reports whether any two arguers land the same way, before Gate 2
- [ ] `prepare.md` prints the predicted-room-split vs arguer-split gap
- [ ] `select.md` re-runs its spectrum assessment on the surviving arguers whenever a position is UNFILLED, and prints the reduced spectrum to the founder at Gate 2 as a named finding. Failing to print is the defect; an unfilled position is never a silent narrowing
- [ ] The **three** comparison harnesses that exist — quote-vs-transcript, caption-vs-audio, and the new story-vs-source checker — each print a known-bad AND a near-miss control result beside their passes. *(Enumerated, because "any harness in the pipeline" named no finite set and could not be completed.)*
- [ ] A blind reader test is run on one old and one rewritten story in separate agents, neither told a comparison exists, and the rewritten one wins on "did you keep reading past the first sentence"
- [ ] `positions.md` Step 4c's drop-on-silence rule names an explicit wait deadline (minimum 10 minutes from spawn) and states that an agent listing's `idle` status is NOT a delivery signal. *(Scoped to the one rule that actually discards work.)*
- [ ] The `/create-spec` benchmark is filed with its own P-number, or Open Question 2 is closed with a written reason. *(Filing that separate spec is NOT part of this spec's completion — only recording the decision is.)*
- [ ] All four `ai-power-remedies` stories regenerated under the improved skill

## Open Questions

1. Does 1,500 characters including quotes leave enough room? Founder to judge on the first rewritten
   story. *(Stated assumption, not measured.)* **The founder's stated range was *"1,000 ... or maybe
   1,500"*** — 1,500 is the top of it, chosen under the founder's delegation of micro-decisions. The
   number may need to move **down** as well as up; do not treat the ceiling as one-directional.
2. Benchmarking `/create-spec` against an unskilled baseline — agreed to be separated from this
   spec, and **NOT YET FILED as of this spec's creation** (verified: no benchmark spec exists in
   `features/`). The wording "filed separately" would be a commitment recorded as completed. It
   still needs a P-number. **The clean design:** two fresh agents that have never seen the originating
   conversation, both handed the same context package, one given the skill and one not, with scoring
   criteria pre-registered by a third party before either spec exists. Pairs with the existing
   Kanban item on `/change-request` creation.
3. Whether the craft rules generalise to the blog and letter skills is untested. The extraction
   trigger records when to find out.

## Resuming the `ai-power-remedies` run after this spec ships

State at the time of filing, all verified in-session:

- Run file: `.private/points-runs/ai-power-remedies.run-B.md` (773 lines).
- Stages 1–4 complete. Approvals seal `dd35dd08…4debf` and prediction seal `27c3e303…3628e5` both
  re-verified intact after three appends.
- 20 quotes filed across 4 arguers, 5 points. Position 3 UNFILLED, deliberately, not substituted.
- Audio check **partial: 15 of 20 confirmed**. Yann LeCun's five quotes remain UNVERIFIED — his
  source is bot-walled (`yt` exit-7, every free proxy route walled). **This blocks publish to TEST as
  well as PROD.** Clear it by listening to five ~15s windows (876s, 888s, 955s, 1108s, 1219s at
  `https://www.youtube.com/watch?v=MWMe7yjPYpE`) or by approving a residential proxy top-up. Never
  auto-purchase.

**To resume:** re-run `/slava:disagreement:story-draft ai-power-remedies` under the improved skill.
It re-verifies both seals, replaces the `## Story Drafts` section, and hands off to
`/slava:disagreement:publish` — dry-run, then TEST, then PROD as separate deliberate invocations.
The five points ship unchanged; the sealed prediction is the only scoreable artifact and choosing
points after seeing positions would destroy it.

## Related

- `p1191` — progressive scene-setting article assembled across pipeline stages. Related surface
  (same pipeline, same run material), different problem. Not a duplicate.
- `p1141` — story carries a video with jumpable quotes; source of the voice rules this spec extends.
- `docs/story-point-model.md` — what a Story is. This spec's craft rules point at it, never restate it.
- `docs/CHARTER.md` rules 2 and 10 — the doc-routing ruling that decided where these rules live.
