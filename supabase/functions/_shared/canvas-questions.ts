/** P1536: the fixed question for each box that stayed empty. Moved from canvas-parse.ts (size limit). */
import { emptyQuestionFor } from './canvas-box-definitions.ts';
export function questionsFor(emptyBoxes: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of emptyBoxes) {
    const q = emptyQuestionFor(tag);
    if (q) out[tag] = q;
  }
  return out;
}
