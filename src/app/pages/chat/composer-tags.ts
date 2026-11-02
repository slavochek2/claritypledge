/**
 * @file composer-tags.ts
 * @description P1536 D5 / S4.2: a box tag inside the composer's text, as pure functions. A field cannot draw a chip, so a tag is ONE atomic token: the box's
 * title in brackets between two invisible marks (U+2063). The marks are what make it a tag: the same words typed by hand are plain text. Backspace right
 * after a token removes all of it, and a caret that lands inside one is moved to its edge, so a token is never half edited.
 *
 * What Send carries (`decodeTagged`): the words with each token written out as plain "[Offers & Pricing]" (the stored message shows it as a chip, the model
 * reads it), and the distinct boxes, which the server checks against its own list. A damaged token (a mark or a letter of the label gone) is plain text and
 * names no box.
 */
import { CANVAS_BOXES } from '@/lib/canvas-boxes';

export const TAG_MARK = '⁣';
/** The composer's own cap (Composer's maxLength): a tag that would pass it is refused. */
export const COMPOSER_MAX = 4000;

const TITLES = new Map<string, string>(CANVAS_BOXES.map(b => [b.tag, b.title]));
const TAG_BY_TITLE = new Map<string, string>(CANVAS_BOXES.map(b => [b.title, b.tag]));
const TOKEN = new RegExp(`${TAG_MARK}\\[([^\\]${TAG_MARK}]*)\\]${TAG_MARK}`, 'g');

export const tagToken = (tag: string): string => `${TAG_MARK}[${TITLES.get(tag) ?? tag}]${TAG_MARK}`;

export interface Edit { value: string; caret: number }

/** The token with the caret in it, or null: [start, end) of every token in `value`. */
function tokens(value: string): Array<[number, number]> {
  return [...value.matchAll(TOKEN)].map(m => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

/** Inserts a tag token at `caret`, a space before it when it follows a word and a space after it, and returns where the caret goes (after that space). Null: past the cap. */
export function insertTagAt(value: string, caret: number, tag: string): Edit | null {
  const at = Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, at);
  const lead = before !== '' && !/\s$/.test(before) && !before.endsWith(TAG_MARK) ? ' ' : '';
  const insert = `${lead}${tagToken(tag)} `;
  const next = before + insert + value.slice(at);
  return next.length > COMPOSER_MAX ? null : { value: next, caret: at + insert.length };
}

/** Backspace with the caret directly after a token: the value without it. Null: not after a token (an ordinary Backspace). */
export function removeTagBefore(value: string, caret: number): Edit | null {
  const t = tokens(value).find(([, end]) => end === caret);
  return t ? { value: value.slice(0, t[0]) + value.slice(t[1]), caret: t[0] } : null;
}

/** Where a caret that is inside a token should go (its start when it moved left into it, its end otherwise); null: it is not inside one. */
export function snapOutOfTag(value: string, caret: number, previous: number): number | null {
  const t = tokens(value).find(([start, end]) => caret > start && caret < end);
  return t ? (caret < previous ? t[0] : t[1]) : null;
}

/** The value without any token or stray mark. */
export const stripTags = (value: string): string => value.replace(TOKEN, '').split(TAG_MARK).join('');

/** There is something to say besides tags (what makes Send appear; a tags-only field shows the voice button). */
export const hasWords = (value: string): boolean => stripTags(value).trim() !== '';

/** What Send carries: the words with tokens written out as "[Title]", and the distinct boxes the tokens name, sorted. */
export function decodeTagged(value: string): { text: string; refs: string[] } {
  const refs = new Set<string>();
  const text = value.replace(TOKEN, (_all, label: string) => {
    const tag = TAG_BY_TITLE.get(label);
    if (tag) refs.add(tag);
    return `[${label}]`;
  });
  return { text: text.split(TAG_MARK).join(''), refs: [...refs].sort() };
}
