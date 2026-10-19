/**
 * @file p1508-canvas-position-notify.test.tsx
 * @description P1508 review fix — FeedPointCard's `onPositionSaved` tells the Clarity Canvas to
 * re-read everyone's positions after a vote AND after a withdrawal (signed in or out), and never
 * after the card has unmounted (a write settling after the viewer signed out).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';

const state = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({
  useAuth: () => (state.signedIn
    ? { session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' } }
    : { session: null, user: null }),
}));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: ({ onAfterRemove }: { onAfterRemove: () => void }) => ({
    dialogProps: {},
    guardedRemovePosition: async () => onAfterRemove(),
  }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));
vi.mock('@/app/components/shared/PositionButton', () => ({
  PositionButtons: ({ onPositionClick, onClear }: { onPositionClick: (p: string) => void; onClear: () => void }) => (
    <>
      <button onClick={() => onPositionClick('agree')}>Vote agree</button>
      <button onClick={onClear}>Clear position</button>
    </>
  ),
}));

import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { pointsService } from '@/app/data/points-service';

const point = {
  id: 'p1', statement: 'Statement', tags: [], systemTags: [], visibility: 'public', userPosition: undefined,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
} as unknown as PointWithUserPosition;

afterEach(() => { cleanup(); localStorage.clear(); state.signedIn = true; });

describe('onPositionSaved', () => {
  it('is not called by a write that settles after the card unmounted', async () => {
    let finish: () => void = () => undefined;
    const sent = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.mocked(pointsService.setPosition).mockImplementationOnce(sent);
    const saved = vi.fn();
    const view = render(<MemoryRouter><FeedPointCard point={point} linkedStories={[]} onPositionSaved={saved} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Vote agree'));
    await waitFor(() => expect(sent).toHaveBeenCalled());
    view.unmount();
    await act(async () => { finish(); });
    expect(saved).not.toHaveBeenCalled();
  });

  it('is called after a vote and again after its withdrawal (signed in)', async () => {
    const saved = vi.fn();
    render(<MemoryRouter><FeedPointCard point={point} linkedStories={[]} onPositionSaved={saved} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Vote agree'));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('Clear position'));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
  });

  it('is called after a signed-out vote and after its explicit clear', async () => {
    state.signedIn = false;
    const saved = vi.fn();
    render(<MemoryRouter><FeedPointCard point={point} linkedStories={[]} onPositionSaved={saved} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Vote agree'));
    expect(saved).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Clear position'));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
  });
});
