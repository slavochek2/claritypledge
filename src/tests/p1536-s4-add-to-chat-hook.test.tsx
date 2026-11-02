/**
 * @file p1536-s4-add-to-chat-hook.test.tsx
 * @description P1536 S4 review: what an Add to chat tap does while the page's read is not in hand. The REAL `useAddToChat` with a stand-in composer on its bus.
 *  - the tap uses the last read of the SAME version (`held`) when the fresh one is out (a re-read in flight, or failing): on a draft it acts at once
 *  - on a published version it needs the fresh read (Clone's decision does): it waits for it, and a tag that waits 15 seconds is dropped WITH a sentence to the owner,
 *    and the late read does not then start a Clone nobody asked for
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError }) }));

import { HELD_MAX_MS } from '@/app/pages/chat/composer-tag-bus';
import { useAddToChat, TAG_DROPPED_TEXT } from '@/app/pages/canvas/use-add-to-chat';

const draftView = { isOwner: true, version: 'canvas_dd', draft: { version: 'canvas_dd' }, publishedNone: false } as unknown as CanvasReady;
const publishedView = { isOwner: true, version: 'canvas_d1', draft: null, publishedNone: false } as unknown as CanvasReady;
const rep = (ready: CanvasReady | null, forVersion: string | null = null) => ({ ready, forVersion, held: ready ? { ready, identity: 'x' } : null });

function setup(over: { reported?: ReturnType<typeof rep>; held?: CanvasReady | null; version?: string | null; pending?: boolean } = {}) {
  const clone = vi.fn();
  const panel = { showThread: vi.fn(), setView: vi.fn(), setPanelOpen: vi.fn() };
  const inserted: Array<[string, boolean]> = [];
  const args = { reported: over.reported ?? rep(null), held: over.held ?? null, version: over.version ?? null, pending: !!over.pending };
  const hook = renderHook((a: typeof args) => useAddToChat(a.reported, a.held, a.version, true, { clone, pending: a.pending ? { version: 'canvas_d1', seq: 1, replace: null } : null, sheet: null, dismissSheet: vi.fn() }, panel), { initialProps: args });
  hook.result.current.bus.register((tag, sync) => { inserted.push([tag, sync]); });
  return { hook, clone, panel, inserted, args };
}

beforeEach(() => { vi.useFakeTimers(); toastError.mockClear(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('a draft, with the fresh read out', () => {
  it('acts at once on the last read of the same version: the thread is shown and the tag goes in inside the tap', () => {
    const { hook, clone, panel, inserted } = setup({ reported: rep(null, null), held: draftView, version: 'canvas_dd' });
    act(() => hook.result.current.tap.addToChat?.('canvas:revenue'));
    expect(panel.showThread).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([['canvas:revenue', true]]);
    expect(clone).not.toHaveBeenCalled();
  });
  it('but not on the last read of ANOTHER version (the address moved on): that waits', () => {
    const { hook, inserted } = setup({ reported: rep(null, null), held: draftView, version: 'canvas_other' });
    act(() => hook.result.current.tap.addToChat?.('canvas:revenue'));
    expect(inserted).toEqual([]);
  });
});

describe('the owner is still being asked (the J4 sheet is up)', () => {
  it('a held tag is not dropped while the sheet waits for an answer', () => {
    const clone = vi.fn();
    const panel = { showThread: vi.fn(), setView: vi.fn(), setPanelOpen: vi.fn() };
    const args = { sheetOpen: true };
    const hook = renderHook((a: typeof args) => useAddToChat(rep(publishedView, 'canvas_d1'), publishedView, 'canvas_d1', true, { clone, pending: null, sheet: a.sheetOpen ? {} : null, dismissSheet: vi.fn() }, panel), { initialProps: args });
    act(() => hook.result.current.tap.addToChat?.('canvas:revenue'));
    act(() => { vi.advanceTimersByTime(HELD_MAX_MS * 3); });
    expect(toastError).not.toHaveBeenCalled();
    expect(hook.result.current.bus.size()).toBe(1);
    hook.rerender({ sheetOpen: false });
    act(() => { vi.advanceTimersByTime(HELD_MAX_MS); });
    expect(toastError).toHaveBeenCalledWith(TAG_DROPPED_TEXT);
  });
});

describe('a published version', () => {
  it('with the fresh read: Clone is decided inside the tap', () => {
    const { hook, clone } = setup({ reported: rep(publishedView, 'canvas_d1'), held: publishedView, version: 'canvas_d1' });
    act(() => hook.result.current.tap.addToChat?.('canvas:revenue'));
    expect(clone).toHaveBeenCalledTimes(1);
  });
  it('without it: waits, and a tag that waits 15 s is dropped WITH a sentence; the read that arrives later starts no Clone', () => {
    const { hook, clone, args } = setup({ reported: rep(null), held: publishedView, version: 'canvas_d1' });
    act(() => hook.result.current.tap.addToChat?.('canvas:revenue'));
    expect(clone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(HELD_MAX_MS - 1); });
    expect(toastError).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(toastError).toHaveBeenCalledWith(TAG_DROPPED_TEXT);
    hook.rerender({ ...args, reported: rep(publishedView, 'canvas_d1') });
    expect(clone).not.toHaveBeenCalled();
  });
  it('the read arriving in time: Clone is decided then, once, and no sentence is said', () => {
    const { hook, clone, args, inserted } = setup({ reported: rep(null), held: publishedView, version: 'canvas_d1' });
    act(() => hook.result.current.tap.addToChat?.('canvas:revenue'));
    act(() => { vi.advanceTimersByTime(5000); });
    hook.rerender({ ...args, reported: rep(publishedView, 'canvas_d1') });
    expect(clone).toHaveBeenCalledTimes(1);
    hook.rerender({ ...args, reported: rep(publishedView, 'canvas_d1'), pending: true }); // Clone entered the pending state: the thread it was meant for is on screen
    expect(inserted).toEqual([['canvas:revenue', false]]);
    act(() => { vi.advanceTimersByTime(HELD_MAX_MS); });
    expect(toastError).not.toHaveBeenCalled(); // it was handed on: nothing is held to drop
  });
});
