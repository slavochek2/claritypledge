/**
 * P1224 — the demo page's rating step, with the REAL DemoLevelView and RatingCard: a rating is
 * "submitted" (waiting screen) only once its write has landed. A refused or failed write leaves the
 * rating in place to submit again, instead of stranding the person on a waiting screen nothing
 * can resolve. Also: the creator's defensive state initialisation goes through the shared-write
 * wrapper, so a refused write is neither unhandled nor applied locally.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const authUser: { current: { id: string; name: string } | null } = { current: null };
vi.mock('@/auth', () => ({ useAuth: () => ({ user: authUser.current }) }));

vi.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({
    transcript: '', interimTranscript: '', isListening: false, isSupported: false, error: null,
    startListening: () => {}, stopListening: () => {}, resetTranscript: () => {}, setTranscript: () => {},
    liveTextStopped: false, lastRecognitionError: null,
  }),
}));

let pushUpdate: ((s: unknown) => void) | null = null;

vi.mock('@/app/data/api', async () => {
  const actual = await vi.importActual<typeof import('@/app/data/api')>('@/app/data/api');
  return {
    ...actual,
    createClaritySession: vi.fn(),
    joinClaritySession: vi.fn(),
    getClaritySession: vi.fn().mockResolvedValue(null),
    subscribeToClaritySession: vi.fn((_id: string, _code: string, cb: (s: unknown) => void) => {
      pushUpdate = cb;
      return () => {};
    }),
    updateClarityDemoStatus: vi.fn(),
    updateDemoFlowState: vi.fn(),
    saveDemoRound: vi.fn(),
    saveClarityIdea: vi.fn(),
  };
});

import * as api from '@/app/data/api';
import { ClarityDemoPage } from '@/app/pages/clarity-demo-page';

const session = {
  id: 'session-1', code: 'ABC234', creatorName: 'Host', joinerName: 'Guest', creatorProfileId: 'host-1',
  joinerProfileId: null, state: {}, demoStatus: 'in_progress', liveState: null,
} as unknown as api.ClaritySession;

const ratingState = {
  currentLevel: 1, currentRound: 1, phase: 'rating', ideaText: 'an idea', ideaConfirmed: true,
  paraphraseText: 'a paraphrase', paraphraseConfirmed: true, isAccepted: false, positionConfirmed: false,
};

/** The guest (joiner) reaches the level-1 rating step, where it is the listener. */
async function guestAtRating() {
  vi.mocked(api.joinClaritySession).mockResolvedValueOnce(session);
  render(<ClarityDemoPage />);
  fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Guest' } });
  fireEvent.change(screen.getByPlaceholderText('Enter 6-letter code'), { target: { value: 'ABC234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));
  await screen.findByText('Start 10-Minute Session');
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(api.updateDemoFlowState).mockResolvedValueOnce(undefined);
  vi.mocked(api.updateClarityDemoStatus).mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Start 10-Minute Session' }));
  await waitFor(() => expect(pushUpdate).not.toBeNull());
  await act(async () => { pushUpdate!({ ...session, state: ratingState }); });
  await screen.findByRole('button', { name: 'Submit Rating' });
}

beforeEach(() => {
  pushUpdate = null;
  authUser.current = null;
  vi.mocked(api.joinClaritySession).mockReset();
  vi.mocked(api.updateDemoFlowState).mockReset();
  vi.mocked(api.updateClarityDemoStatus).mockReset();
  vi.mocked(api.createClaritySession).mockReset();
});

describe('rating (real RatingCard)', () => {
  it('a failed rating write keeps the rating in place to submit again — no waiting screen', async () => {
    await guestAtRating();
    vi.mocked(api.updateDemoFlowState).mockRejectedValueOnce(new Error('network'));
    fireEvent.click(screen.getByRole('button', { name: 'Rate 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Rating' }));
    await waitFor(() => expect(api.updateDemoFlowState).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Submit Rating' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/Waiting for .* to rate/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Rate 7' }).getAttribute('aria-pressed')).toBe('true');

    // The same rating, submitted again once the write can land, reaches the waiting screen.
    vi.mocked(api.updateDemoFlowState).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Rating' }));
    expect(await screen.findByText(/Waiting for Host to rate/)).toBeTruthy();
    expect(api.updateDemoFlowState).toHaveBeenLastCalledWith('session-1', { listenerSelfRating: 7 });
  });

  // Control: passes before and after — the page leaves the rating step for the join form.
  it('a rating refused for the seat, with no way back in, sends the guest to the join form', async () => {
    await guestAtRating();
    vi.mocked(api.updateDemoFlowState).mockRejectedValueOnce(new api.GuestSeatLostError('session-1'));
    vi.mocked(api.joinClaritySession).mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Rate 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Rating' }));
    expect(await screen.findByText(api.GUEST_SEAT_LOST_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/Waiting for .* to rate/)).toBeNull();
  });
});

describe('creator state initialisation', () => {
  it('the initialisation write goes through the shared-write wrapper (handled, not unhandled)', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    authUser.current = { id: 'host-1', name: 'Host' };
    vi.mocked(api.createClaritySession).mockResolvedValueOnce(session);
    render(<ClarityDemoPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
    await waitFor(() => expect(pushUpdate).not.toBeNull());
    vi.mocked(api.updateDemoFlowState).mockRejectedValue(new Error('network'));
    // The joiner starts the demo; the creator's page enters the demo with no state yet.
    await act(async () => { pushUpdate!({ ...session, state: {}, demoStatus: 'in_progress' }); });
    await waitFor(() => expect(api.updateDemoFlowState).toHaveBeenCalled());
    // The wrapper is what catches and reports a failed shared write; a bare call would leave the
    // rejection unhandled and report nothing.
    await waitFor(() => expect(logged).toHaveBeenCalledWith('Failed to sync demo state:', expect.any(Error)));
    logged.mockRestore();
  });
});
