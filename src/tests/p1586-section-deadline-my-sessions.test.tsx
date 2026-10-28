// @vitest-environment jsdom
/**
 * P1586 invariant: both /sessions transcript views end a stalled read in a readable line with a
 * Retry, and Retry re-runs that transcript's read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const svc = vi.hoisted(() => ({ sessions: [] as unknown[] }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-1' }, isLoading: false, sessionChecked: true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/data/sessions-service', () => ({ getUserSessions: vi.fn(async () => svc.sessions) }));
vi.mock('@/app/data/api', () => ({
  fetchRoomTranscript: vi.fn(() => new Promise(() => {})),
  fetchSessionTranscript: vi.fn(() => new Promise(() => {})),
  retryTranscription: vi.fn(),
}));

import { fetchRoomTranscript, fetchSessionTranscript } from '@/app/data/api';
import { MySessionsPage } from '@/app/pages/my-sessions-page';

const DEADLINE_MS = 10_000;
const session = (roomId: string | null) => ({
  id: 'session-id-1', partnerName: 'Pat Partner', roundCount: 1, date: '2026-01-15T10:00:00Z',
  sessionHistory: [], isPrivate: false, transcriptStatus: 'completed', roomId,
});

describe('P1586 /sessions transcript deadline', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each([
    ['a session transcript', null, fetchSessionTranscript],
    ['a transcribe-room transcript', 'room-id-1', fetchRoomTranscript],
  ])('%s: fallback after the deadline, Retry reads again', async (_l, roomId, read) => {
    svc.sessions = [session(roomId)];
    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByText(/Pat Partner/));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'Open full transcript' }));
    expect(screen.getByTestId('transcript-skeleton')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
    expect(screen.queryByTestId('transcript-skeleton')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('transcript-skeleton')).toBeTruthy();
  });

  it.each([
    ['a session transcript', null, fetchSessionTranscript],
    ['a transcribe-room transcript', 'room-id-1', fetchRoomTranscript],
  ])('%s: a rejected read shows the fallback at once, Retry reads again', async (_l, roomId, read) => {
    svc.sessions = [session(roomId)];
    vi.mocked(read).mockRejectedValueOnce(new Error('network down'));
    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByText(/Pat Partner/));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'Open full transcript' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Well before the 10s deadline: the failure itself ends the skeleton.
    expect(screen.queryByTestId('transcript-skeleton')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('transcript-skeleton')).toBeTruthy();
  });
});
