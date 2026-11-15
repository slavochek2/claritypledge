// @vitest-environment jsdom
/**
 * P1685 — standalone/join switch off: the principle step is exactly as before, same "Step X of N".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/app/prototypes/events/prep/listening-game', async (orig) => ({
  ...(await orig<typeof import('@/app/prototypes/events/prep/listening-game')>()),
  STANDALONE_LISTENING_GAME: false,
}));
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

import { PreparePage } from '@/app/prototypes/events/prep/PreparePage';
import { stepMinutes } from '@/app/prototypes/events/prep/prep-plan';

const page = () => render(<MemoryRouter initialEntries={['/prepare']}><PreparePage /></MemoryRouter>);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
async function watchIntro() {
  click('Play the video');
  await screen.findByRole('button', { name: 'Continue' });
  click('Continue');
}

beforeEach(() => { localStorage.clear(); gate.value = { kind: 'plain' }; });
afterEach(cleanup);

describe('P1685 flag off', () => {
  it('standalone: opt-out follow-up goes straight to the next step, header unchanged, minutes without the clip', async () => {
    page();
    const row = await screen.findByTestId('agenda-step-principle');
    expect(row).toHaveTextContent(`${stepMinutes('principle', { cmp7: 0, stake: 0 }, true)} min`);
    fireEvent.click(screen.getByText('Learn about the Clarity Meeting Principle'));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await watchIntro();
    fireEvent.click(await screen.findByText('Opt out'));
    await screen.findByTestId('opt-out-ask');
    click('No, continue');
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });
  it('join: intro goes straight to the statements step', async () => {
    gate.value = { kind: 'join', join: { groupName: 'G', onFinish: vi.fn(), onExit: vi.fn() }, rows: [] };
    page();
    await screen.findByTestId('learn-join-context');
    await watchIntro(); // story
    await screen.findByTestId('join-principle-text');
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await watchIntro(); // principle
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });
});
