import { describe, it, expect } from 'vitest';
import { mapProfileFromDb } from '@/app/data/api';

// P1413: profiles carry an optional hand-set phone banner, read through get_profile_by_id.
describe('P1413 profile phone banner mapping', () => {
  const base = { id: 'u1', slug: 'x', name: 'X', created_at: '2026-01-01', is_verified: true };

  it('maps banner_mobile_url to bannerMobileUrl', () => {
    const p = mapProfileFromDb({ ...base, banner_url: '/d.png', banner_mobile_url: '/m.png' } as never);
    expect(p.bannerUrl).toBe('/d.png');
    expect(p.bannerMobileUrl).toBe('/m.png');
  });

  it('leaves bannerMobileUrl undefined when the column is null', () => {
    const p = mapProfileFromDb({ ...base, banner_url: '/d.png', banner_mobile_url: null } as never);
    expect(p.bannerMobileUrl).toBeUndefined();
  });
});
