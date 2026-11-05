/**
 * P1529 D23: is this run the tap's own "Make my next version" run? Any failure reads as false: the strict owner-quote
 * rule is the safe side. A tap always tags all nine boxes on a later draft; nothing else needs the extra call.
 */
import type { CanvasRun, RunDeps } from './canvas-run.ts';
import type { BasePoint, Material } from './canvas-types.ts';
import { foldForNames } from './canvas-source.ts';

export async function isRoundUpdate(deps: Pick<RunDeps, 'rpc'>, run: CanvasRun, kind: string): Promise<boolean> {
  if (run.first_draft === true || kind !== 'message' || run.box_refs?.length !== 9) return false;
  try {
    const { data, error } = await deps.rpc('_canvas_run_is_round_update', { p_run: run.run_id });
    return !error && data === true;
  } catch {
    return false;
  }
}

const TITLE_WORD = /^\p{Lu}\p{Ll}+$/u;
const ACRONYM = /^\p{Lu}{2,}$/u;
/** Words of a text. A token with a digit in it ("MP4", "B2B", "H2O") is a format or a code, never a name: it is left out. */
const wordsOf = (text: string) => text.split(/[^\p{L}\p{N}'’-]+/u).filter((w) => w && !/\p{N}/u.test(w));
/** The form words are compared in: no possessive ("Brightlane's" is Brightlane), no case, no look-alike letters. */
const keyOf = (word: string) => foldForNames(word.replace(/['’]s$/iu, ''));

/** Acronyms ordinary in a sales conversation: said only by a partner, they are still not a firm. */
const COMMON_ACRONYMS = new Set((
  'ai api cac ceo cfo cmo coo cpo cto crm cs csv eu faq gdpr hr kpi mvp ok pdf pr qa roi saas seo sla sdr sso ui ux uk us usa usd eur vat vp'
).split(' '));
/**
 * Words a sentence starts with in talk and nothing else: said once at the start of a sentence they look like a name to a
 * filter that only sees capitals ("Overall, it is too expensive", "Hold on", "Sorry"). Without this a good point that begins
 * with one of them would be dropped. A heuristic list; the real-model check on the fixture is what keeps it honest.
 */
const OPENERS = new Set((
  'sorry cool hold yep yeah yes awesome hear ew aha dead alright bingo hit overall okay honestly basically actually anyway ' +
  'exactly absolutely definitely totally perfect great good fine right sure maybe perhaps thanks thank hello welcome ' +
  'interesting understood agreed correct wait look listen first second third next finally also still then now here there ' +
  'because however although instead otherwise meanwhile today tomorrow yesterday please wow oops hmm ugh well nope nah ' +
  'true fair right-so so and but or if when while after before since until once maybe really just only even ' +
  'ah oh uh um mhm sure-thing nice lovely terrific wonderful fantastic brilliant cheers congrats congratulations ' +
  'again another any both each every either neither some most many much more less little few several'
).split(' '));

/** Endings of everyday words ("Pricing", "Payment", "Quickly", "Buyers"): a word with one, alone at the start of a sentence, is not taken for a name. */
const EVERYDAY_ENDING = /(?:ing|tion|sion|ment|ness|ity|ly|ful|less|able|ible|ous|ive|ers|ed)$/;

/**
 * Names in the round's lines that are not the owner's: a Titlecase word someone else said in mid-sentence, an acronym
 * ("IBM"), and a word at the start of a sentence when it is not an ordinary opener. Never a word anyone also said in
 * lower case ("pricing"): that is an ordinary word.
 */
function namesInOthersLines(material: Material): Set<string> {
  const said = new Set<string>();
  const lower = new Set<string>();
  for (const item of material.items) {
    for (const sentence of item.text.split(/[.!?:;\n]+/)) {
      wordsOf(sentence).forEach((w, i) => {
        const key = keyOf(w);
        if (!key) return;
        const bare = w.replace(/['’]s$/iu, '');
        const acronym = ACRONYM.test(bare);
        if (!TITLE_WORD.test(bare) && !acronym) { lower.add(key); return; }
        if (item.owner) return;
        if (acronym) { if (!COMMON_ACRONYMS.has(key)) said.add(key); return; }
        // A Titlecase word in mid-sentence is a name; one that opens a sentence only when it is not an everyday opener.
        if (i > 0 || (!OPENERS.has(key) && key.length >= 4 && !EVERYDAY_ENDING.test(key))) said.add(key);
      });
    }
  }
  return new Set([...said].filter((k) => !lower.has(k)));
}

/**
 * P1529 D23: the round mode has no owner quote standing in front of the name filter, and the filter misses one word
 * alone in running text. A word from `namesInOthersLines` not on the owner's canvas counts as a name, also when the owner
 * repeated it ("Brightlane, I don't know them"), and in any case or possessive ("brightlane", "Brightlane's"). A heuristic like
 * the filter: a name lower-cased by the transcript gets through, and a place or tool only the partner named drops its point.
 * The owner sees every draft (D23).
 */
export function withRoundNames(named: (text: string) => boolean, material: Material, base: readonly BasePoint[]): (text: string) => boolean {
  const onCanvas = new Set(base.flatMap((p) => wordsOf(p.statement)).map(keyOf));
  const others = namesInOthersLines(material);
  return (text) => named(text) || wordsOf(text).some((w) => { const k = keyOf(w); return others.has(k) && !onCanvas.has(k); });
}
