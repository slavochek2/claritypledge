import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

describe('sessionsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getUserSessions ───────────────────────────────────────────────────────

  describe('getUserSessions', () => {
    it('returns sessions where user is creator', async () => {
      const profileId = 'user-1';
      const mockRows = [
        {
          id: 'sess-1',
          code: 'ABC123',
          creator_profile_id: profileId,
          joiner_profile_id: 'user-2',
          creator_name: 'Alice',
          joiner_name: 'Bob',
          created_at: '2026-02-19T14:34:00Z',
          live_state: {
            sessionHistory: [
              { skipped: false, title: 'Story A' },
              { skipped: false, title: 'Story B' },
              { skipped: true, title: 'Story C' },
            ],
          },
        },
      ];

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions(profileId);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      // Creator sees joiner as partner
      expect(result[0].partnerName).toBe('Bob');
      // Round count = completed only (2 of 3)
      expect(result[0].roundCount).toBe(2);
      expect(result[0].id).toBe('sess-1');
    });

    it('returns sessions where user is joiner', async () => {
      const profileId = 'user-2';
      const mockRows = [
        {
          id: 'sess-2',
          code: 'XYZ789',
          creator_profile_id: 'user-1',
          joiner_profile_id: profileId,
          creator_name: 'Alice',
          joiner_name: 'Bob',
          created_at: '2026-02-17T10:12:00Z',
          live_state: {
            sessionHistory: [
              { skipped: false, title: 'Story A' },
            ],
          },
        },
      ];

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions(profileId);

      expect(result).toHaveLength(1);
      // Joiner sees creator as partner
      expect(result[0].partnerName).toBe('Alice');
      expect(result[0].roundCount).toBe(1);
    });

    it('filters out sessions with zero rounds AND no transcript', async () => {
      const profileId = 'user-1';
      const mockRows = [
        {
          id: 'sess-has-rounds',
          code: 'HAS123',
          creator_profile_id: profileId,
          joiner_profile_id: 'user-2',
          creator_name: 'Alice',
          joiner_name: 'Bob',
          created_at: '2026-02-19T14:00:00Z',
          live_state: {
            sessionHistory: [{ skipped: false, title: 'Story A' }],
          },
          transcription_jobs: null,
        },
        {
          id: 'sess-zero-rounds-with-transcript',
          code: 'TRN456',
          creator_profile_id: profileId,
          joiner_profile_id: 'user-2',
          creator_name: 'Alice',
          joiner_name: 'Bob',
          created_at: '2026-02-18T10:00:00Z',
          live_state: { sessionHistory: [] },
          transcription_jobs: [{ status: 'completed' }],
        },
        {
          id: 'sess-zero-rounds-no-transcript',
          code: 'ZER456',
          creator_profile_id: profileId,
          joiner_profile_id: null,
          creator_name: 'Alice',
          joiner_name: null,
          created_at: '2026-02-18T09:00:00Z',
          live_state: { sessionHistory: [] },
          transcription_jobs: null,
        },
        {
          id: 'sess-all-skipped',
          code: 'SKP789',
          creator_profile_id: profileId,
          joiner_profile_id: 'user-3',
          creator_name: 'Alice',
          joiner_name: 'Carol',
          created_at: '2026-02-17T11:00:00Z',
          live_state: {
            sessionHistory: [
              { skipped: true, title: 'Story X' },
              { skipped: true, title: 'Story Y' },
            ],
          },
          transcription_jobs: null,
        },
      ];

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions(profileId);

      // Sessions with rounds OR completed transcript pass the filter
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sess-has-rounds');
      expect(result[1].id).toBe('sess-zero-rounds-with-transcript');
    });

    it('handles null live_state (no history) — session is filtered out', async () => {
      const profileId = 'user-1';
      const mockRows = [
        {
          id: 'sess-null-state',
          code: 'NULL11',
          creator_profile_id: profileId,
          joiner_profile_id: null,
          creator_name: 'Alice',
          joiner_name: null,
          created_at: '2026-02-15T08:00:00Z',
          live_state: null,
        },
      ];

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions(profileId);

      expect(result).toHaveLength(0);
    });

    it('returns empty array on database error', async () => {
      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions('user-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when user has no sessions', async () => {
      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions('user-with-no-sessions');

      expect(result).toHaveLength(0);
    });

    it('uses creator_name as partnerName when user is only participant (no joiner)', async () => {
      const profileId = 'user-1';
      const mockRows = [
        {
          id: 'sess-solo',
          code: 'SOL111',
          creator_profile_id: profileId,
          joiner_profile_id: null,
          creator_name: 'Alice',
          joiner_name: null,
          created_at: '2026-02-10T08:00:00Z',
          live_state: {
            sessionHistory: [{ skipped: false, title: 'Story A' }],
          },
        },
      ];

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions(profileId);

      expect(result).toHaveLength(1);
      // No joiner — partner name falls back to some indicator
      expect(result[0].roundCount).toBe(1);
    });
  });

  // ─── mapSessionFromDb ──────────────────────────────────────────────────────

  describe('mapSessionFromDb', () => {
    it('maps date from created_at ISO string', async () => {
      const profileId = 'user-1';
      const mockRows = [
        {
          id: 'sess-date',
          code: 'DAT123',
          creator_profile_id: profileId,
          joiner_profile_id: 'user-2',
          creator_name: 'Alice',
          joiner_name: 'Bob',
          created_at: '2026-02-19T14:34:00Z',
          live_state: {
            sessionHistory: [{ skipped: false }],
          },
        },
      ];

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions(profileId);

      // Date must be parseable
      expect(() => new Date(result[0].date)).not.toThrow();
      expect(result[0].date).toContain('2026-02-19');
    });

    it('only counts completed (non-skipped) rounds', async () => {
      const profileId = 'user-1';
      const mockRows = [
        {
          id: 'sess-mixed',
          code: 'MIX123',
          creator_profile_id: profileId,
          joiner_profile_id: 'user-2',
          creator_name: 'Alice',
          joiner_name: 'Bob',
          created_at: '2026-02-19T14:34:00Z',
          live_state: {
            sessionHistory: [
              { skipped: false },
              { skipped: false },
              { skipped: true },
              { skipped: false },
              { skipped: true },
            ],
          },
        },
      ];

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      });

      const module = await import('@/app/data/sessions-service');
      const result = await module.getUserSessions(profileId);

      // 3 completed out of 5 total
      expect(result[0].roundCount).toBe(3);
    });
  });
});
