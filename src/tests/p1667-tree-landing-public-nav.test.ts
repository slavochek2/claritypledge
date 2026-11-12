import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPublicSitePath } from '@/app/components/layout/nav-links';

describe('P1667: dev landing prototypes draw the public menu', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('runs with import.meta.env.DEV true', () => {
    expect(import.meta.env.DEV).toBe(true);
  });

  it('treats the two redesign pages as public site paths in dev', () => {
    expect(isPublicSitePath('/tree/landing-fable')).toBe(true);
    expect(isPublicSitePath('/tree/landing-fable-change')).toBe(true);
    expect(isPublicSitePath('/tree/landing-fable-change/')).toBe(true);
  });

  it('does not widen to other /tree pages, and keeps the existing list', () => {
    expect(isPublicSitePath('/tree/landing-watch')).toBe(false);
    expect(isPublicSitePath('/tree')).toBe(false);
    expect(isPublicSitePath('/builders')).toBe(true);
  });

  it('does not list the tree paths when DEV is false', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    expect(import.meta.env.DEV).toBe(false);
    const prod = await import('@/app/components/layout/nav-links');
    expect(prod.isPublicSitePath('/tree/landing-fable')).toBe(false);
    expect(prod.isPublicSitePath('/tree/landing-fable-change')).toBe(false);
    expect(prod.isPublicSitePath('/builders')).toBe(true);
  });
});
