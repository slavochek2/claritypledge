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
/** P1621 round 2: a mention of one POINT is the box token followed by the point's exact words between two of these marks (U+2064, invisible). A "key" is the box tag, or `tag + POINT_MARK + words`. */
export const POINT_MARK = '⁤';
/** The composer's own cap (Composer's maxLength): a tag that would pass it is refused. */
export const COMPOSER_MAX = 4000;

const TITLES = new Map<string, string>(CANVAS_BOXES.map(b => [b.tag, b.title]));
const TAG_BY_TITLE = new Map<string, string>(CANVAS_BOXES.map(b => [b.title, b.tag]));
const TOKEN = new RegExp(`${TAG_MARK}\\[([^\\]${TAG_MARK}]*)\\]${TAG_MARK}(?:${POINT_MARK}([^${POINT_MARK}${TAG_MARK}]*)${POINT_MARK})?`, 'g');

/** The point words as stored inside a token: the two delimiter marks and `%` are escaped (`%25`, `%E2`, `%E3`), everything else, whitespace and quotes included, is the owner's text untouched. */
const encodeWords = (words: string): string => words.replace(/%/g, '%25').split(TAG_MARK).join('%E2').split(POINT_MARK).join('%E3');
const decodeWords = (stored: string): string => stored.replace(/%(25|E2|E3)/g, (_m, c: string) => (c === '25' ? '%' : c === 'E2' ? TAG_MARK : POINT_MARK));

/** The box a key names, and the point's exact words (empty for a whole-box mention). */
export const keyBox = (key: string): string => key.split(POINT_MARK)[0];
export const keyText = (key: string): string => decodeWords(key.split(POINT_MARK).slice(1).join(POINT_MARK));
/** The key for one point: the box and the owner's exact words, escaped so they cannot end the token. */
export const pointKey = (tag: string, words: string): string => `${tag}${POINT_MARK}${encodeWords(words)}`;

export const tagToken = (key: string): string => {
  const stored = key.split(POINT_MARK).slice(1).join(POINT_MARK);   // already escaped
  return `${TAG_MARK}[${TITLES.get(keyBox(key)) ?? keyBox(key)}]${TAG_MARK}${stored ? `${POINT_MARK}${stored}${POINT_MARK}` : ''}`;
};

interface Tok { start: number; end: number; key: string | undefined }
/** Every token in `value`, with the key it names (undefined: a damaged one). */
function tokens(value: string): Tok[] {
  return [...value.matchAll(TOKEN)].map(m => {
    const tag = TAG_BY_TITLE.get(m[1]);
    return { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, key: tag ? (m[2] ? `${tag}${POINT_MARK}${m[2]}` : tag) : undefined };
  });
}

/** The box title a key is shown with (the pill's label). */
export const tagTitle = (key: string): string => TITLES.get(keyBox(key)) ?? keyBox(key);

/**
 * The stored value as pills and words: the distinct boxes its tokens name (first appearance first) and the rest of the text, tokens taken out wherever they sit (an older
 * value with a token mid-text is hoisted), the space that followed a token gone with it.
 */
export function splitTagged(value: string): { tags: string[]; words: string } {
  const tags: string[] = [];
  const counts: Record<string, number> = {};
  for (const t of tokens(value)) {
    const tag = t.key;
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
export const stripTags = (value: string): string => value.replace(TOKEN, '').split(TAG_MARK).join('').split(POINT_MARK).join('');

/** There is something to say besides tags (what makes Send appear; a tags-only field shows the voice button). */
export const hasWords = (value: string): boolean => stripTags(value).trim() !== '';

/** What Send carries: the words with tokens written out as "[Title]", and the distinct boxes the tokens name, sorted. */
export function decodeTagged(value: string): { text: string; refs: string[] } {
  const refs = new Set<string>();
  // A point mention reads `[Box] "exact words"`; the run's scope stays the box. Stray marks are dropped from the words around the tokens, never from a point's own words.
  const clean = (t: string) => t.split(TAG_MARK).join('').split(POINT_MARK).join('');
  let text = '';
  let at = 0;
  for (const m of value.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    const label = m[1];
    const tag = TAG_BY_TITLE.get(label);
    if (tag) refs.add(tag);
    text += clean(value.slice(at, start)) + (m[2] ? `[${label}] "${decodeWords(m[2])}"` : `[${label}]`);
    at = start + m[0].length;
  }
  return { text: text + clean(value.slice(at)), refs: [...refs].sort() };
}

/** How many tokens of each box the value holds. */
export function tagCounts(value: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tokens(value)) {
    if (t.key) out[t.key] = (out[t.key] ?? 0) + 1;
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
  for (const { start, end, key: tag } of tokens(value)) {
    if (!tag || !left[tag]) continue;
    left[tag] -= 1;
    const after = value[end] === ' ';
    const before = !after && start > at && value[start - 1] === ' ';
    out += value.slice(at, before ? start - 1 : start);
    at = after ? end + 1 : end;
  }
  return out + value.slice(at);
}
