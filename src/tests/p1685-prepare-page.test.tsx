// @vitest-environment jsdom
/**
 * P1685 — /prepare (standalone and join): the Listening Game is the last screen of the principle step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: null, isLoading: false, sessionChecked: true } }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
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

import { PreparePage } from '@/app/prototypes/events/prep/PreparePage';
import { markLocalPart } from '@/app/prototypes/events/prep/prep-local-parts';
import { stepMinutes } from '@/app/prototypes/events/prep/prep-plan';

const page = () => render(<MemoryRouter initialEntries={['/prepare']}><PreparePage /></MemoryRouter>);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => { localStorage.clear(); gate.value = { kind: 'plain' }; });
afterEach(cleanup);

/** Plays the intro clip on the principle step, then continues. */
async function watchIntro() {
  click('Play the video');
  await screen.findByRole('button', { name: 'Continue' });
  click('Continue');
}

describe('P1685 standalone', () => {
  it('after the opt-out answer and its follow-up, the game screen comes before the next step', async () => {
    page();
    fireEvent.click(await screen.findByText('Learn about the Clarity Meeting Principle'));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await watchIntro();
    fireEvent.click(await screen.findByText('Opt out'));
    expect(await screen.findByTestId('opt-out-ask')).toBeInTheDocument();
    click('No, continue');
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Play the video')).toBeInTheDocument();
    expect(screen.getByText('Continue without video')).toBeInTheDocument();
    // Numbered steps are unchanged.
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    // Back returns to the screen the person came from.
    click('Back');
    expect(await screen.findByTestId('opt-out-ask')).toBeInTheDocument();
    click('No, continue');
    fireEvent.click(await screen.findByText('Continue without video'));
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });
});

describe('P1685 join', () => {
  it('shows the game after the intro and certificate, before the statements step', async () => {
    gate.value = { kind: 'join', join: { groupName: 'G', onFinish: vi.fn(), onExit: vi.fn() }, rows: [] };
    page();
    await screen.findByTestId('learn-join-context');
    // story step first
    click('Play the video');
    await screen.findByRole('button', { name: 'Continue' });
    click('Continue');
    expect(await screen.findByTestId('join-principle-text')).toBeInTheDocument();
    await watchIntro();
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continue without video'));
    await waitFor(() => expect(screen.getByTestId('stake-cmp7')).toBeInTheDocument());
  });
});

describe('P1685 opt-in path and estimate', () => {
  it('opt in, try it now, rating confirm: then the game', async () => {
    page();
    fireEvent.click(await screen.findByText('Learn about the Clarity Meeting Principle'));
    await watchIntro();
    fireEvent.click(await screen.findByText('Opt in'));
    click('Try it now');
    fireEvent.click(await screen.findByRole('button', { name: 'Rate 8' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
  });
  it('the list shows the principle minutes with the clip', async () => {
    page();
    const row = await screen.findByTestId('agenda-step-principle');
    expect(row).toHaveTextContent(`${stepMinutes('principle', { cmp7: 0, stake: 0 }, true, true)} min`);
    expect(row).not.toHaveTextContent(`${stepMinutes('principle', { cmp7: 0, stake: 0 }, true, false)} min`);
  });
});

describe('P1685 join resumed and Back', () => {
  const joinGate = () => { gate.value = { kind: 'join', join: { groupName: 'G', onFinish: vi.fn(), onExit: vi.fn() }, rows: [] }; };
  it('resuming on the principle (story already done) still ends with the game', async () => {
    markLocalPart('cognitive_video');
    joinGate();
    page();
    expect(await screen.findByTestId('principle-intro')).toBeInTheDocument();
    await watchIntro();
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
  });
  it('Back from the game returns to the intro clip, never a blank screen', async () => {
    markLocalPart('cognitive_video');
    joinGate();
    page();
    await screen.findByTestId('principle-intro');
    await watchIntro();
    await screen.findByTestId('listening-game');
    click('Back');
    expect(await screen.findByTestId('principle-intro')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
    // and forward again works (the clip was already played this visit)
    click('Continue');
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
  });
});
