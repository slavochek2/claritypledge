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

import { readJson } from './canvas-read.ts';
import {
  BOX_TAGS, MAX_DECIDED, MAX_NOTE_CHARS, MAX_POINTS_PER_BOX, MAX_STATEMENT_CHARS, titleOf,
} from './canvas-draft.ts';
import { BOX_DEFINITIONS, emptyQuestionFor } from './canvas-box-definitions.ts';
import { effectiveScope, readExtras } from './canvas-extras.ts';
import { shedToValid, type Elem } from './canvas-final-state.ts';
import { clean, cutChars, normalizeForQuote, ownerHaystack, quoteIsOwnerSourced } from './canvas-source.ts';
import { derivedNames, namesMatcher } from './canvas-names.ts';
import { numbersIn, numbersSupported, sharesWords } from './canvas-support.ts';
import { groundPriceTerms, priceWordsOf, withPriceGap, type PriceWords } from './canvas-price.ts';
import { withSectionsDecided } from './canvas-copy-sections.ts';
import type {
  BasePoint, Decided, DraftCounts, DraftOutcome, DraftPoint, ParseContext, ResolvedAction,
} from './canvas-types.ts';

// ── Building the version ────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

interface Acc {
  actions: ResolvedAction[];
  decided: Decided[];
  counts: DraftCounts;
  addressed: Set<string>;
  dropped: number;
  droppedUnverified: number;
  /** A revenue point was left out because none of its price terms could be kept: the box asks, whatever else it holds. */
  priceDropped: boolean;
  droppedNames: number;
  droppedScope: number;
  /** Actions refused because their box would hold more than the cap, or would hold the same words twice. */
  droppedCap: number;
  /** Boxes a drop removed a point from. */
  changed: Set<string>;
}

interface Ctx {
  base: Map<string, BasePoint>;
  from: string;
  haystack: string;
  namesOther: (text: string) => boolean;
  /** Every number the owner's own words and canvas already hold. */
  numbers: ReadonlySet<string>;
  /** What a price's unit or cadence may rest on. */
  priceWords: PriceWords;
  /** Draft points an earlier run made from a base point (a reword or a move), by that base point's id. */
  derived: ReadonlyMap<string, DraftPoint>;
  /** The boxes this run may change. */
  scope: ReadonlySet<string>;
  /** Boxes rebuilt by this run: their current points are not kept. */
  rebuild: ReadonlySet<string>;
}

const REVENUE = 'canvas:revenue';

const newAcc = (): Acc => ({
  actions: [], decided: [], counts: { kept: 0, reworded: 0, moved: 0, added: 0, dropped: 0 },
  addressed: new Set(), dropped: 0, droppedUnverified: 0, priceDropped: false, droppedNames: 0,
  droppedScope: 0, droppedCap: 0, changed: new Set(),
});

const sameText = (a: string, b: string) => normalizeForQuote(a) === normalizeForQuote(b);
const isBox = (v: unknown): v is string => typeof v === 'string' && BOX_TAGS.has(v);

/** What the owner is told when a link could not be made. */
function linkNote(old: BasePoint, box: string, how: string, from: string): Decided {
  const text = old.is_head === false
    ? `${titleOf(box)}: new point (the earlier one was already replaced, so no link)`
    : `${titleOf(box)}: ${how}`;
  return { kind: 'link', text: old.is_head === false ? text : text.replace('{from}', () => from) };
}

/** A point the run may keep: in scope, and not in a box this run rebuilds. */
const keepable = (ctx: Ctx, p: BasePoint) => ctx.scope.has(p.box) && !ctx.rebuild.has(p.box);

function applyDrop(acc: Acc, ctx: Ctx, a: Raw, old: BasePoint | undefined): void {
  if (!old || acc.addressed.has(old.id)) return;
  if (!ctx.scope.has(old.box)) { acc.droppedScope += 1; return; }
  acc.addressed.add(old.id);
  acc.dropped += 1;
  acc.changed.add(old.box);
  let why = typeof a.why === 'string' ? clean(a.why, MAX_NOTE_CHARS) : '';
  // the reason reaches the notes and the posted reply: the same name filter as a conflict; the drop itself stands
  if (why && ctx.namesOther(why)) { acc.droppedNames += 1; why = ''; }
  acc.decided.push({ kind: 'drop', text: `${titleOf(old.box)}: dropped "${cutChars(old.statement, 80)}"${why ? `, because ${why}` : ''}` });
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

// ── The intended final state, then its check ───────────────────────────────

const baseElem = (p: BasePoint, idx: number): Elem => ({ box: p.box, statement: p.statement, origin: 'base', baseId: p.id, idx });

/** A reword with the same words is a keep (a keep is refused in a rebuilt box); with nothing to reword, nothing. */
function rewordAsKeep(acc: Acc, ctx: Ctx, old: BasePoint | undefined, box: string, statement: string, idx: number): Elem | null | 'write' {
  const gate = rewordGate(acc, old, box, statement);
  if (gate === 'go') return 'write';
  if (gate === 'skip' || !old) return null;
  if (!keepable(ctx, old)) { acc.droppedScope += 1; return null; }
  acc.addressed.add(old.id);
  return baseElem(old, idx);
}

/** A reword or a new point, vetted (quote, names, support) but not yet checked for room or repeats. */
function intendWrite(acc: Acc, ctx: Ctx, act: 'reword' | 'new', a: Raw, old: BasePoint | undefined, idx: number): Elem | null {
  const box = a.box;
  if (!isBox(box) || typeof a.statement !== 'string') return null;
  const cleaned = clean(a.statement, MAX_STATEMENT_CHARS);
  const statement = box === REVENUE ? groundPriceTerms(cleaned, ctx.priceWords.owner, ctx.priceWords.answer) : cleaned;
  if (!statement) { if (cleaned) { acc.droppedUnverified += 1; if (box === REVENUE) acc.priceDropped = true; } return null; } // nothing certain left of a price point: counted, and the box asks
  if (!ctx.scope.has(box) || (act === 'reword' && old && !ctx.scope.has(old.box))) { acc.droppedScope += 1; return null; }
  if (act === 'reword') {
    const kept = rewordAsKeep(acc, ctx, old, box, statement, idx);
    if (kept !== 'write') return kept;
  }
  if (!vetEvidence(acc, ctx, a, statement, act === 'reword' && old ? rewordSource(ctx, old, statement) : '')) return null;
  if (act === 'new') return { box, statement, origin: 'new', idx };
  if (!old) return null;
  acc.addressed.add(old.id);
  return { box, statement, origin: 'reword', baseId: old.id, idx };
}

/** Same words, other box: the words come from the stored point, never from the model. A point already spoken for (an earlier move, a drop) is not moved again: the rest is dropped and counted. */
function intendMove(acc: Acc, ctx: Ctx, a: Raw, old: BasePoint | undefined, idx: number): Elem | null {
  const box = a.box;
  if (!old || !isBox(box) || box === old.box) return null;
  if (acc.addressed.has(old.id) || !ctx.scope.has(old.box) || !ctx.scope.has(box)) { acc.droppedScope += 1; return null; }
  acc.addressed.add(old.id);
  return { box, statement: old.statement, origin: 'move', baseId: old.id, idx };
}

function intendOne(acc: Acc, ctx: Ctx, a: Raw, idx: number): Elem | null {
  const old = typeof a.point_id === 'string' ? ctx.base.get(a.point_id) : undefined;
  if (a.action === 'drop') { applyDrop(acc, ctx, a, old); return null; }
  if (a.action === 'move') return intendMove(acc, ctx, a, old, idx);
  return a.action === 'reword' || a.action === 'new' ? intendWrite(acc, ctx, a.action, a, old, idx) : null;
}

/** The points the model named to keep go first, then every other action in the model's order, then the points nobody named (they stay). */
function intend(acc: Acc, ctx: Ctx, pc: ParseContext, raw: Raw[]): Elem[] {
  const elems: Elem[] = [];
  for (const a of raw) {
    const p = a.action === 'keep' && typeof a.point_id === 'string' ? ctx.base.get(a.point_id) : undefined;
    if (p && !acc.addressed.has(p.id) && keepable(ctx, p)) { acc.addressed.add(p.id); elems.push(baseElem(p, -1)); }
    else if (p && !keepable(ctx, p) && !ctx.rebuild.has(p.box)) acc.droppedScope += 1;
  }
  raw.forEach((a, idx) => { const e = intendOne(acc, ctx, a, idx); if (e) elems.push(e); });
  for (const p of pc.basePoints) if (!acc.addressed.has(p.id) && keepable(ctx, p)) elems.push(baseElem(p, -1));
  return elems;
}

/** What a refused action leaves: its current point as it was (nothing in a box this run rebuilds), or nothing for a new point. */
const revertOf = (ctx: Ctx) => (e: Elem): Elem | null => {
  const old = e.baseId ? ctx.base.get(e.baseId) : undefined;
  return old && e.origin !== 'base' && e.origin !== 'new' && keepable(ctx, old) ? baseElem(old, e.idx) : null;
};

/** The accepted elements as the actions the write applies, with the counters. */
function emit(acc: Acc, ctx: Ctx, elems: Elem[]): void {
  for (const e of elems) {
    const old = e.baseId ? ctx.base.get(e.baseId) : undefined;
    if (e.origin === 'base' && e.baseId) { acc.actions.push({ action: 'keep', point_id: e.baseId }); acc.counts.kept += 1; }
    else if (e.origin === 'new') { acc.actions.push({ action: 'new', box: e.box, statement: e.statement, story: null }); acc.counts.added += 1; }
    else if (e.origin === 'reword' && old) {
      acc.actions.push({ action: 'reword', old_point_id: old.id, box: e.box, statement: e.statement, story: null });
      acc.counts.reworded += 1;
      acc.decided.push(linkNote(old, e.box, 'reworded from {from}', ctx.from));
    } else if (e.origin === 'move' && old) {
      acc.actions.push({ action: 'move', old_point_id: old.id, box: e.box, statement: old.statement, story: null });
      acc.counts.moved += 1;
      acc.decided.push(linkNote(old, e.box, `moved here from ${titleOf(old.box)}, {from}`, ctx.from));
    }
  }
  acc.counts.dropped = acc.dropped;
}

/** All the model's actions: the intended final canvas, made valid, then emitted. An empty scope changes nothing and every action is dropped, and counted. */
function applyAll(acc: Acc, ctx: Ctx, pc: ParseContext, actions: unknown[], inScope: boolean): void {
  const raw = (inScope ? actions : []).map((r) => (r ?? {}) as Raw);
  if (!inScope) acc.droppedScope += actions.length;
  const shed = shedToValid(intend(acc, ctx, pc, raw), { max: MAX_POINTS_PER_BOX, key: normalizeForQuote, revert: revertOf(ctx) });
  acc.droppedCap += shed.refusedRepeats + shed.refusedCapacity;
  emit(acc, ctx, shed.elems);
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

/** Boxes that hold a point after the run: out-of-scope current points stay untouched, scoped ones are what the actions leave. */
function boxesHolding(pc: ParseContext, acc: Acc, ctx: Ctx): Set<string> {
  const filled = filledBoxes(acc.actions, ctx.base);
  for (const p of pc.basePoints) if (!ctx.scope.has(p.box)) filled.add(p.box);
  return filled;
}

/** Boxes the run wrote to, moved out of, dropped from or rebuilt. */
function changedBoxesOf(acc: Acc, ctx: Ctx, basePoints: readonly BasePoint[]): string[] {
  const changed = new Set(acc.changed);
  for (const a of acc.actions) {
    if (a.action === 'keep') continue;
    changed.add(a.box);
    const old = 'old_point_id' in a ? ctx.base.get(a.old_point_id) : undefined;
    if (old) changed.add(old.box);
  }
  for (const p of basePoints) if (ctx.rebuild.has(p.box) && ctx.scope.has(p.box)) changed.add(p.box);
  return BOX_DEFINITIONS.map((b) => b.tag).filter((t) => changed.has(t));
}

/** What every check of one parse needs, built once. */
function buildCtx(pc: ParseContext, scope: readonly string[]): Ctx {
  const haystack = ownerHaystack(pc.material);
  const ownCanvas = [...pc.basePoints, ...(pc.draftPoints ?? [])].map((p) => `${p.statement} ${p.story ?? ''}`).join('\n');
  return {
    base: new Map(pc.basePoints.map((p) => [p.id, p])),
    from: pc.baseLabel ?? 'the earlier version',
    haystack,
    namesOther: namesMatcher(pc.otherNames, derivedNames(pc.material, pc.ownerName)),
    numbers: new Set([...numbersIn(haystack), ...numbersIn(ownCanvas)]),
    priceWords: priceWordsOf(`${haystack}\n${normalizeForQuote(ownCanvas)}`, pc.material, pc.basePoints.length > 0),
    derived: new Map((pc.draftPoints ?? []).filter((d) => d.from_point_id).map((d) => [d.from_point_id as string, d])),
    scope: new Set(scope),
    rebuild: new Set(pc.rebuild ?? []),
  };
}

export function parseDraft(response: unknown, pc: ParseContext): DraftOutcome {
  const read = readJson(response);
  if (!read.ok) return read;
  const body = withSectionsDecided((read.parsed ?? {}) as Raw, pc.sections);
  if (!Array.isArray(body.actions)) return { ok: false, code: 'unparsable', costUsd: read.costUsd };
  const scope = effectiveScope(pc, body.scope);
  const ctx = buildCtx(pc, scope);
  const acc = newAcc();
  applyAll(acc, ctx, pc, body.actions, scope.length > 0);
  collectConflicts(acc, body.conflicts, ctx.namesOther);
  const filled = boxesHolding(pc, acc, ctx);
  const emptyBoxes = BOX_DEFINITIONS.map((b) => b.tag).filter((t) => !filled.has(t));
  const extras = readExtras(body, pc, ctx.scope, scope.length ? emptyBoxes.filter((t) => ctx.scope.has(t)) : [], ctx.namesOther);
  return {
    ok: true, actions: acc.actions, decided: acc.decided, counts: acc.counts, total: acc.actions.length, emptyBoxes,
    droppedUnverified: acc.droppedUnverified, droppedNames: acc.droppedNames + extras.droppedNames, costUsd: read.costUsd,
    scope, changedBoxes: changedBoxesOf(acc, ctx, pc.basePoints), droppedScope: acc.droppedScope + extras.droppedScope, droppedCap: acc.droppedCap,
    focus: extras.focus, focusReason: extras.focusReason, otherCanvases: extras.otherCanvases, questions: scope.length ? withPriceGap(extras.questions, acc.actions, REVENUE, ctx.priceWords.owner, acc.priceDropped) : {}, note: extras.note,
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
