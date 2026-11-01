/**
 * @file p1536-walk7-field-fit.test.tsx
 * @description P1536 walkthrough 7, item 3: the composer field is measured again when its WIDTH changes with the same text (Upload coming back
 * narrows it; a pane that was hidden is shown; the panel opens), not only when the text changes. A callback where only the height changed measures
 * nothing (setting the height fires the observer: it must not loop). The 5-line cap and overflow stay as they were; with no ResizeObserver typing
 * still grows the field; the observer is disconnected on unmount.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { Composer } from '@/app/pages/chat/Composer';
import { COMPOSER_MAX } from '@/app/pages/chat/use-field-fit';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';

const dims = { scrollHeight: 40, clientWidth: 300 };
const observers: Array<{ cb: () => void; observed: Element[]; disconnected: boolean }> = [];
class FakeResizeObserver {
  rec: { cb: () => void; observed: Element[]; disconnected: boolean };
  constructor(cb: () => void) {
    this.rec = { cb, observed: [], disconnected: false };
    observers.push(this.rec);
  }
  observe(el: Element) { this.rec.observed.push(el); }
  unobserve() {}
  disconnect() { this.rec.disconnected = true; }
}
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const fire = async () => { await act(async () => { observers.forEach((o) => !o.disconnected && o.cb()); }); };
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

beforeEach(() => {
  dims.scrollHeight = 40;
  dims.clientWidth = 300;
  observers.length = 0;
  clearDraftsExcept(null);
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => dims.scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => dims.clientWidth });
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  vi.unstubAllGlobals();
});

const mount = () => render(<Composer draftKey="walk7-fit" placeholder="Message" onSend={vi.fn()} />);

describe('3: the field is re-measured when its width changes', () => {
  it('same text, the width changes: the height follows what the text now needs', async () => {
    mount();
    dims.scrollHeight = 48;
    type('two lines at the wide width');
    expect(field().style.height).toBe('48px');
    dims.clientWidth = 200; // narrower: the same text wraps to more lines
    dims.scrollHeight = 96;
    await fire();
    expect(field().style.height).toBe('96px');
  });

  it('a pane shown after being hidden (measured 0 and fell to 40) is measured again when it gets its width', async () => {
    dims.clientWidth = 0;
    dims.scrollHeight = 0;
    mount();
    type('some words');
    expect(field().style.height).toBe('40px');
    dims.clientWidth = 280;
    dims.scrollHeight = 72;
    await fire();
    expect(field().style.height).toBe('72px');
  });

  it('a callback where only the height changed measures nothing (no loop)', async () => {
    mount();
    dims.scrollHeight = 48;
    type('two lines');
    dims.scrollHeight = 300; // would be read if it measured
    await fire();
    expect(field().style.height).toBe('48px');
  });

  it('over the cap: stays capped with overflow auto, before and after a width change', async () => {
    mount();
    dims.scrollHeight = 500;
    type('a very long text');
    expect(field().style.height).toBe(`${COMPOSER_MAX}px`);
    expect(field().style.overflowY).toBe('auto');
    dims.clientWidth = 250;
    dims.scrollHeight = 700;
    await fire();
    expect(field().style.height).toBe(`${COMPOSER_MAX}px`);
    expect(field().style.overflowY).toBe('auto');
    dims.clientWidth = 600;
    dims.scrollHeight = 60;
    await fire();
    expect(field().style.height).toBe('60px');
    expect(field().style.overflowY).toBe('hidden');
  });

  it('the observer watches the field and is disconnected on unmount', () => {
    const view = mount();
    expect(observers).toHaveLength(1);
    expect(observers[0]!.observed).toEqual([field()]);
    expect(observers[0]!.disconnected).toBe(false);
    view.unmount();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });
});

describe('3: CONTROL', () => {
  it('no ResizeObserver in the environment: no throw, typing still grows the field', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    mount();
    dims.scrollHeight = 64;
    type('three\nlines\nhere');
    expect(field().style.height).toBe('64px');
  });
});
