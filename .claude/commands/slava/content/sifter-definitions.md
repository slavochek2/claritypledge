# Sifter Definitions

Shared **sifter config** — session-file format + the quality-scoring criteria used across the sifter skills.

> **The story/point/position definitions live in one place: [`docs/story-point-model.md`](../../../../docs/story-point-model.md).** That file is the single home for what a Story / Point / Position is, the two axes, mechanism-vs-stance point types, the comprehension vocabulary, the edge cases, and the operational model. Do **not** restate those definitions here — this file keeps only the sifter's operational config below.

> **Quality criteria are feedback signals, not publication gates.** Scores (falsifiable, counterfactual, hard-to-vary, voice) are advisory metadata shown to authors and optionally readers. They help improve points but never block creation. See `docs/philosophy.md` Measurement Stack.

---

## Session File

Each session is ONE file: `.private/sifter/sessions/{session-name}.md`

```markdown
# Session: {session-name}

## Context
<!-- Brain dump, vocabulary, NVC extraction, iteration history, feedback -->

## Story
<!-- Final approved story (10/10) -->

## Points
<!-- Approved points with scores + agreement ratings -->
```

**Why one file:**
- Full journey visible in one place
- Simpler to track and share
- Context naturally flows into outputs

---

## Story / Point definitions → see the model file

The core distinction (Story vs Point, mechanism vs stance), what makes a good story/point, the agreement test, and the comprehension vocabulary (cognitive vs emotional understanding, agreement, "understand" as a false-unity word) **all live in [`docs/story-point-model.md`](../../../../docs/story-point-model.md)**. Read them there — they are not restated here.

The scoring criteria below are the sifter's own *quality-feedback* config (how testable/tight a candidate is), distinct from the model's definitions.

---

## Scoring Criteria (0-100 each)

All 4 criteria are equally weighted. Combined score = average of all 4.

### 1. Falsifiable
Can it be proven wrong through observation or experiment?

| Score | Description |
|-------|-------------|
| 0-20 | Unfalsifiable — no possible observation could prove it wrong |
| 41-60 | Moderately falsifiable — testable but requires clarification |
| 81-100 | Strongly falsifiable — precise prediction, clear test |

### 2. Counterfactual
Does it assert something that could be otherwise — not a tautology?

| Score | Description |
|-------|-------------|
| 0-20 | Tautological — true by definition |
| 41-60 | Weak — makes a claim but it's obvious |
| 81-100 | Strongly counterfactual — bold, high information content |

### 3. Hard-to-Vary
Is every component essential AND does it explain a specific mechanism?

Two tests:
1. **Can't remove anything** — every word is load-bearing
2. **Can't swap anything** — the mechanism is specific to this domain

| Score | Description |
|-------|-------------|
| 0-20 | Highly variable — most terms could be swapped, or just observes without explaining |
| 41-60 | Moderate — some specificity, but mechanism is generic (could apply to any domain) |
| 81-100 | Very hard to vary — every word is load-bearing AND explains a specific mechanism |

### 4. User Voice
Does it sound like the user? Uses their concepts, not academic jargon?

| Score | Description |
|-------|-------------|
| 0-20 | Completely drifted — jargon user never used |
| 41-60 | Mixed — some user language, some introduced jargon |
| 81-100 | Pure user voice — their concepts, their words |

---

## Combined Score

**Total = average of all 4 criteria**

**Target: 90+**

A Point scoring 90+ is testable, non-obvious, hard-to-vary, and sounds like the user.
