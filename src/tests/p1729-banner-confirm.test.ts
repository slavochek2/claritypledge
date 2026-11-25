/**
 * P1729: an existing banner is never replaced without the owner confirming.
 * - Regenerate and keyword Search over an existing banner ask first (when the caller supplies
 *   confirmReplace); declining changes nothing and spends no generation.
 * - With no banner there is nothing to lose, so no question.
 * - Lazy generation never runs over a shown banner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
const gen = vi.fn();
vi.mock('@/app/prototypes/events/banner-utils', () => ({
  generateAIBannerResult: (...a: unknown[]) => gen(...a),
}));

import { useBanner } from '@/app/components/shared/banner/use-banner';
import { useLazyProfileBanner } from '@/app/pages/use-lazy-profile-banner';

const HAND_SET = '/banners/example-desktop.jpg';
const GENERATED = 'https://example.test/storage/v1/object/public/banners/profile/x/new.jpg';

function setup(initialBannerUrl: string | null, confirmReplace?: () => boolean) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    useBanner({ entityType: 'profile', entityId: 'user-id-1234', initialBannerUrl, onSave, confirmReplace }),
  );
  return { onSave, hook };
}

describe('P1729: replacing an existing banner needs confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gen.mockResolvedValue({ url: GENERATED, credit: null });
  });

  it('Regenerate: declining leaves the hand-set banner and generates nothing', async () => {
    const { onSave, hook } = setup(HAND_SET, () => false);
    await act(() => hook.result.current.handleRegenerate());
    expect(gen).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(hook.result.current.bannerUrl).toBe(HAND_SET);
  });

  it('Search: declining leaves the hand-set banner and generates nothing', async () => {
    const { onSave, hook } = setup(HAND_SET, () => false);
    await act(() => hook.result.current.handleSearch('mountains'));
    expect(gen).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(hook.result.current.bannerUrl).toBe(HAND_SET);
  });

  it('Regenerate: confirming replaces the banner', async () => {
    const confirm = vi.fn(() => true);
    const { onSave, hook } = setup(HAND_SET, confirm);
    await act(() => hook.result.current.handleRegenerate());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith(GENERATED);
  });

  it('Search: confirming replaces the banner', async () => {
    const confirm = vi.fn(() => true);
    const { onSave, hook } = setup(HAND_SET, confirm);
    await act(() => hook.result.current.handleSearch('mountains'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith(GENERATED);
  });

  it('no banner to lose: no confirmation asked', async () => {
    const confirm = vi.fn(() => true);
    const { onSave, hook } = setup(null, confirm);
    await act(() => hook.result.current.handleRegenerate());
    expect(confirm).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(GENERATED);
  });
});

describe('P1729: lazy generation guard', () => {
  const owner = { id: 'user-id-1234', bannerUrl: undefined, bannerGenerationAttempted: false };
  function run(shown: string | null) {
    const generate = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useLazyProfileBanner(owner, { bannerUrl: shown, handleRegenerate: generate }, 'tok', owner.id));
    return generate;
  }

  it('control: generates once for an owner with no banner', () => {
    expect(run(null)).toHaveBeenCalledTimes(1);
  });

  it("someone else's profile, then your own without a remount: generates once, for your own", () => {
    const generate = vi.fn().mockResolvedValue(undefined);
    const other = { id: 'user-id-5678', bannerUrl: undefined, bannerGenerationAttempted: false };
    // The signed-in user is the owner throughout; only the profile on screen changes.
    const { rerender } = renderHook(
      ({ p }) => useLazyProfileBanner(p, { bannerUrl: null, handleRegenerate: generate }, 'tok', owner.id),
      { initialProps: { p: other } },
    );
    expect(generate).not.toHaveBeenCalled(); // visitor view: never generates
    rerender({ p: owner });
    expect(generate).toHaveBeenCalledTimes(1); // owner view
    rerender({ p: { ...owner } }); // same id again: no second generation
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('never over a banner the page already shows', () => {
    expect(run(HAND_SET)).not.toHaveBeenCalled();
  });
});
