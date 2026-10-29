/**
 * P1576 Part B: the voice-note recorder state machine. The recorder (MediaRecorder), the WAV decode
 * and the upload are stubbed; what a person can observe is real: nothing is sent without a tap, a
 * double tap is one send, a failure keeps the clip, and a recording belongs to the chat it started in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const rec = {
  error: null as string | null,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
};
vi.mock('@/hooks/use-audio-recorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    startRecording: rec.startRecording,
    stopRecording: rec.stopRecording,
    error: rec.error,
    stream: null,
    chunkNumber: 0,
    requestImmediateFlush: vi.fn(),
  }),
}));

import { useVoiceNote, voiceErrorText, VOICE_MAX_MS } from '@/hooks/use-voice-note';
import { VoiceNoteError } from '@/app/data/chat-voice-service';

const WAV = Uint8Array.from([1, 2, 3, 4]);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const nav = globalThis.navigator;
const real = { mr: (globalThis as { MediaRecorder?: unknown }).MediaRecorder, ac: (globalThis as { AudioContext?: unknown }).AudioContext };

function supportBrowser(on: boolean) {
  Object.defineProperty(nav, 'mediaDevices', { value: on ? { getUserMedia: vi.fn() } : undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = on ? vi.fn() : undefined;
  (globalThis as Record<string, unknown>).AudioContext = on ? vi.fn() : undefined;
}

type Sender = (wav: Blob, opts?: { resume?: { conversationId: string; objectKey: string } }) => Promise<unknown>;
function setup(initialKey = 'u:chat-a') {
  const sendA = vi.fn<Sender>(async () => undefined);
  const toWav = vi.fn<(blob: Blob, max?: number) => Promise<Uint8Array>>(async () => WAV);
  const view = renderHook(
    ({ draftKey, send }: { draftKey: string; send: Sender | undefined }) => useVoiceNote(draftKey, send, toWav),
    { initialProps: { draftKey: initialKey, send: sendA as Sender | undefined } },
  );
  return { ...view, sendA, toWav };
}
type H = ReturnType<typeof setup>;
const begin = async (h: H) => { await act(async () => { await h.result.current.start(); }); };

beforeEach(() => {
  rec.error = null;
  rec.startRecording.mockReset().mockResolvedValue(true);
  rec.stopRecording.mockReset().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  supportBrowser(true);
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = real.mr;
  (globalThis as Record<string, unknown>).AudioContext = real.ac;
});

describe('useVoiceNote: availability', () => {
  it('is enabled with a sender and a recording-capable browser', () => {
    expect(setup().result.current.enabled).toBe(true);
  });

  it('is off with no sender (a mirror chat), however capable the browser', () => {
    const h = setup();
    h.rerender({ draftKey: 'u:chat-a', send: undefined });
    expect(h.result.current.enabled).toBe(false);
  });

  it('is off in a browser that cannot record', () => {
    supportBrowser(false);
    expect(setup().result.current.enabled).toBe(false);
  });
});

describe('useVoiceNote: record and send', () => {
  it('idle -> recording -> sending -> idle: the WAV is capped at the server limit and sent once as audio/wav', async () => {
    const h = setup();
    await begin(h);
    expect(h.result.current.phase).toBe('recording');
    expect(h.result.current.showBar).toBe(true);
    await act(async () => { await h.result.current.submit(); });
    expect(h.toWav).toHaveBeenCalledWith(expect.any(Blob), VOICE_MAX_MS);
    expect(h.sendA).toHaveBeenCalledTimes(1);
    const sent = h.sendA.mock.calls[0]?.[0] as Blob;
    expect(sent.type).toBe('audio/wav');
    expect(sent.size).toBe(WAV.length);
    expect(h.result.current.phase).toBe('idle');
    expect(h.result.current.showBar).toBe(false);
  });

  it('a double tap on send is one send', async () => {
    const h = setup();
    let finish!: () => void;
    h.sendA.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    await begin(h);
    await act(async () => { void h.result.current.submit(); void h.result.current.submit(); void h.result.current.submit(); });
    await flush();
    expect(h.sendA).toHaveBeenCalledTimes(1);
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('sending');
    await act(async () => { finish(); });
    await flush();
    expect(h.result.current.phase).toBe('idle');
  });

  it('a second start while busy is ignored', async () => {
    const h = setup();
    await begin(h);
    await begin(h);
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
  });

  it('the timer counts up while recording', async () => {
    vi.useFakeTimers();
    const h = setup();
    await begin(h);
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(h.result.current.elapsedMs).toBeGreaterThanOrEqual(3000);
    expect(h.result.current.elapsedMs).toBeLessThan(3600);
  });
});

describe('useVoiceNote: cancel sends nothing', () => {
  it('cancel while recording stops the recorder and sends nothing', async () => {
    const h = setup();
    await begin(h);
    await act(async () => { await h.result.current.cancel(); });
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.sendA).not.toHaveBeenCalled();
    expect(h.result.current.phase).toBe('idle');
  });

  it('cancel while the permission prompt is open discards the recording the moment it starts', async () => {
    const h = setup();
    let grant!: (ok: boolean) => void;
    rec.startRecording.mockImplementation(() => new Promise<boolean>((r) => { grant = r; }));
    await act(async () => { void h.result.current.start(); });
    expect(h.result.current.phase).toBe('starting');
    await act(async () => { await h.result.current.cancel(); });
    await act(async () => { grant(true); });
    await flush();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
    expect(h.sendA).not.toHaveBeenCalled();
  });

  it('a denied microphone returns to idle with the recorder message', async () => {
    const h = setup();
    rec.error = 'Microphone access denied. Please allow microphone access to record.';
    rec.startRecording.mockResolvedValue(false);
    await begin(h);
    expect(h.result.current.phase).toBe('idle');
    expect(h.result.current.notice).toMatch(/microphone/i);
  });
});

describe('useVoiceNote: the limit', () => {
  it('stops itself at 2 minutes and holds the clip READY: nothing is sent without a tap', async () => {
    vi.useFakeTimers();
    const h = setup();
    await begin(h);
    await act(async () => { await vi.advanceTimersByTimeAsync(VOICE_MAX_MS + 100); });
    await flush();
    expect(h.result.current.phase).toBe('ready');
    expect(h.result.current.showBar).toBe(true);
    expect(h.result.current.elapsedMs).toBe(VOICE_MAX_MS);
    expect(h.sendA).not.toHaveBeenCalled();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);

    await act(async () => { await h.result.current.submit(); });
    expect(rec.stopRecording).toHaveBeenCalledTimes(1); // the held clip is used, the recorder is not stopped twice
    expect(h.sendA).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
  });

  it('a ready clip can still be cancelled', async () => {
    vi.useFakeTimers();
    const h = setup();
    await begin(h);
    await act(async () => { await vi.advanceTimersByTimeAsync(VOICE_MAX_MS + 100); });
    await act(async () => { await h.result.current.cancel(); });
    expect(h.result.current.phase).toBe('idle');
    expect(h.sendA).not.toHaveBeenCalled();
  });
});

describe('useVoiceNote: failure keeps the clip', () => {
  async function failOnce(error: unknown) {
    const h = setup();
    h.sendA.mockRejectedValueOnce(error);
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    return h;
  }

  it('a rate limit keeps the clip with a plain message; Retry sends the SAME clip', async () => {
    const h = await failOnce(new VoiceNoteError('rate', 429, 'x'));
    expect(h.result.current.phase).toBe('error');
    expect(h.result.current.errorText).toBe('Too many voice messages. Wait a minute and try again.');
    expect(h.result.current.canRetry).toBe(true);
    await act(async () => { await h.result.current.retry(); });
    expect(h.sendA).toHaveBeenCalledTimes(2);
    expect(h.sendA.mock.calls[1]?.[0]).toBe(h.sendA.mock.calls[0]?.[0]);
    expect(h.toWav).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
  });

  it('a double tap on Retry is one send', async () => {
    const h = await failOnce(new VoiceNoteError('failed', 500, 'x'));
    let finish!: () => void;
    h.sendA.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    await act(async () => { void h.result.current.retry(); void h.result.current.retry(); });
    await flush();
    expect(h.sendA).toHaveBeenCalledTimes(2);
    await act(async () => { finish(); });
  });

  it('Discard drops the clip', async () => {
    const h = await failOnce(new VoiceNoteError('failed', 500, 'x'));
    act(() => h.result.current.discard());
    expect(h.result.current.phase).toBe('idle');
    await act(async () => { await h.result.current.retry(); });
    expect(h.sendA).toHaveBeenCalledTimes(1);
  });

  it('a clip the server will never take (too long, forbidden, unsupported) offers no Retry', async () => {
    for (const reason of ['too_long', 'forbidden', 'unsupported'] as const) {
      const h = await failOnce(new VoiceNoteError(reason, 400, 'x'));
      expect(h.result.current.phase).toBe('error');
      expect(h.result.current.canRetry, reason).toBe(false);
    }
  });

  it('a non-VoiceNoteError (the network) is a retryable generic failure', async () => {
    const h = await failOnce(new TypeError('Failed to fetch'));
    expect(h.result.current.errorText).toBe("Couldn't send the voice message.");
    expect(h.result.current.canRetry).toBe(true);
  });

  it('a clip the browser cannot decode is an error that KEEPS the recording: Retry decodes it again and sends', async () => {
    const h = setup();
    h.toWav.mockRejectedValueOnce(new Error('EncodingError'));
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    expect(h.result.current.phase).toBe('error');
    expect(h.result.current.canRetry).toBe(true);
    expect(h.sendA).not.toHaveBeenCalled();
    await act(async () => { await h.result.current.retry(); });
    expect(h.toWav).toHaveBeenCalledTimes(2);
    expect(h.toWav.mock.calls[1]?.[0]).toBe(h.toWav.mock.calls[0]?.[0]);
    expect(h.sendA).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
  });

  it('Discard drops the undecodable recording too', async () => {
    const h = setup();
    h.toWav.mockRejectedValue(new Error('EncodingError'));
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    act(() => h.result.current.discard());
    expect(h.result.current.phase).toBe('idle');
    await act(async () => { await h.result.current.retry(); });
    expect(h.toWav).toHaveBeenCalledTimes(1);
  });

  it('a recorder that returns no audio is an error, not a send', async () => {
    const h = setup();
    rec.stopRecording.mockResolvedValue(null);
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    expect(h.result.current.phase).toBe('error');
    expect(h.sendA).not.toHaveBeenCalled();
  });
});

describe('voiceErrorText', () => {
  it('maps every reason to a plain sentence', () => {
    expect(voiceErrorText(new VoiceNoteError('rate', 429, 'x'))).toBe('Too many voice messages. Wait a minute and try again.');
    expect(voiceErrorText(new VoiceNoteError('too_long', 413, 'x'))).toBe('That voice message is too long (2 minutes at most).');
    expect(voiceErrorText(new VoiceNoteError('forbidden', 403, 'x'))).toBe("You can't send voice messages in this chat.");
    expect(voiceErrorText(new VoiceNoteError('unsupported', 422, 'x'))).toBe("Voice messages aren't available in this chat.");
    expect(voiceErrorText(new VoiceNoteError('failed', 500, 'x'))).toBe("Couldn't send the voice message.");
    expect(voiceErrorText(undefined)).toBe("Couldn't send the voice message.");
  });

  it('never leaks the server text', () => {
    expect(voiceErrorText(new VoiceNoteError('failed', 500, 'voice note commit failed: secret detail'))).not.toMatch(/secret/);
  });
});

describe('useVoiceNote: a recording belongs to its chat', () => {
  it('switching chat mid-recording discards it before anything is sent', async () => {
    const h = setup('u:chat-a');
    await begin(h);
    h.rerender({ draftKey: 'u:chat-b', send: h.sendA });
    await flush();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
    expect(h.sendA).not.toHaveBeenCalled();
  });

  it('switching chat while a READY clip is waiting discards it too', async () => {
    vi.useFakeTimers();
    const h = setup('u:chat-a');
    await begin(h);
    await act(async () => { await vi.advanceTimersByTimeAsync(VOICE_MAX_MS + 100); });
    h.rerender({ draftKey: 'u:chat-b', send: h.sendA });
    await flush();
    expect(h.result.current.phase).toBe('idle');
  });

  it('a send already in flight keeps going to the chat it was started in, not the one on screen now', async () => {
    const sendB = vi.fn<Sender>(async () => undefined);
    const h = setup('u:chat-a');
    let finish!: () => void;
    h.sendA.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    await begin(h);
    await act(async () => { void h.result.current.submit(); });
    await flush();
    h.rerender({ draftKey: 'u:chat-b', send: sendB });
    await flush();
    expect(h.result.current.phase).toBe('sending');
    await act(async () => { finish(); });
    await flush();
    expect(h.sendA).toHaveBeenCalledTimes(1);
    expect(sendB).not.toHaveBeenCalled();
  });

  it('a chat switch while the clip is still being encoded still sends to the ORIGINATING chat', async () => {
    const sendB = vi.fn<Sender>(async () => undefined);
    const h = setup('u:chat-a');
    let encoded!: (wav: Uint8Array) => void;
    h.toWav.mockImplementation(() => new Promise<Uint8Array>((r) => { encoded = r; }));
    await begin(h);
    await act(async () => { void h.result.current.submit(); });
    await flush();
    h.rerender({ draftKey: 'u:chat-b', send: sendB });
    await flush();
    await act(async () => { encoded(WAV); });
    await flush();
    expect(h.sendA).toHaveBeenCalledTimes(1);
    expect(sendB).not.toHaveBeenCalled();
  });

  it('a failed clip is dropped when the chat changes, so Retry can never send it to the wrong chat', async () => {
    const h = setup('u:chat-a');
    h.sendA.mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'x'));
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    expect(h.result.current.phase).toBe('error');
    h.rerender({ draftKey: 'u:chat-b', send: h.sendA });
    await flush();
    expect(h.result.current.phase).toBe('idle');
  });

  it('hiding the tab (a call, another app) mid-recording discards it', async () => {
    const h = setup();
    await begin(h);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(h.result.current.phase).toBe('idle');
    expect(h.sendA).not.toHaveBeenCalled();
  });

  it('hiding the tab while the upload is in flight does not cancel it', async () => {
    const h = setup();
    let finish!: () => void;
    h.sendA.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    await begin(h);
    await act(async () => { void h.result.current.submit(); });
    await flush();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.result.current.phase).toBe('sending');
    await act(async () => { finish(); });
  });

  it('unmounting mid-recording releases the microphone', async () => {
    const h = setup();
    await begin(h);
    h.unmount();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.sendA).not.toHaveBeenCalled();
  });
});

describe('useVoiceNote: Retry resumes a stored upload instead of making a second message', () => {
  const receipt = { conversationId: 'c-a', objectKey: 'c-a/obj-1.wav' };
  const stored = (status = 500) => new VoiceNoteError('failed', status, 'x', receipt);

  async function failedWithReceipt(error: unknown = stored()) {
    const h = setup();
    h.sendA.mockRejectedValueOnce(error);
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    return h;
  }

  it('the first attempt carries no receipt', async () => {
    const h = setup();
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    expect(h.sendA.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('Retry hands the failure\'s receipt back as `resume`, with the SAME clip and no new encode', async () => {
    const h = await failedWithReceipt();
    expect(h.result.current.canRetry).toBe(true);
    await act(async () => { await h.result.current.retry(); });
    expect(h.sendA).toHaveBeenCalledTimes(2);
    expect(h.sendA.mock.calls[1]?.[0]).toBe(h.sendA.mock.calls[0]?.[0]);
    expect(h.sendA.mock.calls[1]?.[1]).toEqual({ resume: receipt });
    expect(h.toWav).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
  });

  it('a rate-limited commit resumes too', async () => {
    const h = await failedWithReceipt(new VoiceNoteError('rate', 429, 'x', receipt));
    await act(async () => { await h.result.current.retry(); });
    expect(h.sendA.mock.calls[1]?.[1]).toEqual({ resume: receipt });
  });

  it('a failure with NO receipt (the upload itself failed) retries from scratch', async () => {
    const h = await failedWithReceipt(new VoiceNoteError('failed', 500, 'x'));
    await act(async () => { await h.result.current.retry(); });
    expect(h.sendA.mock.calls[1]?.[1]).toBeUndefined();
  });

  it('if the resumed commit is 404 (the stored object is gone), the receipt is dropped and the kept WAV is sent again from scratch', async () => {
    const h = await failedWithReceipt();
    h.sendA.mockRejectedValueOnce(new VoiceNoteError('failed', 404, 'x')).mockResolvedValueOnce(undefined);
    await act(async () => { await h.result.current.retry(); });
    expect(h.sendA).toHaveBeenCalledTimes(3);
    expect(h.sendA.mock.calls[1]?.[1]).toEqual({ resume: receipt });
    expect(h.sendA.mock.calls[2]?.[1]).toBeUndefined();
    expect(h.sendA.mock.calls[2]?.[0]).toBe(h.sendA.mock.calls[0]?.[0]);
    expect(h.result.current.phase).toBe('idle'); // the person never saw the 404
  });

  it('a 404 that is not on a resumed attempt is an ordinary failure (no silent second try)', async () => {
    const h = await failedWithReceipt(new VoiceNoteError('failed', 404, 'x'));
    expect(h.sendA).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('error');
  });

  it('when the from-scratch fallback fails too, its own receipt is the one kept for the next Retry', async () => {
    const h = await failedWithReceipt();
    const fresh = { conversationId: 'c-a', objectKey: 'c-a/obj-2.wav' };
    h.sendA.mockRejectedValueOnce(new VoiceNoteError('failed', 404, 'x')).mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'x', fresh));
    await act(async () => { await h.result.current.retry(); });
    expect(h.result.current.phase).toBe('error');
    await act(async () => { await h.result.current.retry(); });
    expect(h.sendA.mock.calls[3]?.[1]).toEqual({ resume: fresh });
  });

  it('after a resumed attempt succeeds, the next voice note starts clean', async () => {
    const h = await failedWithReceipt();
    await act(async () => { await h.result.current.retry(); });
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    expect(h.sendA.mock.calls[2]?.[1]).toBeUndefined();
  });

  it('Discard throws the receipt away with the clip', async () => {
    const h = await failedWithReceipt();
    act(() => h.result.current.discard());
    await begin(h);
    await act(async () => { await h.result.current.submit(); });
    expect(h.sendA.mock.calls[1]?.[1]).toBeUndefined();
  });

  it('a commit refused as bad audio (400) is final: no Retry, however it is labelled', async () => {
    const h = await failedWithReceipt(new VoiceNoteError('failed', 400, 'x'));
    expect(h.result.current.phase).toBe('error');
    expect(h.result.current.canRetry).toBe(false);
  });

  it('a final failure carries no receipt and offers no Retry', async () => {
    const h = await failedWithReceipt(new VoiceNoteError('too_long', 413, 'x'));
    expect(h.result.current.canRetry).toBe(false);
  });
});

describe('useVoiceNote: a cancel that lands while the recorder is still stopping wins', () => {
  it('nothing is encoded or sent after it', async () => {
    const h = setup();
    let stopped!: (b: Blob) => void;
    rec.stopRecording.mockImplementation(() => new Promise<Blob>((r) => { stopped = r; }));
    await begin(h);
    await act(async () => { void h.result.current.submit(); });
    await flush();
    await act(async () => { await h.result.current.cancel(); });
    expect(h.result.current.phase).toBe('idle');
    await act(async () => { stopped(new Blob(['x'])); });
    await flush();
    expect(h.toWav).not.toHaveBeenCalled();
    expect(h.sendA).not.toHaveBeenCalled();
    expect(h.result.current.phase).toBe('idle');
  });
});
