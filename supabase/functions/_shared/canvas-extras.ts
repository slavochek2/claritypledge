/**
 * P1536 (Design v6): the parts of the model's answer around the actions, checked before anything is written: the run's
 * scope, the focus, the other canvases (offers), the questions and the note. Every text passes the names filter; whatever
 * fails it is dropped and counted. Pure: no Deno or esm.sh imports.
 */

import { BOX_DEFINITIONS, emptyQuestionFor } from './canvas-box-definitions.ts';
import { BOX_TAGS } from './canvas-draft.ts';
import { cleanFreeText, normalizeForQuote } from './canvas-source.ts';
import type { OtherCanvas, ParseContext } from './canvas-types.ts';

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
  otherCanvases: OtherCanvas[];
  questions: Record<string, string>;
  note: string;
  droppedNames: number;
  droppedScope: number;
}

const textOf = (v: unknown, max: number) => (typeof v === 'string' ? cleanFreeText(v, max) : '');

function readOffers(body: Raw, known: string | null | undefined, refuse: (t: string) => boolean): OtherCanvas[] {
  const offers: OtherCanvas[] = [];
  const seen = new Set<string>(known ? [normalizeForQuote(known)] : []);
  for (const o of Array.isArray(body.other_canvases) ? body.other_canvases : []) {
    const group = textOf(typeof o === 'string' ? o : (o as Raw | null)?.group, MAX_FOCUS_CHARS);
    const why = typeof o === 'object' && o ? textOf((o as Raw).why, MAX_WHY_CHARS) : '';
    if (!group || seen.has(normalizeForQuote(group)) || refuse(group) || refuse(why)) continue;
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
    const t = textOf(q, MAX_QUESTION_CHARS);
    if (typeof box !== 'string' || !BOX_TAGS.has(box) || !t || box in questions) continue;
    if (!scope.has(box)) { outOfScope += 1; continue; }
    if (!refuse(t)) questions[box] = t;
  }
  for (const tag of emptyScoped) {
    const q = emptyQuestionFor(tag);
    if (q && !(tag in questions)) questions[tag] = q; // a scoped box that stays empty always asks
  }
  return { questions, outOfScope };
}

/** `focus`, `other_canvases`, `questions` and `note` after the names filter (`namesOther`). */
export function readExtras(body: Raw, pc: ParseContext, scope: ReadonlySet<string>, emptyScoped: readonly string[], namesOther: (t: string) => boolean): Extras {
  let droppedNames = 0;
  const refuse = (t: string) => {
    if (t && namesOther(t)) { droppedNames += 1; return true; }
    return false;
  };
  const accept = pc.acceptFocus !== false;
  const focusRaw = textOf(body.focus, MAX_FOCUS_CHARS);
  const focus = accept && focusRaw && !refuse(focusRaw) ? focusRaw : null;
  // a run that cannot set the focus compares an offer with the focus in force
  const otherCanvases = readOffers(body, accept ? focus : pc.currentFocus, refuse);
  const { questions, outOfScope } = readQuestions(body, scope, emptyScoped, refuse);
  const noteRaw = textOf(body.note, MAX_NOTE_CHARS);
  const note = noteRaw && !refuse(noteRaw) ? noteRaw : '';
  return { focus, otherCanvases, questions, note, droppedNames, droppedScope: outOfScope };
}
