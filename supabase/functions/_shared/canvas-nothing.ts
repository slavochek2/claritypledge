/**
 * P1653: what the agent does when a message gives it nothing to write, so the owner is never left at a wall.
 *
 *   F1  A run that asks a follow-up completes as a FINISHED run with nothing changed (`_canvas_draft_run_complete_question`: no Undo step, no focus, no
 *       point), so the owner's message stays in later runs; it uses 1 of the draft's 30 updates. The next run is a first draft again.
 *   F5  The question is one of the questions the model already returned, for the box it judged most likely, shown only if every content word of it is in the
 *       owner's own typed words (the same word screen as a point, plus the names screen and the numbers rule). Otherwise the approved fixed question.
 *   F2  A link that was read but only gave a redirect notice: the reply says so and asks "Is this your business?" (two fixed buttons). A tap sends only a
 *       fixed token (canvas-reply-table.ts), never agent text, and a tap adds no evidence: the token message is left out of the material.
 *
 * Pure apart from the injected seams (the same RunTools canvas-run.ts passes): no Deno or esm.sh imports.
 */

import { closedRun, type RunTools } from './canvas-choice-run.ts';
import { cleanFreeText, cutAtWord } from './canvas-source.ts';
import { contentWords, numbersIn, numbersSupported } from './canvas-support.ts';
import { derivedNames, namesMatcher } from './canvas-names.ts';
import { readJson } from './canvas-read.ts';
import { BOX_TAGS } from './canvas-draft.ts';
import { BOX_DEFINITIONS } from './canvas-box-definitions.ts';
import { isThinRedirect } from './canvas-material.ts';
import { PAGE_BUTTONS, WORDS, pageButtonsFor, pageTokenOf } from './canvas-reply-table.ts';
import type { CanvasRun, RunDeps, RunParams, RunSummary, Step, ThreadItem } from './canvas-run.ts';
import type { DraftOutcome } from './canvas-types.ts';

const MAX_QUESTION_CHARS = 300;

/** The model's own questions in the order it wrote them: [{ box, question }]. Read from the raw answer, since the parse adds the module's fixed question for every empty box. */
export function modelQuestionsOf(response: unknown): Array<{ box: string; question: string }> {
  const read = readJson(response);
  if (!read.ok) return [];
  const raw = ((read.parsed ?? {}) as { questions?: unknown }).questions;
  const pairs: Array<[unknown, unknown]> = Array.isArray(raw)
    ? raw.map((q) => [(q as { box?: unknown } | null)?.box, (q as { question?: unknown } | null)?.question])
    : Object.entries((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>);
  return pairs.filter((p): p is [string, string] => typeof p[0] === 'string' && BOX_TAGS.has(p[0]) && typeof p[1] === 'string').map(([box, question]) => ({ box, question }));
}

/**
 * The plain box words a guess-question may use besides the owner's own words (founder decision A). FOUNDER-APPROVED SCOPE: box vocabulary only, generic
 * nouns and verbs that NAME a box ("who are your customers", "what you sell", "what it costs"), never a fact about a business: no adjectives, numbers, places
 * or names. The last two ("sound", "like") are the connective of "this sounds like ...". Plural forms are listed; the screen reads each word the way it reads
 * the owner's (a plural "s" never decides a match). Anything not here and not a box title must still be the owner's own word.
 */
export const PLAIN_BOX_WORDS: readonly string[] = Object.freeze([
  'customer', 'customers', 'buyer', 'buyers', 'client', 'clients', 'sell', 'sells', 'offer', 'offers', 'price', 'prices', 'cost', 'costs',
  'problem', 'problems', 'solution', 'solutions', 'channel', 'channels', 'reach', 'measure', 'partner', 'partners', 'sound', 'sounds', 'like',
]);

/**
 * The product's own box vocabulary, derived from the source each call (never a hand list for the titles): the words of the nine box TITLES, plus the one fixed
 * list of plain box words above. Definition words are not allowed: a definition carries mechanism claims (per unit, renew, refer) that a question could
 * present as the owner's own business. A question may name its box with these words.
 */
export function boxVocabulary(): Set<string> {
  return contentWords(`${BOX_DEFINITIONS.map((b) => b.title).join('\n')}\n${PLAIN_BOX_WORDS.join(' ')}`);
}

/**
 * The first of the model's questions that may be shown. Every content word of it is a word the owner typed (their notes in this thread, never a file, a
 * link or another person's words) or a word of the product's own box vocabulary (so it can name the box it asks about; F5 follow-up, main session), every
 * number in it is one they typed, and it names nobody else. Anything else is not shown: the fixed question is.
 */
export function showableQuestion(s: Step, response: unknown): string | null {
  return screenQuestions(s, response).shown;
}

/**
 * P1653 TEMPORARY measurement (counts and fixed labels only, never a question or a word): why the model's own questions were refused. `raw` is how many
 * questions the MODEL wrote (the parse's own `questions` count is always nine, because it adds the module's fixed question for every empty box). Per question the
 * FIRST rule it failed: `shape` (empty, no content word, or the redirect question), `names`, `word` (a content word the owner never said and the box vocabulary does
 * not hold), `number`. For a word refusal, `off` is the count of offending words per question and `cats` counts the offending words by fixed category:
 * `plural` (the word with an s added or taken off is allowed: a stemming gap such as "cars" against "car"), `near_owner` (a one-edit typo, or the first four
 * letters, of a word the owner typed: "business" against "buisness", "sell" against "selling"), `other`.
 */
export interface F5Stats { raw: number; tried: number; shape: number; names: number; word: number; number: number; shown: number; off: number[]; cats: { plural: number; near_owner: number; other: number }; ownerWords: number }

const oneEdit = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const [x, y] = [a.slice(i), b.slice(i)];
  return x.slice(1) === y.slice(1) || x === y.slice(1) || x.slice(1) === y || (x[0] === y[1] && x[1] === y[0] && x.slice(2) === y.slice(2));
};
function wordCategory(w: string, allowed: ReadonlySet<string>, owner: ReadonlySet<string>): 'plural' | 'near_owner' | 'other' {
  if (allowed.has(`${w}s`) || (w.endsWith('s') && allowed.has(w.slice(0, -1)))) return 'plural';
  for (const o of owner) if (w.length >= 4 && o.length >= 4 && (w.slice(0, 4) === o.slice(0, 4) || oneEdit(w, o))) return 'near_owner';
  return 'other';
}

/** The first showable question and the counts of why the others were not (the screen itself: every rule, in its order, unchanged). */
export function screenQuestions(s: Step, response: unknown): { shown: string | null; stats: F5Stats } {
  const typed = s.material.items.filter((i) => i.owner && i.kind === 'note').map((i) => i.text).join('\n\n');
  const ownerWords = contentWords(typed);
  const theirs = new Set([...ownerWords, ...boxVocabulary()]);
  const namesOther = namesMatcher(s.run.other_names, derivedNames(s.material, s.run.owner_name));
  const asked = modelQuestionsOf(response);
  const stats: F5Stats = { raw: asked.length, tried: 0, shape: 0, names: 0, word: 0, number: 0, shown: 0, off: [], cats: { plural: 0, near_owner: 0, other: 0 }, ownerWords: ownerWords.size };
  for (const { question } of asked) {
    stats.tried += 1;
    const text = cleanFreeText(question, MAX_QUESTION_CHARS * 4);
    const words = contentWords(text);
    if (!text || words.size === 0) { stats.shape += 1; continue; }
    if (namesOther(text)) { stats.names += 1; continue; }
    const offending = [...words].filter((w) => !theirs.has(w));
    if (offending.length) {
      stats.word += 1;
      stats.off.push(offending.length);
      for (const w of offending) stats.cats[wordCategory(w, theirs, ownerWords)] += 1;
      continue;
    }
    if (!numbersSupported([text], numbersIn(typed))) { stats.number += 1; continue; }
    const shown = cutAtWord(text, MAX_QUESTION_CHARS);
    // A question whose last line is the redirect question would bring the two buttons to a reply that is not about a page. Asked of the model's raw text (a
    // last line of its own, before it is flattened to one line) AND of the text actually shown (after the cut), with the one function the client uses to show buttons.
    if (pageButtonsFor(question) || pageButtonsFor(shown)) { stats.shape += 1; continue; }
    stats.shown += 1;
    return { shown, stats };
  }
  return { shown: null, stats };
}

/** The domain of the last link whose page was only a redirect notice, as the owner wrote the link; null when there is none. */
export function thinRedirectDomain(links: ReadonlyArray<{ url: string; text: string }>): string | null {
  for (const l of [...links].reverse()) {
    if (!isThinRedirect(l.text)) continue;
    try { return new URL(l.url).hostname.replace(/^www\./i, ''); } catch { return null; }
  }
  return null;
}

/** One finished run with nothing changed (F1). Nothing was drafted, so no model cost beyond `usd`. */
export async function completeQuestion(s: Step, t: RunTools, reply: string, usd: number | null): Promise<RunSummary> {
  const { run, p, deps } = s;
  const { data, error } = await deps.rpc('_canvas_draft_run_complete_question', { p_run: run.run_id, p_owner: p.ownerId, p_reply: reply, p_usd: usd });
  if (error || !data) {
    console.error('canvas-draft: question write failed', { code: error?.code });
    return await t.failRun(deps, run, p, 'write', WORDS.write, usd);
  }
  const answered = data as { status?: string; code?: string };
  const closed = closedRun(answered);
  if (closed) return closed;
  if (answered.status !== 'ok') {
    console.error('canvas-draft: question write answered unknown status');
    return await t.failRun(deps, run, p, 'write', WORDS.write, usd);
  }
  console.log('canvas-draft: question done');
  return { state: 'done' };
}

/** The model wrote nothing on a first draft: the redirect-page question, the model's own question, or the fixed one. Always ends the run as finished. */
export function emptyAnswer(s: Step, t: RunTools, out: Extract<DraftOutcome, { ok: true }>, response: unknown, usd: number | null, cut: (r: string) => string): Promise<RunSummary> | null {
  // droppedNames also counts a question, a note or a focus the names screen refused: that is not a point refused for want of evidence, so it does not make this a refusal
  if (!(out.scope.length > 0 && out.total === 0 && out.droppedUnverified === 0) || s.kind !== 'message' || s.run.first_draft !== true || s.unreadable.length > 0) return null;
  // only a page read in THIS run is asked about: a page already in the material (the owner tapped Yes, or sent another message) is never asked about again, so there is no loop
  const domain = thinRedirectDomain(s.fresh ?? []);
  // no cut note here: the buttons are shown when the reply's LAST line is the question, and a page that was only a redirect notice was not cut
  if (domain) return completeQuestion(s, t, `${WORDS.redirectPage(domain)}\n${PAGE_BUTTONS.question}`, usd);
  const asked = showableQuestion(s, response);
  return completeQuestion(s, t, cut(asked ? `${WORDS.nothingChanged}\n${asked}` : WORDS.fallbackQuestion), usd);
}

// ── the two fixed buttons ───────────────────────────────────────────────────────────────────────────────────────────────────

const isTokenText = (t: ThreadItem) => t.kind === 'owner_message' && typeof t.text === 'string' && pageTokenOf(t.text) !== null;
/**
 * The thread without the messages that are button taps. A tap is identified by the MARKER the database wrote in the same transaction as the send (`canvas_workspace_send_tap`), never by
 * its text: typed words equal to a label are an ordinary owner message, remembered and used as material. A real tap adds no evidence, here or in any later run.
 */
export const withoutTaps = (thread: ThreadItem[], taps: ReadonlySet<string>): ThreadItem[] => thread.filter((t) => !(t.message_id && taps.has(t.message_id)));

type TapState = { taps?: unknown; newest_reply?: unknown; owner_after?: unknown };
async function tapStateOf(deps: Pick<RunDeps, 'rpc'>, p: RunParams, run: CanvasRun): Promise<TapState | null> {
  try {
    const { data, error } = await deps.rpc('_canvas_draft_tap_state', { p_run: run.run_id, p_owner: p.ownerId });
    return error || !data || typeof data !== 'object' ? null : (data as TapState);
  } catch { return null; }
}

export type TapResolution ={ tap: 'yes' | 'no' | 'stale' | 'error' | null; taps: ReadonlySet<string> };
const NO_TAPS: ReadonlySet<string> = new Set();

/**
 * Is the run's own message a tap that still counts? Only when the client marked it as one (and its text still equals the token), the draft is still a first
 * draft, the newest agent reply before it is the redirect question, and nobody wrote in the thread between that reply and the tap. A marked tap that fails any of
 * those is 'stale': it says so, changes nothing, uses no update, and reads no page. A message with no marker is never a tap (null), whatever it says. A failed
 * lookup is 'error' (the run fails as internal and Try again works). The database is asked only when some message of the thread equals a token.
 */
export async function resolveTap(deps: Pick<RunDeps, 'rpc'>, p: RunParams, run: CanvasRun, kind: string): Promise<TapResolution> {
  if (!run.thread.some(isTokenText)) return { tap: null, taps: NO_TAPS };
  const state = await tapStateOf(deps, p, run);
  if (!state) return { tap: 'error', taps: NO_TAPS };
  const taps = new Set(Array.isArray(state.taps) ? state.taps.filter((x): x is string => typeof x === 'string') : []);
  const trigger = run.thread.find((t) => t.is_trigger && t.kind === 'owner_message');
  const which = trigger && typeof trigger.text === 'string' ? pageTokenOf(trigger.text) : null;
  if (kind !== 'message' || !trigger?.message_id || !taps.has(trigger.message_id) || !which) return { tap: null, taps };
  const open = run.first_draft === true && typeof state.newest_reply === 'string' && pageButtonsFor(state.newest_reply) !== null && state.owner_after !== true;
  return { tap: open ? which : 'stale', taps };
}

/** A stale tap: the run fails (never counts as one of the 30, its message is not remembered) with the approved words. No model call was made: the ledger settles it like every other early exit. */
export const staleTap = (deps: Pick<RunDeps, 'rpc' | 'signal'>, run: CanvasRun, p: RunParams, t: RunTools, usd: number | null): Promise<RunSummary> =>
  t.failRun(deps, run, p, 'stale_button', WORDS.staleButton, usd);

/**
 * "Not mine" (a tap that counted) answers without a model call: it turns the redirect page into a tombstone in the draft's material (so no later run reads it,
 * from any thread or retry) and asks what the business does. With no such page left it is stale. "Yes" goes on to the draft with the tap itself left out.
 * Null: nothing to answer here.
 */
export function tapRun(s: Step, t: RunTools, tapped: 'yes' | 'no'): Promise<RunSummary> | null {
  if (tapped === 'yes') return null;
  const pages = s.run.material.filter((m) => m.kind === 'link' && isThinRedirect(m.text));
  return pages.length === 0 ? staleTap(s.deps, s.run, s.p, t, s.ledger.usd) : removePages(s, t, pages.flatMap((m) => (m.id ? [m.id] : [])));
}

async function removePages(s: Step, t: RunTools, ids: string[]): Promise<RunSummary> {
  const { run, p, deps } = s;
  const { error } = await deps.rpc('_canvas_draft_remove_material', { p_run: run.run_id, p_owner: p.ownerId, p_ids: ids });
  if (error) {
    console.error('canvas-draft: page not removed', { code: error.code });
    return await t.failRun(deps, run, p, 'write', WORDS.write, s.extra);
  }
  return await completeQuestion(s, t, WORDS.notMine, s.extra);
}

/** A failed run the database closed without a reply (not_offered at complete, transcript_failed at begin): its approved words, posted once. A failed post never changes the run's outcome. */
export async function postFailReply(rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>, runId: string, ownerId: string, words: string): Promise<void> {
  try { await rpc('_canvas_draft_fail_reply', { p_run: runId, p_owner: ownerId, p_reply: words }); } catch { /* the run already failed; the words are best effort */ }
}
