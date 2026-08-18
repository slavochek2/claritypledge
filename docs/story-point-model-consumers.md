# Story/Point Model — Consumers and Divergences

> **Maintenance sidecar.** You do not need this file to *apply* the model — read [story-point-model.md](story-point-model.md) for that. This file exists so a future consolidation pass does not have to re-run the audit that produced it (2026-08-06).

Two kinds of row, kept apart because they age differently.

---

## Deliberate rules (stable — these do not rot)

These are decisions, not drift. Do not "fix" them.

| Consumer | Rule | Why |
|---|---|---|
| `/align` | Must **never** call `sifter-story` Mode 2 to recover a user's why | Mode 2 is generative-persuasive; it would manufacture a justification and launder it as the user's reasoning. Canonical statement: [story-point-model.md](story-point-model.md) §"One reuse caveat for skills" |
| `/align` | Runs **point-first**; the sifters run story-first | Both directions are legitimate — the model states linked, not parent-child. Which yields better points is UNTESTED |
| `/problemify` | Deliberately keeps A → B → obstacle **welded** instead of decomposing | The frame's usefulness is the weld; splitting it loses the trajectory. Worked example 3 in the model doc |
| Letter pipeline | Ships a **fact point** that the plain agreement test would call a truism | Earned by checkability against a shared record, not by universal assent. Model doc §"Exception — the fact point" |
| Anti-point | Every mention anywhere must be a **pointer** to [definitions.md](definitions.md) §"Position Flip vs Interpretation Flip" | `decisions.md` 2026-07-29 — a restatement manufactures a fourth home. That entry tabulates the divergence; **do not restate its axes here** |
| `/align-create-letter` | Files **two** points (point + anti-point), not the letter pipeline's three-element structure (fact point / anti-point / norm point), and inherits no emotion gate | An agent paraphrasing someone's reasoning has no feelings to elicit, and there is no shared event record to establish common ground with — so the fact point has nothing to be checkable against. **Registered here 2026-08-10** after an adversarial review found the skill claiming this divergence was "registered as such" while it appeared only in the flat pointer list below |

---

## Divergences (these rot — re-grep before trusting)

Consumers that carry their own definitions instead of reading the model doc. Last audited **2026-08-06**.

| Consumer | Divergence | Status |
|---|---|---|
| `supabase/functions/story-guide-chat/` (`index.ts`, `prompts/v1.md`) | Inlines its own story definition ("not factual claims… redirect gently if the user starts writing a verifiable claim") | **Stale — not a correction target.** Founder's call, 2026-08-06 |
| `.claude/commands/slava/content/create-letter-from-transcript.md` | Carries its **own** element table (Fact point / Anti-point / Story / Point, each with a "User's position" column) | **Live pipeline, deliberately left unfixed.** Registered rather than corrected, 2026-08-06 |
| `~/.claude/commands/slava/think/problemify.md` | Uses "point" in the project's own sense but is a **global** skill — it cannot reference a cp-scoped doc | **Structural, not fixable by editing.** A global skill has no path to `docs/` |
| `docs/theory-of-change.md:596` | Still reasons over "any story/point/**position**" as a triple — the composite Position sense the model cut on 2026-08-06 | **Known, unfixed.** The passage is about epistemic states, not the model's ontology; correcting it means re-reading the Pinker argument. Do not use it as evidence that Position is an entity |
| `docs/decisions.md:1972` | The 2026-07-14 entry still calls this file "the single home for the story/point/**position** model" | **Historical record — do not edit.** Dated entries are not corrected in place; the 2026-08-06 [product] entry supersedes it |

---

## Consumers that hold *copies* of model claims

These restate part of the model rather than pointing at it. They are the rot surface this register exists for — **when a model ruling changes, these change too.**

| File | What it copies |
|---|---|
| `docs/philosophy.md` §3 | The two-element decomposition + the scope-not-exhaustiveness clause |
| `docs/lean-canvas.md` §3 | Ruling 2 ("linked, not parent-child") |
| `docs/definitions.md` §Story, §"Stories vs Points" | Plain-meaning Story/Point entries + the product invariants |

---

## Consumers that point at the model doc

`docs/CHARTER.md` · `docs/definitions.md` · `.claude/commands/slava/content/points-prepare.md` · `.claude/commands/slava/content/sifter-definitions.md` · `.claude/commands/slava/content/sifter-point.md` · `.claude/commands/slava/content/sifter-story.md` · `.claude/commands/slava/think/align.md` · `.claude/commands/slava/think/align-detect.md` · `.claude/commands/slava/think/align-decompose.md` · `.claude/commands/slava/think/align-create-letter.md` · `features/p1012_reverse_story_sender_paraphrase.md` · `features/p1030_reverse_story_and_align_pipeline.md` · `features/uat/p1030.md`

> **Two self-hits the check returns and cannot register:** `story-point-model.md` and this file. Pre-existing; treat them as expected output, not as gaps.

### Unregistered claims awaiting a home in the model doc (added 2026-08-18)

`points-prepare` points at the model doc and copies nothing from it — but it **introduces model-level concepts the model doc does not contain**, which is a third category this register had no row for. Not drift; a gap in the model:

| Concept | Where it lives now | Belongs in the model because |
|---|---|---|
| **The synthesized point** — a claim neither speaker made, built so each speaker's own quotes commit them to opposite ends | `points-prepare` §4a | It is a *kind of point*, not extraction craft |
| **A position held by an agent** — what it means for a non-human to hold one, and what a reader must understand by it | `points-prepare` §6, `features/p1104_*.md` | The model defines who may hold a position; agents are not in it |
| **A story as evidence for a position** rather than as its author's lived experience | `points-prepare` §8 | The model's Story is first-person experience; a quote bundle is a different object wearing the same name |

**Until these move, `points-prepare` is the de-facto home of three model rulings** — the exact rot this register exists to catch.

### Register drift — the integrity check below currently fails

Run 2026-08-18, it returned **10 files absent from every table above**: this skill (now added), five live specs (`p1052`, `p1055`, `p1061`, `p1084`, `p1101`) and three archived ones (`p1050`, `p1051`, `p1062`), plus the known self-hit. The register was last audited 2026-08-06. **Not fixed here** — registering nine files touched by other work needs its own pass, and the check does not say whether archived specs are exempt.

---

## Integrity check — run it in this direction

```
grep -rln "story-point-model" docs .claude features
```

**Every file it returns must appear in a table above.** Checking the reverse direction (that every listed file is hit by the grep) passes green while the register is incomplete — which is the exact failure this file exists to catch.
