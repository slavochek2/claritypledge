/**
 * P1536 S2.5: a Copy-prompt file pasted (or uploaded) back. The prompt writes one section per canvas, the owner's main focus first, each opening "This canvas is about <group>."
 * and then the nine headings, so the sections can be read without asking the model, which read the LAST one as the owner's newest stated focus (5 of 5 on the real model).
 * Spec section 4: the first becomes the focus, each further one an offer.
 *
 * It decides only an untagged first draft, where material already chooses the focus. It reads the owner's typed words and files, never a web page or other people's lines. A label goes
 * through the same shape as a model's (canvas-extras.ts groupLabelOf) and, at parse, the same names filter. Pure: no Deno or esm.sh imports.
 */

import { BOX_DEFINITIONS } from './canvas-box-definitions.ts';
import { groupLabelOf } from './canvas-extras.ts';
import type { Material, RunFrame } from './canvas-types.ts';

const MAX_LABEL_CHARS = 80;
const OPENING = /^this canvas is about\s+(.+?)\.?$/i;
const FIRST_HEADING = (BOX_DEFINITIONS[0]?.title ?? 'Customer Segments').toLowerCase();
/** An opening or a heading is a short line. A longer one is neither, and is never read: owner text is hostile input, and the markup below is not linear on a long line. */
const MAX_LINE_CHARS = 300;

/** A line without the markdown an AI writes around it: "# …", "> …", "**…**". */
const bare = (line: string) => line.replace(/^[\s#>*_`-]+|[\s*_`]+$/g, '');

/** One text's sections: an opening line that a box heading follows before the next opening. Prose that happens to use the words has no heading. */
function sectionsIn(text: string): string[] {
  const out: string[] = [];
  let open: string | null = null;
  for (const raw of text.split('\n')) {
    if (raw.length > MAX_LINE_CHARS) continue;
    const line = bare(raw);
    const opening = OPENING.exec(line);
    if (opening) open = opening[1] ?? '';
    else if (open !== null && line.toLowerCase() === FIRST_HEADING) { out.push(open); open = null; }
  }
  return out;
}

/**
 * The groups of a pasted Copy prompt, in order, when it holds at least two sections and the first can be a label; else null, and the model decides as for any material. A first section
 * that fails is never replaced by the second: that would make a hostile or broken line choose the focus by removing the one before it.
 */
export function copyPromptSections(material: Material): string[] | null {
  const opened = material.items.filter((i) => i.owner && (i.kind === 'note' || i.kind === 'file')).flatMap((i) => sectionsIn(i.text));
  const labels = opened.map((g) => groupLabelOf(g, MAX_LABEL_CHARS, () => false));
  if (!labels[0]) return null;
  const distinct = [...new Set(labels.filter(Boolean))];
  return distinct.length >= 2 ? distinct : null;
}

/** The run's frame, with the sections of a pasted Copy prompt when this run may take them. */
export function withCopySections(frame: RunFrame, material: Material): RunFrame {
  if (frame.kind !== 'message' || !frame.firstDraft || frame.taggedBoxes) return frame;
  const sections = copyPromptSections(material);
  if (!sections) return frame;
  const [focus, ...others] = sections as [string, ...string[]];
  return { ...frame, focus, knownGroups: others.map((group) => ({ group, state: 'offered' })), copySections: sections };
}

/** The model's answer with the focus and the offers the sections decide: they then pass the same filters as a model's own. */
export function withSectionsDecided(body: Record<string, unknown>, sections: readonly string[] | null | undefined): Record<string, unknown> {
  if (!sections?.length) return body;
  const [focus, ...others] = sections;
  return { ...body, focus, focus_reason: 'stated', other_canvases: others.map((group) => ({ group })) };
}
