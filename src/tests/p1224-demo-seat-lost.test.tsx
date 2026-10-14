/**
 * P1224 — on the demo page, a guest whose write is refused for its seat credential re-joins once,
 * and otherwise returns to the join form; local state moves only after a write has landed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null }) }));

// The level view is replaced by two buttons that call the page's callbacks the way the real view
// does — WITHOUT awaiting them (demo-level-view.tsx), which is the shape that left rejections
// unhandled.
vi.mock('@/app/components/partners/demo-level-view', () => ({
  DemoLevelView: (props: { demoState: { currentLevel: number }; onNextLevel: () => void; onDemoComplete: () => void }) => (
    <div>
      <p>level {props.demoState.currentLevel}</p>
      <button onClick={() => { props.onNextLevel(); }}>next level</button>
      <button onClick={() => { props.onDemoComplete(); }}>complete demo</button>
    </div>
  ),
}));

vi.mock('@/app/data/api', async () => {
  const actual = await vi.importActual<typeof import('@/app/data/api')>('@/app/data/api');
  return {
    ...actual,
    createClaritySession: vi.fn(),
    joinClaritySession: vi.fn(),
    getClaritySession: vi.fn().mockResolvedValue(null),
    subscribeToClaritySession: vi.fn(() => () => {}),
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
  joinerProfileId: null, state: {}, demoStatus: 'waiting', liveState: null,
} as unknown as api.ClaritySession;

const lost = () => new api.GuestSeatLostError('session-1');

async function joinAsGuest() {
  vi.mocked(api.joinClaritySession).mockResolvedValueOnce(session);
  render(<ClarityDemoPage />);
  fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Guest' } });
  fireEvent.change(screen.getByPlaceholderText('Enter 6-letter code'), { target: { value: 'ABC234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));
  await screen.findByText('Start 10-Minute Session');
  fireEvent.click(screen.getByRole('checkbox'));
}

async function reachDemo() {
  await joinAsGuest();
  vi.mocked(api.updateDemoFlowState).mockResolvedValueOnce(undefined);
  vi.mocked(api.updateClarityDemoStatus).mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Start 10-Minute Session' }));
  await screen.findByText('level 1');
}

beforeEach(() => {
  vi.mocked(api.joinClaritySession).mockReset();
  vi.mocked(api.updateDemoFlowState).mockReset();
  vi.mocked(api.updateClarityDemoStatus).mockReset();
});

describe('start', () => {
  it('a refused start whose re-join fails returns the guest to the join form with the message', async () => {
    await joinAsGuest();
    vi.mocked(api.updateDemoFlowState).mockRejectedValue(lost());
    vi.mocked(api.joinClaritySession).mockResolvedValueOnce(null); // someone else holds the seat
    fireEvent.click(screen.getByRole('button', { name: 'Start 10-Minute Session' }));
    expect(await screen.findByText(api.GUEST_SEAT_LOST_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('level 1')).toBeNull();
    expect((screen.getByPlaceholderText('Enter 6-letter code') as HTMLInputElement).value).toBe('ABC234');
  });

  it('a refused start whose re-join succeeds retries once and enters the demo', async () => {
    await joinAsGuest();
    vi.mocked(api.updateDemoFlowState).mockRejectedValueOnce(lost()).mockResolvedValue(undefined);
    vi.mocked(api.updateClarityDemoStatus).mockResolvedValue(undefined);
    vi.mocked(api.joinClaritySession).mockResolvedValueOnce(session);
    fireEvent.click(screen.getByRole('button', { name: 'Start 10-Minute Session' }));
    expect(await screen.findByText('level 1')).toBeTruthy();
    expect(api.joinClaritySession).toHaveBeenLastCalledWith('ABC234', 'Guest');
    expect(api.updateDemoFlowState).toHaveBeenCalledTimes(2);
  });
});

describe('advance', () => {
  it('a refused next-level does not move the guest ahead of its partner, and is not left unhandled', async () => {
    await reachDemo();
    vi.mocked(api.updateDemoFlowState).mockRejectedValue(lost());
    vi.mocked(api.joinClaritySession).mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'next level' }));
    expect(await screen.findByText(api.GUEST_SEAT_LOST_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('level 2')).toBeNull();
  });

  it('a non-seat failure on next-level leaves the level unchanged (no optimistic advance)', async () => {
    await reachDemo();
    vi.mocked(api.updateDemoFlowState).mockRejectedValue(new Error('network'));
    fireEvent.click(screen.getByRole('button', { name: 'next level' }));
    await waitFor(() => expect(api.updateDemoFlowState).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('level 1')).toBeTruthy();
  });

  it('a landed next-level advances', async () => {
    await reachDemo();
    vi.mocked(api.updateDemoFlowState).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'next level' }));
    expect(await screen.findByText('level 2')).toBeTruthy();
  });

  it('a refused completion does not show the completion screen', async () => {
    await reachDemo();
    vi.mocked(api.updateClarityDemoStatus).mockRejectedValue(lost());
    vi.mocked(api.joinClaritySession).mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'complete demo' }));
    expect(await screen.findByText(api.GUEST_SEAT_LOST_MESSAGE)).toBeTruthy();
  });
});
