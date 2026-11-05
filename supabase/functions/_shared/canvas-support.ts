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

/**
 * Who a point is about, not what it says: these need not be in the quote. "today" is here because the Problem box's own
 * shape (canvas-box-definitions.ts) tells the model to start "Today <customer> ...".
 */
const FRAMING = new Set(['customer', 'customers', 'user', 'users', 'client', 'clients', 'people', 'person', 'buyer', 'buyers', 'they', 'today']);
/** Any of these in the owner's sentence and the agent does not guess: it may deny, hedge, ask, suppose or request. An open list. */
const UNSURE = new Set((
  'refuse refuses fail fails false myth ' +
  'if whether unless until might may maybe perhaps could would should probably possibly used doubt only except ' +
  'few zero say said once before check verify confirm example sample translate write make build draft add create give generate please canvas stopped quit ' +
  'think thought believe hope wish imagine suppose assume assuming pretend guess sure seems ' +
  'do does did can will who what why how when where'
).split(' '));
/** A sentence opening with one of these asks. */
const ASKS = new Set(['are', 'is', 'was', 'were', 'am', 'has', 'have', 'had']);

/** An asking word before one of these asks, wherever it stands: "so are they angry". */
const ASK_SUBJECT = new Set([...FRAMING, 'we', 'you', 'it', 'he', 'she', 'them']);

const words = (text: string) => fold(text).split(/[^\p{L}\p{N}'’]+/u).filter(Boolean);
/** P1639: a negative the owner stated is fine; only a mismatch between the point and their sentence reverses them. */
const NEGATORS = new Set('not no never nor none nobody nothing neither nowhere unable without cannot hardly barely rarely seldom lack lacks lacking'.split(' '));
const isNegative = (ws: readonly string[]) => ws.some((w) => NEGATORS.has(w) || /n['’]t$/.test(w) || /^(arent|isnt|dont|doesnt|didnt|wont|cant|wasnt|werent)$/.test(w));
/** "do not" is a negative, not a question: the helper word before "not" says nothing else. */
const withoutHelpers = (ws: readonly string[]) => ws.filter((w, i) => !(ws[i + 1] === 'not' && /^(do|does|did|can|will)$/.test(w)));
const isUnsure = (w: string) => UNSURE.has(w);

/** One edit apart, a swap counting as one. */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const [x, y] = [a.slice(i), b.slice(i)];
  return x.slice(1) === y.slice(1) || x === y.slice(1) || x.slice(1) === y || (x[0] === y[1] && x[1] === y[0] && x.slice(2) === y.slice(2));
}
/** The owner's word, or their typo of it: five letters or more, the same first letter, one edit away. "hate" never matches "have". */
const knownWord = (w: string, known: ReadonlySet<string>) => known.has(w) || (w.length >= 5 && [...known].some((k) => k.length >= 5 && k[0] === w[0] && oneEdit(k, w)));
const holds = (ws: readonly string[], part: readonly string[]) => ` ${ws.join(' ')} `.includes(` ${part.join(' ')} `);

/** True when `statement` shares at least two content words with the quote it cites. */
export function sharesWords(statement: string, quote: string): boolean {
  const theirs = contentWords(quote);
  let shared = 0;
  for (const w of contentWords(statement)) if (theirs.has(w)) shared++;
  return shared >= 2;
}

/**
 * P1625: the owner's plain statement, weakly matched: the agent may add it as its best guess, and must show the owner the words it came from.
 * It shares one meaningful word with a quote the owner typed, and neither the statement nor the owner's sentence denies, hedges, asks, supposes or requests.
 * The model chooses the quote, so the owner's whole sentence is what gets read.
 */
export function isPlainGuess(statement: string, quote: string, ownerTyped: string, ownCanvas = ''): boolean {
  const theirs = contentWords(quote);
  const mine = words(statement);
  // A contraction is a negative, not a word: "don't" must not read as the owner's "don".
  const meaningful = [...contentWords(statement.replace(/\p{L}+n['’]t\b|\b(arent|isnt|dont|doesnt|didnt|wont|cant|wasnt|werent)\b/giu, ' '))];
  if (mine.length < 2 || statement.includes('?') || ASKS.has(mine[0] as string) || withoutHelpers(mine).some(isUnsure) || mine.some((w, i) => w === 'not' && mine[i + 1] === 'all') || !meaningful.some((w) => !FRAMING.has(w) && !NEGATORS.has(w) && knownWord(w, theirs))) return false;
  // A name and generic words say nothing: "Stripe customers" from "analyze Stripe".
  const own = statement.split(/[^\p{L}\p{N}]+/u).filter((w) => w && !FRAMING.has(w.toLowerCase()));
  if (own.length === 1 && /\p{Lu}/u.test(own[0] as string)) return false;
  const q = words(quote);
  const raw = ownerTyped.replace(/([^\n])\n(?!\n)/g, '$1 ').match(/[^.!?;\n]+[.!?;\n]*/g) ?? [];
  const holding = raw.filter((r) => holds(words(r), q));
  // Nothing of its own: every meaningful word of the statement is one the owner typed, or already on their canvas (vetted when it was written).
  const typed = contentWords(`${ownerTyped}\n${ownCanvas}`);
  if (meaningful.some((w) => !FRAMING.has(w) && !NEGATORS.has(w) && !knownWord(w, typed))) return false;
  if (!holding.length || quote.includes('?')) return false;
  return !withoutHelpers(q).some(isUnsure) && holding.every((r) => { const ws = words(r); return !r.includes('?') && !withoutHelpers(ws).some(isUnsure) && isNegative(ws) === isNegative(mine) && !ws.some((w, i) => w === 'not' && ws[i + 1] === 'all') && !/^(do|does|did|can|will)$/.test(ws[0] as string) && !ws.some((w, i) => ASKS.has(w) && ASK_SUBJECT.has(ws[i + 1] as string)) && !ASKS.has(ws[0] as string); });
}

/** A generic subject, compared as written: a capital may be a name. A stopword does not qualify: "per" and "will" are names too. */
export const isGenericWord = (word: string): boolean => FRAMING.has(word);
/** A generic subject that may open a sentence with a capital. */
export const isFramingWord = (word: string): boolean => FRAMING.has(word.toLowerCase());

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
export function digitsOf(raw: string): string {
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
