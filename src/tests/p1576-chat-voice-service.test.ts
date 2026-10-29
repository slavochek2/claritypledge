import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

import {
  MESSAGE_COLUMNS,
  getVoicePlaybackUrl,
  mapMessageRow,
  sendVoiceNote,
  VoiceNoteError,
  isFinalVoiceFailure,
  type ChatMessageRow,
} from '@/app/data/chat-service';

const CONV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = `${CONV}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.wav`;

const row = (over: Partial<ChatMessageRow> = {}): ChatMessageRow => ({
  id: 'm1', conversation_id: CONV, author_id: 'u1', body: null, created_at: '2026-10-27T10:00:00Z', edited_at: null,
  deleted_at: null, reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null,
  kind: 'message', attachment_kind: null, attachment_id: null, ...over,
});

describe('P1576 voice note row mapping', () => {
  it('a plain row has no audio, including a payload from before the columns existed', () => {
    expect(mapMessageRow(row({ body: 'hi' })).audio ?? null).toBeNull();
  });

  it('a voice note maps its duration, transcript state and playability', () => {
    const m = mapMessageRow(row({ audio_duration_ms: 4200, transcript_status: 'pending', transcript: null }));
    expect(m.audio).toEqual({ durationMs: 4200, transcript: null, transcriptStatus: 'pending', hasAudio: true, audioWaveform: null });
    const done = mapMessageRow(row({ audio_duration_ms: 4200, transcript_status: 'done', transcript: 'hello' }));
    expect(done.audio).toMatchObject({ transcript: 'hello', transcriptStatus: 'done', hasAudio: true });
  });

  it('audio_waveform maps to audioWaveform: the 50 stored levels, or null for a legacy note', () => {
    const levels = Array.from({ length: 50 }, (_, i) => i * 2);
    expect(mapMessageRow(row({ audio_duration_ms: 4200, audio_waveform: levels })).audio?.audioWaveform).toEqual(levels);
    expect(mapMessageRow(row({ audio_duration_ms: 4200, audio_waveform: null })).audio?.audioWaveform).toBeNull();
    expect(mapMessageRow(row({ audio_duration_ms: 4200 })).audio?.audioWaveform).toBeNull();
  });

  it('expired audio keeps the transcript but is no longer playable', () => {
    const m = mapMessageRow(row({
      audio_duration_ms: 4200, transcript_status: 'done', transcript: 'hello', audio_expired_at: '2026-11-26T00:00:00Z',
    }));
    expect(m.audio).toMatchObject({ transcript: 'hello', hasAudio: false });
  });

  it('a deleted voice note shows no audio', () => {
    const m = mapMessageRow(row({ deleted_at: '2026-10-27T11:00:00Z', audio_duration_ms: null, transcript_status: null }));
    expect(m.audio ?? null).toBeNull();
  });

  it('the columns clients select expose the audio state and never a storage path', () => {
    for (const c of ['audio_duration_ms', 'audio_expired_at', 'transcript', 'transcript_status', 'audio_waveform']) {
      expect(MESSAGE_COLUMNS).toContain(c);
    }
    expect(MESSAGE_COLUMNS).not.toMatch(/audio_path|attempt/);
  });
});

describe('P1576 sendVoiceNote', () => {
  const wav = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invoke.mockReset();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const uploadOk = {
    data: { uploadUrl: 'https://storage.googleapis.com/b/k?sig', uploadHeaders: { 'content-type': 'audio/wav', 'x-goog-content-length-range': '44,100', 'x-goog-if-generation-match': '0' }, objectKey: KEY },
    error: null,
  };

  it('uploads, PUTs the blob with exactly the signed headers, then commits that key', async () => {
    invoke
      .mockResolvedValueOnce(uploadOk)
      .mockResolvedValueOnce({ data: { message: row({ audio_duration_ms: 4200, transcript_status: 'pending' }) }, error: null });
    const m = await sendVoiceNote(CONV, wav, { threadRootId: 'root', replyToId: 'reply' });

    expect(invoke).toHaveBeenNthCalledWith(1, 'chat-voice', { body: { mode: 'upload', conversationId: CONV, threadRootId: 'root' } });
    expect(fetchMock).toHaveBeenCalledWith('https://storage.googleapis.com/b/k?sig', {
      method: 'PUT', headers: uploadOk.data.uploadHeaders, body: wav,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'chat-voice', {
      body: { mode: 'commit', conversationId: CONV, objectKey: KEY, threadRootId: 'root', replyToId: 'reply' },
    });
    expect(m.audio).toMatchObject({ durationMs: 4200, transcriptStatus: 'pending' });
  });

  it('omits thread and reply when none is given', async () => {
    invoke.mockResolvedValueOnce(uploadOk).mockResolvedValueOnce({ data: { message: row({ audio_duration_ms: 1, transcript_status: 'pending' }) }, error: null });
    await sendVoiceNote(CONV, wav);
    expect(invoke.mock.calls[1]?.[1].body).toEqual({ mode: 'commit', conversationId: CONV, objectKey: KEY });
  });

  it('a refused upload never PUTs and never commits', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'x', context: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) } });
    await expect(sendVoiceNote(CONV, wav)).rejects.toMatchObject({ reason: 'forbidden' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('a failed PUT stops before the commit', async () => {
    invoke.mockResolvedValueOnce(uploadOk);
    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    await expect(sendVoiceNote(CONV, wav)).rejects.toBeInstanceOf(VoiceNoteError);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    [413, 'too_long'], [429, 'rate'], [403, 'forbidden'], [422, 'unsupported'], [500, 'failed'],
  ])('a %i from commit surfaces as reason %s', async (status, reason) => {
    invoke.mockResolvedValueOnce(uploadOk).mockResolvedValueOnce({
      data: null, error: { message: 'x', context: new Response(JSON.stringify({ error: 'e' }), { status }) },
    });
    await expect(sendVoiceNote(CONV, wav)).rejects.toMatchObject({ reason });
  });
});

describe('P1576 sendVoiceNote retry keeps the uploaded object', () => {
  const wav = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
  let fetchMock: ReturnType<typeof vi.fn>;
  const grant = {
    data: { uploadUrl: 'https://storage.googleapis.com/b/k?sig', uploadHeaders: { 'content-type': 'audio/wav' }, objectKey: KEY },
    error: null,
  };
  const httpError = (status: number) => ({ data: null, error: { message: 'x', context: new Response(JSON.stringify({ error: 'e' }), { status }) } });

  beforeEach(() => {
    invoke.mockReset();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([[500], [429], [502]])('a %i from commit hands back the receipt of the stored upload', async (status) => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(httpError(status));
    const err = await sendVoiceNote(CONV, wav).catch((e) => e);
    expect(err).toBeInstanceOf(VoiceNoteError);
    expect(err.receipt).toEqual({ conversationId: CONV, objectKey: KEY });
  });

  it('a 400 from commit (the stored audio is not a valid recording) is final: reason bad_audio, no receipt', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(httpError(400));
    const err = await sendVoiceNote(CONV, wav).catch((e) => e);
    expect(err).toBeInstanceOf(VoiceNoteError);
    expect(err.reason).toBe('bad_audio');
    expect(err.receipt).toBeUndefined();
  });

  it.each([[403], [413], [422]])('a %i is final: no receipt, because retrying the same key cannot succeed', async (status) => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce(httpError(status));
    const err = await sendVoiceNote(CONV, wav).catch((e) => e);
    expect(err.receipt).toBeUndefined();
  });

  it('a failure before the upload finished has no receipt (nothing is stored to resume)', async () => {
    invoke.mockResolvedValueOnce(grant);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect((await sendVoiceNote(CONV, wav).catch((e) => e)).receipt).toBeUndefined();
    invoke.mockReset();
    invoke.mockResolvedValueOnce(httpError(429));
    expect((await sendVoiceNote(CONV, wav).catch((e) => e)).receipt).toBeUndefined();
  });

  it('resuming re-commits the SAME key: no new upload grant, no second PUT', async () => {
    invoke.mockResolvedValueOnce({ data: { message: row({ audio_duration_ms: 4200, transcript_status: 'pending' }) }, error: null });
    const m = await sendVoiceNote(CONV, wav, { resume: { conversationId: CONV, objectKey: KEY }, threadRootId: 'root' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('chat-voice', { body: { mode: 'commit', conversationId: CONV, objectKey: KEY, threadRootId: 'root' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.audio).toMatchObject({ durationMs: 4200 });
  });

  it('a receipt for another conversation is ignored: a fresh upload happens', async () => {
    invoke.mockResolvedValueOnce(grant).mockResolvedValueOnce({ data: { message: row({ audio_duration_ms: 1, transcript_status: 'pending' }) }, error: null });
    await sendVoiceNote(CONV, wav, { resume: { conversationId: 'other-conversation', objectKey: 'other/key.wav' } });
    expect(invoke.mock.calls[0]?.[1].body.mode).toBe('upload');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a resumed commit that finds nothing (404) gives no receipt: the caller starts over from the recording', async () => {
    invoke.mockResolvedValueOnce(httpError(404));
    const err = await sendVoiceNote(CONV, wav, { resume: { conversationId: CONV, objectKey: KEY } }).catch((e) => e);
    expect(err.status).toBe(404);
    expect(err.receipt).toBeUndefined();
  });

  it('a still-failing resumed commit keeps handing back the same receipt', async () => {
    invoke.mockResolvedValueOnce(httpError(500));
    const err = await sendVoiceNote(CONV, wav, { resume: { conversationId: CONV, objectKey: KEY } }).catch((e) => e);
    expect(err.receipt).toEqual({ conversationId: CONV, objectKey: KEY });
  });
});

describe('P1576 getVoicePlaybackUrl', () => {
  beforeEach(() => invoke.mockReset());

  it('returns the signed URL', async () => {
    invoke.mockResolvedValueOnce({ data: { url: 'https://storage.googleapis.com/b/k?get', expiresInSeconds: 600 }, error: null });
    expect(await getVoicePlaybackUrl('m1')).toBe('https://storage.googleapis.com/b/k?get');
    expect(invoke).toHaveBeenCalledWith('chat-voice', { body: { mode: 'playback', messageId: 'm1' } });
  });

  it('410 means the audio expired or was deleted: null, not an error', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'x', context: new Response('{}', { status: 410 }) } });
    expect(await getVoicePlaybackUrl('m1')).toBeNull();
  });

  it('any other failure throws', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'x', context: new Response('{}', { status: 403 }) } });
    await expect(getVoicePlaybackUrl('m1')).rejects.toMatchObject({ reason: 'forbidden' });
  });
});

describe('P1576 isFinalVoiceFailure', () => {
  it('is true exactly for the reasons where sending the same recording again cannot work', () => {
    const e = (reason: ConstructorParameters<typeof VoiceNoteError>[0]) => new VoiceNoteError(reason, null, 'x');
    for (const r of ['too_long', 'forbidden', 'unsupported', 'bad_audio'] as const) expect(isFinalVoiceFailure(e(r)), r).toBe(true);
    for (const r of ['rate', 'failed'] as const) expect(isFinalVoiceFailure(e(r)), r).toBe(false);
  });
});
