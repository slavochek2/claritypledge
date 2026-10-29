/**
 * P1536: does the owner's material SUPPORT what the model wrote? Two cheap, deterministic checks that sit on top
 * of the verbatim-quote rule (a quote proves a sentence exists, not that the point is about it):
 *
 *   - sharesWords: a statement must share at least two content words with the quote it cites;
 *   - numbersIn: every number in a statement or story must be a number the owner's own material (or their
 *     current canvas) already holds, digits and number words alike.
 *
 * Heuristics, stated as such: they refuse the invention that is easy to make (an unrelated real quote carrying
 * an invented claim or figure). They do not prove a statement is true to its source.
 * Pure: no Deno or esm.sh imports.
 */

const STOP = new Set((
  'a about above after again against all also am an and any are as at be because been before being below between both but by ' +
  'can could did do does doing down during each few for from further had has have having he her here hers him his how i if in ' +
  'into is it its just me more most my no nor not now of off on once only or other our ours out over own same she should so ' +
  'some such than that the their theirs them then there these they this those through to too under until up very was we were ' +
  'what when where which while who whom why will with would you your yours yes get got per via'
).split(' '));

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
/** A plural "s" never decides a match. */
const stem = (w: string) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** The words that carry meaning: folded, three letters or more, no stopwords, plural stripped. */
export function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of fold(text).split(/[^\p{L}\p{N}]+/u)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(stem(w));
  }
  return out;
}

/** True when `statement` shares at least two content words with `quote`, however short the statement is. */
export function sharesWords(statement: string, quote: string): boolean {
  const theirs = contentWords(quote);
  let shared = 0;
  for (const w of contentWords(statement)) if (theirs.has(w)) shared++;
  return shared >= 2;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const COMPOUND_RE = new RegExp(`\\b(${Object.keys(TENS).join('|')})[ -](${Object.keys(UNITS).slice(1, 10).join('|')})\\b`, 'g');
const WORD_RE = new RegExp(`\\b(${[...Object.keys(UNITS), ...Object.keys(TENS)].join('|')})\\b`, 'g');
const NUM_RE = /(\d+(?:[.,]\d+)*)\s?(thousand|million|billion|percent|mm|bn|k|m|b|%)?(?![\p{L}])/giu;
const MAGNITUDE: Record<string, string> = { thousand: 'k', k: 'k', million: 'm', mm: 'm', m: 'm', billion: 'b', bn: 'b', b: 'b', percent: '%', '%': '%' };

/** Number words become digits ("twenty-five" 25, "three" 3). */
function wordsToDigits(lower: string): string {
  return lower
    .replace(COMPOUND_RE, (_m, t: string, u: string) => String((TENS[t] ?? 0) + (UNITS[u] ?? 0)))
    .replace(WORD_RE, (w) => String(UNITS[w] ?? TENS[w] ?? w));
}

/** "2,500" and "2500" are one number; "2,5" is a decimal comma. */
function digitsOf(raw: string): string {
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) return raw.replace(/,/g, '');
  return raw.replace(',', '.');
}

/** Every number in a text, as a normalised token: digits plus an optional magnitude (k, m, b, %). */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of wordsToDigits(fold(text)).matchAll(NUM_RE)) {
    out.add(digitsOf(m[1] ?? '') + (m[2] ? MAGNITUDE[m[2].toLowerCase()] ?? '' : ''));
  }
  return out;
}

/** True when every number in `texts` is in `pool`. */
export function numbersSupported(texts: readonly string[], pool: ReadonlySet<string>): boolean {
  for (const t of texts) for (const n of numbersIn(t)) if (!pool.has(n)) return false;
  return true;
}
