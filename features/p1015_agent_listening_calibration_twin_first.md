---
status: backlog
type: task
rank: 84
created_date: '2026-07-30'
tags: [calibration, agent, twin, measurement, parked]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1015: Agent listening calibration — measure the prediction delta before building twin-first

**Origin:** 2026-07-30 session. Not hypothetical — the failure was observed and counted this session.
**Bears on:** `docs/hypotheses.md` H-FounderWince (D2, the transfer question) · `docs/decisions.md` 2026-07-30 [product] · `docs/definitions.md` §Personal AI Calibration, §Digital Twin

---

> **PARKED 2026-08-07 — superseded as the active measure by [P1030](./done/2026-06-10/p1030_reverse_story_and_align_pipeline.md).**
>
> Both specs measure one construct: how well an agent understands the founder. They measure it
> differently — **P1015 passively** (log the corrections that arrive on their own), **P1030
> actively** (the agent paraphrases the founder's reasoning and the founder scores it in a letter).
>
> Two independently-defined measures of one construct is exactly what this spec's own rule
> forbids — *"a measure invented after seeing the data is not a measure."* Parking honours that
> rule rather than violating it: **P1030 fixes the measure in advance** — its two question strings
> are pinned in its UI Contract before any data exists, and the score is a typed 0–10 from the
> experience owner, which the agent cannot self-certify.
>
> **What P1015 keeps:** the passive channel. Corrections still arrive for free during ordinary
> sessions, and they are the only signal that shows what the agent got wrong *without being asked*.
> P1030's number cannot see those, because it only measures what the agent chose to paraphrase.
>
> **Unpark when:** P1030 has produced at least one real score and the question is whether the
> active number predicts the passive correction rate. That comparison is the point of keeping this
> spec alive — but it is meaningless until one number exists.
>
> **Do not unpark to build v1 as written.** If the twin-first question becomes live again, re-derive
> the measure against whatever P1030 actually produced, rather than against the 2026-07-30 count.

---

## Problem

**Situation:** In one working session the founder corrected the agent **eight times** on substantive positions — five in a first round, three in a second. In every case the agent had analysed the source corpus competently. What it had not done was model *the founder's own already-recorded positions*.

**Complication:** At least three of the eight were inferable from material already written down, not from the corpus under analysis — that a peer session was not a sale, that transferability is measured after receipt rather than before, and that a non-prospect's deflection is not customer evidence. The agent never predicted a position and never checked one. It analysed, asserted, and waited to be corrected. Each correction costs a full turn, and two of the three would have reached the strategy docs unchallenged had the founder not caught them.

**The deeper reason this matters.** `hypotheses.md` H-FounderWince records **D2**: does the human↔human protocol transfer to human↔AI? In the 2026-07-30 peer session that question was **asserted** by the founder (*"it's the same protocol"*) and **disbelieved** by the counterpart (*"But I don't I don't believe that"*), with **zero evidence offered by either side**. It is logged as an open disagreement. Twin-first is the first concrete, testable bridge anyone has proposed across that gap — and ClarityPledge is its own best corpus, because the founder works with agents daily and the corrections are already being generated for free.

**Question:** Can the delta between an agent's *predicted* understanding of the founder's position and the *correction that actually arrives* be instrumented — and does consulting a twin first reduce it?

## Appetite

**Blast radius:** low for v1 (measurement only — an append-only log; nothing in the agent's behaviour changes). High for the eventual v2, which would sit in the response path of every session.
**Reversibility:** v1 fully reversible (delete the log). v2 is not — a twin-consultation step in the response path changes latency and cost on every turn.
**Decision density:** high. Two live `[FOUNDER DECISION]`s below, plus an unresolved design disagreement (D4) inherited from the source session.

## Approach

**v1 is measurement, and only measurement.** Do not build twin consultation first.

The reasoning is the counterpart's own, which the founder pressed hard in the session and which applies to us here: *you cannot reduce what you cannot measure.* Building twin-first before the delta is instrumented would produce exactly the situation the source conversation diagnosed — tweaking a system by feel, with no way to know whether it improved (the counterpart, 01:56:58: *"I'm tweaking it without measuring. I'm alive in it."*). We would be running the anti-pattern we sell against.

**What v1 instruments — the correction event.** When the founder corrects an agent position, capture: the agent's stated position, the founder's correction, whether the agent had *predicted* a position at all, and whether the correction was **inferable from already-recorded material** or genuinely new information the agent could not have had. That last field is the load-bearing one: it separates "the agent failed to consult what it had" from "the founder knew something unwritten." Only the first class is addressable by a twin.

**Define the measure before collecting.** The construct is the product's own, turned on the agent: predicted understanding vs verified understanding. Score and direction must be fixed in advance, because a measure invented after seeing the data is not a measure.

**Then, and only then, evaluate twin-first.** Baseline established → introduce a twin-consultation step → compare the same delta. The founder's framing: *"each agent must talk to twin first, and then learn from that."*

## Risks / Non-Goals

### Risks
- **The corrections are n=1 and one-person.** Everything here is the founder correcting agents about the founder. It measures one dyad. *Mitigation:* state the bound in the deliverable; do not generalise to the product's human↔human claims.
- **Instrumenting corrections may suppress them.** If corrections are logged and scored, the agent may hedge to avoid being wrong, and hedged positions are unfalsifiable and worse than confident wrong ones. *Mitigation:* score prediction *accuracy*, never *frequency of being corrected*; a confident wrong prediction must score better than no prediction.
- **"Inferable from recorded material" is a judgment call and the founder makes it.** That is a real load on him and the field most likely to rot. *Mitigation:* three values only — inferable / not-inferable / unclear — and "unclear" is a legitimate answer, not a prompt to deliberate.
- **The twin may be the wrong container.** Meanings are story-shaped, not word-shaped, and the source session left the rival mechanism unresolved (D4, glossary vs stories). A twin built on a term glossary would inherit the losing side of an argument that was never settled. *Mitigation:* v1 does not build the twin, so this risk is deferred by construction.

### Non-Goals
- Do NOT build the twin-consultation step in v1. Measurement first, and the baseline must exist before any intervention.
- Do NOT change agent response behaviour in v1 — no hedging prompts, no forced prediction preamble in normal work.
- Do NOT promote any hypothesis on this. The observation is n=1 and the founder is the only subject.
- Do NOT treat this as settling D2. It is a proposed *test* of the transfer claim, not evidence for it.
- Do NOT ship a scoring UI, dashboard, or visualisation in v1. An append-only log is the deliverable.
- Do NOT auto-detect corrections with a classifier. Detection error would silently corrupt the only measure we have.

### Alternatives Considered
- **Glossary / ontology layer** (the counterpart's rival mechanism — a set of defined terms consulted at conversation time). Rejected *as the v1 approach*, not on the merits: it addresses vocabulary drift, and the observed failures were not vocabulary failures — the agent used every term correctly and still missed the position. Note honestly that D4 is unresolved and this may be complementary rather than wrong.
- **Longer / richer CLAUDE.md.** Rejected: the material needed for at least three of the eight corrections was already written down and already loaded. The failure was not absence of context but absence of *consultation* — more text does not fix a missing lookup step.
- **Do nothing; rely on the founder correcting in-session.** The honest baseline, and it works — every one of the eight was caught. Rejected because it costs a turn each time and does not scale past the one person who holds the positions.

### Rollback Strategy
v1: delete the log file. No behaviour depends on it.

## Done-When

- [ ] A written measure definition exists — what is predicted, what counts as correct, direction of the score — dated and committed **before** any data is collected
- [ ] A correction-event log exists, append-only, capturing agent position · founder correction · prediction-made (y/n) · inferable-from-recorded-material (yes/no/unclear)
- [ ] At least 10 real correction events are recorded from live sessions, not reconstructed after the fact
- [ ] The baseline rate is stated: what fraction of corrections were inferable from material the agent already had
- [ ] A go/no-go on twin-first is written against that baseline, with the threshold named in advance
- [ ] The deliverable states the n and the one-subject bound explicitly, and names what it does **not** establish about D2

## Founder decisions (open — do not fill in)

- `[FOUNDER DECISION: home]` — is this a ClarityPledge product feature (listening calibration for a user's own agent), internal agent tooling for this repo, or both? The measurement in v1 is identical either way, which is a reason to defer the call rather than force it now.
- `[FOUNDER DECISION: twin substrate]` — where do the twin's stories and points live? Related to D4 (glossary vs stories) and unresolved in the source session.
- `[FOUNDER DECISION: go/no-go threshold]` — what inferable-correction rate would justify building twin-first? Name it before the data arrives, not after.
