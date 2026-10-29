// @vitest-environment jsdom
/**
 * P1542 review rounds 5–9: the close's typed-answer drafts (use-close-draft.ts) — words only. The quote permission is
 * never kept here since round 9 (it lives on the server; p1542-close-consent.test.tsx).
 *  D1 — owned by one person: another viewer in the same tab never sees them;
 *  D3 — a revision of a saved answer wins over the server's older answer until it is submitted;
 *  D4 — cleared once saved, and on finish;
 *  Q2 — a save that lands clears only what it sent;
 *  Q4 — a malformed draft is read field by field;
 *  round 9 — a permission an older draft kept is dropped, never read.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCloseDraft } from '@/app/prototypes/events/close/use-close-draft';

type Saved = { liked: string | null; improve: string | null };
const fresh: Saved = { liked: null, improve: null };
const open = (viewer: string, saved: Saved = fresh) => renderHook(() => useCloseDraft(viewer, 'ev-1', saved));
const KEY = 'p1542-close-draft:alice:ev-1';

beforeEach(() => sessionStorage.clear());

describe('the close drafts (words only)', () => {
  it('D1: someone signing in next in the same tab sees none of the previous attendee\'s words', () => {
    const a = open('alice');
    act(() => a.result.current.setLiked('Private words from Alice.'));
    a.unmount();
    const b = open('bob');
    expect(b.result.current.liked).toBe('');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('Private words from Alice.');
  });

  it('D3: a revision of a saved answer wins over the older server answer until it is submitted', () => {
    const saved = { liked: 'Old saved answer.', improve: null };
    const a = open('alice', saved);
    act(() => a.result.current.setLiked('My revised answer.'));
    a.unmount();
    expect(open('alice', saved).result.current.liked).toBe('My revised answer.');
  });

  it('D4: once saved, a draft goes (the server answer is used again); clear() empties it', () => {
    const a = open('alice');
    act(() => a.result.current.setImprove('More water.'));
    act(() => a.result.current.markSaved({ liked: '', improve: 'More water.' }));
    a.unmount();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    const b = open('alice');
    act(() => b.result.current.setLiked('x'));
    act(() => b.result.current.clear());
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('Q2: edits made while a save is in flight survive that save returning', () => {
    const a = open('alice');
    act(() => a.result.current.setLiked('First words.'));
    const sent = { liked: 'First words.', improve: '' };
    act(() => a.result.current.setLiked('First words, then more.'));
    act(() => a.result.current.markSaved(sent)); // the older save lands
    a.unmount();
    expect(open('alice').result.current.liked).toBe('First words, then more.');
  });

  it('Q4: a malformed draft is ignored field by field', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ liked: 'Words.', improve: 5 }));
    expect(open('alice').result.current).toMatchObject({ liked: 'Words.', improve: '' });
  });

  it('round 9: a permission an older draft kept is dropped from storage and never offered', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ liked: 'Words.', quoteOk: true, refused: true }));
    const a = open('alice');
    expect(Object.keys(a.result.current)).not.toContain('quoteOk');
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ liked: 'Words.' });
  });
});
