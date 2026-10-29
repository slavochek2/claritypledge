/**
 * P1576: dictated words that did not fit their draft wait in a per-chat store, never in a draft that could
 * pass the message cap and never in a hook that a chat switch throws away.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearPending, getPending, holdPending, usePending } from '@/app/pages/chat/pending-dictation';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';

beforeEach(() => {
  clearDraftsExcept(null);
  clearPending('u1:a');
  clearPending('u1:b');
});

describe('pending dictation store', () => {
  it('holds the words with their caret, per chat', () => {
    holdPending('u1:a', 'long words', 7);
    expect(getPending('u1:a')).toEqual({ text: 'long words', caret: 7 });
    expect(getPending('u1:b')).toBeNull();
  });

  it('a second overflow in the same chat adds to the first: no words are dropped', () => {
    holdPending('u1:a', 'first part', 3);
    holdPending('u1:a', 'second part', 99);
    expect(getPending('u1:a')).toEqual({ text: 'first part second part', caret: 3 });
  });

  it('clear drops one chat only', () => {
    holdPending('u1:a', 'x', 0);
    holdPending('u1:b', 'y', 0);
    clearPending('u1:a');
    expect(getPending('u1:a')).toBeNull();
    expect(getPending('u1:b')).not.toBeNull();
  });

  it('empty text is never held', () => {
    holdPending('u1:a', '   ', 0);
    expect(getPending('u1:a')).toBeNull();
  });

  it('signing out or switching person drops the words with the drafts: one person\'s words never reach the next', () => {
    holdPending('u1:a', 'mine', 0);
    holdPending('u2:a', 'theirs', 0);
    clearDraftsExcept('u2');
    expect(getPending('u1:a')).toBeNull();
    expect(getPending('u2:a')).not.toBeNull();
    clearPending('u2:a');
  });

  it('usePending follows the store for its key', () => {
    const { result } = renderHook(() => usePending('u1:a'));
    expect(result.current).toBeNull();
    act(() => holdPending('u1:a', 'arrived later', 1));
    expect(result.current).toEqual({ text: 'arrived later', caret: 1 });
    act(() => clearPending('u1:a'));
    expect(result.current).toBeNull();
  });

  it('a change to another chat does not wake this one', () => {
    const renders = vi.fn();
    renderHook(() => { renders(); return usePending('u1:a'); });
    const before = renders.mock.calls.length;
    act(() => holdPending('u1:b', 'elsewhere', 0));
    expect(renders.mock.calls.length).toBe(before);
  });
});
