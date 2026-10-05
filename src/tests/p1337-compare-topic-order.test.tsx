/**
 * P1337 (Codex review of walkthrough 6): on the compare page opened from a table, a poll that
 * started before a tap must never overwrite the tap — it reverted a fresh topic mark.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as auth from '@/auth';
import * as api from '@/app/data/api';
import * as compare from '@/app/data/compare-service';
import * as rounds from '@/app/data/event-rounds-service';

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({ getProfileBySlug: vi.fn() }));
vi.mock('@/app/data/compare-service', () => ({
  getTagStatements: vi.fn(),
  getPositionsFor: vi.fn(),
  getSharedTags: vi.fn(),
  getAnsweredTags: vi.fn(),
}));
vi.mock('@/app/data/event-room-service', () => ({ getMyRoomStatus: vi.fn() }));
vi.mock('@/app/data/event-rounds-service', () => ({
  ROUNDS_POLL_MS: 60_000,
  currentRound: vi.fn(),
  getEventRoundsState: vi.fn(),
  getRoundEvent: vi.fn(async () => null),
  getRoundTopic: vi.fn(),
  setRoundTopic: vi.fn(async () => undefined),
}));

import { ComparePage } from '@/app/pages/compare-page';

beforeEach(() => {
  vi.mocked(auth.useAuth).mockReturnValue({
    user: { id: 'viewer-1', name: 'Viewer Person', hasPledged: false } as any,
    session: null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  });
  vi.mocked(api.getProfileBySlug).mockResolvedValue({ id: 'other-1', slug: 'ben-tan', name: 'Ben Tan', hasPledged: true } as any);
  vi.mocked(compare.getSharedTags).mockResolvedValue([{ tag: 'ikigai1', count: 2 }]);
  vi.mocked(compare.getTagStatements).mockResolvedValue([
    { id: 'p-a', statement: 'Statement A' },
    { id: 'p-b', statement: 'Statement B' },
  ]);
  vi.mocked(compare.getPositionsFor).mockResolvedValue(
    new Map([
      ['viewer-1', new Map([['p-a', 'agree'], ['p-b', 'agree']])],
      ['other-1', new Map([['p-a', 'disagree'], ['p-b', 'disagree']])],
    ]) as any,
  );
});

it('a poll that started before a tap does not undo the tap', async () => {
  let resolvePoll: (topic: string | null) => void = () => {};
  vi.mocked(rounds.getRoundTopic).mockImplementationOnce(() => new Promise(res => { resolvePoll = res; }));

  render(
    <MemoryRouter initialEntries={['/compare/ben-tan?tag=ikigai1&round=r1&table=1']}>
      <Routes>
        <Route path="/compare/:slug" element={<ComparePage />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByText('Statement B');
  const marks = screen.getAllByTestId('compare-topic-mark');
  const rowB = marks[screen.getAllByRole('listitem').findIndex(li => li.textContent?.includes('Statement B'))];
  fireEvent.click(rowB);
  expect(rowB).toHaveAttribute('aria-pressed', 'true');

  resolvePoll('p-a'); // the older poll answers with the previous topic
  await waitFor(() => expect(rounds.setRoundTopic).toHaveBeenCalledWith('r1', 1, 'p-b'));
  await new Promise(r => setTimeout(r, 20));
  expect(rowB).toHaveAttribute('aria-pressed', 'true');
});
