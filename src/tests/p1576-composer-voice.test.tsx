/**
 * P1576 Part B: voice notes in the real Composer. The recorder, the WAV encode and the upload are
 * stubbed; the composer, the draft store and both hooks are real. These are the acceptance criteria a
 * person can see: where the round button is (and is not), what the recorder bar looks like, that ➤ is
 * one send, what failure keeps, and that it never mixes with dictation or Send.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rec = { error: null as string | null, startRecording: vi.fn(), stopRecording: vi.fn() };
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
vi.mock('@/lib/audio/clip-wav', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/audio/clip-wav')>()),
  blobToWav16k: vi.fn(async () => Uint8Array.from([1, 2, 3])),
}));
const transcribeClip = vi.fn();
vi.mock('@/app/data/transcribe-clip-service', async (importActual) => ({
  ...(await importActual<typeof import('@/app/data/transcribe-clip-service')>()),
  transcribeClip: (...a: unknown[]) => transcribeClip(...a),
}));

import { Composer } from '@/app/pages/chat/Composer';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { VoiceNoteError } from '@/app/data/chat-voice-service';
import { TranscribeClipError } from '@/app/data/transcribe-clip-service';

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const nav = globalThis.navigator;
const real = { mr: (globalThis as { MediaRecorder?: unknown }).MediaRecorder, ac: (globalThis as { AudioContext?: unknown }).AudioContext };

function supportBrowser(on: boolean) {
  Object.defineProperty(nav, 'mediaDevices', { value: on ? { getUserMedia: vi.fn() } : undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = on ? vi.fn() : undefined;
  (globalThis as Record<string, unknown>).AudioContext = on ? vi.fn() : undefined;
}

type Voice = (wav: Blob) => Promise<unknown>;
function ui(draftKey: string, extra: Partial<React.ComponentProps<typeof Composer>> = {}) {
  return (
    <MemoryRouter>
      <Composer draftKey={draftKey} placeholder="Message" onSend={vi.fn()} {...extra} />
    </MemoryRouter>
  );
}
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const voiceButton = () => screen.queryByRole('button', { name: 'Record a voice message' });
const sendButton = () => screen.queryByRole('button', { name: 'Send' });
const dictateButton = () => screen.queryByRole('button', { name: 'Dictate a message' });
const sendVoiceButton = () => screen.getByRole('button', { name: 'Send voice message' });

beforeEach(() => {
  clearDraftsExcept(null);
  rec.error = null;
  rec.startRecording.mockReset().mockResolvedValue(true);
  rec.stopRecording.mockReset().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
  transcribeClip.mockReset().mockResolvedValue('spoken words');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  supportBrowser(true);
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = real.mr;
  (globalThis as Record<string, unknown>).AudioContext = real.ac;
});

async function record() {
  await act(async () => { fireEvent.click(voiceButton() as HTMLElement); });
  await flush();
}

describe('where the round voice button is', () => {
  it('an empty human composer shows it in the send slot, with no Send', () => {
    render(ui('t:a1', { onVoiceNote: vi.fn() }));
    expect(voiceButton()).toBeInTheDocument();
    expect(sendButton()).not.toBeInTheDocument();
    expect(dictateButton()).toBeInTheDocument();
  });

  it('typing swaps it for Send: never both', () => {
    render(ui('t:a2', { onVoiceNote: vi.fn() }));
    fireEvent.change(field(), { target: { value: 'hello' } });
    expect(sendButton()).toBeInTheDocument();
    expect(voiceButton()).not.toBeInTheDocument();
  });

  it('a staged attachment shows Send, not the voice button', () => {
    render(ui('t:a3', { onVoiceNote: vi.fn(), staged: { kind: 'point', id: 'p1', title: 'A point' } as never }));
    expect(voiceButton()).not.toBeInTheDocument();
    expect(sendButton()).toBeInTheDocument();
  });

  it('a sendable quote (a Clarify) shows Send, not the voice button', () => {
    render(ui('t:a4', { onVoiceNote: vi.fn(), quoteSendable: true }));
    expect(voiceButton()).not.toBeInTheDocument();
    expect(sendButton()).toBeInTheDocument();
  });

  it('a private @mirror ask has no voice button', () => {
    render(ui('t:a5', { onVoiceNote: vi.fn(), privateTo: { id: 'm', label: 'Mira', detail: 'private', mark: null } as never }));
    expect(voiceButton()).not.toBeInTheDocument();
  });

  it('a pane that passes no voice sender never shows it', () => {
    render(ui('t:a6'));
    expect(voiceButton()).not.toBeInTheDocument();
    expect(dictateButton()).toBeInTheDocument();
  });

  it('a browser that cannot record has no voice button and typing is untouched', () => {
    supportBrowser(false);
    render(ui('t:a7', { onVoiceNote: vi.fn() }));
    expect(voiceButton()).not.toBeInTheDocument();
    fireEvent.change(field(), { target: { value: 'typed' } });
    expect(sendButton()).toBeInTheDocument();
  });
});

describe('the recorder bar', () => {
  it('replaces the row: red dot, timer, bin and send; no field, attach, dictation mic or Send', async () => {
    render(ui('t:b1', { onVoiceNote: vi.fn(), onAttach: vi.fn() }));
    await record();
    expect(screen.getByTestId('voice-dot')).toBeInTheDocument();
    expect(screen.getByTestId('voice-timer')).toHaveTextContent('0:00');
    expect(screen.getByRole('button', { name: 'Discard voice message' })).toBeInTheDocument();
    expect(sendVoiceButton()).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(dictateButton()).not.toBeInTheDocument();
    expect(sendButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach a point or story' })).not.toBeInTheDocument();
  });

  it('the red recording dot stops pulsing for people who ask for less motion', async () => {
    render(ui('t:b0', { onVoiceNote: vi.fn() }));
    await record();
    expect(screen.getByTestId('voice-dot').className).toMatch(/animate-pulse/);
    expect(screen.getByTestId('voice-dot').className).toMatch(/motion-reduce:animate-none/);
  });

  it('the timer counts up', async () => {
    vi.useFakeTimers();
    render(ui('t:b2', { onVoiceNote: vi.fn() }));
    await record();
    await act(async () => { await vi.advanceTimersByTimeAsync(3300); });
    expect(screen.getByTestId('voice-timer')).toHaveTextContent('0:03');
  });

  it('at 2 minutes it stops and waits: the timer reads 2:00, the limit is named, and nothing is sent', async () => {
    vi.useFakeTimers();
    const onVoiceNote = vi.fn<Voice>(async () => undefined);
    render(ui('t:b3', { onVoiceNote }));
    await record();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_200); });
    await flush();
    expect(screen.getByTestId('voice-timer')).toHaveTextContent('2:00');
    expect(screen.getByText('2-min limit reached')).toBeInTheDocument();
    expect(onVoiceNote).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(sendVoiceButton()); });
    await flush();
    expect(onVoiceNote).toHaveBeenCalledTimes(1);
  });

  it('the bin discards: nothing is sent and the empty composer is back', async () => {
    const onVoiceNote = vi.fn<Voice>(async () => undefined);
    render(ui('t:b4', { onVoiceNote }));
    await record();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard voice message' })); });
    await flush();
    expect(onVoiceNote).not.toHaveBeenCalled();
    expect(voiceButton()).toBeInTheDocument();
    expect(field().value).toBe('');
  });

  it('Escape discards', async () => {
    const onVoiceNote = vi.fn<Voice>(async () => undefined);
    render(ui('t:b5', { onVoiceNote }));
    await record();
    await act(async () => { fireEvent.keyDown(sendVoiceButton(), { key: 'Escape' }); });
    await flush();
    expect(onVoiceNote).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('sending', () => {
  it('➤ sends once as audio/wav, shows a disabled spinner meanwhile, and returns to the empty composer', async () => {
    let finish!: () => void;
    const onVoiceNote = vi.fn<Voice>(() => new Promise<void>((r) => { finish = r; }));
    render(ui('t:c1', { onVoiceNote }));
    await record();
    await act(async () => { fireEvent.click(sendVoiceButton()); });
    await flush();
    expect(onVoiceNote).toHaveBeenCalledTimes(1);
    expect((onVoiceNote.mock.calls[0]?.[0] as Blob).type).toBe('audio/wav');
    expect(screen.getByRole('button', { name: 'Sending' })).toBeDisabled();
    await act(async () => { finish(); });
    await flush();
    expect(voiceButton()).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('three taps on ➤ are one send', async () => {
    const onVoiceNote = vi.fn<Voice>(() => new Promise<void>(() => undefined));
    render(ui('t:c2', { onVoiceNote }));
    await record();
    const send = sendVoiceButton();
    await act(async () => { fireEvent.click(send); fireEvent.click(send); fireEvent.click(send); });
    await flush();
    expect(onVoiceNote).toHaveBeenCalledTimes(1);
  });
});

describe('failure keeps the clip', () => {
  async function failFirst(error: unknown) {
    const onVoiceNote = vi.fn<Voice>().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    render(ui('t:d1', { onVoiceNote }));
    await record();
    await act(async () => { fireEvent.click(sendVoiceButton()); });
    await flush();
    return onVoiceNote;
  }

  it('a rate limit says so in plain words, with Retry and Discard', async () => {
    await failFirst(new VoiceNoteError('rate', 429, 'x'));
    expect(screen.getByRole('alert')).toHaveTextContent('Too many voice messages. Wait a minute and try again.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard voice message' })).toBeInTheDocument();
  });

  it('Retry sends the SAME clip and the bar closes', async () => {
    const onVoiceNote = await failFirst(new VoiceNoteError('failed', 500, 'x'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await flush();
    expect(onVoiceNote).toHaveBeenCalledTimes(2);
    expect(onVoiceNote.mock.calls[1]?.[0]).toBe(onVoiceNote.mock.calls[0]?.[0]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(voiceButton()).toBeInTheDocument();
  });

  it('Discard gives the empty composer back', async () => {
    await failFirst(new VoiceNoteError('failed', 500, 'x'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard voice message' })); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(voiceButton()).toBeInTheDocument();
  });

  it('a clip the server will never take offers no Retry', async () => {
    await failFirst(new VoiceNoteError('forbidden', 403, 'x'));
    expect(screen.getByRole('alert')).toHaveTextContent("You can't send voice messages in this chat.");
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});

describe('a recording belongs to its chat', () => {
  it('switching chat mid-recording discards it: nothing is sent and the other chat is normal', async () => {
    const onVoiceNote = vi.fn<Voice>(async () => undefined);
    const { rerender } = render(ui('t:e1', { onVoiceNote }));
    await record();
    rerender(ui('t:e2', { onVoiceNote }));
    await flush();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(voiceButton()).toBeInTheDocument();
    expect(onVoiceNote).not.toHaveBeenCalled();
  });

  it('a send still in flight does not take over the chat the person moved to', async () => {
    const onVoiceNote = vi.fn<Voice>(() => new Promise<void>(() => undefined));
    const { rerender } = render(ui('t:e3', { onVoiceNote }));
    await record();
    await act(async () => { fireEvent.click(sendVoiceButton()); });
    await flush();
    rerender(ui('t:e4', { onVoiceNote }));
    await flush();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sending' })).not.toBeInTheDocument();
    expect(voiceButton()).toBeDisabled();
  });
});

describe('dictation and voice notes never run together', () => {
  it('while dictating, the voice button is gone', async () => {
    render(ui('t:f1', { onVoiceNote: vi.fn() }));
    await act(async () => { fireEvent.click(dictateButton() as HTMLElement); });
    await flush();
    expect(voiceButton()).not.toBeInTheDocument();
  });

  it('while the dictation permission prompt is open, the voice button is disabled', async () => {
    rec.startRecording.mockImplementation(() => new Promise<boolean>(() => undefined));
    render(ui('t:f2', { onVoiceNote: vi.fn() }));
    await act(async () => { fireEvent.click(dictateButton() as HTMLElement); });
    expect(voiceButton()).toBeDisabled();
  });

  it('while the voice permission prompt is open, the dictation mic is disabled', async () => {
    rec.startRecording.mockImplementation(() => new Promise<boolean>(() => undefined));
    render(ui('t:f3', { onVoiceNote: vi.fn() }));
    await act(async () => { fireEvent.click(voiceButton() as HTMLElement); });
    expect(dictateButton()).toBeDisabled();
  });

  it('a denied microphone shows a message under the field and typing still works', async () => {
    rec.error = 'Microphone access denied. Please allow microphone access to record.';
    rec.startRecording.mockResolvedValue(false);
    render(ui('t:f4', { onVoiceNote: vi.fn() }));
    await record();
    expect(screen.getByRole('status')).toHaveTextContent(/Microphone access denied/);
    fireEvent.change(field(), { target: { value: 'still typing' } });
    expect(sendButton()).toBeInTheDocument();
  });
});

describe('the failure bar can always be left', () => {
  async function failWith(error: unknown) {
    const onVoiceNote = vi.fn<Voice>().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    render(ui('t:g1', { onVoiceNote }));
    await record();
    await act(async () => { fireEvent.click(sendVoiceButton()); });
    await flush();
    return onVoiceNote;
  }

  it('Escape dismisses a retryable failure: the clip is dropped and the field is back', async () => {
    await failWith(new VoiceNoteError('failed', 500, 'x'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(voiceButton()).toBeInTheDocument();
  });

  it('a final failure shows the message with ONLY Discard; Escape and Discard both return to the field', async () => {
    await failWith(new VoiceNoteError('unsupported', 422, 'x'));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Voice messages aren't available in this chat.");
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard voice message' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }); });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('a final failure with a button press: Discard brings the field back', async () => {
    await failWith(new VoiceNoteError('forbidden', 403, 'x'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard voice message' })); });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('the recorder bar for assistive technology and at 320 px', () => {
  it('announces the limit once it is reached (a status region), but not the ticking timer', async () => {
    vi.useFakeTimers();
    render(ui('t:g2', { onVoiceNote: vi.fn() }));
    await record();
    expect(screen.getByTestId('voice-timer').closest('[role="status"]')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_200); });
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('2-min limit reached');
  });

  it('the limit line is allowed to wrap rather than being cut mid-word on a narrow screen', async () => {
    vi.useFakeTimers();
    render(ui('t:g3', { onVoiceNote: vi.fn() }));
    await record();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_200); });
    await flush();
    expect(screen.getByText('2-min limit reached').className).not.toMatch(/truncate/);
  });
});

describe('a failure looks like a failure, and its buttons are buttons', () => {
  async function failed() {
    const onVoiceNote = vi.fn<Voice>().mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'x'));
    render(ui('t:h1', { onVoiceNote }));
    await record();
    await act(async () => { fireEvent.click(sendVoiceButton()); });
    await flush();
  }

  it('the message is in the chat\'s error colour with an icon, not neutral grey', async () => {
    await failed();
    const alert = screen.getByRole('alert');
    const message = within(alert).getByText("Couldn't send the voice message.");
    expect(message.closest('p')?.className).toMatch(/\btext-red-700\b/);
    expect(message.closest('p')?.className).not.toMatch(/amber|orange|yellow|purple/);
    expect(alert.querySelector('svg')).not.toBeNull();
  });

  it('Retry is the default Button (the one blue, no hand-typed colour), Discard is an outline Button; both at least 40px tall, in a row under the message', async () => {
    await failed();
    const retry = screen.getByRole('button', { name: 'Retry' });
    const discard = screen.getByRole('button', { name: 'Discard voice message' });
    for (const b of [retry, discard]) expect(b.className).toMatch(/\bmin-h-10\b/);
    expect(retry.className).toMatch(/\bbg-blue-600\b/); // from the variant, per the Button Decision Rules
    expect(retry.className).not.toMatch(/text-blue-|font-semibold/); // never hand-typed (P1568)
    expect(discard.className).toMatch(/\bborder\b/);
    expect(discard.className).not.toMatch(/text-(red|blue)-/);
    const alert = screen.getByRole('alert');
    expect(retry.parentElement).not.toBe(within(alert).getByText("Couldn't send the voice message.").closest('p'));
  });

  it('dictation failures and "too long" notices wear the same treatment', async () => {
    transcribeClip.mockRejectedValueOnce(new TranscribeClipError('Transcription failed', 502));
    render(ui('t:h2'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dictate a message' })); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Finish dictation' })); });
    await flush();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/Couldn.t transcribe/).closest('p')?.className).toMatch(/\btext-red-700\b/);
    expect(alert.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' }).className).toMatch(/\bmin-h-10\b/);
  });
});
