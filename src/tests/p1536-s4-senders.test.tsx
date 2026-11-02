/**
 * @file p1536-s4-senders.test.tsx
 * @description P1536 S4.3 / S4.4 / J5: the tags in the composer reach the server through every way a canvas message goes: a text Send in an open draft, the first Send of a
 * pending Clone (text), a voice note in an open draft, the first voice note of a pending Clone. The words go out with the tags written as "[Title]", the boxes as the
 * validated list the server checks again. A voice note carries the tags in the field and clears them once sent.
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
const voice = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  sendCanvasWorkspaceMessage: send,
  listMyCanvasVersions: async () => [{ canvasId: 'cv-1', id: 'ver-1', canvasName: 'canvas', name: 'canvas_d1' }],
}));
vi.mock('@/app/data/canvas-voice-service', () => ({ sendCanvasVoiceNote: voice }));

import { useCanvasActions } from '@/app/pages/chat/use-canvas-actions';
import { openNextDraft, openNextDraftByVoice, resetUnresolvedFirstSends } from '@/app/pages/canvas/workspace-next-draft';
import { ComposerTagContext, createComposerTagBus } from '@/app/pages/chat/composer-tag-bus';
import { useComposerTags } from '@/app/pages/chat/use-composer-tags';
import { tagToken } from '@/app/pages/chat/composer-tags';

const REVENUE = 'canvas:revenue';
const METRICS = 'canvas:metrics';
const draft = { id: 'draft-1', canvasId: 'cv-1', conversationId: 'conv-1', revision: 3, state: 'open' };
const thread = { draft, reload: vi.fn(async () => undefined) } as never;
const tagged = `${tagToken(REVENUE)} €200 per pilot ${tagToken(METRICS)}`;
const OK = { ok: true, runId: 'r1', revision: 4, draftId: 'draft-1', canvasId: 'cv-1', canvasName: 'canvas', versionName: 'canvas_d2', threadRootId: 'root', conversationId: 'conv-1', messageId: 'm1', replayed: false, start: { ok: true } };

beforeEach(() => {
  vi.clearAllMocks();
  resetUnresolvedFirstSends();
  send.mockResolvedValue(OK);
  voice.mockResolvedValue({ ok: true, sent: OK });
});
afterEach(cleanup);

describe('S4.3 a text Send in an open draft', () => {
  it('sends the words with "[Title]" and the boxes as the validated list', async () => {
    const { result } = renderHook(() => useCanvasActions({ thread, available: true }));
    await act(async () => { await result.current.onSend?.(tagged); });
    const a = send.mock.calls[0]![0];
    expect(a.body).toBe('[Offers & Pricing] €200 per pilot [My next milestone]');
    expect(a.boxRefs).toEqual([METRICS, REVENUE]);
    expect(a.expectedDraftId).toBe('draft-1');
  });
  it('an untagged message carries no boxes', async () => {
    const { result } = renderHook(() => useCanvasActions({ thread, available: true }));
    await act(async () => { await result.current.onSend?.('plain words'); });
    expect(send.mock.calls[0]![0].boxRefs ?? null).toBeNull();
    expect(send.mock.calls[0]![0].body).toBe('plain words');
  });
});

describe('S4.4 the first Send of a pending Clone', () => {
  it('a first text Send carries the boxes, and the same words with the same tags are the same message', async () => {
    await openNextDraft({ projectTag: 'canvas', version: 'canvas_d1', body: tagged });
    const a = send.mock.calls[0]![0];
    expect(a.body).toBe('[Offers & Pricing] €200 per pilot [My next milestone]');
    expect(a.boxRefs).toEqual([METRICS, REVENUE]);
    expect(a.fromVersionId).toBe('ver-1');
  });
  it('a first voice note carries the boxes it was sent with', async () => {
    await openNextDraftByVoice({ conversationId: 'conv-1', projectTag: 'canvas', version: 'canvas_d1', wav: new Blob(['x']), boxRefs: [REVENUE] });
    expect(voice.mock.calls[0]![2].boxRefs).toEqual([REVENUE]);
    expect(voice.mock.calls[0]![2].fromVersionId).toBe('ver-1');
  });
});

describe('J5 a voice note in an open draft', () => {
  it('passes the boxes it was sent with to the voice commit', async () => {
    const { result } = renderHook(() => useCanvasActions({ thread, available: true }));
    await act(async () => { await result.current.onVoice?.(new Blob(['x']), { boxRefs: [METRICS] }); });
    expect(voice.mock.calls[0]![2]).toMatchObject({ canvasId: 'cv-1', expectedDraftId: 'draft-1', expectedRevision: 3, boxRefs: [METRICS] });
  });
});

describe('J5 the composer hands its tags to the voice sender, and clears them once it is sent', () => {
  const bus = createComposerTagBus();
  const wrapper = ({ children }: { children: ReactNode }) => createElement(ComposerTagContext.Provider, { value: bus }, children);
  it('sends boxRefs from the field and strips the tokens after a success; a failed note keeps them', async () => {
    const setValue = vi.fn();
    const sender = vi.fn(async (_wav: Blob, _opts?: unknown) => undefined);
    const field = { current: document.createElement('textarea') };
    const { result } = renderHook(() => useComposerTags(field, 'u:k', `${tagToken(REVENUE)} `, setValue, sender), { wrapper });
    await act(async () => { await result.current.voice?.(new Blob(['x'])); });
    expect(sender.mock.calls[0]![1]).toEqual({ boxRefs: [REVENUE] });
    expect(setValue).toHaveBeenLastCalledWith('');
    setValue.mockClear();
    const failing = vi.fn(async () => { throw new Error('nope'); });
    const again = renderHook(() => useComposerTags(field, 'u:k', `${tagToken(REVENUE)} `, setValue, failing), { wrapper });
    await act(async () => { await again.result.current.voice?.(new Blob(['x'])).catch(() => undefined); });
    expect(setValue).not.toHaveBeenCalled();
  });
  it('outside a workspace the sender is the caller\'s own and no key is handled', () => {
    const sender = vi.fn(async () => undefined);
    const field = { current: document.createElement('textarea') };
    const { result } = renderHook(() => useComposerTags(field, 'u:k', '', vi.fn(), sender));
    expect(result.current.voice).toBe(sender);
  });
});
