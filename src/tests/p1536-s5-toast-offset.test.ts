/**
 * @file p1536-s5-toast-offset.test.ts
 * @description P1536 S5 review: the Publish toast that carries "See offer" stays 12 seconds. The shared Toaster puts toasts 3.5rem from the top, which is right for a one-row header
 * and lands ON the two-row canvas bar below 1280px: measured at 375px, the toast (top 56px, bottom 179px) covered Clone and Share, so neither could be tapped while it showed.
 * So the toast carries a class that moves it under the bar at that width only. The real hook; only the database calls and the toast are faked.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const toastSuccess = vi.hoisted(() => vi.fn());
const publish = vi.hoisted(() => vi.fn());
const getMessage = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: toastSuccess, error: vi.fn() }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), publishCanvasDraft: publish }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-service')), getMessage }));

import { useWorkspacePublish } from '@/app/pages/canvas/use-workspace-publish';

const ready = {
  isOwner: true, version: 'canvas_dabc', publishedNone: false, canvasId: 'cv-1', title: null, points: [{ id: 'p', systemTags: ['canvas:problem'] }],
  versions: [{ name: 'canvas_dabc', draft: true, seq: null }, { name: 'canvas_d111', draft: false, seq: 1 }],
  draft: { id: 'draft-1', version: 'canvas_dabc', questions: {}, threadRootId: 'root-1', conversationId: 'conv-1', baseSeq: 1, runCount: 1, revision: 4, changedBoxes: ['canvas:problem'] },
} as unknown as CanvasReady;
const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, { initialEntries: ['/p/ana/canvas/canvas?v=canvas_dabc&ws=1'] }, children);
const publishOnce = async () => {
  const hook = renderHook(() => useWorkspacePublish({ ready, runActive: false, pendingClone: false, setParams: vi.fn(), state: null }), { wrapper });
  await act(async () => { hook.result.current.publish(); });
  await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
};

beforeEach(() => {
  vi.clearAllMocks();
  getMessage.mockResolvedValue({ id: 'msg-reply', body: 'Published v2. Your material also covers agencies. I keep the text of your uploads for this until you start it or for 30 days, then delete it.' });
});

describe('the See offer toast sits under the canvas bar', () => {
  it('below 1280px it is moved down by the height of the second bar row (a class that applies at that width only)', async () => {
    publish.mockResolvedValue({ ok: true, seq: 2, skippedLinks: 0, replyMessageId: 'msg-reply', openOffers: 1 });
    await publishOnce();
    expect(String(toastSuccess.mock.calls[0]![1]?.className)).toContain('max-[1279px]:mt-14');
  });

  it('a toast with no offer is the plain one it always was (no options)', async () => {
    publish.mockResolvedValue({ ok: true, seq: 2, skippedLinks: 0, replyMessageId: 'msg-reply', openOffers: 0 });
    await publishOnce();
    expect(toastSuccess.mock.calls[0]).toHaveLength(1);
  });
});
