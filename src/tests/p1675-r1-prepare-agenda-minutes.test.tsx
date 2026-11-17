// @vitest-environment jsdom
/**
 * P1675 UAT round 1 R8: /prepare's RENDERED agenda shows the misunderstanding row's minutes as
 * round(n x SECONDS_PER_DECISION x OBSERVED_TIME_FACTOR / 60), at least 1, for the number of statements it loaded.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('@/app/pages/stake-page', () => ({ StakePage: () => null }));
const counts = vi.hoisted(() => ({ misunderstanding: 0, cmp7: 0 }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  loadTagPoints: vi.fn(async (tag: string) =>
    Array.from({ length: tag === 'misunderstanding' ? counts.misunderstanding : counts.cmp7 }, (_, i) => ({ id: `${tag}-${i}` }))),
}));
vi.mock('@/app/prototypes/events/prep/use-prepare-modes', () => ({ useJoinLearningGate: () => ({ kind: 'plain' }) }));

import { PreparePage } from '@/app/prototypes/events/prep/PreparePage';
import { OBSERVED_TIME_FACTOR, SECONDS_PER_DECISION } from '@/app/prototypes/events/prep/prep-plan';

afterEach(cleanup);

describe('P1675 R8: the rendered /prepare agenda minutes', () => {
  it.each([1, 2, 5, 9, 24])('%i misunderstanding statements show the rule\'s minutes', async (n) => {
    counts.misunderstanding = n;
    counts.cmp7 = 8;
    render(<MemoryRouter initialEntries={['/prepare']}><PreparePage /></MemoryRouter>);
    const expected = Math.max(1, Math.round((n * SECONDS_PER_DECISION * OBSERVED_TIME_FACTOR) / 60));
    const row = await screen.findByTestId('agenda-step-misunderstanding');
    await vi.waitFor(() => expect(row).toHaveTextContent(`${expected} min`));
  });
});
