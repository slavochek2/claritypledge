// @vitest-environment jsdom
/**
 * P1604 (founder live test): /sessions. A transcription session opens straight on its text (one click, not two), says where the
 * text stands inside, offers Copy as a real design-system button (the one primary action), and goes Back to the list. A real
 * rounds session keeps its rounds view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const svc = vi.hoisted(() => ({ sessions: [] as unknown[] }));
const states = vi.hoisted(() => ({ next: 'processing' as string }));
const transcript = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-1' }, isLoading: false, sessionChecked: true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/data/sessions-service', () => ({ getUserSessions: vi.fn(async () => svc.sessions) }));
vi.mock('@/app/data/room-transcription-state', () => ({
  getMyRoomStates: vi.fn(async () => new Map([['room-1', { state: states.next, chatName: 'Ben' }]])),
}));
vi.mock('@/app/data/api', () => ({
  fetchRoomTranscript: vi.fn(async () => transcript.value),
  fetchSessionTranscript: vi.fn(async () => null),
  retryTranscription: vi.fn(),
}));

import { fetchRoomTranscript } from '@/app/data/api';
import { MySessionsPage } from '@/app/pages/my-sessions-page';
import { TRANSCRIPT_FAILED, TRANSCRIPT_PROCESSING } from '@/app/components/session/capture-copy';

const roomSession = (state = 'ready') => ({
  id: 's1', partnerName: 'Ada', roundCount: 0, date: '2026-11-04T10:05:00Z', sessionHistory: [], isPrivate: false,
  transcriptStatus: 'completed', roomId: 'room-1', transcriptionState: state, chatName: 'Ben',
});
const roundsSession = {
  id: 's2', partnerName: 'Pat', roundCount: 1, date: '2026-11-03T10:05:00Z', sessionHistory: [{ title: 'Round one' }],
  isPrivate: false, transcriptStatus: 'completed', roomId: null, transcriptionState: 'none', chatName: null,
};
const SAID = { source: 'final', segments: [{ speakerLabel: 'Ada', startMs: 0, text: 'hello there', alsoHeardBy: [], fromIncompleteRecording: false }] };

async function settle() { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); }

describe('/sessions: a transcription session', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.clearAllMocks(); transcript.value = SAID; states.next = 'processing'; });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  async function open(state = 'ready') {
    svc.sessions = [roomSession(state), roundsSession];
    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /open transcript in ben/i }));
    await settle();
  }

  it('one click reaches the text: no "no rounds" page in between', async () => {
    await open();
    expect(screen.getByTestId('room-transcript')).toBeTruthy();
    expect(screen.getByText('hello there')).toBeTruthy();
    expect(screen.queryByText(/no round details/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open full transcript' })).toBeNull();
    expect(screen.getByRole('heading', { name: /transcript/i })).toBeTruthy();
  });

  it('Copy is a design-system button: the filled secondary variant, 44px, on the title row (founder final look: no longer the screen\'s primary)', async () => {
    await open();
    const copy = screen.getByRole('button', { name: 'Copy transcript to clipboard' });
    expect(copy.className).toMatch(/bg-secondary/);     // the filled secondary variant
    expect(copy.className).toMatch(/min-h-11/);          // 44px touch target
    expect(copy.closest('[data-page-header]'), 'on the title row').not.toBeNull();
    const blue = Array.from(document.querySelectorAll('button')).filter((b) => /bg-blue-600/.test(b.className));
    expect(blue, 'no primary competes with it').toHaveLength(0);
  });

  it('Copy puts the text on the clipboard and says so', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await open();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy transcript to clipboard' })); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('hello there'));
    expect(screen.getByRole('status').textContent).toMatch(/copied/i);
  });

  it('Back returns to the list, not to a rounds page', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await settle();
    expect(screen.getByRole('button', { name: /open transcript in ben/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Session History' })).toBeTruthy();
  });

  it('while processing it says so inside, with the text still readable', async () => {
    await open('processing');
    expect(screen.getByText(TRANSCRIPT_PROCESSING)).toBeTruthy();
    expect(screen.getByText('hello there')).toBeTruthy();
  });

  it('a failed one says so inside, with the live text still readable', async () => {
    await open('failed');
    expect(screen.getByText(TRANSCRIPT_FAILED)).toBeTruthy();
    expect(screen.getByText('hello there')).toBeTruthy();
  });

  it('a processing one clears itself and reads the text again when it is ready (15 s poll, no faster)', async () => {
    await open('processing');
    expect(screen.getByText(TRANSCRIPT_PROCESSING)).toBeTruthy();
    const reads = vi.mocked(fetchRoomTranscript).mock.calls.length;
    states.next = 'ready';
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
    expect(screen.getByText(TRANSCRIPT_PROCESSING), 'not before the 15 s poll').toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.queryByText(TRANSCRIPT_PROCESSING)).toBeNull();
    expect(vi.mocked(fetchRoomTranscript).mock.calls.length, 'the text is read again').toBeGreaterThan(reads);
  });

  it('a ready one polls nothing', async () => {
    const { getMyRoomStates } = await import('@/app/data/room-transcription-state');
    await open('ready');
    const calls = vi.mocked(getMyRoomStates).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(vi.mocked(getMyRoomStates).mock.calls.length).toBe(calls);
  });

  it('the list row also clears when the text arrives', async () => {
    svc.sessions = [roomSession('processing')];
    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
    await settle();
    expect(screen.getByTestId('transcript-row').textContent).toContain(TRANSCRIPT_PROCESSING);
    states.next = 'ready';
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
    expect(screen.getByTestId('transcript-row').textContent).not.toContain(TRANSCRIPT_PROCESSING);
  });
});

describe('/sessions: a real rounds session keeps its rounds view', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('opens the session page with its rounds', async () => {
    svc.sessions = [roundsSession];
    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /session with pat/i }));
    await settle();
    expect(screen.getByText('Round one')).toBeTruthy();
  });
});
