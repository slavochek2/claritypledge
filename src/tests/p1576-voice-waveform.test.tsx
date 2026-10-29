/**
 * @file p1576-voice-waveform.test.tsx
 * @description P1576 Part B: the waveform bars as a seek control. The component alone (50 bars, the NULL fallback, slider
 * values, keyboard, pointer), then inside the bubble with a mocked audio element: a tap on the bars sets the element's
 * time, and on a note that was never played it loads through the usual signed-URL flow first.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatAudio, ChatMessage } from '@/app/data/chat-mappers';

const playback = vi.hoisted(() => ({ getVoicePlaybackUrl: vi.fn() }));
vi.mock('@/app/data/chat-voice-service', async (importActual) => ({
  ...(await importActual<typeof import('@/app/data/chat-voice-service')>()),
  getVoicePlaybackUrl: (...a: unknown[]) => playback.getVoicePlaybackUrl(...a),
}));

import { VoiceWaveform } from '@/app/pages/chat/VoiceWaveform';
import { VoiceBubble } from '@/app/pages/chat/VoiceBubble';

const bars = () => screen.getAllByTestId('voice-wave-bar');
const filled = () => bars().filter((b) => b.dataset.filled === 'true').length;
const slider = () => screen.getByRole('slider', { name: 'Seek voice message' });
/** A bar area 200 px wide starting at x=100: jsdom has no layout. */
function sizeSlider() {
  slider().getBoundingClientRect = () => ({ left: 100, width: 200, right: 300, top: 0, bottom: 32, height: 32, x: 100, y: 0, toJSON: () => ({}) });
}
const wave = Array.from({ length: 50 }, (_, i) => (i * 2) % 101);

describe('VoiceWaveform', () => {
  it('draws 50 purely presentational bars inside one slider', () => {
    render(<VoiceWaveform waveform={wave} durationMs={10_000} positionMs={0} onSeek={vi.fn()} />);
    expect(bars()).toHaveLength(50);
    for (const b of bars()) expect(b).toHaveAttribute('aria-hidden', 'true');
    expect(slider()).toContainElement(bars()[0] as HTMLElement);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('bar height follows the stored level, with a minimum so silence still shows', () => {
    render(<VoiceWaveform waveform={wave} durationMs={10_000} positionMs={0} onSeek={vi.fn()} />);
    const h = (i: number) => parseInt((bars()[i] as HTMLElement).style.height, 10);
    expect(h(0)).toBeGreaterThan(0); // level 0: still a dot-line
    expect(h(40)).toBeGreaterThan(h(5));
  });

  it('a NULL waveform draws 50 equal low bars', () => {
    render(<VoiceWaveform waveform={null} durationMs={10_000} positionMs={0} onSeek={vi.fn()} />);
    expect(bars()).toHaveLength(50);
    expect(new Set(bars().map((b) => (b as HTMLElement).style.height)).size).toBe(1);
  });

  it('the bars before the playhead are filled and the aria values follow the position in seconds', () => {
    const view = render(<VoiceWaveform waveform={wave} durationMs={10_000} positionMs={0} onSeek={vi.fn()} />);
    expect(slider()).toHaveAttribute('aria-valuemin', '0');
    expect(slider()).toHaveAttribute('aria-valuemax', '10');
    expect(slider()).toHaveAttribute('aria-valuenow', '0');
    expect(filled()).toBe(0);
    view.rerender(<VoiceWaveform waveform={wave} durationMs={10_000} positionMs={4_000} onSeek={vi.fn()} />);
    expect(slider()).toHaveAttribute('aria-valuenow', '4');
    expect(filled()).toBe(20);
    expect(bars()[19]).toHaveAttribute('data-filled', 'true');
    expect(bars()[20]).toHaveAttribute('data-filled', 'false');
  });

  it('←/→ seek 5 s from the current position, clamped; other keys do nothing', () => {
    const onSeek = vi.fn();
    render(<VoiceWaveform waveform={wave} durationMs={12_000} positionMs={7_000} onSeek={onSeek} />);
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(12_000);
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(onSeek).toHaveBeenLastCalledWith(2_000);
    onSeek.mockClear();
    fireEvent.keyDown(slider(), { key: 'a' });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('a pointer press seeks to its x, and a drag keeps seeking only while pressed', () => {
    const onSeek = vi.fn();
    render(<VoiceWaveform waveform={wave} durationMs={10_000} positionMs={0} onSeek={onSeek} />);
    sizeSlider();
    fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(5_000);
    fireEvent.pointerMove(slider(), { clientX: 280, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(9_000);
    fireEvent.pointerUp(slider(), { clientX: 280, pointerId: 1 });
    onSeek.mockClear();
    fireEvent.pointerMove(slider(), { clientX: 120, pointerId: 1 }); // hovering after release
    expect(onSeek).not.toHaveBeenCalled();
  });
});

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  constructor() {
    super();
    FakeAudio.instances.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  removeAttribute() {
    this.src = '';
  }
}
const realAudio = (globalThis as { Audio?: unknown }).Audio;
const flush = () => act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); });
const audio = (over: Partial<ChatAudio> = {}): ChatAudio => ({ durationMs: 10_000, transcript: null, transcriptStatus: 'done', hasAudio: true, audioWaveform: wave, ...over });
const note = (a: Partial<ChatAudio> = {}): ChatMessage => ({
  id: 'w1', conversationId: 'c1', authorId: 'user-id-1234', body: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
  isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null,
  kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, audio: audio(a),
});
const last = () => FakeAudio.instances[FakeAudio.instances.length - 1] as FakeAudio;

describe('seeking in the bubble', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    (globalThis as Record<string, unknown>).Audio = FakeAudio;
    playback.getVoicePlaybackUrl.mockReset().mockResolvedValue('https://storage.googleapis.com/bucket/obj?sig=1');
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).Audio = realAudio;
  });

  it('a note never played: tapping the bars loads it through the usual flow and starts at that time', async () => {
    render(<VoiceBubble msg={note()} />);
    sizeSlider();
    expect(playback.getVoicePlaybackUrl).not.toHaveBeenCalled();
    await act(async () => { fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1 }); });
    await flush();
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(last().src).toContain('sig=1');
    expect(last().currentTime).toBe(5); // half way along 10 s
    expect(last().paused).toBe(false);
    expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeInTheDocument();
  });

  it('while playing, a tap sets the element time directly with no new fetch', async () => {
    render(<VoiceBubble msg={note()} />);
    sizeSlider();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })); });
    await flush();
    await act(async () => { fireEvent.pointerDown(slider(), { clientX: 250, pointerId: 1 }); });
    expect(last().currentTime).toBe(7.5);
    expect(playback.getVoicePlaybackUrl).toHaveBeenCalledTimes(1);
    expect(slider()).toHaveAttribute('aria-valuenow', '7'); // floors, as the visible clock does
    expect(screen.getByTestId('voice-duration')).toHaveTextContent('0:07');
  });

  it('paused partway, a keyboard seek moves the element time and stays paused', async () => {
    render(<VoiceBubble msg={note()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })); });
    await flush();
    last().currentTime = 2;
    await act(async () => { last().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' })); });
    await act(async () => { fireEvent.keyDown(slider(), { key: 'ArrowRight' }); });
    expect(last().currentTime).toBe(7);
    expect(last().paused).toBe(true);
  });

  it('an expired note has no slider to seek', () => {
    render(<VoiceBubble msg={note({ hasAudio: false })} />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
