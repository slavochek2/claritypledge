/**
 * P1646: the agent thinks with the owner. When the owner's message contradicts a current point, the run does not refuse and does
 * not overwrite: it offers up to two ways to take their words, plus keeping the canvas as it is (always offered, always last), and
 * changes nothing until the owner picks. This module holds the pure parts:
 *
 *   readPick     a short reply naming a letter, "keep" or "the recommended one" (anything else goes to the model as a message);
 *   vetChoice    the model's raw "choice", checked like a point: every option's statement passes the SAME evidence checks as a "new"
 *                point (owner quote, names, numbers, the two-word rule or the best guess), and every shown text the names filter;
 *   the replies  built from fixed words (D2, approved 2026-11-06); model text appears only inside the brackets D2 names.
 *
 * The server stores the choice and, on a pick, builds the actions from the STORED option, never from the caller
 * (`_canvas_draft_run_complete_choice`). The table and the functions are created in migration 20261106125500. The live body of
 * `_canvas_draft_choice_latest` is in 20261106163500; the live body of `_canvas_draft_run_complete_choice` and of the trigger that
 * deletes a draft's choices when an owner message of its thread is deleted or edited are in 20261106173500; the erase trigger is in
 * 20261106141500. Pure: no Deno or esm.sh imports.
 */

import { BOX_TAGS, MAX_POINTS_PER_BOX, MAX_QUOTE_CHARS, MAX_STATEMENT_CHARS, titleOf } from './canvas-draft.ts';
import { clean, cleanFreeText, cutAtWord, cutChars, normalizeForQuote } from './canvas-source.ts';
import { numbersSupported } from './canvas-support.ts';
import { vetEvidence } from './canvas-guess.ts';
import { groundPriceTerms, type PriceWords } from './canvas-price.ts';
import type { BasePoint, ParseContext } from './canvas-types.ts';

const REVENUE = 'canvas:revenue';

export type OptionLetter = 'A' | 'B';
export type Recommended = OptionLetter | 'keep';

/** One way to take the owner's words: write the new point in place of the conflicting one(s) of its box, or beside them. */
export interface ChoiceOption {
  letter: OptionLetter;
  kind: 'replace' | 'add';
  box: string;
  /** The point as it would be written (canvas text, vetted). */
  statement: string;
  /** The owner's verbatim words it rests on (kept raw so the pick can run the quote check again). */
  quote: string;
  /** One sentence: what choosing it means for the canvas. May be empty. */
  means: string;
  /** Other boxes that may need to follow. The option never changes them (D1). */
  also_revisit: string[];
  /** replace: the conflicting points of `box` it takes out. add: none. */
  replaces: string[];
}

export interface Choice {
  conflicts_with: string[];
  options: ChoiceOption[];
  recommended: Recommended;
  reason: string;
}

/** A choice as `_canvas_draft_choice_latest` returns it. */
export interface StoredChoice extends Choice {
  id: string;
  state: 'open' | 'picked' | 'kept' | 'superseded';
  request: string;
  /** The owner's message the choice came from: the choice lives only as long as that message does (privacy). */
  request_message_id: string | null;
}

type Letter = 'A' | 'B' | 'C' | 'D';
/** `keepLetter`: a letter said together with "keep" ("c keep"): it counts only when it is the choice's keep letter. */
export type ChoicePick = { kind: 'letter'; letter: Letter } | { kind: 'keepLetter'; letter: Letter } | { kind: 'keep' } | { kind: 'recommended' };

/** The most points one choice may name as contradicted, the options the model may give, and the length of a shown sentence. */
const MAX_CONFLICTS = 3;
const MAX_OPTIONS = 2;
const MAX_REVISIT = 3;
const MAX_SHOWN_CHARS = 200;
/** What the stored request keeps of the owner's message (the database keeps the same). */
export const MAX_REQUEST_CHARS = 2000;

// ── Reading a pick ──────────────────────────────────────────────────────────

const FILLER = '(?:ok|okay|yes|please|thanks|thank you)';
const LEAD_FILLER = new RegExp(`^${FILLER}(?![\\p{L}])[\\s,]*`, 'u');
const TRAIL_FILLER = new RegExp(`[\\s,]*(?<![\\p{L}])${FILLER}$`, 'u');
const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|[\u{1F3FB}-\u{1F3FF}]/gu;
/** The words that may come before a letter or "the recommended one". */
const LEAD = "(?:option |go with |let's go with |lets go with |i'll go with |ill go with |go for |let's do |lets do |i pick |pick |i choose |choose |i'll take |ill take |take |confirm |reply )?";
const LETTER_RE = new RegExp(`^${LEAD}(?:option )?([a-d])(?: \\(recommended\\)| it is)?$`);
const KEEP_LETTER_RE = /^([a-d])[ ,]+keep$/;
const KEEP_RE = /^(?:keep|keep it|keep it as it is|keep as it is|keep the canvas|keep the canvas as it is|keep as is|leave it|no change)$/;
const RECOMMENDED_RE = new RegExp(`^${LEAD}(?:the recommended one|recommended|your recommendation)$`);

/** Marks a letter may come wrapped in: "**A**", "(A)", "[A]", "`A`"; a leading arrow or bullet ("-> A", "- A"); a closing bracket ("A)"). */
const WRAPPERS: ReadonlyArray<[RegExp, string]> = [
  // pairs before a leading bullet, so "**A**" is unwrapped whole and not read as the bullet "*" before "*A**"
  [/^\*\*(.*)\*\*$/u, '$1'], [/^__(.*)__$/u, '$1'], [/^`(.*)`$/u, '$1'], [/^\*(.*)\*$/u, '$1'], [/^\((.*)\)$/u, '$1'], [/^\[(.*)\]$/u, '$1'],
  [/^"(.*)"$/u, '$1'], [/^“(.*)”$/u, '$1'], [/^'(.*)'$/u, '$1'],
  [/^(?:->|=>|→|[-*•>])\s*/u, ''], [/^([a-d])\)$/u, '$1'],
];
const unwrap = (t: string) => WRAPPERS.reduce((acc, [re, to]) => acc.replace(re, to).trim(), t);

/** The owner's reply in the form a pick is read from: lower case, one space, no closing marks, wrappers, emoji or polite words around it. */
function normalisePick(text: string): string {
  let t = text.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(EMOJI, ' ').replace(/\s+/g, ' ').trim();
  for (let again = true; again;) {
    const next = unwrap(t.replace(/[\s.!]+$/u, '').replace(/^[\s,]+|[\s,]+$/gu, '').replace(LEAD_FILLER, '').replace(TRAIL_FILLER, '').trim());
    again = next !== t;
    t = next;
  }
  return t;
}

/** A short reply that picks from a choice, or null: anything else is a message for the model. */
export function readPick(text: string): ChoicePick | null {
  if (typeof text !== 'string') return null;
  const t = normalisePick(text);
  if (!t || Array.from(t).length > 40) return null;
  const letter = LETTER_RE.exec(t)?.[1];
  if (letter) return { kind: 'letter', letter: letter.toUpperCase() as Letter };
  const keepLetter = KEEP_LETTER_RE.exec(t)?.[1];
  if (keepLetter) return { kind: 'keepLetter', letter: keepLetter.toUpperCase() as Letter };
  if (KEEP_RE.test(t)) return { kind: 'keep' };
  if (RECOMMENDED_RE.test(t)) return { kind: 'recommended' };
  return null;
}

/** The letter that keeps the canvas: the one after the last option. */
export const keepLetterOf = (c: Pick<Choice, 'options'>): string => String.fromCharCode(65 + c.options.length);

/** The letter a pick names in this choice: an option letter, the keep letter, or a letter the choice does not have. */
export function letterOf(pick: ChoicePick, c: Pick<Choice, 'options' | 'recommended'>): string {
  if (pick.kind === 'keep') return keepLetterOf(c);
  if (pick.kind === 'recommended') return c.recommended === 'keep' ? keepLetterOf(c) : c.recommended;
  if (pick.kind === 'keepLetter') return pick.letter === keepLetterOf(c) ? pick.letter : '?'; // "a keep" when A is an option: unclear, so asked again
  return pick.letter;
}

/** A pick that means "keep the canvas as it is" in this choice: by its words, or by naming the keep letter. */
export const meansKeep = (pick: ChoicePick, c: Pick<Choice, 'options' | 'recommended'>): boolean => letterOf(pick, c) === keepLetterOf(c);

// ── Vetting the model's choice ──────────────────────────────────────────────

type Raw = Record<string, unknown>;
type VetAcc = Parameters<typeof vetEvidence>[0] & { droppedCap: number };
type VetCtx = Parameters<typeof vetEvidence>[1];

export interface ChoiceCtx {
  /** The canvas's current points, by id. */
  base: ReadonlyMap<string, BasePoint>;
  /** The boxes an option may name. */
  boxes: ReadonlySet<string>;
  vet: VetCtx;
  /** A revenue statement with only the price terms the owner stated (canvas-price.ts), as for a written point. */
  ground: (box: string, statement: string) => string;
}

const sameText = (a: string, b: string) => normalizeForQuote(a) === normalizeForQuote(b);

/**
 * The request in exactly the form the database stores and compares it: trimmed, cut to 2000 characters, trimmed again
 * (SQL: btrim(left(btrim(x), 2000))). The engine sends `cutChars(text.trim(), 2000)`; both sides of the held check use this form.
 */
export const storedRequestForm = (text: string): string => cutChars(text.trim(), MAX_REQUEST_CHARS).trim();

/** Free model text shown to the owner: cleaned, no other person, no number the owner never said, cut at a word; else empty. */
function shownText(v: unknown, ctx: ChoiceCtx, acc: VetAcc): string {
  const full = typeof v === 'string' ? cleanFreeText(v, MAX_SHOWN_CHARS * 4) : '';
  if (!full) return '';
  if (ctx.vet.namesOther(full)) { acc.droppedNames += 1; return ''; }
  if (!numbersSupported([full], ctx.vet.numbers)) return '';
  return cutAtWord(full, MAX_SHOWN_CHARS);
}

function revisitOf(v: unknown, box: string): string[] {
  const out: string[] = [];
  for (const t of Array.isArray(v) ? v : []) {
    if (typeof t === 'string' && BOX_TAGS.has(t) && t !== box && !out.includes(t)) out.push(t);
  }
  return out.slice(0, MAX_REVISIT);
}

/** One raw option, vetted; null when refused (and counted, like a refused point). */
function vetOption(o: Raw, conflicts: readonly BasePoint[], ctx: ChoiceCtx, acc: VetAcc): Omit<ChoiceOption, 'letter'> | null {
  const kind = o.kind === 'replace' || o.kind === 'add' ? o.kind : null;
  const box = typeof o.box === 'string' && BOX_TAGS.has(o.box) && ctx.boxes.has(o.box) ? o.box : null;
  if (!kind || !box || typeof o.statement !== 'string' || typeof o.quote !== 'string') return null;
  // both kinds act on the box of a contradicted point: replace takes it out, add writes beside it (D1: only the box it names)
  const replaces = conflicts.filter((p) => p.box === box).map((p) => p.id);
  if (!replaces.length) return null;
  const cleaned = clean(o.statement, MAX_STATEMENT_CHARS);
  const statement = ctx.ground(box, cleaned);
  if (!statement) { if (cleaned) acc.droppedUnverified += 1; return null; }
  const inBox = [...ctx.base.values()].filter((p) => p.box === box);
  if (inBox.some((p) => sameText(p.statement, statement))) return null; // the same words are already there: nothing to choose
  if (kind === 'add' && inBox.length >= MAX_POINTS_PER_BOX) { acc.droppedCap += 1; return null; }
  // the quote is cut to what is stored FIRST, and exactly that string is vetted: the pick vets it again, and must find what the offer found
  const quote = cutChars(o.quote.trim(), MAX_QUOTE_CHARS).trim();
  // any owner words may carry an option (this message, an earlier one, a file): the database deletes a draft's choices when any
  // owner message of its thread is deleted or edited, and the pick vets the quote again against the material it has then
  const guesses = acc.guesses.length;
  const ok = vetEvidence(acc, ctx.vet, { action: 'new', box, quote }, statement);
  acc.guesses.length = guesses; // an option is not written here: a best guess is told when it is applied, with its words
  if (!ok) return null;
  if (ctx.vet.namesOther(quote)) { acc.droppedNames += 1; return null; } // the quote is shown when the option is applied
  return { kind, box, statement, quote, means: shownText(o.means, ctx, acc), also_revisit: revisitOf(o.also_revisit, box), replaces: kind === 'replace' ? replaces : [] };
}


/**
 * The model's "choice", checked: the contradicted points are current points in a box the run may change, at most three; at most two
 * options, each vetted as a written point would be; letters A, B in order. Null when nothing survives (the run is then an ordinary one).
 */
export function vetChoice(raw: unknown, ctx: ChoiceCtx, acc: VetAcc): Choice | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const conflicts = conflictsOf(r.conflicts_with, ctx);
  if (!conflicts.length) return null;
  const { options, origins } = optionsOf(r.options, conflicts, ctx, acc);
  const first = options[0];
  if (!first) return null;
  // contradicted points in other boxes are not named; their boxes are told as boxes to revisit, which the option never changes (D1)
  // they go first, so the cap never drops a box the owner's words really contradict
  first.also_revisit = [...new Set([...conflicts.filter((p) => p.box !== first.box).map((p) => p.box), ...first.also_revisit])].slice(0, MAX_REVISIT);
  const rec = recommendationOf(r.recommended, origins);
  return { conflicts_with: conflicts.filter((p) => p.box === first.box).map((p) => p.id), options, recommended: rec.recommended, reason: rec.keepReason ? shownText(r.reason, ctx, acc) : '' };
}

/**
 * The model recommends an option by its place in ITS list ("A" its first, "B" its second). Options are lettered again after vetting, so
 * the recommendation follows the option, not the letter. When the recommended option was refused, or the model recommended nothing
 * valid, keep is recommended and no reason is shown: the agent never recommends an option the model did not.
 */
function recommendationOf(asked: unknown, origins: readonly number[]): { recommended: Recommended; keepReason: boolean } {
  if (asked === 'keep') return { recommended: 'keep', keepReason: true };
  if (asked !== 'A' && asked !== 'B') return { recommended: 'keep', keepReason: false }; // no valid recommendation: keep, never an invented A
  const at = origins.indexOf(asked === 'A' ? 0 : 1);
  // the option the model recommended was refused: keep, never an option it did not recommend
  return at >= 0 ? { recommended: at === 0 ? 'A' : 'B', keepReason: true } : { recommended: 'keep', keepReason: false };
}

/** The contradicted points: current points in a box this run may change, once each, at most three. */
function conflictsOf(raw: unknown, ctx: ChoiceCtx): BasePoint[] {
  const out: BasePoint[] = [];
  for (const id of Array.isArray(raw) ? raw : []) {
    const p = typeof id === 'string' ? ctx.base.get(id) : undefined;
    if (p && ctx.boxes.has(p.box) && !out.includes(p)) out.push(p);
  }
  return out.slice(0, MAX_CONFLICTS);
}

/** One box per choice (D2 names one box): the box of the first option that survives. A later option in another box is not read. */
function optionsOf(raw: unknown, conflicts: readonly BasePoint[], ctx: ChoiceCtx, acc: VetAcc): { options: ChoiceOption[]; origins: number[] } {
  const options: ChoiceOption[] = [];
  /** origins[i]: where options[i] stood in the model's own list. */
  const origins: number[] = [];
  (Array.isArray(raw) ? raw : []).slice(0, MAX_OPTIONS).forEach((o, at) => {
    if (!o || typeof o !== 'object' || (options[0] && (o as Raw).box !== options[0].box)) return;
    const v = vetOption(o as Raw, conflicts, ctx, acc);
    if (!v || options.some((x) => sameText(x.statement, v.statement) && x.kind === v.kind)) return;
    options.push({ letter: options.length === 0 ? 'A' : 'B', ...v });
    origins.push(at);
  });
  return { options, origins };
}

/** What parseDraft hands over: the same checks a written point passes, and the run's scope. */
type ParseCtxLike = Omit<ChoiceCtx, 'boxes' | 'vet' | 'ground'> & VetCtx & { scope: ReadonlySet<string>; priceWords: PriceWords };

/**
 * P1646, called by parseDraft: the model's "choice", on a run that may offer one. An untagged message's scope is the model's own, so a box
 * it names in the choice is a box it names for this run; a tagged message keeps its tags. A revenue option keeps only the price terms the
 * owner stated, as a written point does.
 */
export function readChoice(body: Raw, pc: Pick<ParseContext, 'allowChoice' | 'scope'>, ctx: ParseCtxLike, acc: VetAcc): Choice | null {
  if (pc.allowChoice !== true || !body.choice) return null;
  const ground = (box: string, s: string) => (box === REVENUE ? groundPriceTerms(s, ctx.priceWords.owner, ctx.priceWords.answer) : s);
  return vetChoice(body.choice, { base: ctx.base, boxes: pc.scope?.mode === 'model' ? BOX_TAGS : ctx.scope, vet: ctx, ground }, acc);
}

// ── The replies ─────────────────────────────────────────────────────────────

const bare = (s: string) => s.trim().replace(/[.!]+$/u, '');
/** Shown inside double quotes: a double quote of its own becomes a single one, so the reply never reads ambiguously. */
const singleQuotes = (s: string) => s.replace(/["“”„]/g, "'");
const quoted = (s: string) => `"${singleQuotes(bare(s))}"`;
/** Canvas text shown in a reply: its own double quotes kept as single ones (cleanFreeText would drop them), then cleaned. */
const shownCanvas = (s: string, max: number) => cleanFreeText(singleQuotes(s), max) || s;
const joinWith = (word: string) => (xs: readonly string[]) => (xs.length < 2 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`);
const joinAnd = joinWith('and');
const joinOr = joinWith('or');
/** A shown sentence ends with one full stop. */
const sentence = (s: string) => (s ? `${bare(s)}.` : '');
/** "because {reason}": the model may open its clause with "because" (said once) or a capital; a word in capitals or "I" keeps it. */
const clause = (s: string) => {
  const t = bare(s).replace(/^because\s+/i, '');
  return /^[A-Z][a-z]/.test(t) && !/^I\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
};

const shownPoint = (p: BasePoint) => quoted(shownCanvas(p.statement, 300));

/** "your current Problem, "x"": a choice is about one box (vetChoice), so D2 names one. Two points in it read "x" and "y". */
function conflictText(c: Choice, base: ReadonlyMap<string, BasePoint>): string {
  const box = c.options[0]?.box;
  const points = c.conflicts_with.map((id) => base.get(id)).filter((p): p is BasePoint => !!p && p.box === box);
  if (!box || !points.length) return 'your current canvas';
  return `your current ${titleOf(box)}, ${joinAnd(points.map(shownPoint))}`;
}

/** D2's {X}: fixed words for what the recommendation does. */
const RECOMMEND_TEXT: Record<'replace' | 'add' | 'keep', string> = {
  replace: 'replacing it',
  add: 'adding it beside the current point',
  keep: 'keeping the canvas as it is',
};

const optionLine = (o: ChoiceOption) => {
  const head = o.kind === 'replace' ? `Replace it with ${quoted(o.statement)}.` : `Add ${quoted(o.statement)} beside it.`;
  return o.means ? `${head} ${sentence(o.means)}` : head;
};

/**
 * A stored choice about to be shown again, read through THIS run's names filter: a reason or a "means" that now names another person
 * (one the owner's newer material introduced) is not shown.
 */
export function screened(c: Choice, namesOther: (t: string) => boolean): Choice | null {
  // an option whose statement now names someone is not shown at all (its letter stays unused); none left: there is nothing to show
  const options = c.options.filter((o) => !namesOther(o.statement)).map((o) => (o.means && namesOther(o.means) ? { ...o, means: '' } : o));
  if (!options.length) return null;
  const lost = c.recommended !== 'keep' && !options.some((o) => o.letter === c.recommended);
  return { ...c, options, recommended: lost ? 'keep' : c.recommended, reason: lost || (c.reason && namesOther(c.reason)) ? '' : c.reason };
}

/**
 * D2, approved 2026-11-06, verbatim: the engine's fixed words, the model's text only in the brackets ({reason}, each option's
 * statement and what it means). The keep option is always last; the recommended letter carries the mark (keep may be recommended).
 */
export function choiceReply(c: Choice, base: ReadonlyMap<string, BasePoint>, keep: string = keepLetterOf(c)): string {
  // `keep`: a screened choice posted again keeps its stored letters, so its keep letter is the stored one
  const recommendedLetter = c.recommended === 'keep' ? keep : c.recommended;
  const rec = c.recommended === 'keep' ? 'keep' : c.options.find((o) => o.letter === c.recommended)?.kind ?? 'replace';
  const why = c.reason ? `, because ${clause(c.reason)}.` : '.';
  const mark = (l: string) => (l === recommendedLetter ? `${l} (recommended).` : `${l}.`);
  const letters = [...c.options.map((o) => o.letter), keep];
  return [
    `I'm not sure about this. It contradicts ${conflictText(c, base)}. I'd recommend ${RECOMMEND_TEXT[rec]}${why}`,
    ...c.options.map((o) => `${mark(o.letter)} ${optionLine(o)}`),
    `${mark(keep)} Keep the canvas as it is.`,
    `Reply ${joinOr(letters)}.`,
  ].join('\n');
}

/**
 * [FOUNDER DECISION: wording] What a pick that was applied says: what changed, from which words, and (D1) the other boxes the owner may
 * want to follow, which are never changed without their say. The follow-up asks what should change there: a bare yes cannot be acted
 * on, because the agent never reads its own replies.
 */
export function appliedReply(o: ChoiceOption, base: ReadonlyMap<string, BasePoint>): string {
  const box = titleOf(o.box);
  const shownNew = quoted(shownCanvas(o.statement, MAX_STATEMENT_CHARS));
  const words = quoted(cleanFreeText(o.quote, 80));
  const old = o.replaces.map((id) => base.get(id)).filter((p): p is BasePoint => !!p).map(shownPoint);
  const line = o.kind === 'replace' && old.length
    ? `I replaced ${joinAnd(old)} with ${shownNew} in ${box}, from your words ${words}.`
    : `I added ${shownNew} to ${box}, from your words ${words}.`;
  const revisit = o.also_revisit.length ? [`${joinAnd(o.also_revisit.map(titleOf))} may need updating too. Tell me what should change there.`] : [];
  return [`Updated: ${box}.`, line, ...revisit].join('\n');
}

/** [FOUNDER DECISION: wording] The owner chose to keep the canvas. */
export const KEPT_REPLY = 'Nothing changed on the canvas. You chose to keep it as it is.';
/** A keep or "the recommended one" after the choice was already answered: nothing to do (the existing no-change line). */
export const SETTLED_KEEP_REPLY = 'Nothing changed on the canvas.';
/** [FOUNDER DECISION: wording] A pick with no choice to pick from. */
export const NO_CHOICE_REPLY = 'There is no open choice to pick from, so nothing changed. Tell me what you want to change on the canvas.';
/** [FOUNDER DECISION: wording] Leads a choice offered again because the canvas changed since it was asked. */
export const STALE_LEAD = 'The canvas changed since I asked, so I checked your earlier request again.';
/** [FOUNDER DECISION: wording] Leads a choice offered again because the last one was already answered. */
export const CLOSED_LEAD = 'That choice is already settled, so I checked your earlier request again.';
/** [FOUNDER DECISION: wording] The earlier request checked again no longer conflicts. */
export const reofferNoneReply = (lead: string): string =>
  `${lead} It no longer conflicts with anything, so nothing changed. Tell me again what you want, and I will check it against the canvas as it is now.`;
/** [FOUNDER DECISION: wording] The stored option failed a check when it was picked (a number the owner never said, a name). */
export const refusedPickReply = (letter: string): string =>
  `I could not apply ${letter}: it holds something you have not said, so nothing changed.`;
/** [FOUNDER DECISION: wording] The canvas changed between reading the choice and applying it. */
export const APPLY_STALE_REPLY = 'The canvas changed while I was applying your pick, so nothing changed. Reply with your pick again.';
/** [FOUNDER DECISION: wording] The choice could not be read or saved. */
export const CHOICE_WRITE_REPLY = 'I could not save that just now, so nothing changed. Please try again.';
