/**
 * @file composer-tags.ts
 * @description P1536 D5 / S4.2, P1621: a box tag in the composer's stored text, as pure functions. The stored value keeps each tag as ONE token (the box's title in brackets
 * between two invisible marks, U+2063; the same words typed by hand are plain text), gathered at the START of the value. The field shows only the words; the tokens are
 * drawn as pills above it (`splitTagged` / `joinTagged` translate), so drafts, voice notes and a failed send's restore keep working on one canonical string.
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

/** [start, end) of every token in `value`. */
function tokens(value: string): Array<[number, number]> {
  return [...value.matchAll(TOKEN)].map(m => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

const tagOfToken = (value: string, [start, end]: [number, number]): string | undefined => TAG_BY_TITLE.get(value.slice(start + 2, end - 2));

/** The box title a tag is shown with (the pill's label). */
export const tagTitle = (tag: string): string => TITLES.get(tag) ?? tag;

/**
 * The stored value as pills and words: the distinct boxes its tokens name (first appearance first) and the rest of the text, tokens taken out wherever they sit (an older
 * value with a token mid-text is hoisted), the space that followed a token gone with it.
 */
export function splitTagged(value: string): { tags: string[]; words: string } {
  const tags: string[] = [];
  const counts: Record<string, number> = {};
  for (const t of tokens(value)) {
    const tag = tagOfToken(value, t);
    if (!tag) continue;
    if (!tags.includes(tag)) tags.push(tag);
    counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return { tags, words: removeTagTokens(value, counts) };
}

/** The stored value for pills and words: the tokens gathered at the start, one space between them and the words. */
export function joinTagged(tags: string[], words: string): string {
  const head = tags.map(tagToken).join(' ');
  return head && words ? `${head} ${words}` : head + words;
}

/** How much of the 4000-character cap the pills take in the stored value (the tokens and the space before the words): what the words' own limit gives up. */
export const pillsReserve = (tags: string[]): number => (tags.length ? joinTagged(tags, '').length + 1 : 0);

/** The value with `tag` added as a pill; the same value when it is already there. Null: past the cap. */
export function addTag(value: string, tag: string): string | null {
  const { tags, words } = splitTagged(value);
  if (tags.includes(tag)) return value;
  const next = joinTagged([...tags, tag], words);
  return next.length > COMPOSER_MAX ? null : next;
}

/** The value without the pill for `tag`. */
export function removeTag(value: string, tag: string): string {
  const { tags, words } = splitTagged(value);
  return joinTagged(tags.filter(t => t !== tag), words);
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

/** How many tokens of each box the value holds. */
export function tagCounts(value: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [start, end] of tokens(value)) {
    const tag = tagOfToken(value, [start, end]);
    if (tag) out[tag] = (out[tag] ?? 0) + 1;
  }
  return out;
}

/**
 * The value without `counts[tag]` tokens of each box, the first ones in the text; tokens beyond the counts (added since) stay. A removed token takes one space with it (the one after
 * it, else the one before it), so what is left has no orphan spaces: "a T b" becomes "a b", and "T" alone becomes "".
 */
export function removeTagTokens(value: string, counts: Record<string, number>): string {
  const left = { ...counts };
  let out = '';
  let at = 0;
  for (const [start, end] of tokens(value)) {
    const tag = tagOfToken(value, [start, end]);
    if (!tag || !left[tag]) continue;
    left[tag] -= 1;
    const after = value[end] === ' ';
    const before = !after && start > at && value[start - 1] === ' ';
    out += value.slice(at, before ? start - 1 : start);
    at = after ? end + 1 : end;
  }
  return out + value.slice(at);
}
