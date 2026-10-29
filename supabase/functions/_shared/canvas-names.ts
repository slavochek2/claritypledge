/**
 * P1536: other people's names found INSIDE the material, not only the author names the database knows from a
 * copied chat. An uploaded transcript, meeting notes or a fetched page are treated as the owner's words for the
 * quote rule (they gave them), but they are full of third parties; a point or story that names one is dropped.
 *
 * A HEURISTIC, reported as one: it finds the shapes below and nothing else, so a name written in lower case, a
 * single first name in running text, or a company with no capitals gets through. The prompt rule is the other
 * half; neither is a guarantee.
 *
 *   strong: a speaker label at the start of a line ("Bob Marley:" or "Bob Marley (Acme Ltd):"). Matched as the
 *           whole name in any case, and by any part of it of three letters or more.
 *   weak:   two or more consecutive Capitalised words in the MIDDLE of a sentence ("met Jane Doe"), and the
 *           organisation in a speaker label's brackets ("Acme Ltd"). Matched as the whole phrase only, so "Maps"
 *           alone is not a name. An opening bracket does not start a sentence.
 *
 * Never a name: the owner's own COMPLETE name (not a person who merely shares a first name or surname with them),
 * months and weekdays, the box titles. A WEAK phrase the owner wrote themselves in their own notes (their product,
 * their city) is theirs too; a speaker label never is, whatever the owner's notes say about the meeting.
 * Pure: no Deno or esm.sh imports.
 */

import { BOX_GUIDE } from './canvas-draft.ts';
import { nameMatcher } from './canvas-source.ts';
import type { Material } from './canvas-types.ts';

export interface DerivedNames { strong: string[]; weak: string[] }

const CAP = '\\p{Lu}[\\p{L}\'’.-]*';
const LABEL_RE = new RegExp(`^[ \\t]*(${CAP}(?:[ \\t]+${CAP}){1,3})[ \\t]*(?:\\(([^)\\n]{1,80})\\))?[ \\t]*:`, 'gmu');
/** The organisation in a label's brackets: Capitalised words only ("Acme Ltd"), never a role in lower case. */
const ORG_RE = new RegExp(`^${CAP}(?:[ \\t]+${CAP}){0,3}$`, 'u');
const SEQ_RE = /(?<![\p{L}\p{N}])(\p{Lu}[\p{Ll}'’-]+(?:[ \t]+\p{Lu}[\p{Ll}'’-]+)+)/gu;
const NOT_NAMES = new Set((
  'january february march april may june july august september october november december ' +
  'monday tuesday wednesday thursday friday saturday sunday see also note notes the and for with ' +
  BOX_GUIDE.flatMap((b) => b.title.toLowerCase().split(/[^\p{L}]+/u)).join(' ')
).split(' '));

const words = (phrase: string) => phrase.split(/\s+/).map((w) => w.replace(/[.'’-]+$/u, '').toLowerCase()).filter(Boolean);
const allNotNames = (phrase: string) => words(phrase).every((w) => NOT_NAMES.has(w));

/** True when a match starts a sentence (the start of the text, after . ! ? : ; a line break or an opening mark). */
function atSentenceStart(text: string, at: number): boolean {
  for (let i = at - 1; i >= 0; i--) {
    const ch = text[i] ?? '';
    if (ch === '\n' || '.!?:;'.includes(ch)) return true;
    if ('"“‘'.includes(ch)) return true; // an opening bracket is not a sentence start
    if (!/\s/.test(ch)) return false;
  }
  return true;
}

function labelNames(text: string): string[] {
  return [...text.matchAll(LABEL_RE)].map((m) => (m[1] ?? '').trim()).filter((n) => n.length >= 5 && !allNotNames(n));
}

/** "Bob Marley (Acme Ltd):" names a company too. */
function labelOrganisations(text: string): string[] {
  return [...text.matchAll(LABEL_RE)].map((m) => (m[2] ?? '').trim())
    .filter((o) => o.length >= 3 && ORG_RE.test(o) && !allNotNames(o));
}

function midSentenceNames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SEQ_RE)) {
    const name = (m[1] ?? '').trim();
    if (!atSentenceStart(text, m.index ?? 0) && !allNotNames(name)) out.push(name);
  }
  return out;
}

const fullName = (name: string | null | undefined) => words(name ?? '').join(' ');

/** The names to refuse, learned from every text the owner did not write in their own messages. */
export function derivedNames(material: Material, ownerName: string | null | undefined): DerivedNames {
  const own = material.items.filter((i) => i.owner && i.kind === 'note').map((i) => i.text.toLowerCase()).join('\n');
  const outside = material.items.filter((i) => !i.owner || i.kind === 'file' || i.kind === 'link').map((i) => i.text);
  const mine = fullName(ownerName);
  const notOwner = (name: string) => !mine || fullName(name) !== mine; // the complete name only: "Bob Smith" is not "Alice Smith"
  const ownWords = (name: string) => own.includes(name.toLowerCase());
  const strong = new Set<string>();
  const weak = new Set<string>();
  for (const text of outside) {
    for (const n of labelNames(text)) if (notOwner(n)) strong.add(n); // a speaker label is never the owner's own mention
    for (const n of [...labelOrganisations(text), ...midSentenceNames(text)]) if (notOwner(n) && !ownWords(n)) weak.add(n);
  }
  return { strong: [...strong], weak: [...weak] };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A matcher for the whole text: the database's other names, the strong names and the weak phrases. */
export function namesMatcher(otherNames: readonly string[], derived: DerivedNames): (text: string) => boolean {
  const strongOrKnown = nameMatcher([...otherNames, ...derived.strong]);
  const phrases = derived.weak.map((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu'));
  return (text) => strongOrKnown(text) || phrases.some((r) => r.test(text.normalize('NFKC')));
}
