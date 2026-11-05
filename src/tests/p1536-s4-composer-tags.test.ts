/**
 * @file p1536-s4-composer-tags.test.ts
 * @description P1536 S4.2 / S4.3: the composer's inline box tags as a pure module. A tag is an atomic token in the field's text ("[Offers & Pricing]" between two invisible
 * marks); Send turns the tokens into plain "[Offers & Pricing]" text plus the box list the server validates; Backspace after a token removes the whole token.
 */
import { describe, expect, it } from 'vitest';
import { decodeTagged, hasWords, addTag, joinTagged, removeTag, removeTagTokens, splitTagged, stripTags, tagCounts, TAG_MARK, tagToken } from '@/app/pages/chat/composer-tags';

const REVENUE = 'canvas:revenue';
const METRICS = 'canvas:metrics';

describe('P1536 S4.2 tag tokens in the composer text', () => {
  it('addTag gathers the token at the start of the value; a repeat leaves it as it is (P1621)', () => {
    const one = addTag('', REVENUE);
    expect(one).toBe(tagToken(REVENUE));
    const two = addTag(`${one} price is high`, METRICS);
    expect(two).toBe(`${tagToken(REVENUE)} ${tagToken(METRICS)} price is high`);
    expect(addTag(two ?? '', REVENUE)).toBe(two);
  });

  it('refuses a tag that would take the field past its 4000-character cap', () => {
    expect(addTag('x'.repeat(3995), REVENUE)).toBeNull();
  });

  it('splitTagged / joinTagged round-trip, and hoist a token found mid-text', () => {
    const v = `${tagToken(REVENUE)} ${tagToken(METRICS)} words here`;
    expect(splitTagged(v)).toEqual({ tags: [REVENUE, METRICS], words: 'words here' });
    expect(joinTagged([REVENUE, METRICS], 'words here')).toBe(v);
    expect(joinTagged([REVENUE], '')).toBe(tagToken(REVENUE));
    expect(splitTagged(`price ${tagToken(REVENUE)} is high`)).toEqual({ tags: [REVENUE], words: 'price is high' });
    expect(joinTagged(...(Object.values(splitTagged(`price ${tagToken(REVENUE)} is high`)) as [string[], string]))).toBe(`${tagToken(REVENUE)} price is high`);
    expect(splitTagged(`${tagToken(REVENUE)} a ${tagToken(REVENUE)}`).tags).toEqual([REVENUE]); // a duplicate collapses
    expect(splitTagged('plain [Offers & Pricing] text')).toEqual({ tags: [], words: 'plain [Offers & Pricing] text' }); // typed brackets stay words
  });

  it('removeTag takes one pill and keeps the rest and the words', () => {
    const v = `${tagToken(REVENUE)} ${tagToken(METRICS)} words`;
    expect(removeTag(v, REVENUE)).toBe(`${tagToken(METRICS)} words`);
    expect(removeTag(`${tagToken(REVENUE)}`, REVENUE)).toBe('');
  });

  it('counts the tokens of each box, and removes only that many, first ones first', () => {
    const v = `${tagToken(REVENUE)} a ${tagToken(METRICS)} b ${tagToken(REVENUE)}`;
    expect(tagCounts(v)).toEqual({ [METRICS]: 1, [REVENUE]: 2 });
    // a voice note was sent with ONE Offers & Pricing token and the Milestone one; a second Offers & Pricing token was added after
    const after = removeTagTokens(v, { [REVENUE]: 1, [METRICS]: 1 });
    expect(after).toBe(`a b ${tagToken(REVENUE)}`); // each token went with the space that followed it: no orphan spaces
    expect(tagCounts(after)).toEqual({ [REVENUE]: 1 });
    // a token at the end takes the space before it; one alone leaves nothing
    expect(removeTagTokens(`words ${tagToken(REVENUE)}`, { [REVENUE]: 1 })).toBe('words');
    expect(removeTagTokens(`${tagToken(REVENUE)} `, { [REVENUE]: 1 })).toBe('');
    expect(removeTagTokens(`a ${tagToken(REVENUE)} ${tagToken(METRICS)} b`, { [REVENUE]: 1, [METRICS]: 1 })).toBe('a b');
  });
});

describe('P1536 S4.3 what Send carries', () => {
  it('turns tokens into plain bracketed text and lists each box once, in a stable order', () => {
    const body = `${tagToken(REVENUE)} €200 per pilot ${tagToken(METRICS)} ${tagToken(REVENUE)}`;
    const d = decodeTagged(body);
    expect(d.text).toBe('[Offers & Pricing] €200 per pilot [My next milestone] [Offers & Pricing]');
    expect(d.refs).toEqual([METRICS, REVENUE]);
    expect(d.text).not.toContain(TAG_MARK);
  });

  it('text typed by hand in brackets is NOT a tag (only a token with its marks is)', () => {
    const d = decodeTagged('[Offers & Pricing] is typed');
    expect(d.refs).toEqual([]);
    expect(d.text).toBe('[Offers & Pricing] is typed');
  });

  it('a damaged token (marks gone, label edited) degrades to plain text and never names a box', () => {
    const d = decodeTagged(`${TAG_MARK}[Offers & Prici]${TAG_MARK} x`);
    expect(d.refs).toEqual([]);
    expect(d.text).not.toContain(TAG_MARK);
  });

  it('a message of tokens alone has no words: the voice button, not Send, is what the field shows', () => {
    expect(hasWords(`${tagToken(REVENUE)} `)).toBe(false);
    expect(hasWords(`${tagToken(REVENUE)} price`)).toBe(true);
    expect(hasWords('   ')).toBe(false);
    expect(stripTags(`${tagToken(REVENUE)} price`).trim()).toBe('price');
  });
});
