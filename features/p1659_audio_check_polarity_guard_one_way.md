---
status: qa
type: bug
rank: 329
severity: high
date_reported: 2026-11-10
created_date: 2026-11-10
drafted_by: opus
exec_model: sonnet
exec_effort: high
tags: [disagreement-pipeline, audio-check, quote-verification, p1638]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p1659-audio-check-polarity.test.ts
  root_cause: "run() checks quote-polarity ⊆ whole-ASR-polarity only: one-way, not window-scoped, no negation canonicalization; CLI entry compares import.meta.url to an unencoded file:// string"
  confidence: high
  surfaces_in_scope: [audio-check.run, audio-check.FIXTURES, audio-check.cli-entry]
  surfaces_deferred: []
  reproduced_at: 2026-11-10
spec_review_hash: 7ea09701ae66c9953c8116bdc8a3cfa4868737cf066a7f1e3228d97ea268ac2d
spec_review_vendors: [gemini, openrouter]
date_resolved: 2026-11-11
root_cause: "run() checked quote polarity against the whole transcript one way only (quote ⊆ audio), with no negation canonicalization and an unencoded CLI entry check, so a dropped negation, a contraction and a spaced path all gave wrong verdicts"
resolution: "Canonical negation forms on both sides; polarity read from the LCS alignment over candidate spans (best ratio + max-match) in both directions; clause-scoped negator lookbehind; realpath-based entry check with exit 2 on operator errors and REFUSE; dropped-negation control added"

---

# P1659: audio-check confirms quotes that dropped or gained a negation

## Summary

The quote-vs-audio check (`scripts/points/audio-check.mjs`) exists to stop an inverted quote from passing on similarity alone, but its polarity guard only runs one way and over the whole transcript. A quote that **drops** a "not" the speaker said gets CONFIRM, and so does a quote whose polarity word appears anywhere else in the audio. Found by the P1638 experiment at `e6c024b1fecd`, and re-verified on main `c6dd21917` on 2026-11-10.

## Root Cause

`run()` (`audio-check.mjs:107-109`) builds `qPol` from the quote and `aPol` from the **entire** ASR text, then fails only when a quote polarity word is missing from `aPol`:

1. **One-way.** If the quote has *fewer* polarity words than the audio, nothing fails. "the systems are open weights" against audio "the systems are **not** open weights" → `missingPolarity: []`, ratio 0.8 → CONFIRM.
2. **Whole-transcript set, not the matched window.** `bestRatio` (`:78-89`) picks the best same-length window, but the guard ignores that window. A polarity word in the *next* sentence of the audio satisfies the guard for this one.
3. **No canonical forms.** `words()` (`:54-61`) strips apostrophes, so "can't" becomes `cant` while the audio says `cannot`, and "don't" becomes `dont` against `do not`. Faithful quotes REJECT. `POLARITY` (`:46-52`) also lacks most negative contractions (`arent`, `wasnt`, `werent`, `couldnt`, `wouldnt`, `hasnt`, `havent`, `didnt`; `shouldnt` is present), so "the systems aren't safe" against "the systems are safe" CONFIRMs.
4. **The CLI entry check compares `import.meta.url` with an unencoded `file://` + argv path** (`:148`). From a path containing a space or reached through a symlink, `--controls` prints nothing and exits 0. That reads as success to an operator told to check the exit code (`.claude/commands/slava/disagreement/positions.md`).

The existing control set (`FIXTURES`) passes because its near-miss *adds* a polarity word to the quote, the one direction the guard covers. Per decisions.md (caption harness entry, line ~10346): *a control discriminates only if the correct test and the plausible wrong test give DIFFERENT answers on it.*

## Invariants

- The verdict stays a conjunction: ratio ≥ threshold **and** a polarity check. Neither half alone is sufficient (module header, `:20-33`).
- REFUSE on empty quote or empty ASR stays REFUSE. It is an infrastructure failure, not evidence against the quote.
- `--controls` must exit non-zero whenever any control fails **or when no controls ran**.

## Reproduction Steps

Run on a copy (`node`, repo root as `R`):

```js
const m = await import(R + '/scripts/points/audio-check.mjs')
m.run({ quote: 'the systems are open weights', asr: 'the systems are not open weights' })   // CONFIRM 0.8
m.run({ quote: "the most dangerous is when the systems are proprietary weights because there's basically no defense", asr: m.FIXTURES.asr }) // CONFIRM 0.933
m.run({ quote: "the systems aren't safe", asr: 'the systems are safe' })                      // CONFIRM 0.75
m.run({ quote: "we can't do this", asr: 'we cannot do this' })                                // REJECT (faithful quote)
m.run({ quote: 'we do not agree', asr: "we don't agree" })                                    // REJECT (faithful quote)
```

Then copy the module into a directory whose name contains a space and run `node "<dir with space>/a.mjs" --controls`. It prints nothing and exits 0.

**Reproduction rate:** 100% (deterministic).

## Expected Behavior

- A quote whose polarity differs from the matched audio window in **either direction** is REJECTed.
- A polarity word outside the matched window does not satisfy the check.
- Contraction and expansion of the same negation ("can't" / "cannot", "don't" / "do not") are treated as equal.
- `--controls` from any path either runs the controls or exits non-zero. It never prints nothing and exits 0.

## Actual Behavior

The first three cases above return CONFIRM, the two faithful quotes return REJECT, and `--controls` exits 0 silently from a path with a space.

## Affected Files

- `scripts/points/audio-check.mjs:46-52` (`POLARITY` set, missing contractions)
- `scripts/points/audio-check.mjs:54-61` (`words()`, no canonical negation forms)
- `scripts/points/audio-check.mjs:78-89` (`bestRatio`, needs to return the matched window, not only the ratio)
- `scripts/points/audio-check.mjs:107-109` (one-way guard over the whole ASR)
- `scripts/points/audio-check.mjs:130-146` (`FIXTURES`: add a dropped-negation near-miss)
- `scripts/points/audio-check.mjs:148` (CLI entry check)
- `src/tests/p1210-audio-check.test.ts` (existing tests)
- `scripts/points/verify-all.mjs:41,98-99` (runs `FIXTURES.pass`/`fail` through `run()`)

## Severity

**High.** This guard is the only thing that stops a misquote of a real speaker that inverts their meaning, and it passes the most common inversion (a dropped "not").

## Fix Approach

Folded from the spec review (Gemini and GLM) and code-review rounds 1-6 (Gemini, GLM, Codex, criteria review), 2026-11-10/11. Each point was checked by running it before it was adopted.

1. **One negation table on both sides before anything is compared** (`canonical()`). Every negative contraction (including `shan't`, `mightn't`, `oughtn't`, `daren't`, `mayn't`) and `cannot` become `<aux> not`; modal perfects expand too ("should've" → `should have`, "wouldn't've" → `would not have`). `ain't` becomes `not`, because its auxiliary is unknowable. Negative pronouns and determiners (`nobody`, `nowhere`, `neither`, `nor`) and denying adverbs (`hardly`, `barely`, `scarcely`, `seldom`, `rarely`) are polarity words; `noone` and "no one" both become `not one`. `no` becomes `not`: "this is no good" and "this is not good" make the same claim. `words()` is unchanged (it is exported).
2. **Candidate spans, not one window** (`bestWindow()` returns `ratio` and `spans`). Window length varies by up to ±max(4, 25% of the quote), because a quote that drops a word is shorter than the spoken span. Windows are searched even when the audio is shorter than the quote: reading the whole audio pulled the next clause into the span. The guard reads every span tied for the best ratio **and** every shortest span that matches the most quote words. Ratio alone prefers trimming a matched edge word over covering a dropped "not" (`we support the bill` vs `we do not support the bill`). There is no fixed margin around a span. `bestRatio()` stays a number.
3. **Polarity from the LCS alignment.** A polarity word the quote has and the span does not align to goes into `missingPolarity`. One the span has and the quote does not align to goes into `extraPolarity`. This catches a dropped second "not" (sets hid it) and ignores a stutter outside the aligned span (multisets would have rejected it).
4. **Clause-scoped lookbehind.** A negator (`not`, `never`, `none`, `nothing`, `without`, `nobody`, `nowhere`, `neither`, `nor`, and the denying adverbs) between the start of the speaker's clause (at most 12 words back) and the span counts as extra. That catches "it is a good plan" quoted from "I do not believe that it is a good plan". A clause ends at `, ; :`, at a sentence end (not after an abbreviation such as "Dr."), and at but/and/so/yet/or (except right after a negator: "not yet ready", "not so safe"), and at a dash (including a spaced hyphen) or ellipsis, so a negated clause beside an affirmative one ("I don't know about the politics, but I think the systems are safe") does not reject a faithful quote. A negator in the 2 words right before the span is a stutter, and is skipped, when the quote opens with it.
5. **One DP per start position** covers every window length (a 20k-word transcript now takes about 0.5 s instead of about 11 s).
6. **Entry check** `pathToFileURL(realpathSync(argv[1])).href === import.meta.url`. A run that names `audio-check.mjs` but fails the check exits 2, never 0, and so do an unreadable, malformed or non-object check file and a REFUSE verdict (exit 1 means REJECT).
7. **`FIXTURES.nearMissDropped`** joins `--controls`, and the summary counts its cases.

**Accepted trade-off (fail closed).** A polarity word that is transcription noise inside the aligned span, or a negator in the two words before it when the quote has none, REJECTs a faithful quote. A REJECT goes to a human. A false CONFIRM publishes a misquote.

## Known Limitations

Recorded under the stopping rule (decisions.md 2026-10-14). A word-level guard cannot read clause structure or open-vocabulary meaning; each review round drew new shapes of exactly that kind.

- **Stitched quotes across clauses (Codex round 2, rated HIGH by Codex).** "we do not support grants" against "we do not support taxes and we support grants" CONFIRMs, because the quote's "not" aligns to the first clause. The pre-fix code misses this too. [FOUNDER DECISION: accept, or file a follow-up for clause-aware quote checking?]
- **Lexical negation outside the word list:** "I doubt this is a good plan", "I fail to see how", "non-existent", "lack of" and similar. The list covers grammatical negators and the common denying adverbs only.
- **A negation behind a comma, dash or conjunction:** "I do not think, honestly, that it is a good plan" (or "I do not—honestly—believe…") quoted as "it is a good plan" CONFIRMs. This is the price of not rejecting "Look, I'm not a lawyer, the model is safe".
- **Unpunctuated transcripts:** with no clause punctuation, the lookbehind reads up to 12 words into the previous sentence and can REJECT a faithful quote (fail closed).
- A negation **after** the span ("the plan is good. No, wait, it is bad") and a trailing hedge are not read.
- The idiom "never mind" before a span REJECTs a faithful quote (fail closed), and "or" after a negated verb ("I do not know or care if it is a good plan") ends the clause, so that quote CONFIRMs.
- A transcription that doubles a negator inside the span ("there is no no defense") REJECTs a faithful quote (fail closed).

## Acceptance Criteria

- [x] `run({quote:'the systems are open weights', asr:'the systems are not open weights'})` returns REJECT, with `extraPolarity` containing `not`
- [x] The "proprietary ... no defense" quote against `FIXTURES.pass.asr` returns REJECT
- [x] `run({quote:"the systems aren't safe", asr:'the systems are safe'})` returns REJECT
- [x] `run({quote:"we can't do this", asr:'we cannot do this'})` and `run({quote:'we do not agree', asr:"we don't agree"})` both return CONFIRM, and "we shouldn't" vs "we should not" also CONFIRMs
- [x] A repeated polarity word in the audio ("no, no, there is no defense" vs "there is no defense") CONFIRMs
- [x] `FIXTURES.pass` still CONFIRMs, `FIXTURES.nearMiss` and `FIXTURES.fail` still REJECT, and `nearMiss.missingPolarity` is still `['closed','total']`
- [x] Empty quote and empty ASR still return REFUSE
- [x] `--controls` includes the dropped-negation near-miss and exits 0 with all cases correct. A copy whose `nearMissDropped` fixture is edited to CONFIRM exits 1
- [x] `--controls` and file mode (`audio-check.mjs <check.json>`) both run from a path containing a space, and through a symlink
- [x] `node scripts/points/verify-all.mjs` still passes its audio-check entry
- [x] Review-round cases also hold (round 2: sentence-level negators before the span, `none`/`nobody`/`neither`, and audio shorter than the quote): a negation at the span edge, a negator just before the span, a dropped second negation, `mightn't`/`oughtn't`, `no`/`not` equivalence, and a negation in the next clause not leaking in
- [x] Regression tests in `src/tests/p1659-audio-check-polarity.test.ts` cover every case above. Each new-behavior case fails on the pre-fix code
