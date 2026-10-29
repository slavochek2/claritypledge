/**
 * P1576 Part A: the dictation state machine. The recorder (MediaRecorder) and the WAV decode are
 * stubbed; everything the user can observe is real: when a request is made (and that a double tap
 * makes one), what is kept when it fails, what a chat switch discards, and which draft a late
 * transcript is addressed to.
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

import { useDictation } from '@/hooks/use-dictation';
import { TranscribeClipError } from '@/app/data/transcribe-clip-service';
import { DICTATION_AUTO_STOP_MS } from '@/lib/audio/clip-wav';

const WAV = Uint8Array.from([1, 2, 3, 4]);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function setup(initialKey = 'u:chat-a') {
  const onText = vi.fn();
  const transcribe = vi.fn(async (_wav: Uint8Array) => 'spoken words');
  const toWav = vi.fn(async (_blob: Blob) => WAV);
  const view = renderHook(({ draftKey }) => useDictation({ draftKey, onText, transcribe, toWav }), {
    initialProps: { draftKey: initialKey },
  });
  return { ...view, onText, transcribe, toWav };
}

async function startRecording(h: ReturnType<typeof setup>, caret = 7) {
  await act(async () => { await h.result.current.start(caret); });
}

beforeEach(() => {
  rec.error = null;
  rec.startRecording.mockReset().mockResolvedValue(true);
  rec.stopRecording.mockReset().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useDictation: the happy path', () => {
  it('idle -> recording -> transcribing -> idle, and the text goes to the draft it started in at the caret it started at', async () => {
    const h = setup();
    expect(h.result.current.phase).toBe('idle');
    await startRecording(h, 12);
    expect(h.result.current.phase).toBe('recording');

    let pending!: (t: string) => void;
    h.transcribe.mockImplementation(() => new Promise<string>((r) => { pending = r; }));
    await act(async () => { void h.result.current.done(); });
    await flush();
    expect(h.result.current.phase).toBe('transcribing');

    await act(async () => { pending('spoken words'); });
    await flush();
    expect(h.result.current.phase).toBe('idle');
    expect(h.onText).toHaveBeenCalledExactlyOnceWith('spoken words', { draftKey: 'u:chat-a', caret: 12 });
    expect(h.transcribe).toHaveBeenCalledWith(WAV);
  });

  it('a double tap on done is one request', async () => {
    const h = setup();
    await startRecording(h);
    let pending!: (t: string) => void;
    h.transcribe.mockImplementation(() => new Promise<string>((r) => { pending = r; }));
    await act(async () => {
      void h.result.current.done();
      void h.result.current.done();
      void h.result.current.done();
    });
    await flush();
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    await act(async () => { pending('x'); });
    await flush();
    expect(h.onText).toHaveBeenCalledTimes(1);
  });

  it('a second start while already recording is ignored', async () => {
    const h = setup();
    await startRecording(h);
    await startRecording(h);
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
  });

  it('silence: nothing is inserted and the user is told', async () => {
    const h = setup();
    h.transcribe.mockResolvedValue('   ');
    await startRecording(h);
    await act(async () => { await h.result.current.done(); });
    expect(h.onText).not.toHaveBeenCalled();
    expect(h.result.current.phase).toBe('idle');
    expect(h.result.current.notice).toMatch(/didn.t catch/i);
  });
});

describe('useDictation: cancel keeps the draft untouched', () => {
  it('cancel while recording stops the recorder and sends nothing', async () => {
    const h = setup();
    await startRecording(h);
    await act(async () => { await h.result.current.cancel(); });
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.onText).not.toHaveBeenCalled();
    expect(h.result.current.phase).toBe('idle');
  });

  it('cancel while the permission prompt is still open discards the recording the moment it starts', async () => {
    const h = setup();
    let grant!: (ok: boolean) => void;
    rec.startRecording.mockImplementation(() => new Promise<boolean>((r) => { grant = r; }));
    await act(async () => { void h.result.current.start(0); });
    expect(h.result.current.phase).toBe('starting');
    await act(async () => { await h.result.current.cancel(); });
    expect(h.result.current.phase).toBe('idle');
    await act(async () => { grant(true); });
    await flush();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
    expect(h.transcribe).not.toHaveBeenCalled();
  });
});

describe('useDictation: microphone problems leave typing usable', () => {
  it('a denied microphone returns to idle with a message', async () => {
    const h = setup();
    rec.error = 'Microphone access denied. Please allow microphone access to record.';
    rec.startRecording.mockResolvedValue(false);
    await startRecording(h);
    expect(h.result.current.phase).toBe('idle');
    expect(h.result.current.notice).toMatch(/microphone/i);
  });

  it('the message goes away on the next attempt', async () => {
    const h = setup();
    rec.error = 'Microphone access denied.';
    rec.startRecording.mockResolvedValueOnce(false);
    await startRecording(h);
    expect(h.result.current.notice).not.toBeNull();
    rec.error = null;
    await startRecording(h);
    expect(h.result.current.notice).toBeNull();
    expect(h.result.current.phase).toBe('recording');
  });
});

describe('useDictation: failure keeps the clip', () => {
  async function failedOnce(error: Error = new TranscribeClipError('Transcription failed', 502)) {
    const h = setup();
    h.transcribe.mockRejectedValueOnce(error);
    await startRecording(h, 3);
    await act(async () => { await h.result.current.done(); });
    return h;
  }

  it('moves to error, keeping the clip: Retry sends the SAME audio and the text still lands', async () => {
    const h = await failedOnce();
    expect(h.result.current.phase).toBe('error');
    expect(h.result.current.canRetry).toBe(true);
    expect(h.onText).not.toHaveBeenCalled();
    await act(async () => { await h.result.current.retry(); });
    expect(h.transcribe).toHaveBeenCalledTimes(2);
    expect(h.transcribe.mock.calls[1]?.[0]).toBe(h.transcribe.mock.calls[0]?.[0]);
    expect(h.toWav).toHaveBeenCalledTimes(1);
    expect(h.onText).toHaveBeenCalledExactlyOnceWith('spoken words', { draftKey: 'u:chat-a', caret: 3 });
    expect(h.result.current.phase).toBe('idle');
  });

  it('a double tap on Retry is one request', async () => {
    const h = await failedOnce();
    let pending!: (t: string) => void;
    h.transcribe.mockImplementation(() => new Promise<string>((r) => { pending = r; }));
    await act(async () => { void h.result.current.retry(); void h.result.current.retry(); });
    await flush();
    expect(h.transcribe).toHaveBeenCalledTimes(2); // the first failure + exactly one retry
    await act(async () => { pending('x'); });
  });

  it('Discard drops the clip and goes idle; nothing is inserted', async () => {
    const h = await failedOnce();
    act(() => h.result.current.discard());
    expect(h.result.current.phase).toBe('idle');
    await act(async () => { await h.result.current.retry(); });
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    expect(h.onText).not.toHaveBeenCalled();
  });

  it('a failed retry stays in error with the clip still kept', async () => {
    const h = await failedOnce();
    h.transcribe.mockRejectedValueOnce(new TranscribeClipError('Network error', 0));
    await act(async () => { await h.result.current.retry(); });
    expect(h.result.current.phase).toBe('error');
    await act(async () => { await h.result.current.retry(); });
    expect(h.result.current.phase).toBe('idle');
    expect(h.onText).toHaveBeenCalledTimes(1);
  });

  it('a clip the server will never accept offers no Retry', async () => {
    const h = await failedOnce(new TranscribeClipError('Clip exceeds the maximum duration', 413));
    expect(h.result.current.phase).toBe('error');
    expect(h.result.current.canRetry).toBe(false);
  });

  it('a clip the browser cannot decode is an error, not a crash: the recording is KEPT and Retry decodes it again', async () => {
    const h = setup();
    h.toWav.mockRejectedValueOnce(new Error('EncodingError'));
    await startRecording(h);
    await act(async () => { await h.result.current.done(); });
    expect(h.result.current.phase).toBe('error');
    expect(h.result.current.canRetry).toBe(true);
    expect(h.transcribe).not.toHaveBeenCalled();
    await act(async () => { await h.result.current.retry(); });
    expect(h.toWav).toHaveBeenCalledTimes(2);
    expect(h.toWav.mock.calls[1]?.[0]).toBe(h.toWav.mock.calls[0]?.[0]);
    expect(h.onText).toHaveBeenCalledExactlyOnceWith('spoken words', { draftKey: 'u:chat-a', caret: 7 });
    expect(h.result.current.phase).toBe('idle');
  });

  it('a decode that fails twice stays in error with the recording still kept; Discard drops it', async () => {
    const h = setup();
    h.toWav.mockRejectedValue(new Error('EncodingError'));
    await startRecording(h);
    await act(async () => { await h.result.current.done(); });
    await act(async () => { await h.result.current.retry(); });
    expect(h.result.current.phase).toBe('error');
    expect(h.result.current.canRetry).toBe(true);
    act(() => h.result.current.discard());
    expect(h.result.current.phase).toBe('idle');
    await act(async () => { await h.result.current.retry(); });
    expect(h.toWav).toHaveBeenCalledTimes(2);
  });

  it('a recorder that returns no audio is an error, not a request', async () => {
    const h = setup();
    rec.stopRecording.mockResolvedValue(null);
    await startRecording(h);
    await act(async () => { await h.result.current.done(); });
    expect(h.result.current.phase).toBe('error');
    expect(h.transcribe).not.toHaveBeenCalled();
  });
});

describe('useDictation: a recording belongs to the chat it started in', () => {
  it('switching chat mid-recording discards it', async () => {
    const h = setup('u:chat-a');
    await startRecording(h);
    h.rerender({ draftKey: 'u:chat-b' });
    await flush();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.onText).not.toHaveBeenCalled();
  });

  it('switching chat while the permission prompt is open discards too', async () => {
    const h = setup('u:chat-a');
    let grant!: (ok: boolean) => void;
    rec.startRecording.mockImplementation(() => new Promise<boolean>((r) => { grant = r; }));
    await act(async () => { void h.result.current.start(0); });
    h.rerender({ draftKey: 'u:chat-b' });
    await act(async () => { grant(true); });
    await flush();
    expect(h.result.current.phase).toBe('idle');
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
  });

  it('a transcript that resolves after a chat switch is addressed to the ORIGINATING draft', async () => {
    const h = setup('u:chat-a');
    await startRecording(h, 9);
    let pending!: (t: string) => void;
    h.transcribe.mockImplementation(() => new Promise<string>((r) => { pending = r; }));
    await act(async () => { void h.result.current.done(); });
    await flush();
    h.rerender({ draftKey: 'u:chat-b' });
    await flush();
    expect(h.result.current.phase).toBe('transcribing'); // still in flight: not cancelled by the switch
    await act(async () => { pending('late words'); });
    await flush();
    expect(h.onText).toHaveBeenCalledExactlyOnceWith('late words', { draftKey: 'u:chat-a', caret: 9 });
  });

  it('a clip waiting on Retry is dropped when the chat changes', async () => {
    const h = setup('u:chat-a');
    h.transcribe.mockRejectedValueOnce(new TranscribeClipError('x', 502));
    await startRecording(h);
    await act(async () => { await h.result.current.done(); });
    expect(h.result.current.phase).toBe('error');
    h.rerender({ draftKey: 'u:chat-b' });
    await flush();
    expect(h.result.current.phase).toBe('idle');
  });

  it('hiding the tab (or an incoming call) mid-recording discards it', async () => {
    const h = setup();
    await startRecording(h);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.result.current.phase).toBe('idle');
    expect(h.transcribe).not.toHaveBeenCalled();
  });

  it('hiding the tab while a transcript is in flight does not lose it', async () => {
    const h = setup();
    await startRecording(h);
    let pending!: (t: string) => void;
    h.transcribe.mockImplementation(() => new Promise<string>((r) => { pending = r; }));
    await act(async () => { void h.result.current.done(); });
    await flush();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { pending('kept'); });
    await flush();
    expect(h.onText).toHaveBeenCalledTimes(1);
  });

  it('unmounting mid-recording stops the recorder', async () => {
    const h = setup();
    await startRecording(h);
    h.unmount();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(h.transcribe).not.toHaveBeenCalled();
  });
});

describe('useDictation: the length cap', () => {
  it('stops itself under the server cap and sends what it has', async () => {
    vi.useFakeTimers();
    const h = setup();
    await startRecording(h);
    await act(async () => { await vi.advanceTimersByTimeAsync(DICTATION_AUTO_STOP_MS - 1); });
    expect(h.transcribe).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    await flush();
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    expect(h.onText).toHaveBeenCalledTimes(1);
  });

  it('a recording that was cancelled never auto-stops later', async () => {
    vi.useFakeTimers();
    const h = setup();
    await startRecording(h);
    await act(async () => { await h.result.current.cancel(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DICTATION_AUTO_STOP_MS + 1000); });
    expect(h.transcribe).not.toHaveBeenCalled();
  });
});

describe('useDictation: a cancel that lands while the recorder is still stopping wins', () => {
  it('nothing is decoded or transcribed after it', async () => {
    const h = setup();
    let stopped!: (b: Blob) => void;
    rec.stopRecording.mockImplementation(() => new Promise<Blob>((r) => { stopped = r; }));
    await startRecording(h);
    await act(async () => { void h.result.current.done(); });
    await flush();
    await act(async () => { await h.result.current.cancel(); });
    expect(h.result.current.phase).toBe('idle');
    await act(async () => { stopped(new Blob(['x'])); });
    await flush();
    expect(h.toWav).not.toHaveBeenCalled();
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.onText).not.toHaveBeenCalled();
    expect(h.result.current.phase).toBe('idle');
  });
});
