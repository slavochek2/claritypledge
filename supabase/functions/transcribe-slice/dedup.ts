/**
 * P1236 Decision 4 — overlap de-duplication for live transcription slices.
 *
 * The capture side emits a 4-second slice every 4 seconds with 1 second of LEAD-IN
 * carried over from the previous slice (Finding 8: at a clean 4 s cut the word straddling
 * the boundary is destroyed — `"doesn't"` came back as `"that"`). The cost of that lead-in
 * is that the overlapped second is transcribed twice, so the same member's consecutive
 * slices repeat a few words. This module removes that repeat before the row is inserted.
 *
 * ## Why the longest match is the WRONG rule, measured
 *
 * The obvious algorithm — strip the longest prefix of the new slice that matches a suffix
 * of the previous one — is what this module deliberately does NOT do. Replayed over the
 * committed fixture (`__fixtures__/p1236-boundary-slices.json`, the 43 real slices behind
 * Finding 8):
 *
 * Replayed over the whole corpus, counting words in the stored rows (whole-file reference
 * 134 words; the same audio cut at 4 s with no overlap gives 132; raw overlapped slices 155):
 *
 * | words per overlap second | words out | reading |
 * |---|---|---|
 * | 0 (no de-duplication) | 155 | 21 duplicated |
 * | 2 | 138 | duplicates survive |
 * | **3 (implemented)** | **129** | every strip is a genuine repeat, checked by eye |
 * | 4 / 5 / 6 | 127 | starts eating the ambiguous repeated-word region |
 * | unbounded (longest match) | 122 | **7 more words gone than at 3** |
 *
 * Repeated content ("test test test test", "1 2 3 4 5 1 2 3 4 5") lets the longest match
 * run far past what one second of speech can physically hold, and every word past that
 * point is real speech being deleted. So the bound comes from the OVERLAP DURATION, not
 * from how long a match can be found.
 *
 * **The window is set from speech rate, not fitted to this curve.** Conversational English
 * runs ~2.5-3 words/second, so one second of lead-in holds about three words; that is the
 * whole derivation. The corpus is ONE 168-second recording of sparse counting by one
 * speaker, which is the worst case for this measurement — rapid digits reach ~5 words/s, so
 * on that material a 3-word window under-strips and some duplicates survive (visible in the
 * replay as `"1 2 3 4 5 1"`). That is the intended direction of error.
 *
 * ## Bias: under-strip, never over-strip
 *
 * A surviving duplicate is visible on screen and harmless. A deleted word is invisible and
 * unrecoverable — the audio slice is not kept per-slice. Every ambiguous case below
 * therefore resolves toward keeping text:
 *
 *   - Matching is EXACT after normalisation. No fuzzy/edit-distance matching. Finding 8's
 *     `"Galaxy S22 and"` → `"23 and still doesn't work."` boundary is consequently NOT
 *     de-duplicated: the stray `23` survives. Both alternatives were built and measured
 *     over the corpus before being rejected — a <=1-mismatch fuzzy rule deleted 5 further
 *     words and still failed to strip the `23`; anchoring on the previous slice's final
 *     token did strip it, and cost 12 words. Removing that stray is not achievable by any
 *     text-only rule that does not delete real speech.
 *   - A raw token whose normalised parts are only PARTIALLY inside the matched region is
 *     kept whole (see `expandDigitRun` — one raw token can normalise to several).
 *   - An empty previous text (the previous slice was silence, or was consumed entirely)
 *     de-duplicates nothing rather than reaching further back.
 *
 * ## Normalisation is for MATCHING ONLY
 *
 * The text written to `transcribe_messages` is always the candidate's own surface form,
 * minus whole stripped tokens. Normalisation never reaches the stored row.
 *
 * Pure — no Deno, no network, no database. Unit-tested in `dedup.test.ts`.
 */

/** Upper bound on words one second of speech can carry. Conversational English runs
 *  ~2.5-3 words/second, so one second of lead-in holds about three. See the table above for
 *  what every other value in 0..unbounded measures on the fixture. */
export const MAX_WORDS_PER_OVERLAP_SECOND = 3;

/** Capture-side lead-in, in seconds. Mirrors `slice-recorder.ts`; Finding 8 measured 1 s
 *  as sufficient to recover a word straddling the cut. */
export const OVERLAP_SECONDS = 1;

export interface DedupOptions {
  /** Lead-in duration the capture side actually used for this slice. */
  overlapSeconds?: number;
  /** Words-per-second bound used to convert that duration into a token window. */
  maxWordsPerSecond?: number;
}

export interface DedupResult {
  /** The candidate's own text with the overlapping prefix removed. May be empty. */
  text: string;
  /** How many raw tokens were removed. Zero means nothing matched. */
  strippedTokens: number;
  /** The token window the match was bounded to — surfaced so tests and logs can see it. */
  window: number;
}

const SPOKEN_DIGITS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

/**
 * Splits a run of digits into separate tokens.
 *
 * Gemini renders the same spoken digits inconsistently ACROSS slices — the fixture holds
 * `"Test three two four."` immediately followed by `"3 2 4 3 2 4 3 2 4"`, and one slice
 * came back as the single token `"341113"`. Without this the overlap at those boundaries is
 * invisible and the duplicate survives. `S22` is left alone: it is not a pure digit run.
 */
function expandDigitRun(token: string): string[] {
  return /^\d{2,}$/.test(token) ? token.split('') : [token];
}

/** One normalised token, tagged with the raw token it came from. */
interface NormToken {
  value: string;
  rawIndex: number;
}

/** Splits on whitespace, preserving surface form. */
export function rawTokens(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Lowercases, drops punctuation, maps spoken number words to digits and splits digit runs.
 * Returns one entry per normalised token, each tagged with its source raw-token index —
 * a single raw token can produce several (`"341113"` → six).
 */
export function normaliseForMatch(raws: string[]): NormToken[] {
  const out: NormToken[] = [];
  raws.forEach((raw, rawIndex) => {
    const cleaned = raw.toLowerCase().replace(/[^\w\s']/g, ' ');
    for (const piece of cleaned.split(/\s+/)) {
      if (!piece) continue;
      const mapped = SPOKEN_DIGITS[piece] ?? piece;
      for (const value of expandDigitRun(mapped)) {
        out.push({ value, rawIndex });
      }
    }
  });
  return out;
}

/**
 * Longest k ≤ `window` such that the first k normalised tokens of `current` equal the last
 * k of `previous`. Zero when nothing matches.
 *
 * Longest-within-the-window, not longest-overall: the window is what makes this safe, and
 * within it a longer match is strictly better evidence than a shorter one.
 */
export function overlapTokenCount(
  previous: NormToken[],
  current: NormToken[],
  window: number,
): number {
  const limit = Math.min(window, previous.length, current.length);
  let best = 0;
  for (let k = 1; k <= limit; k++) {
    let equal = true;
    for (let i = 0; i < k; i++) {
      if (current[i].value !== previous[previous.length - k + i].value) {
        equal = false;
        break;
      }
    }
    if (equal) best = k;
  }
  return best;
}

/**
 * Removes from `candidateText` the leading words it shares with the end of `previousText`.
 *
 * `previousText` is the same member's most recently stored `transcribe_messages` row — i.e.
 * already de-duplicated itself. Stripping a row's HEAD never changes its TAIL, so matching
 * against the stored form is equivalent to matching against the raw slice, except when a
 * previous row was consumed entirely; that case is handled by returning the candidate
 * unchanged (under-strip bias) rather than by reaching further back through the table.
 */
export function dedupeSliceText(
  previousText: string | null | undefined,
  candidateText: string,
  options: DedupOptions = {},
): DedupResult {
  const overlapSeconds = options.overlapSeconds ?? OVERLAP_SECONDS;
  const maxWordsPerSecond = options.maxWordsPerSecond ?? MAX_WORDS_PER_OVERLAP_SECOND;
  const window = Math.max(0, Math.ceil(overlapSeconds * maxWordsPerSecond));

  const candidateRaws = rawTokens(candidateText ?? '');
  const unchanged: DedupResult = {
    text: candidateRaws.join(' '),
    strippedTokens: 0,
    window,
  };

  if (window === 0 || candidateRaws.length === 0) return unchanged;

  const previousRaws = rawTokens(previousText ?? '');
  if (previousRaws.length === 0) return unchanged;

  const previousNorm = normaliseForMatch(previousRaws);
  const candidateNorm = normaliseForMatch(candidateRaws);
  const k = overlapTokenCount(previousNorm, candidateNorm, window);
  if (k === 0) return unchanged;

  // Strip whole raw tokens only. A raw token that normalises to several parts (a digit run)
  // is removed only when EVERY one of its parts lies inside the matched region — a partial
  // match leaves it standing, which duplicates rather than corrupts.
  const lastMatchedRawIndex = candidateNorm[k - 1].rawIndex;
  const rawIsFullyMatched = (rawIndex: number) =>
    candidateNorm.every((t, i) => t.rawIndex !== rawIndex || i < k);

  let strippedTokens = 0;
  while (
    strippedTokens <= lastMatchedRawIndex &&
    strippedTokens < candidateRaws.length &&
    rawIsFullyMatched(strippedTokens)
  ) {
    strippedTokens++;
  }

  return {
    text: candidateRaws.slice(strippedTokens).join(' '),
    strippedTokens,
    window,
  };
}
