/**
 * @file consent-api.test.ts
 * TDD tests for P37.2a Recording Consent Mechanism API functions
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase before importing the module that uses it
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInAnonymously: vi.fn(),
    },
  },
}));

// Mock fetch for IP hashing
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock crypto.subtle for hashing
const mockDigest = vi.fn();
vi.stubGlobal('crypto', {
  subtle: {
    digest: mockDigest,
  },
  randomUUID: () => 'mock-uuid-1234',
});

import { supabase } from '@/lib/supabase';

// We'll import the actual functions after implementing them
// For TDD, we define what we expect the API to look like

describe('Consent API Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset navigator.userAgent mock
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Test Browser',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CURRENT_TERMS_VERSION constant', () => {
    it('should export CURRENT_TERMS_VERSION as v1.0', async () => {
      // This will be imported from @/lib/constants
      const { CURRENT_TERMS_VERSION } = await import('@/lib/constants');
      expect(CURRENT_TERMS_VERSION).toBe('v1.0');
    });
  });

  describe('needsTermsAcceptance', () => {
    it('should return true when user has not accepted any terms', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { accepted_terms_version: null },
              error: null,
            }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { needsTermsAcceptance } = await import('@/app/data/api');
      const result = await needsTermsAcceptance('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('profiles');
    });

    it('should return true when user has outdated terms version', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { accepted_terms_version: 'v0.9' }, // Old version
              error: null,
            }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { needsTermsAcceptance } = await import('@/app/data/api');
      const result = await needsTermsAcceptance('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(result).toBe(true);
    });

    it('should return false when user has current terms version', async () => {
      const { CURRENT_TERMS_VERSION } = await import('@/lib/constants');
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { accepted_terms_version: CURRENT_TERMS_VERSION },
              error: null,
            }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { needsTermsAcceptance } = await import('@/app/data/api');
      const result = await needsTermsAcceptance('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(result).toBe(false);
    });

    it('should return true when profile fetch errors', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Profile not found' },
            }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { needsTermsAcceptance } = await import('@/app/data/api');
      const result = await needsTermsAcceptance('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(result).toBe(true);
    });
  });

  describe('recordTermsAcceptance', () => {
    it('should update profile and insert audit record', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { update: mockUpdate } as any;
        }
        if (table === 'terms_acceptances') {
          return { insert: mockInsert } as any;
        }
        return {} as any;
      });

      // Mock IP fetch to fail gracefully
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { recordTermsAcceptance } = await import('@/app/data/api');
      await recordTermsAcceptance('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should throw error when profile update fails', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: { message: 'Update failed' }
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { update: mockUpdate } as any;
        }
        return {} as any;
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const { recordTermsAcceptance } = await import('@/app/data/api');

      await expect(recordTermsAcceptance('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).rejects.toThrow(
        'Failed to record terms acceptance'
      );
    });

    it('should NOT throw when audit insert fails (non-critical)', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockInsert = vi.fn().mockResolvedValue({
        error: { message: 'Audit insert failed' }
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { update: mockUpdate } as any;
        }
        if (table === 'terms_acceptances') {
          return { insert: mockInsert } as any;
        }
        return {} as any;
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const { recordTermsAcceptance } = await import('@/app/data/api');

      // Should not throw even if audit fails
      await expect(recordTermsAcceptance('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).resolves.not.toThrow();
    });
  });

  describe('recordSessionConsent', () => {
    it('should insert consent record with session and user IDs', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'session_consents') {
          return { insert: mockInsert } as any;
        }
        return {} as any;
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const { recordSessionConsent } = await import('@/app/data/api');
      await recordSessionConsent('SESSION-ABC', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'SESSION-ABC',
          user_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        })
      );
    });

    it('should throw error when insert fails', async () => {
      const mockInsert = vi.fn().mockResolvedValue({
        error: { message: 'Insert failed' }
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'session_consents') {
          return { insert: mockInsert } as any;
        }
        return {} as any;
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const { recordSessionConsent } = await import('@/app/data/api');

      await expect(recordSessionConsent('SESSION-ABC', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).rejects.toThrow(
        'Failed to record consent'
      );
    });
  });

  describe('verifySessionConsent', () => {
    it('should return true when consent record exists', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'consent-123' },
                error: null,
              }),
            }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { verifySessionConsent } = await import('@/app/data/api');
      const result = await verifySessionConsent('SESSION-ABC', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(result).toBe(true);
    });

    it('should return false when consent record does not exist', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' },
              }),
            }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { verifySessionConsent } = await import('@/app/data/api');
      const result = await verifySessionConsent('SESSION-ABC', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(result).toBe(false);
    });
  });

  describe('getOrCreateGuestUser', () => {
    it('should return requiresLogin=true for verified existing user', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: '11111111-1111-4111-8111-111111111111', is_verified: true },
              error: null,
            }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { getOrCreateGuestUser } = await import('@/app/data/api');
      const result = await getOrCreateGuestUser('verified@example.com', 'John Doe');

      expect(result.requiresLogin).toBe(true);
      expect(result.isNew).toBe(false);
    });

    it('should reuse profile for unverified existing user (MVP behavior)', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: '22222222-2222-4222-8222-222222222222', is_verified: false },
            error: null,
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: mockSelect,
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as any;
        }
        return {} as any;
      });

      vi.mocked(supabase.auth.signInAnonymously).mockResolvedValue({
        data: { user: { id: '33333333-3333-4333-8333-333333333333' } },
        error: null,
      } as any);

      const { getOrCreateGuestUser } = await import('@/app/data/api');
      const result = await getOrCreateGuestUser('unverified@example.com', 'Jane Doe');

      expect(result.requiresLogin).toBe(false);
      expect(result.isNew).toBe(false);
      // B50 fix: Use existing profile ID for consent tracking (not anonymous user ID)
      expect(result.userId).toBe('22222222-2222-4222-8222-222222222222');
    });

    it('should create new guest user with anonymous auth for new email', async () => {
      // First query returns no existing user
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows' },
          }),
        }),
      });

      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: mockSelect,
            insert: mockInsert,
          } as any;
        }
        return {} as any;
      });

      vi.mocked(supabase.auth.signInAnonymously).mockResolvedValue({
        data: { user: { id: '44444444-4444-4444-8444-444444444444' } },
        error: null,
      } as any);

      const { getOrCreateGuestUser } = await import('@/app/data/api');
      const result = await getOrCreateGuestUser('new@example.com', 'New User');

      expect(result.requiresLogin).toBe(false);
      expect(result.isNew).toBe(true);
      expect(result.userId).toBe('44444444-4444-4444-8444-444444444444');
      expect(supabase.auth.signInAnonymously).toHaveBeenCalled();
    });

    it('should throw error when anonymous auth fails', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { select: mockSelect } as any;
        }
        return {} as any;
      });

      vi.mocked(supabase.auth.signInAnonymously).mockResolvedValue({
        data: null,
        error: { message: 'Anonymous auth disabled' },
      } as any);

      const { getOrCreateGuestUser } = await import('@/app/data/api');

      await expect(getOrCreateGuestUser('new@example.com', 'New User')).rejects.toThrow(
        'Failed to create guest session'
      );
    });
  });
});
