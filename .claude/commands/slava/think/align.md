---
name: align
description: "Interactive alignment protocol — before the AI agrees or disagrees on a high-stakes point, it makes its comprehension of the story behind your position legible and keeps any residual gap visible. The AI can never self-certify understanding."
when_to_use: "Invoke (or auto-propose) when about to agree with/endorse, disagree with/recommend on, or take an irreversible-class action on a consequential point — where being confidently wrong about WHY you hold your position would cause real harm. NOT for low-stakes reactions, brainstorming (that's /interview), testing a proposal before acting (/falsify), or red-teaming a finished artifact (/adversarial-review)."
version: 1.4.0
---

# /align

Run the verify-before-position loop: surface the point, recover the parent story, make the AI's comprehension of your lived experience an honest number, and keep any gap visible instead of papering over it with a confident agree/disagree.

**The frame:** the AI is not a proxy that holds a stance for you. It is a **transmission instrument between humans** — its job is to make understanding legible and calibrated, not to win the argument or rubber-stamp your view.

**Announce at start:** "Running /align."

---

## The load-bearing rule (read this first — it is the whole point)

> **`verified ⟺ min(ai_selfscore, user_score) ≥ 8`, and `user_score` is MANDATORY.**

The AI paraphrases your story back and self-estimates comprehension (0–10). You then rate how well the AI captured **your** experience (0–10). The printed score is the **min** of the two.

By construction:
- **The AI alone can never reach "verified."** With no `user_score` there is no min — the unit stays `UNVERIFIED`. A green run the AI produces by itself is not evidence of understanding.
- **Min is honest.** AI says 9, you say 5 → **5/10, not verified.** The disagreement surfaces instead of being averaged away.
- **Roles are flipped vs the product.** In /live the reader self-rates and the author confirms. Here the **AI is the listener self-rating**, and **you are the author confirming your experience was captured.** Same ≥8 gate, same Min Principle (`docs/definitions.md:148,438-442`; `docs/decisions.md:716,2928`).

If you ever see "verified" without having personally typed a number, that is a bug in how the loop was run — stop and re-run Step 3b.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| About to agree/disagree/act on a high-stakes point, need calibrated understanding first | `/align` ← here |
| Test a proposal against first principles *before* acting | `/slava:think:falsify` |
| Red-team a finished artifact (diff, design, shipped policy) for failure modes | `/slava:think:adversarial-review` |
| Dig for a founder story through open Q&A (no position at stake) | `/slava:content:interview` |
| Extract a point / story as a discrete sub-step | `/slava:content:sifter-point`, `/slava:content:sifter-story` |

---

## v1 scope (do not exceed)

**In:** the interactive reasoning loop, run in-conversation against a **live** interlocutor (Slava himself, or a person present in the chat), output to **terminal only**.

**Out (deferred — refuse and name the boundary if asked):** letters to third-party stakeholders; multi-party transmission; a client-installable package; DB persistence; the always-on CLAUDE.md behavior rule (only *after* the backtest proves the loop); auto-firing without confirm; heavy bulk-extraction subagents.

> **No artifact leaves the terminal to a second human in v1.** If the run produces something meant to be *sent* to someone else, stop — that is out of scope until the blind backtest passes.

---

## The loop

### Step 0 — High-stakes gate (closed checklist triggers; divergence score measures)

Do **not** rely on a holistic sense that "this feels important" — that sense is exactly what sleeps during the silent-lull failure. Two moves: the checklist says *whether* a point is a candidate; the divergence score says *how* high-stakes it is.

**Trigger family** — a point becomes a candidate if ANY item matches:

- **(a)** About to **agree with / endorse** a stated position on something that would be acted on. *(This is first on purpose — cheap agreement is the default failure mode.)*
- **(b)** About to **disagree / recommend** on a consequential fork.
- **(c)** Any **ALWAYS-ASK / irreversible-class** action (per the CLAUDE.md "Decisive Action — Reversibility classifier": push, deploy, send, DELETE/DROP, merge, publish, etc.).

**High-stakes is relative, not binary — score it 0–100 from four rated factors, not a holistic guess.** The score answers: *if I get the WHY behind this wrong, how bad is it?* Rate each factor 0–10, sum (0–40), ×2.5 → 0–100. **Always show the breakdown** so the user can correct a single factor, not just the total:

- **reversibility** — how hard to undo if wrong? (0 = trivially reversible · 10 = irreversible)
- **blast radius** — how much downstream depends on it? (0 = isolated · 10 = foundational / mission-wide)
- **wrong-WHY likelihood** — how easy is the *why* to misread? (0 = unambiguous · 10 = emotional / murky)
- **detection latency** — how long until you'd notice the error? (0 = immediate · 10 = silent, surfaces late)

`stakes = (reversibility + blast + wrong-why + latency) × 2.5`. Band read: **0–30** low · **30–60** moderate · **60–85** high · **85–100** critical (irreversible-class or mission-foreclosing).

This formula is a **first pass, itself falsifiable** — the factors, weights, and the flat ×2.5 are the agent's rubric, and every user correction to a factor or the total is feedback that sharpens it (see the feedback-loop note below).

**On one or more candidates:** surface them via the Step 1 card, ranked by score, and propose —
> "Highest-stakes candidate: **‹shortest›** (‹type›, ‹score›/100 — if wrong, ‹the divergence in one line›). Run the alignment check on this one?"

Proceed on confirm. **Manual invoke is always available** (the user typing `/align` skips the trigger — but still classify + score the point so the user sees the divergence they're signing up for). This checklist is the seed of the future always-on CLAUDE.md rule — do not codify it there until the backtest (incl. false-positives) passes.

**Feedback loop (bounded).** When the user corrects a classification or a score, treat it as a rubric-improvement signal: adjust the wording/anchors here, then *re-run detection on the same material* to see if the corrected rubric now lands. This is the min-gate feedback loop, scoped to Stage-1 detection only — it does **not** pull in the two-axis point-ness/story-ness scoring, which stays deferred and untested.

---

### Step 1 — Surface candidate(s) as classified cards, USER CONFIRMS ONE (blocking gate)

Interaction is **point-first** (the claim is what's visible). Logical parenthood is **story → point** (`docs/definitions.md:280-304`). You verify understanding of the *story*, not the *point* (points are just claims; stories enter the comprehension protocol).

Emit each candidate as a **classified card** — the user cannot confirm a target they can't see clearly, and a vague "the point" is what let comprehension get verified against a strawman. The card has four fields, and only four:

```
CANDIDATE ‹n›
  type:      decision | assumption | hypothesis | problem-statement | reasoning | other
  content:   ‹the candidate's claim distilled to fewest words — AGENT's compression, user verifies›
  source:    ‹date› · ‹corpus: this Claude Code session | claude-conversations› · ‹conversation/file›
  quote:     "‹verbatim text the USER actually wrote/said — the evidence›"
  if wrong:  ‹future if the WHY is understood›  ⟂  ‹future if it's misread›   ← the divergence
  stakes:    ‹0–100›  = reversibility ‹0–10› + blast ‹0–10› + wrong-why ‹0–10› + latency ‹0–10›  (×2.5)
```

- **type** classifies the *speech act*, because a decision, an assumption, and a hypothesis fail differently when misunderstood — the class tells you what kind of harm a wrong-WHY produces.
- **content** is the agent's *distillation of the quote* — the candidate's claim in fewest words, flagged as the agent's compression so the user can catch words welded on that they never said. The user verifies `content` against `quote`.
- **source** names *where it came from*, only: the date, which corpus (currently two — **this Claude Code session** or the **claude-conversations** export of claude.ai chats), and the specific conversation/file. Keep it locatable so the user can say "expand that" and you pull the surrounding transcript — the card is an index into context, not a replacement for it.
- **quote** is the **anti-hallucination anchor for detection** — the *verbatim* evidence, never a paraphrase. If you cannot cite a real quote the user actually wrote/said, you do not have a candidate — you have an invention. (This is the detection-side twin of the live-user-turn anchor that Step 3b rests on.)
- **if wrong** is the falsifiable justification for the score: two concretely different futures, not "it matters."
- **stakes** shows its four-factor breakdown (Step 0), so the user corrects one factor, not just the total. Rank multiple candidates by the total, highest first.

Then **STOP and ask the user to confirm ONE** target, on their own turn:

> "Running /align on **CANDIDATE ‹n›**. Confirm it's the one you staked — or correct the shortest/type/score."

**This is a blocking gate.** Recovery does not begin until the user confirms (or corrects) a single card on a separate turn. Confirming the card also confirms (or revises) its classification and score — feeding the Step 0 feedback loop. Silence, inference, or self-answering the confirmation ⟹ do not proceed. Do **not** run recovery on more than one point per unit.

---

### Step 2 — Recover the parent story (rigorous inline; NOT a persuasive re-story)

Once the point is user-confirmed, recover the **lived experience behind it** — the "why" — through a rigorous inline procedure. Do **not** call `sifter-story`'s point-seeded mode: that mode is *generative-persuasive* — it builds a story that SUPPORTS the point, which would make /align manufacture a justification and call it "the user's why." That is the rubber-stamp this skill blocks.

Instead, recover the story inline using the NVC *steps* (observation → feeling → need → the concrete episode), **elicited from the user, not authored for them**:

- Ask for the **specific episode** that seeded the point ("when did you last hit this — what happened?"), not an abstract rationale.
- Draw out **observation** (what concretely occurred), **feeling**, and the **underlying need** — in the user's terms.
- **Recover, never supply.** If you find yourself writing the story *for* the user to nod at, stop — a nodded-at AI story is not their lived experience. Missing pieces become open questions in Step 3, not authored fills.

Then proceed to Step 3 with whatever the user gave you — gaps stay visible as open questions.

---

### Step 3a — AI paraphrases the story back + self-estimates (one side only)

Paraphrase the story back in the user's own terms. Then state a self-estimate:

```
self-est 7/10 · UNVERIFIED
```

- The number is **justified by enumerated open questions** — every question you have, printed.
- **You do NOT pre-filter which questions are "important."** Print all of them; the user decides what matters (a question you dismissed as minor is often the one carrying the story).
- This is **one side of the min.** It has no path to "verified" on its own. Never drop the `UNVERIFIED` label at this step.

---

### Step 3b — User answers the open questions AND types the rating (TWO separate turns) → apply the min

The position **cannot be emitted** until real user input arrives on **separate transcript turns** — first on the open questions, then on the rating. Do not collapse these, and do not self-answer either and proceed. This user input on a distinct turn is the **only** anti-hallucination anchor (see Verification): a single model can shape a fake unit, but it cannot forge a real user turn without you supplying one.

**Turn 1 — the open questions.** Surface each residual-gap question with **options + reasoning + a recommendation**, then STOP and let the user answer. But:

> **An AI-recommended answer stays counted *against* the score. Only a user-authored answer, or the user's own rating, raises the number.**

This severs "the user nodded at my guess" from "verified." A nod at an AI-supplied answer is not confirmation of *your* experience — it is the user being agreeable. Mark each answered question `[answered by: user | AI-guess=counts against]`.

**Turn 2 — the rating.** Only after the questions are answered, ask the user to rate the paraphrase (0–10): "How well did that capture *your* experience?" STOP and wait for the **typed** number.

```
score = min(ai_selfscore, user_score)
verified ⟺ score ≥ 8
```

Print `min(ai, user)` **only** with the user's typed number. No typed rating on its own turn ⟹ the unit stays `UNVERIFIED` — never fabricate a "user N".

---

### Step 4 — Overshoot (LIVE input only)

Deliberately paraphrase **past** the stated position — **explicitly labeled a stress-test** — and **name the axis** you are testing:

> "Stress-test (reject the axis if it's wrong): I'm assuming the live variable is *cost*, not *trust*. Pushing that: you'd walk even if the price halved — true?"

Naming the axis lets the user reject the *dimension*, not just the magnitude.

- The user's **independent restatement** locates the real position.
- **Silence or bare assent = NO signal → stays UNVERIFIED.** Never read a shrug or a "yeah I guess" as confirmation.
- **On async / recording input: overshoot is DISABLED — sharp paraphrase only.** There is no live user to snap an overshoot back, so an unsnapped overshoot would just plant a false position.

---

### Step 5 — Anti-point seal (optional; propose at high stakes; LIVE only)

Construct the **near-miss anti-point**: the reasonable-person inverse *closest* to the point that still genuinely inverts it — **not a strawman**. In the natural language of someone who holds the opposite belief (not ClarityPledge terminology, no hedge words — those open reinterpretation escapes).

Run the **interpretation-flip / devil's-advocate test** (`create-letter-from-transcript.md:74`; `docs/definitions.md:406-416`): can someone agree with the anti-point AND, after reading the story, still hold it by reinterpreting the wording? If yes, the anti-point is too loose — tighten it. The seal passes only when the anti-point cannot be reinterpreted into compatibility with the story.

- **Seal passes only against a recorded real user `strongly_disagree`.** Async → `proposed, unconfirmed`.
- "Perfectly captured" = **one story explains both** the point (`strongly_agree`) and its anti-point (`strongly_disagree`).

---

### Step 6 — Take a position (labeled), with an inverted bar and a refuse-floor

- **Inverted bar:** agreeing with the user's high-stakes position requires **the same-or-higher** verified comprehension as disagreeing. Cheap agreement is the default failure, so agreement is the *harder* position to take, not the easier one.
- **Refuse-floor (the one thing this design blocks):** for the irreversible / ALWAYS-ASK class, below a comprehension floor the AI **refuses** to state a position and names exactly what it needs. Output `REFUSED: needs X`.
- **Permission modes:**
  - **(a)** it understands the story (min-verified ≥8) → may state a position;
  - **(b)** it asks permission given current min + paraphrase;
  - **(c)** after the user grades it;
  - **(d)** the user overrides — **and (d) requires the user to type the specific gap being overridden**: `proceeding without: <open question>`. The reflex cannot skip it by nodding.
- Any position without min-verified comprehension is labeled `UNVERIFIED`. **Reactions are allowed — just labeled.** The gate is a *visible gap*, not a wall — except the one hard refuse-floor.

---

## Output template (terminal)

```
ALIGNMENT UNIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Point (content): [distilled claim]   type: [decision|assumption|hypothesis|problem-statement|reasoning]
Source: [date · corpus · conversation]   Quote: "[verbatim]"
High-stakes: [trigger a/b/c] · stakes [K/100] = [rev+blast+why+latency ×2.5]  (if wrong: [future ⟂ future])   [user-confirmed]
Comprehension: min(ai 7, user 5) = 5/10   [UNVERIFIED]   (≥8 ⟹ verified)
Story (parent): …
User position on the point: strongly_agree (+3)
  Anti-point (seal): …         [passed vs recorded strongly_disagree | proposed, unconfirmed]
Open questions (all printed; AI-recommended answers do NOT raise the score):
  1. … → options a) … b) …  (rec: …)   [answered by: user | AI-guess=counts against]
  2. …
AI position on the point: [agree | disagree]   [verified | UNVERIFIED | REFUSED: needs X]
Override (mode d, if used): proceeding without: <open question the user typed>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Calibration ledger (append one line per run)

After every run, silently append one line to `.private/logs/align-calibration.log` (create the dir if missing: `mkdir -p .private/logs`):

```
<ISO-timestamp> | fired:<gate|manual> | min:<K/10> | verified:<yes|no> | overridden(d):<yes|no> | refused:<yes|no>
```

This keeps **detector-misses and override-frequency reviewable** rather than invisible — the cheapest persistence, no product/DB change. It is the raw material for the go/no-go blind backtest. Never surface this write to the user; one silent line, then continue.

---

## Reuse map (do not reinvent — these primitives already exist)

| Need | Reuse | Source |
|---|---|---|
| Position scale + labels (−3..+3) | `POSITION_LABELS` / `POSITION_VALUES` | `src/app/types/index.ts:972-1004`; `docs/definitions.md:392-402` |
| Comprehension 0–10, ≥8 verified, two-sided + Min Principle | threshold + assessment | `docs/definitions.md:280-304,438-442`; `docs/decisions.md:716,2928` |
| Anti-point + the mandatory interpretation-flip test | existing skill + decision | `content/create-letter-from-transcript.md:74`; `docs/definitions.md:406-416` |
| Story→point parenthood, story-vs-point distinction | definitions | `docs/definitions.md:280-304`; `content/sifter-definitions.md` |
| Interactive-loop structure | mirror | `content/interview.md` |
| Reversibility classes for the gate + refuse-floor | ALWAYS-ASK list | `CLAUDE.md` "Decisive Action — Reversibility classifier" |

---

## Quality Gates (Agent Self-Review — before printing an ALIGNMENT UNIT)

- [ ] **Candidate classified + scored (Step 0/1).** Each surfaced point carries a `type` (decision/assumption/hypothesis/problem-statement/reasoning), a distilled `content`, an `if-wrong` divergence line, and a `stakes` score shown as its four-factor breakdown (reversibility + blast + wrong-why + latency ×2.5) — not a bare number or "this is high-stakes." One point per unit.
- [ ] **Verbatim quote + locatable source cited (Step 1).** Every candidate carries a `source` (date + corpus + conversation) and a separate `quote` field with the *verbatim* user text — never a paraphrase, never an agent synthesis. No citable quote ⟹ the candidate is an invention; drop it. `content` is flagged as the agent's distillation for the user to verify against `quote`.
- [ ] **Point user-confirmed (Step 1).** The named card was confirmed (or corrected) by the user on a separate turn before recovery began. Inferred-and-proceeded ⟹ stop, the comprehension is against a strawman.
- [ ] **Story recovered, not authored (Step 2).** The "why" was elicited from the user, not written for them to nod at; `sifter-story`'s point-seeded persuasive mode was NOT used.
- [ ] **Separate-turn gate (Step 3b).** The open questions AND the rating were each answered by the user on distinct turns — the agent did not self-answer either and proceed. No typed rating ⟹ `UNVERIFIED`; never a fabricated "user N".
- [ ] **No self-certification.** If the unit says `verified`, a `user_score` was personally typed by the user this run. AI-only ⟹ `UNVERIFIED`, no exception.
- [ ] **Min, not average.** The printed score is `min(ai, user)` — the lower number, never the mean.
- [ ] **All open questions printed.** No pre-filtering of "important" vs "minor" by the AI.
- [ ] **AI-guessed answers counted against**, not for, the score; each answer tagged with its author.
- [ ] **Overshoot only on live input**; disabled for async/recording. Silence ≠ confirmation.
- [ ] **Inverted bar honored:** agreement did not clear a *lower* comprehension bar than disagreement.
- [ ] **Refuse-floor honored** for the irreversible class — `REFUSED: needs X` rather than a low-comprehension position.
- [ ] **Override (d) requires typed gap** — not a nod; the `proceeding without: …` line is present when mode (d) was used.
- [ ] **v1 scope held** — terminal output only; nothing built to leave to a second human.
- [ ] **Ledger line appended** to `.private/logs/align-calibration.log`.

If any gate fails, fix the unit before showing it. A rubber-stamp unit is the exact failure this skill exists to prevent.

---

## What this is NOT

- **Not a way to reach agreement faster** — it makes agreement *harder* than disagreement (inverted bar), on purpose.
- **Not a self-scoring tool** — the AI cannot move the number alone.
- **Not `/falsify`** (tests a proposal before acting) and **not `/adversarial-review`** (breaks a finished artifact).
- **Not a transmission channel** in v1 — no letters, no multi-party, no client package. The AI is the instrument; the humans hold the positions.

---

## Related Skills

- `/slava:think:falsify` — test a proposal against first principles before acting (upstream of a decision, not a comprehension check).
- `/slava:think:adversarial-review` — red-team a concrete artifact for failure modes.
- `/slava:content:interview` — open story extraction with no position at stake (structural sibling for the loop).
- `/slava:content:create-letter-from-transcript` — source of the anti-point + interpretation-flip test this skill reuses.
