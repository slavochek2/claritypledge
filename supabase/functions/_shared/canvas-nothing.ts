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
import { PAGE_BUTTONS, WORDS, pageTokenOf } from './canvas-reply-table.ts';
import type { RunSummary, Step, ThreadItem } from './canvas-run.ts';
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
 * The product's own box vocabulary, derived from the source each call (never a hand list): the words of every box's title, type, voice and definition.
 * Examples (`good`, `not`, `shape`) are left out on purpose, since they hold sample facts. A question may name its box with these words.
 */
export function boxVocabulary(): Set<string> {
  return contentWords(BOX_DEFINITIONS.map((b) => `${b.title} ${b.type} ${b.voice} ${b.definition}`).join('\n'));
}

/**
 * The first of the model's questions that may be shown. Every content word of it is a word the owner typed (their notes in this thread, never a file, a
 * link or another person's words) or a word of the product's own box vocabulary (so it can name the box it asks about; F5 follow-up, main session), every
 * number in it is one they typed, and it names nobody else. Anything else is not shown: the fixed question is.
 */
export function showableQuestion(s: Step, response: unknown): string | null {
  const typed = s.material.items.filter((i) => i.owner && i.kind === 'note').map((i) => i.text).join('\n\n');
  const theirs = new Set([...contentWords(typed), ...boxVocabulary()]);
  const namesOther = namesMatcher(s.run.other_names, derivedNames(s.material, s.run.owner_name));
  for (const { question } of modelQuestionsOf(response)) {
    const text = cleanFreeText(question, MAX_QUESTION_CHARS * 4);
    const words = contentWords(text);
    if (!text || words.size === 0 || namesOther(text) || ![...words].every((w) => theirs.has(w)) || !numbersSupported([text], numbersIn(typed))) continue;
    return cutAtWord(text, MAX_QUESTION_CHARS);
  }
  return null;
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
export function emptyAnswer(s: Step, t: RunTools, out: Extract<DraftOutcome, { ok: true }>, response: unknown, usd: number | null, cut: (r: string) => string, tapped: 'yes' | 'no' | null): Promise<RunSummary> | null {
  // droppedNames also counts a question, a note or a focus the names screen refused: that is not a point refused for want of evidence, so it does not make this a refusal
  if (!(out.scope.length > 0 && out.total === 0 && out.droppedUnverified === 0) || s.kind !== 'message' || s.run.first_draft !== true || s.unreadable.length > 0) return null;
  const domain = tapped === 'yes' ? null : thinRedirectDomain(s.input.links);
  // no cut note here: the buttons are shown when the reply's LAST line is the question, and a page that was only a redirect notice was not cut
  if (domain) return completeQuestion(s, t, `${WORDS.redirectPage(domain)}\n${PAGE_BUTTONS.question}`, usd);
  const asked = showableQuestion(s, response);
  return completeQuestion(s, t, cut(asked ? `${WORDS.nothingChanged}\n${asked}` : WORDS.fallbackQuestion), usd);
}

// ── the two fixed buttons ───────────────────────────────────────────────────────────────────────────────────────────────────

const isToken = (t: ThreadItem) => t.kind === 'owner_message' && typeof t.text === 'string' && pageTokenOf(t.text) !== null;
/** The thread without any button tap: a tap is never owner material (it adds no evidence), here or in any later run. */
export const withoutTaps = (thread: ThreadItem[]): ThreadItem[] => thread.filter((t) => !isToken(t));
/** Which button the run's own message is, or null. */
export const tappedBy = (thread: ThreadItem[]): 'yes' | 'no' | null => {
  const trigger = thread.find((t) => t.is_trigger && t.kind === 'owner_message');
  return trigger && typeof trigger.text === 'string' ? pageTokenOf(trigger.text) : null;
};

/**
 * A run whose message is "Not mine" (or a tap that is stale) answers without a model call. "Not mine" takes the redirect page out of the draft's material
 * and asks what the business does, so no later run reads the page. A tap on a draft that has moved on (it has points or a focus), or with no such page left,
 * says so and changes nothing. "Yes" on a first draft goes on to the draft, with the tap itself left out. Null: not a tap this function answers.
 */
export function tapRun(s: Step, t: RunTools, tapped: 'yes' | 'no'): Promise<RunSummary> | null {
  if (s.kind !== 'message') return null;
  const pages = s.run.material.filter((m) => m.kind === 'link' && isThinRedirect(m.text));
  if (s.run.first_draft !== true || (tapped === 'no' && pages.length === 0)) return completeQuestion(s, t, WORDS.staleButton, s.extra);
  if (tapped === 'yes') return null;
  return removePages(s, t, pages.flatMap((m) => (m.id ? [m.id] : [])));
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
