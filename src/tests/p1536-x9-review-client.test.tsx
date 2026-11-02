/**
 * @file p1536-x9-review-client.test.tsx
 * @description P1536 3c X9 review fixes, the client's half (hook and service level).
 *  - A recording lands on the target it was made for: a pending Clone's retry keeps the canvas and version captured at its first submission, and
 *    refreshes the revision of a draft it replaces only within that identity.
 *  - A stale view on a pending Clone is recovered by re-reading (no Retry that can never succeed); the open-drafts cap and the terms gate have their
 *    own reasons and sentences, not "Too many voice messages".
 *  - A voice note in an open draft counts as sending, as a typed Send does.
 *  - A thread whose root has not loaded (or failed to) is not known to be a plain thread: no plain voice note, no plain Send.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  openByVoice: vi.fn(), sendCanvasVoice: vi.fn(), invoke: vi.fn(), toastError: vi.fn(), resync: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => m.invoke(...a) }, from: vi.fn(), rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: m.toastError }) }));
vi.mock('@/app/pages/canvas/workspace-next-draft', () => ({ openNextDraftByVoice: m.openByVoice }));
vi.mock('@/app/data/canvas-voice-service', () => ({ sendCanvasVoiceNote: m.sendCanvasVoice }));
vi.mock('@/app/pages/chat/chat-state', () => ({ useChat: () => ({ resync: m.resync }) }));

import { VoiceNoteError, isFinalVoiceFailure, sendVoiceNote } from '@/app/data/chat-voice-service';
import { voiceErrorText, voiceRetryable } from '@/hooks/use-voice-note';
import { useCloneVoice, type CloneVoiceArgs } from '@/app/pages/canvas/use-clone-voice';
import { useCanvasActions } from '@/app/pages/chat/use-canvas-actions';
import { canvasThreadFlags } from '@/app/pages/chat/canvas-thread-flags';
import { useThreadVoice } from '@/app/pages/chat/use-thread-voice';
import { TOO_MANY_DRAFTS_TEXT } from '@/app/pages/chat/canvas-thread-copy';

const wav = new Blob([new Uint8Array(10)]);
const RECEIPT = { conversationId: 'conv-1', objectKey: 'conv-1/u/up-1.wav' };
const noop = () => undefined;
const args = (over: Partial<CloneVoiceArgs> = {}): CloneVoiceArgs => ({
  conversationId: 'conv-1', projectTag: 'canvas', version: 'canvas_d1', cloning: { version: 'canvas_d1', seq: 1, replace: null },
  onSending: noop, onOpened: noop, onStale: noop, ...over,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('a pending Clone\'s note lands on the target it was recorded for', () => {
  it('a Retry after the page moved to another version still goes to the first one, with its stored clip', async () => {
    m.openByVoice.mockResolvedValueOnce({ ok: false, why: 'refused', receipt: RECEIPT });
    const { result, rerender } = renderHook((p: CloneVoiceArgs) => useCloneVoice(p), { initialProps: args() });
    await expect(result.current(wav)).rejects.toBeInstanceOf(VoiceNoteError);
    expect(m.openByVoice.mock.calls[0]![0]).toMatchObject({ version: 'canvas_d1', projectTag: 'canvas' });

    rerender(args({ version: 'canvas_d2', cloning: { version: 'canvas_d2', seq: 2, replace: null } })); // the owner picked another version
    m.openByVoice.mockResolvedValueOnce({ ok: true, versionName: 'canvas_x' });
    await result.current(wav, { resume: RECEIPT });
    expect(m.openByVoice.mock.calls[1]![0]).toMatchObject({ version: 'canvas_d1', projectTag: 'canvas', resume: RECEIPT });
  });

  it('CONTROL: a NEW recording made after the move goes to the version on screen', async () => {
    m.openByVoice.mockResolvedValue({ ok: true, versionName: 'canvas_x' });
    const { result, rerender } = renderHook((p: CloneVoiceArgs) => useCloneVoice(p), { initialProps: args() });
    rerender(args({ version: 'canvas_d2', cloning: { version: 'canvas_d2', seq: 2, replace: null } }));
    await result.current(wav);
    expect(m.openByVoice.mock.calls[0]![0]).toMatchObject({ version: 'canvas_d2' });
  });

  it('the draft a Start over replaces is re-read within the identity only: a newer revision of the same version is used, another version\'s draft never is', async () => {
    const replacing = (v: string, id: string, revision: number) => args({ version: v, cloning: { version: v, seq: 1, replace: { id, revision } as never } });
    m.openByVoice.mockResolvedValueOnce({ ok: false, why: 'stale_view', receipt: RECEIPT });
    const { result, rerender } = renderHook((p: CloneVoiceArgs) => useCloneVoice(p), { initialProps: replacing('canvas_d1', 'draft-a', 2) });
    await expect(result.current(wav)).rejects.toBeInstanceOf(VoiceNoteError);
    expect(m.openByVoice.mock.calls[0]![0].replace).toEqual({ draftId: 'draft-a', revision: 2 });

    m.openByVoice.mockResolvedValueOnce({ ok: false, why: 'refused', receipt: RECEIPT }); // refused again (busy): the clip stays stored
    rerender(replacing('canvas_d1', 'draft-a', 3)); // the sheet asked again: same version, fresher revision
    await result.current(wav, { resume: RECEIPT }).catch(() => undefined);
    expect(m.openByVoice.mock.calls[1]![0].replace).toEqual({ draftId: 'draft-a', revision: 3 });
    m.openByVoice.mockResolvedValueOnce({ ok: true, versionName: 'canvas_x' });

    rerender(replacing('canvas_d2', 'draft-b', 9)); // another version, another draft: not this clip's
    await result.current(wav, { resume: RECEIPT });
    expect(m.openByVoice.mock.calls[2]![0]).toMatchObject({ version: 'canvas_d1' });
    expect(m.openByVoice.mock.calls[2]![0].replace).toEqual({ draftId: 'draft-a', revision: 3 });
  });
});

describe('the identity is also captured from a failure that is THROWN with a receipt (the commit itself failed after the clip was stored)', () => {
  it('a thrown commit failure keeps its clip on the version it was recorded for: the Retry after picking another version goes to the first', async () => {
    m.openByVoice.mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'down', RECEIPT));
    const { result, rerender } = renderHook((p: CloneVoiceArgs) => useCloneVoice(p), { initialProps: args() });
    await expect(result.current(wav)).rejects.toMatchObject({ receipt: RECEIPT });
    rerender(args({ version: 'canvas_d2', cloning: { version: 'canvas_d2', seq: 2, replace: null } }));
    m.openByVoice.mockResolvedValueOnce({ ok: true, versionName: 'canvas_x' });
    await result.current(wav, { resume: RECEIPT });
    expect(m.openByVoice.mock.calls[1]![0]).toMatchObject({ version: 'canvas_d1', resume: RECEIPT });
  });

  it('what is remembered is let go once the clip is sent or nothing is kept for it', async () => {
    m.openByVoice.mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'down', RECEIPT));
    const { result, rerender } = renderHook((p: CloneVoiceArgs) => useCloneVoice(p), { initialProps: args() });
    await result.current(wav).catch(() => undefined);
    m.openByVoice.mockResolvedValueOnce({ ok: true, versionName: 'canvas_x' });
    await result.current(wav, { resume: RECEIPT });                       // sent: forgotten
    rerender(args({ version: 'canvas_d2', cloning: { version: 'canvas_d2', seq: 2, replace: null } }));
    m.openByVoice.mockResolvedValueOnce({ ok: true, versionName: 'canvas_y' });
    await result.current(wav, { resume: RECEIPT });
    expect(m.openByVoice.mock.calls[2]![0], 'no stale identity outlives a sent clip').toMatchObject({ version: 'canvas_d2' });

    m.openByVoice.mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'down', { ...RECEIPT, objectKey: 'k2' }));
    await result.current(wav).catch(() => undefined);
    m.openByVoice.mockRejectedValueOnce(new VoiceNoteError('bad_audio', 400, 'refused'));   // the retry is refused for good: nothing kept
    await result.current(wav, { resume: { ...RECEIPT, objectKey: 'k2' } }).catch(() => undefined);
    rerender(args({ version: 'canvas_d3', cloning: { version: 'canvas_d3', seq: 3, replace: null } }));
    m.openByVoice.mockResolvedValueOnce({ ok: true, versionName: 'canvas_z' });
    await result.current(wav, { resume: { ...RECEIPT, objectKey: 'k2' } });
    expect(m.openByVoice.mock.calls[5]![0]).toMatchObject({ version: 'canvas_d3' });
  });
});

describe('a terms refusal keeps its Retry, and the Retry commits the same stored clip once the terms are accepted', () => {
  it('first commit 409 TERMS_NOT_ACCEPTED (receipt kept, Retry offered); after acceptance the retry skips the upload and the commit goes through', async () => {
    const http = (status: number, body: unknown) => ({ data: null, error: { message: 'x', context: new Response(JSON.stringify(body), { status }) } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const grant = { data: { uploadUrl: 'https://storage.googleapis.com/b/k?sig', uploadHeaders: {}, objectKey: RECEIPT.objectKey }, error: null };
    m.invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(http(409, { error: 'terms_not_accepted', code: 'TERMS_NOT_ACCEPTED' }));
    const err = await sendVoiceNote('conv-1', wav).catch((e) => e as VoiceNoteError);
    expect(voiceRetryable(err)).toBe(true);
    m.invoke.mockClear();
    m.invoke.mockResolvedValueOnce({ data: { message: { id: 'm1', conversation_id: 'conv-1', author_id: 'u', created_at: '2026-11-02T10:00:00Z', kind: 'message', audio_duration_ms: 5000, transcript_status: 'pending' } }, error: null });
    await sendVoiceNote('conv-1', wav, { resume: (err as VoiceNoteError).receipt });
    expect(m.invoke, 'one request: the commit; the stored clip is not uploaded again').toHaveBeenCalledTimes(1);
    expect(m.invoke.mock.calls[0]![1].body).toMatchObject({ mode: 'commit', objectKey: RECEIPT.objectKey });
    vi.unstubAllGlobals();
  });
});

describe('a stale view on a pending Clone is recovered by re-reading', () => {
  it('without a draft to replace: the page re-reads, and the Retry that follows is a fresh attempt (no stored clip pretending it can work)', async () => {
    const onStale = vi.fn();
    m.openByVoice.mockResolvedValueOnce({ ok: false, why: 'stale_view', receipt: RECEIPT });
    const { result } = renderHook(() => useCloneVoice(args({ onStale })));
    const err = await result.current(wav).catch((e) => e as VoiceNoteError);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(VoiceNoteError);
    expect((err as VoiceNoteError).receipt, 'the stored clip is not offered again for a target that no longer exists').toBeUndefined();
  });

  it('with a draft to replace: the sheet asks again and the clip is kept for the Retry after it', async () => {
    const onStale = vi.fn();
    m.openByVoice.mockResolvedValueOnce({ ok: false, why: 'stale_view', receipt: RECEIPT });
    const { result } = renderHook(() => useCloneVoice(args({ onStale, cloning: { version: 'canvas_d1', seq: 1, replace: { id: 'draft-a', revision: 2 } as never } })));
    const err = await result.current(wav).catch((e) => e as VoiceNoteError);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect((err as VoiceNoteError).receipt).toEqual(RECEIPT);
  });
});

describe('the open-drafts cap and the terms gate have their own reasons and sentences', () => {
  const grant = { data: { uploadUrl: 'https://storage.googleapis.com/b/k?sig', uploadHeaders: {}, objectKey: RECEIPT.objectKey }, error: null };
  const http = (status: number, body: unknown) => ({ data: null, error: { message: 'x', context: new Response(JSON.stringify(body), { status }) } });
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());

  it('409 TOO_MANY_DRAFTS: its own reason, final (nothing to retry), and the sentence the typed Send uses', async () => {
    m.invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(http(409, { error: 'Too many open canvas drafts', code: 'TOO_MANY_DRAFTS' }));
    const err = await sendVoiceNote('conv-1', wav).catch((e) => e as VoiceNoteError);
    expect(err).toMatchObject({ reason: 'too_many_drafts', status: 409 });
    expect((err as VoiceNoteError).receipt).toBeUndefined();
    expect(isFinalVoiceFailure(err as VoiceNoteError)).toBe(true);
    expect(voiceErrorText(err)).toBe(TOO_MANY_DRAFTS_TEXT);
    expect(voiceErrorText(err)).not.toMatch(/too many voice messages/i);
  });

  it('409 TERMS_NOT_ACCEPTED: its own reason, with the terms sentence, and the stored clip kept for after the owner accepts', async () => {
    m.invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(http(409, { error: 'terms_not_accepted', code: 'TERMS_NOT_ACCEPTED' }));
    const err = await sendVoiceNote('conv-1', wav).catch((e) => e as VoiceNoteError);
    expect(err).toMatchObject({ reason: 'terms' });
    expect((err as VoiceNoteError).receipt).toEqual(RECEIPT);
    expect(voiceErrorText(err)).toMatch(/terms/i);
  });

  it('CONTROL: a 429 is still the voice rate limit', async () => {
    m.invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(http(429, { error: 'Too many voice notes, try again in a minute' }));
    const err = await sendVoiceNote('conv-1', wav).catch((e) => e as VoiceNoteError);
    expect(voiceErrorText(err)).toMatch(/too many voice messages/i);
  });
});

describe('a voice note in an open draft counts as sending, as a typed Send does', () => {
  const thread = () => ({ draft: { id: 'draft-1', canvasId: 'cv-1', revision: 3, state: 'open', conversationId: 'conv-1' }, reload: vi.fn(async () => undefined) }) as never;

  it('sending is true from the call until the send and the re-read have settled, and false after a failure too', async () => {
    let finish: (v: unknown) => void = noop;
    m.sendCanvasVoice.mockReturnValueOnce(new Promise((res) => { finish = res; }));
    const { result } = renderHook(() => useCanvasActions({ thread: thread(), available: true }));
    expect(result.current.sending).toBe(false);
    let done: Promise<unknown> = Promise.resolve();
    act(() => { done = result.current.onVoice!(wav); });
    expect(result.current.sending).toBe(true);
    await act(async () => { finish({ ok: true, sent: {} }); await done; });
    expect(result.current.sending).toBe(false);

    m.sendCanvasVoice.mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'down'));
    await act(async () => { await result.current.onVoice!(wav).catch(() => undefined); });
    expect(result.current.sending).toBe(false);
  });
});

describe('a thread whose root is not known is not known to be a plain thread', () => {
  const root = { attachmentKind: 'canvas_version' } as never;
  it('a mirror thread whose root has not loaded is pending while loading AND after a failed read; a loaded root and a non-mirror thread are not', () => {
    expect(canvasThreadFlags({ kind: 'mirror', root: undefined, status: 'loading', fromWorkspace: false }).rootPending).toBe(true);
    expect(canvasThreadFlags({ kind: 'mirror', root: undefined, status: 'error', fromWorkspace: false }).rootPending).toBe(true);
    expect(canvasThreadFlags({ kind: 'mirror', root, status: 'ready', fromWorkspace: false })).toEqual({ canvasRoot: true, rootPending: false });
    expect(canvasThreadFlags({ kind: 'mirror', root: { attachmentKind: null } as never, status: 'ready', fromWorkspace: false })).toEqual({ canvasRoot: false, rootPending: false });
    expect(canvasThreadFlags({ kind: 'dm', root: undefined, status: 'error', fromWorkspace: false }).rootPending).toBe(false);
  });

  it('the voice sender: none while the root is unknown, the plain one for a plain thread, the canvas one for a draft\'s', () => {
    const canvasVoice = vi.fn();
    const sender = (canvasRoot: boolean, rootPending: boolean, cv: typeof canvasVoice | null) =>
      renderHook(() => useThreadVoice('conv-1', 'root-1', canvasRoot, rootPending, cv)).result.current;
    expect(sender(false, true, null), 'root unknown: not a plain voice note').toBeUndefined();
    expect(sender(false, false, null), 'a plain thread').toBeTypeOf('function');
    expect(sender(true, false, canvasVoice), 'a draft\'s thread').toBeTypeOf('function');
    expect(sender(true, false, null), 'a draft that cannot take a note yet').toBeUndefined();
  });

  it('CONTROL: the canvas sender is the draft\'s, not the plain one', async () => {
    const canvasVoice = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useThreadVoice('conv-1', 'root-1', true, false, canvasVoice));
    await waitFor(() => expect(result.current).toBeTypeOf('function'));
    await result.current!(wav);
    expect(canvasVoice).toHaveBeenCalledTimes(1);
    expect(m.resync).toHaveBeenCalled();
  });
});
