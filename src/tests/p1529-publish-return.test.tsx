/**
 * @file p1529-publish-return.test.tsx
 * @description P1529: Publish returns to the event preparation by the REMEMBERED path, so it still returns with a point/box panel open
 * (the panel's pushed entry carries `{canvasPanel:true}` and drops `afterPublish`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const { publish, getMessage } = vi.hoisted(() => ({ publish: vi.fn(), getMessage: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/app/components/canvas/use-canvas-publish', () => ({
  useCanvasPublish: (_r: unknown, _a: unknown, onPublished: (i: unknown) => void) => ({
    state: 'ready', publishing: false,
    publish: () => onPublished({ seq: 2, versionName: 'canvas_d222', replyMessageId: null, openOffers: 0 }),
  }),
}));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-service')), getMessage }));

import { useWorkspacePublish } from '@/app/pages/canvas/use-workspace-publish';
import { usePreparationReturn } from '@/app/pages/canvas/use-preparation-return';

void publish;
const ready = { draft: { id: 'd1', conversationId: 'c', threadRootId: 'r' } } as unknown as CanvasReady;
const Where = { current: '' };
function Probe({ children }: { children: ReactNode }) { Where.current = useLocation().pathname; return <>{children}</>; }
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/p/ana/canvas/canvas']}><Probe>{children}</Probe></MemoryRouter>;

/** The page's wiring: one remembered path read from the location state, handed to Publish. */
const setup = (initial: unknown) => renderHook(({ state }: { state: unknown }) => {
  const returnTo = usePreparationReturn(state);
  return useWorkspacePublish({ ready, runActive: false, pendingClone: false, setParams: vi.fn(), state, returnTo });
}, { wrapper, initialProps: { state: initial } });
const press = async (h: ReturnType<typeof setup>) => { await act(async () => { h.result.current.publish(); }); };

beforeEach(() => { Where.current = ''; getMessage.mockResolvedValue(null); });

describe('P1529: Publish returns to the preparation', () => {
  it('returns by the remembered path when the current state (a panel entry) lacks afterPublish', async () => {
    const h = setup({ afterPublish: '/events/x/prep' });
    h.rerender({ state: { canvasPanel: true } });
    await press(h);
    expect(Where.current).toBe('/events/x/prep');
  });
  it('without any afterPublish, Publish stays where it is', async () => {
    const h = setup({ canvasPanel: true });
    await press(h);
    expect(Where.current).toBe('/p/ana/canvas/canvas');
  });
  it('never navigates to a protocol-relative path', async () => {
    const h = setup({ afterPublish: '//evil.example/x' });
    await press(h);
    expect(Where.current).toBe('/p/ana/canvas/canvas');
  });
});
