/**
 * P1660 — stripHashtags must not cut a `#tag` out of a URL, a markdown link
 * target, or the front of a longer token. Each case was wrong on main c6dd21917
 * (P1638 triage, 2026-11-10). Inline-tag deletion is the TESTED design
 * (stripHashtags.test.ts) and is deliberately not changed here.
 */
import { describe, it, expect } from 'vitest';
import { extractHashtags, stripHashtags } from '@/lib/utils';

describe('P1660: stripHashtags leaves URLs and longer tokens intact', () => {
  it('keeps a URL fragment that matches a tag', () => {
    expect(stripHashtags('See https://a.com/p#climate now', ['climate'])).toBe('See https://a.com/p#climate now');
  });

  it('keeps the fragment of a markdown link target', () => {
    expect(stripHashtags('[x](https://a.com/p#climate)', ['climate'])).toBe('[x](https://a.com/p#climate)');
  });

  it('still strips the real tag that follows a URL carrying the same fragment', () => {
    expect(stripHashtags('Read https://a.com/p#climate #climate', ['climate'])).toBe('Read https://a.com/p#climate');
  });

  it('does not cut a tag-shaped prefix off a longer token', () => {
    expect(stripHashtags('on #node.js here', ['node'])).toBe('on #node.js here');
    expect(stripHashtags('see #vue:3 docs', ['vue'])).toBe('see #vue:3 docs');
  });

  it('still strips a tag that ends a sentence with a period or colon', () => {
    expect(stripHashtags('about #trust.', ['trust'])).toBe('about .');
    expect(stripHashtags('tags: #trust: more', ['trust'])).toBe('tags: : more');
  });

  it('keeps a system-tag-shaped fragment inside a URL', () => {
    expect(stripHashtags('see https://a.com/doc#st8 here #st8', [])).toBe('see https://a.com/doc#st8 here');
  });
  it('keeps a www. link fragment', () => {
    expect(stripHashtags('see www.a.com/p#climate now', ['climate'])).toBe('see www.a.com/p#climate now');
  });

  it('does not cut a tag-shaped piece out of the middle of a token', () => {
    expect(stripHashtags('see issue#climate there', ['climate'])).toBe('see issue#climate there');
  });
});

// Spec review (Gemini, GLM): the same link and token rules apply to extraction,
// whose result is SAVED as the story's tags.
describe('P1660: extractHashtags does not read tags out of links', () => {
  it('a URL fragment is not extracted as a tag', () => {
    expect(extractHashtags('Read https://a.com/p#climate today')).toEqual([]);
    expect(extractHashtags('Read [x](https://a.com/p#climate) and #trust')).toEqual(['trust']);
    expect(extractHashtags('see www.a.com/p#climate')).toEqual([]);
  });

  it('a # in the middle of a token is not a tag', () => {
    expect(extractHashtags('see issue#12 and #trust')).toEqual(['trust']);
  });

  it('a tag-shaped prefix of a longer token is not saved as a tag', () => {
    expect(extractHashtags('I use #node.js and #trust')).toEqual(['trust']);
  });

  it('a # after a non-ASCII letter is not a tag', () => {
    expect(extractHashtags('Read café#climate today')).toEqual([]);
    expect(stripHashtags('Read café#climate today', ['climate'])).toBe('Read café#climate today');
  });

  it('links are restored before the whitespace tidy, and a glued second # is not a tag', () => {
    expect(stripHashtags('see https://a.com/x#trust  #trust   now', ['trust'])).toBe('see https://a.com/x#trust now');
    expect(extractHashtags('#ai#tech')).toEqual([]);
    expect(stripHashtags('#ai#tech and #trust', ['trust'])).toBe('#ai#tech and');
  });

  it('text that already holds the placeholder characters is not corrupted', () => {
    const odd = 'glyph \uE0000\uE001 and #trust';
    expect(stripHashtags(odd, ['trust'])).toBe('glyph \uE0000\uE001 and');
  });

  it('slash-joined tags are left as typed: neither saved nor stripped', () => {
    expect(extractHashtags('Discussing #climate/#energy policy')).toEqual([]);
    expect(stripHashtags('Discussing #climate/#energy policy', ['climate', 'energy'])).toBe('Discussing #climate/#energy policy');
  });

  it('"www." inside a word is not a link', () => {
    expect(stripHashtags('awww. #blessed today', ['blessed'])).toBe('awww. today');
  });

  it('a URL with brackets in its query keeps its fragment, as linkify renders it', () => {
    expect(stripHashtags('See https://example.com/search?q=[climate]#results now', ['results'])).toBe('See https://example.com/search?q=[climate]#results now');
    expect(extractHashtags('See https://example.com/search?q=[climate]#results now')).toEqual([]);
    expect(extractHashtags('See www.example.com/search?q=[climate]#results now')).toEqual([]);
  });

  it('many links in one text are all restored', () => {
    const links = Array.from({ length: 12 }, (_, i) => `https://a.com/p${i}#climate`).join(' ');
    expect(stripHashtags(`${links} #climate`, ['climate'])).toBe(links);
  });

  it('a decomposed accent before # still makes one token', () => {
    expect(extractHashtags('Read cafe\u0301#climate today')).toEqual([]);
  });

  it('a scheme-less link keeps its fragment and is not read as a tag', () => {
    expect(stripHashtags('see example.com/#climate now', ['climate'])).toBe('see example.com/#climate now');
    expect(extractHashtags('see github.com/org/repo/#readme')).toEqual([]);
  });

  it('a markdown link with a title keeps its target', () => {
    expect(stripHashtags('[Jump](#climate "Climate section") #climate', ['climate'])).toBe('[Jump](#climate "Climate section")');
    expect(extractHashtags('[Jump](#climate "Climate section")')).toEqual([]);
  });

  it('a real tag beside a link is still extracted', () => {
    expect(extractHashtags('https://a.com/p#climate #climate')).toEqual(['climate']);
  });
});
