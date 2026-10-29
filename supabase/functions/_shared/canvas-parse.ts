/**
 * P1536: what comes back from the model, checked before anything is written.
 *
 *  - Nothing invented: a NEW or REWORDED point must carry a verbatim quote found in OWNER-sourced text.
 *  - No other people: a point or note containing one of `other_names` is dropped.
 *  - The model chooses among fixed actions on ids it was given. Anything else it says is ignored, so material
 *    cannot name a canvas, a visibility or an owner.
 *  - Points only: the model is not asked for a story and every action leaves with `story: null`.
 *
 *  - Supported: a statement shares at least two content words with the quote it cites, and every number in a
 *    statement is a number the owner's own material (or their current canvas) holds. A real quote
 *    carrying an unrelated invented claim is dropped, not written.
 *
 * Pure: no Deno or esm.sh imports.
 */

import { costUsd, type GeminiUsage } from './mirror-agent.ts';
import {
  BOX_TAGS, MAX_DECIDED, MAX_NOTE_CHARS, MAX_POINTS_PER_BOX, MAX_STATEMENT_CHARS, titleOf,
} from './canvas-draft.ts';
import { BOX_DEFINITIONS, emptyQuestionFor } from './canvas-box-definitions.ts';
import { clean, cutChars, normalizeForQuote, ownerHaystack, quoteIsOwnerSourced } from './canvas-source.ts';
import { derivedNames, namesMatcher } from './canvas-names.ts';
import { numbersIn, numbersSupported, sharesWords } from './canvas-support.ts';
import type {
  BasePoint, Decided, DraftCounts, DraftOutcome, DraftPoint, Failure, ParseContext, ResolvedAction,
} from './canvas-types.ts';

// ── The model's JSON ────────────────────────────────────────────────────────

const BLOCKED_FINISH = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'];

interface RawResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }>;
  usageMetadata?: GeminiUsage;
}

function answerText(r: RawResponse): string {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => p && p.thought !== true && typeof p.text === 'string').map((p) => p.text as string).join('').trim();
}

function readJson(response: unknown): { ok: true; parsed: unknown; costUsd: number | null } | Failure {
  const r = (response ?? {}) as RawResponse;
  const cost = costUsd(r.usageMetadata);
  const finish = r.candidates?.[0]?.finishReason;
  if (r.promptFeedback?.blockReason || (finish && BLOCKED_FINISH.includes(finish))) return { ok: false, code: 'blocked', costUsd: cost };
  const text = answerText(r);
  if (!text) return { ok: false, code: 'empty', costUsd: cost };
  try {
    return { ok: true, parsed: JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), costUsd: cost };
  } catch {
    return { ok: false, code: 'unparsable', costUsd: cost };
  }
}

// ── Building the version ────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

interface Acc {
  actions: ResolvedAction[];
  decided: Decided[];
  counts: DraftCounts;
  perBox: Map<string, number>;
  statements: Set<string>;
  addressed: Set<string>;
  dropped: number;
  droppedUnverified: number;
  droppedNames: number;
}

interface Ctx {
  base: Map<string, BasePoint>;
  from: string;
  haystack: string;
  namesOther: (text: string) => boolean;
  /** Every number the owner's own words and canvas already hold. */
  numbers: ReadonlySet<string>;
  /** Draft points an earlier run made from a base point (a reword or a move), by that base point's id. */
  derived: ReadonlyMap<string, DraftPoint>;
}

const newAcc = (): Acc => ({
  actions: [], decided: [], counts: { kept: 0, reworded: 0, moved: 0, added: 0, dropped: 0 },
  perBox: new Map(), statements: new Set(), addressed: new Set(), dropped: 0, droppedUnverified: 0, droppedNames: 0,
});

const sameText = (a: string, b: string) => normalizeForQuote(a) === normalizeForQuote(b);
const stmtKey = (box: string, s: string) => `${box}\u0000${normalizeForQuote(s)}`;
const countIn = (acc: Acc, box: string) => acc.perBox.get(box) ?? 0;
const place = (acc: Acc, box: string, statement: string) => {
  acc.perBox.set(box, countIn(acc, box) + 1);
  acc.statements.add(stmtKey(box, statement));
};
const isBox = (v: unknown): v is string => typeof v === 'string' && BOX_TAGS.has(v);

/** What the owner is told when a link could not be made. */
function linkNote(old: BasePoint, box: string, how: string, from: string): Decided {
  const text = old.is_head === false
    ? `${titleOf(box)}: new point (the earlier one was already replaced, so no link)`
    : `${titleOf(box)}: ${how}`;
  return { kind: 'link', text: old.is_head === false ? text : text.replace('{from}', () => from) };
}

function keepPoint(acc: Acc, p: BasePoint): void {
  acc.addressed.add(p.id);
  acc.actions.push({ action: 'keep', point_id: p.id });
  acc.counts.kept += 1;
  place(acc, p.box, p.statement);
}

function applyDrop(acc: Acc, ctx: Ctx, a: Raw, old: BasePoint | undefined): void {
  if (!old || acc.addressed.has(old.id)) return;
  acc.addressed.add(old.id);
  acc.dropped += 1;
  let why = typeof a.why === 'string' ? clean(a.why, MAX_NOTE_CHARS) : '';
  // the reason reaches the notes and the posted reply: the same name filter as a conflict; the drop itself stands
  if (why && ctx.namesOther(why)) { acc.droppedNames += 1; why = ''; }
  acc.decided.push({ kind: 'drop', text: `${titleOf(old.box)}: dropped "${cutChars(old.statement, 80)}"${why ? `, because ${why}` : ''}` });
}

/** Same words, other box: the words come from the stored point, never from the model. */
function applyMove(acc: Acc, ctx: Ctx, a: Raw, old: BasePoint | undefined): void {
  const box = a.box;
  if (!old || acc.addressed.has(old.id) || !isBox(box) || box === old.box) return;
  if (countIn(acc, box) >= MAX_POINTS_PER_BOX) return;
  acc.addressed.add(old.id);
  acc.actions.push({ action: 'move', old_point_id: old.id, box, statement: old.statement, story: null });
  acc.counts.moved += 1;
  place(acc, box, old.statement);
  acc.decided.push(linkNote(old, box, `moved here from ${titleOf(old.box)}, {from}`, ctx.from));
}

/** For a reword: is there a point to reword, in the same box? 'keep' when the words did not change. */
function rewordGate(acc: Acc, old: BasePoint | undefined, box: string, statement: string): 'skip' | 'keep' | 'go' {
  if (!old || acc.addressed.has(old.id) || old.box !== box) return 'skip';
  return sameText(statement, old.statement) ? 'keep' : 'go';
}

/**
 * The owner-quote rule, the name filter and the support rule, in that order (a name is told as a name even when the
 * point is also unsupported). True when the point may be written; a refusal is counted.
 */
function vetEvidence(acc: Acc, ctx: Ctx, a: Raw, statement: string, extraSource = ''): boolean {
  if (!quoteIsOwnerSourced(a.quote, extraSource ? `${ctx.haystack}\n${normalizeForQuote(extraSource)}` : ctx.haystack)) { acc.droppedUnverified += 1; return false; }
  if (ctx.namesOther(statement)) { acc.droppedNames += 1; return false; }
  if (!(sharesWords(statement, String(a.quote)) && numbersSupported([statement], ctx.numbers))) { acc.droppedUnverified += 1; return false; }
  return true;
}

/**
 * Saying an earlier run's reword again: the draft point made from this base point, with exactly these words, was
 * vetted when it was written, and its own words (and the base point's) are an allowed quote source for this one
 * reword and no other. A different wording, or another base point, gets nothing: it needs the owner's quote.
 */
function rewordSource(ctx: Ctx, old: BasePoint, statement: string): string {
  const d = ctx.derived.get(old.id);
  if (!d || d.relation !== 'reword' || !sameText(d.statement, statement)) return '';
  return [old.statement, old.story, d.statement, d.story].filter(Boolean).join('\n');
}

function applyWrite(acc: Acc, ctx: Ctx, act: 'reword' | 'new', a: Raw, old: BasePoint | undefined): void {
  const box = a.box;
  if (!isBox(box) || typeof a.statement !== 'string') return;
  const statement = clean(a.statement, MAX_STATEMENT_CHARS);
  if (!statement) return;
  if (act === 'reword') {
    const gate = rewordGate(acc, old, box, statement);
    if (gate === 'skip') return;
    if (gate === 'keep' && old) { keepPoint(acc, old); return; }
  }
  const vetted = vetEvidence(acc, ctx, a, statement, act === 'reword' && old ? rewordSource(ctx, old, statement) : '');
  if (!vetted || acc.statements.has(stmtKey(box, statement))) return;
  if (act === 'new') {
    if (countIn(acc, box) >= MAX_POINTS_PER_BOX) return;
    acc.actions.push({ action: 'new', box, statement, story: null });
    acc.counts.added += 1;
  } else if (old) {
    acc.addressed.add(old.id);
    acc.actions.push({ action: 'reword', old_point_id: old.id, box, statement, story: null });
    acc.counts.reworded += 1;
    acc.decided.push(linkNote(old, box, 'reworded from {from}', ctx.from));
  }
  place(acc, box, statement);
}

function applyAction(acc: Acc, ctx: Ctx, a: Raw): void {
  const old = typeof a.point_id === 'string' ? ctx.base.get(a.point_id) : undefined;
  if (a.action === 'drop') applyDrop(acc, ctx, a, old);
  else if (a.action === 'move') applyMove(acc, ctx, a, old);
  else if (a.action === 'reword' || a.action === 'new') applyWrite(acc, ctx, a.action, a, old);
}

function collectConflicts(acc: Acc, conflicts: unknown, namesOther: (t: string) => boolean): void {
  if (!Array.isArray(conflicts)) return;
  let taken = 0;
  for (const c of conflicts) {
    if (taken >= MAX_DECIDED) break;
    const text = typeof c === 'string' ? clean(c, MAX_NOTE_CHARS) : '';
    if (!text) continue;
    if (namesOther(text)) { acc.droppedNames += 1; continue; }
    acc.decided.push({ kind: 'conflict', text });
    taken += 1;
  }
}

function filledBoxes(actions: ResolvedAction[], base: Map<string, BasePoint>): Set<string> {
  const filled = new Set<string>();
  for (const a of actions) {
    const box = a.action === 'keep' ? base.get(a.point_id)?.box : a.box;
    if (box) filled.add(box);
  }
  return filled;
}

export function parseDraft(response: unknown, pc: ParseContext): DraftOutcome {
  const read = readJson(response);
  if (!read.ok) return read;
  const body = (read.parsed ?? {}) as { actions?: unknown; conflicts?: unknown };
  if (!Array.isArray(body.actions)) return { ok: false, code: 'unparsable', costUsd: read.costUsd };
  const haystack = ownerHaystack(pc.material);
  const ownCanvas = [...pc.basePoints, ...(pc.draftPoints ?? [])].map((p) => `${p.statement} ${p.story ?? ''}`).join('\n');
  const ctx: Ctx = {
    base: new Map(pc.basePoints.map((p) => [p.id, p])),
    from: pc.baseLabel ?? 'the earlier version',
    haystack,
    namesOther: namesMatcher(pc.otherNames, derivedNames(pc.material, pc.ownerName)),
    numbers: new Set([...numbersIn(haystack), ...numbersIn(ownCanvas)]),
    derived: new Map((pc.draftPoints ?? []).filter((d) => d.from_point_id).map((d) => [d.from_point_id as string, d])),
  };
  const acc = newAcc();
  const raw = body.actions.map((r) => (r ?? {}) as Raw);
  // The points that stay as they are go first, so the per-box counts are true before anything is added.
  for (const a of raw) {
    const p = a.action === 'keep' && typeof a.point_id === 'string' ? ctx.base.get(a.point_id) : undefined;
    if (p && !acc.addressed.has(p.id)) keepPoint(acc, p);
  }
  for (const a of raw) applyAction(acc, ctx, a);
  // A current point the model did not mention, or whose change failed a check, stays as it is.
  for (const p of pc.basePoints) if (!acc.addressed.has(p.id)) keepPoint(acc, p);
  acc.counts.dropped = acc.dropped;
  collectConflicts(acc, body.conflicts, ctx.namesOther);
  const filled = filledBoxes(acc.actions, ctx.base);
  return {
    ok: true, actions: acc.actions, decided: acc.decided, counts: acc.counts, total: acc.actions.length,
    emptyBoxes: BOX_DEFINITIONS.map((b) => b.tag).filter((t) => !filled.has(t)),
    droppedUnverified: acc.droppedUnverified, droppedNames: acc.droppedNames, costUsd: read.costUsd,
  };
}

/** What the owner is asked when a box stays empty: { box tag: question }, shown to the owner only. */
export function questionsFor(emptyBoxes: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of emptyBoxes) {
    const q = emptyQuestionFor(tag);
    if (q) out[tag] = q;
  }
  return out;
}
