import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalibrationResult } from '@/app/types';

const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (_table: string) => mockFrom(_table),
    auth: { getUser: vi.fn() },
  },
}));

describe('P826: calibration listener-only threshold', () => {
  let getCalibration: (userId: string) => Promise<CalibrationResult>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module so mock is fresh for each test
    vi.resetModules();
    const module = await import('@/app/data/calibration-service-real');
    getCalibration = module.realCalibrationService.getCalibration;
  });

  it('returns insufficient when user has >= 5 total sessions but 0 as listener (speaker-only)', async () => {
    // User has 5 sessions in profile counter (all as speaker), 0 as listener
    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ears_count: 3, verification_session_count: 5 },
            error: null,
          }),
        }),
      })
      // listenerAgg: 0 eligible rows — mock the .not().not() eligibility chain (P967)
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      })
      // speakerAgg: 5 rows
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [
            { speaker_rating: 7, listener_rating: 8 },
            { speaker_rating: 8, listener_rating: 9 },
            { speaker_rating: 6, listener_rating: 7 },
            { speaker_rating: 9, listener_rating: 8 },
            { speaker_rating: 7, listener_rating: 6 },
          ],
          error: null,
        }),
      });

    const result = await getCalibration('speaker-only-user');

    // Bug: before fix this is 'sufficient' because verification_session_count >= 5
    expect(result.status).toBe('insufficient');
    expect(result.sessionsCompleted).toBe(0);
  });

  it('returns sufficient with listener-only session count when user has >= 5 listener sessions', async () => {
    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ears_count: 3, verification_session_count: 8 },
            error: null,
          }),
        }),
      })
      // listenerAgg: 5 eligible rows — mock the .not().not() eligibility chain (P967)
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({
              data: [
                { speaker_rating: 7, listener_rating: 8 },
                { speaker_rating: 8, listener_rating: 7 },
                { speaker_rating: 6, listener_rating: 6 },
                { speaker_rating: 9, listener_rating: 9 },
                { speaker_rating: 7, listener_rating: 8 },
              ],
              error: null,
            }),
          }),
        }),
      })
      // speakerAgg: 3 rows
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [
            { speaker_rating: 7, listener_rating: 6 },
            { speaker_rating: 8, listener_rating: 7 },
            { speaker_rating: 9, listener_rating: 8 },
          ],
          error: null,
        }),
      });

    const result = await getCalibration('real-listener-user');

    expect(result.status).toBe('sufficient');
    // sessionsCompleted reflects listener count specifically, not total
    expect(result.sessionsCompleted).toBe(5);
  });
});
