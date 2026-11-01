/**
 * @file p1536-walk8-final.test.tsx
 * @description P1536 final walk. (1) Under React StrictMode (development, where the founder's UAT runs) the composer field's width observer must survive
 * the effect replay: the browser walk found restored text clipped after Retry because the observer was disconnected and never made again. (2) Clone's
 * reserve also holds its place while the route has not yet said whether the viewer may have the workspace (auth and the chat list still out): Share was
 * drawn before the reserve existed in 1 of 3 fresh loads and jumped about 100px.
 */
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const ctx = vi.hoisted(() => ({ clone: undefined as undefined | (() => void), active: false, cloneUnknown: false as boolean | undefined }));
const svc = vi.hoisted(() => ({ getCanvasDraftAvailability: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/components/canvas/canvas-workspace-context', () => ({ useCanvasWorkspace: () => ({ clone: ctx.clone, active: ctx.active, cloneSeq: null, cloneUnknown: ctx.cloneUnknown }) }));

import { CloneButton } from '@/app/components/canvas/canvas-clone-button';
import { Composer } from '@/app/pages/chat/Composer';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';

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
const live = () => observers.filter((o) => !o.disconnected);

beforeEach(() => {
  vi.resetAllMocks();
  resetCanvasAvailability();
  ctx.clone = vi.fn();
  ctx.active = false;
  ctx.cloneUnknown = false;
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

describe('1: the field keeps re-measuring under StrictMode', () => {
  const mount = () => render(<StrictMode><Composer draftKey="walk8-fit" placeholder="Message" onSend={vi.fn()} /></StrictMode>);

  it('after the effect replay one observer is live, watching the field, and a width change re-measures', async () => {
    mount();
    expect(live()).toHaveLength(1);
    expect(live()[0]!.observed).toEqual([field()]);
    dims.scrollHeight = 48;
    fireEvent.change(field(), { target: { value: 'two lines at the wide width' } });
    expect(field().style.height).toBe('48px');
    dims.clientWidth = 200;
    dims.scrollHeight = 96;
    await act(async () => { live().forEach((o) => o.cb()); });
    expect(field().style.height).toBe('96px');
  });

  it('unmount leaves nothing live', () => {
    const view = mount();
    view.unmount();
    expect(live()).toHaveLength(0);
  });
});

describe('2: Clone holds its place while the route has not answered', () => {
  const published = { isOwner: true, version: 'v1', draft: null, publishedNone: false } as unknown as CanvasReady;
  const reserve = () => screen.queryByTestId('canvas-clone-reserve');
  const button = () => screen.queryByRole('button', { name: 'Clone' });

  it('the route has not answered yet (no clone handed over), drafting already known on: the reserve, no button', async () => {
    svc.getCanvasDraftAvailability.mockResolvedValue(true);
    ctx.clone = undefined;
    ctx.cloneUnknown = true;
    render(<CloneButton ready={published} />);
    await act(async () => {});
    expect(reserve()).not.toBeNull();
    expect(button()).toBeNull();
  });

  it('the route has not answered and drafting is unknown too: the reserve', async () => {
    svc.getCanvasDraftAvailability.mockReturnValue(new Promise(() => undefined));
    ctx.clone = undefined;
    ctx.cloneUnknown = true;
    render(<CloneButton ready={published} />);
    await act(async () => {});
    expect(reserve()).not.toBeNull();
  });

  it('CONTROL: the route answered with no clone (an owner with no mirror chat, a fixture): nothing', async () => {
    svc.getCanvasDraftAvailability.mockResolvedValue(true);
    ctx.clone = undefined;
    ctx.cloneUnknown = false;
    render(<CloneButton ready={published} />);
    await act(async () => {});
    expect(reserve()).toBeNull();
    expect(button()).toBeNull();
  });

  it('CONTROL: drafting is known off: nothing, even before the route answers', async () => {
    svc.getCanvasDraftAvailability.mockResolvedValue(false);
    ctx.clone = undefined;
    ctx.cloneUnknown = true;
    render(<CloneButton ready={published} />);
    await act(async () => {});
    expect(reserve()).toBeNull();
  });

  it('CONTROL: a reader never gets a reserve, even before the route answers', async () => {
    svc.getCanvasDraftAvailability.mockReturnValue(new Promise(() => undefined));
    ctx.clone = undefined;
    ctx.cloneUnknown = true;
    render(<CloneButton ready={{ ...published, isOwner: false } as unknown as CanvasReady} />);
    await act(async () => {});
    expect(reserve()).toBeNull();
  });

  it('CONTROL: both answered yes: the button, no reserve', async () => {
    svc.getCanvasDraftAvailability.mockResolvedValue(true);
    render(<CloneButton ready={published} />);
    await act(async () => {});
    expect(button()).not.toBeNull();
    expect(reserve()).toBeNull();
  });
});
