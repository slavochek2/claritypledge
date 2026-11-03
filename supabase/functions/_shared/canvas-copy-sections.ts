/**
 * P1536 S2.5: a Copy-prompt answer pasted (or uploaded) back. The prompt asks the owner's AI for ONE markdown file and nothing else: for each canvas the line "This canvas is about <group>.",
 * then the nine headings, in order, the owner's main focus first (src/app/pages/chat/canvas-thread-copy.ts). The model read the LAST section as the newest stated focus (5 of 5 on the real
 * model), and that exact shape is knowable, so spec section 4's rule is decided here: the first section is the focus, each further one an offer.
 *
 * It decides only an untagged first draft, and only when the paste is the whole of what the owner gave: their one message, or one file with only its name as the message. Anything else the
 * owner said leaves the choice to the model, so a document can never outrank the owner's own words. A shape that differs in any way (quoted, inside a larger document, a heading missing or out
 * of order, a line before the first heading) is not this paste, and the model decides as for any material. A label passes the same shape and names filter as a model's. Pure: no Deno or esm.sh imports.
 */

import { BOX_DEFINITIONS } from './canvas-box-definitions.ts';
import { groupLabelOf } from './canvas-extras.ts';
import type { Material, MaterialItem, RunFrame } from './canvas-types.ts';

const MAX_LABEL_CHARS = 80;
const OPENING = /^this canvas is about\s+(.+?)\.?$/i;
/** An opening or a heading is a short line. A longer one is neither: owner text is hostile input, and only a short line is read for them. */
const MAX_LINE_CHARS = 300;

const plainTitle = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'");
const HEADINGS = BOX_DEFINITIONS.map((b) => plainTitle(b.title));

/** A line without the markdown an AI writes around a heading: "## …", "**…**". A quote mark or a list mark stays, so a quoted line is not this line. */
const bare = (line: string) => line.replace(/^#{1,6}\s+/, '').replace(/^\*\*(.*)\*\*$/, '$1').replace(/:$/, '').trim();

/** The groups of a text that is entirely the Copy prompt's answer, else null. */
function pasteSections(text: string): string[] | null {
  const groups: string[] = [];
  let next = -1; // the heading this section expects; -1 before the first opening
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const short = raw.length <= MAX_LINE_CHARS ? bare(line) : '';
    const opening = OPENING.exec(short);
    const heading = HEADINGS.indexOf(plainTitle(short));
    if (opening) {
      if (next !== -1 && next !== HEADINGS.length) return null;
      groups.push(opening[1] ?? '');
      next = 0;
    } else if (heading >= 0) {
      if (heading !== next) return null;
      next += 1;
    } else if (next <= 0) return null; // words before the first opening, or between an opening and its first heading
  }
  return next === HEADINGS.length ? groups : null;
}

/** The one item that is the paste, when it is the whole of what the owner gave. An upload's message is only the file's name, and is not the owner saying anything else. */
function soleOwnerPaste(items: readonly MaterialItem[]): string[] | null {
  const own = items.filter((i) => i.owner);
  const candidates = own.filter((i) => i.kind === 'note' || i.kind === 'file').map((item) => ({ item, groups: pasteSections(item.text) })).filter((c) => c.groups);
  const paste = candidates[0];
  if (candidates.length !== 1 || !paste) return null;
  const others = own.filter((i) => i !== paste.item);
  return others.every((i) => i.kind === 'note' && i.text.trim() === paste.item.source) ? paste.groups : null;
}

/**
 * The groups of a pasted Copy prompt, in order, when it holds at least two sections and the first can be a label; else null. A first section that fails, on shape or on a third party's name,
 * is never replaced by the second: that would make a hostile or broken line choose the focus by removing the one before it.
 */
export function copyPromptSections(material: Material, namesOther: (t: string) => boolean = () => false): string[] | null {
  const labels = (soleOwnerPaste(material.items) ?? []).map((g) => groupLabelOf(g, MAX_LABEL_CHARS, namesOther));
  if (!labels[0]) return null;
  const distinct = [...new Set(labels.filter(Boolean))];
  return distinct.length >= 2 ? distinct : null;
}

/** The run's frame, with the sections of a pasted Copy prompt when this run may take them. */
export function withCopySections(frame: RunFrame, material: Material, namesOther: (t: string) => boolean): RunFrame {
  if (frame.kind !== 'message' || !frame.firstDraft || frame.taggedBoxes) return frame;
  const sections = copyPromptSections(material, namesOther);
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
