/**
 * P1576 Part B: the voice bubble. The signed URL service and the audio element are stubbed; what a
 * reader sees is real: the URL is fetched on first play (never on render) and reused until it could
 * have expired, a gone recording reads "Audio expired" without being an error, and the transcript
 * line is honest about pending, failed and stale states.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAudio, ChatMessage } from '@/app/data/chat-mappers';

const playback = vi.hoisted(() => ({ getVoicePlaybackUrl: vi.fn() }));
vi.mock('@/app/data/chat-voice-service', async (importActual) => ({
  ...(await importActual<typeof import('@/app/data/chat-voice-service')>()),
  getVoicePlaybackUrl: (...a: unknown[]) => playback.getVoicePlaybackUrl(...a),
}));

import { VoiceBubble } from '@/app/pages/chat/VoiceBubble';
import { TRANSCRIPT_STALE_MS } from '@/app/pages/chat/voice-view';
import { URL_REUSE_MS } from '@/hooks/use-voice-player';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  static failPlays = 0;
  /** The next N play() calls stay pending until released: a browser still buffering. */
  static deferPlays = 0;
  releasePlay: (() => void) | null = null;
  /** Every deferred play() not yet settled, oldest first. */
  pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  constructor() {
    super();
    FakeAudio.instances.push(this);
  }
  play() {
    this.playCalls++;
    if (FakeAudio.failPlays > 0) {
      FakeAudio.failPlays--;
      return Promise.reject(new Error('NotAllowedError'));
    }
    if (FakeAudio.deferPlays > 0) {
      FakeAudio.deferPlays--;
      return new Promise<void>((resolve, reject) => {
        this.releasePlay = () => {
          this.paused = false;
          resolve();
        };
        this.pending.push({ resolve: () => { this.paused = false; resolve(); }, reject });
      });
    }
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.pauseCalls++;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  removeAttribute() {
    this.src = '';
  }
  load() {}
}
const realAudio = (globalThis as { Audio?: unknown }).Audio;

/** Lets every promise chain in the player settle (a fetch, a play(), the retry loop), without counting ticks. */
const flush = () => act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); });
const duration = () => screen.getByTestId('voice-duration');
const progress = () => screen.getByRole('slider', { name: 'Seek voice message' });
const filledCount = () => screen.getAllByTestId('voice-wave-bar').filter((b) => b.dataset.filled === 'true').length;
const audio = (over: Partial<ChatAudio> = {}): ChatAudio => ({ durationMs: 5000, transcript: null, transcriptStatus: 'pending', hasAudio: true, audioWaveform: null, ...over });
const note = (a: Partial<ChatAudio> = {}, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'v1', conversationId: 'c1', authorId: 'user-id-1234', body: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
  isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null,
  kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, audio: audio(a), ...over,
});
const play = () => screen.getByRole('button', { name: /^(Play|Pause) voice message$|^Stop loading voice message$/ });
const last = () => FakeAudio.instances[FakeAudio.instances.length - 1] as FakeAudio;

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.failPlays = 0;
  FakeAudio.deferPlays = 0;
  (globalThis as Record<string, unknown>).Audio = FakeAudio;
  playback.getVoicePlaybackUrl.mockReset().mockResolvedValue('https://storage.googleapis.com/bucket/obj?sig=1');
});
afterEach(() => {
  vi.useRealTimers();
  (globalThis as Record<string, unknown>).Audio = realAudio;
});

describe('the player', () => {
  it('shows play and the length, and fetches nothing until the first tap', () => {
    render(<VoiceBubble msg={note()} />);
    expect(play()).toHaveAccessibleName('Play voice message');
    expect(play().className).toMatch(/\bh-10\b/); // >= 40px touch target
    expect(duration()).toHaveTextContent(/^0:05$/);
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
    expect(playback.getVoicePlaybackUrl).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('the first tap fetches the URL once for THIS message and plays it; the button becomes Pause', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledExactlyOnceWith('v1');
    expect(last().src).toBe('https://storage.googleapis.com/bucket/obj?sig=1');
    expect(last().playCalls).toBe(1);
    expect(play()).toHaveAccessibleName('Pause voice message');
  });

  it('pause and resume reuse the URL: one fetch in total', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    await act(async () => { fireEvent.click(play()); });
    expect(last().paused).toBe(true);
    expect(play()).toHaveAccessibleName('Play voice message');
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(1);
    expect(last().playCalls).toBe(2);
  });

  it('shows the position while playing, and a finished clip goes back to the start', async () => {
    render(<VoiceBubble msg={note({ durationMs: 65_000 })} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    last().currentTime = 12.4;
    await act(async () => { last().dispatchEvent(new Event('timeupdate')); });
    expect(duration()).toHaveTextContent(/^0:12$/);
    expect(progress()).toHaveAttribute('aria-valuenow', '12'); // 12.4 s, in seconds
    expect(filledCount()).toBe(9); // 12.4 s of 65 s is 9.5 of 50 bars: the bars before the playhead are filled
    await act(async () => { last().dispatchEvent(new Event('ended')); });
    expect(play()).toHaveAccessibleName('Play voice message');
    expect(last().currentTime, 'the clip is rewound').toBe(0);
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
    expect(filledCount()).toBe(0);
    // Back at the start, the length shows again: nothing is left at 0:12.
    expect(duration()).toHaveTextContent(/^1:05$/);
  });

  it('the URL constant is the 90 seconds the server link allows for (the link lives 2 minutes)', () => {
    expect(URL_REUSE_MS).toBe(90_000);
  });

  async function replayAfter(ms: number) {
    vi.useFakeTimers();
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    last().currentTime = 3;
    await act(async () => { fireEvent.click(play()); }); // pause
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    playback.getVoicePlaybackUrl.mockResolvedValue('https://storage.googleapis.com/bucket/obj?sig=2');
    await act(async () => { fireEvent.click(play()); });
    await flush();
  }

  it('one millisecond before the limit the URL is still reused: one fetch, same link', async () => {
    await replayAfter(URL_REUSE_MS - 1);
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(1);
    expect(last().src).toContain('sig=1');
    expect(play()).toHaveAccessibleName('Pause voice message');
  });

  it('at the limit the URL is fetched again, and playback resumes where it was', async () => {
    await replayAfter(URL_REUSE_MS);
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(2);
    expect(last().src).toContain('sig=2');
    expect(last().currentTime).toBe(3);
    expect(play()).toHaveAccessibleName('Pause voice message');
  });

  it('a link that dies mid-play (403 after expiry) is refetched ONCE by itself and playback carries on', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    last().currentTime = 4;
    playback.getVoicePlaybackUrl.mockResolvedValue('https://storage.googleapis.com/bucket/obj?sig=3');
    await act(async () => { last().dispatchEvent(new Event('error')); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(2);
    expect(last().src).toContain('sig=3');
    expect(last().currentTime).toBe(4);
    expect(screen.queryByText(/Couldn.t play/)).not.toBeInTheDocument();
    expect(play()).toHaveAccessibleName('Pause voice message');
  });

  it('a second failure with no playback in between is NOT retried again: it says so, and a tap tries afresh', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    await act(async () => { last().dispatchEvent(new Event('error')); });
    await flush();
    await act(async () => { last().dispatchEvent(new Event('error')); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Couldn.t play/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/Couldn.t play/)).not.toBeInTheDocument();
  });

  it('once playback has progressed, a later failure earns its own automatic refetch', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    await act(async () => { last().dispatchEvent(new Event('error')); });
    await flush();
    await act(async () => { last().dispatchEvent(new Event('timeupdate')); }); // it played on
    await act(async () => { last().dispatchEvent(new Event('error')); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(3);
  });

  it('a paused note never starts playing by itself when its old link fails later', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    await act(async () => { fireEvent.click(play()); }); // pause
    await act(async () => { last().dispatchEvent(new Event('error')); }); // the stale link dies in the background
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(1);
    expect(play()).toHaveAccessibleName('Play voice message');
    expect(screen.queryByText(/Couldn.t play/)).not.toBeInTheDocument();
    playback.getVoicePlaybackUrl.mockResolvedValue('https://storage.googleapis.com/bucket/obj?sig=9');
    await act(async () => { fireEvent.click(play()); }); // the next Play asks for a fresh link
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(2);
    expect(last().src).toContain('sig=9');
  });

  it('a recovery fetch that finds the recording gone reads Audio expired', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    playback.getVoicePlaybackUrl.mockResolvedValue(null);
    await act(async () => { last().dispatchEvent(new Event('error')); });
    await flush();
    expect(screen.getByText('Audio expired')).toBeInTheDocument();
  });

  it('a failed URL fetch says so and the next tap tries again', async () => {
    playback.getVoicePlaybackUrl.mockRejectedValueOnce(new Error('network'));
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(screen.getByText(/Couldn.t play/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(2);
    expect(play()).toHaveAccessibleName('Pause voice message');
  });

  it('a recording the server says is gone (null URL) reads Audio expired, not an error, and the play control goes away', async () => {
    playback.getVoicePlaybackUrl.mockResolvedValue(null);
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(screen.getByText('Audio expired')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn.t play/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /voice message$/ })).not.toBeInTheDocument();
  });

  it('retention already removed the audio: Audio expired from the start with NO play control at all (no dead button), nothing fetched, transcript still offered', () => {
    render(<VoiceBubble msg={note({ hasAudio: false, transcriptStatus: 'done', transcript: 'what was said' })} />);
    expect(screen.getByText('Audio expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /(Play|Pause|Stop loading) voice message/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(duration()).toHaveTextContent(/^0:05$/);
    expect(playback.getVoicePlaybackUrl).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Show transcript' })).toBeInTheDocument();
  });

  it('only one voice note plays at a time', async () => {
    render(<><VoiceBubble msg={note({}, { id: 'a' })} /><VoiceBubble msg={note({}, { id: 'b' })} /></>);
    const [first, second] = screen.getAllByRole('button', { name: 'Play voice message' }) as [HTMLElement, HTMLElement];
    await act(async () => { fireEvent.click(first); });
    await flush();
    const a = last();
    await act(async () => { fireEvent.click(second); });
    await flush();
    expect(a.paused).toBe(true);
    expect(last()).not.toBe(a);
    expect(last().paused).toBe(false);
    expect(first).toHaveAccessibleName('Play voice message');
    expect(second).toHaveAccessibleName('Pause voice message');
  });

  it('leaving the page stops the sound', async () => {
    const view = render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    const el = last();
    view.unmount();
    expect(el.paused).toBe(true);
  });
});

describe('the waveform progress and its states', () => {
  it('never reads past 100% when the position runs over the length, and is exact on the way', async () => {
    render(<VoiceBubble msg={note({ durationMs: 10_000 })} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    last().currentTime = 2.5;
    await act(async () => { last().dispatchEvent(new Event('timeupdate')); });
    expect(progress()).toHaveAttribute('aria-valuenow', '2'); // 2.5 s floors to 2, as the clock does
    expect(filledCount()).toBe(12); // a quarter of 50 bars
    last().currentTime = 14; // the element runs a little past the stored length
    await act(async () => { last().dispatchEvent(new Event('timeupdate')); });
    expect(progress()).toHaveAttribute('aria-valuenow', '10'); // clamped to the length
    expect(filledCount()).toBe(50);
    expect(duration()).toHaveTextContent(/^0:14$/);
  });

  it('a stored length of zero cannot divide by zero: the bar stays at 0', async () => {
    render(<VoiceBubble msg={note({ durationMs: 0 })} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    last().currentTime = 3;
    await act(async () => { last().dispatchEvent(new Event('timeupdate')); });
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
    expect(filledCount()).toBe(0);
  });

  it('the Play button says it is busy only while a start is pending', async () => {
    render(<VoiceBubble msg={note()} />);
    expect(play()).not.toHaveAttribute('aria-busy');
    FakeAudio.deferPlays = 1;
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(play()).toHaveAttribute('aria-busy', 'true');
    await act(async () => { last().pending[0]?.resolve(); });
    await flush();
    expect(play()).toHaveAccessibleName('Pause voice message');
    expect(play()).not.toHaveAttribute('aria-busy');
    await act(async () => { fireEvent.click(play()); }); // paused
    expect(play()).not.toHaveAttribute('aria-busy');
  });
});

describe('the player and its neighbours', () => {
  it('the error line points at the Play button, which is the thing to tap', async () => {
    playback.getVoicePlaybackUrl.mockRejectedValueOnce(new Error('network'));
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(screen.getByText("Couldn't play. Tap play to try again.")).toBeInTheDocument();
  });

  it('one rejected play() on a first start is retried once with a fresh link, and then plays', async () => {
    render(<VoiceBubble msg={note()} />);
    FakeAudio.failPlays = 1;
    playback.getVoicePlaybackUrl.mockResolvedValueOnce('https://storage.googleapis.com/bucket/obj?sig=a').mockResolvedValueOnce('https://storage.googleapis.com/bucket/obj?sig=b');
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(2);
    expect(last().src).toContain('sig=b');
    expect(last().playCalls).toBe(2);
    expect(last().paused).toBe(false);
    expect(play()).toHaveAccessibleName('Pause voice message');
    expect(screen.queryByText(/Couldn.t play/)).not.toBeInTheDocument();
  });

  it('a note that fails to START does not take over from the one still playing', async () => {
    render(<><VoiceBubble msg={note({}, { id: 'a' })} /><VoiceBubble msg={note({}, { id: 'b' })} /></>);
    const [first, second] = screen.getAllByRole('button', { name: 'Play voice message' }) as [HTMLElement, HTMLElement];
    await act(async () => { fireEvent.click(first); });
    await flush();
    const a = last();
    FakeAudio.failPlays = 2; // the try and its one automatic retry
    await act(async () => { fireEvent.click(second); });
    await flush();
    expect(a.paused, 'the first note was not paused by a second that never started').toBe(false);
    expect(a.pauseCalls, 'it was not even asked to pause').toBe(0);
    expect(first).toHaveAccessibleName('Pause voice message');
    expect(second).toHaveAccessibleName('Play voice message');
    expect(screen.getAllByText(/Couldn.t play/)).toHaveLength(1); // only the one that failed says so
  });

  it('after a note failed to start, the next one still pauses the one that IS playing', async () => {
    render(<><VoiceBubble msg={note({}, { id: 'a' })} /><VoiceBubble msg={note({}, { id: 'b' })} /><VoiceBubble msg={note({}, { id: 'c' })} /></>);
    const [one, two, three] = screen.getAllByRole('button', { name: 'Play voice message' }) as [HTMLElement, HTMLElement, HTMLElement];
    await act(async () => { fireEvent.click(one); });
    await flush();
    const a = last();
    FakeAudio.failPlays = 2;
    await act(async () => { fireEvent.click(two); });
    await flush();
    await act(async () => { fireEvent.click(three); });
    await flush();
    expect(a.paused, 'the first note, still playing, is paused when a third starts').toBe(true);
    expect(one).toHaveAccessibleName('Play voice message');
    expect(two).toHaveAccessibleName('Play voice message');
    expect(three).toHaveAccessibleName('Pause voice message');
  });

  it('two notes whose play() is still pending: the one tapped LAST ends up playing, whichever resolves first', async () => {
    render(<><VoiceBubble msg={note({}, { id: 'a' })} /><VoiceBubble msg={note({}, { id: 'b' })} /></>);
    const [one, two] = screen.getAllByRole('button', { name: 'Play voice message' }) as [HTMLElement, HTMLElement];
    FakeAudio.deferPlays = 2;
    await act(async () => { fireEvent.click(one); });
    await flush();
    const a = last();
    await act(async () => { fireEvent.click(two); });
    await flush();
    const b = last();
    expect(a).not.toBe(b);
    await act(async () => { b.releasePlay?.(); });
    await flush();
    await act(async () => { a.releasePlay?.(); }); // the first-tapped one resolves AFTER the later one
    await flush();
    expect(b.paused, 'the later note keeps playing').toBe(false);
    expect(a.paused, 'the earlier one, resolving late, steps aside').toBe(true);
    expect(one, 'the earlier bubble reads as paused').toHaveAccessibleName('Play voice message');
    expect(two, 'the later bubble reads as playing').toHaveAccessibleName('Pause voice message');
  });

  it('and the other way round: the earlier one resolves first, then the later one takes over', async () => {
    render(<><VoiceBubble msg={note({}, { id: 'a' })} /><VoiceBubble msg={note({}, { id: 'b' })} /></>);
    const [one, two] = screen.getAllByRole('button', { name: 'Play voice message' }) as [HTMLElement, HTMLElement];
    FakeAudio.deferPlays = 2;
    await act(async () => { fireEvent.click(one); });
    await flush();
    const a = last();
    await act(async () => { fireEvent.click(two); });
    await flush();
    const b = last();
    await act(async () => { a.releasePlay?.(); });
    await flush();
    await act(async () => { b.releasePlay?.(); });
    await flush();
    expect(a.paused).toBe(true);
    expect(b.paused).toBe(false);
    expect(one).toHaveAccessibleName('Play voice message');
    expect(two).toHaveAccessibleName('Pause voice message');
  });

  it('a note still starting is not paused by a later one that FAILED to start', async () => {
    render(<><VoiceBubble msg={note({}, { id: 'a' })} /><VoiceBubble msg={note({}, { id: 'b' })} /></>);
    const [one, two] = screen.getAllByRole('button', { name: 'Play voice message' }) as [HTMLElement, HTMLElement];
    FakeAudio.deferPlays = 1;
    await act(async () => { fireEvent.click(one); });
    await flush();
    const a = last();
    FakeAudio.failPlays = 2;
    await act(async () => { fireEvent.click(two); });
    await flush();
    await act(async () => { a.releasePlay?.(); });
    await flush();
    expect(a.paused, 'the earlier note carries on: the later one never started').toBe(false);
    expect(a.pauseCalls).toBe(0);
    expect(one).toHaveAccessibleName('Pause voice message');
    expect(two).toHaveAccessibleName('Play voice message');
  });

  it('Play, then Pause while play() is still pending, then Play again: the pause lands, and the next Play works', async () => {
    render(<VoiceBubble msg={note()} />);
    FakeAudio.deferPlays = 1;
    await act(async () => { fireEvent.click(play()); });
    await flush();
    const el = last();
    expect(play()).toHaveAccessibleName('Stop loading voice message');
    expect(play()).toBeEnabled(); // the start can be stopped

    await act(async () => { fireEvent.click(play()); }); // a pause during the pending start
    expect(el.paused).toBe(true);
    expect(play()).toHaveAccessibleName('Play voice message');

    await act(async () => { fireEvent.click(play()); }); // Play again: must not be swallowed by the pending first attempt
    await flush();
    expect(el.playCalls).toBe(2);
    expect(play()).toHaveAccessibleName('Pause voice message');
    expect(el.paused).toBe(false);

    // The first, abandoned play() finally settles. It must change nothing.
    const pausesBefore = el.pauseCalls;
    await act(async () => { el.pending[0]?.resolve(); });
    await flush();
    expect(el.pauseCalls, 'the late first attempt neither pauses nor resumes anything').toBe(pausesBefore);
    expect(el.playCalls).toBe(2);
    expect(play()).toHaveAccessibleName('Pause voice message');
    expect(el.paused, 'the late first attempt does not pause the second').toBe(false);

    await act(async () => { fireEvent.click(play()); });
    expect(el.paused).toBe(true);
    expect(play()).toHaveAccessibleName('Play voice message');
  });

  it('the same sequence when the browser REJECTS the abandoned play() (AbortError): no error is shown and the next Play works', async () => {
    render(<VoiceBubble msg={note()} />);
    FakeAudio.deferPlays = 1;
    await act(async () => { fireEvent.click(play()); });
    await flush();
    const el = last();
    await act(async () => { fireEvent.click(play()); }); // pause
    await act(async () => { el.pending[0]?.reject(new Error('AbortError')); });
    await flush();
    expect(screen.queryByText(/Couldn.t play/)).not.toBeInTheDocument();
    expect(play()).toHaveAccessibleName('Play voice message');
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(play()).toHaveAccessibleName('Pause voice message');
  });

  it('an abandoned start that settles late does not clear the mark of the start that replaced it: a failure event during the replacement leaves the cached link alone', async () => {
    render(<VoiceBubble msg={note()} />);
    FakeAudio.deferPlays = 2;
    await act(async () => { fireEvent.click(play()); }); // start 1, pending (the link is fetched and cached)
    await flush();
    const el = last();
    await act(async () => { fireEvent.click(play()); }); // stop it
    await act(async () => { fireEvent.click(play()); }); // start 2, pending, on the cached link
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(1);
    await act(async () => { el.pending[0]?.reject(new Error('AbortError')); }); // start 1 settles while start 2 is still pending
    await flush();
    await act(async () => { el.dispatchEvent(new Event('error')); }); // the element reports a failure during start 2: start 2 owns it
    await act(async () => { el.pending[1]?.resolve(); });
    await flush();
    expect(play()).toHaveAccessibleName('Pause voice message');
    await act(async () => { fireEvent.click(play()); }); // pause
    await act(async () => { fireEvent.click(play()); }); // Play again
    await flush();
    expect(playback.getVoicePlaybackUrl, 'the link was not thrown away by an event that start 2 owns').toHaveBeenCalledTimes(1);
  });

  // Browsers following the HTML spec reject a pending play() with AbortError on pause(); this covers one that resolves it.
  it('a pause lands during a start; the abandoned play() then settles by resolving while the note is PAUSED: nothing may be left playing behind a "Play" button', async () => {
    render(<VoiceBubble msg={note()} />);
    FakeAudio.deferPlays = 1;
    await act(async () => { fireEvent.click(play()); });
    await flush();
    const el = last();
    await act(async () => { fireEvent.click(play()); }); // Stop loading
    expect(play()).toHaveAccessibleName('Play voice message');
    expect(el.paused).toBe(true);
    await act(async () => { el.pending[0]?.resolve(); }); // some browsers settle a pending play() as resolved even after pause()
    await flush();
    expect(play()).toHaveAccessibleName('Play voice message');
    expect(el.paused, 'the sound must not start behind a Play button').toBe(true);
  });

  it('a pause tapped during the URL fetch (nothing playing yet) also cancels the start; the late link plays nothing', async () => {
    let giveUrl!: (u: string) => void;
    playback.getVoicePlaybackUrl.mockImplementationOnce(() => new Promise<string>((r) => { giveUrl = r; }));
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    expect(play()).toHaveAccessibleName('Stop loading voice message');
    await act(async () => { fireEvent.click(play()); });
    expect(play()).toHaveAccessibleName('Play voice message');
    await act(async () => { giveUrl('https://storage.googleapis.com/bucket/obj?sig=late'); });
    await flush();
    expect(FakeAudio.instances, 'the late link never even built an audio element').toHaveLength(0);
    expect(play()).toHaveAccessibleName('Play voice message');
  });

  it('a bubble that is given another message stops the old sound and starts clean', async () => {
    const view = render(<VoiceBubble msg={note({}, { id: 'a' })} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    const el = last();
    expect(play()).toHaveAccessibleName('Pause voice message');
    view.rerender(<VoiceBubble msg={note({ durationMs: 9000 }, { id: 'b' })} />);
    await flush();
    expect(el.paused, 'the old message stops').toBe(true);
    expect(play()).toHaveAccessibleName('Play voice message');
    expect(duration()).toHaveTextContent(/^0:09$/);
    playback.getVoicePlaybackUrl.mockClear();
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('events from the OLD message\'s audio element change nothing on the new one', async () => {
    const view = render(<VoiceBubble msg={note({}, { id: 'a' })} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    const old = last();
    view.rerender(<VoiceBubble msg={note({ durationMs: 9000 }, { id: 'b' })} />);
    await flush();
    old.currentTime = 7;
    await act(async () => { old.dispatchEvent(new Event('timeupdate')); });
    await act(async () => { old.dispatchEvent(new Event('pause')); });
    await act(async () => { old.dispatchEvent(new Event('ended')); });
    await act(async () => { old.dispatchEvent(new Event('error')); });
    await flush();
    expect(duration()).toHaveTextContent(/^0:09$/); // no position leaked in from the old element
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
    expect(play()).toHaveAccessibleName('Play voice message');
    expect(screen.queryByText(/Couldn.t play/)).not.toBeInTheDocument();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(1); // no recovery fetch for a message that is gone
  });

  it('a note that has been closed is never asked to pause later by the next one', async () => {
    const first = render(<VoiceBubble msg={note({}, { id: 'a' })} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })); });
    await flush();
    const a = last();
    first.unmount();
    a.pauseCalls = 0;
    render(<VoiceBubble msg={note({}, { id: 'b' })} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })); });
    await flush();
    expect(a.pauseCalls, 'the closed note\'s element is left alone').toBe(0);
  });
});

describe('the transcript line', () => {
  it('pending reads Transcribing…', () => {
    render(<VoiceBubble msg={note()} />);
    expect(screen.getByText('Transcribing…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /transcript/i })).not.toBeInTheDocument();
  });

  it('Transcribing… has a small spinner so it does not read as stuck, and the spinner stands still for people who ask for less motion', () => {
    render(<VoiceBubble msg={note()} />);
    const line = screen.getByText('Transcribing…').closest('p') as HTMLElement;
    const spinner = line.querySelector('svg');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute('class')).toMatch(/animate-spin/);
    expect(spinner?.getAttribute('class')).toMatch(/motion-reduce:animate-none/);
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
  });

  it('the Show / Hide transcript toggle is at least 40px tall', () => {
    render(<VoiceBubble msg={note({ transcriptStatus: 'done', transcript: 'hello' })} />);
    expect(screen.getByRole('button', { name: 'Show transcript' }).className).toMatch(/\bmin-h-10\b/);
  });

  it('failed reads Transcript unavailable, and the audio still plays', async () => {
    render(<VoiceBubble msg={note({ transcriptStatus: 'failed' })} />);
    expect(screen.getByText('Transcript unavailable')).toBeInTheDocument();
    await act(async () => { fireEvent.click(play()); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledExactlyOnceWith('v1');
    expect(last().paused).toBe(false);
    expect(play()).toHaveAccessibleName('Pause voice message');
    expect(screen.getByText('Transcript unavailable')).toBeInTheDocument(); // playing does not change what is said about the words
  });

  it('pending for over 10 minutes reads Transcript unavailable', () => {
    const old = new Date(Date.now() - TRANSCRIPT_STALE_MS - 60_000).toISOString();
    render(<VoiceBubble msg={note({}, { createdAt: old })} />);
    expect(screen.getByText('Transcript unavailable')).toBeInTheDocument();
  });

  it('a note that goes stale while it is on screen flips by itself at the 10-minute mark', async () => {
    vi.useFakeTimers();
    render(<VoiceBubble msg={note()} />);
    expect(screen.getByText('Transcribing…')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(TRANSCRIPT_STALE_MS + 2000); });
    expect(screen.getByText('Transcript unavailable')).toBeInTheDocument();
  });

  it('done offers Show transcript, which toggles the words and says whether they are open', () => {
    render(<VoiceBubble msg={note({ transcriptStatus: 'done', transcript: 'meet at six' })} />);
    const toggle = screen.getByRole('button', { name: 'Show transcript' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('meet at six')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('meet at six')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide transcript' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Hide transcript' }));
    expect(screen.queryByText('meet at six')).not.toBeInTheDocument();
  });

  it('the transcript arriving later (a Realtime update) replaces Transcribing… without remounting the player', async () => {
    const { rerender } = render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(play()); });
    await flush();
    const el = last();
    rerender(<VoiceBubble msg={note({ transcriptStatus: 'done', transcript: 'arrived' })} />);
    expect(screen.getByRole('button', { name: 'Show transcript' })).toBeInTheDocument();
    expect(screen.queryByText('Transcribing…')).not.toBeInTheDocument();
    expect(el.paused).toBe(false); // still playing
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('a silent clip is said to be silent rather than shown as an empty transcript', () => {
    render(<VoiceBubble msg={note({ transcriptStatus: 'done', transcript: '' })} />);
    expect(screen.getByText(/No speech/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /transcript/i })).not.toBeInTheDocument();
  });
});