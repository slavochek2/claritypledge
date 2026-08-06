---
name: align-detect
description: "Detection stage of /align — scan a corpus for one declared subject's high-stakes decisions, assumptions, hypotheses and problem statements, and emit them as ranked classified cards with a potential-loss estimate in time AND money. Runs standalone; no counterparty required."
when_to_use: "When you want the high-stakes items surfaced from a corpus (a meeting transcript, a session, a decision log) WITHOUT entering the comprehension loop. Also runs as stage 1 of /slava:think:align. NOT for verifying that understanding landed — that's the rest of /align."
version: 1.5.0
---

# /align-detect

Stage 1 of `/slava:think:align`, invocable on its own. Scan a corpus for **one declared subject's** high-stakes points and emit them as ranked, classified, evidence-anchored cards.

**The frame** (inherited from `/align`): the agent is a **transmission instrument between humans**, not a proxy holding a stance. Detection makes what is at stake *legible*; it takes no position on it.

**Announce at start:** "Running /align-detect."

**Standalone value is a recorded decision** — `docs/decisions.md` 2026-07-14 [product]: `/align` has two separable layers, and layer 1 (detection) "has real solo value with no counterparty." This file is that decision made mechanical.

---

## Input

- **Arg (one positional):** a corpus path, or an existing run-slug. Auto-detect which; if absent or ambiguous, **ask once**. (`.claude/rules/skills.md` — skills take no flags.)
- **Corpus:** a transcript file, this session, `claude-conversations`, `docs/decisions.md`, `docs/goals.md`, `pp/docs/decisions.md`. Read it **in full** — a hand-cut corpus tests your cutting, not the rubric.
- **Check the encoding first; size the corpus from the decoded text.** Run `file <path>`. If not UTF-8/ASCII — phone and Telegram recorders emit UTF-16 — decode before scanning (`iconv -f UTF-16 -t UTF-8`) and record the **decoded** path as the corpus. **A correctness rule, not a convenience one:** the byte count doubles so the size guard misfires, `grep -n` anchors used for `source:` break, and any `evidence` quoted from a raw read carries interleaved spacing — so the verbatim anchor no longer matches the corpus it claims to quote, **and every quality gate below still passes.** *(Evidenced: a UTF-16BE Telegram transcript, 281,502 B raw / 140,755 B decoded.)*
- **Requires — the SUBJECT / EXCLUDED / READER declaration (blocking).** Propose all three, then wait for the user to confirm or correct. Without it, do not proceed.

## Output

- **Prints:** ranked `CANDIDATE ‹n›` cards, highest stake first, plus a one-line detection summary.
- **Writes TWO artifacts** (they are different things — do not conflate them):
  1. **Run state** — `.private/align/runs/{slug}.md`, sections `## Run` and `## Candidates` only. Slug = `{subject}-{YYYY-MM-DD}`. Internal: stages, per-pass counts, dropped counts, verification notes. Creates from the schema below if absent; never touches downstream sections.
  2. **The deliverable** — `.private/align/runs/{slug}-brief.md`, written in the **READER's** voice. This is what a human actually reads. It carries no internal vocabulary, no dropped-counts, no per-pass bookkeeping — those belong to (1).
- **Ledger:** one line to `.private/logs/align-calibration.log` (format below) — **on every exit, including empty and aborted**.
- **Fails when:** no subject or reader can be resolved (asks, does not guess) · no candidate has citable verbatim evidence from the subject (**reports zero — never pads**). On failure it still writes the ledger line, and writes nothing to the run file.

---

## Step A — Declare SUBJECT, EXCLUDED and READER (blocking gate, FIRST)

Detection is always **about someone**, and it is always **for someone**. On a multi-party corpus, "high-stakes" is meaningless until you say *whose* stakes; and the cards are unreadable until you say who is reading them. Without the first, the trigger family below silently resolves against whoever is talking most — usually the wrong person. Without the second, the voice drifts between analyst-prose and second-person address inside the same card set.

**Propose all three, then STOP and let the user confirm or correct.** Guessing is expected — silence is not confirmation.

```
SUBJECT:   ‹whose decisions are being detected — name + speaker label or corpus identity›
EXCLUDED:  ‹whose turns are out of scope, and why›
READER:    ‹who these cards are written FOR — determines person, vocabulary and tone›
```

> "Reading this corpus I take the **subject** as ‹X›, **excluded** ‹Y›, and the **reader** as ‹Z›. Confirm, or correct any of the three."

**On SUBJECT:**
- Transcripts frequently carry unnamed labels (`Speaker 1`, `Speaker 2`). Resolve them to people before scanning; state the mapping back.
- The subject may be a **third party** — not in this conversation, not an align-target. Supported, first-class: the read-only corpus-triage mode, which exits after the cards.
- **Never infer the subject from turn count or from who sounds more decisive.**

**On READER — it sets person and vocabulary, and it is NOT the same as `align-target`.** (`align-target` = whose comprehension the *decision* needs. `READER` = who is reading *this artifact*. They frequently differ.)

| READER | Person | Vocabulary | v1 status |
|---|---|---|---|
| **the analyst**, absent from the corpus | third — "he/she/they", name on first use | internal terms fine | in scope |
| **the analyst, who is also a speaker** — peer conversation, negotiation, brainstorm | third for the subject; **never first person for yourself** — you are an EXCLUDED speaker, not a character in the cards | internal terms fine | in scope. Your own turns stay excluded even where the corpus is *about* your work. If you want **your** stakes, re-run with SUBJECT = you; never mix the two in one run. |
| **the subject themself** | **second — "you"** | strip all internal terms: no "align-target", no "candidate", no "trigger family" | in scope to *write*; see boundary below |
| the subject's counterparty | third, and far heavier care | strip internal terms | **not in v1** |

- **Use the pronouns the user states.** If they haven't been stated, use they/them — never infer them from a name.
- **Voicing is not sending.** Writing cards addressed to the subject is a rendering decision. Whether the artifact ever *reaches* a second human stays gated by `/slava:think:align`'s v1 scope. Render freely; transmit never, in v1.
- When READER = the subject, the cards describe their own words back to them, sometimes unflatteringly. Stay in their language, quote rather than characterize, and let the evidence carry the weight.

**Treat single-run recall as UNKNOWN, and say so in the summary.** Do not claim a corpus was covered.

> **A second pass by the same agent in the same run is not an independent pass.** It shares context with the first and has been observed returning a **strict subset** — zero unique findings. Two passes in one execution is one pass done twice, and it produces no signal that anything is missing, which is what makes it dangerous rather than merely useless.

Where independent detection actually matters, **run the skill again in a fresh session and merge the outputs by hand.** That is the only form of independence available today: separate contexts that cannot see each other.

**Fan-out to subagents is possible for file corpora, and is the stronger option when the corpus is a file.** Give each agent the *path* — measured: `general-purpose` subagents read multi-thousand-line files from disk and return quotes that pass exact `grep -F` anchor tests against material never inlined into their prompts. (`.claude/rules/skills.md` states the opposite at `:139`/`:148`; that rule is **false** and is recorded as such — [decisions.md](../../../../docs/decisions.md) 2026-07-30. The true constraint is the inverse: a **background** subagent's final text may not reach the caller, so have each agent **Write its cards to a file and return the path.**)

Two limits that decide when fan-out does not apply:
- **`## Input` admits corpora that cannot be handed off at all** — "this session" and `claude-conversations` are not files a subagent can open. For those, single-run is the only option and recall stays unknown.
- **This skill does not mandate it**, because it also runs as stage 1 of `/slava:think:align` and inside subagents, where nested spawning may be unavailable. Fan out when you can; when you cannot, say recall is unknown rather than implying coverage.

If you did run more than once, state the per-run counts and the merged total, so the recall gap stays visible rather than implied.

**Size check.** If the corpus is > ~120 KB, say so before scanning and state how you are handling it. Do **not** silently truncate and then report a partial extraction as complete.

---

## Step B — Detect candidates (closed checklist triggers; potential-loss estimate measures)

Do **not** rely on a holistic sense that "this feels important" — that sense is exactly what sleeps during the silent-lull failure. Two moves: the checklist says *whether* a point is a candidate; the loss estimate says *how* high-stakes it is.

**Trigger family** — a point becomes a candidate if ANY item matches. Read each trigger **from the SUBJECT's seat**, not the agent's:

- **(a)** The subject **states a position they are acting on**, or one a listener would be expected to endorse. *(First on purpose — cheap agreement is the default failure mode.)*
- **(b)** The subject faces a **consequential fork** — a decision made, deferred, or being argued.
- **(c)** Any **irreversible-class** commitment (per the CLAUDE.md "Decisive Action — Reversibility classifier": ship, hire, sign, publish, spend, merge, delete).
- **(d) Denial-then-reveal.** The subject **denies a category and then instantiates it** — "I don't really have X" followed, often within seconds, by a concrete X. Treat the instantiated item as a candidate AND note the denial alongside it: a stake the subject does not perceive as one has, by construction, no guard on it.

> **This rubric names shapes, never findings.** Do not add "in corpus Y the subject said Z" examples to any trigger. A rubric that names what it once found stops measuring and starts confirming — an agent given the answer will reach for it instead of its own analysis, and you will read the echo as agreement.

> **Cross-speaker attribution is the failure mode this stage exists to avoid.** A point voiced by an EXCLUDED speaker is not a candidate, no matter how high its stakes are, and no matter how much the surrounding discussion is *about* it. Advice given TO the subject is not the subject's decision; the subject's *response* to that advice may be.

**High-stakes is a magnitude, not points — estimate the potential LOSS if the WHY is misread, as time AND money.** Do **not** emit a 0–100 score. Estimate the **time** at risk (hours/weeks/months, actual or opportunity) **and convert it to money** — *time lost is money lost*. Convert via the subject's rate/worth; if unknown, **assume from their location/role and state the assumption** so it can be corrected. Add any direct money at stake on top.

To size the estimate, reason over these **lenses (not a formula)** — they shape the magnitude, they are not the output:
- **reversibility** — irreversible loss counts at full weight; recoverable loss is discounted.
- **blast radius** — how much downstream (money, mission, other decisions) rides on it.
- **wrong-WHY likelihood** — how easily the why is misread; an internally *contradictory or confused* why pushes this up.
- **detection latency** — a silently-wrong foundation bleeds more before anyone notices.

**Contradictions / confusion / inconsistency are NOT a detection blocker.** They (1) *raise* the potential-loss estimate — an unstable why widens the outcome spread — and (2) become open questions downstream ("you said X in ‹src›, Y in ‹src› — which holds?"). Surface them on the card's `reasoning`; never silently resolve them.

**Watch for the item the subject did not flag.** The highest-value candidates are often the ones that passed unremarked in the room — a deadline mentioned once, a bet stated as an aside. Loudness is not stake.

---

## Step C — Emit classified cards

Interaction is **point-first** (the claim is what's visible), and that is legitimate: points and stories are **linked, not parent-child** (`docs/story-point-model.md`). Every point has a *why*, but nothing requires it to be elicited first. A vague "the point" is what lets comprehension get verified against a strawman later, so the card must be legible on its own.

```
CANDIDATE ‹n›
  type:          decision | assumption | hypothesis | problem-statement | reasoning | other
  stakeholders:  ‹everyone involved + relation + align-relevance — e.g.
                  "Marco (contractor: can call, won't onboard) · Katrin (adversary: not an align-target) · no partner"›
  align-target:  ‹the stakeholder(s) whose comprehension actually matters — or NONE›
  stake:         ‹time AND its money value — e.g. "~4 months ≈ €24k of their time"›
  content:       ‹the candidate's claim distilled to fewest words — AGENT's compression, to be verified›
  source:        ‹readable relative date or timestamp, e.g. "01:03:00" / "3 days ago"› · ‹corpus›
  evidence:      "‹verbatim text the SUBJECT actually said/wrote›"
  reasoning:     ‹plain-prose: how you reasoned to that stake — why the time/money is that big›
  worst-case:    ‹the same stake, narrated forward until it is FELT — see rules below›
  holds-if:      ‹the 2-3 conditions that must be true for the worst case to happen›
```

- **type** classifies the *speech act* — a decision, an assumption and a hypothesis fail differently when misunderstood, so the class tells you what kind of harm a wrong-WHY produces.
- **stakeholders** — everyone the decision touches, tagged by relation + align-relevance: **partner** (align-target; channel = a Clarity Letter / onboard), **contractor / peer** (align-target you *call or ask*, don't onboard), **adversary / irrelevant** (NOT an align-target), **future recipient** (nobody now; the corpus is for a later counterparty).
- **align-target** — distilled from `stakeholders`. **This stage reports it as a field value; it does not gate on it.** `NONE` and `future recipient` are valid, complete results here — the gating decision belongs to `/slava:think:align`.
- **stake** — the headline. Always time AND money. State any rate assumption inline.
- **content** — the agent's *distillation of the evidence*, flagged as such so welded-on words can be caught.
- **source** — readable timestamp/date + corpus. Retrievable, uncluttered.
- **evidence** — the **anti-hallucination anchor**: *verbatim* subject text, never a paraphrase. **No citable quote from the SUBJECT ⟹ you have an invention. Drop it.**
- **evidence must be REPRESENTATIVE, not merely real.** Where the subject states **conflicting values for the same fact**, both appear on the card — you may **not** select the one that supports the finding. Quote the fuller exchange, or say the record is inconsistent and name both. A cherry-picked real quote passes an anti-hallucination check while doing the same damage as a fabricated one, and the reader — who was there — will spot it instantly.
- **Inference must be labelled as inference.** If the card states something the subject did not say — that an engagement lapsed, that a number is a fact rather than their own estimate — mark it. "You never said this ended; I'm reading it from ‹quote›" is honest and checkable. Asserting it is not. Two shapes to watch: a state you inferred from past-tense phrasing, and the subject's own unmeasured estimate restated as a fact.
- **reasoning** — plain prose on why the stake is that size.
- **Rank by stake (money), highest first.**

### Writing `worst-case` — the field that makes a stake felt instead of stated

An abstract consequence produces no felt stake. That is the exact blindness this stage detects, so stating stakes analytically reproduces the defect. Narrate the loss forward until a reader would flinch.

**Hard rules — a worst-case field is a fiction generator pointed at a real person:**

1. **Evidence-bounded.** Use only people, decisions, timeframes and mechanisms already present in that card's `evidence` and `stake`. No invented investors, employees, numbers, or events. A story element with no anchor is the same defect as a card with no verbatim quote — **drop it.**
2. **Structurally hypothetical.** Future or conditional throughout. It must be impossible to mistake for something that happened.
3. **Plausible, not maximal.** The worst *likely* path. "The company dies" is available for every card and therefore discriminates between none of them.
4. **≤5 sentences. Short sentences.** Longer stops being a stake and becomes fan fiction.
5. **Second-order, not restatement.** The loss the subject has *not* already named. If it only repeats `content`, it is doing no work.
6. **No probability estimate.** Do not emit a percentage, a bracket, or a likelihood score — the design rejects scoring (see Step B), and an uncalibrated number both invites false precision and deflates the story it sits next to. Likelihood is expressed through `holds-if` instead.

**`holds-if` — preconditions instead of a probability.** Name the 2–3 things that must be true for the worst case to land. This is more falsifiable than a percentage (each can be checked against reality today) and more actionable (each is something the subject could break). Write them as checkable statements, not hedges.

**Optional enrichment — a real precedent, under one absolute rule.** A documented case where this went wrong for someone else makes the stake far more tangible than an imagined one. So does a statistic.

> **A real case or statistic appears ONLY with a verifiable source you actually retrieved this run. If you cannot find one, say so and use the imagined worst case alone. Never invent a precedent, a company, a number, or a citation.** A fabricated precedent is worse than none — it is more persuasive and equally false.

Render it as a separate labelled line so the sourced material is never blended into the imagined narrative:

```
  precedent:     ‹one-line real case or statistic›
                 quote:  "‹the sentence from the source that contains the number/claim›"
                 source: ‹URL or publication› [retrieved this run]
                 caveat: ‹how the source's population differs from the subject's, if it does›
                 or: none found — imagined worst case only
```

**The quote is mandatory, and it is the point.** A URL alone is not verifiable downstream — sources bot-block, pages move, and a link that 403s cannot be told apart from a link that never said what you claimed. Quoting the sentence makes the claim checkable even when the page is unreachable. **No quote ⟹ no precedent; write "none found."**

**Then print the detection summary and STOP:**

```
DETECTED: ‹N› candidates · subject ‹X› · excluded ‹Y› · corpus ‹path› (‹encoding›, ‹size after decoding›, read in full | partial: ‹how›) · anchors ‹k›/‹k› re-matched
Dropped: ‹n› candidates lacking verbatim subject evidence · ‹n› attributed to excluded speakers
```

**Zero candidates is a complete, valid, reportable result.** Say so plainly. Never pad a thin corpus to look productive.

---

## Step D — Write the deliverable (the thing a human reads)

The cards in Step C are the *working form*. They are not the artifact. A card set printed to a terminal and filed in a run log is a **report**, and a report is precisely what fails: the subject reads it, nods, and nothing happens. That is the documented failure mode this whole stage exists to break.

Write `.private/align/runs/{slug}-brief.md` in the READER's voice, structured so it can be acted on:

```markdown
# ‹plain title naming the corpus and date, in the reader's terms›

‹2-3 sentences: where this came from, whose words it is built from, and that
 nothing here is an accusation — it is their own statements, gathered.›

## At a glance
‹ONE-SCREEN INDEX — the reader picks from this, then reads only the card they picked›

| # | what it is | in one line | riding on it |
|---|---|---|---|
| 1 | ‹type, plain English› | ‹one line› | ‹stake› |

‹"Read the table. Pick one. Then read only that card."›

---

## The cards

### 1. ‹short title in the reader's language›
**Type** — ‹plain English: "a decision you've made" · "something you're assuming" · "a problem you named" · "a bet" · "your reasoning"›
> ‹ONE verbatim quote — the strongest. Not three.›
**Riding on it** — ‹time AND money, assumption inline. 1-2 sentences.›
**Doesn't fit with** — ‹the contradicting quote, where one exists. Omit otherwise.›
**If it goes wrong** — ‹worst-case, 3-4 SHORT sentences›
**Only if** — ‹2-3 preconditions, inline, separated by ·›
**Elsewhere** — ‹precedent + quote + source + caveat. Omit entirely if none.›

### 2. …

## Where two things you said don't fit together
‹contradictions, quoted both ways, left open — never resolved for them›

## Pick one
‹the interactive close — see below›
```

**Rules for the deliverable:**
- **The reader's language throughout.** No "candidate", "stake lens", "align-target", "trigger". If the reader is the subject, second person.
- **KEEP the type — it is not jargon.** "A decision you've made" / "something you're assuming" / "a problem you named" tells the reader what kind of thing they are looking at, and a decision, an assumption and a problem statement each fail differently. Translate the label; never drop the classification. Stripping it was a real defect in an earlier version of this file.
- **Index first, then cards.** The reader picks from a one-screen table and reads only what they picked. A document that must be read start-to-finish to choose from is not a menu.
- **ONE quote per card.** The strongest. Stacking three quotes is how a card becomes a page — the rest live in the run state, retrievable on request.
- **Length is a hard constraint, not a preference.** ~15 lines per card. If a card does not fit, the card is doing two jobs — split it or cut it. A brief nobody finishes has the same value as no brief.
- **Quotes carry the weight.** Never characterize where you can quote. The reader must be able to recognize every claim as their own words.
- **Omit rather than pad.** A card with no precedent simply has no precedent line — do not write "none found" in the deliverable (that belongs in the run state).
- **Contradictions stay open.** Present both quotes; do not adjudicate. Resolving them is the reader's work, and doing it for them is the rubber-stamp this design blocks.
- **No dropped-counts, no per-pass bookkeeping, no ledger talk.** That is run state.

### The interactive close — the deliverable MUST end by asking for a choice

Detection produces a **menu, not a finding.** Its value is realized only when one item moves into recovery — the parent story, the point, and eventually a letter to the person whose comprehension matters ([decisions.md](../../../../docs/decisions.md) 2026-07-29 [product]: detection is the asymmetric capability, *verified understanding is the remedy applied afterwards*).

End the brief with, in the reader's voice:

> **Pick one.** Which of these do you want to actually work through — not the one that sounds most impressive, the one you'd least like to be wrong about? Or tell me which of these I've read wrong; that's just as useful.

Then **STOP and wait.** Do not pick for them, do not rank-by-recommendation, do not proceed to recovery unprompted.

- **On a pick** → hand off to `/slava:think:align` (Gate 0 → stake gate → recovery). Note in the run file which item was picked.
- **On a correction** → treat it as rubric-improvement signal, fix the wording in this file, and re-run detection on the same corpus.
- **On silence** → the unit stays unpicked. Silence is not a pick.

---

## Step E — Write the run state + ledger

**Run file** — `.private/align/runs/{slug}.md`. Create from this schema if absent; fill `## Run` and `## Candidates` **only**. Leave every downstream placeholder untouched.

```markdown
# Align run: {slug}

## Run
- subject:   {name + speaker label or corpus identity}
- excluded:  {non-subject voices, and why}
- corpus:    {path(s) | this session | decisions.md | claude-conversations}  ({size}, {full|partial: how})
- started:   {ISO timestamp}
- stages:    detect ⬚ · recover ⬚ · verify ⬚

## Candidates
[Will be added by align-detect]

## Confirmed
[Will be added by /align at the gates]

## Story
[Will be added by align-recover]

## Decomposition
[Will be added by align-recover]

## Verification
[Will be added by align-verify]

## Position
[Will be added by /align at Step 6]
```

> **Scope boundary — do not cross.** This is a **single run's working state**, not a decision store. An index, a cross-run query, or anything that reads across `.private/align/runs/` is the persistent decision store frozen by `docs/decisions.md` 2026-07-14 [product]. Do not build it.

**Ledger** — append one line to `.private/logs/align-calibration.log` (`mkdir -p .private/logs` if missing), **on every exit including empty and aborted**:

```
<ISO-timestamp> | stage:detect | subject:<slug> | fired:<gate|manual> | candidates:<N> | min:- | verified:- | overridden(d):- | refused:- | exit:<complete|no-candidates|no-subject|user-abort>
```

Never surface this write to the user; one silent line, then continue.

---

## Quality Gates (self-review before printing)

- [ ] **SUBJECT, EXCLUDED and READER all declared and user-confirmed** before scanning. Proposed by the agent, confirmed or corrected by the user on their own turn — silence is not confirmation. Subject not inferred from turn count or tone.
- [ ] **Voice matches READER.** Second person throughout if the reader is the subject; third person if the reader is the analyst. No drift between cards. Internal vocabulary stripped whenever the reader is not the analyst. Pronouns as stated by the user, they/them if unstated.
- [ ] **`worst-case` is evidence-bounded.** Every person, number, timeframe and mechanism in it traces to that card's `evidence` or `stake`. No invented entities. ≤5 sentences, short sentences, conditional throughout, second-order rather than a restatement of `content`.
- [ ] **`holds-if` present**, 2-3 checkable preconditions. **No probability, bracket, or likelihood score anywhere on the card.**
- [ ] **`precedent` sourced-and-quoted, or absent.** A real case or statistic appears only with a source retrieved this run AND the verbatim sentence containing the claim. No quote ⟹ "none found". Population caveat stated where the source's sample differs from the subject's. Never a fabricated case, company, number or citation.
- [ ] **Recall stated as unknown**, not implied as complete. If more than one run was merged, per-run and merged counts are in the summary. A second same-session pass was not counted as an independent one.
- [ ] **Deliverable written** to `{slug}-brief.md` in the READER's voice, and it **ends by asking the reader to pick one item**. A brief that only informs is a report, and a report is the failure mode this stage exists to break.
- [ ] **Subject-scoped evidence.** Every card's `evidence` is verbatim from the **declared subject**. Anything traceable to an EXCLUDED speaker was dropped and counted in the summary. Cross-speaker attribution is the primary defect this stage is graded on.
- [ ] **Candidate classified + stake quantified.** Each card carries a `type`, a `stake` in **time AND money** (rate assumption stated if unknown — not a 0–100 score), a distilled `content`, and plain-prose `reasoning` for the stake size.
- [ ] **Verbatim evidence + readable source cited.** Never a paraphrase, never an agent synthesis. No citable subject quote ⟹ dropped.
- [ ] **Anchors re-matched against the corpus.** Where the corpus is a **file or set of files**, `grep -F` at least three `evidence` strings against it; all must match exactly. Where it is not a file (this session, a live conversation), re-locate the same three strings in the corpus as read and confirm character-exact match. Either way, state which of the two you did. **This is the gate that catches an undecoded UTF-16 read** — interleaved spacing makes every quote unmatchable while the verbatim check above still passes on inspection. State the encoding and the decoded byte count in the summary. Any miss ⟹ re-decode and re-run; do not print cards.
- [ ] **Evidence is representative, not cherry-picked.** For every card, ask: *did the subject say anything nearby that cuts against this quote?* If yes, it is on the card. Conflicting self-reports of the same fact are shown together, never resolved by selection.
- [ ] **Every non-quoted claim labelled as inference.** Nothing the subject did not say is asserted as something they did.
- [ ] **`align-target` reported, not gated on.** `NONE` / `future recipient` exited successfully with cards.
- [ ] **Empty is a valid exit.** Zero candidates reported as zero. Nothing padded.
- [ ] **Corpus read in full**, or the partial handling stated explicitly in the summary.
- [ ] **Ledger line appended** — including on an empty or aborted run.
- [ ] **No position taken.** Detection surfaces stakes; it does not agree, disagree, or advise.

If any gate fails, fix the output before showing it.

---

## What this is NOT

- **Not the comprehension loop.** It takes no position and produces no verified understanding. `min(ai, user)` lives in `/slava:think:align`.
- **Not a gate.** It reports `align-target`; `/align` decides what that means.
- **Not a summarizer.** A card without verbatim subject evidence is an invention, not a summary.

## Related

- `/slava:think:align` — the full loop; runs this as stage 1, then Gate 0 → Gate 1→2 → recovery → verification → position.
- `docs/story-point-model.md` — the story↔point link, the two axes, the unit of analysis.
- `CLAUDE.md` "Decisive Action — Reversibility classifier" — the irreversible class behind trigger (c).
