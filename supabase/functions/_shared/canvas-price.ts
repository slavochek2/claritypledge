/**
 * P1536 S2.3: the commercial terms of an Offers & Pricing point, against the owner's own words. The box's shape asks for "per <unit> <cadence>", so a model given a bare price
 * fills the slot ("1,500 per firm one-off") even when the owner said neither.
 *
 *   - groundPriceTerms: a unit or cadence the owner never stated FOR THAT PRICE comes out of the point. When the term alone cannot come out cleanly, the rest of its clause goes with it,
 *     back to the price; when even that is not certain, the answer is '' and the point is refused. Damaged text is never published.
 *   - priceLacksTerms: a price with no unit or cadence, in the point or where the owner stated it, raises the gap question.
 *
 * A term belongs to a price when the owner says it in the same clause as that number, or in the next sentence if that sentence opens "it", "that" or "the price" and holds no number of
 * its own, or in the owner's newest message when it holds no number at all (their answer to the gap question). A term after "not" or "no" counts as unsaid. The safe default is not grounded.
 *
 * Heuristics, stated as such, like the number rule: an English lexicon over the words as written. A price written in words ("twenty euros a month") binds to nothing, so its terms come out;
 * another language is not asked about. Pure: no Deno or esm.sh imports.
 */

import { PRICE_GAP_QUESTION } from './canvas-box-definitions.ts';
import type { Material, ResolvedAction } from './canvas-types.ts';

const CURRENCY = '(?:euros?|eur|€|usd|dollars?|\\$|pounds?|gbp|£|baht|chf|francs?|yen|rupees?|zloty|krona|kronor)';
const WORD = '[\\p{L}-]+';

const PERIODS: Record<string, readonly string[]> = {
  month: ['month', 'monthly'], year: ['year', 'yearly', 'annual', 'annually'], week: ['week', 'weekly'],
  day: ['day', 'daily'], quarter: ['quarter', 'quarterly'], hour: ['hour', 'hourly'],
};
const ABBREVIATED: Record<string, string> = { mo: 'month', yr: 'year', wk: 'week', hr: 'hour' };
const PERIOD_NOUNS = Object.keys(PERIODS).join('|');
const PERIOD_ADVERBS = Object.values(PERIODS).map((p) => p.slice(1).join('|')).join('|');
const ONE_OFF = 'one[- ]?off|one[- ]?time';
const NEGATED = new RegExp(`\\b(?:not|no|never|without|isn't|isnt|aren't|doesn't|don't)\\b[^;,.!?]{0,20}?\\b(?:(?:per|each|every)\\s+${WORD}|${PERIOD_ADVERBS}|${ONE_OFF}|once|an?\\s+(?:${PERIOD_NOUNS}))\\b`, 'giu');
/** A comma before one of these keeps the clause going: "180 euros per shop, per month". */
const RATE_START = `(?:per\\b|each\\b|every\\b|${PERIOD_ADVERBS}\\b|${ONE_OFF}\\b|an?\\s+(?:${PERIOD_NOUNS})\\b)`;

const escapeWord = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One word's singular: "agencies" is agency, "boxes" box, "firms" firm; a word that only looks plural ("bonus", "class", "analysis", "series") stays. */
export function singularWord(w: string): string {
  if (/(?:ss|us|is|series)$/.test(w) || w.length <= 3) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(?:ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  return w.endsWith('s') ? w.slice(0, -1) : w;
}
const wordForms = (singular: string) => `(?:${escapeWord(singular)}|${escapeWord(singular)}s|${escapeWord(singular)}es|${escapeWord(singular.replace(/y$/, 'ie'))}s)`;

/** "2,500" and "2500" are one number here. */
const plainNumbers = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, '$1').toLowerCase();
const at = (n: string) => `(?<![\\d.])${escapeWord(n)}(?![\\d]|\\.\\d)`;

const matches = (re: string, text: string) => new RegExp(re, 'iu').test(text);

// ── Where a number stands in the owner's words ──────────────────────────────

interface Place { before: string; after: string; next: string }

/** How far from the number its clause is read, and how many places it is read at: owner text is hostile input, and a price's terms stand next to it. */
const CLAUSE_CHARS = 200;
const MAX_PLACES = 50;
const MAX_ANSWER_CHARS = 2000;
const AFTER_ENDS = new RegExp(`[;.!?](?:\\s|$)|,\\s*(?!${RATE_START})|\\b(?:and|but)\\b`, 'iu');
const unsaid = (s: string) => s.replace(NEGATED, ' ');

/** Each place the number stands: the clause before it and after it, and the next sentence when that sentence is about it ("It is per firm."). A negated term is taken out of all three. */
function placesOf(n: string, text: string): Place[] {
  const out: Place[] = [];
  for (const m of text.matchAll(new RegExp(at(n), 'g'))) {
    if (out.length >= MAX_PLACES) break;
    const rest = text.slice(m.index + n.length, m.index + n.length + CLAUSE_CHARS);
    const after = rest.split(AFTER_ENDS)[0] ?? '';
    const before = text.slice(Math.max(0, m.index - CLAUSE_CHARS), m.index).split(/[;.!?](?:\s|$)|\b(?:and|but)\b/).pop() ?? '';
    const next = /^[^.!?]*[.!?]\s+((?:it|that|this|which|the price)\b[^.!?\d]*)(?:[.!?]|$)/.exec(rest)?.[1] ?? '';
    out.push({ before: unsaid(before), after: unsaid(after), next: unsaid(next) });
  }
  return out;
}

// ── A price's rate, in the owner's words or the point's ─────────────────────

const RATE_AFTER = new RegExp(`^\\s*(?:${CURRENCY}\\s*)?(?:(?:for\\s+)?(?:per\\s+(?!cent\\b)|each\\b|every\\b)|/|an?\\s+\\p{L}|${PERIOD_ADVERBS}\\b|${ONE_OFF}\\b|once\\b)`, 'iu');
const RATE_BEFORE = new RegExp(`\\b(?:${PERIOD_ADVERBS}|${ONE_OFF}|per\\s+${WORD})\\b`, 'iu');
const RATE_NEXT = new RegExp(`\\b(?:per|each|every)\\s+${WORD}|\\b(?:${PERIOD_ADVERBS}|${ONE_OFF}|once)\\b|\\ban?\\s+(?:${PERIOD_NOUNS})\\b`, 'iu');
const hasRate = (c: Place) => RATE_AFTER.test(c.after) || RATE_BEFORE.test(c.before);

/** The owner's words give the rate: the clause itself, the sentence about it, "a 49 euro workshop", "a course is 480 euros" or "a set of three 45 euros". */
function ownerHasRate(c: Place): boolean {
  return hasRate(c) || RATE_NEXT.test(c.next)
    || new RegExp(`\\ban?\\s+${CURRENCY}?\\s*$`, 'iu').test(c.before)
    || new RegExp(`\\b(?:an?|one|each)\\s+(?:${WORD}\\s+){1,4}(?:${CURRENCY}\\s*)?$`, 'iu').test(c.before);
}

// ── What the owner stated for that price ────────────────────────────────────

/** The forms a term may stand in anywhere near its price, and in a sentence or message about it. */
const looseUnit = (v: string) => `\\b(?:per|each|every)\\s+(?:${WORD}\\s+)?${v}\\b|/\\s*${v}\\b`;

/** "30 euros a shop", "for a shop", "a 49 euro shop", "a shop costs", "a set of three 45 euros", "3 shops, each pays". */
function unitAtPlace(v: string, p: Place): boolean {
  return matches(looseUnit(v), `${p.before} ${p.after}`)
    || matches(`^\\s*(?:${CURRENCY}\\s*)?(?:for\\s+)?an?\\s+(?:${WORD}\\s+)?${v}\\b`, p.after)
    || matches(`\\b${v},?\\s+each\\b`, p.after)
    || (matches(`\\ban?\\s*(?:${CURRENCY}\\s*)?$`, p.before) && matches(`^\\s*${CURRENCY}?\\s+(?:${WORD}\\s+){0,2}${v}\\b`, p.after))
    || matches(`\\b(?:an?|one|each)\\s+(?:${WORD}\\s+){0,3}?${v}\\s+(?:of\\s+${WORD}\\s+)?(?:(?:costs?|is|at|for|pays?)\\s+)?(?:${CURRENCY}\\s*)?$`, p.before)
    || matches(`\\b${v},?\\s+each\\s+(?:(?:pays?|costs?)\\s+)?(?:${CURRENCY}\\s*)?$`, p.before);
}

type Term = { kind: 'unit'; form: string } | { kind: 'period'; noun: string; adverbs: readonly string[] } | { kind: 'one-off' } | { kind: 'any' };

function termOf(raw: string): Term {
  const t = raw.toLowerCase().trim().replace(/^(?:per\s+|every\s+|for\s+each\s+|each\s+|an?\s+|\/\s*)/, '');
  if (t === 'each') return { kind: 'any' };
  if (new RegExp(`^(?:${ONE_OFF}|once)$`).test(t)) return { kind: 'one-off' };
  const word = ABBREVIATED[t] ?? t;
  const period = Object.values(PERIODS).find((p) => p.includes(word));
  if (period) return { kind: 'period', noun: period[0] ?? word, adverbs: period.slice(1) };
  return { kind: 'unit', form: wordForms(singularWord(word)) };
}

/** A sentence or an answer about the price: the loose forms only. */
function termIn(term: Term, text: string): boolean {
  if (!text || term.kind === 'any') return false;
  if (term.kind === 'unit') return matches(looseUnit(term.form), text);
  if (term.kind === 'one-off') return matches(`\\b(?:${ONE_OFF}|once)\\b`, text);
  return matches(`${looseUnit(term.noun)}|\\ban?\\s+${term.noun}\\b|\\b(?:${term.adverbs.join('|')})\\b`, text);
}

function termAtPlace(term: Term, p: Place): boolean {
  if (termIn(term, p.next)) return true;
  if (term.kind === 'unit') return unitAtPlace(term.form, p);
  if (term.kind === 'any') return ownerHasRate(p);
  if (term.kind === 'one-off') return termIn(term, `${p.before} ${p.after}`);
  return unitAtPlace(term.noun, p) || matches(`\\b(?:${term.adverbs.join('|')})\\b`, `${p.before} ${p.after}`);
}

function ownerStates(raw: string, price: string, owner: string, answer: string): boolean {
  const term = termOf(raw);
  return termIn(term, answer) || placesOf(price, owner).some((p) => termAtPlace(term, p));
}

// ── The statement, clause by clause ─────────────────────────────────────────

const NOT_PERCENT = '(?!\\s*(?:%|per ?cent))';
/** After "is", "for" or "at" a number is a price only when no noun counts it: "for 1500" and "is 1500 for the setup", never "for 2 firms". */
const NO_COUNT_FOLLOWS = '(?=\\s*(?:[;,.!?]|$|for\\b|per\\b|an?\\b|each\\b|every\\b|and\\b|or\\b|but\\b))';

/** A number written as money, or priced in the owner's words: never a count ("paid by 2 firms") or a percentage. */
function isPrice(n: string, statement: string, owner: string): boolean {
  const money = new RegExp(`${CURRENCY}\\s*${at(n)}|${at(n)}\\s*${CURRENCY}`, 'iu');
  const priced = new RegExp(`\\b(?:costs?|charges?|price[sd]?|fee of|pays?)\\s+${at(n)}${NOT_PERCENT}|\\b(?:is|for|at)\\s+${at(n)}${NO_COUNT_FOLLOWS}`, 'iu');
  return money.test(statement) || money.test(owner) || priced.test(owner);
}

interface PricedClause { head: string; price: string; tail: string; plain: string }

/** The first price in a clause: the words ahead of it, the price with its currency, what follows, and the number in its plain form. */
function priceIn(clause: string, statement: string, owner: string): PricedClause | null {
  for (const m of clause.matchAll(/(?<![\d,.])\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const plain = plainNumbers(m[0]);
    if (!isPrice(plain, statement, owner)) continue;
    const end = m.index + m[0].length;
    const currency = new RegExp(`^\\s*${CURRENCY}(?![\\p{L}])`, 'iu').exec(clause.slice(end))?.[0] ?? '';
    return { head: clause.slice(0, m.index), price: clause.slice(m.index, end + currency.length), tail: clause.slice(end + currency.length), plain };
  }
  return null;
}

const TOKEN = new RegExp(`,?\\s*(for\\s+each\\s+${WORD}|(?:per|every)\\s+(?!cent\\b)${WORD}|each(?:\\s+${WORD})?|/\\s*${WORD}|an?\\s+${WORD}|${PERIOD_ADVERBS}|${ONE_OFF}|once)(?![\\p{L}-])`, 'iuy');
/** A term anywhere in a clause's tail. Not "a <word>": that is a term only straight after a price, where the chain reads it. */
const TERM_IN_TAIL = new RegExp(`\\bper\\s+(?!cent\\b)${WORD}|\\bevery\\s+${WORD}|^\\s*/\\s*${WORD}|\\b(?:${ONE_OFF}|once)\\b|\\b(?:${PERIOD_ADVERBS})\\b|\\ban?\\s+(?:${PERIOD_NOUNS})\\b`, 'giu');
const TERM_IN_HEAD = new RegExp(`\\bper\\s+(?!cent\\b)${WORD}|\\b(?:${ONE_OFF})\\b|\\b(?:${PERIOD_ADVERBS})\\b`, 'giu');
/** A clause with no price of its own: a cadence word there is an offer's name ("Yearly plan"), so only these answer for the price. */
const TERM_NO_PRICE = new RegExp(`\\bper\\s+(?!cent\\b)${WORD}|\\b(?:${ONE_OFF}|once)\\b`, 'giu');

/** The tail as a chain of rate phrases and nothing else ("per firm one-off"), or null: only then can one phrase come out and leave clean words. */
function chainOf(tail: string): string[] | null {
  const tokens: string[] = [];
  let pos = 0;
  for (;;) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(tail);
    if (!m) break;
    tokens.push(m[1] ?? '');
    pos = TOKEN.lastIndex;
  }
  return tokens.length && !tail.slice(pos).trim() ? tokens : null;
}

/** The words ahead of the price with their ungrounded terms out: an adjective ("Monthly setup"), or a unit right before the colon ("Setup per firm:"). Null when one cannot come out cleanly. */
function cleanHead(head: string, states: (raw: string) => boolean): string | null {
  let out = head;
  for (const m of head.matchAll(TERM_IN_HEAD)) {
    if (states(m[0])) continue;
    const word = escapeWord(m[0]);
    const unit = m[0].toLowerCase().startsWith('per');
    const removed = unit ? new RegExp(`\\s*\\b${word}(?:\\s+of\\s+${WORD})?(?=\\s*:)`, 'iu') : new RegExp(`\\b${word}\\s+(?=\\p{L})`, 'iu');
    if (!removed.test(out)) return null;
    out = out.replace(removed, '');
  }
  return out;
}

/** A clause holding a price: what may stay of it. Null when nothing certain is left to publish. */
function cleanPriced(p: PricedClause, states: (raw: string) => boolean): string | null {
  const head = cleanHead(p.head, states);
  if (head === null) return null;
  const chain = chainOf(p.tail);
  if (chain) return chain.every(states) ? `${head}${p.price}${p.tail}` : `${head}${p.price}${chain.filter(states).map((t) => ` ${t}`).join('')}`;
  const terms = [...p.tail.matchAll(TERM_IN_TAIL)].map((m) => m[0]);
  return `${head}${p.price}${terms.every(states) ? p.tail : ''}`;
}

const CLAUSE_SEPARATOR = new RegExp(`(;\\s*|[.!?]\\s+|[.!?]$|,\\s+(?!${RATE_START}))`, 'iu');

/** The clauses that stayed, each with the separator that stood before the next one that stayed, and the statement's own last mark. */
function rejoin(kept: ReadonlyArray<string | null>, seps: readonly string[], statement: string): string {
  const stayed = kept.map((c, i) => ({ c: c ?? '', i })).filter((k) => k.c.trim());
  const end = /[.!?]$/.exec(statement)?.[0] ?? '';
  const joined = stayed.map((k, j) => {
    const following = stayed[j + 1];
    return `${k.c}${following ? seps[following.i - 1] ?? ' ' : end}`;
  }).join('');
  const t = joined.replace(/\s+([;,.:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return t !== statement && /^\p{Lu}/u.test(statement) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * The statement without the units and cadences the owner never stated for its price, or '' when nothing certain is left. `owner` is the owner's own words in the quote-comparison form
 * (lower case, one line); `answer` the owner's newest message when it holds no number. A statement with no price in it has no terms to answer for.
 */
export function groundPriceTerms(statement: string, owner: string, answer = ''): string {
  const o = plainNumbers(owner);
  const s = plainNumbers(statement);
  const pieces = statement.split(CLAUSE_SEPARATOR);
  const clauses = pieces.filter((_, i) => i % 2 === 0);
  const seps = pieces.filter((_, i) => i % 2 === 1);
  const prices = clauses.map((c) => priceIn(c, s, o));
  const first = prices.find(Boolean)?.plain;
  if (!first) return statement;
  const kept = clauses.map((c, i) => {
    const p = prices[i];
    if (p) return cleanPriced(p, (raw) => ownerStates(raw, p.plain, o, answer));
    const terms = [...c.matchAll(TERM_NO_PRICE)].map((m) => m[0]);
    return terms.every((raw) => ownerStates(raw, first, o, answer)) ? c : '';
  });
  return kept.includes(null) ? '' : rejoin(kept, seps, statement);
}

// ── A price with no terms ───────────────────────────────────────────────────

const ENGLISH = /\b(?:the|and|for|it|is|i|we|they|costs?|charges?|pays?|price)\b/;

/** Does this Offers & Pricing point hold a price with no unit or cadence, neither in the point nor where the owner stated the price? */
export function priceLacksTerms(statement: string, owner: string): boolean {
  const s = plainNumbers(statement);
  const o = plainNumbers(owner);
  for (const n of s.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!isPrice(n, s, o)) continue;
    const places = placesOf(n, o);
    if (!places.some((c) => ENGLISH.test(`${c.before} ${c.after}`))) continue; // another language: the lexicon stays silent rather than ask in the wrong words
    if (placesOf(n, s).some(hasRate) || places.some(ownerHasRate)) continue;
    return true;
  }
  return false;
}

// ── For the parser ──────────────────────────────────────────────────────────

export interface PriceWords { owner: string; answer: string }

/** What a price's terms may rest on: the owner's words and canvas, and on a later run their newest message when it holds no number (their answer to the gap question). */
export function priceWordsOf(owner: string, material: Material, laterRun: boolean): PriceWords {
  const newest = laterRun ? material.items.find((i) => i.trigger && i.owner)?.text.toLowerCase() ?? '' : '';
  return { owner, answer: /\d/.test(newest) ? '' : unsaid(newest.slice(0, MAX_ANSWER_CHARS)) };
}

/** The questions, with the missing part asked for when a point this run wrote holds a price with no unit or cadence: the model's question about anything else gives way. */
export function withPriceGap(questions: Record<string, string>, actions: readonly ResolvedAction[], box: string, owner: string): Record<string, string> {
  const lacks = actions.some((a) => a.action !== 'keep' && a.box === box && priceLacksTerms(a.statement, owner));
  return lacks ? { ...questions, [box]: PRICE_GAP_QUESTION } : questions;
}
