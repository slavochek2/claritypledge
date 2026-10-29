/**
 * P1576 Part A: where dictated text lands in a draft, and how a draft that is not on screen
 * receives it. Pure helpers; the hook and the Composer are tested separately.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mergeDictation, DICTATION_BODY_MAX } from '@/app/pages/chat/dictation-text';
import { insertIntoDraft, peekDraft, clearDraftsExcept } from '@/app/pages/chat/chat-hooks';

describe('mergeDictation', () => {
  it('inserts into an empty draft with no padding', () => {
    expect(mergeDictation('', 'hello there', 0)).toEqual({ value: 'hello there', caret: 11, fits: true });
  });

  it('inserts at the caret, spacing both sides only where the neighbours need it', () => {
    expect(mergeDictation('Hi Bob', 'how are you', 6).value).toBe('Hi Bob how are you');
    expect(mergeDictation('Hi Bob ', 'how are you', 7).value).toBe('Hi Bob how are you');
    expect(mergeDictation('Hi  there', 'Bob', 3).value).toBe('Hi Bob there');
    expect(mergeDictation('Hi there', 'Bob', 3).value).toBe('Hi Bob there');
    expect(mergeDictation('Hi\nthere', 'Bob', 2).value).toBe('Hi Bob\nthere');
  });

  it('puts the caret at the end of the inserted text', () => {
    const r = mergeDictation('Hi there', 'Bob', 3);
    expect(r.value.slice(0, r.caret)).toBe('Hi Bob');
  });

  it('trims the dictated text and ignores an empty transcript', () => {
    expect(mergeDictation('abc', '  \n ', 3)).toEqual({ value: 'abc', caret: 3, fits: true });
    expect(mergeDictation('', '  hi  ', 0).value).toBe('hi');
  });

  it('clamps a caret that is stale (the draft got shorter or the position is negative)', () => {
    expect(mergeDictation('abc', 'x', 99).value).toBe('abc x');
    expect(mergeDictation('abc', 'x', -5).value).toBe('x abc');
  });

  it('never cuts: text that would pass the 4000-character body is refused whole, and the draft is left alone', () => {
    const draft = 'a'.repeat(DICTATION_BODY_MAX - 10);
    const r = mergeDictation(draft, 'b'.repeat(500), draft.length);
    expect(r).toEqual({ value: draft, caret: draft.length, fits: false });
  });

  it('text that fills the body exactly still fits', () => {
    const draft = 'a'.repeat(DICTATION_BODY_MAX - 6);
    const r = mergeDictation(draft + ' ', 'bbbbb', draft.length + 1);
    expect(r.fits).toBe(true);
    expect(r.value.length).toBe(DICTATION_BODY_MAX);
  });

  it('a full draft takes nothing and says so', () => {
    const draft = 'a'.repeat(DICTATION_BODY_MAX);
    expect(mergeDictation(draft, 'more', draft.length)).toEqual({ value: draft, caret: draft.length, fits: false });
  });
});

describe('insertIntoDraft (a draft that is not on screen)', () => {
  beforeEach(() => clearDraftsExcept(null));

  it('merges into the existing draft of THAT key, at the caret, and touches no other key', () => {
    insertIntoDraft('u:chat-a', 'first words', 0);
    insertIntoDraft('u:chat-b', 'other', 0);
    insertIntoDraft('u:chat-a', 'more', 5);
    expect(peekDraft('u:chat-a')).toBe('first more words');
    expect(peekDraft('u:chat-b')).toBe('other');
  });

  it('is a no-op for an empty transcript', () => {
    insertIntoDraft('u:chat-a', '   ', 0);
    expect(peekDraft('u:chat-a')).toBe('');
  });

  it('never lets a draft pass the 4000-character cap: a transcript that does not fit is refused and the draft stays as it was', () => {
    const draft = 'a'.repeat(DICTATION_BODY_MAX - 5);
    insertIntoDraft('u:chat-full', draft, 0);
    const took = insertIntoDraft('u:chat-full', 'late dictated words', draft.length);
    expect(took).toBe(false);
    expect(peekDraft('u:chat-full')).toBe(draft);
    expect(peekDraft('u:chat-full').length).toBeLessThanOrEqual(DICTATION_BODY_MAX);
  });

  it('says it took the words when they fit', () => {
    expect(insertIntoDraft('u:chat-fits', 'hello', 0)).toBe(true);
    expect(peekDraft('u:chat-fits')).toBe('hello');
  });
});
