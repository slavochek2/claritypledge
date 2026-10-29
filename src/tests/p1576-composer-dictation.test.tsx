/**
 * P1576 Part A: dictation in the real Composer. The recorder, the WAV decode and the network call are
 * stubbed; the composer, the draft store and the dictation hook are real. These are the acceptance
 * criteria a user can see: where the mic is, what replaces the field while recording, that ✓ is one
 * request, what ✕ leaves alone, how a failure looks, and which chat a late transcript lands in.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const transcribeClip = vi.fn();
vi.mock('@/app/data/transcribe-clip-service', async (importActual) => ({
  ...(await importActual<typeof import('@/app/data/transcribe-clip-service')>()),
  transcribeClip: (...a: unknown[]) => transcribeClip(...a),
}));
vi.mock('@/lib/audio/clip-wav', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/audio/clip-wav')>()),
  blobToWav16k: vi.fn(async () => Uint8Array.from([1, 2, 3])),
}));

import { Composer } from '@/app/pages/chat/Composer';
import { clearDraftsExcept, peekDraft } from '@/app/pages/chat/chat-hooks';
import { clearPending, getPending } from '@/app/pages/chat/pending-dictation';
import { TranscribeClipError } from '@/app/data/transcribe-clip-service';

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const nav = globalThis.navigator;
const realMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
const realAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;

function supportBrowser(on: boolean) {
  Object.defineProperty(nav, 'mediaDevices', { value: on ? { getUserMedia: vi.fn() } : undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = on ? vi.fn() : undefined;
  (globalThis as Record<string, unknown>).AudioContext = on ? vi.fn() : undefined;
}

function ui(draftKey: string, extra: Partial<React.ComponentProps<typeof Composer>> = {}) {
  return (
    <MemoryRouter>
      <Composer draftKey={draftKey} placeholder="Message" onSend={vi.fn()} {...extra} />
    </MemoryRouter>
  );
}
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const dictateButton = () => screen.queryByRole('button', { name: 'Dictate a message' });
const micButton = () => screen.getByRole('button', { name: 'Dictate a message' });

beforeEach(() => {
  clearDraftsExcept(null);
  for (const k of ['t:i1', 't:i2', 't:j1', 't:j2', 't:j3', 't:k1', 't:k2', 't:m1', 't:m2']) clearPending(k);
  rec.error = null;
  rec.startRecording.mockReset().mockResolvedValue(true);
  rec.stopRecording.mockReset().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
  transcribeClip.mockReset().mockResolvedValue('spoken words');
  supportBrowser(true);
});
afterEach(() => {
  Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = realMediaRecorder;
  (globalThis as Record<string, unknown>).AudioContext = realAudioContext;
});

async function begin(caretAt?: number) {
  if (caretAt !== undefined) {
    field().focus();
    field().setSelectionRange(caretAt, caretAt);
    fireEvent.keyUp(field()); // a real browser reports the selection on key/mouse up; React's onSelect hangs off it
  }
  await act(async () => { fireEvent.click(dictateButton() as HTMLElement); });
  await flush();
}

describe('where the mic is', () => {
  it('shows in an empty composer, next to a field that has no Send yet (one primary action)', () => {
    render(ui('t:a1'));
    expect(dictateButton()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('stays beside Send once there is text; Send is the only primary', () => {
    render(ui('t:a2'));
    fireEvent.change(field(), { target: { value: 'hello' } });
    expect(dictateButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('shows in a private @mirror ask too', () => {
    render(ui('t:a3', { privateTo: { id: 'm', label: 'Mira', detail: 'Your mirror (private)', mark: null } as never }));
    expect(dictateButton()).toBeInTheDocument();
  });

  it('CONTROL: a browser without microphone capture gets no mic at all, and typing is untouched', () => {
    supportBrowser(false);
    render(ui('t:a4'));
    expect(dictateButton()).not.toBeInTheDocument();
    fireEvent.change(field(), { target: { value: 'typed' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});

describe('recording', () => {
  it('replaces the field with "Listening…", ✕ and ✓; no Send even with a draft; the draft is kept', async () => {
    render(ui('t:b1'));
    fireEvent.change(field(), { target: { value: 'my draft' } });
    await begin();
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel dictation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish dictation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    expect(dictateButton()).not.toBeInTheDocument();
    expect(peekDraft('t:b1')).toBe('my draft');
  });

  it('✕ discards the clip and leaves the existing draft untouched', async () => {
    render(ui('t:b2'));
    fireEvent.change(field(), { target: { value: 'my draft' } });
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel dictation' })); });
    await flush();
    expect(field().value).toBe('my draft');
    expect(transcribeClip).not.toHaveBeenCalled();
    expect(dictateButton()).toBeInTheDocument();
  });

  it('Escape cancels the recording', async () => {
    render(ui('t:b3'));
    await begin();
    await act(async () => { fireEvent.keyDown(screen.getByRole('button', { name: 'Finish dictation' }), { key: 'Escape' }); });
    await flush();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(transcribeClip).not.toHaveBeenCalled();
  });
});

describe('✓ done', () => {
  it('shows a disabled spinner in flight; three taps are one request; the words land at the caret', async () => {
    let finish!: (t: string) => void;
    transcribeClip.mockImplementation(() => new Promise<string>((r) => { finish = r; }));
    render(ui('t:c1'));
    fireEvent.change(field(), { target: { value: 'Hi there' } });
    await begin(3);

    const done = screen.getByRole('button', { name: 'Finish dictation' });
    await act(async () => { fireEvent.click(done); fireEvent.click(done); fireEvent.click(done); });
    await flush();
    expect(transcribeClip).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: 'Transcribing' });
    expect(busy).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();

    await act(async () => { finish('Bob'); });
    await flush();
    expect(field().value).toBe('Hi Bob there');
    expect(peekDraft('t:c1')).toBe('Hi Bob there');
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('puts the words into an empty field without sending anything', async () => {
    const onSend = vi.fn();
    render(ui('t:c2', { onSend }));
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    expect(field().value).toBe('spoken words');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('with no caret in the field (not focused), the words are appended after the draft', async () => {
    render(ui('t:c3'));
    fireEvent.change(field(), { target: { value: 'Hi' } });
    field().blur();
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    expect(field().value).toBe('Hi spoken words');
  });
});

describe('failure keeps the clip', () => {
  async function failFirst() {
    transcribeClip.mockRejectedValueOnce(new TranscribeClipError('Transcription failed', 502));
    render(ui('t:d1'));
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
  }

  it('says it could not transcribe and offers Retry and Discard; typing still works', async () => {
    await failFirst();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t transcribe/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard recording' })).toBeInTheDocument();
    fireEvent.change(field(), { target: { value: 'typed meanwhile' } });
    expect(field().value).toBe('typed meanwhile');
  });

  it('Retry sends the same clip and the text lands', async () => {
    await failFirst();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await flush();
    expect(transcribeClip).toHaveBeenCalledTimes(2);
    expect(field().value).toBe('spoken words');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Discard drops it', async () => {
    await failFirst();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard recording' })); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field().value).toBe('');
  });
});

describe('microphone denied', () => {
  it('shows an inline message under the field and typing still works', async () => {
    rec.error = 'Microphone access denied. Please allow microphone access to record.';
    rec.startRecording.mockResolvedValue(false);
    render(ui('t:e1'));
    await begin();
    expect(screen.getByRole('status')).toHaveTextContent(/Microphone access denied/);
    fireEvent.change(field(), { target: { value: 'still typing' } });
    expect(field().value).toBe('still typing');
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});

describe('a recording belongs to its chat', () => {
  it('switching chat mid-recording discards it and shows the other chat normally', async () => {
    const { rerender } = render(ui('t:f1'));
    await begin();
    rerender(ui('t:f2'));
    await flush();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByText('Listening…')).not.toBeInTheDocument();
    expect(transcribeClip).not.toHaveBeenCalled();
  });

  it('a late transcript lands in the ORIGINATING chat draft, never the visible one', async () => {
    let finish!: (t: string) => void;
    transcribeClip.mockImplementation(() => new Promise<string>((r) => { finish = r; }));
    const { rerender } = render(ui('t:g1'));
    fireEvent.change(field(), { target: { value: 'chat one' } });
    await begin(8);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();

    rerender(ui('t:g2'));
    await flush();
    expect(dictateButton(), 'no second recording while the first clip is still in flight').toBeDisabled();
    fireEvent.change(field(), { target: { value: 'chat two' } });
    await act(async () => { finish('late words'); });
    await flush();

    expect(field().value).toBe('chat two');
    expect(peekDraft('t:g2')).toBe('chat two');
    expect(peekDraft('t:g1')).toBe('chat one late words');

    rerender(ui('t:g1'));
    await flush();
    expect(field().value).toBe('chat one late words');
  });

  it('a transcript that resolves after the composer is gone still reaches its draft', async () => {
    let finish!: (t: string) => void;
    transcribeClip.mockImplementation(() => new Promise<string>((r) => { finish = r; }));
    const view = render(ui('t:h1'));
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    view.unmount();
    await act(async () => { finish('after leaving'); });
    await flush();
    expect(peekDraft('t:h1')).toBe('after leaving');
  });
});

const FULL = 'x'.repeat(3995);
const tooLong = () => screen.getByRole('alert');

async function dictateInto(key: string, draft: string) {
  render(ui(key));
  fireEvent.change(field(), { target: { value: draft } });
  await begin();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
  await flush();
}

describe('words that do not fit the 4000-character message are never cut and never lost', () => {
  it('keeps the draft whole, says so inline, and Retry lands the same words once there is room', async () => {
    await dictateInto('t:i1', FULL);
    expect(tooLong()).toHaveTextContent(/too long to fit/i);
    expect(field().value).toBe(FULL);
    expect(transcribeClip).toHaveBeenCalledTimes(1);

    fireEvent.change(field(), { target: { value: 'short now' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Insert dictated text' })); });
    await flush();
    expect(transcribeClip).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('short now spoken words');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getPending('t:i1')).toBeNull();
  });

  it('Retry while it still does not fit keeps the message and the words', async () => {
    await dictateInto('t:i2', FULL);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(tooLong()).toHaveTextContent(/too long to fit/i);
    expect(getPending('t:i2')?.text).toBe('spoken words');
  });

  it('Discard gives up on the words and leaves the draft as it was', async () => {
    await dictateInto('t:j1', FULL);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard dictated text' })); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field().value).toBe(FULL);
    expect(getPending('t:j1')).toBeNull();
  });

  it('the in-field mic works again (a second dictation may follow) and its words join the held ones', async () => {
    await dictateInto('t:j2', FULL);
    expect(micButton()).toBeEnabled();
    transcribeClip.mockResolvedValue('more words');
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    expect(getPending('t:j2')?.text).toBe('spoken words more words');
  });

  it('SWITCHING CHAT keeps them with their chat: the other chat is normal, coming back shows the message again', async () => {
    const view = await (async () => {
      const r = render(ui('t:k1'));
      fireEvent.change(field(), { target: { value: FULL } });
      await begin();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
      await flush();
      return r;
    })();
    expect(tooLong()).toBeInTheDocument();

    view.rerender(ui('t:k2'));
    await flush();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field().value).toBe('');

    view.rerender(ui('t:k1'));
    await flush();
    expect(tooLong()).toHaveTextContent(/too long to fit/i);
    fireEvent.change(field(), { target: { value: 'room again' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Insert dictated text' })); });
    await flush();
    expect(field().value).toBe('room again spoken words');
  });

  it('an off-screen transcript that does not fit never pushes a draft past 4000: it waits for its chat', async () => {
    let finish!: (t: string) => void;
    transcribeClip.mockImplementation(() => new Promise<string>((r) => { finish = r; }));
    const view = render(ui('t:m1'));
    fireEvent.change(field(), { target: { value: FULL } });
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    view.rerender(ui('t:m2'));
    await flush();
    await act(async () => { finish('words that cannot fit'); });
    await flush();

    expect(peekDraft('t:m1')).toBe(FULL);
    expect(peekDraft('t:m1').length).toBeLessThanOrEqual(4000);
    expect(getPending('t:m1')?.text).toBe('words that cannot fit');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    view.rerender(ui('t:m1'));
    await flush();
    expect(tooLong()).toHaveTextContent(/too long to fit/i);
  });

  it('a transcript that resolves after the composer is gone and does not fit is held, not dropped', async () => {
    let finish!: (t: string) => void;
    transcribeClip.mockImplementation(() => new Promise<string>((r) => { finish = r; }));
    const view = render(ui('t:j3'));
    fireEvent.change(field(), { target: { value: FULL } });
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    view.unmount();
    await act(async () => { finish('after leaving'); });
    await flush();
    expect(peekDraft('t:j3')).toBe(FULL);
    expect(getPending('t:j3')?.text).toBe('after leaving');
  });
});

describe('the in-field mic is a disabled button, not a dead one, while a failed clip waits', () => {
  it('is disabled in the error state and works again after Discard', async () => {
    transcribeClip.mockRejectedValueOnce(new TranscribeClipError('Transcription failed', 502));
    render(ui('t:n1'));
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t transcribe/);
    expect(micButton()).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard recording' })); });
    expect(micButton()).toBeEnabled();
  });
});

describe('where the in-field mic sits', () => {
  it('inside the field\'s own frame (the box the text is typed in), not in the button row beside it', () => {
    render(ui('t:p1'));
    const frame = field().parentElement as HTMLElement;
    expect(frame).toContainElement(micButton() as HTMLElement);
  });

  it('the typed text never runs under it: the field keeps a right gutter for the mic', () => {
    render(ui('t:p2'));
    expect(field().className).toMatch(/\bpr-10\b/);
  });
});

describe('the dictation bar: done is not Send', () => {
  it('the ✓ keeps its glyph but is a neutral outlined button, not the blue filled circle that Send is', async () => {
    render(ui('t:q1'));
    fireEvent.change(field(), { target: { value: 'something to send' } });
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send.className).toMatch(/bg-blue-600/);
    await begin();
    const done = screen.getByRole('button', { name: 'Finish dictation' });
    expect(done.className).not.toMatch(/bg-blue-600/);
    expect(done.className).toMatch(/\bborder\b/);
    expect(done.querySelector('svg')).not.toBeNull();
  });
});

describe('the held-words notice says what is true now', () => {
  it('while they still do not fit it says too long; the moment they fit it says they are waiting, and offers Insert', async () => {
    await dictateInto('t:r1', FULL);
    expect(tooLong()).toHaveTextContent(/too long to fit/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: 'short now' } });
    expect(tooLong()).toHaveTextContent('Dictated text is waiting.');
    expect(tooLong()).not.toHaveTextContent(/too long/i);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert dictated text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard dictated text' })).toBeInTheDocument();
  });

  it('sending the long draft (or clearing it) turns the stale "too long" into "waiting", with the words still held', async () => {
    await dictateInto('t:r2', FULL);
    fireEvent.change(field(), { target: { value: '' } });
    expect(tooLong()).toHaveTextContent('Dictated text is waiting.');
    expect(getPending('t:r2')?.text).toBe('spoken words');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Insert dictated text' })); });
    expect(field().value).toBe('spoken words');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('typing the draft long again brings "too long" back', async () => {
    await dictateInto('t:r3', FULL);
    fireEvent.change(field(), { target: { value: 'short' } });
    expect(tooLong()).toHaveTextContent('Dictated text is waiting.');
    fireEvent.change(field(), { target: { value: FULL } });
    expect(tooLong()).toHaveTextContent(/too long to fit/i);
  });
});

describe('nothing is hidden behind the held-words notice', () => {
  it('a failed dictation shows ITS error and Retry/Discard as well as the held words', async () => {
    await dictateInto('t:s1', FULL);
    transcribeClip.mockRejectedValueOnce(new TranscribeClipError('Transcription failed', 502));
    fireEvent.change(field(), { target: { value: 'room' } });
    await begin();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/Couldn.t transcribe/);
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/Dictated text is waiting/);
    expect(screen.getByRole('button', { name: 'Discard recording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert dictated text' })).toBeInTheDocument();
  });

  it('a microphone problem shows beside the held words too', async () => {
    await dictateInto('t:s2', FULL);
    rec.error = 'Microphone access denied. Please allow microphone access to record.';
    rec.startRecording.mockResolvedValue(false);
    await begin();
    expect(screen.getByRole('status')).toHaveTextContent(/Microphone access denied/);
    expect(tooLong()).toHaveTextContent(/too long to fit/i);
  });
});

describe('the live-mic cue is there on a phone too', () => {
  it('shows a compact meter (the most recent bars) on narrow screens and the full one from sm up', async () => {
    render(ui('t:u1'));
    await begin();
    const bars = Array.from(screen.getByTestId('dictation-level').children) as HTMLElement[];
    expect(bars).toHaveLength(24);
    const compact = bars.filter((b) => !/\bhidden\b/.test(b.className));
    expect(compact.length, 'bars shown below sm').toBe(10);
    expect(compact).toEqual(bars.slice(-10)); // the newest ones
    for (const b of bars.slice(0, 14)) expect(b.className).toMatch(/\bsm:block\b/);
  });

  it('bars never shrink to nothing when the row is tight (the cause of the empty meter at 320 px)', async () => {
    render(ui('t:u2'));
    await begin();
    for (const b of Array.from(screen.getByTestId('dictation-level').children)) expect((b as HTMLElement).className).toMatch(/\bshrink-0\b/);
  });
});
