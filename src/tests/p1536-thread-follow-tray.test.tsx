/**
 * @file p1536-thread-follow-tray.test.tsx
 * @description P1536 final review V4: when the canvas tray under the thread appears or grows (the thread's viewport
 * shrinks), a reader who is following the latest message stays on it; a reader who scrolled up is left where they are.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationApi } from '@/app/pages/chat/MessageList';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: vi.fn() }));

import { MessageList } from '@/app/pages/chat/MessageList';

const observers: Array<() => void> = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const conv = {
  status: 'ready', messages: [], stats: null, hasMore: false, loadingEarlier: false, loadEarlier: vi.fn(), ensureLoaded: vi.fn(),
  lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
} as unknown as ConversationApi;

function mount() {
  render(<MessageList conv={conv} actions={{} as never} viewerId="me" authors={{}} label="Thread messages" empty="empty" lead={<p>opener</p>} />);
  const scroller = screen.getByTestId('message-scroller');
  let height = 1000;
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => height });
  let client = 500;
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => client });
  const trayGrows = (by: number) => {
    client -= by;
    act(() => observers.forEach((cb) => cb()));
  };
  return { scroller, trayGrows, setHeight: (h: number) => (height = h) };
}

describe('the thread follows its latest message when the tray appears or grows', () => {
  it('a reader at the bottom is kept at the bottom as the thread shrinks', () => {
    const { scroller, trayGrows } = mount();
    scroller.scrollTop = 500;
    fireEvent.scroll(scroller);
    trayGrows(200);
    expect(scroller.scrollTop).toBe(1000);
  });

  it('CONTROL: a reader who scrolled up is left where they are', () => {
    const { scroller, trayGrows } = mount();
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    trayGrows(200);
    expect(scroller.scrollTop).toBe(100);
  });
});
