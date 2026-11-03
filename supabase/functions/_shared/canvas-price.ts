/**
 * P1536 S2.3: the commercial terms of an Offers & Pricing point, against the owner's own words. The box's shape asks for "per <unit> <cadence>", so a model given a bare price
 * fills the slot ("1,500 per firm one-off") even when the owner said neither. Both checks here sit on the number rule of canvas-support.ts:
 *
 *   - groundPriceTerms: a unit or cadence the owner never stated comes out of the point; the price stays. Refusing the point instead would lose the price the owner did state.
 *   - priceLacksTerms: a price with no unit or cadence, in the point or in the owner's words, raises the gap question.
 *
 * Heuristics, stated as such, like the number rule: an English lexicon over the words as written. A term the owner states anywhere counts ("a yearly plan" grounds "yearly" for any
 * price in that material), and another language is left alone: nothing is taken out and nothing is asked. Pure: no Deno or esm.sh imports.
 */

const CURRENCY = '(?:euros?|eur|€|usd|dollars?|\\$|pounds?|gbp|£|baht|chf|francs?|yen|rupees?|zloty|krona|kronor)';
const WORD = '[\\p{L}-]+';
/** A number starts only at the start of its run: a run of digits is one try, never one per digit. */
const NUMBER = '(?<![\\d,.])\\d[\\d,.]*';

const PERIODS: Record<string, readonly string[]> = {
  month: ['month', 'monthly'], year: ['year', 'yearly', 'annual', 'annually'], week: ['week', 'weekly'],
  day: ['day', 'daily'], quarter: ['quarter', 'quarterly'], hour: ['hour', 'hourly'],
};
const PERIOD_NOUNS = Object.keys(PERIODS).join('|');
const PERIOD_ADVERBS = Object.values(PERIODS).map((p) => p.slice(1).join('|')).join('|');
const ONE_OFF = 'one[- ]?off|one[- ]?time';

const escapeWord = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Does the owner state `word` as what a price is per: "per shop", "each shop", "30 euros a shop", "a 49 euro shop", "a shop costs", "a set of three 45 euros", "3 shops, each pays". */
function ownerStatesUnit(word: string, owner: string): boolean {
  const w = escapeWord(singular(word.toLowerCase()));
  return [
    `\\b(?:per|each|every)\\s+(?:${WORD}\\s+)?${w}s?\\b`,
    `/\\s?${w}\\b`,
    `${NUMBER}\\s*(?:${CURRENCY}\\s+)?an?\\s+${w}\\b`,
    `\\ban?\\s+(?:${CURRENCY}\\s*)?${NUMBER}\\s*${CURRENCY}?\\s+(?:${WORD}\\s+){0,2}${w}s?\\b`,
    `\\b(?:an?|one|each)\\s+(?:${WORD}\\s+)?${w}\\s+(?:of\\s+${WORD}\\s+)?(?:costs?\\b|is\\b|at\\b|for\\b|${CURRENCY}?\\s*\\d)`,
    `\\b${w}s?,?\\s+each\\b`,
  ].some((re) => new RegExp(re, 'iu').test(owner));
}

/** A period counts in any of its forms: "35 euros a month" grounds "monthly" and "per month". "One firm a month" is no price's cadence: the a-form needs a number in front. */
function ownerStatesPeriod(period: readonly string[], owner: string): boolean {
  const [noun, ...adverbs] = period as [string, ...string[]];
  return ownerStatesUnit(noun, owner) || adverbs.some((a) => new RegExp(`\\b${a}\\b`, 'i').test(owner));
}

function ownerStatesTerm(word: string, owner: string): boolean {
  const w = word.toLowerCase().replace(/^an?\s+/, '');
  const period = Object.values(PERIODS).find((p) => p.includes(w));
  return period ? ownerStatesPeriod(period, owner) : ownerStatesUnit(w, owner);
}

const tidy = (s: string) => s.replace(/\s+([;,.:])/g, '$1').replace(/\s{2,}/g, ' ').trim();

/** The statement without the units and cadences the owner never stated. `owner` is the owner's own words in the quote-comparison form (lower case, one line). */
export function groundPriceTerms(statement: string, owner: string): string {
  const out = statement
    .replace(new RegExp(`(?:,\\s*)?\\s*\\bper\\s+(?!cent\\b)(${WORD})(?:\\s+of\\s+${WORD})?`, 'giu'), (m, w: string) => (ownerStatesTerm(w, owner) ? m : ''))
    .replace(new RegExp(`(?:,\\s*)?(?:^|\\s+)(?:${ONE_OFF})\\b\\s*`, 'gi'), (m) => (new RegExp(`\\b(?:${ONE_OFF}|once)\\b`, 'i').test(owner) ? m : ' '))
    .replace(new RegExp(`(${NUMBER}(?:\\s*${CURRENCY})?)\\s+(an?\\s+(?:${PERIOD_NOUNS})|${PERIOD_ADVERBS})\\b`, 'giu'), (m, price: string, term: string) => (ownerStatesTerm(term, owner) ? m : price));
  if (out === statement) return statement;
  const t = tidy(out);
  return /^\p{Lu}/u.test(statement) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** "2,500" and "2500" are one number here. */
const plainNumbers = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, '$1').toLowerCase();
const at = (n: string) => `(?<![\\d.])${escapeWord(n)}(?![\\d])`;
const NOT_PERCENT = '(?!\\s*(?:%|per ?cent))';

/** A number written as money, or priced in the owner's words: never a count ("paid by 2 firms") or a percentage. */
function isPrice(n: string, statement: string, owner: string): boolean {
  const money = new RegExp(`${CURRENCY}\\s*${at(n)}|${at(n)}\\s*${CURRENCY}`, 'iu');
  const priced = new RegExp(`\\b(?:costs?|charges?|price[sd]?|fee of|pays?)\\s+${at(n)}${NOT_PERCENT}`, 'i');
  return money.test(statement) || money.test(owner) || priced.test(owner);
}

const RATE_AFTER = new RegExp(`^\\s*(?:${CURRENCY}\\s*)?(?:(?:for\\s+)?(?:per\\s+(?!cent\\b)|each\\b|every\\b)|/|an?\\s+\\p{L}|${PERIOD_ADVERBS}\\b|${ONE_OFF}\\b|once\\b)`, 'iu');
const RATE_BEFORE = new RegExp(`\\b(?:${PERIOD_ADVERBS}|${ONE_OFF}|per\\s+${WORD})\\b`, 'iu');

/** How far from the number its clause is read, and how many places it is read at: owner text is hostile input, and a price's terms stand next to it. */
const CLAUSE_CHARS = 200;
const MAX_PLACES = 50;

/** The text after and before each place the number stands, kept to its own clause. */
function clausesOf(n: string, text: string): Array<{ before: string; after: string }> {
  const out: Array<{ before: string; after: string }> = [];
  for (const m of text.matchAll(new RegExp(at(n), 'g'))) {
    if (out.length >= MAX_PLACES) break;
    const after = text.slice(m.index + n.length, m.index + n.length + CLAUSE_CHARS).split(/[;,.!?](?:\s|$)|\b(?:and|but)\b/)[0] ?? '';
    const before = text.slice(Math.max(0, m.index - CLAUSE_CHARS), m.index).split(/[;.!?](?:\s|$)/).pop() ?? '';
    out.push({ before, after });
  }
  return out;
}

const hasRate = (c: { before: string; after: string }) => RATE_AFTER.test(c.after) || RATE_BEFORE.test(c.before);

/** The owner's words give the rate: the clause itself, "a 49 euro workshop", "a course is 480 euros" or "a set of three 45 euros". */
const ownerHasRate = (c: { before: string; after: string }) => hasRate(c)
  || new RegExp(`\\ban?\\s+${CURRENCY}?\\s*$`, 'iu').test(c.before)
  || new RegExp(`\\b(?:an?|one|each)\\s+(?:${WORD}\\s+){1,4}(?:${CURRENCY}\\s*)?$`, 'iu').test(c.before);

const ENGLISH = /\b(?:the|and|for|it|is|i|we|they|costs?|charges?|pays?|price)\b/;
/** Is the clause the number stands in written in English? Read at the same places, in the same window. */
const clauseIsEnglish = (n: string, owner: string) => clausesOf(n, owner).some((c) => ENGLISH.test(`${c.before} ${c.after}`));

/** Does this Offers & Pricing point hold a price with no unit or cadence, neither in the point nor where the owner stated the price? */
export function priceLacksTerms(statement: string, owner: string): boolean {
  const s = plainNumbers(statement);
  const o = plainNumbers(owner);
  for (const n of s.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!isPrice(n, s, o) || !clauseIsEnglish(n, o)) continue;
    if (clausesOf(n, s).some(hasRate) || clausesOf(n, o).some(ownerHasRate)) continue;
    return true;
  }
  return false;
}
