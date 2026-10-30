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
import { clean, cutChars, normalizeForQuote, ownerHaystack, quoteIsOwnerSourced } from './canvas-source.ts';
import { derivedNames, namesMatcher } from './canvas-names.ts';
import { numbersIn, numbersSupported, sharesWords } from './canvas-support.ts';
import type {
  BasePoint, Decided, DraftCounts, DraftOutcome, DraftPoint, ParseContext, ResolvedAction,
} from './canvas-types.ts';

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
  droppedScope: number;
  /** New or moved points refused because the box was already full once the points that stay were counted. */
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
  /** Draft points an earlier run made from a base point (a reword or a move), by that base point's id. */
  derived: ReadonlyMap<string, DraftPoint>;
  /** The boxes this run may change. */
  scope: ReadonlySet<string>;
  /** Boxes rebuilt by this run: their current points are not kept. */
  rebuild: ReadonlySet<string>;
}

const newAcc = (): Acc => ({
  actions: [], decided: [], counts: { kept: 0, reworded: 0, moved: 0, added: 0, dropped: 0 },
  perBox: new Map(), statements: new Set(), addressed: new Set(), dropped: 0, droppedUnverified: 0, droppedNames: 0,
  droppedScope: 0, droppedCap: 0, changed: new Set(),
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

/** A point the run may keep: in scope, and not in a box this run rebuilds. */
const keepable = (ctx: Ctx, p: BasePoint) => ctx.scope.has(p.box) && !ctx.rebuild.has(p.box);

/**
 * Room left in a box: its cap, less the points placed so far, less the current points no action has named yet (they stay unless an action
 * replaces them, so they hold their place). When the box is full the NEW or MOVED point loses, and is counted.
 */
const roomIn = (acc: Acc, ctx: Ctx, box: string) =>
  MAX_POINTS_PER_BOX - countIn(acc, box) - [...ctx.base.values()].filter((p) => p.box === box && !acc.addressed.has(p.id) && keepable(ctx, p)).length;

function keepPoint(acc: Acc, p: BasePoint): void {
  acc.addressed.add(p.id);
  acc.actions.push({ action: 'keep', point_id: p.id });
  acc.counts.kept += 1;
  place(acc, p.box, p.statement);
}

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

/** Same words, other box: the words come from the stored point, never from the model. */
function applyMove(acc: Acc, ctx: Ctx, a: Raw, old: BasePoint | undefined): void {
  const box = a.box;
  if (!old || acc.addressed.has(old.id) || !isBox(box) || box === old.box) return;
  if (!ctx.scope.has(old.box) || !ctx.scope.has(box)) { acc.droppedScope += 1; return; } // both the source and the destination must be in scope
  if (roomIn(acc, ctx, box) <= 0) { acc.droppedCap += 1; return; }
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
  if (!ctx.scope.has(box) || (act === 'reword' && old && !ctx.scope.has(old.box))) { acc.droppedScope += 1; return; }
  if (act === 'reword') {
    const gate = rewordGate(acc, old, box, statement);
    if (gate === 'skip') return;
    if (gate === 'keep' && old) {
      if (keepable(ctx, old)) { keepPoint(acc, old); return; }
      acc.droppedScope += 1; // a rebuilt box refuses `keep`, and a reword that says the same words is a keep: refused and counted, not written as new
      return;
    }
  }
  const vetted = vetEvidence(acc, ctx, a, statement, act === 'reword' && old ? rewordSource(ctx, old, statement) : '');
  if (!vetted || acc.statements.has(stmtKey(box, statement))) return;
  if (act === 'new') {
    if (roomIn(acc, ctx, box) <= 0) { acc.droppedCap += 1; return; }
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
    derived: new Map((pc.draftPoints ?? []).filter((d) => d.from_point_id).map((d) => [d.from_point_id as string, d])),
    scope: new Set(scope),
    rebuild: new Set(pc.rebuild ?? []),
  };
}

/** The points that stay as they are go first, so the per-box counts are true before anything is added. */
function keepNamedPoints(acc: Acc, ctx: Ctx, raw: Raw[]): void {
  for (const a of raw) {
    const p = a.action === 'keep' && typeof a.point_id === 'string' ? ctx.base.get(a.point_id) : undefined;
    if (p && !acc.addressed.has(p.id) && keepable(ctx, p)) keepPoint(acc, p);
    else if (p && !keepable(ctx, p) && !ctx.rebuild.has(p.box)) acc.droppedScope += 1;
  }
}

/**
 * Capacity is the box's FINAL occupancy, so what leaves a box (a drop, a reword, a move out) is applied before what comes in (a move in, a
 * new point): [new, drop] and [drop, new] give the same result.
 */
const phase = (a: Raw) => ({ drop: 0, reword: 1, move: 2, new: 3 } as Record<string, number>)[String(a.action)] ?? 4;

/** All the model's actions, applied to the accumulator; a current point in scope that nothing changed stays as it is. */
function applyAll(acc: Acc, ctx: Ctx, pc: ParseContext, actions: unknown[], inScope: boolean): void {
  // An empty scope changes nothing: every action the model supplied is dropped, and counted.
  const raw = (inScope ? actions : []).map((r) => (r ?? {}) as Raw);
  if (!inScope) acc.droppedScope += actions.length;
  keepNamedPoints(acc, ctx, raw);
  for (const a of [...raw].sort((x, y) => phase(x) - phase(y))) applyAction(acc, ctx, a);
  for (const p of pc.basePoints) if (!acc.addressed.has(p.id) && keepable(ctx, p)) keepPoint(acc, p);
  acc.counts.dropped = acc.dropped;
}

export function parseDraft(response: unknown, pc: ParseContext): DraftOutcome {
  const read = readJson(response);
  if (!read.ok) return read;
  const body = (read.parsed ?? {}) as Raw;
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
    focus: extras.focus, otherCanvases: extras.otherCanvases, questions: scope.length ? extras.questions : {}, note: extras.note,
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
