/**
 * @file p1149-job-no-diarization.test.ts
 * @description P1149 DW-7 — transcription jobs for the room are created with diarization
 * off. Non-Goals: "Do NOT enable diarization on these jobs — one device is one speaker."
 *
 * There is no diarization concept anywhere in this repo — not in create_transcription_job,
 * not in transcription_jobs' schema, not in the client call. "Off" holds by absence, not
 * by an extra flag someone has to remember to pass. This file proves that absence holds at
 * every layer endRoom touches, and proves endRoom actually reuses the existing,
 * diarization-free createTranscriptionJob path rather than inventing a new one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('P1149 DW-7: no diarization concept exists anywhere touched by room end-of-session', () => {
  it('api.ts has zero occurrences of "diarization"', () => {
    const api = R('src/app/data/api.ts');
    expect(api).not.toMatch(/diariz/i);
  });

  it('the create_transcription_job RPC migration has zero occurrences of "diarization"', () => {
    const rpc = R('supabase/migrations/20260313140327_p495_create_transcription_job_rpc.sql');
    expect(rpc).not.toMatch(/diariz/i);
  });

  it('endRoom calls the existing createTranscriptionJob — not a parallel job-creation path', () => {
    const service = R('src/app/data/transcribe-service.ts');
    const endRoomFn = service.slice(service.indexOf('export async function endRoom'));
    expect(endRoomFn).toMatch(/createTranscriptionJob\('', m\.sessionId\)/);
    expect(endRoomFn).not.toMatch(/\.from\('transcription_jobs'\)/);
  });
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/app/data/api', () => ({
  createClaritySession: vi.fn(),
  createTranscriptionJob: vi.fn().mockResolvedValue(undefined),
}));

describe('P1149 DW-7: endRoom creates exactly one job per member, with no extra args', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createTranscriptionJob once per room member, args = ("", sessionId) only', async () => {
    const { supabase } = await import('@/lib/supabase');
    const { createTranscriptionJob } = await import('@/app/data/api');
    const { endRoom } = await import('@/app/data/transcribe-service');

    const members = [
      { id: 'm1', room_id: 'r1', profile_id: 'p1', display_name: 'A', session_id: 's1', joined_at: 't' },
      { id: 'm2', room_id: 'r1', profile_id: 'p2', display_name: 'B', session_id: 's2', joined_at: 't' },
    ];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'transcribe_room_members') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: members, error: null }),
            }),
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === 'transcribe_rooms') {
        return {
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    await endRoom('r1');

    expect(createTranscriptionJob).toHaveBeenCalledTimes(2);
    expect(createTranscriptionJob).toHaveBeenCalledWith('', 's1');
    expect(createTranscriptionJob).toHaveBeenCalledWith('', 's2');
    // Every call has exactly 2 arguments — no third (diarization) argument ever sneaks in.
    for (const call of vi.mocked(createTranscriptionJob).mock.calls) {
      expect(call.length).toBe(2);
    }
  });
});
