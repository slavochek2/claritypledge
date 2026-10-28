// @vitest-environment jsdom
/**
 * P1586 §2 "Section → the section look": the two transcript views on /sessions (a session's own
 * transcript, and a transcribe room's) show a skeleton of the turns while the transcript is read,
 * under the drawn page header; not a centred spinner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

import { MySessionsPage } from '@/app/pages/my-sessions-page';

const session = (roomId: string | null) => ({
  id: 'session-id-1',
  partnerName: 'Pat Partner',
  roundCount: 1,
  date: '2026-01-15T10:00:00Z',
  sessionHistory: [],
  isPrivate: false,
  transcriptStatus: 'completed',
  roomId,
});

async function openTranscript() {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText(/Pat Partner/));
  fireEvent.click(await screen.findByRole('button', { name: 'Open full transcript' }));
}

beforeEach(() => vi.clearAllMocks());

describe('P1586 /sessions transcript views', () => {
  it.each([
    ['a session transcript', null],
    ['a transcribe-room transcript', 'room-id-1'],
  ])('%s: skeleton of the turns under the drawn header, no spinner', async (_label, roomId) => {
    svc.sessions = [session(roomId)];
    await openTranscript();

    expect(screen.getByRole('heading', { name: 'Transcript' })).toBeInTheDocument();
    const skeleton = screen.getByTestId('transcript-skeleton');
    expect(skeleton.querySelectorAll('.animate-pulse.bg-muted').length).toBeGreaterThan(1);
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(document.querySelector('svg[aria-label="Loading"]')).toBeNull();
    expect(skeleton.textContent).toBe('');
  });
});
