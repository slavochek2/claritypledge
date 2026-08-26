---
name: align
description: "Interactive alignment protocol — before the AI agrees or disagrees on a high-stakes point, it makes its comprehension of the story behind your position legible and keeps any residual gap visible. The AI can never self-certify understanding."
when_to_use: "Invoke (or auto-propose) when about to agree with/endorse, disagree with/recommend on, or take an irreversible-class action on a consequential point — where being confidently wrong about WHY you hold your position would cause real harm. NOT for low-stakes reactions, brainstorming (that's /interview), testing a proposal before acting (/falsify), or red-teaming a finished artifact (/adversarial-review)."
version: 2.1.0
---

# /align

Run the verify-before-position loop: surface the point, recover the parent story, make the AI's comprehension of your lived experience an honest number, and keep any gap visible instead of papering over it with a confident agree/disagree.

**This file is the orchestrator.** Detection lives in `/slava:think:align-detect` and is invoked as-is, never reimplemented here. Recovery and verification are still inline (see `## The chain`).

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
| Just surface what's high-stakes in a corpus (incl. someone else's transcript), no loop | `/slava:think:align-detect` |
| The remedy is a paraphrase **filed for the experience owner to score in the product**, not a live loop | `/slava:think:align-decompose` → `/slava:think:align-create-letter` |
| Test a proposal against first principles *before* acting | `/slava:think:falsify` |
| Red-team a finished artifact (diff, design, shipped policy) for failure modes | `/slava:think:adversarial-review` |
| Dig for a founder story through open Q&A (no position at stake) | `/slava:content:interview` |
| Extract a point / story as a discrete sub-step | `/slava:content:sifter-point`, `/slava:content:sifter-story` |

---

## v1 scope (do not exceed)

**In:** the interactive reasoning loop, run in-conversation against a **live** interlocutor (Slava himself, or a person present in the chat), output to **terminal only**.

**Out (deferred — refuse and name the boundary if asked):** letters to third-party stakeholders; multi-party transmission; a client-installable package; DB persistence; the always-on CLAUDE.md behavior rule (only *after* the backtest proves the loop); auto-firing without confirm; heavy bulk-extraction subagents.

> **No artifact leaves the terminal to a second human in v1.** If the run produces something meant to be *sent* to someone else, stop — that is out of scope until the blind backtest passes.

**Carve-out, stated so it does not read as a breach: the reverse-story route (`/align-decompose` → `/align-create-letter`) files a real letter and real DB rows, and it does not cross this line.** Two reasons, both narrow. **(a) There is no second human.** The letter goes from the agent to the person already in the conversation, about his own experience — the recipient is the interlocutor, not a third-party stakeholder, which is the case the prohibition names. **(b) It is not this file's loop.** Those skills carry their own gates and their own scope; `/align` neither invokes them nor inherits their permissions. The prohibition above continues to bind everything in *this* file: `/align` itself still emits to the terminal and persists nothing but `.private/` run state. If a future route would send to someone who is **not** in the conversation, that is the boundary — stop and name it.

**Run-file carve-out.** `.private/align/runs/{slug}.md` holds **one run's working state** so a multi-stage run survives leaving the conversation. It goes to no second human (`.private/` is gitignored), so the transmission prohibition above does not reach it. The prohibition that *does* apply: an **index, a cross-run query, or anything reading across `.private/align/runs/`** is the persistent decision store frozen by [decisions.md](../../../../docs/decisions.md) 2026-07-14 [product]. Do not build it.

---

## The loop

**Loop order (read once — the sequence is load-bearing):**
1. **Detect** — spot the candidate (checklist trigger) and estimate the stake as a **potential loss in money/time**. → delegated to `/slava:think:align-detect`.
2. **Gate 0 (align-target)** — who is this for? `NONE` / `future recipient` on a read-only third-party corpus ⟹ the cards were the deliverable, exit.
3. **Confirm the stake (1→2 gate)** — user confirms or corrects the quantified stake. **The agent does not move until this lands.**
4. **Enrich** — harvest what the user already answered in the record (Step 2a); assemble the story-so-far from their own quoted words.
5. **Open questions** — only the *residual* gaps, and only **after** enrichment. Never before the stake is confirmed.
6. **Rate (min)** — user's typed 0–10 on how well their experience was captured; `min(ai, user)`.

### The chain

Stages are **invoked as-is, never reimplemented here**. A stage failure stops the chain; a re-run resumes from the failed stage forward.

| Stage | Arg | Reads | Writes | Human gate after |
|---|---|---|---|---|
| `/slava:think:align-detect` | corpus path or run-slug | the corpus | run file §Run, §Candidates | **Gate 0**, then **Gate 1→2** |
| Steps 2–3a (recovery + decomposition) — **inline, not extracted** | — | run file §Confirmed | §Story, §Decomposition | angle pick, then Step 3b |
| Steps 3b–5 (verification + seal) — **inline, not extracted** | — | §Decomposition | §Verification | Step 6 |

**A second route exists downstream of the same pick, and this file does not run it.** Where the remedy is a paraphrase *filed for the experience owner to score in the product* rather than a loop worked through live, the pick goes to two sibling skills instead of to Steps 2–6 here:

| Sibling | Arg | Reads | Writes | Human gate after |
|---|---|---|---|---|
| `/slava:think:align-decompose` | run-slug or candidate number | run file §Candidates + the corpus | §Story, §Decomposition — **`.private/` only, no network write** | approve / reject |
| `/slava:think:align-create-letter` | run-slug | §Decomposition | **PROD**: story, points, doc, letter, sealed snapshot | — (it is the end of that route) |

> **References, not invocations — this file never calls either of them.** Composite skills do not call sub-skills; elicitation procedure is inlined per skill, never shared by invocation ([decisions.md](../../../../docs/decisions.md) 2026-08-06 [process]). These two rows are a pointer for a human reading the chain, in the same form `align-detect` occupies above. Do not read them as wiring.
>
> **Why the two are separate files** is the same reason the gate below is a gate: `align-decompose` is re-runnable and writes nothing outside `.private/`; `align-create-letter` writes to prod once per run. Making the approval a **skill boundary** means no prod write can occur in the invocation that generated the text.

> **Gate ordering, stated explicitly** (it was ambiguous while everything lived in one file): **detect runs FIRST**, then Gate 0, then Gate 1→2. Gate 0 cannot precede detection — it reads `align-target`, a field the candidate card produces. "Gate 0 first" means *first among the gates*, not first in the run.

> **Naming clash to kill:** the **decomposer** (story-ness/point-ness axes) is the *deferred* Stage-2 capability and is **NOT** required for open questions. Story recovery + open questions run without it. Do not block recovery on "we haven't built the decomposer."

---

### Step 0/1 — Detect candidates → `/slava:think:align-detect`

Invoke it. It declares the SUBJECT (blocking), applies the closed trigger checklist, estimates each candidate's potential loss in **time AND money**, and emits ranked classified cards anchored to verbatim subject evidence — writing `## Run` + `## Candidates` to `.private/align/runs/{slug}.md` and a ledger line on every exit.

It **reports** `align-target` as a card field; it does **not** gate on it. The gating below is this file's job.

Manual invoke of `/align` still runs detection first — classify and estimate before anything else, so the user sees the magnitude they are signing up for.

### Step 1 — Gates: confirm WHO, then confirm the STAKE

Detection has printed the ranked cards. Two blocking gates now run, **in this order**. Neither can precede detection — both read fields the cards produce.

#### Gate 0 — the align-target gate (first of the two gates, before the stake gate)

**Confirm *for whom* this is being done before recovering anything.** `/align`'s domain is high-stakes decisions where **a counterparty's comprehension matters** — without one, filing a story + point + min-rating is effort an agent's plain analysis would do more cheaply. So the cheapest filter runs first: it can retire the whole case before you quantify stakes.

> "Before we align — **who is this for?** I read the align-target as **‹target, or NONE›**. Confirm, correct, or add a stakeholder I missed."

- **A real align-target** → confirm the **channel** (Clarity Letter for a partner; a call for a contractor like a lawyer; etc.), then proceed to the stake gate.
- **NONE** → say so: *"There's no one whose comprehension this needs — so this is solo analysis, not an alignment case. `/align` is likely the wrong tool; want me to just analyze it plainly instead?"* Do **not** grind the story/point/min loop on a no-counterparty case. A high-stakes **state you're only waiting on** (an external process, a decision that's already been made and handed off) typically has no align-target — detect it, but don't force the loop.
- **`future recipient`, or NONE on a read-only third-party corpus** → **the cards ARE the deliverable. Exit successfully here.** Say: *"Detection is complete — ‹N› candidates ranked. The subject isn't in this conversation, so there is no comprehension to verify and no stake for you to confirm on their behalf. Stopping."* This is a **complete run, not an abort** — corpus triage is a supported first-class mode (`/slava:think:align-detect` standalone is the same thing without this file). Ledger it `exit:gate0-cards-only`.

#### Gate 1→2 — the stake gate (second)

Then **STOP and ask the user to confirm the quantified stake**, on their own turn. Offer a **3-way choice** (an explicit lower option beats an open "confirm or correct" — it makes disagreement cheap to voice instead of nudging a rubber-stamp):

> "Running /align on **CANDIDATE ‹n›**. Pick one:
> **1.** Confirm the stake — **‹time ≈ €money›**.
> **2.** Lower — **‹a somewhat lower time ≈ €money›** (the agent proposes a concrete smaller figure, not a blank).
> **3.** Your own number.
> Also correct the content/type if off."

Expect one of the three. The chosen/typed number becomes the stake.

**This is a blocking gate.** The agent **does not move to enrichment until the user confirms or corrects the quantified stake.** A rejected estimate is not a dead end: the user states what *they* think is at stake and that becomes the number. This confirmed-stake turn is the feedback signal that grades the high-stakes read. Silence, inference, or self-answering the confirmation ⟹ do not proceed. One point per unit.

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

### Step 3a — Present the full decomposition TOGETHER (validate as a whole), then self-estimate

Show the decomposition as **one block**, not drip-fed — the user cannot validate a decomposition they can't see whole (is the "story" actually a story, or a smuggled point? is the anti-point a real inverse, or a strawman?). This is the "surface decompose→together" decision applied to the UX ([decisions.md](../../../../docs/decisions.md) 2026-07-13 [process]). Present, in one view:

- **POINT** — the confirmed claim as a falsifiable mechanism/stance (from Step 1).
- **STORY** — the recovered why, **in the first person, as if the user wrote it** ("I…", never "You…"; use their own words/quotes). It is *their* lived experience; second person turns it into your description of them.
- **ANTI-POINT** — the **near-miss inverse** of the point (reasonable-person opposite, closest to the point that still genuinely inverts it — NOT a strawman; natural language of someone who holds the opposite, no hedge words). Shown here so the user can judge it against the story; the interpretation-flip **seal-test** on it is Step 5.
- **OPEN QUESTIONS** — residual gaps ONLY (survivors of the Step-2a answered-check), each stating *what the record already established* + *why this gap is still open*, with options + a recommendation.
- **self-est N/10 · UNVERIFIED**

**Angle transparency (the point/anti-point selection is a founder call, not a silent one).** A single story affords **multiple** points — and *which* one to decompose around depends on **which risk/effect matters**. Do not pick one silently. Surface the **2-3 candidate angles**, each labeled with the **risk/lens it targets**, and let the user pick the crux:

> "This story supports more than one point. The angles I see:
> **(a)** ‹point/anti-point› — targets the risk that ‹…›
> **(b)** ‹point/anti-point› — targets the risk that ‹…›
> **(c)** ‹point/anti-point› — targets the risk that ‹…›
> I'd decompose around **(a)** because ‹why it's the crux›. Which is the real crux for you?"

Selecting the angle is where the leverage is; making it visible is the difference between aligning on *your* crux and aligning on the one the agent happened to pick.

Then invite the user to **validate and refine any part** — "is the story yours, is the point the real claim, does the anti-point genuinely invert it?" Refining the decomposition is **not** the score; the score is a separate, later beat (Step 3b Turn 2) and grades experience-capture, not packaging.

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

**Turn 2 — the rating.** Only after the questions are answered — and after any decomposition refinement from Step 3a — ask the user to rate the paraphrase (0–10): "Rate **only whether I captured your experience** (the story) — *not* whether the point/anti-point logic is tidy." STOP and wait for the **typed** number. (Keeping the rating scoped to comprehension is why the decomposition is validated separately: a tidy-logic nod is not an understanding score.)

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

The anti-point was already **constructed and shown** in the Step 3a decomposition block (the **near-miss inverse** — reasonable-person opposite, closest to the point that still genuinely inverts it, NOT a strawman, in the natural language of someone who holds the opposite, no hedge words). Step 5 is its **seal-test**, run after comprehension is rated.

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

## Calibration ledger (one line per STAGE, including aborts)

**Every stage that runs appends its own line on exit — complete, empty, or aborted.** Silently append to `.private/logs/align-calibration.log` (create the dir if missing: `mkdir -p .private/logs`):

```
<ISO-timestamp> | stage:<detect|loop> | subject:<slug> | fired:<gate|manual> | candidates:<N|-> | min:<K/10|-> | verified:<yes|no|-> | overridden(d):<yes|no|-> | refused:<yes|no|-> | exit:<complete|user-abort|gate0-cards-only|no-candidates|no-subject>
```

**Why per-stage, not per-run** (changed 2026-07-29): the previous "after every run" wording only fired on a *completed* run. The one run ever started never completed, so **the log was never written at all** in 16 days — the skill silently failed its own quality gate. A run that stops at Gate 0, or detects nothing, is still evidence about the detector, and it is the evidence this file exists to collect.

This keeps **detector-misses and override-frequency reviewable** rather than invisible — the cheapest persistence, no product/DB change. It is the raw material for the go/no-go blind backtest. Never surface this write to the user; one silent line, then continue.

---

## Reuse map (do not reinvent — these primitives already exist)

| Need | Reuse | Source |
|---|---|---|
| Position scale + labels (−3..+3) | `POSITION_LABELS` / `POSITION_VALUES` | `src/app/types/index.ts:972-1004`; `docs/definitions.md` §"Position Scale (7-point Likert)" |
| Comprehension 0–10, ≥8 verified, two-sided + Min Principle | threshold + assessment | `docs/definitions.md` §"Verification Threshold", §"Comprehension Assessment"; `docs/decisions.md` — `/align` founding decision ("Min Principle") |
| Anti-point + the mandatory interpretation-flip test | existing skill + decision | `content/create-letter-from-transcript.md:74`; `docs/definitions.md` §"Position Flip vs Interpretation Flip" |
| Story↔point link, story-vs-point distinction, the two axes, the unit of analysis | model doc | `docs/story-point-model.md` |
| Interactive-loop structure | mirror | `content/interview.md` |
| Reversibility classes for the gate + refuse-floor | ALWAYS-ASK list | `CLAUDE.md` "Decisive Action — Reversibility classifier" |

---

## Quality Gates (Agent Self-Review — before printing an ALIGNMENT UNIT)

- [ ] **Detection gates delegated, not duplicated.** Card classification, stake quantification and the verbatim-evidence anchor are `/slava:think:align-detect`'s gates and are checked there. One point per unit here.
- [ ] **Gate order honored:** detect → Gate 0 (align-target) → Gate 1→2 (stake). Gate 0 ran before the stake gate, and neither ran before detection.
- [ ] **Stake confirmed before enrichment (1→2 gate).** The user confirmed or corrected the quantified stake on a separate turn before any enrichment/open-questions began. Open questions came AFTER enrichment, never before the stake was confirmed. Agent-proceeded-without-confirmation ⟹ stop.
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
- [ ] **Ledger line appended for EVERY stage that ran** to `.private/logs/align-calibration.log` — including a Gate-0 cards-only exit, a no-candidates exit, and a user abort. A stage that ran and logged nothing is a failed gate.

If any gate fails, fix the unit before showing it. A rubber-stamp unit is the exact failure this skill exists to prevent.

---

## What this is NOT

- **Not a way to reach agreement faster** — it makes agreement *harder* than disagreement (inverted bar), on purpose.
- **Not a self-scoring tool** — the AI cannot move the number alone.
- **Not `/falsify`** (tests a proposal before acting) and **not `/adversarial-review`** (breaks a finished artifact).
- **Not a transmission channel** in v1 — no letters, no multi-party, no client package. The AI is the instrument; the humans hold the positions.

---

## Related Skills

- `/slava:think:align-detect` — stage 1 of this skill, invocable alone: corpus → ranked high-stakes cards, no counterparty needed.
- `/slava:think:align-decompose` — the other route downstream of a pick: one card → story + point + anti-point, reconstructed from the record rather than elicited, blocked by a recount gate. Writes nothing outside `.private/`. **Referenced, never invoked from here.**
- `/slava:think:align-create-letter` — files an approved decomposition as a private letter on prod, stamped so the experience owner is asked whether it captured *his* meaning. The only writer in the chain. **Referenced, never invoked from here.**
- `/slava:think:falsify` — test a proposal against first principles before acting (upstream of a decision, not a comprehension check).
- `/slava:think:adversarial-review` — red-team a concrete artifact for failure modes.
- `/slava:content:interview` — open story extraction with no position at stake (structural sibling for the loop).
- `/slava:content:create-letter-from-transcript` — source of the anti-point + interpretation-flip test this skill reuses.
