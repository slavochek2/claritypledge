// Deno test: run with `deno test --allow-read supabase/functions/transcribe-slice/dedup.test.ts`
//
// P1236 Decision 4. Built test-first against the committed Finding-8 fixture
// (`__fixtures__/p1236-boundary-slices.json`) rather than reasoned about, because the spec
// records the de-duplication as `[UNVERIFIED: no de-duplication algorithm has been run
// against this data]` and names it the highest-risk unproven component in the design.
//
// The corpus replay at the bottom is the load-bearing test. Every single-boundary case above
// it can be satisfied by an algorithm that quietly deletes real speech elsewhere — the replay
// is what catches that, and it is the test that refuted two candidate rules.
import { assertEquals, assertGreater } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  dedupeSliceText,
  MAX_WORDS_PER_OVERLAP_SECOND,
  normaliseForMatch,
  rawTokens,
} from './dedup.ts';
import fixture from './__fixtures__/p1236-boundary-slices.json' with { type: 'json' };

const WHOLE_FILE_REFERENCE_WORDS = fixture._provenance.whole_file_reference_words; // 134

function wordCount(text: string): number {
  return rawTokens(text).length;
}

// ---------------------------------------------------------------------------
// Finding 8 — the sentence the whole overlap design exists for.
// ---------------------------------------------------------------------------

Deno.test('Finding 8: 1s lead-in recovers the boundary word, and dedup does not delete it', () => {
  // At a clean 4s cut `"doesn't"` came back as `"that"`. With lead-in the word survives —
  // this asserts de-duplication does not undo that recovery.
  const previous = 'Transcribe and on my Galaxy S22 and';
  const candidate = "23 and still doesn't work.";
  const { text } = dedupeSliceText(previous, candidate);
  assertEquals(text.includes("doesn't"), true, "the recovered word must survive dedup");
  assertEquals(text.includes('work.'), true);
});

Deno.test('Finding 8: the `S22` -> `23` boundary is NOT de-duplicated — a documented, measured limit', () => {
  // The spec's Stage D asked for this stray `23` to be removed. It cannot be, without
  // deleting real speech: `S22` and `23` do not match under any exact rule, and both
  // alternatives were measured over the full corpus (see the replay tests below):
  //
  //   rule                              words out (reference 134)   stray `23`
  //   exact, windowed (implemented)     129                         survives
  //   fuzzy, <=1 mismatch               124                         still survives
  //   anchor on previous's last token   117                         removed
  //
  // Removing it costs 12 real words. A stray token is visible and harmless; a deleted word
  // is invisible and unrecoverable. This test pins the trade so a future "improvement" that
  // strips the `23` has to explain the corpus regression it causes.
  const { text, strippedTokens } = dedupeSliceText(
    'Transcribe and on my Galaxy S22 and',
    "23 and still doesn't work.",
  );
  assertEquals(strippedTokens, 0);
  assertEquals(text, "23 and still doesn't work.");
});

// ---------------------------------------------------------------------------
// The cases dedup must handle.
// ---------------------------------------------------------------------------

Deno.test('strips a repeated digit sequence at the boundary', () => {
  const { text, strippedTokens } = dedupeSliceText('1 2 3 4 5 1 2 3 4 5', '3 4 5 1 2 3 4 5 1');
  assertEquals(strippedTokens, 3); // the window, not the 8-token longest match
  // Bounded to the window: the leading repeat goes and everything after it is kept intact.
  // Under-strip is visible here — five duplicated digits survive, by design.
  assertEquals(text, '1 2 3 4 5 1');
});

Deno.test('strips repeated words, including the case where the whole slice is overlap', () => {
  assertEquals(dedupeSliceText('Test test test test.', 'test test').text, '');
  assertEquals(dedupeSliceText('test test', 'Test test test test.').text, 'test test.');
});

Deno.test('matches spoken number words against digits across the boundary', () => {
  // Gemini renders the same spoken digits both ways across consecutive slices; without this
  // the overlap is invisible and the duplicate survives.
  const { text, strippedTokens } = dedupeSliceText('1 2 3 4 5 test', 'Test three two four.');
  assertEquals(strippedTokens, 1);
  assertEquals(text, 'three two four.');
});

Deno.test('matches a normalised digit run against separated digits', () => {
  // `341113` normalises to six tokens; its tail `1`,`3` matches the candidate's head.
  const { text, strippedTokens } = dedupeSliceText('341113', '1 3 2 4');
  assertEquals(strippedTokens, 2);
  assertEquals(text, '2 4');
});

// ---------------------------------------------------------------------------
// The cases dedup must NOT touch. Under-strip bias.
// ---------------------------------------------------------------------------

Deno.test('two genuinely different consecutive sentences are never merged', () => {
  const previous = "It doesn't work.";
  const candidate = "Let's go for a little bit of a walk.";
  const { text, strippedTokens } = dedupeSliceText(previous, candidate);
  assertEquals(strippedTokens, 0);
  assertEquals(text, candidate);
});

Deno.test('an empty or missing previous row de-duplicates nothing', () => {
  for (const previous of [null, undefined, '', '   ']) {
    const { text, strippedTokens } = dedupeSliceText(previous, 'Test, can you hear me?');
    assertEquals(strippedTokens, 0);
    assertEquals(text, 'Test, can you hear me?');
  }
});

Deno.test('an empty candidate stays empty', () => {
  assertEquals(dedupeSliceText('Test test test.', '').text, '');
});

Deno.test('surface form is preserved — normalisation never reaches the stored row', () => {
  const { text } = dedupeSliceText('one two', "Two, THREE — it doesn't work!");
  // "two" matched and was stripped; everything after keeps its own casing and punctuation.
  assertEquals(text, "THREE — it doesn't work!");
});

Deno.test('a punctuation-only token is never stripped on a vacuous match', () => {
  // Regression: `"--"` normalises to NOTHING, so "every part of it is inside the match" is
  // vacuously true and an earlier version stripped it even though it precedes the overlap
  // and was never matched. Declining to strip is the correct direction — it leaves a
  // duplicate rather than destroying content nothing verified.
  const { text, strippedTokens } = dedupeSliceText('hello test test', '-- test test done');
  assertEquals(strippedTokens, 0);
  assertEquals(text, '-- test test done');
});

Deno.test('a raw token only partially inside the match is kept whole', () => {
  // `previous` ends in the single normalised token `9`; the candidate's first raw token
  // `91` normalises to `9`,`1`. Stripping it would delete the `1`, which is not matched.
  const { text, strippedTokens } = dedupeSliceText('counting 9', '91 test');
  assertEquals(strippedTokens, 0);
  assertEquals(text, '91 test');
});

// ---------------------------------------------------------------------------
// Corpus replay — the test that actually constrains the algorithm.
// ---------------------------------------------------------------------------

/** Replays the 43 real overlapping slices the way the handler will: each slice is
 *  de-duplicated against the previously STORED (already de-duplicated) row. */
function replayCorpus(maxWordsPerSecond: number): number {
  let previousStored = '';
  let total = 0;
  for (const slice of fixture.overlap_4s_1s.texts) {
    if (rawTokens(slice).length === 0) continue; // silence: no row is inserted
    const { text } = dedupeSliceText(previousStored, slice, { maxWordsPerSecond });
    total += wordCount(text);
    if (rawTokens(text).length > 0) previousStored = text;
  }
  return total;
}

Deno.test('the fixture reproduces the spec\'s own measured figures', () => {
  const plain = fixture.plain_4s.texts.reduce((n, t) => n + wordCount(t), 0);
  const overlapRaw = fixture.overlap_4s_1s.texts.reduce((n, t) => n + wordCount(t), 0);
  assertEquals(plain, fixture.plain_4s.expected_words); // 132
  assertEquals(overlapRaw, fixture.overlap_4s_1s.expected_words_raw); // 155
  // Constrains the FIXTURE, not the algorithm: the harness can regenerate this file, and a
  // regeneration that dropped or altered the reference the corpus tests are read against
  // would otherwise be silent.
  assertEquals(WHOLE_FILE_REFERENCE_WORDS, 134);
});

Deno.test('replaying the real corpus lands near the whole-file reference', () => {
  const words = replayCorpus(MAX_WORDS_PER_OVERLAP_SECOND);
  // 129, from a raw overlapped total of 155, against a whole-file reference of 134 and a
  // no-overlap 4s cut of 132. Under both, which is the intended direction: what is missing
  // is duplicate-adjacent material in the ambiguous "test test test" region, not sentences.
  assertEquals(words, 129);
});

Deno.test('the window bound is load-bearing — removing it deletes real speech', () => {
  // epistemic.md gate 7: a guard nobody has watched fail is unproven. This watches it fail.
  // With the window widened past what one second of speech can hold, longest-match runs on
  // through repeated content and eats words that were never duplicated.
  const bounded = replayCorpus(MAX_WORDS_PER_OVERLAP_SECOND);
  const unbounded = replayCorpus(1000);
  assertEquals(unbounded, 122);
  assertGreater(bounded, unbounded); // 129 > 122 — seven real words saved by the bound
});

Deno.test('widening the window past one second of speech only ever removes words', () => {
  // Monotone: every step up the window deletes more. There is no setting above 3 that
  // recovers text, which is why the constant is derived from speech rate rather than tuned.
  assertEquals(replayCorpus(0), 155); // de-duplication disabled entirely
  assertEquals(replayCorpus(2), 138);
  assertEquals(replayCorpus(3), 129);
  assertEquals(replayCorpus(4), 127);
  assertEquals(replayCorpus(6), 127);
  assertEquals(replayCorpus(8), 122);
});

Deno.test('overlap + dedup RECOVERS the sentence the no-overlap cut destroys', () => {
  // This is the whole point of Finding 8, asserted end to end over the fixture. Cut at a
  // clean 4s the sentence came back as "...S22 and still that work." — `doesn't` destroyed.
  const plain = fixture.plain_4s.texts.join(' ');
  assertEquals(plain.includes('still that work.'), true, 'the no-overlap corruption');
  // (`doesn't work` DOES occur earlier in the corpus, in an unrelated sentence — so the
  // assertion has to name this boundary's phrasing, not the bare word.)
  assertEquals(plain.includes("still doesn't work"), false);

  let previousStored = '';
  const kept: string[] = [];
  for (const slice of fixture.overlap_4s_1s.texts) {
    if (rawTokens(slice).length === 0) continue;
    const { text } = dedupeSliceText(previousStored, slice);
    kept.push(text);
    if (rawTokens(text).length > 0) previousStored = text;
  }
  assertEquals(kept.join(' ').includes("still doesn't work."), true, 'recovered after dedup');
});

Deno.test('normalisation splits digit runs but leaves alphanumerics alone', () => {
  assertEquals(normaliseForMatch(['341113']).map((t) => t.value), ['3', '4', '1', '1', '1', '3']);
  assertEquals(normaliseForMatch(['S22']).map((t) => t.value), ['s22']);
  assertEquals(normaliseForMatch(['Three,']).map((t) => t.value), ['3']);
});
