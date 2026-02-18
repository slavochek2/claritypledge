import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalibrationService } from '@/app/data/calibration-service.interface';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockRpc = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: Record<string, unknown>) => mockRpc(fn, params),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

describe('realCalibrationService', () => {
  let realCalibrationService: CalibrationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/calibration-service-real');
    realCalibrationService = module.realCalibrationService;
  });

  // ===========================================================================
  // CALIBRATION STATS
  // ===========================================================================

  describe('getCalibration', () => {
    it('returns insufficient when sessions < 5', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ears_count: 2, verification_session_count: 3 },
            error: null,
          }),
        }),
      });

      const result = await realCalibrationService.getCalibration('user-1');

      expect(result.status).toBe('insufficient');
      expect(result.sessionsCompleted).toBe(3);
      expect(result.sessionsRequired).toBe(5);
      expect(result.calibration).toBeUndefined();
    });

    it('returns sufficient with calibration stats when sessions >= 5', async () => {
      mockSelect
        // Profile lookup
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ears_count: 4, verification_session_count: 7 },
              error: null,
            }),
          }),
        })
        // Listener calibration: avg speaker_rating = 7.5, avg listener_rating = 8.2
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({
            data: [{ speaker_rating: 7.5, listener_rating: 8.2 }],
            error: null,
          }),
        })
        // Speaker calibration (unused by assertions but called by service)
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({
            data: [{ speaker_rating: 6.8, listener_rating: 7.0 }],
            error: null,
          }),
        });

      const result = await realCalibrationService.getCalibration('user-1');

      expect(result.status).toBe('sufficient');
      expect(result.sessionsCompleted).toBe(7);
      expect(result.calibration).toBeDefined();
      expect(result.calibration?.earsCount).toBe(4);
      expect(result.calibration?.listenerCalibrationAvg).toBe(7.5);
      expect(result.calibration?.listenerSelfRatingAvg).toBe(8.2);
      expect(result.calibration?.calibrationGap).toBeCloseTo(0.7);
    });

    it('returns insufficient when profile not found', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      });

      const result = await realCalibrationService.getCalibration('non-existent');

      expect(result.status).toBe('insufficient');
      expect(result.sessionsCompleted).toBe(0);
    });

    it('falls back to raw query when RPC not available', async () => {
      mockSelect
        // First call: profile lookup
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ears_count: 5, verification_session_count: 6 },
              error: null,
            }),
          }),
        })
        // Fallback: listener aggregate query
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({
            data: [
              { speaker_rating: 8, listener_rating: 9 },
              { speaker_rating: 7, listener_rating: 8 },
            ],
            error: null,
          }),
        })
        // Fallback: speaker aggregate query
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({
            data: [
              { speaker_rating: 7, listener_rating: 6 },
            ],
            error: null,
          }),
        });

      // RPC fails (functions not created yet)
      mockRpc
        .mockReturnValueOnce({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }),
        })
        .mockReturnValueOnce({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }),
        });

      const result = await realCalibrationService.getCalibration('user-1');

      expect(result.status).toBe('sufficient');
      expect(result.calibration?.listenerCalibrationAvg).toBe(7.5); // (8+7)/2
      expect(result.calibration?.listenerSelfRatingAvg).toBe(8.5); // (9+8)/2
    });
  });

  describe('getEarsCount', () => {
    it('returns ears count from profile', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ears_count: 5 },
            error: null,
          }),
        }),
      });

      const result = await realCalibrationService.getEarsCount('user-1');

      expect(result).toBe(5);
    });

    it('returns 0 when profile not found', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      });

      const result = await realCalibrationService.getEarsCount('non-existent');

      expect(result).toBe(0);
    });

    it('returns 0 when ears_count is null', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ears_count: null },
            error: null,
          }),
        }),
      });

      const result = await realCalibrationService.getEarsCount('user-1');

      expect(result).toBe(0);
    });
  });

  describe('getSessionCount', () => {
    it('returns session count from profile', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { verification_session_count: 12 },
            error: null,
          }),
        }),
      });

      const result = await realCalibrationService.getSessionCount('user-1');

      expect(result).toBe(12);
    });

    it('returns 0 on error', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'DB error' },
          }),
        }),
      });

      const result = await realCalibrationService.getSessionCount('user-1');

      expect(result).toBe(0);
    });
  });

  // ===========================================================================
  // VERIFICATIONS
  // ===========================================================================

  describe('recordVerification', () => {
    it('records verification and returns mapped result', async () => {
      const mockDbVerification = {
        id: 'ver-1',
        story_id: 'story-1',
        version_id: 'version-1',
        session_id: 'session-1',
        speaker_id: 'user-1',
        listener_id: 'user-2',
        speaker_rating: 8,
        listener_rating: 7,
        accuracy_achieved: true,
        created_at: '2026-02-01T00:00:00Z',
      };

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockDbVerification, error: null }),
        }),
      });

      const result = await realCalibrationService.recordVerification({
        storyId: 'story-1',
        versionId: 'version-1',
        sessionId: 'session-1',
        speakerId: 'user-1',
        listenerId: 'user-2',
        speakerRating: 8,
        listenerRating: 7,
      });

      expect(result).not.toBeNull();
      expect(result?.speakerRating).toBe(8);
      expect(result?.listenerRating).toBe(7);
      expect(result?.accuracyAchieved).toBe(true);
      expect(result?.versionId).toBe('version-1');
    });

    it('returns null on insert error', async () => {
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      });

      const result = await realCalibrationService.recordVerification({
        storyId: 'story-1',
        versionId: 'version-1',
        speakerId: 'user-1',
        listenerId: 'user-2',
        speakerRating: 8,
        listenerRating: 7,
      });

      expect(result).toBeNull();
    });
  });

  describe('getStoryVerifications', () => {
    it('returns verifications with speaker/listener profiles', async () => {
      const mockVerifications = [
        {
          id: 'ver-1',
          story_id: 'story-1',
          version_id: 'version-1',
          session_id: null,
          speaker_id: 'user-1',
          listener_id: 'user-2',
          speaker_rating: 9,
          listener_rating: 8,
          accuracy_achieved: true,
          created_at: '2026-02-01T00:00:00Z',
          speaker: { name: 'Speaker One', slug: 'speaker-one' },
          listener: { name: 'Listener One', slug: 'listener-one' },
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockVerifications, error: null }),
        }),
      });

      const result = await realCalibrationService.getStoryVerifications('story-1');

      expect(result).toHaveLength(1);
      expect(result[0].speakerName).toBe('Speaker One');
      expect(result[0].listenerName).toBe('Listener One');
      expect(result[0].accuracyAchieved).toBe(true);
    });

    it('returns empty array on error', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      });

      const result = await realCalibrationService.getStoryVerifications('story-1');

      expect(result).toEqual([]);
    });
  });

  describe('getListenerVerificationHistory', () => {
    it('returns verification history as listener', async () => {
      const mockHistory = [
        {
          id: 'ver-1',
          story_id: 'story-1',
          version_id: 'version-1',
          session_id: null,
          speaker_id: 'user-2',
          listener_id: 'user-1',
          speaker_rating: 8,
          listener_rating: 9,
          accuracy_achieved: true,
          created_at: '2026-02-01T00:00:00Z',
          speaker: { name: 'Other User', slug: 'other-user' },
          listener: { name: 'Me', slug: 'me' },
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockHistory, error: null }),
        }),
      });

      const result = await realCalibrationService.getListenerVerificationHistory('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].listenerName).toBe('Me');
    });
  });

  describe('getSpeakerVerificationHistory', () => {
    it('returns verification history as speaker', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const result = await realCalibrationService.getSpeakerVerificationHistory('user-1');

      expect(result).toEqual([]);
    });
  });
});
