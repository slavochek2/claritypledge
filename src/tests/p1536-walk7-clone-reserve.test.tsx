/**
 * @file p1536-walk7-clone-reserve.test.tsx
 * @description P1536 walkthrough 7, item 2: while canvas drafting is not known yet and every other condition for Clone holds, its exact space is reserved
 * by an invisible, non-interactive, aria-hidden placeholder with the same icon and word (so Share does not move when Clone arrives). It is not a
 * button (P955: no dead controls), is not announced, and becomes the real button on `true` or nothing on `false`. Nothing is reserved for a reader,
 * on a draft, inside the workspace, when the route hands no clone, or when nothing is published.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const ctx = vi.hoisted(() => ({ clone: undefined as undefined | (() => void), active: false }));
const svc = vi.hoisted(() => ({ getCanvasDraftAvailability: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/components/canvas/canvas-workspace-context', () => ({ useCanvasWorkspace: () => ({ clone: ctx.clone, active: ctx.active, cloneSeq: null }) }));

import { CloneButton } from '@/app/components/canvas/canvas-clone-button';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';

const published = { isOwner: true, version: 'v1', draft: null, publishedNone: false } as unknown as CanvasReady;
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((a) => { resolve = a; });
  return { promise, resolve };
};
const reserve = () => screen.queryByTestId('canvas-clone-reserve');
const button = () => screen.queryByRole('button', { name: 'Clone' });

beforeEach(() => {
  vi.resetAllMocks();
  resetCanvasAvailability();
  ctx.clone = vi.fn();
  ctx.active = false;
});
afterEach(() => cleanup());

describe('2: Clone reserves its space while drafting is unknown', () => {
  it('unknown: the reserve is there (same pill, invisible, aria-hidden, no button, nothing to focus); true: the button and no reserve', async () => {
    const answer = deferred<boolean>();
    svc.getCanvasDraftAvailability.mockReturnValue(answer.promise);
    render(<CloneButton ready={published} />);
    const r = reserve() as HTMLElement;
    expect(r).not.toBeNull();
    expect(r).toHaveAttribute('aria-hidden', 'true');
    expect(r).toHaveTextContent('Clone');
    expect(r.tagName).toBe('SPAN');
    expect(r.className).toContain('invisible');
    for (const c of CANVAS_SECONDARY_PILL.split(' ')) expect(r.className).toContain(c);
    expect(r.querySelector('svg')).not.toBeNull();
    expect(button()).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
    await act(async () => { answer.resolve(true); });
    expect(reserve()).toBeNull();
    expect(button()).not.toBeNull();
    expect(screen.getByTestId('canvas-clone')).toBeInTheDocument();
  });

  it('false from unknown: neither the reserve nor the button', async () => {
    const answer = deferred<boolean>();
    svc.getCanvasDraftAvailability.mockReturnValue(answer.promise);
    render(<CloneButton ready={published} />);
    expect(reserve()).not.toBeNull();
    await act(async () => { answer.resolve(false); });
    expect(reserve()).toBeNull();
    expect(button()).toBeNull();
  });
});

describe('2: CONTROL: no reserve where Clone never shows', () => {
  const none = async (ready: CanvasReady) => {
    svc.getCanvasDraftAvailability.mockReturnValue(new Promise(() => undefined)); // still unknown
    render(<CloneButton ready={ready} />);
    await act(async () => {});
    expect(reserve()).toBeNull();
    expect(button()).toBeNull();
  };
  it('a reader', () => none({ ...published, isOwner: false } as unknown as CanvasReady));
  it('a draft view', () => none({ ...published, draft: { version: 'v1', baseSeq: 1 } } as unknown as CanvasReady));
  it('nothing published', () => none({ ...published, publishedNone: true } as unknown as CanvasReady));
  it('no version', () => none({ ...published, version: null } as unknown as CanvasReady));
  it('the workspace (active)', () => { ctx.active = true; return none(published); });
  it('the route hands no clone', () => { ctx.clone = undefined; return none(published); });
});
