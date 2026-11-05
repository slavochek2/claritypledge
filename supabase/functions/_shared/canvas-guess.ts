/**
 * P1625: what may be told back to the owner. A best guess is written only if it can be shown with the owner's words; a refused point is named only if nothing in it could be another person.
 * Pure: no Deno or esm.sh imports.
 */

import { cleanFreeText, normalizeForQuote, quoteIsOwnerSourced } from './canvas-source.ts';
import { isFramingWord, isGenericWord, isPlainGuess, numbersSupported, sharesWords } from './canvas-support.ts';
import type { BasePoint, Guessed, ResolvedAction } from './canvas-types.ts';

export type Guess = Guessed & { raw: string };
export interface OwnerWords { namesOther: (text: string) => boolean; ownerTyped: string }
interface Written { actions: ResolvedAction[] }
interface VetAcc { droppedUnverified: number; droppedNames: number; droppedPoints: string[]; guesses: Guess[] }
interface VetCtx extends OwnerWords { haystack: string; numbers: ReadonlySet<string> }

const REVENUE = 'canvas:revenue';

const sameText = (a: string, b: string) => normalizeForQuote(a) === normalizeForQuote(b);

/**
 * Whether a refused statement may be shown back. It is model text that failed a check, and no name filter can promise "never", so this is an
 * allowlist that fails closed to the plain count: every word is generic or one the owner typed in this thread. A file's words do not count.
 */
export function safeToName(shown: string, ctx: OwnerWords): boolean {
  if (!shown || ctx.namesOther(shown) || /[@/:]/.test(shown) || shown.replace(/\.$/, '').includes('.')) return false;
  const typed = new Set(ctx.ownerTyped.split(/[^\p{L}\p{N}]+/u));
  const lower = new Set(ctx.ownerTyped.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  // A capital the owner did not type is a possible name. Only the first word may owe its capital to the sentence, and it must still be a generic subject or theirs.
  return shown.split(/[^\p{L}\p{N}]+/u).filter(Boolean).every((w, i) => isGenericWord(w) || typed.has(w) || (i === 0 && (isFramingWord(w) || lower.has(w.toLowerCase()))));
}

const LINK_SHAPE = /[@/:]|[\p{L}\p{N}]\.[\p{L}\p{N}]/u;
/**
 * A guess is told with the owner's words or it is not added. Its statement holds nothing that could be a name or a link the owner did not type:
 * every capitalised word is a generic subject or a word they typed, in any case.
 */
export function guessIsShowable(statement: string, quote: string, ctx: OwnerWords): boolean {
  const typed = new Set(ctx.ownerTyped.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  const split = (t: string) => t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const shown = cleanFreeText(quote, 80);
  if (statement.length > 80 || !shown || ctx.namesOther(shown) || LINK_SHAPE.test(statement) || LINK_SHAPE.test(shown)) return false;
  return split(shown).every((w) => typed.has(w.toLowerCase()))
    && split(statement).every((w, i) => !/\p{Lu}|[^\p{Script=Latin}\p{N}]/u.test(w) || typed.has(w.toLowerCase()) || isFramingWord(w) || (i === 0 && /^(the|our|their|most)$/i.test(w)));
}

/** The guesses that were really written, in that box, once each. */
export function guessedOf(acc: Written & { guesses: Guess[] }): Guessed[] {
  const seen = new Set<string>();
  return acc.guesses.filter((g) => {
    const key = `${g.box}|${normalizeForQuote(g.raw)}`;
    if (seen.has(key) || !acc.actions.some((x) => x.action !== 'keep' && x.box === g.box && sameText(x.statement, g.raw))) return false;
    seen.add(key);
    return true;
  }).map(({ box, statement, quote }) => ({ box, statement, quote }));
}

/** A point the model also wrote with good support was not left out. */
export function droppedOf(acc: Written & { droppedPoints: string[]; droppedUnverified: number }, base: ReadonlyMap<string, BasePoint>): { droppedUnverified: number; droppedPoints: string[] } {
  const droppedPoints = acc.droppedPoints.filter((d) => !acc.actions.some((x) => sameText(cleanFreeText(x.action === 'keep' ? base.get(x.point_id)?.statement ?? '' : x.statement, 80), d)));
  return { droppedUnverified: acc.droppedUnverified - (acc.droppedPoints.length - droppedPoints.length), droppedPoints };
}

/** Counts an unsupported point and remembers its cleaned words when they are safe to show. A repeat stays in the list: the reply names it once and does not count it as another point. */
function refuseUnverified(acc: VetAcc, ctx: VetCtx, statement: string): void {
  acc.droppedUnverified += 1;
  const shown = cleanFreeText(statement, 80);
  if (!ctx.namesOther(statement) && safeToName(shown, ctx)) acc.droppedPoints.push(shown);
}

/**
 * The owner-quote rule, the name filter and the support rule, in that order (a name is told as a name even when the
 * point is also unsupported). True when the point may be written; a refusal is counted.
 */
export function vetEvidence(acc: VetAcc, ctx: VetCtx, a: Record<string, unknown>, statement: string, extraSource = ''): boolean {
  if (!quoteIsOwnerSourced(a.quote, extraSource ? `${ctx.haystack}\n${normalizeForQuote(extraSource)}` : ctx.haystack)) { refuseUnverified(acc, ctx, statement); return false; }
  if (ctx.namesOther(statement)) { acc.droppedNames += 1; return false; }
  const quote = String(a.quote);
  if (!numbersSupported([statement], ctx.numbers)) { refuseUnverified(acc, ctx, statement); return false; }
  if (sharesWords(statement, quote)) return true;
  if (a.box === REVENUE || !isPlainGuess(statement, quote, ctx.ownerTyped) || !guessIsShowable(statement, quote, ctx)) { refuseUnverified(acc, ctx, statement); return false; }
  acc.guesses.push({ box: String(a.box), statement: cleanFreeText(statement, 80), quote: cleanFreeText(quote, 80), raw: statement });
  return true;
}
