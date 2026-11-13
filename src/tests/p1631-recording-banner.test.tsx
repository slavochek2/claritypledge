/**
 * @file p1631-recording-banner.test.tsx
 * @description P1631: the Clarify button on the live recording banner shows only when drafting is on (exactly true), the capture has a room and a chat, and it is
 * capturing or paused; pressing it calls the service with the room; the Mirror root of a recording reads "Recording · up to HH:MM".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseRoomCapture = vi.fn();
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => mockUseRoomCapture(),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false }),
}));

const startRecordingClarify = vi.fn();
vi.mock('@/app/data/clarify-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/clarify-service')>()),
  startRecordingClarify: (...a: unknown[]) => startRecordingClarify(...a),
  getClarifyAvailability: () => Promise.resolve(null),
}));
const toast = vi.fn();
vi.mock('sonner', () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: vi.fn() }) }));

import { RoomCaptureBar } from '@/app/components/session/room-capture-bar';
import { RECORDING_NOTHING_YET_TOAST, recordingRootLine } from '@/app/components/session/capture-copy';
import { seedClarifyAvailability } from '@/app/pages/chat/use-clarify-availability';
import { mapForwardSnapshot } from '@/app/data/chat-snapshot';

function state(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'capturing', roomId: 'r1', conversationId: 'c1', open: vi.fn(), endMyCapture: vi.fn(),
    manualPaused: true, pauseMine: vi.fn(), resumeMine: vi.fn(),
    subscribeLevel: () => () => {}, inputSilent: false, micLost: false, micSwitched: false, stopping: false, pausedByLiveRecord: false, reconnectMic: vi.fn(),
    ...overrides,
  };
}
const draw = () => render(<MemoryRouter><RoomCaptureBar /></MemoryRouter>);
const button = () => screen.queryByRole('button', { name: 'Clarify' });

beforeEach(() => {
  mockUseRoomCapture.mockReset();
  startRecordingClarify.mockReset();
  toast.mockReset();
  seedClarifyAvailability(true);
});

describe('P1631: Clarify on the recording banner', () => {
  it('shows while capturing, and while paused, when drafting is on and the capture has a room and a chat', () => {
    mockUseRoomCapture.mockReturnValue(state());
    const { unmount } = draw();
    expect(button()).toBeInTheDocument();
    unmount();
    mockUseRoomCapture.mockReturnValue(state({ phase: 'paused' }));
    draw();
    expect(button()).toBeInTheDocument();
  });

  it('wears the word "Clarify" beside the Mirror icon from 640 px up, and keeps the name on the button for narrow phones', () => {
    mockUseRoomCapture.mockReturnValue(state());
    render(<MemoryRouter><RoomCaptureBar short /></MemoryRouter>); // the short bar is the form on every ordinary page
    const label =screen.getByTestId('room-capture-bar-clarify-label');
    expect(label).toHaveTextContent('Clarify');
    expect(label.className).toContain('sm:inline');
    expect(label.className).toContain('hidden');
    const btn = button()!;
    expect(btn).toHaveAttribute('title', 'Clarify');
    expect(btn.className).toContain('h-10');
    expect(btn.className).not.toContain('bg-blue-600');
  });

  it('below 360 px the short bar tightens so every control fits: dot for the word (text kept), no meter, tighter padding and gaps; pause, Clarify, stop and open all stay', () => {
    mockUseRoomCapture.mockReturnValue(state());
    render(<MemoryRouter><RoomCaptureBar short /></MemoryRouter>);
    const bar = screen.getByTestId('room-capture-bar');
    expect(bar.className).toContain('max-[359px]:px-2');
    expect(screen.getByTestId('room-capture-bar-row').className).toContain('max-[359px]:gap-1');
    const dot = screen.getByTestId('room-capture-bar-dot');
    expect(dot.className).toContain('hidden');
    expect(dot.className).toContain('max-[359px]:inline-block');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    // the word is still in the DOM for assistive tech, screen-reader-only when narrow
    const word = screen.getByTestId('room-capture-bar-row').querySelector('span.shrink-0.max-\\[359px\\]\\:sr-only');
    expect(word).not.toBeNull();
    expect((word!.textContent ?? '').trim().length).toBeGreaterThan(0);
    expect(screen.getByTestId('room-capture-bar-meter').className).toContain('max-[359px]:hidden');
    for (const name of ['Pause', 'Clarify', 'Stop transcribing', 'Open the room']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it.each([
    ['availability is null (not known yet)', () => seedClarifyAvailability(null), {}],
    ['availability is false', () => seedClarifyAvailability(false), {}],
    ['there is no chat (conversationId null)', () => {}, { conversationId: null }],
    ['there is no room id', () => {}, { roomId: null }],
    ['the capture is stalled', () => {}, { phase: 'stalled' }],
    ['another tab holds the microphone (observing)', () => {}, { phase: 'observing' }],
  ])('is hidden when %s', (_name, arrange, overrides) => {
    arrange();
    mockUseRoomCapture.mockReturnValue(state(overrides));
    draw();
    expect(button()).toBeNull();
  });

  it('is not in the offline bar', async () => {
    vi.resetModules();
    vi.doMock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: true }) }));
    const { RoomCaptureBar: Offline } = await import('@/app/components/session/room-capture-bar');
    mockUseRoomCapture.mockReturnValue(state());
    render(<MemoryRouter><Offline /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Clarify' })).toBeNull();
    vi.doUnmock('@/app/contexts/offline-status-context');
  });

  it('pressing it asks the service for this room, once, and is disabled while the call is in flight', async () => {
    let finish: (v: unknown) => void = () => {};
    startRecordingClarify.mockReturnValue(new Promise((r) => { finish = r; }));
    mockUseRoomCapture.mockReturnValue(state());
    draw();
    fireEvent.click(button()!);
    fireEvent.click(button()!);
    expect(startRecordingClarify).toHaveBeenCalledTimes(1);
    expect(startRecordingClarify).toHaveBeenCalledWith('r1');
    await waitFor(() => expect(button()).toBeDisabled());
    finish({ status: 'busy' });
    await waitFor(() => expect(button()).not.toBeDisabled());
  });

  it("answers 'Nothing recorded yet' when nothing is in the read set", async () => {
    startRecordingClarify.mockResolvedValue({ status: 'empty' });
    mockUseRoomCapture.mockReturnValue(state());
    draw();
    fireEvent.click(button()!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(RECORDING_NOTHING_YET_TOAST));
    expect(RECORDING_NOTHING_YET_TOAST).toBe('Nothing recorded yet');
  });
});

describe('P1631: the Mirror root of a recording', () => {
  it('maps a recording snapshot and reads "Recording · up to HH:MM" in local time', () => {
    const iso = '2026-11-13T09:05:00.000Z';
    const snap = mapForwardSnapshot({ scope: 'recording', conversation_kind: 'event', conversation_title: 'x', recording_until: iso, created_at: iso });
    expect(snap?.scope).toBe('recording');
    expect(snap?.recordingUntil).toBe(iso);
    const d = new Date(iso);
    const two = (n: number) => String(n).padStart(2, '0');
    expect(recordingRootLine(iso)).toBe(`Recording · up to ${two(d.getHours())}:${two(d.getMinutes())}`);
    expect(recordingRootLine(null)).toBe('Recording');
  });
});
