---
status: week
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
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1659: audio-check confirms quotes that dropped or gained a negation

## Summary

The quote-vs-audio check (`scripts/points/audio-check.mjs`) exists to stop an inverted quote from passing on similarity alone, but its polarity guard only runs one way and over the whole transcript. A quote that **drops** a "not" the speaker said gets CONFIRM, and so does a quote whose polarity word appears anywhere else in the audio. Found by the P1638 experiment at `e6c024b1fecd`, and re-verified on main `c6dd21917` on 2026-11-10.

## Root Cause

`run()` (`audio-check.mjs:107-109`) builds `qPol` from the quote and `aPol` from the **entire** ASR text, then fails only when a quote polarity word is missing from `aPol`:

1. **One-way.** If the quote has *fewer* polarity words than the audio, nothing fails. "the systems are open weights" against audio "the systems are **not** open weights" → `missingPolarity: []`, ratio 0.8 → CONFIRM.
2. **Whole-transcript set, not the matched window.** `bestRatio` (`:78-89`) picks the best same-length window, but the guard ignores that window. A polarity word in the *next* sentence of the audio satisfies the guard for this one.
3. **No canonical forms.** `words()` (`:54-61`) strips apostrophes, so "can't" becomes `cant` while the audio says `cannot`, and "don't" becomes `dont` against `do not`. Faithful quotes REJECT. `POLARITY` (`:46-48`) also lacks common contractions (`arent`, `wasnt`, `werent`, `shouldnt`, `couldnt`, `wouldnt`, `hasnt`, `havent`, `didnt`), so "the systems aren't safe" against "the systems are safe" CONFIRMs.
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

- `scripts/points/audio-check.mjs:46-48` (`POLARITY` set, missing contractions)
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

1. Canonicalize negations in `words()` or in a polarity-only normalizer: `cant` → `cannot`, `dont` → `do not` (or map both to a single `NEG` token per form). Choose one direction and apply it to both sides.
2. Make `bestRatio` return the best window's index. Compute polarity on **that window** (allowing a small margin of ±2 words for alignment), not on the whole ASR.
3. Compare polarity as a **symmetric** multiset difference: words in the quote missing from the window, and words in the window missing from the quote. Report both in `missingPolarity` (or add `extraPolarity`).
4. Extend `POLARITY` with the missing negative contractions.
5. Use `pathToFileURL(process.argv[1]).href === import.meta.url` (or `fileURLToPath(import.meta.url) === realpathSync(process.argv[1])`) for the entry check.
6. Add a **dropped-negation** near-miss to `FIXTURES` and to `--controls`, so the control set covers both directions.

## Acceptance Criteria

- [ ] `run({quote:'the systems are open weights', asr:'the systems are not open weights'})` returns REJECT, naming the dropped `not`
- [ ] The "proprietary ... no defense" quote against `FIXTURES.asr` returns REJECT
- [ ] `run({quote:"the systems aren't safe", asr:'the systems are safe'})` returns REJECT
- [ ] `run({quote:"we can't do this", asr:'we cannot do this'})` and `run({quote:'we do not agree', asr:"we don't agree"})` both return CONFIRM
- [ ] The existing `FIXTURES.pass` still CONFIRMs, and `FIXTURES.nearMiss` and `FIXTURES.fail` still REJECT
- [ ] `--controls` includes a dropped-negation near-miss, and fails (non-zero) if that case CONFIRMs
- [ ] `--controls` run from a directory whose name contains a space prints the control table and exits 0. A deliberately broken copy exits non-zero
- [ ] Regression tests in `src/tests/p1659-audio-check-polarity.test.ts` cover every case above. Each fails on the current code before the fix
