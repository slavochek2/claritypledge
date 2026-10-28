// @vitest-environment jsdom
/**
 * P1586 invariant: review mode, the story picker and the pledgers grid end a stalled read in a
 * readable line with a Retry, and Retry re-runs that read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { never } = vi.hoisted(() => ({ never: () => new Promise<never>(() => {}) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/components/landing/dual-cta', () => ({ DualCTA: () => null }));
vi.mock('@/app/components/social/pledger-grid', () => ({ PledgerGrid: () => null }));
vi.mock('@/app/data/api', () => ({ getLiveTurns: vi.fn(never), getVerifiedProfilesPage: vi.fn(never), PLEDGERS_PAGE_SIZE: 30 }));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getCompatibleStories: vi.fn(never) } }));

import { getLiveTurns, getVerifiedProfilesPage } from '@/app/data/api';
import { docsService } from '@/app/data/docs-service';
import { ReviewModeView } from '@/app/components/partners/review-mode-view';
import { DocStoryPicker } from '@/app/components/docs/doc-story-picker';
import { ClarityPledgersPage } from '@/app/pages/clarity-pledgers-page';

const DEADLINE_MS = 10_000;
const members = [
  ['review mode', 'review-ideas-skeleton', getLiveTurns, () => (
    <ReviewModeView session={{ id: 'session-id-1' } as never} liveState={{ ideasDiscussed: 2, ideasUnderstood: 1 } as never}
      currentUserName="Ann" partnerName="Bob" onToggleMode={() => {}} />
  )],
  ['story picker', 'story-picker-skeleton', docsService.getCompatibleStories, () => (
    <DocStoryPicker docId="doc-id-1" docVisibility="public" open onOpenChange={() => {}} onStoryAdded={() => {}} />
  )],
  ['pledgers', 'loader', getVerifiedProfilesPage, () => <MemoryRouter><ClarityPledgersPage /></MemoryRouter>],
] as const;

describe('P1586 section deadline: review, picker, pledgers', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(members)('%s: fallback after the deadline, Retry reads again', async (_n, testId, read, ui) => {
    render(ui());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId(testId)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
    expect(screen.queryByTestId(testId)).toBeNull();

    const before = vi.mocked(read as () => unknown).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(vi.mocked(read as () => unknown).mock.calls.length).toBe(before + 1);
    expect(screen.getByTestId(testId)).toBeTruthy();
  });
});
