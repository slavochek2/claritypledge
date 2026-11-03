/**
 * P1536 (Design v6): the parts of the model's answer around the actions, checked before anything is written: the run's
 * scope, the focus, the other canvases (offers), the questions and the note. Every text passes the names filter; whatever
 * fails it is dropped and counted. Pure: no Deno or esm.sh imports.
 */

import { BOX_DEFINITIONS, emptyQuestionFor } from './canvas-box-definitions.ts';
import { BOX_TAGS } from './canvas-draft.ts';
import { cleanFreeText, cutAtWord, normalizeForQuote, ownerHaystack, trimHangingWords } from './canvas-source.ts';
import { contentWords } from './canvas-support.ts';
import { FOCUS_REASONS, type FocusReason, type OtherCanvas, type ParseContext } from './canvas-types.ts';

/** Caps on free model text: a group name or focus 80 characters, a reason 200, a question 300, the note 160 (what the database's own reply keeps). */
const MAX_FOCUS_CHARS = 80;
const MAX_WHY_CHARS = 200;
const MAX_QUESTION_CHARS = 300;
const MAX_NOTE_CHARS = 160;
const MAX_OFFERS = 3;

type Raw = Record<string, unknown>;

/** The boxes this run may change: fixed by the run, else the model's own `scope` (known tags only, once each). */
export function effectiveScope(pc: ParseContext, modelScope: unknown): string[] {
  const all = BOX_DEFINITIONS.map((b) => b.tag);
  if (pc.scope?.mode === 'fixed') return all.filter((t) => (pc.scope as { boxes: readonly string[] }).boxes.includes(t));
  if (pc.scope?.mode !== 'model') return all;
  const asked = new Set(Array.isArray(modelScope) ? modelScope.filter((t): t is string => typeof t === 'string') : []);
  return all.filter((t) => asked.has(t));
}

export interface Extras {
  focus: string | null;
  focusReason: FocusReason | null;
  otherCanvases: OtherCanvas[];
  questions: Record<string, string>;
  note: string;
  droppedNames: number;
  droppedScope: number;
}

/** Free text cleaned (the whole of it, up to four times the cap), before anything is cut. */
const fullOf = (v: unknown, max: number) => (typeof v === 'string' ? cleanFreeText(v, max * 4) : '');
/** The cleaned text cut at the end of a word: a label that reaches the owner is never cut in the middle of one. */
const cutOf = (full: string, max: number) => cutAtWord(full, max);

/**
 * A group label is a short noun phrase: letters, digits, spaces and a few joiners. A sentence, a colon, a bracket, a quote or any
 * other mark is refused, so the label of an upload can never read as an instruction to a later run (Opus 7, Codex 1). It is held to
 * eight words, the length the prompt asks for. The prompt also quotes every stored label as data: this is the second wall.
 */
const MAX_LABEL_WORDS = 8;
const LABEL_SHAPE = /^[\p{L}\p{N}][\p{L}\p{N} '’&/+,-]*$/u;
export function groupLabelOf(v: unknown, max: number, refuse: (t: string) => boolean): string {
  const full = fullOf(v, max);
  if (!full || !LABEL_SHAPE.test(full) || refuse(full)) return '';
  const words = full.split(/\s+/);
  const held = words.slice(0, MAX_LABEL_WORDS).join(' ');
  return cutOf(words.length > MAX_LABEL_WORDS ? trimHangingWords(held) : held, max);
}

/** Free text the names filter has passed: the filter reads the whole cleaned text, so a name past the cut is still a name. */
function passedText(v: unknown, max: number, refuse: (t: string) => boolean): string {
  const full = fullOf(v, max);
  return full && !refuse(full) ? cutOf(full, max) : '';
}

function readOffers(body: Raw, known: ReadonlyArray<string | null | undefined>, refuse: (t: string) => boolean): OtherCanvas[] {
  const offers: OtherCanvas[] = [];
  const seen = new Set<string>(known.filter((k): k is string => !!k).map(normalizeForQuote));
  for (const o of Array.isArray(body.other_canvases) ? body.other_canvases : []) {
    const group = groupLabelOf(typeof o === 'string' ? o : (o as Raw | null)?.group, MAX_FOCUS_CHARS, refuse);
    if (!group || seen.has(normalizeForQuote(group))) continue;
    const whyFull = typeof o === 'object' && o ? fullOf((o as Raw).why, MAX_WHY_CHARS) : '';
    if (whyFull && refuse(whyFull)) continue;
    const why = whyFull ? cutOf(whyFull, MAX_WHY_CHARS) : '';
    seen.add(normalizeForQuote(group));
    if (offers.length < MAX_OFFERS) offers.push({ group, why });
  }
  return offers;
}

/** { box tag: question } for scoped boxes: the model's own, then the module's question for a scoped box that stays empty. */
function readQuestions(body: Raw, scope: ReadonlySet<string>, emptyScoped: readonly string[], refuse: (t: string) => boolean): { questions: Record<string, string>; outOfScope: number } {
  const questions: Record<string, string> = {};
  let outOfScope = 0;
  const raw = Array.isArray(body.questions)
    ? body.questions.map((q) => [(q as Raw | null)?.box, (q as Raw | null)?.question] as const)
    : Object.entries((body.questions && typeof body.questions === 'object' ? body.questions : {}) as Raw);
  for (const [box, q] of raw) {
    const full = fullOf(q, MAX_QUESTION_CHARS);
    if (typeof box !== 'string' || !BOX_TAGS.has(box) || !full || box in questions) continue;
    if (!scope.has(box)) { outOfScope += 1; continue; }
    if (!refuse(full)) questions[box] = cutOf(full, MAX_QUESTION_CHARS);
  }
  for (const tag of emptyScoped) {
    const q = emptyQuestionFor(tag);
    if (q && !(tag in questions)) questions[tag] = q; // a scoped box that stays empty always asks
  }
  return { questions, outOfScope };
}

const FIRST_PERSON = /\b(?:i|i'm|we|we're|my|our)\b/;
const FOCUS_SAID = /\b(?:focus(?:es|ed|ing)?|concentrat\w+|prioriti[sz]\w+|priority|(?:main|core|primary)\s+(?:business|customers?|clients?|market|offer|group|work|bet|one)|(?:mainly|only|just)\s+(?:sell|serve|work))\b/;
const FOCUS_DENIED = /\b(?:not|no longer|never|stopped|moved away|used to)\b/;
/** Words every group shares: naming them is not naming this group ("dog owners" is not "café owners"). */
const GENERIC_GROUP_WORDS = new Set(['owner', 'customer', 'client', 'people', 'business', 'firm', 'company', 'team', 'small', 'independent', 'local', 'group']);

/**
 * Did the owner say this group is their focus? The reason "since you call them your focus" is the model's claim about the owner's words, so, like a quote, it is checked against them: one
 * first-person sentence with a focus word that names the group and does not deny it. A heuristic that leans to silence: without it the reply gives no reason, which is true, not a wrong one.
 */
function ownerCallsItTheirFocus(focus: string, owner: string): boolean {
  const named = [...contentWords(focus)].filter((w) => !GENERIC_GROUP_WORDS.has(w));
  return owner.split(/[.!?;](?:\s|$)/).some((sentence) => FIRST_PERSON.test(sentence) && FOCUS_SAID.test(sentence) && !FOCUS_DENIED.test(sentence)
    && [...contentWords(sentence)].some((w) => named.includes(w)));
}

/** `focus`, `other_canvases`, `questions` and `note` after the names filter (`namesOther`). */
export function readExtras(body: Raw, pc: ParseContext, scope: ReadonlySet<string>, emptyScoped: readonly string[], namesOther: (t: string) => boolean): Extras {
  let droppedNames = 0;
  const refuse = (t: string) => {
    if (t && namesOther(t)) { droppedNames += 1; return true; }
    return false;
  };
  const accept = pc.acceptFocus !== false;
  const focus = accept ? groupLabelOf(body.focus, MAX_FOCUS_CHARS, refuse) || null : null;
  // the reason is the model's report, not text: one of four words, else nothing (the reply then says only what was found and chosen)
  const reasonRaw = typeof body.focus_reason === 'string' ? body.focus_reason.trim().toLowerCase() : '';
  const claimed = focus && FOCUS_REASONS.includes(reasonRaw as FocusReason) ? (reasonRaw as FocusReason) : null;
  // a pasted Copy prompt's first section is the owner's main focus by the prompt's own rule (canvas-copy-sections.ts); any other "stated" has to be in the owner's words
  const focusReason = claimed === 'stated' && !pc.sections && !ownerCallsItTheirFocus(focus ?? '', ownerHaystack(pc.material)) ? null : claimed;
  // a run that cannot set the focus compares an offer with the focus in force; every group the canvas already holds is the same group
  // however the model words it back. An empty scope changes no offers (the database ignores them) except for an upload (J9), and a focus run lists none.
  const otherCanvases = (scope.size > 0 || pc.offersOnEmptyScope === true) && pc.listOffers !== false
    ? readOffers(body, [accept ? focus : pc.currentFocus, pc.currentFocus, ...(pc.knownGroups ?? [])], refuse)
    : [];
  const { questions, outOfScope } = readQuestions(body, scope, emptyScoped, refuse);
  const note = passedText(body.note, MAX_NOTE_CHARS, refuse);
  return { focus, focusReason, otherCanvases, questions, note, droppedNames, droppedScope: outOfScope };
}
