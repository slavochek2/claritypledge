/**
 * @file p1536-s4-composer-tags.test.ts
 * @description P1536 S4.2 / S4.3: the composer's inline box tags as a pure module. A tag is an atomic token in the field's text ("[Offers & Pricing]" between two invisible
 * marks); Send turns the tokens into plain "[Offers & Pricing]" text plus the box list the server validates; Backspace after a token removes the whole token.
 */
import { describe, expect, it } from 'vitest';
import { decodeTagged, hasWords, insertTagAt, removeTagBefore, snapOutOfTag, stripTags, TAG_MARK, tagToken } from '@/app/pages/chat/composer-tags';

const REVENUE = 'canvas:revenue';
const METRICS = 'canvas:metrics';

describe('P1536 S4.2 tag tokens in the composer text', () => {
  it('a tap inserts the token at the caret with a space after it, and the caret lands after that space', () => {
    const r = insertTagAt('', 0, REVENUE);
    expect(r?.value).toBe(`${tagToken(REVENUE)} `);
    expect(r?.caret).toBe(r?.value.length);
  });

  it('inserts in the middle of the text and keeps words apart from the token', () => {
    const r = insertTagAt('price is high', 6, REVENUE);
    expect(r?.value).toBe(`price ${tagToken(REVENUE)} is high`);
    expect(r?.value.slice(0, r?.caret)).toBe(`price ${tagToken(REVENUE)} `);
  });

  it('two taps give two tokens', () => {
    const one = insertTagAt('', 0, REVENUE);
    const two = insertTagAt(`${one?.value}€200 per pilot`, (one?.value.length ?? 0) + '€200 per pilot'.length, METRICS);
    expect(decodeTagged(two?.value ?? '').refs).toEqual([METRICS, REVENUE].sort());
  });

  it('refuses a tag that would take the field past its 4000-character cap', () => {
    expect(insertTagAt('x'.repeat(3995), 3995, REVENUE)).toBeNull();
  });

  it('Backspace right after a token removes the whole token, and only then', () => {
    const v = `${tagToken(REVENUE)} words`;
    const afterToken = tagToken(REVENUE).length; // caret directly after the closing mark
    const gone = removeTagBefore(v, afterToken);
    expect(gone?.value).toBe(' words');
    expect(gone?.caret).toBe(0);
    expect(removeTagBefore(v, afterToken + 1)).toBeNull(); // after the space: an ordinary Backspace
    expect(removeTagBefore('plain', 5)).toBeNull();
  });

  it('a caret inside a token snaps to the near edge by the direction it moved', () => {
    const v = `${tagToken(REVENUE)} words`;
    const end = tagToken(REVENUE).length;
    expect(snapOutOfTag(v, 4, end)).toBe(0); // moving left into it: to its start
    expect(snapOutOfTag(v, 4, 0)).toBe(end); // moving right into it: to its end
    expect(snapOutOfTag(v, end + 2, 0)).toBeNull(); // outside any token: left alone
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
