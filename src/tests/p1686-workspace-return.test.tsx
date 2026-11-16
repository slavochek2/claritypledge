/**
 * @file p1686-workspace-return.test.tsx
 * @description P1686: the owner's next-version draft opened from the room card ("Open full draft") returns to the event room after Publish,
 * without the preparation banner (`returnTo` stays null: that value draws the banner). A canvas opened from the table without the mark stays put.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { publishReturnsToTable, tablePublishReturnState } from '@/lib/canvas-hrefs';

const { getMyEventCanvas } = vi.hoisted(() => ({ getMyEventCanvas: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/app/components/canvas/use-canvas-publish', () => ({
  useCanvasPublish: (_r: unknown, _a: unknown, onPublished: (i: unknown) => void) => ({
    state: 'ready', publishing: false,
    publish: () => onPublished({ seq: 3, versionName: 'v3-draft', replyMessageId: null, openOffers: 0 }),
  }),
}));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-service')), getMessage: vi.fn().mockResolvedValue(null) }));
vi.mock('@/app/data/event-mastermind-service', async () => ({ ...(await vi.importActual<object>('@/app/data/event-mastermind-service')), getMyEventCanvas, setEventCanvas: vi.fn() }));

import { useWorkspacePublish } from '@/app/pages/canvas/use-workspace-publish';

const ready = { draft: { id: 'd1', conversationId: 'c', threadRootId: 'r' } } as unknown as CanvasReady;
const Where = { current: '' };
function Probe({ children }: { children: ReactNode }) { Where.current = useLocation().pathname; return <>{children}</>; }
const routed = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/p/haru/canvas/launch_plan']}><Routes><Route path="/p/:handle/canvas/:projectTag" element={<Probe>{children}</Probe>} /><Route path="*" element={<Probe>{null}</Probe>} /></Routes></MemoryRouter>
);
const setup = (initial: unknown) => renderHook(({ state }: { state: unknown }) => useWorkspacePublish({ ready, runActive: false, pendingClone: false, setParams: vi.fn(), state }), { wrapper: routed, initialProps: { state: initial } });
const ROOM = { backToTable: '/events/e1/room', tableEvent: 'e1' };

beforeEach(() => { Where.current = ''; getMyEventCanvas.mockResolvedValue({ name: 'launch_plan', shared: true, fixed: true }); });

describe('P1686: Publish in the workspace returns to the event room', () => {
  it('the room card state marks the return and keeps the way back and plain opening', () => {
    const s = tablePublishReturnState(ROOM);
    expect(s).toEqual({ ...ROOM, plainCanvas: true, publishReturnsToTable: true });
    expect(publishReturnsToTable(s)).toBe(true);
    expect(publishReturnsToTable(ROOM)).toBe(false);
  });

  it('a draft opened from the room card returns to the room after Publish, with no preparation banner', async () => {
    const h = setup(tablePublishReturnState(ROOM));
    expect(h.result.current.returnTo).toBeNull(); // the banner's value: no preparation banner
    h.rerender({ state: { canvasPanel: true } }); // a point panel entry drops the state: the return is remembered
    await act(async () => { h.result.current.publish(); });
    await vi.waitFor(() => expect(getMyEventCanvas).toHaveBeenCalledWith('e1')); // shared already: no question, straight back
    await vi.waitFor(() => expect(Where.current).toBe('/events/e1/room'));
  });

  it('a canvas opened from the table without the mark stays where it is after Publish', async () => {
    const h = setup(ROOM);
    await act(async () => { h.result.current.publish(); });
    await act(async () => { await Promise.resolve(); });
    expect(Where.current).toBe('/p/haru/canvas/launch_plan');
  });
});
