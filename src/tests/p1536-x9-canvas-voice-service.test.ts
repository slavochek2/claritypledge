/**
 * P1536 section 3c, X9 (S3c.6): the client half of a voice note in a canvas thread (src/app/data/canvas-voice-service.ts).
 * A clip is uploaded and committed exactly as any voice note is (chat-voice-service), but the commit carries the canvas fields and the
 * answer is the canvas send's: a typed result with the draft, thread, message and run it made, or the database's refusal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

import { sendCanvasVoiceNote } from '@/app/data/canvas-voice-service';
import { VoiceNoteError } from '@/app/data/chat-voice-service';

const MIRROR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = `${MIRROR}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dddddddd-dddd-4ddd-8ddd-dddddddddddd.wav`;
const wav = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
const grant = { data: { uploadUrl: 'https://storage.googleapis.com/b/k?sig', uploadHeaders: { 'content-type': 'audio/wav' }, objectKey: KEY }, error: null };
const httpError = (status: number) => ({ data: null, error: { message: 'x', context: new Response(JSON.stringify({ error: 'e' }), { status }) } });
const okAnswer = (over: Record<string, unknown> = {}) => ({
  data: { canvas: { status: 'ok', run_id: 'run-1', revision: 3, draft_id: 'draft-1', canvas_id: 'canvas-1', canvas_name: 'acme', version_name: 'acme_d1', thread_root_id: 'root-1', conversation_id: MIRROR, message_id: 'msg-1', replayed: false, ...over } },
  error: null,
});

describe('sendCanvasVoiceNote', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    invoke.mockReset();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uploads to the mirror conversation, PUTs the clip, then commits that key with the canvas fields and no thread of its own', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(okAnswer());
    const r = await sendCanvasVoiceNote(MIRROR, wav, { canvasId: 'canvas-1', fromVersionId: 'v1', expectedDraftId: null, expectedRevision: null, boxRefs: ['canvas:problem'] });
    expect(invoke).toHaveBeenNthCalledWith(1, 'chat-voice', { body: { mode: 'upload', conversationId: MIRROR } });
    expect(fetchMock).toHaveBeenCalledWith(grant.data.uploadUrl, { method: 'PUT', headers: grant.data.uploadHeaders, body: wav });
    expect(invoke).toHaveBeenNthCalledWith(2, 'chat-voice', {
      body: { mode: 'commit', conversationId: MIRROR, objectKey: KEY, canvas: { canvasId: 'canvas-1', fromVersionId: 'v1', expectedDraftId: null, expectedRevision: null, replace: false, boxRefs: ['canvas:problem'] } },
    });
    expect(r).toMatchObject({ ok: true, sent: { runId: 'run-1', revision: 3, draftId: 'draft-1', canvasId: 'canvas-1', canvasName: 'acme', versionName: 'acme_d1', threadRootId: 'root-1', conversationId: MIRROR, messageId: 'msg-1', replayed: false, start: null } });
  });

  it('a new canvas names nothing but itself', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(okAnswer());
    await sendCanvasVoiceNote(MIRROR, wav, {});
    expect(invoke.mock.calls[1]?.[1].body.canvas).toEqual({ canvasId: null, fromVersionId: null, expectedDraftId: null, expectedRevision: null, replace: false, boxRefs: null });
  });

  it('an open draft is named with the revision the screen last saw, and a Start over says so', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(okAnswer());
    await sendCanvasVoiceNote(MIRROR, wav, { canvasId: 'c', expectedDraftId: 'd', expectedRevision: 7, replace: true, fromVersionId: 'v' });
    expect(invoke.mock.calls[1]?.[1].body.canvas).toMatchObject({ canvasId: 'c', expectedDraftId: 'd', expectedRevision: 7, replace: true, fromVersionId: 'v' });
  });

  it('a refusal (stale view, busy) is a typed result, not a throw, and keeps the stored clip for the retry', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce({ data: { canvas: { status: 'refused', code: 'stale_view', revision: 9 } }, error: null });
    const r = await sendCanvasVoiceNote(MIRROR, wav, { canvasId: 'c', expectedDraftId: 'd', expectedRevision: 7 });
    expect(r).toEqual({ ok: false, refused: 'stale_view', revision: 9, receipt: { conversationId: MIRROR, objectKey: KEY } });
  });

  it('a retry with the receipt commits the SAME stored clip: no second upload, so a lost response cannot become a second note', async () => {
    invoke.mockResolvedValueOnce(okAnswer({ replayed: true }));
    const r = await sendCanvasVoiceNote(MIRROR, wav, { canvasId: 'c' }, { conversationId: MIRROR, objectKey: KEY });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[1].body).toMatchObject({ mode: 'commit', objectKey: KEY });
    expect(r).toMatchObject({ ok: true, sent: { replayed: true, runId: 'run-1' } });
  });

  it('a commit that fails after the upload carries the receipt; a 400 does not (the same clip is refused again)', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(httpError(500));
    await expect(sendCanvasVoiceNote(MIRROR, wav, {})).rejects.toMatchObject({ reason: 'failed', receipt: { objectKey: KEY } });
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(httpError(400));
    const bad = await sendCanvasVoiceNote(MIRROR, wav, {}).catch((e) => e as VoiceNoteError);
    expect(bad).toMatchObject({ reason: 'bad_audio' });
    expect((bad as VoiceNoteError).receipt).toBeUndefined();
  });

  it.each([[413, 'too_long'], [429, 'rate'], [403, 'forbidden'], [422, 'unsupported']])('a %i from the commit surfaces as reason %s', async (status, reason) => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(httpError(status));
    await expect(sendCanvasVoiceNote(MIRROR, wav, {})).rejects.toMatchObject({ reason });
  });

  it('an answer with no canvas result is a failure, never a made-up success', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce({ data: {}, error: null });
    await expect(sendCanvasVoiceNote(MIRROR, wav, {})).rejects.toBeInstanceOf(VoiceNoteError);
  });

  it('a refused upload never PUTs and never commits', async () => {
    invoke.mockResolvedValueOnce(httpError(403));
    await expect(sendCanvasVoiceNote(MIRROR, wav, {})).rejects.toMatchObject({ reason: 'forbidden' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
