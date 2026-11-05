/**
 * P1529 D23: is this run the tap's own "Make my next version" run? Any failure reads as false: the strict owner-quote
 * rule is the safe side. A tap always tags all nine boxes on a later draft; nothing else needs the extra call.
 */
import type { CanvasRun, RunDeps } from './canvas-run.ts';
import type { BasePoint, Material } from './canvas-types.ts';

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
const wordsOf = (text: string) => text.split(/[^\p{L}'’-]+/u).filter(Boolean);

/** Titlecase words someone else said in mid-sentence and nobody ever said in lower case: "Brightlane", "Aleksandra". */
function namesInOthersLines(material: Material): Set<string> {
  const said = new Set<string>();
  const lower = new Set<string>();
  for (const item of material.items) {
    for (const sentence of item.text.split(/[.!?:;\n]+/)) {
      wordsOf(sentence).forEach((w, i) => {
        if (!TITLE_WORD.test(w)) lower.add(w.toLowerCase());
        else if (i > 0 && !item.owner) said.add(w);
      });
    }
  }
  return new Set([...said].filter((w) => !lower.has(w.toLowerCase())));
}

/**
 * P1529 D23: the round mode has no owner quote standing in front of the name filter, and the filter misses one word
 * alone in running text. A word from `namesInOthersLines` not on the owner's canvas counts as a name, also when the owner
 * repeated it ("Brightlane, I don't know them"). A heuristic like the filter: a name lower-cased by the transcript gets
 * through, and a place or tool only the partner named drops its point. The owner sees every draft (D23).
 */
export function withRoundNames(named: (text: string) => boolean, material: Material, base: readonly BasePoint[]): (text: string) => boolean {
  const onCanvas = new Set(base.flatMap((p) => wordsOf(p.statement)));
  const others = namesInOthersLines(material);
  return (text) => named(text) || wordsOf(text).some((w) => others.has(w) && !onCanvas.has(w));
}
