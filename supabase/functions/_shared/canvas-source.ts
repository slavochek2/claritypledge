/**
 * P1536: the owner's material as the model sees it, the rule that a quote must come from the OWNER's own
 * words, and the filter that keeps other people's names out of a canvas.
 */

import { estimateTokens } from './mirror-agent.ts';
import { MAX_MATERIAL_TOKENS, MAX_QUOTE_CHARS, MIN_QUOTE_CHARS } from './canvas-draft.ts';
import type { Material, MaterialInput, MaterialItem, TriggerInput } from './canvas-types.ts';

export const cutChars = (s: string, n: number) => Array.from(s).slice(0, n).join('');

/** Words that cannot end a label: a cut that leaves one hanging ("…buying sourdough an") reads as broken, so the cut steps back past it. */
const JOINERS = /\s+(?:an?|the|and|or|of|to|for|from|with|in|at|by|on|as|but|into|than|that|who|whom|which|are|is|were|was)$/i;

/**
 * `s` cut to at most `max` characters at the end of a word: never in the middle of one, and never on a joining word. One word longer than
 * `max` has no word end to cut at, so it is cut hard (the only such case).
 */
export function cutAtWord(s: string, max: number): string {
  const cps = Array.from(s);
  if (cps.length <= max) return s;
  const head = cps.slice(0, max).join('');
  let base = head;
  if (!/\s/u.test(cps[max] ?? '')) {
    const space = head.search(/\s\S*$/u);
    if (space <= 0) return head;
    base = head.slice(0, space);
  }
  return trimHangingWords(base) || head;
}

/** `s` without a joining word or a separator left at its end. */
export function trimHangingWords(s: string): string {
  let out = s.trimEnd();
  for (let again = true; again;) {
    const next = out.replace(JOINERS, '').replace(/[\s,;:(-]+$/u, '');
    again = next !== out && next.length > 0;
    if (again) out = next;
  }
  return out;
}

const DASHES = /\s*[–—]\s*/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
/** Model text made safe for a canvas: no dashes, no links, one line, at most `max` characters. */
export const clean = (s: string, max: number) => Array.from(s.replace(DASHES, ', ').replace(URL_RE, '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

const LINK_MD = /\[([^\]]*)\]\([^)]*\)/g;
/** Extensions of files an owner names in a note (offer.pdf): the one kind of `name.letters` that is not an address. */
const FILE_EXTENSIONS = 'pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|md|png|jpg|jpeg|gif|webp|heic|mp3|mp4|m4a|wav|zip';
/** Top-level names that make " dot com" an address when a model spells the dot out. */
const TLDS = 'com|org|net|io|co|app|dev|me|ai|info|biz|xyz|site|online|example|test|local|us|uk|de|fr|ru|cn|jp|in|au|ca|nl|es|it|ch|se|no|fi|pl|br|edu|gov|eu|tv|to|ly|gg|sh|cc|club|shop|store|tech|cloud|link|page|web|blog';
/** Anything shaped like an address: a scheme, `www.`, an e-mail, or `label.letters` with a letter in the label, bar a file extension. 2.50baht and v1.2a are not (digits in the tail). */
const ADDRESSES = new RegExp(`\\b(?:https?|ftp):\\/\\/\\S+|\\bwww\\.\\S+|\\S+@\\S+\\.\\S+|(?<![\\w.-])(?=[a-z0-9-]*[a-z])[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?!(?:${FILE_EXTENSIONS})\\b)[a-z]{2,}\\b(?:\\/\\S*)?`, 'gi');
/** Ways to write a dot so a filter does not see an address: "(dot)", "[.]", " dot com", the ideographic and fullwidth full stops. */
const DISGUISED_DOTS = [/[。｡]/g, /\s*[[(]\s*(?:\.|dot)\s*[\])]\s*/gi, new RegExp(`\\s+dot\\s+(?=(?:${TLDS})\\b)`, 'gi')];
const PHONE_RUNS = /(?<![\w.,])\+?(?:\d[\s().-]{0,2}){7,}\d/g;
/**
 * Free model text that reaches the owner outside a point (the note, the focus, an offer, a question): no link of any kind (a scheme,
 * a www name, an e-mail address or a bare domain, however the dot is written), no phone-number-like run, no markup, no double quote (the
 * note is shown inside quotation marks), one line, at most `max` characters. Nothing that survives can render as a link.
 */
export function cleanFreeText(s: string, max: number): string {
  let t = s.normalize('NFKC').replace(/\p{Cf}/gu, '');
  for (const re of DISGUISED_DOTS) t = t.replace(re, '.');
  t = t.replace(LINK_MD, '$1').replace(ADDRESSES, ' ').replace(PHONE_RUNS, ' ');
  return clean(t.replace(/[<>[\]()*_`#|~{}\\"“”„]/g, ' '), max);
}

/** `text` cut to at most `tokens` estimated tokens, never splitting a code point. */
function cutToTokens(text: string, tokens: number): string {
  if (estimateTokens(text) <= tokens) return text;
  const cps = Array.from(text);
  let lo = 0;
  let hi = cps.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(cps.slice(0, mid).join('')) <= tokens) lo = mid; else hi = mid - 1;
  }
  return cps.slice(0, lo).join('');
}

const itemOverhead = 12; // the quoted wrapper around each item's text
/** The most of one message the model reads (about 16,000 characters). It sits outside the material cap. */
export const MAX_TRIGGER_TOKENS = 4_000;

/** The pieces of material in the order they fill the cap: the owner's messages, files, links and own lines of copied chats, then other people's lines. */
function rawItems(input: MaterialInput): MaterialItem[] {
  const raw: MaterialItem[] = [];
  const notes = [input.note ?? '', ...(input.messages ?? [])].map((s) => s.trim()).filter(Boolean);
  if (notes.length) raw.push({ kind: 'note', source: 'owner messages', text: notes.join('\n\n'), owner: true });
  for (const f of input.files) if (f.text.trim()) raw.push({ kind: 'file', source: f.name, text: f.text.trim(), owner: true });
  for (const l of input.links) if (l.text.trim()) raw.push({ kind: 'link', source: l.url, text: l.text.trim(), owner: true });
  const others: MaterialItem[] = [];
  for (const c of input.copies ?? []) {
    const mine = c.lines.filter((l) => l.by === 'owner' && l.text.trim()).map((l) => l.text.trim()).join('\n');
    const theirs = c.lines.filter((l) => l.by !== 'owner' && l.text.trim()).map((l) => l.text.trim()).join('\n');
    if (mine) raw.push({ kind: 'note', source: `${c.label} (owner's lines)`, text: mine, owner: true });
    if (theirs) others.push({ kind: 'other_person', source: `${c.label} (other people's lines)`, text: theirs, owner: false });
  }
  return [...raw, ...others];
}

const TRIGGER_SOURCE = 'owner message (this run)';
const costOf = (text: string, source: string) => estimateTokens(text) + estimateTokens(source) + itemOverhead;

/** The message that started this run: first, never cut by the cap, only by its own bound. */
function triggerItem(trigger: TriggerInput): { item: MaterialItem; cut: boolean } {
  const whole = trigger.text.trim();
  const text = cutToTokens(whole, MAX_TRIGGER_TOKENS);
  return { item: { kind: 'note', source: TRIGGER_SOURCE, text, owner: true, trigger: true, tagged: trigger.tagged?.length ? [...trigger.tagged] : null }, cut: text.length < whole.length };
}

/** `cap` is the material's token budget (the request fit lowers it until the whole request fits the reserved input). */
export function assembleMaterial(input: MaterialInput, cap: number = MAX_MATERIAL_TOKENS): Material {
  // The trigger message goes first and is never cut by `cap` (only by its own bound): older material is cut, this run's message never.
  const items: MaterialItem[] = [];
  let used = 0;
  let truncated = false;
  if (input.trigger?.text.trim()) {
    const t = triggerItem(input.trigger);
    items.push(t.item);
    used += costOf(t.item.text, TRIGGER_SOURCE);
    truncated = t.cut;
  }
  // The owner's own words fill the cap first; other people's lines take what is left.
  for (const it of rawItems(input)) {
    const room = cap - used - itemOverhead - estimateTokens(it.source);
    if (room <= 0) { truncated = true; continue; }
    const text = cutToTokens(it.text, room);
    if (text.length < it.text.length) truncated = true;
    if (!text.trim()) continue; // the room fit no word of it: no empty item, and the cut is already reported
    items.push({ ...it, text });
    used += costOf(text, it.source);
  }
  return { items, tokens: used, truncated };
}

/** The comparison form for quote checks: case, spacing, quote marks and compatibility forms ignored. */
export function normalizeForQuote(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/\s+/g, ' ').trim();
}

/** The text a quote may come from: owner-sourced items only. */
export function ownerHaystack(material: Material): string {
  return normalizeForQuote(material.items.filter((i) => i.owner).map((i) => i.text).join('\n'));
}

/** True when `quote` is long enough and found verbatim in the owner-sourced haystack. */
export function quoteIsOwnerSourced(quote: unknown, haystack: string): boolean {
  if (typeof quote !== 'string') return false;
  const q = normalizeForQuote(quote.slice(0, MAX_QUOTE_CHARS * 2));
  return q.length >= MIN_QUOTE_CHARS && haystack.includes(q);
}

// ── Other people's names ────────────────────────────────────────────────────

const CONFUSABLES: Record<string, string> = {
  // Cyrillic and Greek letters that read as Latin ones, mapped to them (after lower-casing); no dependency, not exhaustive
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x',
  'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g',
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ζ': 'z', 'η': 'n',
};

/** The comparison form for names: compatibility forms, no zero-width or other format characters, lower case, look-alike letters folded. */
export function foldForNames(s: string): string {
  return Array.from(s.normalize('NFKC').replace(/\p{Cf}/gu, '').toLowerCase()).map((ch) => CONFUSABLES[ch] ?? ch).join('');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A regular-expression source for a name that also matches its look-alike spellings: each letter, in either case, or any letter that folds to it. */
export function lookAlikePattern(name: string): string {
  return Array.from(name.normalize('NFKC').replace(/\p{Cf}/gu, '').trim()).map((ch) => {
    if (/\s/u.test(ch)) return '\\s+';
    const base = foldForNames(ch);
    const same = [ch, ch.toLowerCase(), ch.toUpperCase(), base, base.toUpperCase(), ...Object.keys(CONFUSABLES).filter((k) => CONFUSABLES[k] === base).flatMap((k) => [k, k.toUpperCase()])];
    return `[${[...new Set(same)].map(escapeRe).join('')}]`;
  }).join('');
}

const WORD_L = '(?<![\\p{L}\\p{N}])';
const WORD_R = '(?![\\p{L}\\p{N}])';

/**
 * A matcher for the names of other people. A whole name matches in any case; a single part of a name (at
 * least 3 letters) matches as written, so "Anna Kovacs" also drops "Anna" but not "banana". A false drop
 * costs one point and is told to the owner; a leak puts a name in a canvas that can be shared by link.
 */
export function nameMatcher(otherNames: readonly string[]): (text: string) => boolean {
  const whole: RegExp[] = [];
  const parts: RegExp[] = [];
  for (const raw of otherNames) {
    const name = foldForNames(raw).trim();
    if (name.length < 2) continue;
    whole.push(new RegExp(`${WORD_L}${escapeRe(name).replace(/\s+/g, '\\s+')}${WORD_R}`, 'iu'));
    for (const part of name.split(/\s+/)) {
      if (Array.from(part).length >= 3) parts.push(new RegExp(`${WORD_L}${escapeRe(part)}${WORD_R}`, 'iu'));
    }
  }
  return (text) => {
    const t = foldForNames(text);
    return whole.some((r) => r.test(t)) || parts.some((r) => r.test(t));
  };
}

