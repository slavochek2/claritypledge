// @vitest-environment jsdom
/**
 * P1586 invariant: the compare rows' wait ends in a readable line with a Retry, and Retry re-runs
 * the rows read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ComparePage } from '@/app/pages/compare-page';
import * as auth from '@/auth';
import * as api from '@/app/data/api';
import * as compare from '@/app/data/compare-service';

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({ getProfileBySlug: vi.fn() }));
vi.mock('@/app/data/compare-service', () => ({
  getTagStatements: vi.fn(),
  getPositionsFor: vi.fn(),
  getSharedTags: vi.fn(),
  getAnsweredTags: vi.fn(),
}));

const DEADLINE_MS = 10_000;

describe('P1586 compare rows deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(auth.useAuth).mockReturnValue({
      user: { id: 'viewer-1', name: 'Viewer Person', hasPledged: false } as never,
      session: null, isLoading: false, sessionChecked: true, signOut: vi.fn(), refreshProfile: vi.fn(),
    });
    vi.mocked(api.getProfileBySlug).mockResolvedValue({ id: 'other-1', slug: 'ben-tan', name: 'Ben Tan', hasPledged: true } as never);
    vi.mocked(compare.getSharedTags).mockResolvedValue([{ tag: 'st1', count: 2 }] as never);
    vi.mocked(compare.getAnsweredTags).mockResolvedValue([]);
    vi.mocked(compare.getTagStatements).mockReturnValue(new Promise(() => {}));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('a stalled rows read reaches the fallback; Retry reads the statements again', async () => {
    render(
      <MemoryRouter initialEntries={['/compare/ben-tan']}>
        <Routes><Route path="/compare/:slug" element={<ComparePage />} /></Routes>
      </MemoryRouter>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId('compare-rows-skeleton')).toBeTruthy();
    expect(compare.getTagStatements).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
    expect(screen.queryByTestId('compare-rows-skeleton')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(compare.getTagStatements).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('compare-rows-skeleton')).toBeTruthy();
  });
});
