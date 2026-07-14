---
name: align
description: "Interactive alignment protocol — before the AI agrees or disagrees on a high-stakes point, it makes its comprehension of the story behind your position legible and keeps any residual gap visible. The AI can never self-certify understanding."
when_to_use: "Invoke (or auto-propose) when about to agree with/endorse, disagree with/recommend on, or take an irreversible-class action on a consequential point — where being confidently wrong about WHY you hold your position would cause real harm. NOT for low-stakes reactions, brainstorming (that's /interview), testing a proposal before acting (/falsify), or red-teaming a finished artifact (/adversarial-review)."
version: 1.7.0
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
- **Roles are flipped vs the product.** In /live the reader self-rates and the author confirms. Here the **AI is the listener self-rating**, and **you are the author confirming your experience was captured.** Same ≥8 gate, same Min Principle (`docs/definitions.md` §"Verification Threshold"; `docs/decisions.md` — the `/align` founding decision, "Min Principle").

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

**Loop order (read once — the sequence is load-bearing):**
1. **Detect** — spot the candidate (checklist trigger) and estimate the stake as a **potential loss in money/time**.
2. **Confirm the stake (1→2 gate)** — user confirms or corrects the quantified stake. **The agent does not move until this lands.**
3. **Enrich** — harvest what the user already answered in the record (Step 2a); assemble the story-so-far from their own quoted words.
4. **Open questions** — only the *residual* gaps, and only **after** enrichment. Never before the stake is confirmed.
5. **Rate (min)** — user's typed 0–10 on how well their experience was captured; `min(ai, user)`.

> **Naming clash to kill:** the **decomposer** (story-ness/point-ness axes) is the *deferred* Stage-2 capability and is **NOT** required for open questions. Story recovery + open questions run without it. Do not block recovery on "we haven't built the decomposer."

### Step 0 — High-stakes gate (closed checklist triggers; potential-loss estimate measures)

Do **not** rely on a holistic sense that "this feels important" — that sense is exactly what sleeps during the silent-lull failure. Two moves: the checklist says *whether* a point is a candidate; the divergence score says *how* high-stakes it is.

**Trigger family** — a point becomes a candidate if ANY item matches:

- **(a)** About to **agree with / endorse** a stated position on something that would be acted on. *(This is first on purpose — cheap agreement is the default failure mode.)*
- **(b)** About to **disagree / recommend** on a consequential fork.
- **(c)** Any **ALWAYS-ASK / irreversible-class** action (per the CLAUDE.md "Decisive Action — Reversibility classifier": push, deploy, send, DELETE/DROP, merge, publish, etc.).

**High-stakes is a magnitude, not points — estimate the potential LOSS if the WHY is misread, as time AND money.** Do **not** emit a 0–100 score. Estimate the **time** at risk (hours/weeks/months, actual or opportunity) **and convert it to money** — *time lost is money lost*. Convert via the user's rate/worth; if you don't have it, **assume from their location/role and state the assumption** so they can correct it. Add any direct money at stake on top. That magnitude is the agent's estimate, and it exists to be **confirmed or corrected by the user** — the confirmation is the 1→2 gate (Step 1) and the feedback signal that tells us whether the high-stakes read was any good.

To size the estimate, reason over these **lenses (not a formula)** — they shape the magnitude, they are not the output:
- **reversibility** — irreversible loss counts at full weight; recoverable loss is discounted.
- **blast radius** — how much downstream (money, mission, other decisions) rides on it.
- **wrong-WHY likelihood** — how easily the why is misread; an internally *contradictory or confused* why pushes this up.
- **detection latency** — a silently-wrong foundation bleeds more before anyone notices.

**Contradictions / confusion / inconsistency** in the record are **not** a detection-blocker. They do two things: (1) *raise* the potential-loss estimate (an unstable why widens the outcome spread), and (2) become **open questions in enrichment** ("you said X in ‹src›, Y in ‹src› — which holds?"). They belong to the enrichment stage, surfaced as gaps — never silently resolved by the agent.

**On one or more candidates:** surface them via the Step 1 card, ranked by estimated loss, and propose the highest one for confirmation (Step 1). **Manual invoke is always available** (the user typing `/align` skips the trigger — but still classify + estimate the loss so the user sees the magnitude they're signing up for). This checklist is the seed of the future always-on CLAUDE.md rule — do not codify it there until the backtest (incl. false-positives) passes.

**Feedback loop (bounded).** When the user corrects a classification or the loss estimate, treat it as a rubric-improvement signal: adjust the wording/lenses here, then *re-run detection on the same material* to see if the corrected rubric now lands. Scoped to Stage-1 detection only — it does **not** pull in the two-axis point-ness/story-ness scoring, which stays deferred and untested.

---

### Step 1 — Surface candidate(s) as classified cards, USER CONFIRMS ONE (blocking gate)

Interaction is **point-first** (the claim is what's visible). Logical parenthood is **story → point** (`docs/story-point-model.md`). You verify understanding of the *story*, not the *point* (points are just claims; stories enter the comprehension protocol).

Emit each candidate as a **classified card** — the user cannot confirm a target they can't see clearly, and a vague "the point" is what let comprehension get verified against a strawman. The card has four fields, and only four:

```
CANDIDATE ‹n›
  type:       decision | assumption | hypothesis | problem-statement | reasoning | other
  stake:      ‹time AND its money value — e.g. "~4 months ≈ €24k of your time"›
  content:    ‹the candidate's claim distilled to fewest words — AGENT's compression, user verifies›
  source:     ‹readable relative date, e.g. "3 days ago"› · ‹corpus›
  evidence:   "‹verbatim text the USER actually wrote/said›"
  reasoning:  ‹plain-prose: how you reasoned to that stake — why the time/money is that big›
```

- **type** classifies the *speech act*, because a decision, an assumption, and a hypothesis fail differently when misunderstood — the class tells you what kind of harm a wrong-WHY produces.
- **stake** comes right after type — it's the headline. **Always time AND money: time lost is money lost.** Convert the time at risk into money via the user's rate/worth; if you don't have it, **assume from their location/role and state the assumption inline** so they can correct it (e.g. "assuming ~€6k/mo of your time"). No inline "why" here — that lives in `reasoning`.
- **content** is the agent's *distillation of the evidence* — the claim in fewest words, flagged as the agent's compression so the user can catch words welded on that they never said. The user verifies `content` against `evidence`.
- **source** is *where it came from*, minimal: a **human-readable relative date** ("3 days ago", "last month") and the **corpus** (this Claude Code session | claude-conversations). Don't clutter with the conversation title — keep it retrievable so the user can say "expand that" and you pull the surrounding transcript, but the headline is just date + corpus.
- **evidence** is the **anti-hallucination anchor for detection** — the *verbatim* user text, never a paraphrase. If you cannot cite a real quote the user actually wrote/said, you do not have a candidate — you have an invention. (Detection-side twin of the live-user-turn anchor Step 3b rests on.)
- **reasoning** is plain readable prose explaining **why the stake is that size** — how the misread-WHY translates into that much time/money. This is where the divergence lives; write it as a normal statement, not a cryptic `future ⟂ future`.
- Rank multiple candidates by **stake** (money), highest first.

Then **STOP and ask the user to confirm ONE** target **AND its quantified stake**, on their own turn. Offer a **3-way choice** (an explicit lower option beats an open "confirm or correct" — it makes disagreement cheap to voice instead of nudging a rubber-stamp):

> "Running /align on **CANDIDATE ‹n›**. Pick one:
> **1.** Confirm the stake — **‹time ≈ €money›**.
> **2.** Lower — **‹a somewhat lower time ≈ €money›** (the agent proposes a concrete smaller figure, not a blank).
> **3.** Your own number.
> Also correct the content/type if off."

Expect one of the three. The chosen/typed number becomes the stake.

**This is a blocking gate — the 1→2 gate.** The agent **does not move to enrichment until the user confirms or corrects the quantified stake.** A rejected estimate is not a dead end: the user states what *they* think is at stake (money/time) and that becomes the number. This confirmed-stake turn is the feedback signal that grades the high-stakes read. Silence, inference, or self-answering the confirmation ⟹ do not proceed. One point per unit.

---

### Step 2 — Recover the parent story (rigorous inline; NOT a persuasive re-story)

Once the point is user-confirmed, recover the **lived experience behind it** — the "why" — through a rigorous inline procedure. Do **not** call `sifter-story`'s point-seeded mode: that mode is *generative-persuasive* — it builds a story that SUPPORTS the point, which would make /align manufacture a justification and call it "the user's why." That is the rubber-stamp this skill blocks.

**Step 2a — Harvest already-answered material FIRST (do not re-ask what the record answers).** A candidate never arrives out of the blue — the source conversation, and related ones, already carry the user's reasoning. Before asking anything, harvest the WHY and assemble the **story-so-far from their own words** — each piece *quoted and cited to source*, never paraphrased into an AI synthesis. **This assembly is INTERNAL — do not surface the raw quote-list to the user; it feeds your first-person paraphrase (Step 3a), it is not an output.**

**Harvest corpus — search ALL of these, not just the source chat (the #1 failure is a too-narrow harvest):**
- this Claude Code session + `claude-conversations` (where the raw WHY is voiced);
- **`docs/decisions.md` + `docs/goals.md`** — the CP decision logs, *where answered questions get RESOLVED with dates* (the coaching-bridge, tripwire, pricing, positioning answers all live here, not in the brain-dump chat);
- **`pp/docs/decisions.md`** (`~/Projects/private/personal/docs/decisions.md`) when the candidate has a **personal / psychological / financial** dimension — the money/worth/runway/motivation answers live here. *(pp is private — cite by date + title, never copy its text into any public doc or artifact.)*

**Answered-check gate (MANDATORY before surfacing any question).** For each question you are about to ask, grep the harvest corpus above for its subject. Classify it:
- **ANSWERED** → do **not** ask it. State the answer + citation (date + doc/title) in your Step-3a paraphrase, and *fold it into the story* — it is recovered material, not a gap.
- **STALE-ANSWERED** (the record shows the decision *evolved* past what the evidence quote says) → surface it as a **candidate-staleness flag at the 1→2 gate**, not as a comprehension question. The user re-confirms the *current* form of the point before recovery continues.
- **GENUINELY OPEN** (no resolution in any log) → it becomes a Step-3 question — **and it must state what the record DID establish nearby and why the gap is still meaningful** (never a bare open-ended prompt). "We settled X and Y; what's unresolved is the Z between them, because …".

A question that fails this check — asked when the log already answers it — is the harvest-dimension rubber-stamp this whole step exists to prevent. Re-asking an answered question is not neutral; it tells the user you did not read the record.

**Candidate-staleness check.** Before recovery, confirm the candidate's `content`/`evidence` is still the user's *current* position: grep the decision logs for a later entry that supersedes it (a changed price, a reframed offer, a resolved fork). If the point moved, say so at the 1→2 gate — running comprehension against a superseded point verifies understanding of a position the user no longer holds.

- The harvested pieces are the user's verbatim words with citations — this stays inside "recover, never author": you are surfacing what they said, not manufacturing it.
- Harvesting still does **not** self-certify: the user must confirm the assembled story captures their experience (the rating, Step 3b). It speeds recovery; it does not replace the user's turn.

**Step 2b — Elicit the residual gaps** using the NVC *steps* (observation → feeling → need → the concrete episode), **elicited from the user, not authored for them**:

- Ask for the **specific episode** that seeded the point ("when did you last hit this — what happened?"), not an abstract rationale.
- Draw out **observation** (what concretely occurred), **feeling**, and the **underlying need** — in the user's terms.
- **Recover, never supply.** If you find yourself writing the story *for* the user to nod at, stop — a nodded-at AI story is not their lived experience. Missing pieces become open questions in Step 3, not authored fills.

Then proceed to Step 3 with whatever the user gave you — gaps stay visible as open questions.

---

### Step 3a — AI paraphrases the story back + self-estimates (one side only)

Paraphrase the story back **in the first person, as if the user wrote it** — "I…", never "You…". It is *their* lived experience; writing it in second person turns it into your description of them instead of their voice. Use their own words/quotes where you have them. Then state a self-estimate:

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

Run the **interpretation-flip / devil's-advocate test** (`create-letter-from-transcript.md:74`; `docs/definitions.md` §"Position Flip vs Interpretation Flip"): can someone agree with the anti-point AND, after reading the story, still hold it by reinterpreting the wording? If yes, the anti-point is too loose — tighten it. The seal passes only when the anti-point cannot be reinterpreted into compatibility with the story.

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
Source: [readable date · corpus]   Evidence: "[verbatim]"
High-stakes: [trigger a/b/c] · stake [~time ≈ €money]   [stake user-confirmed]
Reasoning: [plain-prose why the stake is that size]
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
| Position scale + labels (−3..+3) | `POSITION_LABELS` / `POSITION_VALUES` | `src/app/types/index.ts:972-1004`; `docs/definitions.md` §"Position Scale (7-point Likert)" |
| Comprehension 0–10, ≥8 verified, two-sided + Min Principle | threshold + assessment | `docs/definitions.md` §"Verification Threshold", §"Comprehension Assessment"; `docs/decisions.md` — `/align` founding decision ("Min Principle") |
| Anti-point + the mandatory interpretation-flip test | existing skill + decision | `content/create-letter-from-transcript.md:74`; `docs/definitions.md` §"Position Flip vs Interpretation Flip" |
| Story→point parenthood, story-vs-point distinction, the two axes | model doc | `docs/story-point-model.md` |
| Interactive-loop structure | mirror | `content/interview.md` |
| Reversibility classes for the gate + refuse-floor | ALWAYS-ASK list | `CLAUDE.md` "Decisive Action — Reversibility classifier" |

---

## Quality Gates (Agent Self-Review — before printing an ALIGNMENT UNIT)

- [ ] **Candidate classified + stake quantified (Step 0/1).** Each surfaced point carries a `type`, a `stake` in **time AND money** (time converted via the user's worth; assumption stated if unknown — not 0–100 points), a distilled `content`, and a plain-prose `reasoning` for the stake size. One point per unit.
- [ ] **Stake confirmed before enrichment (1→2 gate).** The user confirmed or corrected the quantified stake on a separate turn before any enrichment/open-questions began. Open questions came AFTER enrichment, never before the stake was confirmed. Agent-proceeded-without-confirmation ⟹ stop.
- [ ] **Verbatim evidence + readable source cited (Step 1).** Every candidate carries a `source` (readable relative date + corpus) and a separate `evidence` field with the *verbatim* user text — never a paraphrase, never an agent synthesis. No citable quote ⟹ the candidate is an invention; drop it. `content` is flagged as the agent's distillation for the user to verify against `evidence`.
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
