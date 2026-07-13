---
name: align
description: "Interactive alignment protocol — before the AI agrees or disagrees on a high-stakes point, it makes its comprehension of the story behind your position legible and keeps any residual gap visible. The AI can never self-certify understanding."
when_to_use: "Invoke (or auto-propose) when about to agree with/endorse, disagree with/recommend on, or take an irreversible-class action on a consequential point — where being confidently wrong about WHY you hold your position would cause real harm. NOT for low-stakes reactions, brainstorming (that's /interview), testing a proposal before acting (/falsify), or red-teaming a finished artifact (/adversarial-review)."
version: 1.1.0
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

### Step 0 — High-stakes gate (closed checklist, not open-ended "detect")

Do **not** rely on a holistic sense that "this feels important" — that sense is exactly what sleeps during the silent-lull failure. Pattern-match against this explicit list. The gate fires if ANY item matches:

- **(a)** About to **agree with / endorse** a stated position on something that would be acted on. *(This is first on purpose — cheap agreement is the default failure mode.)*
- **(b)** About to **disagree / recommend** on a consequential fork.
- **(c)** Any **ALWAYS-ASK / irreversible-class** action (per the CLAUDE.md "Decisive Action — Reversibility classifier": push, deploy, send, DELETE/DROP, merge, publish, etc.).

**On a match:** propose —
> "This is high-stakes because [checklist item + one line of why]. Run the alignment check?"

Proceed on confirm. **Manual invoke is always available** (the user typing `/align` skips the gate). This checklist is the seed of the future always-on CLAUDE.md rule — do not codify it there until the backtest (incl. false-positives) passes.

---

### Step 1 — Name ONE point, USER CONFIRMS it (blocking gate)

Interaction is **point-first** (the claim is what's visible). Logical parenthood is **story → point** (`docs/definitions.md:280-304`). You verify understanding of the *story*, not the *point* (points are just claims; stories enter the comprehension protocol).

**Name the single point this run targets** — one specific decision / assumption / hypothesis / problem-definition actually on the table right now, quoted or tightly paraphrased from what the user staked. Do **not** enumerate every candidate point (that drifts toward the deferred decompose-as-scoring architecture) and do **not** proceed on a point you inferred.

Then **STOP and ask the user to confirm the target**, on their own turn:

> "The point I'm running /align on: **‹point›**. Is that the one you staked? (confirm / correct it)"

**This is a blocking gate.** Recovery does not begin until the user confirms (or corrects) the named point on a separate turn. An unconfirmed target means comprehension is being "verified" against a strawman — the exact rubber-stamp failure this skill exists to prevent. Silence, inference, or self-answering the confirmation ⟹ do not proceed.

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
High-stakes: [checklist item (a/b/c) + why]
Comprehension: min(ai 7, user 5) = 5/10   [UNVERIFIED]   (≥8 ⟹ verified)
Story (parent): …
Point: …                       user position: strongly_agree (+3)
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

- [ ] **Point user-confirmed (Step 1).** The named point was confirmed (or corrected) by the user on a separate turn before recovery began. Inferred-and-proceeded ⟹ stop, the comprehension is against a strawman.
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
