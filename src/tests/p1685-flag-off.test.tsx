// @vitest-environment jsdom
/**
 * P1685 — standalone/join switch off: the game step is absent and the numbering is as before it existed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The join list is derived from the switch inside listening-game.ts at load, so the mock re-derives it with the real helper.
vi.mock('@/app/prototypes/events/prep/listening-game', async (orig) => {
  const real = await orig<typeof import('@/app/prototypes/events/prep/listening-game')>();
  return { ...real, STANDALONE_LISTENING_GAME: false, JOIN_STEPS: real.joinStepsFor(false) };
});
vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, isLoading: false, sessionChecked: true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/data/api', () => ({ getProfileBySlug: vi.fn(async () => null) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  markPrepPart: vi.fn(async () => undefined),
  getMyPrepParts: vi.fn(async () => []),
}));
vi.mock('@/app/pages/stake-page', () => ({ StakePage: ({ tag }: { tag: string }) => <div data-testid={`stake-${tag}`} /> }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({ loadTagPoints: vi.fn(async () => []) }));
const gate = vi.hoisted(() => ({ value: { kind: 'plain' } as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/prep/use-prepare-modes', () => ({ useJoinLearningGate: () => gate.value }));

import { JOIN_LEARNING_STEPS, PreparePage, STANDALONE_STEPS } from '@/app/prototypes/events/prep/PreparePage';

const page = () => render(<MemoryRouter initialEntries={['/prepare']}><PreparePage /></MemoryRouter>);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
async function watchAndContinue() {
  click('Play the video');
  await screen.findByRole('button', { name: 'Continue' });
  click('Continue');
}

beforeEach(() => { localStorage.clear(); gate.value = { kind: 'plain' }; });
afterEach(cleanup);

describe('P1685 flag off', () => {
  it('the step lists have no game', () => {
    expect([...STANDALONE_STEPS]).toEqual(['story', 'principle', 'cmp7', 'misunderstanding']);
    expect([...JOIN_LEARNING_STEPS]).toEqual(['story', 'principle', 'cmp7']);
  });
  it('standalone: no game row, "Step 2 of 4", the opt-out follow-up goes straight to the next step', async () => {
    page();
    await screen.findByTestId('agenda');
    expect(screen.queryByTestId('agenda-step-game')).toBeNull();
    fireEvent.click(screen.getByText('Learn about the Clarity Meeting Principle'));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await watchAndContinue();
    fireEvent.click(await screen.findByText('Opt out'));
    await screen.findByTestId('opt-out-ask');
    click('No, continue');
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });
  it('join: the intro goes straight to the statements step, counted as before (Step 2 of 4)', async () => {
    gate.value = { kind: 'join', join: { groupName: 'G', onFinish: vi.fn(), onExit: vi.fn() }, rows: [] };
    page();
    await screen.findByTestId('learn-join-context');
    await watchAndContinue(); // story
    await screen.findByTestId('join-principle-text');
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await watchAndContinue(); // principle
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });
});
