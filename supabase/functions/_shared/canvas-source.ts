/**
 * P1536: the owner's material as the model sees it, the rule that a quote must come from the OWNER's own
 * words, and the filter that keeps other people's names out of a canvas.
 */

import { estimateTokens } from './mirror-agent.ts';
import { MAX_MATERIAL_TOKENS, MAX_QUOTE_CHARS, MIN_QUOTE_CHARS } from './canvas-draft.ts';
import type { Material, MaterialInput, MaterialItem } from './canvas-types.ts';

export const cutChars = (s: string, n: number) => Array.from(s).slice(0, n).join('');

const DASHES = /\s*[–—]\s*/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
/** Model text made safe for a canvas: no dashes, no links, one line, at most `max` characters. */
export const clean = (s: string, max: number) => Array.from(s.replace(DASHES, ', ').replace(URL_RE, '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

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

/** `cap` is the material's token budget (the request fit lowers it until the whole request fits the reserved input). */
export function assembleMaterial(input: MaterialInput, cap: number = MAX_MATERIAL_TOKENS): Material {
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
  raw.push(...others);
  // The owner's own words fill the cap first; other people's lines take what is left.
  const items: MaterialItem[] = [];
  let used = 0;
  let truncated = false;
  for (const it of raw) {
    const room = cap - used - itemOverhead - estimateTokens(it.source);
    if (room <= 0) { truncated = true; continue; }
    const text = cutToTokens(it.text, room);
    if (text.length < it.text.length) truncated = true;
    items.push({ ...it, text });
    used += estimateTokens(text) + estimateTokens(it.source) + itemOverhead;
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const name = raw.normalize('NFKC').trim();
    if (name.length < 2) continue;
    whole.push(new RegExp(`${WORD_L}${escapeRe(name).replace(/\s+/g, '\\s+')}${WORD_R}`, 'iu'));
    for (const part of name.split(/\s+/)) {
      if (Array.from(part).length >= 3) parts.push(new RegExp(`${WORD_L}${escapeRe(part)}${WORD_R}`, 'u'));
    }
  }
  return (text) => {
    const t = text.normalize('NFKC');
    return whole.some((r) => r.test(t)) || parts.some((r) => r.test(t));
  };
}

